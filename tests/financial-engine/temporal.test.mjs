// G1-C01..G1-C09 — day-aware invoice competência (getCompetenciaFatura), and
// the two legacy-fallback paths that must NEVER try to infer a day.
//
// Rule under test (formal algorithm from the Gate 1 spec):
//   if dataCompra existe AND cartao.fecha existe:
//     if dia(dataCompra) <= cartao.fecha: competenciaFatura = mês(dataCompra)
//     else:                               competenciaFatura = mês(dataCompra) + 1
//   else: MODO LEGADO — competenciaFatura = mesInicioLegacy + 1 (nunca adivinha o dia)
//
// getCompetenciaFatura is a pure function (no state reads), so these run
// directly in the page context right after load — no despesas/state setup
// needed.
import { openHarness, makeRunner } from './harness.mjs';

const { page, close } = await openHarness();
const { check, results } = makeRunner('temporal');

async function competencia(dataCompra, cartao, mesLegacy, anoLegacy) {
  return page.evaluate(
    ([dataCompra, cartao, mesLegacy, anoLegacy]) => getCompetenciaFatura(dataCompra, cartao, mesLegacy, anoLegacy),
    [dataCompra, cartao, mesLegacy, anoLegacy]
  );
}

const nu = { id: 'nu', name: 'Nubank', fecha: 3, paga: 10 };

// G1-C01..C03: around the closing day itself (fecha=03), same month vs. year boundary N/A
await check('G1-C01', async () => {
  const r = await competencia('2026-09-02', nu, 9, 2026);
  return r.mes === 9 && r.ano === 2026;
}, '02/09/2026, fecha 03 → esperado setembro/2026');

await check('G1-C02', async () => {
  const r = await competencia('2026-09-03', nu, 9, 2026);
  return r.mes === 9 && r.ano === 2026;
}, '03/09/2026 (exatamente no dia do fechamento), fecha 03 → esperado setembro/2026');

await check('G1-C03', async () => {
  const r = await competencia('2026-09-04', nu, 9, 2026);
  return r.mes === 10 && r.ano === 2026;
}, '04/09/2026 (um dia depois do fechamento), fecha 03 → esperado outubro/2026');

// G1-C04..C07: end-of-month / next-month boundary
await check('G1-C04', async () => {
  const r = await competencia('2026-09-30', nu, 9, 2026);
  return r.mes === 10 && r.ano === 2026;
}, '30/09/2026 → esperado outubro/2026');

await check('G1-C05', async () => {
  const r = await competencia('2026-10-02', nu, 10, 2026);
  return r.mes === 10 && r.ano === 2026;
}, '02/10/2026 → esperado outubro/2026');

await check('G1-C06', async () => {
  const r = await competencia('2026-10-03', nu, 10, 2026);
  return r.mes === 10 && r.ano === 2026;
}, '03/10/2026 → esperado outubro/2026');

await check('G1-C07', async () => {
  const r = await competencia('2026-10-04', nu, 10, 2026);
  return r.mes === 11 && r.ano === 2026;
}, '04/10/2026 → esperado novembro/2026');

// G1-C08/C09: year rollover
await check('G1-C08', async () => {
  const r = await competencia('2026-12-20', nu, 12, 2026);
  return r.mes === 1 && r.ano === 2027;
}, 'virada de ano: compra 20/12/2026, fecha 03 → esperado janeiro/2027');

await check('G1-C09', async () => {
  const r = await competencia('2027-01-02', nu, 1, 2027);
  return r.mes === 1 && r.ano === 2027;
}, 'compra 02/01/2027, fecha 03 → esperado janeiro/2027 (12/2026 + 1 mês tem que virar 01/2027 corretamente)');

// Legacy fallback path #1: dataCompra absent → legacy mode (mesInicio+1),
// NEVER infer a day from mesInicio/anoInicio.
await check('G1-EXTRA-legacy-sem-dataCompra', async () => {
  const r = await competencia(null, nu, 9, 2026);
  return r.mes === 10 && r.ano === 2026;
}, 'dataCompra ausente, cartão COM fecha configurado → modo legado (mesInicio+1 = out/2026), nunca infere dia');

// Legacy fallback path #2: dataCompra present but cartao.fecha is null →
// legacy mode too. This is the exact inconsistency the user flagged from the
// prior audit report ("dataCompra ausente → inferir dia" was wrong; the rule
// is "sem fecha configurado → modo legado", independent of dataCompra).
await check('G1-EXTRA-legacy-sem-fecha-configurado', async () => {
  const semFecha = { id: 'semfecha', name: 'Sem fechamento', fecha: null, paga: null };
  const r = await competencia('2026-09-02', semFecha, 9, 2026);
  return r.mes === 10 && r.ano === 2026;
}, 'dataCompra existe MAS cartao.fecha é null → modo legado (mesInicio+1), nunca tenta inferir o dia de fechamento');

// Year rollover on the legacy path too (mesInicioLegacy=12 → +1 = 01 do ano seguinte)
await check('G1-EXTRA-legacy-virada-ano', async () => {
  const r = await competencia(null, nu, 12, 2026);
  return r.mes === 1 && r.ano === 2027;
}, 'modo legado com mesInicioLegacy=12/2026 → esperado janeiro/2027 (addMonths correto na virada de ano)');

await close();

const fails = results.filter((r) => r.status === 'FAIL').length;
console.log(`\ntemporal.test.mjs: TOTAL=${results.length} PASS=${results.length - fails} FAIL=${fails}`);
if (fails > 0) process.exitCode = 1;

export { results };
