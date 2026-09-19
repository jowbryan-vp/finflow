// Gate 5 (UAT) — correção dos 4 achados da auditoria Codex sobre "Cartões /
// Faturas" (docs/audits/CARDS-INVOICES-UI-REVIEW.md, base cbb6e55,
// implementação d87a925). Casos permanentes, um por achado:
//   1. Despesas não deve mais listar item-a-item nem oferecer "Pagar fatura"
//      pra compra no crédito — vira um resumo com link pra Cartões/Faturas,
//      sem esconder o total.
//   2. Nova compra no cartão não pode ser fixa E parcelada ao mesmo tempo.
//   3. Nova compra no cartão exige data de compra válida (nunca cai no
//      fallback legado "mês + 1" silenciosamente).
//   4. Fatura sem valor não pode ser marcada como paga; desmarcar um estado
//      antigo continua possível.
import { openHarness, makeRunner, baseSyntheticState } from './harness.mjs';

const { page, loadState, close, consoleErrors } = await openHarness();
const { check, results } = makeRunner('gate5-cards-invoices-audit-fixes');

await page.clock.setFixedTime(new Date(2026, 8, 17, 12)); // 17/09/2026

try {
// ── Achado 1 ────────────────────────────────────────────────────────────
await check('AUDIT1_DESPESAS_NO_ITEM_NO_PAY_BUTTON', async () => {
  await loadState(baseSyntheticState());
  const r = await page.evaluate(() => {
    state.despesas = [{ id: 'compraNu', desc: 'Compra auditada', cat: 'geral', subcat: '', cartao: 'nu',
      conta: null, valor: 150, parcelas: 1, mesInicio: 9, anoInicio: 2026, dataCompra: '2026-09-02',
      fixa: false, pagoMeses: {}, split: [], repasses: {}, createdAt: 'compraNu' }];
    currentMonth = 9; currentYear = 2026;
    navigate('despesas');
    const html = document.getElementById('despesasList').innerHTML;
    return {
      htmlIncludesCredit: html.includes('Compra auditada'),
      htmlIncludesPayInvoice: /Pagar fatura/.test(html),
      totalStillVisible: html.includes('150,00') || html.includes('R$ 150,00'),
      hasLinkToCartoes: /navigateToDespesasCartao\('nu'\)/.test(html),
    };
  });
  const ok = !r.htmlIncludesCredit && !r.htmlIncludesPayInvoice && r.totalStillVisible && r.hasLinkToCartoes;
  return { ok, detail: `Despesas (visão agrupada) não deve listar a compra em crédito nem "Pagar fatura", mas o total do cartão deve continuar visível com link pra Cartões / Faturas — obtido=${JSON.stringify(r)}` };
}, 'Despesas não lista compra no crédito nem oferece pagar fatura; total continua visível com link');

await check('AUDIT1_DESPESAS_DETALHADA_STATUS_FILTER', async () => {
  const r = await page.evaluate(() => {
    // Filtro "pendentes" mistura cartão e dinheiro (renderDespesasDetalhadas).
    window._despFiltro = 'pendentes';
    navigate('despesas');
    const html = document.getElementById('despesasList').innerHTML;
    return {
      htmlIncludesCreditItem: html.includes('Compra auditada'),
      htmlIncludesEditButtonForCredit: /abrirEdicaoDespesaNaAreaCerta\('compraNu'\)/.test(html),
      hasResumoCartao: /navigateToDespesasCartao\('nu'\)/.test(html) && html.includes('150,00'),
    };
  });
  await page.evaluate(() => { window._despFiltro = 'todas'; });
  const ok = !r.htmlIncludesCreditItem && !r.htmlIncludesEditButtonForCredit && r.hasResumoCartao;
  return { ok, detail: `mesmo no filtro "pendentes" (que mistura cartão+dinheiro), a compra no crédito não deve virar uma linha item-a-item com editar — só um resumo com o mesmo total, sem esconder nada — obtido=${JSON.stringify(r)}` };
}, 'filtro de status em Despesas também resume (não lista) compras no crédito, sem esconder o total');

await check('AUDIT1_DASHBOARD_LINK_STILL_REACHES_CARTOES', async () => {
  const r = await page.evaluate(() => {
    navigateToDespesasCartao('nu');
    return { pagina: document.querySelector('.nav-item.active')?.dataset?.page, cartao: window._faturaCartaoSelecionado };
  });
  const ok = r.pagina === 'cartoes' && r.cartao === 'nu';
  return { ok, detail: `link de fatura do Dashboard continua levando a Cartões / Faturas com o cartão certo (não regressão) — obtido=${JSON.stringify(r)}` };
}, 'link de fatura do Dashboard não regrediu com o ajuste de Despesas');

// ── Achado 2 ────────────────────────────────────────────────────────────
await check('AUDIT2_FIXA_AND_INSTALLMENTS_REJECTED', async () => {
  await loadState(baseSyntheticState());
  const r = await page.evaluate(() => {
    currentMonth = 9; currentYear = 2026;
    navigate('cartoes');
    openNovaCompraCartao();
    document.getElementById('nDespDesc').value = 'Fixa parcelada invalida';
    document.getElementById('nDespValor').value = '300';
    document.getElementById('nDespCartao').value = 'nu';
    document.getElementById('nDespDataCompra').value = '2026-09-02';
    document.getElementById('nDespFixa').checked = true; // sem disparar onchange: simula bypass da UI
    document.getElementById('nDespParcelas').value = '3';
    const before = JSON.stringify(state.despesas);
    salvarNovaCompraCartao();
    return { rejeitou: JSON.stringify(state.despesas) === before, qtdDespesas: state.despesas.length };
  });
  const ok = r.rejeitou && r.qtdDespesas === 0;
  return { ok, detail: `salvar com fixa=true e parcelas=3 (mesmo contornando o onchange da UI) deve ser rejeitado, sem gravar nada — obtido=${JSON.stringify(r)}` };
}, 'nova compra no cartão nunca grava fixa=true junto com parcelas>1, mesmo chamando salvar diretamente');

await check('AUDIT2_FIXA_CHECKBOX_FORCES_SINGLE_INSTALLMENT', async () => {
  const r = await page.evaluate(() => {
    openNovaCompraCartao();
    document.getElementById('nDespParcelas').value = '5';
    document.getElementById('nDespFixa').checked = true;
    nOnFixaChange();
    return { parcelasValue: document.getElementById('nDespParcelas').value, disabled: document.getElementById('nDespParcelas').disabled };
  });
  const ok = r.parcelasValue === '1' && r.disabled === true;
  return { ok, detail: `marcar "Despesa fixa" deve forçar parcelas=1 e desabilitar o campo, igual ao formulário legado de Despesas — obtido=${JSON.stringify(r)}` };
}, 'marcar fixa no formulário novo força 1 parcela e desabilita o campo (mesma UX legada)');

await check('AUDIT2_FIXED_CARD_PURCHASE_STILL_ALLOWED', async () => {
  const r = await page.evaluate(() => {
    openNovaCompraCartao();
    document.getElementById('nDespDesc').value = 'Assinatura fixa no cartão';
    document.getElementById('nDespValor').value = '40';
    document.getElementById('nDespCartao').value = 'nu';
    document.getElementById('nDespDataCompra').value = '2026-09-02';
    document.getElementById('nDespFixa').checked = true;
    nOnFixaChange();
    salvarNovaCompraCartao();
    const d = state.despesas.find(x => x.desc === 'Assinatura fixa no cartão');
    return { criada: !!d, fixa: d?.fixa, parcelas: d?.parcelas };
  });
  const ok = r.criada && r.fixa === true && r.parcelas === 1;
  return { ok, detail: `uma despesa fixa no cartão (ex: assinatura) com 1 parcela continua sendo um caso válido — obtido=${JSON.stringify(r)}` };
}, 'despesa fixa no cartão com uma única parcela continua sendo aceita (exclusão é só fixa+parcelado)');

// ── Achado 3 ────────────────────────────────────────────────────────────
await check('AUDIT3_MISSING_DATE_REJECTED_NO_MUTATION', async () => {
  await loadState(baseSyntheticState());
  const r = await page.evaluate(() => {
    currentMonth = 9; currentYear = 2026;
    navigate('cartoes');
    openNovaCompraCartao();
    document.getElementById('nDespDesc').value = 'Sem data';
    document.getElementById('nDespValor').value = '100';
    document.getElementById('nDespCartao').value = 'nu';
    document.getElementById('nDespDataCompra').value = ''; // usuário apaga a data
    const before = JSON.stringify(state.despesas);
    salvarNovaCompraCartao();
    return { rejeitou: JSON.stringify(state.despesas) === before, qtdDespesas: state.despesas.length, modalAindaAberto: document.getElementById('modalOverlay').classList.contains('open') };
  });
  const ok = r.rejeitou && r.qtdDespesas === 0 && r.modalAindaAberto;
  return { ok, detail: `apagar a data da compra e salvar deve ser rejeitado sem gravar nada (nunca cair no fallback legado "mês + 1" silenciosamente) — obtido=${JSON.stringify(r)}` };
}, 'compra nova no cartão sem data de compra é rejeitada, sem mutação e sem cair no fallback legado');

await check('AUDIT3_INVALID_DATE_REJECTED', async () => {
  const r = await page.evaluate(() => {
    document.getElementById('nDespDataCompra').value = '2026-02-31'; // data inválida (fevereiro não tem 31)
    const before = JSON.stringify(state.despesas);
    salvarNovaCompraCartao();
    return { rejeitou: JSON.stringify(state.despesas) === before };
  });
  const ok = r.rejeitou;
  return { ok, detail: `data de compra inválida (ex: 31/02) também deve ser rejeitada — obtido=${JSON.stringify(r)}` };
}, 'compra nova no cartão com data inválida é rejeitada');

await check('AUDIT3_VALID_DATE_ACCEPTED', async () => {
  const r = await page.evaluate(() => {
    document.getElementById('nDespDataCompra').value = '2026-09-02';
    salvarNovaCompraCartao();
    const d = state.despesas.find(x => x.desc === 'Sem data');
    return { criada: !!d, dataCompra: d?.dataCompra, mesInicio: d?.mesInicio, anoInicio: d?.anoInicio };
  });
  const ok = r.criada && r.dataCompra === '2026-09-02' && r.mesInicio === 9 && r.anoInicio === 2026;
  return { ok, detail: `com uma data válida preenchida, a compra deve ser criada normalmente com dataCompra/mesInicio/anoInicio coerentes — obtido=${JSON.stringify(r)}` };
}, 'compra nova no cartão com data válida é criada normalmente');

// ── Achado 4 ────────────────────────────────────────────────────────────
await check('AUDIT4_EMPTY_INVOICE_CANNOT_BE_PAID', async () => {
  await loadState(baseSyntheticState());
  const r = await page.evaluate(() => {
    currentMonth = 9; currentYear = 2026;
    navigate('cartoes'); selecionarFaturaCartao('nu'); // sem nenhuma compra: total = 0
    const html = document.getElementById('cartaoFaturaResumo').innerHTML;
    const botaoMarcarAusente = !/Marcar como Paga/.test(html);
    const genAntes = saveGeneration;
    openPagarFaturaModal('nu'); // tentativa direta, sem passar pelo botão
    const modalAbriu = document.getElementById('modalOverlay').classList.contains('open');
    confirmarPagamentoFatura('nu'); // tentativa direta de confirmar mesmo sem modal
    return { botaoMarcarAusente, modalAbriu, ficouPaga: isFaturaPaga('nu', 9, 2026), genInalterado: saveGeneration === genAntes };
  });
  const ok = r.botaoMarcarAusente && !r.modalAbriu && !r.ficouPaga && r.genInalterado;
  return { ok, detail: `fatura vazia: botão "Marcar como Paga" não deve aparecer, o modal de pagamento não deve abrir, e uma chamada direta a confirmarPagamentoFatura não pode marcar como paga nem agendar salvamento — obtido=${JSON.stringify(r)}` };
}, 'fatura sem valor não pode ser marcada como paga, mesmo chamando as funções diretamente');

await check('AUDIT4_ADDING_CHARGE_AFTER_BLOCKED_PAY_NEVER_DEBITS', async () => {
  const r = await page.evaluate(() => {
    // Reprodução literal do achado: tentar pagar a fatura vazia (bloqueado
    // agora) e só depois lançar uma compra de 200 — o saldo da conta não
    // pode cair sozinho, porque a fatura nunca chegou a ficar "paga".
    const antes = state.contas.reduce((s, c) => s + calcSaldoConta(c.id), 0);
    openNovaCompraCartao();
    document.getElementById('nDespDesc').value = 'Compra depois da tentativa de pagar vazio';
    document.getElementById('nDespValor').value = '200';
    document.getElementById('nDespCartao').value = 'nu';
    document.getElementById('nDespDataCompra').value = '2026-09-02';
    salvarNovaCompraCartao();
    const depois = state.contas.reduce((s, c) => s + calcSaldoConta(c.id), 0);
    return { antes, depois, faturaPaga: isFaturaPaga('nu', 9, 2026) };
  });
  const ok = r.antes === r.depois && !r.faturaPaga;
  return { ok, detail: `lançar uma compra depois de uma tentativa bloqueada de pagar a fatura vazia não pode reduzir o saldo da conta sozinho — obtido=${JSON.stringify(r)}` };
}, 'compra lançada após tentativa bloqueada de pagar fatura vazia não debita a conta sem um novo ato de pagamento');

await check('AUDIT4_UNMARK_LEGACY_PAID_EMPTY_STILL_WORKS', async () => {
  await loadState(baseSyntheticState());
  const r = await page.evaluate(() => {
    // Estado legado: fatura já ficou marcada paga (ex: dado importado ou
    // criado antes desta correção) mesmo sem nenhuma compra.
    state.faturasPagas = { 'nu_2026-09': true };
    currentMonth = 9; currentYear = 2026;
    navigate('cartoes'); selecionarFaturaCartao('nu');
    const html = document.getElementById('cartaoFaturaResumo').innerHTML;
    const temBotaoDesmarcar = /Desmarcar/.test(html);
    toggleFaturaPaga('nu');
    return { temBotaoDesmarcar, ficouDesmarcada: !isFaturaPaga('nu', 9, 2026) };
  });
  const ok = r.temBotaoDesmarcar && r.ficouDesmarcada;
  return { ok, detail: `um estado legado já marcado como pago (fatura vazia) deve continuar podendo ser desmarcado — obtido=${JSON.stringify(r)}` };
}, 'desmarcar um estado legado de fatura vazia já paga continua funcionando');

await check('AUDIT4_ADJUST_STILL_AVAILABLE_ON_EMPTY_INVOICE', async () => {
  const r = await page.evaluate(() => {
    state.faturasPagas = {};
    navigate('cartoes'); selecionarFaturaCartao('nu');
    const html = document.getElementById('cartaoFaturaResumo').innerHTML;
    return { temAjustar: /openAjustarFaturaModal\('nu'\)/.test(html) };
  });
  const ok = r.temAjustar;
  return { ok, detail: `mesmo com fatura vazia, "Ajustar Fatura" continua disponível — é o caminho pra corrigir um total que o app ainda não calculou (ex: taxa não lançada) antes de pagar — obtido=${JSON.stringify(r)}` };
}, 'ajustar fatura continua disponível numa fatura de valor zero (caminho de correção antes de pagar)');

await check('AUDIT4_NO_SCRIPT_ERRORS', async () => ({ ok: consoleErrors.length === 0, detail: `erros de console acumulados: ${JSON.stringify(consoleErrors)}` }), 'nenhum erro de execução ao longo de todo o fluxo de correção dos achados');
} finally {
  await close();
}

const fails = results.filter((r) => r.status === 'FAIL').length;
console.log(`gate5-cards-invoices-audit-fixes: TOTAL=${results.length} PASS=${results.length - fails} FAIL=${fails}`);
if (fails > 0) process.exitCode = 1;

export { results };
