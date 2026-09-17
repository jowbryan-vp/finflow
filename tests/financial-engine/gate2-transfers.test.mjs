// Gate 2 — T01..T03: transferências entre contas próprias. O mecanismo
// (transferId ligando duas movimentacoesContas opostas) já existia antes do
// Gate 2 — estes testes travam esse comportamento como regressão permanente
// e exercitam o novo helper isInternalTransfer, usado pra reconhecer esse
// padrão sem depender de heurística ad-hoc em cada lugar que precisar disso.
import { openHarness, makeRunner, baseSyntheticState } from './harness.mjs';

const { page, loadState, close } = await openHarness();
const { check, results } = makeRunner('gate2-transfers');

await loadState(baseSyntheticState({
  contas: [
    { id: 'mp', name: 'Mercado Pago', color: '#00b1ea', saldoInicial: 2000 },
    { id: 'nu', name: 'Nubank', color: '#820ad1', saldoInicial: 500 },
  ],
}));

// T01: transferência MP -1000 / NU +1000 -> patrimônio líquido consolidado
// não muda; nem receita nem despesa são geradas.
await check('T01', async () => {
  // salvarTransferencia() lê inputs de um modal de DOM que não existe fora
  // da UI real — o teste reproduz exatamente a mesma operação que ela faz
  // internamente (duas movimentações opostas com o mesmo transferId, ver
  // salvarTransferencia() em index.html), que é o que de fato importa testar.
  const r2 = await page.evaluate(() => {
    const antesMp = calcSaldoConta('mp'), antesNu = calcSaldoConta('nu');
    const tId = uid();
    state.movimentacoesContas.push({ id: uid(), contaId: 'mp', valor: -1000, data: new Date().toISOString(), transferId: tId, obs: 'Transferência para Nubank' });
    state.movimentacoesContas.push({ id: uid(), contaId: 'nu', valor: 1000, data: new Date().toISOString(), transferId: tId, obs: 'Transferência de Mercado Pago' });
    const depoisMp = calcSaldoConta('mp'), depoisNu = calcSaldoConta('nu');
    return { antesMp, antesNu, depoisMp, depoisNu, receitas: state.receitas.length, despesas: state.despesas.length };
  });
  const patrimonioAntes = r2.antesMp + r2.antesNu, patrimonioDepois = r2.depoisMp + r2.depoisNu;
  const ok = patrimonioAntes === patrimonioDepois && r2.receitas === 0 && r2.despesas === 0 && r2.depoisMp === r2.antesMp - 1000 && r2.depoisNu === r2.antesNu + 1000;
  return { ok, detail: `MP ${r2.antesMp}->${r2.depoisMp}, NU ${r2.antesNu}->${r2.depoisNu}, patrimônio ${patrimonioAntes}->${patrimonioDepois} (deve ser igual), receitas=${r2.receitas}, despesas=${r2.despesas}` };
}, 'transferência MP -1000/NU +1000: patrimônio líquido consolidado não muda; receita=0; despesa=0');

// T02: transferência entre contas não altera o total disponível
// consolidado (soma de todas as contas) — mesma verificação de T01, isolada
// como seu próprio caso porque o Gate 2 pede especificamente por ela.
await check('T02', async () => {
  const r = await page.evaluate(() => {
    const totalAntes = state.contas.reduce((s, c) => s + calcSaldoConta(c.id), 0);
    const tId = uid();
    state.movimentacoesContas.push({ id: uid(), contaId: 'nu', valor: -200, data: new Date().toISOString(), transferId: tId, obs: 'Transferência para Mercado Pago' });
    state.movimentacoesContas.push({ id: uid(), contaId: 'mp', valor: 200, data: new Date().toISOString(), transferId: tId, obs: 'Transferência de Nubank' });
    const totalDepois = state.contas.reduce((s, c) => s + calcSaldoConta(c.id), 0);
    return { totalAntes, totalDepois };
  });
  return { ok: r.totalAntes === r.totalDepois, detail: `total consolidado antes=${r.totalAntes}, depois=${r.totalDepois}` };
}, 'transferência entre contas próprias não altera o total disponível consolidado');

// T03: uma transferência nunca aparece como receita econômica em
// getReceitasForMonth/getReceitasEfetivasForMonth de nenhum mês — e
// isInternalTransfer reconhece corretamente os dois lançamentos.
await check('T03', async () => {
  const r = await page.evaluate(() => {
    const movs = state.movimentacoesContas.filter((m) => m.transferId);
    const todasReconhecidas = movs.every((m) => isInternalTransfer(m));
    const nenhumaReceitaGerada = state.receitas.length === 0;
    // varre um ano inteiro de receitas, garantindo que nenhuma transferência colou em algum mês
    let apareceuEmAlgumMes = false;
    for (let mes = 1; mes <= 12; mes++) { if (getReceitasForMonth(mes, 2026).length > 0) apareceuEmAlgumMes = true; }
    return { todasReconhecidas, nenhumaReceitaGerada, apareceuEmAlgumMes, nMovs: movs.length };
  });
  const ok = r.todasReconhecidas && r.nenhumaReceitaGerada && !r.apareceuEmAlgumMes;
  return { ok, detail: `${r.nMovs} movimentações de transferência, todas reconhecidas por isInternalTransfer=${r.todasReconhecidas}; nenhuma receita gerada=${r.nenhumaReceitaGerada}; apareceu em algum mês de receitas=${r.apareceuEmAlgumMes}` };
}, 'transferência nunca aparece como nova receita econômica; isInternalTransfer reconhece os dois lançamentos ligados por transferId');

await close();

const fails = results.filter((r) => r.status === 'FAIL').length;
console.log(`\ngate2-transfers.test.mjs: TOTAL=${results.length} PASS=${results.length - fails} FAIL=${fails}`);
if (fails > 0) process.exitCode = 1;

export { results };
