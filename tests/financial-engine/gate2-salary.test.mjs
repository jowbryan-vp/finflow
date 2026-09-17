// Gate 2 — S01..S11: salário. S01-S06 test the pure getExpectedSalaryDate
// helper (recurrence rule: last_weekday_of_month, weekday=5/friday) across
// every last-day-of-month weekday shape, a year rollover, February and a
// leap year. S07-S11 test the behavioral guarantees: previsão never touches
// real cash, the real receipt date (not the prediction) governs cash impact
// and which month it belongs to, and navigating never duplicates the salary.
import { openHarness, makeRunner, baseSyntheticState } from './harness.mjs';

const { page, loadState, close } = await openHarness();
const { check, results } = makeRunner('gate2-salary');

async function expected(year, month, rule) {
  return page.evaluate(([year, month, rule]) => getExpectedSalaryDate(year, month, rule), [year, month, rule]);
}
const FRIDAY_RULE = { type: 'last_weekday_of_month', weekday: 5 };

// S01: mês cujo último dia é sexta-feira (31/07/2026 é sexta) — a data
// esperada é o próprio último dia.
await check('S01', async () => (await expected(2026, 7, FRIDAY_RULE)) === '2026-07-31',
  'último dia do mês é sexta-feira (31/07/2026) → esperado 2026-07-31');

// S02: mês cujo último dia é sábado (30/01/2026 é sábado) → última sexta é
// o dia anterior.
await check('S02', async () => (await expected(2026, 1, FRIDAY_RULE)) === '2026-01-30',
  'último dia do mês é sábado (31/01/2026) → esperado 2026-01-30 (sexta anterior)');

// S03: mês cujo último dia é domingo (31/01/2027 é domingo) → última sexta
// é dois dias antes.
await check('S03', async () => (await expected(2027, 1, FRIDAY_RULE)) === '2027-01-29',
  'último dia do mês é domingo (31/01/2027) → esperado 2027-01-29 (sexta anterior)');

// S04: virada de ano — dezembro/2026 e janeiro/2027 calculados
// independentemente e corretamente, sem contaminação entre os dois.
await check('S04', async () => {
  const dez = await expected(2026, 12, FRIDAY_RULE);
  const jan = await expected(2027, 1, FRIDAY_RULE);
  return { ok: dez === '2026-12-25' && jan === '2027-01-29', detail: `dez/2026=${dez}, jan/2027=${jan}` };
}, 'virada de ano: última sexta de dez/2026 = 25/12/2026, última sexta de jan/2027 = 29/01/2027');

// S05: fevereiro comum (2026, 28 dias).
await check('S05', async () => (await expected(2026, 2, FRIDAY_RULE)) === '2026-02-27',
  'fevereiro comum (2026, 28 dias) → esperado 2026-02-27');

// S06: fevereiro em ano bissexto (2024, 29 dias).
await check('S06', async () => (await expected(2024, 2, FRIDAY_RULE)) === '2024-02-23',
  'fevereiro em ano bissexto (2024, 29 dias) → esperado 2024-02-23');

// ---------------------------------------------------------------------------
// S07-S11 — comportamento real do salário recorrente novo modelo
// ---------------------------------------------------------------------------

// S07: salário previsto (nenhuma ocorrência marcada como recebida) NÃO
// aumenta o caixa real.
await check('S07', async () => {
  await loadState(baseSyntheticState());
  const saldo = await page.evaluate(() => {
    state.receitas.push({ id: 'sal1', tipo: 'salario', nome: 'Salário', valor: 5000, mes: 8, ano: 2026,
      competenciaMes: 8, competenciaAno: 2026, conta: 'c1', certeza: 'recorrente',
      recorrencia: { type: 'last_weekday_of_month', weekday: 5 }, recebidoPorMes: {}, createdAt: 'sal1' });
    return calcSaldoConta('c1');
  });
  return { ok: saldo === 1000, detail: `saldo com salário só previsto (nenhum recebidoPorMes) = ${saldo} (esperado 1000, saldoInicial inalterado)` };
}, 'salário recorrente previsto (nenhuma competência marcada como recebida) não aumenta o caixa real');

// S08: marcar uma competência como recebida aumenta o caixa, na data real
// informada (não na data prevista).
await check('S08', async () => {
  const r = await page.evaluate(() => {
    const antes = calcSaldoConta('c1');
    const sal = state.receitas.find((x) => x.id === 'sal1');
    sal.recebidoPorMes[mesKey(8, 2026)] = { estado: 'recebido', dataRecebimento: '2026-08-28' };
    const depois = calcSaldoConta('c1');
    return { antes, depois };
  });
  return { ok: r.antes === 1000 && r.depois === 6000, detail: `antes=${r.antes}, depois de marcar ago/2026 recebido em 28/08=${r.depois} (esperado 1000,6000)` };
}, 'salário recebido aumenta o caixa real na data efetiva do recebimento');

// S09: salário recebido em 28/08 pertence ao caixa de AGOSTO (aparece em
// getReceitasForMonth(8,2026) como recebido, e getDespesasForMonth de
// setembro nunca vê essa receita).
await check('S09', async () => {
  const r = await page.evaluate(() => {
    const emAgosto = getReceitasForMonth(8, 2026).find((x) => x.id === 'sal1');
    const recebidaEmAgosto = emAgosto ? receitaRecebida(emAgosto, 8, 2026) : false;
    const emSetembro = getReceitasForMonth(9, 2026).find((x) => x.id === 'sal1');
    const recebidaEmSetembro = emSetembro ? receitaRecebida(emSetembro, 9, 2026) : false;
    return { recebidaEmAgosto, apareceEmSetembro: !!emSetembro, recebidaEmSetembro };
  });
  const ok = r.recebidaEmAgosto === true && r.recebidaEmSetembro === false;
  return { ok, detail: `recebida em agosto=${r.recebidaEmAgosto}; aparece em setembro=${r.apareceEmSetembro} (esperado true, pois é recorrente — mas) recebida em setembro=${r.recebidaEmSetembro} (esperado false: setembro é uma OUTRA competência, ainda não recebida)` };
}, 'salário recebido em 28/08 pertence ao caixa de agosto — a competência de setembro é um evento distinto, ainda não recebido');

// S10: navegar (renderAll em vários meses) não cria uma segunda receita nem
// duplica o salário de agosto.
await check('S10', async () => {
  const r = await page.evaluate(() => {
    const countAntes = state.receitas.filter((x) => x.id === 'sal1' || (x.tipo === 'salario' && x.certeza === 'recorrente')).length;
    for (let i = 0; i < 6; i++) { currentMonth = 1 + ((8 + i) % 12); currentYear = 2026 + Math.floor((8 + i) / 12); renderAll(); }
    const countDepois = state.receitas.filter((x) => x.id === 'sal1' || (x.tipo === 'salario' && x.certeza === 'recorrente')).length;
    const salAinda = state.receitas.find((x) => x.id === 'sal1');
    return { countAntes, countDepois, recebidoPorMesAgosto: salAinda.recebidoPorMes[mesKey(8, 2026)] };
  });
  const ok = r.countAntes === 1 && r.countDepois === 1 && r.recebidoPorMesAgosto && r.recebidoPorMesAgosto.estado === 'recebido';
  return { ok, detail: `registros de salário antes=${r.countAntes}, depois de navegar 6 meses=${r.countDepois} (esperado 1 e 1); agosto ainda recebido=${JSON.stringify(r.recebidoPorMesAgosto)}` };
}, 'navegar para os meses seguintes não cria uma segunda receita de salário nem duplica/perde o recebimento de agosto');

// S11: quando a data real de recebimento difere da data prevista
// (getExpectedSalaryDate), é a data REAL que governa o caixa.
await check('S11', async () => {
  await loadState(baseSyntheticState());
  const r = await page.evaluate(() => {
    state.receitas.push({ id: 'sal2', tipo: 'salario', nome: 'Salário', valor: 4000, mes: 9, ano: 2026,
      competenciaMes: 9, competenciaAno: 2026, conta: 'c1', certeza: 'recorrente',
      recorrencia: { type: 'last_weekday_of_month', weekday: 5 },
      recebidoPorMes: { [mesKey(9, 2026)]: { estado: 'recebido', dataRecebimento: '2026-09-24' } }, createdAt: 'sal2' });
    const ocorrencia = getReceitasForMonth(9, 2026).find((x) => x.id === 'sal2');
    return { dataPrevistaOcorrencia: ocorrencia._dataPrevistaOcorrencia, dataRecebimentoOcorrencia: ocorrencia._dataRecebimentoOcorrencia, saldo: calcSaldoConta('c1') };
  });
  const ok = r.dataPrevistaOcorrencia === '2026-09-25' && r.dataRecebimentoOcorrencia === '2026-09-24' && r.saldo === 5000;
  return { ok, detail: `prevista=${r.dataPrevistaOcorrencia} (esperado 2026-09-25), real=${r.dataRecebimentoOcorrencia} (esperado 2026-09-24), saldo=${r.saldo} (esperado 5000 — conta pelo recebimento real, não pela previsão)` };
}, 'data real de recebimento diferente da prevista: é a data real que governa o impacto de caixa');

await close();

const fails = results.filter((r) => r.status === 'FAIL').length;
console.log(`\ngate2-salary.test.mjs: TOTAL=${results.length} PASS=${results.length - fails} FAIL=${fails}`);
if (fails > 0) process.exitCode = 1;

export { results };
