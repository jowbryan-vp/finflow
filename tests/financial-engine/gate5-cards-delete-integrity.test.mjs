// Gate 5 (UAT) — correção do risco crítico encontrado pela auditoria Codex
// durante a revisão do fallback do grupo Outros (docs/audits/
// CARDS-INVOICES-ORPHAN-TOTAL-FINAL-REVIEW.md, base c4f33df, entrega
// Claude Code 5a6a2ef).
//
// Achado: delCartao só bloqueava cartões PADRÃO, nunca um cartão
// personalizado com histórico. calcSaldoConta/calcByCardForMonth percorrem
// state.cards pra achar faturas pagas e ajustes — excluir um cartão com
// histórico faz esse histórico "sumir" do saldo, mesmo com state.despesas,
// state.faturasPagas e state.faturasContas ainda gravados intactos.
//
// Correção: delCartao passa a bloquear a exclusão de qualquer cartão
// personalizado com (a) alguma despesa com cartao===id, ou (b) qualquer
// chave vinculada a esse cartão em faturasPagas/faturasContas/faturasAjustes.
// Só cartão vazio e sem histórico continua excluível. Nenhuma migração,
// exclusão ou reclassificação de lançamento; nenhuma mudança em saldo,
// competência, pagamento ou regra de fatura.
import { openHarness, makeRunner, baseSyntheticState } from './harness.mjs';

const { page, loadState, close, consoleErrors } = await openHarness();
const { check, results } = makeRunner('gate5-cards-delete-integrity');

await page.clock.setFixedTime(new Date(2026, 8, 17, 12)); // 17/09/2026

const customCard = { id: 'custom', name: 'Cartão Personalizado', color: '#ff5599', fecha: 3, paga: 10 };

try {

// ── Caso 1: cartão com compra pendente ──────────────────────────────────
await check('DELETE_BLOCKED_WITH_PENDING_PURCHASE', async () => {
  await loadState(baseSyntheticState({
    cards: [{ id: 'dinheiro', name: 'Dinheiro/PIX', color: '#38e2b4', fecha: null, paga: null }, customCard],
    despesas: [{ id: 'compraCustom', desc: 'Compra pendente', cat: 'geral', subcat: '', cartao: 'custom',
      conta: null, valor: 120, parcelas: 1, mesInicio: 9, anoInicio: 2026, dataCompra: '2026-09-02',
      fixa: false, pagoMeses: {}, split: [], repasses: {}, createdAt: 'compraCustom' }],
  }));
  const r = await page.evaluate(() => {
    currentMonth = 9; currentYear = 2026;
    const genAntes = saveGeneration;
    delCartao('custom');
    return {
      cartaoAindaExiste: !!state.cards.find(c => c.id === 'custom'),
      despesaIntacta: state.despesas.length === 1 && state.despesas[0].cartao === 'custom',
      genInalterado: saveGeneration === genAntes,
    };
  });
  const ok = r.cartaoAindaExiste && r.despesaIntacta && r.genInalterado;
  return { ok, detail: `cartão personalizado com uma compra pendente não pode ser excluído; nada deve mudar em state.cards/state.despesas nem agendar salvamento — obtido=${JSON.stringify(r)}` };
}, 'exclusão de cartão personalizado com compra pendente é bloqueada');

// ── Caso 2: cartão com fatura paga ──────────────────────────────────────
await check('DELETE_BLOCKED_WITH_PAID_INVOICE_BALANCE_UNCHANGED', async () => {
  await loadState(baseSyntheticState({
    cards: [{ id: 'dinheiro', name: 'Dinheiro/PIX', color: '#38e2b4', fecha: null, paga: null }, customCard],
    despesas: [{ id: 'compraCustom', desc: 'Compra paga', cat: 'geral', subcat: '', cartao: 'custom',
      conta: null, valor: 120, parcelas: 1, mesInicio: 9, anoInicio: 2026, dataCompra: '2026-09-02',
      fixa: false, pagoMeses: {}, split: [], repasses: {}, createdAt: 'compraCustom' }],
  }));
  const r = await page.evaluate(() => {
    currentMonth = 9; currentYear = 2026;
    navigate('cartoes'); selecionarFaturaCartao('custom');
    toggleFaturaPaga('custom'); // abre o modal de pagamento
    document.getElementById('pagarFaturaConta').value = 'c1';
    confirmarPagamentoFatura('custom');
    const saldoAntes = state.contas.reduce((s, c) => s + calcSaldoConta(c.id), 0);
    const genAntes = saveGeneration;
    delCartao('custom');
    const saldoDepois = state.contas.reduce((s, c) => s + calcSaldoConta(c.id), 0);
    return {
      cartaoAindaExiste: !!state.cards.find(c => c.id === 'custom'),
      faturaPagaIntacta: isFaturaPaga('custom', 9, 2026),
      saldoAntes, saldoDepois,
      genInalterado: saveGeneration === genAntes,
    };
  });
  const ok = r.cartaoAindaExiste && r.faturaPagaIntacta
    && Math.abs(r.saldoAntes - 880) < 0.01 && Math.abs(r.saldoDepois - 880) < 0.01
    && r.genInalterado;
  return { ok, detail: `cartão com fatura já paga (R$120 debitados de R$1000 -> R$880) não pode ser excluído; o saldo antes e depois da tentativa deve continuar em R$880 (a fuga de saldo reproduzida pela auditoria não pode mais acontecer) — obtido=${JSON.stringify(r)}` };
}, 'exclusão de cartão personalizado com fatura paga é bloqueada e o saldo permanece igual');

// ── Caso 3: cartão referenciado só pelos mapas históricos (sem despesa) ──
await check('DELETE_BLOCKED_WHEN_ONLY_HISTORICAL_MAPS_REFERENCE_CARD', async () => {
  await loadState(baseSyntheticState({
    cards: [{ id: 'dinheiro', name: 'Dinheiro/PIX', color: '#38e2b4', fecha: null, paga: null }, customCard],
    despesas: [], // nenhuma despesa — só o ajuste manual referencia o cartão
  }));
  const r = await page.evaluate(() => {
    currentMonth = 9; currentYear = 2026;
    navigate('cartoes'); selecionarFaturaCartao('custom');
    openAjustarFaturaModal('custom');
    document.getElementById('ajusteFaturaValor').value = '50';
    confirmarAjusteFatura('custom', 9, 2026);
    const genAntes = saveGeneration;
    delCartao('custom');
    return {
      cartaoAindaExiste: !!state.cards.find(c => c.id === 'custom'),
      ajusteIntacto: state.faturasAjustes['custom_2026-09'] === 50,
      genInalterado: saveGeneration === genAntes,
    };
  });
  const ok = r.cartaoAindaExiste && r.ajusteIntacto && r.genInalterado;
  return { ok, detail: `cartão sem nenhuma despesa, mas com um ajuste manual de fatura gravado (state.faturasAjustes), continua sendo histórico financeiro e não pode ser excluído — obtido=${JSON.stringify(r)}` };
}, 'exclusão de cartão referenciado só pelos mapas históricos (faturasAjustes) é bloqueada');

// ── Caso 4: cartão personalizado vazio ───────────────────────────────────
await check('DELETE_ALLOWED_FOR_EMPTY_CUSTOM_CARD', async () => {
  await loadState(baseSyntheticState({
    cards: [{ id: 'dinheiro', name: 'Dinheiro/PIX', color: '#38e2b4', fecha: null, paga: null }, customCard],
    despesas: [],
  }));
  const r = await page.evaluate(() => {
    delCartao('custom');
    return { cartaoRemovido: !state.cards.find(c => c.id === 'custom') };
  });
  const ok = r.cartaoRemovido;
  return { ok, detail: `cartão personalizado vazio (sem despesa e sem nenhuma chave em faturasPagas/faturasContas/faturasAjustes) continua podendo ser excluído normalmente — obtido=${JSON.stringify(r)}` };
}, 'exclusão de cartão personalizado vazio e sem histórico continua permitida');

// ── Caso 5: cartão padrão continua protegido ─────────────────────────────
await check('DELETE_STILL_BLOCKED_FOR_DEFAULT_CARD', async () => {
  await loadState(baseSyntheticState());
  const r = await page.evaluate(() => {
    const genAntes = saveGeneration;
    delCartao('dinheiro'); // cartão padrão, sem histórico algum
    return {
      cartaoAindaExiste: !!state.cards.find(c => c.id === 'dinheiro'),
      genInalterado: saveGeneration === genAntes,
    };
  });
  const ok = r.cartaoAindaExiste && r.genInalterado;
  return { ok, detail: `proteção existente de cartão padrão (DEFAULT_CARDS) continua funcionando, mesmo sem nenhum histórico vinculado — obtido=${JSON.stringify(r)}` };
}, 'proteção de cartão padrão contra exclusão é preservada');

// ── Caso 6: bloqueio nunca muta estado nem agenda salvamento (mensagem) ──
await check('BLOCK_SHOWS_CLEAR_MESSAGE_ZERO_MUTATION', async () => {
  await loadState(baseSyntheticState({
    cards: [{ id: 'dinheiro', name: 'Dinheiro/PIX', color: '#38e2b4', fecha: null, paga: null }, customCard],
    despesas: [{ id: 'compraCustom', desc: 'Compra pendente', cat: 'geral', subcat: '', cartao: 'custom',
      conta: null, valor: 75, parcelas: 1, mesInicio: 9, anoInicio: 2026, dataCompra: '2026-09-02',
      fixa: false, pagoMeses: {}, split: [], repasses: {}, createdAt: 'compraCustom' }],
  }));
  const r = await page.evaluate(() => {
    currentMonth = 9; currentYear = 2026;
    const estadoAntes = JSON.stringify(state);
    const genAntes = saveGeneration;
    delCartao('custom');
    const toastEl = document.getElementById('toast');
    return {
      estadoInalterado: JSON.stringify(state) === estadoAntes,
      genInalterado: saveGeneration === genAntes,
      mensagemClara: /histórico financeiro|lançamentos/.test(toastEl?.textContent || ''),
    };
  });
  const ok = r.estadoInalterado && r.genInalterado && r.mensagemClara;
  return { ok, detail: `tentar excluir um cartão com histórico não pode mutar NENHUMA parte de state nem agendar salvamento, e deve mostrar uma mensagem clara explicando o motivo do bloqueio — obtido=${JSON.stringify(r)}` };
}, 'bloqueio de exclusão não muta estado nem agenda salvamento, e mostra mensagem clara');

await check('NO_SCRIPT_ERRORS', async () => ({ ok: consoleErrors.length === 0, detail: `erros de console acumulados: ${JSON.stringify(consoleErrors)}` }), 'nenhum erro de execução ao longo do fluxo de integridade de exclusão de cartão');

} finally {
  await close();
}

const fails = results.filter((r) => r.status === 'FAIL').length;
console.log(`gate5-cards-delete-integrity: TOTAL=${results.length} PASS=${results.length - fails} FAIL=${fails}`);
if (fails > 0) process.exitCode = 1;

export { results };
