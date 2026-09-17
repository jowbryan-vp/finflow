// Gate 3 — seção 43: reservas empresariais (OE01-OE03) — mesma filosofia
// dos cofrinhos pessoais (aplicação/resgate ≠ despesa/receita).
import { openHarness, makeRunner, baseSyntheticState } from './harness.mjs';

const { page, loadState, close } = await openHarness();
const { check, results } = makeRunner('gate3-reserves');

await loadState(baseSyntheticState());
await page.evaluate(() => {
  state.office.contas.push({ id: 'oc1', name: 'Conta Escritório', color: '#ff9900', saldoInicial: 2000 });
  state.office.reservas.push({ id: 'or1', nome: 'Reserva de Impostos', finalidade: 'impostos', color: '#5b7fff', saldoInicial: 0 });
});

await check('OE01', async () => {
  const r = await page.evaluate(() => {
    const receitasAntes = state.receitas.length, despesasEscritorioAntes = state.office.despesas.length;
    const movId = uid();
    state.office.movimentacoesReservas.push({ id: movId, reservaId: 'or1', valor: 1000, mes: 9, ano: 2026, tipo: 'aplicacao', createdAt: uid() });
    state.office.movimentacoesContas.push({ id: movId, contaId: 'oc1', valor: -1000, data: '2026-09-10T00:00:00.000Z', obs: 'Aplicação em reserva' });
    return {
      saldoConta: calcSaldoOfficeConta('oc1'), saldoReserva: getSaldoOfficeReserva('or1'),
      receitasDepois: state.receitas.length, despesasEscritorioDepois: state.office.despesas.length,
      receitasAntes, despesasEscritorioAntes,
    };
  });
  const ok = r.saldoConta === 1000 && r.saldoReserva === 1000 && r.receitasDepois === r.receitasAntes && r.despesasEscritorioDepois === r.despesasEscritorioAntes;
  return { ok, detail: `caixa escritório -1000, reserva +1000 — saldoConta=${r.saldoConta} (esp. 1000), saldoReserva=${r.saldoReserva} (esp. 1000), despesa econômica gerada=${r.despesasEscritorioDepois - r.despesasEscritorioAntes} (esp. 0)` };
}, 'aplicação em reserva: caixa escritório -1000 / reserva +1000, despesa econômica = 0');

await check('OE02', async () => {
  const r = await page.evaluate(() => {
    const receitasAntes = state.receitas.length;
    const movId = uid();
    state.office.movimentacoesReservas.push({ id: movId, reservaId: 'or1', valor: 1000, mes: 9, ano: 2026, tipo: 'resgate', createdAt: uid() });
    state.office.movimentacoesContas.push({ id: movId, contaId: 'oc1', valor: 1000, data: '2026-09-15T00:00:00.000Z', obs: 'Resgate da reserva' });
    return { saldoConta: calcSaldoOfficeConta('oc1'), saldoReserva: getSaldoOfficeReserva('or1'), receitasDepois: state.receitas.length, receitasAntes };
  });
  const ok = r.saldoConta === 2000 && r.saldoReserva === 0 && r.receitasDepois === r.receitasAntes;
  return { ok, detail: `resgate: reserva -1000, caixa escritório +1000 — saldoConta=${r.saldoConta} (esp. 2000), saldoReserva=${r.saldoReserva} (esp. 0), receita econômica gerada=${r.receitasDepois - r.receitasAntes} (esp. 0)` };
}, 'resgate de reserva: reserva -1000 / caixa escritório +1000, receita econômica = 0');

await check('OE03', async () => {
  const r = await page.evaluate(() => {
    state.office.reservas.push({ id: 'or2', nome: 'Reserva Equipamentos', finalidade: 'equipamentos', color: '#38e2b4', saldoInicial: 3000 });
    const operacional = getOfficeOperationalBalance();
    return { operacional, saldoOr2: getSaldoOfficeReserva('or2') };
  });
  const ok = r.saldoOr2 === 3000 && r.operacional === 2000; // saldo operacional segue só as contas, nunca as reservas
  return { ok, detail: `reserva 'or2' com 3000 nunca soma no operacional (${r.operacional}, esp. 2000 — só a conta oc1)` };
}, 'reserva empresarial não compõe o saldo operacional disponível');

await close();

const fails = results.filter((r) => r.status === 'FAIL').length;
console.log(`\ngate3-reserves.test.mjs: TOTAL=${results.length} PASS=${results.length - fails} FAIL=${fails}`);
if (fails > 0) process.exitCode = 1;

export { results };
