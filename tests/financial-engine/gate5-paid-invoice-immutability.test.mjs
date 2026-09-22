// Gate 5 (UAT) — imutabilidade de fatura paga (docs/audits/
// CARDS-DELETE-INTEGRITY-REVIEW.md, "Limite ainda pendente": criação, edição,
// exclusão ou importação de compras que alterem uma fatura já marcada como
// paga). Base c4f33df.../27e9a15... entrega 5e179b0.
//
// Regra financeira: depois que uma fatura é marcada como paga, nenhuma
// operação pode mudar seu total ou composição — o usuário precisa desmarcar,
// alterar, e marcar de novo. Nenhum pagamento parcial, nenhuma diferença,
// nenhum segundo modelo financeiro.
//
// Ponto único de verdade: despesaTocaFaturaPaga(d) em index.html — puro, sem
// mutação de state, usado por TODAS as rotas protegidas: salvarNovaCompraCartao,
// addDespesa (defesa), saveEditDespesa, delDespesa, confirmarLancamentosFatura
// (PDF), eseConverterParaReal ("E se..."), confirmarAjusteFatura e
// removerAjusteFatura.
import { openHarness, makeRunner, baseSyntheticState } from './harness.mjs';

const { page, loadState, close, consoleErrors } = await openHarness();
const { check, results } = makeRunner('gate5-paid-invoice-immutability');

await page.clock.setFixedTime(new Date(2026, 8, 17, 12)); // 17/09/2026

// nu: fecha=3, paga=10 — compra até dia 3 cai na fatura do próprio mês;
// depois do dia 3, cai na fatura do mês seguinte (ver getCompetenciaFatura).
const stateComCompraPaga = () => baseSyntheticState({
  despesas: [{ id: 'compraPaga', desc: 'Compra já faturada', cat: 'geral', subcat: '', cartao: 'nu',
    conta: null, valor: 100, parcelas: 1, mesInicio: 9, anoInicio: 2026, dataCompra: '2026-09-02',
    fixa: false, pagoMeses: {}, split: [], repasses: {}, createdAt: 'compraPaga' }],
});

try {

// ── 1. Nova compra em fatura paga é bloqueada ────────────────────────────
await check('NEW_PURCHASE_INTO_PAID_INVOICE_BLOCKED', async () => {
  await loadState(stateComCompraPaga());
  const r = await page.evaluate(() => {
    currentMonth = 9; currentYear = 2026;
    navigate('cartoes'); selecionarFaturaCartao('nu');
    toggleFaturaPaga('nu');
    document.getElementById('pagarFaturaConta').value = 'c1';
    confirmarPagamentoFatura('nu');
    const estadoAntes = JSON.stringify(state);
    const genAntes = saveGeneration;

    openNovaCompraCartao();
    document.getElementById('nDespDesc').value = 'Compra nova na fatura já paga';
    document.getElementById('nDespValor').value = '50';
    document.getElementById('nDespCartao').value = 'nu';
    document.getElementById('nDespDataCompra').value = '2026-09-02'; // mesma fatura de setembro, já paga
    salvarNovaCompraCartao();

    return {
      estadoInalterado: JSON.stringify(state) === estadoAntes,
      genInalterado: saveGeneration === genAntes,
      modalAindaAberto: document.getElementById('modalOverlay').classList.contains('open'),
      qtdDespesas: state.despesas.length,
    };
  });
  const ok = r.estadoInalterado && r.genInalterado && r.modalAindaAberto && r.qtdDespesas === 1;
  return { ok, detail: `uma compra nova que cairia na fatura de setembro (já paga) deve ser bloqueada sem mutar state, sem agendar salvamento e sem fechar o modal — obtido=${JSON.stringify(r)}` };
}, 'nova compra em fatura já paga é bloqueada, sem mutação e sem fechar o modal');

// ── 2. Nova compra em fatura pendente continua permitida ────────────────
await check('NEW_PURCHASE_INTO_PENDING_INVOICE_STILL_ALLOWED', async () => {
  const r = await page.evaluate(() => {
    // Fatura de outubro (dia 10 > fecha 3) continua pendente.
    openNovaCompraCartao();
    document.getElementById('nDespDesc').value = 'Compra em fatura pendente';
    document.getElementById('nDespValor').value = '30';
    document.getElementById('nDespCartao').value = 'nu';
    document.getElementById('nDespDataCompra').value = '2026-09-10'; // cai em outubro (pendente)
    salvarNovaCompraCartao();
    return {
      criada: !!state.despesas.find(d => d.desc === 'Compra em fatura pendente'),
      modalFechou: !document.getElementById('modalOverlay').classList.contains('open'),
    };
  });
  const ok = r.criada && r.modalFechou;
  return { ok, detail: `uma compra nova numa fatura AINDA pendente (outubro) deve continuar sendo criada normalmente — obtido=${JSON.stringify(r)}` };
}, 'nova compra em fatura pendente continua permitida normalmente');

// ── 3. Compra parcelada bloqueada se qualquer parcela atinge fatura paga ─
await check('INSTALLMENT_BLOCKED_IF_ANY_PARCEL_HITS_PAID_INVOICE', async () => {
  await loadState(stateComCompraPaga());
  const r = await page.evaluate(() => {
    currentMonth = 9; currentYear = 2026;
    // Paga a fatura de OUTUBRO (não a de setembro desta vez): compra dia
    // 10/set (>fecha 3) cai em outubro; ajusta e paga direto pra isolar o caso.
    if (!state.faturasAjustes) state.faturasAjustes = {};
    state.faturasAjustes['nu_2026-10'] = 999;
    if (!state.faturasPagas) state.faturasPagas = {};
    if (!state.faturasContas) state.faturasContas = {};
    state.faturasPagas['nu_2026-10'] = true;
    state.faturasContas['nu_2026-10'] = 'c1';

    const estadoAntes = JSON.stringify(state);
    // Compra parcelada em 3x a partir de agosto (dia 5 > fecha 3 -> fatura de
    // setembro): parcelas caem em set/out/nov — a 2ª parcela (outubro) atinge
    // a fatura paga acima.
    openNovaCompraCartao();
    document.getElementById('nDespDesc').value = 'Parcelada atingindo outubro pago';
    document.getElementById('nDespValor').value = '300';
    document.getElementById('nDespParcelas').value = '3';
    document.getElementById('nDespCartao').value = 'nu';
    document.getElementById('nDespDataCompra').value = '2026-08-05';
    salvarNovaCompraCartao();
    return { estadoInalterado: JSON.stringify(state) === estadoAntes };
  });
  const ok = r.estadoInalterado;
  return { ok, detail: `uma compra parcelada em 3x cuja 2ª parcela cairia na fatura de outubro (já paga) precisa ser bloqueada por inteiro, mesmo a 1ª e 3ª parcela caindo em faturas pendentes — obtido=${JSON.stringify(r)}` };
}, 'compra parcelada é bloqueada se qualquer parcela atingir uma fatura paga');

// ── 4. Virada de ano é verificada corretamente ───────────────────────────
await check('YEAR_TURN_CHECKED_CORRECTLY', async () => {
  await loadState(stateComCompraPaga());
  const r = await page.evaluate(() => {
    currentMonth = 9; currentYear = 2026;
    // Fatura de MARÇO/2027 paga — só alcançável por uma compra parcelada que
    // atravessa a virada do ano.
    if (!state.faturasAjustes) state.faturasAjustes = {};
    state.faturasAjustes['nu_2027-03'] = 999;
    if (!state.faturasPagas) state.faturasPagas = {};
    if (!state.faturasContas) state.faturasContas = {};
    state.faturasPagas['nu_2027-03'] = true;
    state.faturasContas['nu_2027-03'] = 'c1';

    const estadoAntes = JSON.stringify(state);
    // Compra em 05/dez/2026 (dia 5 > fecha 3 -> fatura de janeiro/2027) em 3x:
    // parcelas em jan/fev/mar de 2027 — a 3ª parcela atinge março/2027 (pago).
    openNovaCompraCartao();
    document.getElementById('nDespDesc').value = 'Parcelada virando o ano';
    document.getElementById('nDespValor').value = '300';
    document.getElementById('nDespParcelas').value = '3';
    document.getElementById('nDespCartao').value = 'nu';
    document.getElementById('nDespDataCompra').value = '2026-12-05';
    salvarNovaCompraCartao();
    const bloqueadaVirada = JSON.stringify(state) === estadoAntes;

    // Controle: a mesma compra em 2x (jan/fev de 2027, nunca chega em março)
    // deve continuar permitida — confirma que a checagem é específica da
    // parcela que realmente vira o ano, não um bloqueio genérico do cartão.
    document.getElementById('nDespParcelas').value = '2';
    salvarNovaCompraCartao();
    const permitidaSemAlcancarMarco = !!state.despesas.find(d => d.desc === 'Parcelada virando o ano');

    return { bloqueadaVirada, permitidaSemAlcancarMarco };
  });
  const ok = r.bloqueadaVirada && r.permitidaSemAlcancarMarco;
  return { ok, detail: `uma compra parcelada que atravessa a virada do ano e cuja parcela de março/2027 está paga deve ser bloqueada; a mesma compra em menos parcelas (nunca alcançando março/2027) deve continuar permitida — obtido=${JSON.stringify(r)}` };
}, 'virada de ano é verificada corretamente ao checar se uma parcela atinge fatura paga');

// ── 5. Edição de compra pertencente a fatura paga é bloqueada ───────────
await check('EDIT_OF_PURCHASE_IN_PAID_INVOICE_BLOCKED', async () => {
  await loadState(stateComCompraPaga());
  const r = await page.evaluate(() => {
    currentMonth = 9; currentYear = 2026;
    navigate('cartoes'); selecionarFaturaCartao('nu');
    toggleFaturaPaga('nu');
    document.getElementById('pagarFaturaConta').value = 'c1';
    confirmarPagamentoFatura('nu');

    const estadoAntes = JSON.stringify(state);
    const genAntes = saveGeneration;
    openEditDespesa('compraPaga');
    document.getElementById('eDespDesc').value = 'Descrição alterada';
    document.getElementById('eDespValor').value = '999';
    saveEditDespesa('compraPaga');
    return {
      estadoInalterado: JSON.stringify(state) === estadoAntes,
      genInalterado: saveGeneration === genAntes,
      modalAindaAberto: document.getElementById('modalOverlay').classList.contains('open'),
    };
  });
  const ok = r.estadoInalterado && r.genInalterado && r.modalAindaAberto;
  return { ok, detail: `editar qualquer campo (descrição, valor) de uma compra que já compõe a fatura paga de setembro deve ser bloqueado sem mutar state — obtido=${JSON.stringify(r)}` };
}, 'edição de compra que já compõe fatura paga é bloqueada');

// ── 6. Edição que moveria compra para fatura paga é bloqueada ───────────
await check('EDIT_MOVING_PURCHASE_INTO_PAID_INVOICE_BLOCKED', async () => {
  await loadState(baseSyntheticState({
    despesas: [{ id: 'compraPendente', desc: 'Compra em outubro (pendente)', cat: 'geral', subcat: '', cartao: 'nu',
      conta: null, valor: 100, parcelas: 1, mesInicio: 10, anoInicio: 2026, dataCompra: '2026-09-10',
      fixa: false, pagoMeses: {}, split: [], repasses: {}, createdAt: 'compraPendente' }],
  }));
  const r = await page.evaluate(() => {
    currentMonth = 9; currentYear = 2026;
    // Paga a fatura de setembro (vazia) via ajuste, só pra ter uma fatura
    // paga de destino sem depender da compra que estamos tentando mover.
    if (!state.faturasAjustes) state.faturasAjustes = {};
    state.faturasAjustes['nu_2026-09'] = 50;
    if (!state.faturasPagas) state.faturasPagas = {};
    if (!state.faturasContas) state.faturasContas = {};
    state.faturasPagas['nu_2026-09'] = true;
    state.faturasContas['nu_2026-09'] = 'c1';

    const antesDaEdicao = JSON.stringify(state.despesas);
    openEditDespesa('compraPendente');
    document.getElementById('eDespDataCompra').value = '2026-09-02'; // moveria para a fatura de setembro (paga)
    window._eDespDataCompraConfirmado = true; // usuário já confirmou o aviso de mudança de fatura
    saveEditDespesa('compraPendente');
    return {
      despesaInalterada: JSON.stringify(state.despesas) === antesDaEdicao,
      aindaEmOutubro: state.despesas.find(d => d.id === 'compraPendente')?.dataCompra === '2026-09-10',
    };
  });
  const ok = r.despesaInalterada && r.aindaEmOutubro;
  return { ok, detail: `editar a data de compra de uma despesa pendente pra movê-la pra dentro da fatura de setembro (já paga) deve ser bloqueado, mesmo com o aviso de mudança de fatura já confirmado — obtido=${JSON.stringify(r)}` };
}, 'edição que moveria uma compra para dentro de uma fatura paga é bloqueada');

// ── 7. Exclusão de compra de fatura paga é bloqueada ─────────────────────
await check('DELETE_OF_PURCHASE_IN_PAID_INVOICE_BLOCKED', async () => {
  await loadState(stateComCompraPaga());
  const r = await page.evaluate(() => {
    currentMonth = 9; currentYear = 2026;
    navigate('cartoes'); selecionarFaturaCartao('nu');
    toggleFaturaPaga('nu');
    document.getElementById('pagarFaturaConta').value = 'c1';
    confirmarPagamentoFatura('nu');

    const genAntes = saveGeneration;
    delDespesa('compraPaga');
    return {
      aindaExiste: !!state.despesas.find(d => d.id === 'compraPaga'),
      genInalterado: saveGeneration === genAntes,
    };
  });
  const ok = r.aindaExiste && r.genInalterado;
  return { ok, detail: `excluir uma compra que compõe a fatura paga de setembro deve ser bloqueado, sem mutação nem agendamento de salvamento — obtido=${JSON.stringify(r)}` };
}, 'exclusão de compra que compõe fatura paga é bloqueada');

// ── 8. Importação de PDF para fatura paga é bloqueada integralmente ─────
await check('PDF_IMPORT_INTO_PAID_INVOICE_BLOCKED_NO_PARTIAL', async () => {
  await loadState(stateComCompraPaga());
  const r = await page.evaluate(() => {
    currentMonth = 9; currentYear = 2026;
    navigate('cartoes'); selecionarFaturaCartao('nu');
    toggleFaturaPaga('nu');
    document.getElementById('pagarFaturaConta').value = 'c1';
    confirmarPagamentoFatura('nu'); // fatura de setembro paga

    // Dois itens extraídos do PDF: um cairia em setembro (paga), outro em
    // outubro (pendente) — a importação inteira deve ser recusada, nunca só
    // o item problemático (o usuário não saberia dizer quais entraram).
    // Formato de it.data é "dd/mm" (ver processarFaturaPdf/confirmarLancamentosFatura).
    // Item importado nunca tem dataCompra (só mesInicio, extraído do mês da
    // data do PDF) — cai sempre no fallback legado "mês + 1": mesInicio=8
    // (agosto) cai na fatura de setembro (paga); mesInicio=9 cai na de
    // outubro (pendente).
    faturaPdfItensExtraidos = [
      { data: '02/08', desc: 'Item que cairia em setembro (paga)', valor: 40, cat: 'geral', subcat: '', incluir: true },
      { data: '05/09', desc: 'Item que cairia em outubro (pendente)', valor: 60, cat: 'geral', subcat: '', incluir: true },
    ];
    const estadoAntes = JSON.stringify(state);
    const genAntes = saveGeneration;
    confirmarLancamentosFatura('nu');
    return {
      estadoInalterado: JSON.stringify(state) === estadoAntes,
      genInalterado: saveGeneration === genAntes,
      itensAindaExtraidos: faturaPdfItensExtraidos.length === 2,
    };
  });
  const ok = r.estadoInalterado && r.genInalterado && r.itensAindaExtraidos;
  return { ok, detail: `importar do PDF um lote onde um dos dois itens cairia na fatura paga de setembro deve bloquear a importação INTEIRA (nenhum dos dois entra), sem mutar state — obtido=${JSON.stringify(r)}` };
}, 'importação de PDF é bloqueada integralmente quando qualquer item cai em fatura paga, sem importação parcial');

// ── 9. Ajuste e remoção de ajuste em fatura paga são bloqueados ─────────
await check('ADJUST_AND_REMOVE_ADJUST_ON_PAID_INVOICE_BLOCKED', async () => {
  await loadState(stateComCompraPaga());
  const r = await page.evaluate(() => {
    currentMonth = 9; currentYear = 2026;
    navigate('cartoes'); selecionarFaturaCartao('nu');
    toggleFaturaPaga('nu');
    document.getElementById('pagarFaturaConta').value = 'c1';
    confirmarPagamentoFatura('nu');

    const genAntes1 = saveGeneration;
    openAjustarFaturaModal('nu');
    document.getElementById('ajusteFaturaValor').value = '500';
    confirmarAjusteFatura('nu', 9, 2026); // chamada direta, sem passar pelo botão
    const ajusteBloqueado = state.faturasAjustes?.['nu_2026-09'] === undefined;
    const genInalteradoAjuste = saveGeneration === genAntes1;

    // Agora com um ajuste JÁ existente antes de pagar, remove-lo depois de
    // pago também precisa ser bloqueado.
    state.faturasPagas['nu_2026-09'] = false; // desmarca pra poder ajustar
    openAjustarFaturaModal('nu');
    document.getElementById('ajusteFaturaValor').value = '120';
    confirmarAjusteFatura('nu', 9, 2026);
    const ajusteAplicado = state.faturasAjustes['nu_2026-09'] === 120;
    state.faturasPagas['nu_2026-09'] = true; // marca como paga de novo (sem passar pelo fluxo de pagamento, só pra isolar o teste do ajuste)

    const genAntes2 = saveGeneration;
    removerAjusteFatura('nu', 9, 2026);
    const remocaoBloqueada = state.faturasAjustes['nu_2026-09'] === 120;
    const genInalteradoRemocao = saveGeneration === genAntes2;

    return { ajusteBloqueado, genInalteradoAjuste, ajusteAplicado, remocaoBloqueada, genInalteradoRemocao };
  });
  const ok = r.ajusteBloqueado && r.genInalteradoAjuste && r.ajusteAplicado && r.remocaoBloqueada && r.genInalteradoRemocao;
  return { ok, detail: `aplicar um ajuste manual novo numa fatura paga deve ser bloqueado; remover um ajuste já existente de uma fatura que está paga também deve ser bloqueado — ambos por chamada direta às funções, sem passar pelo botão — obtido=${JSON.stringify(r)}` };
}, 'ajuste manual e remoção de ajuste em fatura paga são bloqueados, mesmo por chamada direta');

// ── 10. Desmarcar a fatura libera novamente as operações ────────────────
await check('UNMARKING_INVOICE_RELEASES_OPERATIONS_AGAIN', async () => {
  await loadState(stateComCompraPaga());
  const r = await page.evaluate(() => {
    currentMonth = 9; currentYear = 2026;
    navigate('cartoes'); selecionarFaturaCartao('nu');
    toggleFaturaPaga('nu');
    document.getElementById('pagarFaturaConta').value = 'c1';
    confirmarPagamentoFatura('nu');

    // Bloqueado enquanto paga:
    openEditDespesa('compraPaga');
    document.getElementById('eDespDesc').value = 'Tentativa enquanto paga';
    saveEditDespesa('compraPaga');
    const bloqueadaEnquantoPaga = state.despesas.find(d => d.id === 'compraPaga').desc === 'Compra já faturada';

    // Desmarca — deve continuar sempre permitido.
    toggleFaturaPaga('nu');
    const desmarcada = !isFaturaPaga('nu', 9, 2026);

    // Agora a edição, exclusão, ajuste e nova compra voltam a funcionar
    // pelas regras normais.
    openEditDespesa('compraPaga');
    document.getElementById('eDespDesc').value = 'Editada após desmarcar';
    saveEditDespesa('compraPaga');
    const edicaoLiberada = state.despesas.find(d => d.id === 'compraPaga').desc === 'Editada após desmarcar';

    openAjustarFaturaModal('nu');
    document.getElementById('ajusteFaturaValor').value = '90';
    confirmarAjusteFatura('nu', 9, 2026);
    const ajusteLiberado = state.faturasAjustes['nu_2026-09'] === 90;

    delDespesa('compraPaga');
    const exclusaoLiberada = !state.despesas.find(d => d.id === 'compraPaga');

    return { bloqueadaEnquantoPaga, desmarcada, edicaoLiberada, ajusteLiberado, exclusaoLiberada };
  });
  const ok = r.bloqueadaEnquantoPaga && r.desmarcada && r.edicaoLiberada && r.ajusteLiberado && r.exclusaoLiberada;
  return { ok, detail: `depois de desmarcar a fatura, editar, ajustar e excluir voltam a funcionar pelas regras normais — obtido=${JSON.stringify(r)}` };
}, 'desmarcar a fatura libera novamente edição, ajuste e exclusão');

// ── 11. Dinheiro/PIX permanece inalterado ────────────────────────────────
await check('CASH_PAYMENTS_UNAFFECTED', async () => {
  await loadState(stateComCompraPaga());
  const r = await page.evaluate(() => {
    currentMonth = 9; currentYear = 2026;
    // Paga a fatura de crédito de setembro — não deve influenciar em nada
    // dinheiro/PIX, mesmo no mesmo mês.
    navigate('cartoes'); selecionarFaturaCartao('nu');
    toggleFaturaPaga('nu');
    document.getElementById('pagarFaturaConta').value = 'c1';
    confirmarPagamentoFatura('nu');

    navigate('despesas');
    document.getElementById('despDesc').value = 'Compra no dinheiro';
    document.getElementById('despValor').value = '25';
    document.getElementById('despCartao').value = 'dinheiro';
    document.getElementById('despConta').value = 'c1';
    document.getElementById('despDataCompra').value = '2026-09-02';
    addDespesa();
    const criada = state.despesas.find(d => d.desc === 'Compra no dinheiro');
    const criadaOk = !!criada;

    openEditDespesa(criada.id);
    document.getElementById('eDespDesc').value = 'Compra no dinheiro editada';
    saveEditDespesa(criada.id);
    const editadaOk = state.despesas.find(d => d.id === criada.id)?.desc === 'Compra no dinheiro editada';

    delDespesa(criada.id);
    const excluidaOk = !state.despesas.find(d => d.id === criada.id);

    return { criadaOk, editadaOk, excluidaOk };
  });
  const ok = r.criadaOk && r.editadaOk && r.excluidaOk;
  return { ok, detail: `criar, editar e excluir uma despesa em Dinheiro/PIX continua funcionando normalmente, mesmo com uma fatura de cartão paga no mesmo mês — obtido=${JSON.stringify(r)}` };
}, 'pagamento direto em Dinheiro/PIX permanece inalterado pela regra de imutabilidade de fatura paga');

// ── 12/13. Bloqueios não mudam estado/saldo/saveGeneration; saldo congelado
await check('BALANCE_STAYS_FROZEN_ACROSS_BLOCKED_ATTEMPTS', async () => {
  await loadState(stateComCompraPaga());
  const r = await page.evaluate(() => {
    currentMonth = 9; currentYear = 2026;
    navigate('cartoes'); selecionarFaturaCartao('nu');
    toggleFaturaPaga('nu');
    document.getElementById('pagarFaturaConta').value = 'c1';
    confirmarPagamentoFatura('nu'); // debita 100 da conta c1

    const saldoLogoDepoisDePagar = state.contas.reduce((s, c) => s + calcSaldoConta(c.id), 0);

    // Várias tentativas bloqueadas em sequência: nova compra, edição, exclusão.
    openNovaCompraCartao();
    document.getElementById('nDespDesc').value = 'Tentativa 1';
    document.getElementById('nDespValor').value = '10';
    document.getElementById('nDespCartao').value = 'nu';
    document.getElementById('nDespDataCompra').value = '2026-09-02';
    salvarNovaCompraCartao();

    openEditDespesa('compraPaga');
    document.getElementById('eDespValor').value = '9999';
    saveEditDespesa('compraPaga');

    delDespesa('compraPaga');

    const saldoDepoisDasTentativas = state.contas.reduce((s, c) => s + calcSaldoConta(c.id), 0);
    return { saldoLogoDepoisDePagar, saldoDepoisDasTentativas };
  });
  const ok = Math.abs(r.saldoLogoDepoisDePagar - 900) < 0.01 && Math.abs(r.saldoDepoisDasTentativas - 900) < 0.01;
  return { ok, detail: `o saldo debitado pelo pagamento da fatura (R$1000 -> R$900) precisa continuar em R$900 mesmo depois de várias tentativas bloqueadas de alterar a fatura paga — obtido=${JSON.stringify(r)}` };
}, 'o saldo debitado pela fatura paga permanece congelado através de múltiplas tentativas bloqueadas');

// ── 14. Registros legados (sem dataCompra) continuam reproduzíveis ──────
await check('LEGACY_RECORD_WITHOUT_DATACOMPRA_STILL_BLOCKS_CORRECTLY', async () => {
  // Registro legado: sem dataCompra, só mesInicio/anoInicio — competência
  // cai no fallback "mês da compra + 1" (mesInicio=8 -> fatura de setembro).
  await loadState(baseSyntheticState({
    despesas: [{ id: 'legado', desc: 'Compra legada sem data', cat: 'geral', subcat: '', cartao: 'nu',
      conta: null, valor: 70, parcelas: 1, mesInicio: 8, anoInicio: 2026, dataCompra: null,
      fixa: false, pagoMeses: {}, split: [], repasses: {}, createdAt: 'legado' }],
  }));
  const r = await page.evaluate(() => {
    currentMonth = 9; currentYear = 2026;
    navigate('cartoes'); selecionarFaturaCartao('nu');
    toggleFaturaPaga('nu'); // paga a fatura de setembro (só a compra legada)
    document.getElementById('pagarFaturaConta').value = 'c1';
    confirmarPagamentoFatura('nu');

    const antesDaEdicao = JSON.stringify(state.despesas.find(d => d.id === 'legado'));
    const genAntes = saveGeneration;

    // Editar sem preencher uma data de compra nova (campo continua vazio) —
    // o registro legado precisa continuar bloqueado sem que o app precise
    // inventar uma dataCompra pra fazer a checagem.
    openEditDespesa('legado');
    document.getElementById('eDespValor').value = '9999';
    saveEditDespesa('legado');

    delDespesa('legado');

    return {
      despesaInalterada: JSON.stringify(state.despesas.find(d => d.id === 'legado')) === antesDaEdicao,
      dataCompraContinuaNula: state.despesas.find(d => d.id === 'legado')?.dataCompra == null,
      genInalterado: saveGeneration === genAntes,
    };
  });
  const ok = r.despesaInalterada && r.dataCompraContinuaNula && r.genInalterado;
  return { ok, detail: `um registro legado sem dataCompra (competência via fallback mesInicio+1) que está numa fatura paga precisa continuar bloqueado pra edição/exclusão, sem que a checagem precise inventar uma dataCompra que nunca existiu — obtido=${JSON.stringify(r)}` };
}, 'registro legado sem dataCompra continua sendo bloqueado corretamente, sem datas inventadas');

await check('NO_SCRIPT_ERRORS', async () => ({ ok: consoleErrors.length === 0, detail: `erros de console acumulados: ${JSON.stringify(consoleErrors)}` }), 'nenhum erro de execução ao longo do fluxo de imutabilidade de fatura paga');

} finally {
  await close();
}

const fails = results.filter((r) => r.status === 'FAIL').length;
console.log(`gate5-paid-invoice-immutability: TOTAL=${results.length} PASS=${results.length - fails} FAIL=${fails}`);
if (fails > 0) process.exitCode = 1;

export { results };
