// Gate 2.2 — consolidação temporal de receitas pessoais: competência ≠ caixa.
//
// Motivo: getReceitasEfetivasForMonth(mes,ano) = getReceitasForMonth(mes,ano)
// .filter(r=>receitaRecebida(r,mes,ano)). Para salário recorrente,
// getReceitasForMonth materializa a ocorrência de COMPETÊNCIA daquele mês, e
// receitaRecebida só responde se aquela ocorrência de competência foi
// marcada como recebida — nenhuma das duas pergunta "o dinheiro entrou neste
// mês?". Uma competência de setembro paga em outubro aparecia como "entrada
// real" de SETEMBRO (errado) e nunca aparecia em outubro. getCashRevenuesForMonth
// (e getReceitasEfetivasForMonth, redefinida como wrapper) corrigem isso
// varrendo a data REAL de recebimento de cada ocorrência via
// getRecurringRevenueCashDate (motor já existente do Gate 2.1, nunca
// duplicado). Este arquivo testa REV-TIME-01..10, CASH_MONTH_01..05,
// MONTHLY_CASH_TOTALS e a consistência temporal com calcSaldoConta/Ate.
import { openHarness, makeRunner, baseSyntheticState } from './harness.mjs';

const { page, loadState, close } = await openHarness();
const { check, results } = makeRunner('gate2-2-cash-view');

function salReceita(id, competenciaMes, competenciaAno, recebidoPorMes, valor) {
  return {
    id, tipo: 'salario', nome: 'Salário', valor: valor || 5000, mes: competenciaMes, ano: competenciaAno,
    competenciaMes, competenciaAno, conta: 'c1',
    certeza: 'recorrente', recorrencia: { type: 'last_weekday_of_month', weekday: 5 },
    recebidoPorMes: recebidoPorMes || {}, createdAt: id,
  };
}

// ---------------------------------------------------------------------------
// CASH_MONTH — cenários cross-month obrigatórios (seção 24)
// ---------------------------------------------------------------------------

await check('CASH_MONTH_01', async () => {
  await loadState(baseSyntheticState());
  const r = await page.evaluate(() => {
    state.receitas.push({
      id: 'sal', tipo: 'salario', nome: 'Salário', valor: 5000, mes: 9, ano: 2026,
      competenciaMes: 9, competenciaAno: 2026, conta: 'c1', certeza: 'recorrente',
      recorrencia: { type: 'last_weekday_of_month', weekday: 5 },
      recebidoPorMes: { '2026-09': { estado: 'recebido', dataRecebimento: '2026-10-02' } }, createdAt: 'sal',
    });
    const competenciaSetembroContemOcorrencia = getReceitasForMonth(9, 2026).some((x) => x.id === 'sal');
    const cashSetembro = getCashRevenuesForMonth(9, 2026).reduce((s, x) => s + valorReceita(x), 0);
    const cashOutubro = getCashRevenuesForMonth(10, 2026).reduce((s, x) => s + valorReceita(x), 0);
    return { competenciaSetembroContemOcorrencia, cashSetembro, cashOutubro };
  });
  const ok = r.competenciaSetembroContemOcorrencia === true && r.cashSetembro === 0 && r.cashOutubro === 5000;
  return { ok, detail: JSON.stringify(r) };
}, 'atraso: competência setembro, recebido 02/10 — competência setembro contém a ocorrência, cash setembro=0, cash outubro=5000');

await check('CASH_MONTH_02', async () => {
  await loadState(baseSyntheticState());
  const r = await page.evaluate(() => {
    state.receitas.push(salReceita_inline());
    function salReceita_inline() {
      return {
        id: 'sal', tipo: 'salario', nome: 'Salário', valor: 5000, mes: 9, ano: 2026,
        competenciaMes: 9, competenciaAno: 2026, conta: 'c1', certeza: 'recorrente',
        recorrencia: { type: 'last_weekday_of_month', weekday: 5 },
        recebidoPorMes: { '2026-09': { estado: 'recebido', dataRecebimento: '2026-08-28' } }, createdAt: 'sal',
      };
    }
    const competenciaSetembroContemOcorrencia = getReceitasForMonth(9, 2026).some((x) => x.id === 'sal');
    const cashAgosto = getCashRevenuesForMonth(8, 2026).reduce((s, x) => s + valorReceita(x), 0);
    const cashSetembro = getCashRevenuesForMonth(9, 2026).reduce((s, x) => s + valorReceita(x), 0);
    return { competenciaSetembroContemOcorrencia, cashAgosto, cashSetembro };
  });
  const ok = r.competenciaSetembroContemOcorrencia === true && r.cashAgosto === 5000 && r.cashSetembro === 0;
  return { ok, detail: JSON.stringify(r) };
}, 'antecipação: competência setembro, recebido 28/08 — competência setembro contém a ocorrência, cash agosto=5000, cash setembro=0');

await check('CASH_MONTH_03', async () => {
  await loadState(baseSyntheticState());
  const r = await page.evaluate(() => {
    state.receitas.push({
      id: 'sal', tipo: 'salario', nome: 'Salário', valor: 5000, mes: 9, ano: 2026,
      competenciaMes: 9, competenciaAno: 2026, conta: 'c1', certeza: 'recorrente',
      recorrencia: { type: 'last_weekday_of_month', weekday: 5 },
      recebidoPorMes: { '2026-09': { estado: 'recebido', dataRecebimento: '2026-09-25' } }, createdAt: 'sal',
    });
    const competenciaContem = getReceitasForMonth(9, 2026).some((x) => x.id === 'sal');
    const cashSetembro = getCashRevenuesForMonth(9, 2026).some((x) => x.id === 'sal');
    return { competenciaContem, cashSetembro };
  });
  const ok = r.competenciaContem === true && r.cashSetembro === true;
  return { ok, detail: JSON.stringify(r) };
}, 'mesmo mês: competência setembro, recebido 25/09 — aparece nas duas visões, no mesmo mês');

await check('CASH_MONTH_04', async () => {
  await loadState(baseSyntheticState());
  const r = await page.evaluate(() => {
    state.receitas.push({
      id: 'sal', tipo: 'salario', nome: 'Salário', valor: 5000, mes: 9, ano: 2026,
      competenciaMes: 9, competenciaAno: 2026, conta: 'c1', certeza: 'recorrente',
      recorrencia: { type: 'last_weekday_of_month', weekday: 5 },
      recebidoPorMes: {}, createdAt: 'sal', // previsto — nenhuma ocorrência marcada como recebida
    });
    const cashSetembro = getCashRevenuesForMonth(9, 2026).reduce((s, x) => s + valorReceita(x), 0);
    return { cashSetembro };
  });
  const ok = r.cashSetembro === 0;
  return { ok, detail: `cash setembro=${r.cashSetembro} (esp. 0) — receita ainda prevista nunca entra em caixa real` };
}, 'previsto: competência setembro, estado previsto — cash setembro=0');

await check('CASH_MONTH_05', async () => {
  await loadState(baseSyntheticState());
  const r = await page.evaluate(() => {
    state.receitas.push({
      id: 'sal', tipo: 'salario', nome: 'Salário', valor: 5000, mes: 9, ano: 2026,
      competenciaMes: 9, competenciaAno: 2026, conta: 'c1', certeza: 'recorrente',
      recorrencia: { type: 'last_weekday_of_month', weekday: 5 },
      // Estado legado/inválido — testado direto no state, nunca produzido
      // pela UI real (que sempre grava dataRecebimento junto com o estado).
      recebidoPorMes: { '2026-09': { estado: 'recebido', dataRecebimento: null } }, createdAt: 'sal',
    });
    const cashSetembro = getCashRevenuesForMonth(9, 2026).reduce((s, x) => s + valorReceita(x), 0);
    return { cashSetembro };
  });
  const ok = r.cashSetembro === 0;
  return { ok, detail: `cash setembro=${r.cashSetembro} (esp. 0) — recebido sem data válida nunca entra em caixa real, nunca inventa uma data` };
}, 'recebido sem data (novo modelo): estado recebido, dataRecebimento null — cash=0');

// ---------------------------------------------------------------------------
// REV-TIME — invariantes temporais obrigatórios (seção 23)
// ---------------------------------------------------------------------------

await loadState(baseSyntheticState());
await page.evaluate(() => {
  state.receitas.push({
    id: 'salRT', tipo: 'salario', nome: 'Salário', valor: 5000, mes: 9, ano: 2026,
    competenciaMes: 9, competenciaAno: 2026, conta: 'c1', certeza: 'recorrente',
    recorrencia: { type: 'last_weekday_of_month', weekday: 5 },
    recebidoPorMes: { '2026-09': { estado: 'recebido', dataRecebimento: '2026-10-02' } }, createdAt: 'salRT',
  });
});

await check('REV_TIME_01', async () => {
  const r = await page.evaluate(() => {
    const emSetembro = getReceitasForMonth(9, 2026).find((x) => x.id === 'salRT');
    return { competenciaMes: emSetembro._competenciaMes || emSetembro.competenciaMes, cashDate: emSetembro._dataRecebimentoOcorrencia };
  });
  const ok = r.competenciaMes === 9 && r.cashDate === '2026-10-02';
  return { ok, detail: JSON.stringify(r) };
}, 'REV-TIME-01: competência ≠ data de caixa — a mesma ocorrência carrega os dois valores, distintos');

await check('REV_TIME_02', async () => {
  const r = await page.evaluate(() => ({
    outubro: getCashRevenuesForMonth(10, 2026).some((x) => x.id === 'salRT'),
    novembro: getCashRevenuesForMonth(11, 2026).some((x) => x.id === 'salRT'),
  }));
  const ok = r.outubro === true && r.novembro === false;
  return { ok, detail: JSON.stringify(r) };
}, 'REV-TIME-02: receita recebida só impacta caixa na dataRecebimento (outubro), nunca em outro mês (novembro)');

await check('REV_TIME_03', async () => {
  const r = await page.evaluate(() => {
    state.receitas.push({
      id: 'salPrevistoRT', tipo: 'salario', nome: 'Salário', valor: 5000, mes: 11, ano: 2026,
      competenciaMes: 11, competenciaAno: 2026, conta: 'c1', certeza: 'recorrente',
      recorrencia: { type: 'last_weekday_of_month', weekday: 5 }, recebidoPorMes: {}, createdAt: 'salPrevistoRT',
    });
    return getCashRevenuesForMonth(11, 2026).some((x) => x.id === 'salPrevistoRT');
  });
  const ok = r === false;
  return { ok, detail: `previsto entrou em cash view=${r} (esp. false)` };
}, 'REV-TIME-03: receita prevista nunca impacta caixa real');

await check('REV_TIME_04', async () => {
  const r = await page.evaluate(() => {
    state.receitas.push({
      id: 'evUnicoRT', tipo: 'projeto', nome: 'Projeto', valor: 1000, certeza: 'contratado',
      estado: 'previsto', dataPrevista: '2026-09-15', dataRecebimento: null, conta: 'c1', createdAt: 'evUnicoRT',
    });
    return getCashRevenuesForMonth(9, 2026).some((x) => x.id === 'evUnicoRT');
  });
  const ok = r === false;
  return { ok, detail: `evento único previsto (dataPrevista=09/2026, sem dataRecebimento) entrou em cash=${r} (esp. false)` };
}, 'REV-TIME-04: dataPrevista nunca substitui dataRecebimento em caixa realizado');

await check('REV_TIME_05', async () => {
  const r = await page.evaluate(() => {
    const setembro = getReceitasForMonth(9, 2026).find((x) => x.id === 'salRT');
    return !!setembro; // a ocorrência de competência setembro continua existindo/identificável
  });
  const ok = r === true;
  return { ok, detail: `ocorrência de competência setembro ainda encontrável=${r} (esp. true)` };
}, 'REV-TIME-05: ocorrência recorrente mantém identidade pela competência');

await check('REV_TIME_06', async () => {
  const r = await page.evaluate(() => getCashRevenuesForMonth(10, 2026).some((x) => x.id === 'salRT'));
  return { ok: r === true, detail: `ocorrência de competência setembro aparece no cash de outubro=${r} (esp. true)` };
}, 'REV-TIME-06: ocorrência recorrente pode impactar caixa em outro mês (competência setembro → cash outubro)');

await check('REV_TIME_07', async () => {
  const r = await page.evaluate(() => {
    let contagem = 0;
    for (let m = 1; m <= 12; m++) { if (getCashRevenuesForMonth(m, 2026).some((x) => x.id === 'salRT')) contagem++; }
    return contagem;
  });
  return { ok: r === 1, detail: `número de meses de 2026 em que a ocorrência aparece na visão de caixa=${r} (esp. 1)` };
}, 'REV-TIME-07: uma ocorrência impacta caixa no máximo uma vez (procurando em todos os 12 meses)');

await check('REV_TIME_08', async () => {
  const r = await page.evaluate(() => {
    const consultaPorCaixa = getCashRevenuesForMonth(10, 2026).find((x) => x.id === 'salRT');
    return consultaPorCaixa ? consultaPorCaixa._competenciaKey : null;
  });
  return { ok: r === '2026-09', detail: `consulta de caixa de outubro encontrou a ocorrência com _competenciaKey=${r} (esp. 2026-09, competência diferente do mês consultado)` };
}, 'REV-TIME-08: consulta por caixa encontra ocorrência de competência diferente (outubro encontra a de setembro)');

await check('REV_TIME_09', async () => {
  const r = await page.evaluate(() => getReceitasForMonth(9, 2026).some((x) => x.id === 'salRT'));
  return { ok: r === true, detail: `consulta por competência (setembro) ainda encontra a ocorrência original=${r} (esp. true)` };
}, 'REV-TIME-09: consulta por competência continua encontrando a ocorrência original, mesmo após REV-TIME-06/08');

await check('REV_TIME_10', async () => {
  const r = await page.evaluate(() => {
    state.receitas.push({
      id: 'salSemDataRT', tipo: 'salario', nome: 'Salário', valor: 5000, mes: 12, ano: 2026,
      competenciaMes: 12, competenciaAno: 2026, conta: 'c1', certeza: 'recorrente',
      recorrencia: { type: 'last_weekday_of_month', weekday: 5 },
      recebidoPorMes: { '2026-12': { estado: 'recebido', dataRecebimento: null } }, createdAt: 'salSemDataRT',
    });
    let apareceuEmAlgumMes = false;
    for (let m = 1; m <= 12; m++) { if (getCashRevenuesForMonth(m, 2026).some((x) => x.id === 'salSemDataRT')) apareceuEmAlgumMes = true; }
    return apareceuEmAlgumMes;
  });
  return { ok: r === false, detail: `sem dataRecebimento válida, apareceu em algum mês de 2026=${r} (esp. false)` };
}, 'REV-TIME-10: sem dataRecebimento válida = sem impacto de caixa novo-modelo (procurando em todos os 12 meses)');

// ---------------------------------------------------------------------------
// MONTHLY_CASH_TOTALS — calcTotaisIsoladoMes (seção 25/11)
// ---------------------------------------------------------------------------

await check('MONTHLY_CASH_TOTALS_01_ATRASO', async () => {
  await loadState(baseSyntheticState());
  const r = await page.evaluate(() => {
    state.receitas.push({
      id: 'sal', tipo: 'salario', nome: 'Salário', valor: 5000, mes: 9, ano: 2026,
      competenciaMes: 9, competenciaAno: 2026, conta: 'c1', certeza: 'recorrente',
      recorrencia: { type: 'last_weekday_of_month', weekday: 5 },
      recebidoPorMes: { '2026-09': { estado: 'recebido', dataRecebimento: '2026-10-02' } }, createdAt: 'sal',
    });
    const setembro = calcTotaisIsoladoMes(9, 2026);
    const outubro = calcTotaisIsoladoMes(10, 2026);
    return { emCaixaEntradasSetembro: setembro.emCaixaEntradas, emCaixaEntradasOutubro: outubro.emCaixaEntradas };
  });
  const ok = r.emCaixaEntradasSetembro === 0 && r.emCaixaEntradasOutubro === 5000;
  return { ok, detail: JSON.stringify(r) };
}, 'calcTotaisIsoladoMes(setembro).emCaixaEntradas NÃO contém os 5000 (pago em outubro); calcTotaisIsoladoMes(outubro).emCaixaEntradas contém');

await check('MONTHLY_CASH_TOTALS_02_ANTECIPACAO', async () => {
  await loadState(baseSyntheticState());
  const r = await page.evaluate(() => {
    state.receitas.push({
      id: 'sal', tipo: 'salario', nome: 'Salário', valor: 5000, mes: 9, ano: 2026,
      competenciaMes: 9, competenciaAno: 2026, conta: 'c1', certeza: 'recorrente',
      recorrencia: { type: 'last_weekday_of_month', weekday: 5 },
      recebidoPorMes: { '2026-09': { estado: 'recebido', dataRecebimento: '2026-08-28' } }, createdAt: 'sal',
    });
    const agosto = calcTotaisIsoladoMes(8, 2026);
    const setembro = calcTotaisIsoladoMes(9, 2026);
    return { emCaixaEntradasAgosto: agosto.emCaixaEntradas, emCaixaEntradasSetembro: setembro.emCaixaEntradas };
  });
  const ok = r.emCaixaEntradasAgosto === 5000 && r.emCaixaEntradasSetembro === 0;
  return { ok, detail: JSON.stringify(r) };
}, 'calcTotaisIsoladoMes(agosto).emCaixaEntradas contém os 5000 (pago adiantado); calcTotaisIsoladoMes(setembro).emCaixaEntradas NÃO contém');

// ---------------------------------------------------------------------------
// BANK_BALANCE_TEMPORAL_CONSISTENCY — a visão de caixa mensal precisa
// concordar, cronologicamente, com calcSaldoConta/calcSaldoContaAte (seção
// 26) — os testes existentes desses dois motores continuam passando
// (verificado pela suíte completa); aqui a regressão explícita é: somar a
// visão mensal de caixa em todos os meses relevantes tem que bater com o
// que calcSaldoConta (sem corte temporal) e calcSaldoContaAte (com corte)
// contam pra essa mesma receita.
// ---------------------------------------------------------------------------

await check('BANK_BALANCE_TEMPORAL_CONSISTENCY_01', async () => {
  await loadState(baseSyntheticState());
  const r = await page.evaluate(() => {
    state.receitas.push({
      id: 'sal', tipo: 'salario', nome: 'Salário', valor: 5000, mes: 9, ano: 2026,
      competenciaMes: 9, competenciaAno: 2026, conta: 'c1', certeza: 'recorrente',
      recorrencia: { type: 'last_weekday_of_month', weekday: 5 },
      recebidoPorMes: { '2026-09': { estado: 'recebido', dataRecebimento: '2026-10-02' } }, createdAt: 'sal',
    });
    // saldoInicial da conta c1 (baseSyntheticState) é 1000 — isola só a
    // contribuição do salário comparando o delta antes/depois de cada corte.
    const ateAgosto = calcSaldoContaAte('c1', 8, 2026) - 1000;
    const ateSetembro = calcSaldoContaAte('c1', 9, 2026) - 1000;
    const ateOutubro = calcSaldoContaAte('c1', 10, 2026) - 1000;
    const cashSetembro = getCashRevenuesForMonth(9, 2026).reduce((s, x) => s + valorReceita(x), 0);
    const cashOutubro = getCashRevenuesForMonth(10, 2026).reduce((s, x) => s + valorReceita(x), 0);
    return { ateAgosto, ateSetembro, ateOutubro, cashSetembro, cashOutubro };
  });
  const ok = r.ateAgosto === 0 && r.ateSetembro === 0 && r.ateOutubro === 5000
    && r.cashSetembro === 0 && r.cashOutubro === 5000;
  return { ok, detail: JSON.stringify(r) };
}, 'calcSaldoContaAte só passa a contar o salário a partir de outubro (mesma data de caixa que getCashRevenuesForMonth usa) — os dois motores concordam cronologicamente');

await close();

const fails = results.filter((r) => r.status === 'FAIL').length;
console.log(`\ngate2-2-cash-view.test.mjs: TOTAL=${results.length} PASS=${results.length - fails} FAIL=${fails}`);
if (fails > 0) process.exitCode = 1;

export { results };
