// Gate 5 (UAT) — correção do achado impeditivo da auditoria Codex sobre o
// resumo de cartão em Despesas (docs/audits/CARDS-INVOICES-UI-AUDIT-FIXES-REVIEW.md,
// base 2074d42, entrega Claude Code 99aa8f8).
//
// Achado: renderDespesasAgrupadas e renderDespesasDetalhadas exibiam
// `g.total` (soma bruta de `_valorParcela`) no resumo por cartão, enquanto
// Cartões / Faturas e o pagamento usam calcByCardForMonth (que aplica
// state.faturasAjustes). Um ajuste manual deixava duas telas com valores
// diferentes pra mesma fatura.
//
// Correção: os dois resumos passam a usar o mesmo total efetivo de
// calcByCardForMonth. Casos permanentes cobertos aqui:
//   1. Visão agrupada (Despesas, sem filtro) mostra o total ajustado.
//   2. Visão detalhada com filtro de status ("pendentes") mostra o total
//      ajustado.
//   3. Fatura com ajuste positivo e NENHUMA compra lançada ainda aparece
//      (não pode sumir nem dizer "nenhuma despesa" enquanto há fatura a
//      pagar) — tanto na visão agrupada quanto na detalhada (filtro de
//      cartão específico e filtro "pendentes").
//   4. O valor de cada compra individual (não exibida na Despesas, mas
//      preservada no backing store) continua intacto — o ajuste nunca altera
//      state.despesas.
import { openHarness, makeRunner, baseSyntheticState } from './harness.mjs';

const { page, loadState, close, consoleErrors } = await openHarness();
const { check, results } = makeRunner('gate5-cards-invoices-adjusted-total');

await page.clock.setFixedTime(new Date(2026, 8, 17, 12)); // 17/09/2026

try {

// ── Caso 1: ajuste com compra lançada ──────────────────────────────────
await check('ADJUSTED_TOTAL_AGRUPADA_MATCHES_INVOICE', async () => {
  await loadState(baseSyntheticState({
    despesas: [{ id: 'compraNu', desc: 'Compra auditada', cat: 'geral', subcat: '', cartao: 'nu',
      conta: null, valor: 150, parcelas: 1, mesInicio: 9, anoInicio: 2026, dataCompra: '2026-09-02',
      fixa: false, pagoMeses: {}, split: [], repasses: {}, createdAt: 'compraNu' }],
    faturasAjustes: { 'nu_2026-09': 155 },
  }));
  const r = await page.evaluate(() => {
    currentMonth = 9; currentYear = 2026;
    navigate('despesas'); // sem filtro: visão agrupada
    const html = document.getElementById('despesasList').innerHTML;
    const totals = getTotalsForMonth(9, 2026);
    return {
      htmlShows155: html.includes('155,00'),
      htmlShows150: html.includes('150,00'),
      byCardNu: totals.byCard.nu,
      compraValorOriginalIntacto: state.despesas.find(d => d.id === 'compraNu').valor,
      compraValorParcelaCalculada: getDespesasForMonth(9, 2026).find(d => d.id === 'compraNu')._valorParcela,
    };
  });
  const ok = r.htmlShows155 && !r.htmlShows150 && r.byCardNu === 155
    && r.compraValorOriginalIntacto === 150 && r.compraValorParcelaCalculada === 150;
  return { ok, detail: `resumo agrupado do cartão deve mostrar o total ajustado (155), nunca a soma bruta (150), coerente com getTotalsForMonth().byCard, sem alterar o valor original nem a parcela calculada da compra individual — obtido=${JSON.stringify(r)}` };
}, 'resumo de cartão (visão agrupada) mostra o total efetivo da fatura após ajuste manual, não a soma bruta das compras');

await check('ADJUSTED_TOTAL_DETALHADA_PENDENTES_MATCHES_INVOICE', async () => {
  const r = await page.evaluate(() => {
    window._despFiltro = 'pendentes';
    navigate('despesas');
    const html = document.getElementById('despesasList').innerHTML;
    return { htmlShows155: html.includes('155,00'), htmlShows150: html.includes('150,00') };
  });
  await page.evaluate(() => { window._despFiltro = 'todas'; });
  const ok = r.htmlShows155 && !r.htmlShows150;
  return { ok, detail: `filtro "pendentes" (visão detalhada) também deve mostrar o total ajustado da fatura, não a soma bruta — obtido=${JSON.stringify(r)}` };
}, 'resumo de cartão no filtro "pendentes" mostra o total efetivo da fatura após ajuste manual');

await check('ADJUSTED_TOTAL_PAYMENT_USES_SAME_VALUE', async () => {
  const r = await page.evaluate(() => {
    navigate('cartoes'); selecionarFaturaCartao('nu');
    const html = document.getElementById('cartaoFaturaResumo').innerHTML;
    return { html155: html.includes('155,00') };
  });
  const ok = r.html155;
  return { ok, detail: `Cartões / Faturas (fonte do pagamento) continua mostrando 155,00 — confirma que Despesas ficou coerente com essa tela, não o contrário — obtido=${JSON.stringify(r)}` };
}, 'Cartões / Faturas continua mostrando o total ajustado (referência de coerência, não regressão)');

// ── Caso 2: ajuste positivo, fatura sem nenhuma compra lançada ──────────
await check('ADJUSTED_TOTAL_NO_PURCHASES_STILL_SHOWN_AGRUPADA', async () => {
  await loadState(baseSyntheticState({
    despesas: [], // nenhuma compra lançada em setembro
    faturasAjustes: { 'nu_2026-09': 80 },
  }));
  const r = await page.evaluate(() => {
    currentMonth = 9; currentYear = 2026;
    navigate('despesas');
    const html = document.getElementById('despesasList').innerHTML;
    return {
      showsEmptyState: /Nenhuma despesa neste mês/.test(html),
      shows80: html.includes('80,00'),
      hasLinkToCartoes: /navigateToDespesasCartao\('nu'\)/.test(html),
    };
  });
  const ok = !r.showsEmptyState && r.shows80 && r.hasLinkToCartoes;
  return { ok, detail: `fatura com ajuste positivo (80) e zero compras lançadas não pode cair no estado vazio "Nenhuma despesa neste mês" — precisa mostrar o resumo do cartão com o valor ajustado e o link pra Cartões / Faturas — obtido=${JSON.stringify(r)}` };
}, 'fatura com ajuste positivo e nenhuma compra lançada ainda aparece no resumo agrupado de Despesas (não é tratada como "sem despesa")');

await check('ADJUSTED_TOTAL_NO_PURCHASES_STILL_SHOWN_PENDENTES', async () => {
  const r = await page.evaluate(() => {
    window._despFiltro = 'pendentes';
    navigate('despesas');
    const html = document.getElementById('despesasList').innerHTML;
    return { showsEmptyState: /Nenhuma despesa neste mês/.test(html), shows80: html.includes('80,00') };
  });
  await page.evaluate(() => { window._despFiltro = 'todas'; });
  const ok = !r.showsEmptyState && r.shows80;
  return { ok, detail: `mesma fatura ajustada sem compras: filtro "pendentes" também precisa mostrar o resumo com 80,00, não "nenhuma despesa" — obtido=${JSON.stringify(r)}` };
}, 'fatura com ajuste positivo e nenhuma compra lançada ainda aparece no filtro "pendentes" de Despesas');

await check('ADJUSTED_TOTAL_NO_PURCHASES_HIDDEN_ON_PAGAS_WHEN_UNPAID', async () => {
  const r = await page.evaluate(() => {
    window._despFiltro = 'pagas';
    navigate('despesas');
    const html = document.getElementById('despesasList').innerHTML;
    return { html80: html.includes('80,00'), showsEmptyState: /Nenhuma despesa neste mês/.test(html) };
  });
  await page.evaluate(() => { window._despFiltro = 'todas'; });
  const ok = !r.html80 && r.showsEmptyState;
  return { ok, detail: `a mesma fatura pendente (ajustada, sem compras) não deve aparecer no filtro "pagas" — nada mais foi pago neste mês, então o estado vazio é o correto aqui — obtido=${JSON.stringify(r)}` };
}, 'fatura ajustada pendente não vaza para o filtro "pagas" (status ainda é respeitado)');

await check('ADJUSTED_TOTAL_NO_PURCHASES_SHOWN_VIA_CARD_FILTER', async () => {
  // despCartaoFiltro só é setado pela UI pra cartões que não são de crédito
  // (navigateToDespesasCartao manda crédito pra Cartões / Faturas — nunca pra
  // Despesas filtrada). Ainda assim renderDespesas() aceita um filtCard de
  // crédito nesse estado (defesa de robustez), e esse caminho precisa se
  // comportar igual aos demais: setar direto, como faria um estado
  // legado/futuro caminho de navegação.
  const r = await page.evaluate(() => {
    despCartaoFiltro = 'nu';
    navigate('despesas');
    const html = document.getElementById('despesasList').innerHTML;
    return { shows80: html.includes('80,00'), showsEmptyState: /Nenhuma despesa neste mês/.test(html) };
  });
  await page.evaluate(() => { clearDespCartaoFiltro(); });
  const ok = r.shows80 && !r.showsEmptyState;
  return { ok, detail: `filtrar Despesas por esse cartão específico também precisa mostrar a fatura ajustada de 80,00, mesmo sem nenhuma compra lançada — obtido=${JSON.stringify(r)}` };
}, 'fatura com ajuste positivo e nenhuma compra lançada aparece ao filtrar Despesas por esse cartão específico');

await check('NO_SCRIPT_ERRORS', async () => ({ ok: consoleErrors.length === 0, detail: `erros de console acumulados: ${JSON.stringify(consoleErrors)}` }), 'nenhum erro de execução ao longo do fluxo de correção do total ajustado');

} finally {
  await close();
}

const fails = results.filter((r) => r.status === 'FAIL').length;
console.log(`gate5-cards-invoices-adjusted-total: TOTAL=${results.length} PASS=${results.length - fails} FAIL=${fails}`);
if (fails > 0) process.exitCode = 1;

export { results };
