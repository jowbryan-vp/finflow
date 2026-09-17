// Gate 2 — seção 39: fixtures representativas dos padrões reais observados,
// sem dados pessoais. Dois padrões exigidos explicitamente pelo enunciado:
//   1. salário recebido no fim do mês financiando obrigações do início do
//      mês seguinte (sem que o salário em si seja deslocado de competência);
//   2. reserva → resgate → conta disponível → pagamento de obrigação, onde
//      o resgate nunca aparece como renda gerada em nenhum ponto do caminho.
import { openHarness, makeRunner, baseSyntheticState } from './harness.mjs';

const { page, loadState, close } = await openHarness();
const { check, results } = makeRunner('gate2-real-patterns');

// Padrão 1: salário recebido em 28/08 financia uma despesa fixa em
// Dinheiro/PIX com vencimento em 05/09. O salário conta como caixa de
// agosto (não é deslocado); a despesa de setembro só pode ser paga porque o
// saldo acumulado (incluindo o salário de agosto) cobre ela — isso é uma
// questão de SALDO ACUMULADO, não de a receita "pertencer" a setembro.
await check('padrao-salario-financia-mes-seguinte', async () => {
  await loadState(baseSyntheticState({ contas: [{ id: 'c1', name: 'Conta 1', color: '#5b7fff', saldoInicial: 200 }] }));
  const r = await page.evaluate(() => {
    // Salário recorrente novo modelo, recebido em 28/08.
    state.receitas.push({ id: 'salReal', tipo: 'salario', nome: 'Salário', valor: 4000, mes: 8, ano: 2026,
      competenciaMes: 8, competenciaAno: 2026, conta: 'c1', certeza: 'recorrente',
      recorrencia: { type: 'last_weekday_of_month', weekday: 5 },
      recebidoPorMes: { '2026-08': { estado: 'recebido', dataRecebimento: '2026-08-28' } }, createdAt: 'salReal' });
    const saldoFimAgosto = calcSaldoConta('c1');

    // Despesa fixa em dinheiro, vencimento em setembro, paga com esse saldo.
    state.despesas.push({ id: 'obrigSetembro', desc: 'Aluguel', cat: 'geral', subcat: 'Geral', cartao: 'dinheiro', conta: 'c1',
      valor: 1500, parcelas: 1, mesInicio: 9, anoInicio: 2026, fixa: true, diaVencimento: 5, debitoAutomatico: false,
      pagoMeses: {}, split: [], repasses: {}, createdAt: 'obrigSetembro' });
    togglePago('obrigSetembro', 9, 2026);
    const saldoAposPagar = calcSaldoConta('c1');

    // O salário em si continua pertencendo a agosto — nunca "torna-se"
    // receita de setembro por ter financiado uma obrigação de setembro.
    const salarioAindaEmAgosto = receitaRecebida(getReceitasForMonth(8, 2026).find((x) => x.id === 'salReal'), 8, 2026);
    const salarioApareceComoRecebidoEmSetembro = receitaRecebida(getReceitasForMonth(9, 2026).find((x) => x.id === 'salReal') || {}, 9, 2026);

    return { saldoFimAgosto, saldoAposPagar, salarioAindaEmAgosto, salarioApareceComoRecebidoEmSetembro };
  });
  const ok = r.saldoFimAgosto === 4200 && r.saldoAposPagar === 2700 && r.salarioAindaEmAgosto === true && r.salarioApareceComoRecebidoEmSetembro === false;
  return { ok, detail: JSON.stringify(r) };
}, 'salário recebido em 28/08 financia uma obrigação com vencimento em 09/09, sem que o salário seja reinterpretado como receita de setembro');

// Padrão 2: reserva → resgate → conta disponível → pagamento de obrigação.
// Em nenhum ponto do caminho o resgate aparece como renda.
await check('padrao-resgate-cobre-deficit', async () => {
  await loadState(baseSyntheticState({
    contas: [{ id: 'c1', name: 'Conta 1', color: '#5b7fff', saldoInicial: 100 }],
    cofrinhos: [{ id: 'reserva', name: 'Reserva de Emergência', color: '#38e2b4', saldoInicial: 0 }],
  }));
  const r = await page.evaluate(() => {
    const receitasAntes = state.receitas.length;

    // 1) Reserva: 2000 guardados ao longo do tempo.
    const movDep = uid();
    state.movimentacoesCofrinhos.push({ id: movDep, cofrinhoId: 'reserva', valor: 2000, mes: 3, ano: 2026, contaId: 'c1', createdAt: uid() });
    state.movimentacoesContas.push({ id: movDep, contaId: 'c1', valor: -2000, data: '2026-03-10T00:00:00.000Z', obs: 'Depósito no cofrinho' });

    // 2) Obrigação grande chega (despesa fixa em dinheiro) maior que o saldo disponível.
    state.despesas.push({ id: 'obrigGrande', desc: 'Conserto do carro', cat: 'geral', subcat: 'Geral', cartao: 'dinheiro', conta: 'c1',
      valor: 1500, parcelas: 1, mesInicio: 9, anoInicio: 2026, fixa: false, diaVencimento: null, debitoAutomatico: false,
      pagoMeses: {}, split: [], repasses: {}, createdAt: 'obrigGrande' });
    const saldoAntesResgate = calcSaldoConta('c1'); // 100 - 2000(depósito) = -1900, insuficiente pra pagar 1500

    // 3) Resgate de cobertura de caixa: reserva -> conta disponível.
    const movRes = uid();
    state.movimentacoesCofrinhos.push({ id: movRes, cofrinhoId: 'reserva', valor: 1500, mes: 9, ano: 2026, tipo: 'resgate', motivoResgate: 'cobertura_caixa', createdAt: uid() });
    state.movimentacoesContas.push({ id: movRes, contaId: 'c1', valor: 1500, data: '2026-09-01T00:00:00.000Z', obs: 'Resgate do cofrinho: Reserva de Emergência' });
    const saldoAposResgate = calcSaldoConta('c1');
    const receitasAposResgate = state.receitas.length;

    // 4) Pagamento da obrigação com o dinheiro resgatado.
    togglePago('obrigGrande', 9, 2026);
    const saldoAposPagar = calcSaldoConta('c1');
    const receitasFinal = state.receitas.length;

    return { receitasAntes, saldoAntesResgate, saldoAposResgate, receitasAposResgate, saldoAposPagar, receitasFinal, saldoCofrinhoFinal: getSaldoCofrinho('reserva') };
  });
  const ok = r.receitasAntes === r.receitasAposResgate && r.receitasAposResgate === r.receitasFinal
    && r.saldoAposResgate === r.saldoAntesResgate + 1500
    && r.saldoAposPagar === r.saldoAposResgate - 1500
    && r.saldoCofrinhoFinal === 500;
  return { ok, detail: JSON.stringify(r) };
}, 'reserva → resgate (cobertura de caixa) → conta disponível → pagamento da obrigação, sem que o resgate apareça como renda gerada em nenhum ponto');

await close();

const fails = results.filter((r) => r.status === 'FAIL').length;
console.log(`\ngate2-real-patterns.test.mjs: TOTAL=${results.length} PASS=${results.length - fails} FAIL=${fails}`);
if (fails > 0) process.exitCode = 1;

export { results };
