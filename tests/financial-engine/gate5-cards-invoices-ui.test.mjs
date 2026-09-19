// Gate 5 (UAT) — ajuste de interface "Cartões / Faturas"
// (docs/gates/CARDS-INVOICES-UI.md).
//
// Única fonte de dados o tempo todo: state.despesas, state.cards e
// state.faturasPagas continuam sendo os mesmos, com os mesmos cálculos
// (getDespesasForMonth, getCompetenciaFatura, calcByCardForMonth,
// isFaturaPaga/toggleFaturaPaga) — a área nova só concentra a UI. Este
// arquivo cobre os critérios de aceitação do escopo:
//   1. compra no crédito antes/depois do fechamento e virada de ano
//   2. parcela aparecendo nas faturas mensais corretas
//   3. compra direta (Dinheiro/PIX) permanece no fluxo de Despesas
//   4. registrar/editar/excluir compra no crédito pela nova área
//   5. pagar/desmarcar fatura altera o caixa uma única vez
//   6. relatório/categoria ainda contam a despesa (mesma fonte)
//   7. busca e link do Dashboard levam à área/cartão corretos
//   8. importação de PDF continua apontando ao cartão certo
//   9. troca de perfil não mistura faturas entre perfis
//   10. layout cabe em tela móvel
import { openHarness, makeRunner, baseSyntheticState } from './harness.mjs';

const { page, loadState, close, consoleErrors } = await openHarness();
const { check, results } = makeRunner('gate5-cards-invoices-ui');

await page.clock.setFixedTime(new Date(2026, 8, 17, 12)); // 17/09/2026

try {
await check('CARD_UI_01_NAV_LABEL_SINGLE_ENTRY', async () => {
  await loadState(baseSyntheticState());
  const r = await page.evaluate(() => {
    const items = [...document.querySelectorAll('.nav-item')].map(n => n.textContent.trim());
    return { count: items.filter(t => /cart/i.test(t)).length, label: items.find(t => /cart/i.test(t)) };
  });
  const ok = r.count === 1 && /cart[õo]es\s*\/\s*faturas/i.test(r.label || '');
  return { ok, detail: `deve haver exatamente UMA entrada de navegação de cartões, chamada "Cartões / Faturas" — obtido=${JSON.stringify(r)}` };
}, 'uma única entrada de navegação "Cartões / Faturas", sem duplicidade');

await check('CARD_UI_02_BEFORE_AFTER_CLOSING', async () => {
  const r = await page.evaluate(() => {
    // Cartão 'nu' fecha dia 3 (harness). Compra em 02/09 cai na fatura de
    // SETEMBRO (antes do fechamento); compra em 05/09 cai na fatura de
    // OUTUBRO (depois do fechamento) — mesma regra de getCompetenciaFatura,
    // só verificada aqui pela nova área.
    currentMonth = 9; currentYear = 2026; navigate('cartoes');
    selecionarFaturaCartao('nu');
    openNovaCompraCartao();
    document.getElementById('nDespDesc').value = 'Antes do fechamento';
    document.getElementById('nDespValor').value = '100';
    document.getElementById('nDespCartao').value = 'nu';
    document.getElementById('nDespDataCompra').value = '2026-09-02';
    salvarNovaCompraCartao();
    openNovaCompraCartao();
    document.getElementById('nDespDesc').value = 'Depois do fechamento';
    document.getElementById('nDespValor').value = '200';
    document.getElementById('nDespCartao').value = 'nu';
    document.getElementById('nDespDataCompra').value = '2026-09-05';
    salvarNovaCompraCartao();
    const setembro = getDespesasForMonth(9, 2026).filter(d => d.cartao === 'nu').map(d => d.desc);
    const outubro = getDespesasForMonth(10, 2026).filter(d => d.cartao === 'nu').map(d => d.desc);
    return { setembro, outubro };
  });
  const ok = r.setembro.includes('Antes do fechamento') && !r.setembro.includes('Depois do fechamento')
    && r.outubro.includes('Depois do fechamento') && !r.outubro.includes('Antes do fechamento');
  return { ok, detail: `compra antes do fechamento (02/09) deve cair na fatura de setembro, depois (05/09) na de outubro — obtido=${JSON.stringify(r)}` };
}, 'compra no crédito antes/depois do fechamento cai na fatura correta (mesmo cálculo existente)');

await check('CARD_UI_03_YEAR_TURN', async () => {
  const r = await page.evaluate(() => {
    navigate('cartoes'); selecionarFaturaCartao('nu');
    openNovaCompraCartao();
    document.getElementById('nDespDesc').value = 'Virada de ano';
    document.getElementById('nDespValor').value = '300';
    document.getElementById('nDespCartao').value = 'nu';
    document.getElementById('nDespDataCompra').value = '2026-12-30';
    salvarNovaCompraCartao();
    // Depois do fechamento (dia 3) de dezembro/2026 -> fatura de janeiro/2027.
    const jan2027 = getDespesasForMonth(1, 2027).filter(d => d.cartao === 'nu').map(d => d.desc);
    const dez2026 = getDespesasForMonth(12, 2026).filter(d => d.cartao === 'nu').map(d => d.desc);
    return { jan2027, dez2026 };
  });
  const ok = r.jan2027.includes('Virada de ano') && !r.dez2026.includes('Virada de ano');
  return { ok, detail: `compra em 30/12 (depois do fechamento) deve virar o ano e cair na fatura de janeiro/2027 — obtido=${JSON.stringify(r)}` };
}, 'compra no crédito perto da virada de ano cai na fatura do ano seguinte quando aplicável');

await check('CARD_UI_04_INSTALLMENTS_ACROSS_MONTHS', async () => {
  const r = await page.evaluate(() => {
    navigate('cartoes'); selecionarFaturaCartao('nu');
    openNovaCompraCartao();
    document.getElementById('nDespDesc').value = 'Compra parcelada';
    document.getElementById('nDespValor').value = '300';
    document.getElementById('nDespCartao').value = 'nu';
    document.getElementById('nDespParcelas').value = '3';
    document.getElementById('nDespDataCompra').value = '2026-09-02'; // fatura de setembro
    salvarNovaCompraCartao();
    const meses = [9, 10, 11].map(m => {
      currentMonth = m; currentYear = 2026; renderCartoes();
      const item = getDespesasForMonth(m, 2026).find(d => d.desc === 'Compra parcelada');
      return item ? { parcel: item._parcel, total: item._total, valor: item._valorParcela } : null;
    });
    return meses;
  });
  const ok = r.every(m => m && m.total === 3) && r[0].parcel === 1 && r[1].parcel === 2 && r[2].parcel === 3
    && r.every(m => Math.abs(m.valor - 100) < 0.01);
  return { ok, detail: `parcela 1/3, 2/3, 3/3 deve aparecer nas faturas de setembro/outubro/novembro de 2026, R$100 cada — obtido=${JSON.stringify(r)}` };
}, 'compra parcelada no cartão aparece nas faturas mensais corretas em sequência');

await check('CARD_UI_05_DIRECT_PAYMENT_STAYS_IN_DESPESAS', async () => {
  const r = await page.evaluate(() => {
    currentMonth = 9; currentYear = 2026;
    navigate('despesas');
    const opcoesDespCartao = [...document.getElementById('despCartao').options].map(o => o.value);
    document.getElementById('despDesc').value = 'Mercado à vista';
    document.getElementById('despCat').value = 'geral';
    document.getElementById('despCartao').value = 'dinheiro';
    document.getElementById('despValor').value = '80';
    document.getElementById('despConta').value = 'c1';
    document.getElementById('despDataCompra').value = '2026-09-10';
    addDespesa();
    const noDespesas = getDespesasForMonth(9, 2026).some(d => d.desc === 'Mercado à vista' && d.cartao === 'dinheiro');
    return { opcoesDespCartao, noDespesas };
  });
  const ok = r.opcoesDespCartao.includes('dinheiro') && !r.opcoesDespCartao.some(v => v !== 'dinheiro') && r.noDespesas;
  return { ok, detail: `o formulário de Adicionar Despesa só deve oferecer opções de pagamento direto (aqui só 'dinheiro' existe no fixture), e a despesa deve ser criada normalmente — obtido=${JSON.stringify(r)}` };
}, 'compra direta (PIX/dinheiro/débito) continua sendo cadastrada normalmente em Despesas, sem opção de cartão de crédito no formulário');

await check('CARD_UI_06_CREATE_EDIT_DELETE_VIA_CARTOES', async () => {
  const r = await page.evaluate(() => {
    navigate('cartoes'); selecionarFaturaCartao('nu');
    openNovaCompraCartao();
    document.getElementById('nDespDesc').value = 'Editar depois';
    document.getElementById('nDespValor').value = '50';
    document.getElementById('nDespCartao').value = 'nu';
    document.getElementById('nDespDataCompra').value = '2026-09-02';
    salvarNovaCompraCartao();
    const criada = state.despesas.find(d => d.desc === 'Editar depois');
    const apareceNaFatura = document.getElementById('cartaoFaturaItens').innerHTML.includes('Editar depois');
    // Editar pela área certa: já estamos em Cartões, deve abrir o modal sem navegar de novo.
    abrirEdicaoDespesaNaAreaCerta(criada.id);
    const modalAberto = document.getElementById('modalOverlay').classList.contains('open');
    const paginaAposEditar = document.querySelector('.nav-item.active')?.dataset?.page;
    document.getElementById('eDespValor').value = '55';
    saveEditDespesa(criada.id);
    const valorAtualizado = state.despesas.find(d => d.id === criada.id).valor;
    delDespesa(criada.id);
    const removida = !state.despesas.some(d => d.id === criada.id);
    const removidaDaFatura = !document.getElementById('cartaoFaturaItens').innerHTML.includes('Editar depois');
    return { apareceNaFatura, modalAberto, paginaAposEditar, valorAtualizado, removida, removidaDaFatura };
  });
  const ok = r.apareceNaFatura && r.modalAberto && r.paginaAposEditar === 'cartoes' && r.valorAtualizado === 55 && r.removida && r.removidaDaFatura;
  return { ok, detail: `registrar/editar/excluir uma compra no crédito inteiramente pela área Cartões / Faturas, sem sair dela — obtido=${JSON.stringify(r)}` };
}, 'registro, edição e exclusão de compra no crédito funcionam pela nova área, sem navegação desnecessária');

await check('CARD_UI_07_PAY_UNPAY_ONCE', async () => {
  await loadState(baseSyntheticState()); // isolado dos lançamentos criados nos casos anteriores
  const r = await page.evaluate(() => {
    currentMonth = 9; currentYear = 2026;
    navigate('cartoes'); selecionarFaturaCartao('nu');
    openNovaCompraCartao();
    document.getElementById('nDespDesc').value = 'Fatura a pagar';
    document.getElementById('nDespValor').value = '300';
    document.getElementById('nDespCartao').value = 'nu';
    document.getElementById('nDespDataCompra').value = '2026-09-02';
    salvarNovaCompraCartao();
    const antes = state.contas.reduce((s, c) => s + calcSaldoConta(c.id), 0);
    toggleFaturaPaga('nu'); // abre o modal de pagamento
    document.getElementById('pagarFaturaConta').value = 'c1';
    confirmarPagamentoFatura('nu');
    const depoisDePagar = state.contas.reduce((s, c) => s + calcSaldoConta(c.id), 0);
    toggleFaturaPaga('nu'); // desmarca
    const depoisDeDesmarcar = state.contas.reduce((s, c) => s + calcSaldoConta(c.id), 0);
    return { antes, depoisDePagar, depoisDeDesmarcar };
  });
  const ok = Math.abs(r.antes - r.depoisDePagar - 300) < 0.01 && Math.abs(r.depoisDeDesmarcar - r.antes) < 0.01;
  return { ok, detail: `pagar a fatura pela nova área deve debitar a conta exatamente uma vez (300), e desmarcar deve reverter exatamente — obtido=${JSON.stringify(r)}` };
}, 'pagar/desmarcar fatura pela nova área altera o caixa uma única vez (mesmo motor de sempre)');

await check('CARD_UI_08_STILL_IN_REPORTS_AND_CATEGORIES', async () => {
  await loadState(baseSyntheticState()); // isolado dos lançamentos criados nos casos anteriores
  const r = await page.evaluate(() => {
    currentMonth = 9; currentYear = 2026;
    navigate('cartoes'); selecionarFaturaCartao('nu');
    openNovaCompraCartao();
    document.getElementById('nDespDesc').value = 'Categoria teste';
    document.getElementById('nDespCat').value = 'geral'; // única categoria do fixture sintético
    document.getElementById('nDespValor').value = '120';
    document.getElementById('nDespCartao').value = 'nu';
    document.getElementById('nDespDataCompra').value = '2026-09-02';
    salvarNovaCompraCartao();
    const t = getTotalsForMonth(9, 2026);
    const byCard = calcByCardForMonth(9, 2026);
    return { byCat: t.byCat, byCardNu: byCard.nu };
  });
  const ok = (r.byCat.geral || 0) === 120 && r.byCardNu === 120;
  return { ok, detail: `uma compra criada pela nova área deve contar normalmente em categorias (byCat) e no total por cartão (calcByCardForMonth) — mesma fonte, sem segundo cadastro — obtido=${JSON.stringify(r)}` };
}, 'relatório e categoria continuam contando a despesa registrada pela nova área (fonte única)');

await check('CARD_UI_09_SEARCH_LEADS_TO_CARTOES', async () => {
  const r = await page.evaluate(() => {
    navigate('cartoes'); selecionarFaturaCartao('nu');
    openNovaCompraCartao();
    document.getElementById('nDespDesc').value = 'Achar pela busca';
    document.getElementById('nDespValor').value = '77';
    document.getElementById('nDespCartao').value = 'nu';
    document.getElementById('nDespDataCompra').value = '2026-09-02';
    salvarNovaCompraCartao();
    navigate('despesas'); // simula estar em outra página ao pesquisar
    abrirPesquisaLancamentos();
    document.getElementById('pesquisaLancamentoInput').value = 'Achar pela busca';
    renderResultadoPesquisaLancamentos();
    const encontrou = document.getElementById('resultadoPesquisaLancamentos').innerHTML.includes('Achar pela busca');
    const id = state.despesas.find(d => d.desc === 'Achar pela busca').id;
    return { encontrou, id };
  });
  const clicked = await page.evaluate((id) => {
    closeModal(); abrirEdicaoDespesaNaAreaCerta(id);
    return { pagina: document.querySelector('.nav-item.active')?.dataset?.page, cartaoSelecionado: window._faturaCartaoSelecionado };
  }, r.id);
  await page.waitForTimeout(200);
  const modalAberto = await page.evaluate(() => document.getElementById('modalOverlay').classList.contains('open'));
  const ok = r.encontrou && clicked.pagina === 'cartoes' && clicked.cartaoSelecionado === 'nu' && modalAberto;
  return { ok, detail: `busca deve achar a compra e o botão editar deve levar a Cartões / Faturas com o cartão certo selecionado e o modal de edição aberto — obtido=${JSON.stringify({ ...r, ...clicked, modalAberto })}` };
}, 'busca de lançamento encontra a compra no crédito e o link de editar leva à área correta');

await check('CARD_UI_10_DASHBOARD_BILL_LINK', async () => {
  const r = await page.evaluate(() => {
    navigateToDespesasCartao('nu');
    const paginaCredito = document.querySelector('.nav-item.active')?.dataset?.page;
    const cartaoSelecionado = window._faturaCartaoSelecionado;
    navigateToDespesasCartao('dinheiro');
    const paginaDinheiro = document.querySelector('.nav-item.active')?.dataset?.page;
    return { paginaCredito, cartaoSelecionado, paginaDinheiro };
  });
  const ok = r.paginaCredito === 'cartoes' && r.cartaoSelecionado === 'nu' && r.paginaDinheiro === 'despesas';
  return { ok, detail: `link do Dashboard pro cartão de crédito deve levar a Cartões / Faturas com o cartão certo; pro "Dinheiro/PIX" continua indo pra Despesas — obtido=${JSON.stringify(r)}` };
}, 'link de fatura do Dashboard leva à área correta conforme o tipo de pagamento');

await check('CARD_UI_11_PDF_IMPORT_POINTS_TO_CARD', async () => {
  await loadState(baseSyntheticState()); // isolado dos lançamentos criados nos casos anteriores
  const r = await page.evaluate(() => {
    currentMonth = 9; currentYear = 2026;
    navigate('cartoes');
    // confirmarLancamentosFatura não grava dataCompra (só mesInicio/anoInicio
    // vindos do texto extraído do PDF) — cai no modo legado de
    // getCompetenciaFatura ("mês da compra + 1"), a mesma regra de sempre
    // pra lançamentos sem data exata. Compra de 05/09 -> fatura de outubro.
    faturaPdfItensExtraidos = [{ data: '05/09', desc: 'Importado do PDF', valor: 88, incluir: true, cat: 'geral', subcat: '' }];
    confirmarLancamentosFatura('nu');
    const criada = state.despesas.find(d => d.desc === 'Importado do PDF');
    currentMonth = 10; currentYear = 2026; renderCartoes();
    const apareceNaFaturaCerta = document.getElementById('cartaoFaturaItens').innerHTML.includes('Importado do PDF');
    return { cartaoDaDespesa: criada?.cartao, cartaoSelecionado: window._faturaCartaoSelecionado, apareceNaFaturaCerta };
  });
  const ok = r.cartaoDaDespesa === 'nu' && r.cartaoSelecionado === 'nu' && r.apareceNaFaturaCerta;
  return { ok, detail: `importação de PDF continua gravando a despesa no cartão escolhido, e a área de Cartões / Faturas já mostra o cartão importado selecionado — obtido=${JSON.stringify(r)}` };
}, 'importação de fatura em PDF continua apontando ao cartão certo, refletido na nova área');

await check('CARD_UI_12_PROFILE_SWITCH_NO_MIX', async () => {
  const raw = {
    version: 2, perfilAtivo: 'perfilA',
    perfis: {
      perfilA: { id: 'perfilA', name: 'Perfil A', color: '#5b7fff', data: baseSyntheticState({
        despesas: [{ id: 'dA', desc: 'Compra do Perfil A', cat: 'geral', subcat: '', cartao: 'nu', conta: null, valor: 100, parcelas: 1, mesInicio: 9, anoInicio: 2026, dataCompra: '2026-09-02', fixa: false, pagoMeses: {}, split: [], repasses: {}, createdAt: 'dA' }],
      }) },
      perfilB: { id: 'perfilB', name: 'Perfil B', color: '#38e2b4', data: baseSyntheticState({
        despesas: [{ id: 'dB', desc: 'Compra do Perfil B', cat: 'geral', subcat: '', cartao: 'nu', conta: null, valor: 200, parcelas: 1, mesInicio: 9, anoInicio: 2026, dataCompra: '2026-09-02', fixa: false, pagoMeses: {}, split: [], repasses: {}, createdAt: 'dB' }],
      }) },
    },
  };
  await loadState(raw);
  const r = await page.evaluate(() => {
    currentMonth = 9; currentYear = 2026;
    navigate('cartoes'); selecionarFaturaCartao('nu');
    const faturaA = document.getElementById('cartaoFaturaItens').innerHTML;
    switchPerfil('perfilB');
    navigate('cartoes');
    const faturaB = document.getElementById('cartaoFaturaItens').innerHTML;
    return {
      aTemA: faturaA.includes('Compra do Perfil A'),
      bTemB: faturaB.includes('Compra do Perfil B'),
      bVazouA: faturaB.includes('Compra do Perfil A'),
    };
  });
  const ok = r.aTemA && r.bTemB && !r.bVazouA;
  return { ok, detail: `trocar de perfil deve mostrar só a fatura do perfil ativo, sem misturar compras do perfil anterior — obtido=${JSON.stringify(r)}` };
}, 'troca de perfil não mistura faturas entre perfis');

await check('CARD_UI_13_MOBILE_FIT', async () => {
  await loadState(baseSyntheticState());
  await page.setViewportSize({ width: 390, height: 844 });
  const r = await page.evaluate(() => {
    currentMonth = 9; currentYear = 2026;
    navigate('cartoes');
    const page1 = document.getElementById('page-cartoes');
    return { overflow: page1.scrollWidth > page1.clientWidth + 2 };
  });
  await page.setViewportSize({ width: 1440, height: 1600 });
  return { ok: !r.overflow, detail: `a área Cartões / Faturas não pode transbordar horizontalmente em tela de 390px — obtido=${JSON.stringify(r)}` };
}, 'navegação e componentes de Cartões / Faturas cabem em tela móvel');

await check('CARD_UI_14_NO_SCRIPT_ERRORS', async () => ({ ok: consoleErrors.length === 0, detail: `erros de console acumulados durante todo o arquivo: ${JSON.stringify(consoleErrors)}` }), 'nenhum erro de execução ao longo de todo o fluxo de Cartões / Faturas');
} finally {
  await close();
}

const fails = results.filter((r) => r.status === 'FAIL').length;
console.log(`gate5-cards-invoices-ui: TOTAL=${results.length} PASS=${results.length - fails} FAIL=${fails}`);
if (fails > 0) process.exitCode = 1;

export { results };
