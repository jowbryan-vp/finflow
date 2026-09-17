// Gate 2.1 — patch temporal de salário recorrente (SALARY_CASH_01..06 +
// SALARY_CASH_INV_01).
//
// Motivo: a auditoria externa do Gate 2 encontrou que calcSaldoContaAte()
// usava a chave de COMPETÊNCIA de uma ocorrência de recebidoPorMes (mk)
// como se fosse o mês do IMPACTO DE CAIXA, em vez da dataRecebimento real
// dentro daquela ocorrência. Isso é exatamente o caso que nenhum teste do
// Gate 2 (S01-S11) exercitava: S07/S08/S11 chamam calcSaldoConta (que não
// tem corte temporal e por isso nunca expôs o bug) e nenhum teste do Gate 2
// chamava calcSaldoContaAte com uma receita do novo modelo — ver seção 21
// do relatório do Gate 2.1 para a explicação completa.
import { openHarness, makeRunner, baseSyntheticState } from './harness.mjs';

const { page, loadState, close } = await openHarness();
const { check, results } = makeRunner('gate2-1-salary-cash');

function salReceita(overrides) {
  return {
    id: 'sal', tipo: 'salario', nome: 'Salário', valor: 5000, mes: overrides.competenciaMes, ano: overrides.competenciaAno,
    competenciaMes: overrides.competenciaMes, competenciaAno: overrides.competenciaAno, conta: 'c1',
    certeza: 'recorrente', recorrencia: { type: 'last_weekday_of_month', weekday: 5 },
    recebidoPorMes: overrides.recebidoPorMes || {}, createdAt: 'sal',
  };
}

// SALARY_CASH_01 — recebimento atrasado (seção 8 do Gate 2.1): competência
// setembro, previsto 25/09, recebido de fato só em 02/10.
await check('SALARY_CASH_01', async () => {
  await loadState(baseSyntheticState());
  const r = await page.evaluate(() => {
    state.receitas.push({
      id: 'sal', tipo: 'salario', nome: 'Salário', valor: 5000, mes: 9, ano: 2026,
      competenciaMes: 9, competenciaAno: 2026, conta: 'c1', certeza: 'recorrente',
      recorrencia: { type: 'last_weekday_of_month', weekday: 5 },
      recebidoPorMes: { '2026-09': { estado: 'recebido', dataRecebimento: '2026-10-02' } }, createdAt: 'sal',
    });
    return {
      ate_agosto: calcSaldoContaAte('c1', 8, 2026),
      ate_setembro: calcSaldoContaAte('c1', 9, 2026),
      ate_outubro: calcSaldoContaAte('c1', 10, 2026),
      ate_novembro: calcSaldoContaAte('c1', 11, 2026),
    };
  });
  const ok = r.ate_agosto === 1000 && r.ate_setembro === 1000 && r.ate_outubro === 6000 && r.ate_novembro === 6000;
  return { ok, detail: `saldoInicial=1000; até ago=${r.ate_agosto} (esp. 1000, salário ainda não entrou), até set=${r.ate_setembro} (esp. 1000 — competência de setembro, mas caixa só em outubro), até out=${r.ate_outubro} (esp. 6000), até nov=${r.ate_novembro} (esp. 6000)` };
}, 'competência setembro/recebimento real em outubro: o saldo até setembro NÃO inclui o salário; o saldo até outubro inclui exatamente uma vez');

// SALARY_CASH_02 — recebimento antecipado em relação à competência (seção
// 9): competência outubro, previsto 30/10, recebido de fato em 30/09.
await check('SALARY_CASH_02', async () => {
  await loadState(baseSyntheticState());
  const r = await page.evaluate(() => {
    state.receitas.push({
      id: 'sal', tipo: 'salario', nome: 'Salário', valor: 5000, mes: 10, ano: 2026,
      competenciaMes: 10, competenciaAno: 2026, conta: 'c1', certeza: 'recorrente',
      recorrencia: { type: 'last_weekday_of_month', weekday: 5 },
      recebidoPorMes: { '2026-10': { estado: 'recebido', dataRecebimento: '2026-09-30' } }, createdAt: 'sal',
    });
    return {
      ate_agosto: calcSaldoContaAte('c1', 8, 2026),
      ate_setembro: calcSaldoContaAte('c1', 9, 2026),
      ate_outubro: calcSaldoContaAte('c1', 10, 2026),
      qtdReceitas: state.receitas.length,
    };
  });
  const ok = r.ate_agosto === 1000 && r.ate_setembro === 6000 && r.ate_outubro === 6000 && r.qtdReceitas === 1;
  return { ok, detail: `até ago=${r.ate_agosto} (esp. 1000), até set=${r.ate_setembro} (esp. 6000 — caixa entrou em 30/09, antes da própria competência), até out=${r.ate_outubro} (esp. 6000, sem duplicar); nº de receitas=${r.qtdReceitas} (esp. 1, nenhuma entrada nova criada em outubro)` };
}, 'competência outubro/recebimento real em setembro: o caixa reflete setembro (a data real), sem criar uma segunda ocorrência em outubro');

// SALARY_CASH_03 — recebimento no mesmo mês da competência: caso normal,
// deve continuar funcionando (não regredir com a correção).
await check('SALARY_CASH_03', async () => {
  await loadState(baseSyntheticState());
  const r = await page.evaluate(() => {
    state.receitas.push({
      id: 'sal', tipo: 'salario', nome: 'Salário', valor: 5000, mes: 9, ano: 2026,
      competenciaMes: 9, competenciaAno: 2026, conta: 'c1', certeza: 'recorrente',
      recorrencia: { type: 'last_weekday_of_month', weekday: 5 },
      recebidoPorMes: { '2026-09': { estado: 'recebido', dataRecebimento: '2026-09-25' } }, createdAt: 'sal',
    });
    return { ate_agosto: calcSaldoContaAte('c1', 8, 2026), ate_setembro: calcSaldoContaAte('c1', 9, 2026) };
  });
  const ok = r.ate_agosto === 1000 && r.ate_setembro === 6000;
  return { ok, detail: `até ago=${r.ate_agosto} (esp. 1000), até set=${r.ate_setembro} (esp. 6000 — recebido dentro da própria competência)` };
}, 'competência e recebimento no mesmo mês: comportamento normal continua correto após a correção');

// SALARY_CASH_04 — data prevista não é caixa, mesmo depois de passar a data.
await check('SALARY_CASH_04', async () => {
  await loadState(baseSyntheticState());
  const r = await page.evaluate(() => {
    state.receitas.push({
      id: 'sal', tipo: 'salario', nome: 'Salário', valor: 5000, mes: 9, ano: 2026,
      competenciaMes: 9, competenciaAno: 2026, conta: 'c1', certeza: 'recorrente',
      recorrencia: { type: 'last_weekday_of_month', weekday: 5 },
      recebidoPorMes: {}, createdAt: 'sal', // nenhuma ocorrência marcada como recebida — só previsão implícita via getExpectedSalaryDate
    });
    return {
      saldoTotal: calcSaldoConta('c1'),
      ate_setembro: calcSaldoContaAte('c1', 9, 2026),
      ate_dezembro: calcSaldoContaAte('c1', 12, 2026),
    };
  });
  const ok = r.saldoTotal === 1000 && r.ate_setembro === 1000 && r.ate_dezembro === 1000;
  return { ok, detail: `saldo total=${r.saldoTotal}, até set=${r.ate_setembro}, até dez=${r.ate_dezembro} (todos esp. 1000 — sem nenhuma ocorrência marcada 'recebido', a previsão nunca entra em caixa real, mesmo bem depois de 25/09)` };
}, 'salário previsto (nenhuma ocorrência recebida) nunca entra no caixa real, mesmo depois da data prevista já ter passado');

// SALARY_CASH_INV_01 — dataRecebimento ausente/inválida não pode ser
// inventada (nem pela previsão, nem pela competência, nem por hoje).
await check('SALARY_CASH_INV_01', async () => {
  await loadState(baseSyntheticState());
  const r = await page.evaluate(() => {
    // Estado inconsistente construído deliberadamente: 'recebido' mas sem
    // dataRecebimento válida — nunca produzido pelo fluxo normal da UI
    // (toggleReceitaRecebida sempre grava a data real), mas pode existir em
    // dados corrompidos/importados de fora.
    state.receitas.push({
      id: 'sal', tipo: 'salario', nome: 'Salário', valor: 5000, mes: 9, ano: 2026,
      competenciaMes: 9, competenciaAno: 2026, conta: 'c1', certeza: 'recorrente',
      recorrencia: { type: 'last_weekday_of_month', weekday: 5 },
      recebidoPorMes: { '2026-09': { estado: 'recebido', dataRecebimento: null } }, createdAt: 'sal',
    });
    return {
      cashDate: getRecurringRevenueCashDate(state.receitas.find((x) => x.id === 'sal'), '2026-09'),
      saldoTotal: calcSaldoConta('c1'),
      ate_setembro: calcSaldoContaAte('c1', 9, 2026),
      ate_dezembro: calcSaldoContaAte('c1', 12, 2026),
    };
  });
  const ok = r.cashDate === null && r.saldoTotal === 1000 && r.ate_setembro === 1000 && r.ate_dezembro === 1000;
  return { ok, detail: `getRecurringRevenueCashDate=${r.cashDate} (esp. null — nenhuma data inventada), saldo total=${r.saldoTotal}, até set=${r.ate_setembro}, até dez=${r.ate_dezembro} (todos esp. 1000 — sem dataRecebimento válida não há impacto de caixa determinável)` };
}, 'estado "recebido" sem dataRecebimento válida: o motor não inventa nenhuma data (nem previsão, nem competência, nem hoje) e a ocorrência não entra em caixa em nenhum corte');

// SALARY_CASH_05 — não-duplicação explícita: recebimento atrasado de uma
// única ocorrência não pode contar 2x em nenhum corte temporal.
await check('SALARY_CASH_05', async () => {
  await loadState(baseSyntheticState());
  const r = await page.evaluate(() => {
    state.receitas.push({
      id: 'sal', tipo: 'salario', nome: 'Salário', valor: 5000, mes: 9, ano: 2026,
      competenciaMes: 9, competenciaAno: 2026, conta: 'c1', certeza: 'recorrente',
      recorrencia: { type: 'last_weekday_of_month', weekday: 5 },
      recebidoPorMes: { '2026-09': { estado: 'recebido', dataRecebimento: '2026-10-02' } }, createdAt: 'sal',
    });
    return {
      ago: calcSaldoContaAte('c1', 8, 2026), set: calcSaldoContaAte('c1', 9, 2026),
      out: calcSaldoContaAte('c1', 10, 2026), nov: calcSaldoContaAte('c1', 11, 2026), dez: calcSaldoContaAte('c1', 12, 2026),
    };
  });
  const ok = r.ago === 1000 && r.set === 1000 && r.out === 6000 && r.nov === 6000 && r.dez === 6000;
  return { ok, detail: `ago=${r.ago}, set=${r.set}, out=${r.out}, nov=${r.nov}, dez=${r.dez} (esp. 1000,1000,6000,6000,6000 — nunca 10000/11000 em nenhum corte, nunca duplicado)` };
}, 'nenhuma duplicação em nenhum mês de corte, incluindo meses bem depois do recebimento real');

// SALARY_CASH_06 — múltiplas ocorrências com competência e caixa divergindo
// de formas diferentes cada uma, sem perder nem duplicar nenhuma.
await check('SALARY_CASH_06', async () => {
  await loadState(baseSyntheticState());
  const r = await page.evaluate(() => {
    state.receitas.push({
      id: 'sal', tipo: 'salario', nome: 'Salário', valor: 5000, mes: 8, ano: 2026,
      competenciaMes: 8, competenciaAno: 2026, conta: 'c1', certeza: 'recorrente',
      recorrencia: { type: 'last_weekday_of_month', weekday: 5 },
      recebidoPorMes: {
        '2026-08': { estado: 'recebido', dataRecebimento: '2026-08-28' }, // no mesmo mês
        '2026-09': { estado: 'recebido', dataRecebimento: '2026-10-02' }, // atrasado
        '2026-10': { estado: 'recebido', dataRecebimento: '2026-10-30' }, // no mesmo mês
      },
      createdAt: 'sal',
    });
    return {
      ago: calcSaldoContaAte('c1', 8, 2026), set: calcSaldoContaAte('c1', 9, 2026), out: calcSaldoContaAte('c1', 10, 2026),
    };
  });
  const ok = r.ago === 6000 && r.set === 6000 && r.out === 16000;
  return { ok, detail: `até ago=${r.ago} (esp. 6000: saldoInicial 1000 + ago recebido em 28/08), até set=${r.set} (esp. 6000: setembro só entra em outubro), até out=${r.out} (esp. 16000: 1000+5000+5000+5000 — os 3 salários, cada um contado exatamente uma vez pela sua dataRecebimento real)` };
}, 'três competências com combinações diferentes de competência×caixa: cada uma contada exatamente uma vez, na data real de recebimento');

await close();

const fails = results.filter((r) => r.status === 'FAIL').length;
console.log(`\ngate2-1-salary-cash.test.mjs: TOTAL=${results.length} PASS=${results.length - fails} FAIL=${fails}`);
if (fails > 0) process.exitCode = 1;

export { results };
