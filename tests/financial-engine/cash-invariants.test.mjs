// Cash-impact invariants — CASH-01..03 (named explicitly in the Gate 1 spec)
// plus re-execution of INV-01 through INV-09, INV-11 and INV-12 from the
// audit (INV-10 is explicitly excluded/deferred to a future real-vs-projected
// balance gate, per the Gate 1 authorization). None of these may regress: the
// whole point of this file is proving calcSaldoConta/calcByCardForMonth/
// receitaRecebida still behave exactly as the audit found them to, now that
// getDespesasForMonth is day-aware for new despesas.
import { openHarness, makeRunner, baseSyntheticState } from './harness.mjs';

const { page, loadState, close } = await openHarness();
const { check, results } = makeRunner('cash-invariants');

// ---------------------------------------------------------------------------
// CASH-01/02/03 — the three cash-impact moments named explicitly in the spec
// ---------------------------------------------------------------------------

await check('CASH-01', async () => {
  await loadState(baseSyntheticState());
  const r = await page.evaluate(() => {
    const antes = calcSaldoConta('c1');
    state.despesas.push({ id: 'cash01', desc: 'compra cartao', cat: 'geral', subcat: 'Geral', cartao: 'nu', conta: null,
      valor: 300, parcelas: 1, mesInicio: 9, anoInicio: 2026, dataCompra: '2026-09-02',
      fixa: false, diaVencimento: null, debitoAutomatico: false, pagoMeses: {}, split: [], repasses: {}, createdAt: 'cash01' });
    const depois = calcSaldoConta('c1');
    return { antes, depois };
  });
  return { ok: r.antes === r.depois, detail: `antes=${r.antes} depois de cadastrar a compra=${r.depois}` };
}, 'cadastrar compra no cartão → saldo bancário inalterado');

await check('CASH-02', async () => {
  // despesa from CASH-01 is still in state (falls into fatura de out/2026,
  // dataCompra=02/09 <= fecha 03). Fatura pending (not yet marked paid).
  const r = await page.evaluate(() => {
    const saldo = calcSaldoConta('c1');
    const faturaPendente = !isFaturaPaga('nu', 9, 2026);
    return { saldo, faturaPendente };
  });
  return { ok: r.saldo === 1000 && r.faturaPendente, detail: `saldo=${r.saldo}, fatura de set/2026 pendente=${r.faturaPendente}` };
}, 'fatura pendente (não paga) → saldo bancário inalterado');

await check('CASH-03', async () => {
  const r = await page.evaluate(() => {
    const antes = calcSaldoConta('c1');
    state.faturasPagas[faturaKey('nu', 9, 2026)] = true;
    state.faturasContas[faturaKey('nu', 9, 2026)] = 'c1';
    const depois1 = calcSaldoConta('c1');
    // marking paid again (idempotent, no explicit toggle-off/on) must not
    // reduce the balance a second time.
    state.faturasPagas[faturaKey('nu', 9, 2026)] = true;
    const depois2 = calcSaldoConta('c1');
    return { antes, depois1, depois2 };
  });
  const ok = r.antes === 1000 && r.depois1 === 700 && r.depois2 === 700;
  return { ok, detail: `${JSON.stringify(r)} (esperado 1000,700,700)` };
}, 'pagar fatura → saldo bancário reduz exatamente uma vez (marcar pago de novo não duplica o débito)');

// ---------------------------------------------------------------------------
// INV-02/03/04/05/07/08/11 — ported from the audit's audit_invariants.mjs,
// re-run against the current code to confirm zero regression.
// ---------------------------------------------------------------------------

await check('INV-02', async () => {
  await loadState(baseSyntheticState());
  const r = await page.evaluate(() => {
    state.despesas.push({ id: 'd1', desc: 'x', cat: 'geral', subcat: 'Geral', cartao: 'dinheiro', conta: 'c1',
      valor: 100, parcelas: 1, mesInicio: 9, anoInicio: 2026, fixa: false, diaVencimento: null, debitoAutomatico: false,
      pagoMeses: {}, split: [], repasses: {}, createdAt: 'd1' });
    const s0 = calcSaldoConta('c1');
    togglePago('d1', 9, 2026); const s1 = calcSaldoConta('c1');
    togglePago('d1', 9, 2026); const s2 = calcSaldoConta('c1');
    togglePago('d1', 9, 2026); const s3 = calcSaldoConta('c1');
    return { s0, s1, s2, s3 };
  });
  const ok = r.s0 === 1000 && r.s1 === 900 && r.s2 === 1000 && r.s3 === 900;
  return { ok, detail: `liga/desliga/liga pagamento: ${JSON.stringify(r)} (esperado 1000,900,1000,900)` };
}, 'despesa nunca reduz caixa duas vezes');

await check('INV-03', async () => {
  await loadState(baseSyntheticState());
  const r = await page.evaluate(() => {
    const antes = calcSaldoConta('c1');
    state.despesas.push({ id: 'd2', desc: 'compra cartao', cat: 'geral', subcat: 'Geral', cartao: 'nu', conta: null,
      valor: 300, parcelas: 1, mesInicio: 9, anoInicio: 2026, fixa: false, diaVencimento: null, debitoAutomatico: false,
      pagoMeses: {}, split: [], repasses: {}, createdAt: 'd2' });
    const depois = calcSaldoConta('c1');
    return { antes, depois };
  });
  return r.antes === r.depois;
}, 'compra no cartão não reduz conta bancária no momento da compra');

await check('INV-04', async () => {
  await loadState(baseSyntheticState());
  const r = await page.evaluate(() => {
    state.despesas.push({ id: 'd3', desc: 'compra cartao', cat: 'geral', subcat: 'Geral', cartao: 'nu', conta: null,
      valor: 300, parcelas: 1, mesInicio: 9, anoInicio: 2026, fixa: false, diaVencimento: null, debitoAutomatico: false,
      pagoMeses: {}, split: [], repasses: {}, createdAt: 'd3' });
    const s0 = calcSaldoConta('c1');
    state.faturasPagas[faturaKey('nu', 10, 2026)] = true;
    state.faturasContas[faturaKey('nu', 10, 2026)] = 'c1';
    const s1 = calcSaldoConta('c1');
    state.faturasPagas[faturaKey('nu', 10, 2026)] = true;
    const s2 = calcSaldoConta('c1');
    return { s0, s1, s2 };
  });
  const ok = r.s0 === 1000 && r.s1 === 700 && r.s2 === 700;
  return { ok, detail: `${JSON.stringify(r)} (esperado 1000,700,700)` };
}, 'pagamento da fatura reduz caixa exatamente uma vez');

await check('INV-05', async () => {
  await loadState(baseSyntheticState());
  const r = await page.evaluate(() => {
    state.despesas.push({ id: 'd4', desc: 'parcelada', cat: 'geral', subcat: 'Geral', cartao: 'nu', conta: null,
      valor: 100, parcelas: 3, mesInicio: 9, anoInicio: 2026, fixa: false, diaVencimento: null, debitoAutomatico: false,
      pagoMeses: {}, split: [], repasses: {}, createdAt: 'd4' });
    const soma = calcByCardForMonth(10, 2026).nu + calcByCardForMonth(11, 2026).nu + calcByCardForMonth(12, 2026).nu;
    return { soma };
  });
  return Math.abs(r.soma - 100) < 0.01;
}, 'soma das parcelas == total original');

await check('INV-06', async () => {
  await loadState(baseSyntheticState());
  const r = await page.evaluate(() => {
    state.despesas.push({ id: 'd6b', desc: 'x', cat: 'geral', subcat: 'Geral', cartao: 'dinheiro', conta: 'c1',
      valor: 40, parcelas: 1, mesInicio: 6, anoInicio: 2026, fixa: false, diaVencimento: null, debitoAutomatico: false,
      pagoMeses: { [mesKey(6, 2026)]: true }, split: [], repasses: {}, createdAt: 'd6b' });
    const before = { currentMonth, currentYear };
    currentMonth = 6; currentYear = 2026;
    const saldoJun = calcSaldoConta('c1');
    currentMonth = 12; currentYear = 2027;
    const saldoDez = calcSaldoConta('c1');
    currentMonth = before.currentMonth; currentYear = before.currentYear;
    return { saldoJun, saldoDez };
  });
  return { ok: r.saldoJun === r.saldoDez, detail: `saldo real com currentMonth=jun/2026: ${r.saldoJun}; com currentMonth=dez/2027: ${r.saldoDez}` };
}, 'saldo real (calcSaldoConta) não depende de qual mês está sendo exibido no Dashboard');

await check('INV-07', async () => {
  await loadState(baseSyntheticState());
  const r = await page.evaluate(() => {
    state.despesas.push({ id: 'd5', desc: 'x', cat: 'geral', subcat: 'Geral', cartao: 'dinheiro', conta: 'c1',
      valor: 50, parcelas: 1, mesInicio: 9, anoInicio: 2026, fixa: false, diaVencimento: null, debitoAutomatico: false,
      pagoMeses: {}, split: [], repasses: {}, createdAt: 'd5' });
    const snapshotAntes = JSON.stringify(state.despesas);
    for (let i = 0; i < 12; i++) { currentMonth = 1 + ((8 + i) % 12); currentYear = 2026 + Math.floor((8 + i) / 12); renderAll(); }
    const snapshotDepois = JSON.stringify(state.despesas);
    return { igual: snapshotAntes === snapshotDepois };
  });
  return r.igual;
}, 'navegar para um mês futuro (e voltar) não altera dados');

await check('INV-08', async () => {
  await loadState(baseSyntheticState());
  const r = await page.evaluate(() => {
    state.despesas.push({ id: 'd6', desc: 'x', cat: 'geral', subcat: 'Geral', cartao: 'dinheiro', conta: 'c1',
      valor: 50, parcelas: 1, mesInicio: 6, anoInicio: 2026, fixa: false, diaVencimento: null, debitoAutomatico: false,
      pagoMeses: { [mesKey(6, 2026)]: true }, split: [], repasses: {}, createdAt: 'd6' });
    const passadoAntes = getTotalsForMonth(6, 2026).saldoPiorCenario;
    calcProjecaoFutura(12, 2026);
    calcProjecaoFutura(12, 2027);
    const passadoDepois = getTotalsForMonth(6, 2026).saldoPiorCenario;
    return { passadoAntes, passadoDepois };
  });
  return r.passadoAntes === r.passadoDepois;
}, 'previsões (calcProjecaoFutura) não podem alterar histórico (mês passado)');

await check('INV-09', async () => {
  await loadState(baseSyntheticState());
  const r = await page.evaluate(() => {
    state.receitas.push({ id: 'r9', desc: 'receita futura prevista', tipo: 'outro', valor: 500, mes: 11, ano: 2026,
      recorrente: false, conta: 'c1', recebidaMeses: {} });
    const saldoAntes = calcSaldoConta('c1');
    const previstas = getReceitasPrevistasForMonth(11, 2026).some((r) => r.id === 'r9');
    const efetivas = getReceitasEfetivasForMonth(11, 2026).some((r) => r.id === 'r9');
    return { saldoAntes, previstas, efetivas };
  });
  const ok = r.saldoAntes === 1000 && r.previstas === true && r.efetivas === false;
  return { ok, detail: `saldo com receita só prevista (não recebida)=${r.saldoAntes}, aparece em previstas=${r.previstas}, aparece em efetivas=${r.efetivas}` };
}, 'receita prevista não é receita recebida — não entra no saldo real até ser marcada como recebida');

await check('INV-11', async () => {
  await loadState(baseSyntheticState());
  const r = await page.evaluate(() => {
    state.despesas.push({ id: 'd7', desc: 'x', cat: 'geral', subcat: 'Geral', cartao: 'nu', conta: null,
      valor: 100, parcelas: 1, mesInicio: 9, anoInicio: 2026, fixa: false, diaVencimento: null, debitoAutomatico: false,
      pagoMeses: {}, split: [], repasses: {}, createdAt: 'd7' });
    let count = 0;
    for (let m = 1; m <= 12; m++) { if (getDespesasForMonth(m, 2026).find((x) => x.id === 'd7')) count++; }
    return { count };
  });
  return r.count === 1;
}, 'uma compra pertence a exatamente uma competência de fatura por cartão');

// ---------------------------------------------------------------------------
// INV-01 — receita nunca aumenta caixa duas vezes (toggleReceitaRecebida
// liga/desliga/liga, mirroring INV-02's despesa version).
// ---------------------------------------------------------------------------
await check('INV-01', async () => {
  await loadState(baseSyntheticState());
  const r = await page.evaluate(() => {
    state.receitas.push({ id: 'r1', desc: 'receita extra', tipo: 'outro', valor: 250, mes: 9, ano: 2026,
      recorrente: false, conta: 'c1', recebidaMeses: {} });
    currentMonth = 9; currentYear = 2026;
    const s0 = calcSaldoConta('c1');
    toggleReceitaRecebida('r1'); const s1 = calcSaldoConta('c1');
    toggleReceitaRecebida('r1'); const s2 = calcSaldoConta('c1');
    toggleReceitaRecebida('r1'); const s3 = calcSaldoConta('c1');
    return { s0, s1, s2, s3 };
  });
  const ok = r.s0 === 1000 && r.s1 === 1250 && r.s2 === 1000 && r.s3 === 1250;
  return { ok, detail: `liga/desliga/liga recebimento: ${JSON.stringify(r)} (esperado 1000,1250,1000,1250)` };
}, 'receita nunca aumenta caixa duas vezes');

// ---------------------------------------------------------------------------
// INV-12 — importar dados antigos não reinterpreta o histórico silenciosamente.
// A audit flagged this as "OK hoje / RISCO CRÍTICO na migração futura": this
// check is exactly what protects it going forward — a legacy despesa's
// invoice competência must be stable across repeated imports/migrations of
// the SAME data, with no code path that back-fills a real date for it.
// ---------------------------------------------------------------------------
await check('INV-12', async () => {
  const raw = baseSyntheticState({
    despesas: [
      { id: 'inv12', desc: 'antiga', cat: 'geral', subcat: 'Geral', cartao: 'nu', conta: null, valor: 90, parcelas: 1, mesInicio: 5, anoInicio: 2026, fixa: false, diaVencimento: null, debitoAutomatico: false, pagoMeses: {}, split: [], repasses: {}, createdAt: 'inv12' },
    ],
  });
  const competenciasAoLongoDeVariasImportacoes = [];
  for (let i = 0; i < 3; i++) {
    await loadState(raw);
    const c = await page.evaluate(() => {
      const d = state.despesas.find((x) => x.id === 'inv12');
      return { dataCompra: d.dataCompra, ...getCompetenciaFatura(d.dataCompra, state.cards.find((c) => c.id === d.cartao), d.mesInicio, d.anoInicio) };
    });
    competenciasAoLongoDeVariasImportacoes.push(c);
  }
  const [first, ...rest] = competenciasAoLongoDeVariasImportacoes;
  const stable = rest.every((c) => c.mes === first.mes && c.ano === first.ano && c.dataCompra === first.dataCompra);
  return { ok: stable && first.dataCompra === null, detail: JSON.stringify(competenciasAoLongoDeVariasImportacoes) };
}, 'importar os mesmos dados antigos repetidamente não reinterpreta o histórico (competência e dataCompra=null estáveis em toda reimportação)');

await close();

const fails = results.filter((r) => r.status === 'FAIL').length;
console.log(`\ncash-invariants.test.mjs: TOTAL=${results.length} PASS=${results.length - fails} FAIL=${fails}`);
if (fails > 0) process.exitCode = 1;

export { results };
