// Gate 2 — FC01..FC05: ciclo financeiro pessoal (getFinancialCycle), puro,
// derivado, nunca inventando um recebimento que não aconteceu.
import { openHarness, makeRunner } from './harness.mjs';

const { page, close } = await openHarness();
const { check, results } = makeRunner('gate2-cycle');

async function cycle(referenceDate, salaryEvents, expectedNextDate) {
  return page.evaluate(([r, s, e]) => getFinancialCycle(r, s, e), [referenceDate, salaryEvents, expectedNextDate]);
}

// FC01: salário recebido 27/07, próximo salário recebido 28/08 -> ciclo
// 27/07 a 27/08 (o dia anterior ao próximo recebimento).
await check('FC01', async () => {
  const events = [{ dataRecebimento: '2026-07-27' }, { dataRecebimento: '2026-08-28' }];
  const r = await cycle('2026-08-01', events, null);
  const ok = r.startDate === '2026-07-27' && r.endDate === '2026-08-27' && r.startSource === 'received_salary' && r.endSource === 'received_salary';
  return { ok, detail: JSON.stringify(r) };
}, 'salário recebido 27/07, próximo recebido 28/08 → ciclo de 27/07 a 27/08 (dia anterior ao próximo recebimento)');

// FC02: em 28/08 (a própria data do segundo salário) já inicia o NOVO ciclo
// — referenceDate igual à data de um recebimento pertence ao ciclo que
// COMEÇA nele, não ao anterior.
await check('FC02', async () => {
  const events = [{ dataRecebimento: '2026-07-27' }, { dataRecebimento: '2026-08-28' }];
  const r = await cycle('2026-08-28', events, null);
  return { ok: r.startDate === '2026-08-28', detail: `ciclo que contém 28/08 começa em ${r.startDate} (esperado 2026-08-28 — o novo ciclo, não o anterior)` };
}, 'em 28/08 (data do recebimento) já inicia o novo ciclo, não o anterior');

// FC03: sem próximo salário efetivamente recebido, usa a data PREVISTA do
// próximo salário só como limite projetado (endSource diferencia isso).
await check('FC03', async () => {
  const events = [{ dataRecebimento: '2026-08-28' }];
  const r = await cycle('2026-09-10', events, '2026-09-25');
  const ok = r.startDate === '2026-08-28' && r.endDate === '2026-09-24' && r.startSource === 'received_salary' && r.endSource === 'expected_salary';
  return { ok, detail: JSON.stringify(r) };
}, 'sem próximo salário recebido, usa a data prevista só como limite projetado (endSource=expected_salary, nunca received_salary)');

// FC04: um salário meramente previsto (sem dataRecebimento) NUNCA entra na
// lista de eventos que definem o INÍCIO de um ciclo — só datas efetivamente
// recebidas podem iniciar um ciclo.
await check('FC04', async () => {
  // Simula o erro que NÃO deve acontecer: passar um evento previsto (sem
  // dataRecebimento, ou com dataRecebimento null) na lista de salaryEvents.
  // getFinancialCycle já filtra isso via `.filter(Boolean)` no next do
  // campo dataRecebimento — confirmamos que ele realmente ignora esse evento.
  const events = [{ dataRecebimento: '2026-07-27' }, { dataPrevista: '2026-08-28', dataRecebimento: null }];
  const r = await cycle('2026-08-15', events, '2026-08-28');
  // Só há 1 recebimento real (27/07); o segundo evento (sem dataRecebimento)
  // deve ser ignorado — o ciclo usa a data PREVISTA só como limite (expected_salary).
  const ok = r.startDate === '2026-07-27' && r.endSource === 'expected_salary' && r.endDate === '2026-08-27';
  return { ok, detail: JSON.stringify(r) };
}, 'salário previsto (sem dataRecebimento) nunca conta como início de ciclo — só datas efetivamente recebidas contam');

// FC05: sem nenhum salário recebido conhecido -> cycleUnavailable, nunca
// inventa um ciclo.
await check('FC05', async () => {
  const r1 = await cycle('2026-08-15', [], null);
  const r2 = await cycle('2026-06-01', [{ dataRecebimento: '2026-07-27' }], null); // referenceDate ANTES do único salário conhecido
  return { ok: r1.cycleUnavailable === true && r2.cycleUnavailable === true, detail: `sem eventos: ${JSON.stringify(r1)}; referenceDate anterior a qualquer salário conhecido: ${JSON.stringify(r2)}` };
}, 'sem informação suficiente para determinar o ciclo (nenhum salário recebido, ou referenceDate anterior a todos) → cycleUnavailable, nunca inventa');

await close();

const fails = results.filter((r) => r.status === 'FAIL').length;
console.log(`\ngate2-cycle.test.mjs: TOTAL=${results.length} PASS=${results.length - fails} FAIL=${fails}`);
if (fails > 0) process.exitCode = 1;

export { results };
