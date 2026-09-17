// Gate 2.2 (seção 18-22/28/29) — adapter do ciclo financeiro pessoal
// (CYCLE_ADAPTER_01..10 + o teste integrado obrigatório da seção 29).
//
// Motivo: getFinancialCycle(referenceDate, salaryEvents, expectedNextDate) já
// existia (motor puro, nunca reescrito aqui) mas nada em state.receitas
// alimentava salaryEvents/expectedNextDate — getReceivedSalaryEvents() e
// getCurrentFinancialCycle(referenceDate) são os adapters novos que fazem
// essa ponte, reusando getRecurringRevenueCashDate (Gate 2.1) e
// getExpectedSalaryDate (Gate 2) sem duplicar nenhuma fórmula. O ciclo
// continua uma VISÃO DERIVADA: nada aqui grava cycleId em nenhuma
// transação, nada move despesas de mês, nada altera a competência de
// cartões.
import { openHarness, makeRunner, baseSyntheticState } from './harness.mjs';

const { page, loadState, close } = await openHarness();
const { check, results } = makeRunner('gate2-2-cycle-adapter');

function salario(id, competenciaMes, competenciaAno, recebidoPorMes) {
  return {
    id, tipo: 'salario', nome: 'Salário', valor: 5000, mes: competenciaMes, ano: competenciaAno,
    competenciaMes, competenciaAno, conta: 'c1', certeza: 'recorrente',
    recorrencia: { type: 'last_weekday_of_month', weekday: 5 },
    recebidoPorMes: recebidoPorMes || {}, createdAt: id,
  };
}

// CYCLE_ADAPTER_01 — extrai corretamente salários recorrentes efetivamente
// recebidos (estado 'recebido' + dataRecebimento válida).
await check('CYCLE_ADAPTER_01', async () => {
  await loadState(baseSyntheticState());
  const r = await page.evaluate(() => {
    state.receitas.push({
      id: 'sal', tipo: 'salario', nome: 'Salário', valor: 5000, mes: 9, ano: 2026,
      competenciaMes: 9, competenciaAno: 2026, conta: 'c1', certeza: 'recorrente',
      recorrencia: { type: 'last_weekday_of_month', weekday: 5 },
      recebidoPorMes: { '2026-09': { estado: 'recebido', dataRecebimento: '2026-09-25' } }, createdAt: 'sal',
    });
    return getReceivedSalaryEvents();
  });
  const ok = r.length === 1 && r[0].competenciaKey === '2026-09' && r[0].dataRecebimento === '2026-09-25' && r[0].receitaId === 'sal';
  return { ok, detail: `eventos=${JSON.stringify(r)} (esp. 1 evento: competenciaKey=2026-09, dataRecebimento=2026-09-25)` };
}, 'getReceivedSalaryEvents extrai a ocorrência de salário recorrente efetivamente recebida, com sua data real de caixa');

// CYCLE_ADAPTER_02 — ignora ocorrência prevista (nunca finge que um salário
// previsto já entrou).
await check('CYCLE_ADAPTER_02', async () => {
  await loadState(baseSyntheticState());
  const r = await page.evaluate(() => {
    state.receitas.push(Object.assign(salarioLiteral(), { recebidoPorMes: { '2026-09': { estado: 'previsto', dataRecebimento: null } } }));
    function salarioLiteral() {
      return { id: 'sal', tipo: 'salario', nome: 'Salário', valor: 5000, mes: 9, ano: 2026, competenciaMes: 9, competenciaAno: 2026, conta: 'c1', certeza: 'recorrente', recorrencia: { type: 'last_weekday_of_month', weekday: 5 }, createdAt: 'sal' };
    }
    return getReceivedSalaryEvents();
  });
  const ok = r.length === 0;
  return { ok, detail: `eventos=${JSON.stringify(r)} (esp. [] — estado 'previsto' nunca é tratado como salário efetivamente recebido)` };
}, 'ocorrência prevista (não recebida) nunca entra em getReceivedSalaryEvents');

// CYCLE_ADAPTER_03 — ignora ocorrência 'recebida' sem dataRecebimento
// válida (nunca inventa data, mesma regra absoluta do resto do Gate 2.2).
await check('CYCLE_ADAPTER_03', async () => {
  await loadState(baseSyntheticState());
  const r = await page.evaluate(() => {
    state.receitas.push({
      id: 'sal', tipo: 'salario', nome: 'Salário', valor: 5000, mes: 9, ano: 2026,
      competenciaMes: 9, competenciaAno: 2026, conta: 'c1', certeza: 'recorrente',
      recorrencia: { type: 'last_weekday_of_month', weekday: 5 },
      recebidoPorMes: { '2026-09': { estado: 'recebido', dataRecebimento: null } }, createdAt: 'sal',
    });
    return getReceivedSalaryEvents();
  });
  const ok = r.length === 0;
  return { ok, detail: `eventos=${JSON.stringify(r)} (esp. [] — 'recebido' sem dataRecebimento válida nunca produz evento, nunca inventa uma data)` };
}, "estado 'recebido' sem dataRecebimento válida nunca produz um evento de ciclo");

// CYCLE_ADAPTER_04 — preserva a competenciaKey original de cada evento,
// mesmo quando a data de caixa é de outro mês.
await check('CYCLE_ADAPTER_04', async () => {
  await loadState(baseSyntheticState());
  const r = await page.evaluate(() => {
    state.receitas.push(salario_02());
    function salario_02() {
      return {
        id: 'sal', tipo: 'salario', nome: 'Salário', valor: 5000, mes: 9, ano: 2026,
        competenciaMes: 9, competenciaAno: 2026, conta: 'c1', certeza: 'recorrente',
        recorrencia: { type: 'last_weekday_of_month', weekday: 5 },
        recebidoPorMes: { '2026-09': { estado: 'recebido', dataRecebimento: '2026-10-02' } }, createdAt: 'sal',
      };
    }
    return getReceivedSalaryEvents();
  });
  const ok = r.length === 1 && r[0].competenciaKey === '2026-09' && r[0].dataRecebimento === '2026-10-02';
  return { ok, detail: `evento=${JSON.stringify(r[0])} (esp. competenciaKey=2026-09 preservada, dataRecebimento=2026-10-02 — a competência nunca é substituída pela data de caixa)` };
}, 'a competenciaKey original é preservada mesmo quando a dataRecebimento cai em outro mês');

// CYCLE_ADAPTER_05 — múltiplas competências ficam ordenadas por
// getFinancialCycle pela data REAL de recebimento (não pela ordem de
// inserção nem pela competência).
await check('CYCLE_ADAPTER_05', async () => {
  await loadState(baseSyntheticState());
  const r = await page.evaluate(() => {
    state.receitas.push(salario('sal1', 10, 2026, { '2026-10': { estado: 'recebido', dataRecebimento: '2026-09-30' } }));
    state.receitas.push(salario('sal2', 9, 2026, { '2026-09': { estado: 'recebido', dataRecebimento: '2026-08-28' } }));
    function salario(id, cm, ca, rpm) {
      return { id, tipo: 'salario', nome: 'Salário', valor: 5000, mes: cm, ano: ca, competenciaMes: cm, competenciaAno: ca, conta: 'c1', certeza: 'recorrente', recorrencia: { type: 'last_weekday_of_month', weekday: 5 }, recebidoPorMes: rpm, createdAt: id };
    }
    const events = getReceivedSalaryEvents();
    return { events, ciclo: getFinancialCycle('2026-09-15', events, null) };
  });
  const ok = r.ciclo.startDate === '2026-08-28' && r.ciclo.endDate === '2026-09-29';
  return { ok, detail: `eventos=${JSON.stringify(r.events)}, ciclo(15/09)=${JSON.stringify(r.ciclo)} (esp. startDate=2026-08-28, endDate=2026-09-29 — getFinancialCycle ordena pela data real, não pela ordem de inserção/competência)` };
}, 'getFinancialCycle ordena os eventos extraídos pela data real de recebimento, independente da ordem de inserção ou da competência');

// CYCLE_ADAPTER_06 — a competência NÃO determina a fronteira do ciclo:
// competência de setembro com caixa em outubro não fecha o ciclo em
// setembro.
await check('CYCLE_ADAPTER_06', async () => {
  await loadState(baseSyntheticState());
  const r = await page.evaluate(() => {
    state.receitas.push({
      id: 'sal1', tipo: 'salario', nome: 'Salário', valor: 5000, mes: 8, ano: 2026,
      competenciaMes: 8, competenciaAno: 2026, conta: 'c1', certeza: 'recorrente',
      recorrencia: { type: 'last_weekday_of_month', weekday: 5 },
      recebidoPorMes: { '2026-08': { estado: 'recebido', dataRecebimento: '2026-08-28' } }, createdAt: 'sal1',
    });
    state.receitas.push({
      id: 'sal2', tipo: 'salario', nome: 'Salário', valor: 5000, mes: 9, ano: 2026,
      competenciaMes: 9, competenciaAno: 2026, conta: 'c1', certeza: 'recorrente',
      recorrencia: { type: 'last_weekday_of_month', weekday: 5 },
      // competência de setembro EXISTE mas ainda não foi marcada como
      // recebida (só previsão) — o adapter não pode fechar o ciclo em
      // setembro só porque essa competência "deveria" acontecer ali.
      recebidoPorMes: { '2026-09': { estado: 'previsto', dataRecebimento: null } }, createdAt: 'sal2',
    });
    const events = getReceivedSalaryEvents();
    // referência dentro de setembro — a competência de setembro existe no
    // cadastro, mas nenhum dinheiro dela entrou de fato ainda; o ciclo não
    // pode fechar por causa da COMPETÊNCIA da segunda ocorrência, só por
    // uma dataRecebimento real.
    return getFinancialCycle('2026-09-15', events, null);
  });
  const ok = r.startDate === '2026-08-28' && r.endDate === null;
  return { ok, detail: `ciclo(15/09)=${JSON.stringify(r)} (esp. startDate=2026-08-28, endDate=null — a competência de setembro existe no cadastro mas ainda está 'previsto' (sem dataRecebimento real), então não produz evento nenhum e não fecha o ciclo)` };
}, 'competência de um salário não determina a fronteira do ciclo — só a dataRecebimento real conta');

// CYCLE_ADAPTER_07 — um próximo salário efetivamente recebido fecha o
// ciclo anterior (usa a data real, não a data prevista).
await check('CYCLE_ADAPTER_07', async () => {
  await loadState(baseSyntheticState());
  const r = await page.evaluate(() => {
    state.receitas.push({
      id: 'sal1', tipo: 'salario', nome: 'Salário', valor: 5000, mes: 8, ano: 2026,
      competenciaMes: 8, competenciaAno: 2026, conta: 'c1', certeza: 'recorrente',
      recorrencia: { type: 'last_weekday_of_month', weekday: 5 },
      recebidoPorMes: { '2026-08': { estado: 'recebido', dataRecebimento: '2026-08-28' } }, createdAt: 'sal1',
    });
    state.receitas.push({
      id: 'sal2', tipo: 'salario', nome: 'Salário', valor: 5000, mes: 9, ano: 2026,
      competenciaMes: 9, competenciaAno: 2026, conta: 'c1', certeza: 'recorrente',
      recorrencia: { type: 'last_weekday_of_month', weekday: 5 },
      recebidoPorMes: { '2026-09': { estado: 'recebido', dataRecebimento: '2026-10-02' } }, createdAt: 'sal2',
    });
    const events = getReceivedSalaryEvents();
    return getFinancialCycle('2026-09-15', events, '2026-10-05'); // expectedNextDate ainda seria ignorado pois há um evento real depois
  });
  const ok = r.startDate === '2026-08-28' && r.endDate === '2026-10-01' && r.endSource === 'received_salary';
  return { ok, detail: `ciclo=${JSON.stringify(r)} (esp. endDate=2026-10-01 (véspera de 02/10, a data REAL do próximo salário), endSource=received_salary — nunca usa expectedNextDate quando já existe um recebimento real posterior)` };
}, 'o próximo salário efetivamente recebido fecha o ciclo anterior pela sua data real, mesmo quando referenceDate ainda está dentro do ciclo antigo');

// CYCLE_ADAPTER_08 — sem um próximo salário real, usa expectedNextDate só
// como limite projetado.
await check('CYCLE_ADAPTER_08', async () => {
  await loadState(baseSyntheticState());
  const r = await page.evaluate(() => {
    state.receitas.push({
      id: 'sal1', tipo: 'salario', nome: 'Salário', valor: 5000, mes: 8, ano: 2026,
      competenciaMes: 8, competenciaAno: 2026, conta: 'c1', certeza: 'recorrente',
      recorrencia: { type: 'last_weekday_of_month', weekday: 5 },
      recebidoPorMes: { '2026-08': { estado: 'recebido', dataRecebimento: '2026-08-28' } }, createdAt: 'sal1',
    });
    const events = getReceivedSalaryEvents();
    return getFinancialCycle('2026-09-15', events, '2026-09-25');
  });
  const ok = r.startDate === '2026-08-28' && r.endDate === '2026-09-24' && r.endSource === 'expected_salary';
  return { ok, detail: `ciclo=${JSON.stringify(r)} (esp. endDate=2026-09-24 — véspera do expectedNextDate projetado, endSource=expected_salary, usado só porque não há nenhum recebimento real depois)` };
}, 'sem um próximo salário real recebido, o ciclo usa expectedNextDate apenas como limite projetado');

// CYCLE_ADAPTER_09 — expectedNextDate nunca é tratado como se já fosse um
// salário efetivamente recebido (nunca aparece nos eventos, nunca fecha o
// ciclo como received_salary).
await check('CYCLE_ADAPTER_09', async () => {
  await loadState(baseSyntheticState());
  const r = await page.evaluate(() => {
    state.receitas.push({
      id: 'sal1', tipo: 'salario', nome: 'Salário', valor: 5000, mes: 8, ano: 2026,
      competenciaMes: 8, competenciaAno: 2026, conta: 'c1', certeza: 'recorrente',
      recorrencia: { type: 'last_weekday_of_month', weekday: 5 },
      recebidoPorMes: { '2026-08': { estado: 'recebido', dataRecebimento: '2026-08-28' } }, createdAt: 'sal1',
    });
    const events = getReceivedSalaryEvents();
    const ciclo = getFinancialCycle('2026-09-15', events, '2026-09-25');
    return { qtdEventos: events.length, endSource: ciclo.endSource };
  });
  const ok = r.qtdEventos === 1 && r.endSource === 'expected_salary';
  return { ok, detail: `qtd eventos reais=${r.qtdEventos} (esp. 1 — só o salário efetivamente recebido, nunca o projetado), endSource=${r.endSource} (esp. expected_salary, nunca received_salary — a fronteira projetada nunca é confundida com uma recebida)` };
}, 'expectedNextDate nunca entra em salaryEvents nem é confundida com um salário efetivamente recebido');

// CYCLE_ADAPTER_10 — sem nenhum salário efetivamente recebido, o ciclo é
// indisponível (cycleUnavailable), nunca inventado.
await check('CYCLE_ADAPTER_10', async () => {
  await loadState(baseSyntheticState());
  const r = await page.evaluate(() => {
    state.receitas.push({
      id: 'sal1', tipo: 'salario', nome: 'Salário', valor: 5000, mes: 9, ano: 2026,
      competenciaMes: 9, competenciaAno: 2026, conta: 'c1', certeza: 'recorrente',
      recorrencia: { type: 'last_weekday_of_month', weekday: 5 },
      recebidoPorMes: { '2026-09': { estado: 'previsto', dataRecebimento: null } }, createdAt: 'sal1',
    });
    return getCurrentFinancialCycle('2026-09-15');
  });
  const ok = r.cycleUnavailable === true;
  return { ok, detail: `getCurrentFinancialCycle('2026-09-15')=${JSON.stringify(r)} (esp. {cycleUnavailable:true} — nenhum salário efetivamente recebido ainda, o ciclo nunca é inventado)` };
}, 'sem nenhum salário efetivamente recebido, getCurrentFinancialCycle retorna cycleUnavailable, nunca um ciclo fictício');

// Teste integrado obrigatório (seção 29 do Gate 2.2): salário competência
// agosto recebido 28/08; salário competência setembro recebido de fato só
// em 02/10; referenceDate=15/09. O ciclo que contém 15/09 deve começar em
// 28/08 e terminar em 01/10 (véspera do próximo recebimento REAL, 02/10) —
// a competência de setembro não pode antecipar essa fronteira.
await check('CYCLE_ADAPTER_INTEGRATED_29', async () => {
  await loadState(baseSyntheticState());
  const r = await page.evaluate(() => {
    state.receitas.push({
      id: 'sal_ago', tipo: 'salario', nome: 'Salário', valor: 5000, mes: 8, ano: 2026,
      competenciaMes: 8, competenciaAno: 2026, conta: 'c1', certeza: 'recorrente',
      recorrencia: { type: 'last_weekday_of_month', weekday: 5 },
      recebidoPorMes: { '2026-08': { estado: 'recebido', dataRecebimento: '2026-08-28' } }, createdAt: 'sal_ago',
    });
    // Gate 4.1: usuário escolheu ciclo por salário principal. As duas
    // competências pertencem ao MESMO salário; manter todas as asserções de data.
    state.receitas.find(r=>r.id==='sal_ago').recebidoPorMes['2026-09']={estado:'recebido',dataRecebimento:'2026-10-02'};
    state.financialPreferences={primarySalaryId:'sal_ago'};
    return getCurrentFinancialCycle('2026-09-15');
  });
  const ok = r.startDate === '2026-08-28' && r.endDate === '2026-10-01' && r.startSource === 'received_salary' && r.endSource === 'received_salary';
  return { ok, detail: `getCurrentFinancialCycle('2026-09-15')=${JSON.stringify(r)} (esp. startDate=2026-08-28, endDate=2026-10-01 — o ciclo fecha na véspera do próximo salário EFETIVAMENTE recebido, 02/10, nunca antecipado pela competência de setembro)` };
}, 'teste integrado obrigatório (seção 29): a competência de setembro nunca antecipa a fronteira do ciclo — só o recebimento real de 02/10 fecha o ciclo que contém 15/09');

await close();

const fails = results.filter((r) => r.status === 'FAIL').length;
console.log(`\ngate2-2-cycle-adapter.test.mjs: TOTAL=${results.length} PASS=${results.length - fails} FAIL=${fails}`);
if (fails > 0) process.exitCode = 1;

export { results };
