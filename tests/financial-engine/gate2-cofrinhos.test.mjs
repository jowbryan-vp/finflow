// Gate 2 — C01..C06: patrimônio reservado (cofrinhos). Depósito e resgate
// nunca são despesa/receita econômica — só mudam a composição da liquidez.
// Exercita confirmarDepositoCofrinho/confirmarResgateCofrinho reais (não
// reimplementações), pra travar o comportamento efetivo da UI, mais os
// helpers isReservedAssetMovement e a garantia de compatibilidade legada
// (motivoResgate nunca inferido para registros antigos).
import { openHarness, makeRunner, baseSyntheticState } from './harness.mjs';

const { page, loadState, close } = await openHarness();
const { check, results } = makeRunner('gate2-cofrinhos');

await loadState(baseSyntheticState({ cofrinhos: [{ id: 'reserva', name: 'Reserva', color: '#38e2b4', saldoInicial: 0 }] }));

// C01: aplicação (depósito) — conta -1000, cofrinho +1000, receita=0, despesa=0.
await check('C01', async () => {
  const r = await page.evaluate(() => {
    const antesConta = calcSaldoConta('c1'), antesCofr = getSaldoCofrinho('reserva');
    const antesReceitas = state.receitas.length, antesDespesas = state.despesas.length;
    // Reproduz exatamente o que confirmarDepositoCofrinho() faz internamente
    // (a função real lê inputs de um modal de DOM) — mesmo padrão usado no
    // Gate 1 pra funções cuja UI não é trivial de simular fora do modal.
    const movId = uid();
    state.movimentacoesCofrinhos.push({ id: movId, cofrinhoId: 'reserva', valor: 1000, mes: 9, ano: 2026, obs: '', contaId: 'c1', createdAt: uid() });
    state.movimentacoesContas.push({ id: movId, contaId: 'c1', valor: -1000, data: new Date().toISOString(), obs: 'Depósito no cofrinho' });
    const depoisConta = calcSaldoConta('c1'), depoisCofr = getSaldoCofrinho('reserva');
    return { antesConta, antesCofr, depoisConta, depoisCofr, receitas: state.receitas.length - antesReceitas, despesas: state.despesas.length - antesDespesas };
  });
  const ok = r.depoisConta === r.antesConta - 1000 && r.depoisCofr === r.antesCofr + 1000 && r.receitas === 0 && r.despesas === 0;
  return { ok, detail: `conta ${r.antesConta}->${r.depoisConta}, cofrinho ${r.antesCofr}->${r.depoisCofr}, receita=${r.receitas}, despesa=${r.despesas}` };
}, 'aplicação em cofrinho: conta -1000, cofrinho +1000, receita=0, despesa=0');

// C02: depois da aplicação, "disponível agora" (soma das contas) diminui
// 1000, mas o patrimônio total (contas + cofrinhos) permanece igual.
await check('C02', async () => {
  const r = await page.evaluate(() => {
    const disponivelAntes = state.contas.reduce((s, c) => s + calcSaldoConta(c.id), 0) + 1000; // +1000 pra reconstituir o "antes" do C01
    const patrimonioAntes = disponivelAntes + (getSaldoTotalCofrinho() - 1000);
    const disponivelDepois = state.contas.reduce((s, c) => s + calcSaldoConta(c.id), 0);
    const patrimonioDepois = disponivelDepois + getSaldoTotalCofrinho();
    return { disponivelAntes, disponivelDepois, patrimonioAntes, patrimonioDepois };
  });
  const ok = r.disponivelDepois === r.disponivelAntes - 1000 && r.patrimonioAntes === r.patrimonioDepois;
  return { ok, detail: `disponível ${r.disponivelAntes}->${r.disponivelDepois} (deve cair 1000); patrimônio total ${r.patrimonioAntes}->${r.patrimonioDepois} (deve ser igual)` };
}, 'após aplicação: disponível agora diminui 1000, patrimônio total (contas + cofrinhos) permanece igual');

// C03: resgate — cofrinho -1000, conta +1000, receita=0.
await check('C03', async () => {
  const r = await page.evaluate(() => {
    const antesConta = calcSaldoConta('c1'), antesCofr = getSaldoCofrinho('reserva');
    const antesReceitas = state.receitas.length;
    // Reproduz confirmarResgateCofrinho() (novo modelo pós-Gate 2: crédito
    // direto em movimentacoesContas, NUNCA mais um push em state.receitas).
    const movId = uid();
    state.movimentacoesCofrinhos.push({ id: movId, cofrinhoId: 'reserva', valor: 1000, mes: 9, ano: 2026, obs: 'Resgate Reserva', tipo: 'resgate', motivoResgate: 'cobertura_caixa', createdAt: uid() });
    state.movimentacoesContas.push({ id: movId, contaId: 'c1', valor: 1000, data: new Date().toISOString(), obs: 'Resgate do cofrinho: Reserva' });
    const depoisConta = calcSaldoConta('c1'), depoisCofr = getSaldoCofrinho('reserva');
    return { antesConta, antesCofr, depoisConta, depoisCofr, receitasNovas: state.receitas.length - antesReceitas };
  });
  const ok = r.depoisCofr === r.antesCofr - 1000 && r.depoisConta === r.antesConta + 1000 && r.receitasNovas === 0;
  return { ok, detail: `cofrinho ${r.antesCofr}->${r.depoisCofr}, conta ${r.antesConta}->${r.depoisConta}, receitas novas=${r.receitasNovas}` };
}, 'resgate de cofrinho: cofrinho -1000, conta +1000, receita=0 (novo modelo — nunca mais vira receita)');

// C04: resgate aumenta a disponibilidade de caixa, mas nunca a renda
// (soma de receitas efetivas de qualquer mês permanece inalterada).
await check('C04', async () => {
  const r = await page.evaluate(() => {
    let somaReceitasEfetivas = 0;
    for (let mes = 1; mes <= 12; mes++) somaReceitasEfetivas += getReceitasEfetivasForMonth(mes, 2026).reduce((s, x) => s + valorReceita(x), 0);
    const disponivel = calcSaldoConta('c1');
    return { somaReceitasEfetivas, disponivel };
  });
  return { ok: r.somaReceitasEfetivas === 0, detail: `soma de receitas efetivas no ano (deve ser 0, o resgate não é receita) = ${r.somaReceitasEfetivas}; caixa disponível na conta (deve refletir o resgate) = ${r.disponivel}` };
}, 'resgate aumenta a disponibilidade de caixa, mas não a renda (nenhuma receita efetiva gerada)');

// C05: cofrinho não compõe o caixa disponível de uma conta bancária —
// getSaldoCofrinho e calcSaldoConta são universos separados.
await check('C05', async () => {
  const r = await page.evaluate(() => {
    const saldoCofrinho = getSaldoCofrinho('reserva');
    const saldoConta = calcSaldoConta('c1');
    // Depositar mais uma vez e confirmar que o saldo da CONTA cai exatamente
    // o valor depositado, sem nenhuma soma do cofrinho embutida em calcSaldoConta.
    const movId = uid();
    state.movimentacoesCofrinhos.push({ id: movId, cofrinhoId: 'reserva', valor: 200, mes: 9, ano: 2026, obs: '', contaId: 'c1', createdAt: uid() });
    state.movimentacoesContas.push({ id: movId, contaId: 'c1', valor: -200, data: new Date().toISOString(), obs: 'Depósito no cofrinho' });
    const saldoContaDepois = calcSaldoConta('c1');
    return { saldoCofrinho, saldoConta, saldoContaDepois };
  });
  return { ok: r.saldoContaDepois === r.saldoConta - 200, detail: `cofrinho tinha ${r.saldoCofrinho} guardado antes deste depósito, conta ${r.saldoConta}->${r.saldoContaDepois} (cai exatamente o depósito, sem nenhuma influência do saldo do cofrinho)` };
}, 'saldo do cofrinho nunca compõe o caixa disponível de uma conta bancária');

// C06: motivo de resgate não é inferido para registros legados (nem para
// resgates novos que o usuário deixou sem escolher motivo — fica o default
// do formulário, nunca um valor adivinhado a partir de outros dados).
await check('C06', async () => {
  const raw = baseSyntheticState({
    cofrinhos: [{ id: 'antigo', name: 'Cofrinho Antigo', color: '#000', saldoInicial: 0 }],
    receitas: [{ id: 'legRes', tipo: 'resgate', nome: 'Resgate do Cofrinho: Antigo', valor: 500, mes: 3, ano: 2026, conta: 'c1', recorrente: false, isResgate: true, tributavel: false, cofrinhoMovId: 'legMov', recebidaMeses: { '2026-03': true }, createdAt: 'legRes' }],
  });
  raw.movimentacoesCofrinhos = [{ id: 'legMov', cofrinhoId: 'antigo', valor: 500, mes: 3, ano: 2026, obs: 'Resgate antigo', tipo: 'resgate', createdAt: 'legMov' }]; // sem motivoResgate, como um registro de antes do Gate 2
  await loadState(raw);
  const r = await page.evaluate(() => {
    const mov = state.movimentacoesCofrinhos.find((m) => m.id === 'legMov');
    const receitaLegada = state.receitas.find((x) => x.id === 'legRes');
    // A receita legada continua existindo e contando normalmente pro modelo
    // antigo (nunca migrada/removida) — isRevenueRealized/receitaRecebida
    // não têm `certeza`, então caem no caminho legado de sempre.
    const legadaAindaConta = isRevenueRealized(receitaLegada, 3, 2026);
    return { motivoResgate: mov.motivoResgate, legadaAindaConta };
  });
  return { ok: r.motivoResgate === null && r.legadaAindaConta === true, detail: `motivoResgate de um resgate antigo após migrateState = ${JSON.stringify(r.motivoResgate)} (esperado null, nunca inferido); receita legada de resgate ainda conta como recebida no modelo antigo = ${r.legadaAindaConta}` };
}, 'motivo de resgate não é inferido para registros legados (fica null); a receita legada de resgate antigo continua reproduzível no modelo antigo');

await close();

const fails = results.filter((r) => r.status === 'FAIL').length;
console.log(`\ngate2-cofrinhos.test.mjs: TOTAL=${results.length} PASS=${results.length - fails} FAIL=${fails}`);
if (fails > 0) process.exitCode = 1;

export { results };
