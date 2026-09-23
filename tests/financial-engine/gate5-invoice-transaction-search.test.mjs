// Correção — "Pesquisar Lançamento" de volta na aba Fatura
// (docs/handoffs/, branch fix/invoice-transaction-search, base 9896327).
//
// A área "Cartões / Faturas" (page-cartoes) não tinha nenhum campo pra
// localizar uma compra específica dentro da fatura aberta — só existia a
// busca GLOBAL "Pesquisar Lançamento" (abrirPesquisaLancamentos), presente
// nas abas Receitas/Despesas, que varre TODOS os meses/anos e não filtra a
// fatura atual. Este arquivo cobre o campo novo (#cartaoFaturaSearchInput)
// + a função pura matchFaturaSearch, que só decidem o que é IMPRESSO na
// lista "Compras e parcelas desta fatura" — nunca tocam state.despesas, o
// total da fatura (calcByCardForMonth), o status de pagamento
// (isFaturaPaga) nem a ordenação (ordenarItensFaturaDesc, Gate 5).
//
// Critérios cobertos:
//   1. campo de pesquisa visível na aba Fatura
//   2. pesquisa por descrição
//   3. case-insensitive
//   4. texto sem correspondência -> mensagem clara, sem apagar dado
//   5. limpar a pesquisa restaura a listagem completa
//   6. fatura vazia (sem compras) continua com a mensagem original
//   7. ordenação original preservada com o filtro ativo
//   8. total da fatura inalterado durante a filtragem
//   9. state.despesas integralmente inalterado
//   10. ausência de erros de console
//   11. importador de PDF não reapareceu
//   12. regressão da suíte financeira completa (ver run-all.mjs)
import { openHarness, makeRunner, baseSyntheticState } from './harness.mjs';

const { page, loadState, close, consoleErrors } = await openHarness();
const { check, results } = makeRunner('gate5-invoice-transaction-search');

await page.clock.setFixedTime(new Date(2026, 8, 17, 12)); // 17/09/2026

const FIXTURE_DESPESAS = [
  { id: 'd1', desc: 'Amazon Prime', cat: 'geral', subcat: 'Geral', cartao: 'nu', conta: null,
    valor: 39.9, parcelas: 1, mesInicio: 9, anoInicio: 2026, dataCompra: '2026-09-02',
    fixa: false, diaVencimento: null, debitoAutomatico: false, pagoMeses: {}, split: [], repasses: {}, createdAt: 'd1' },
  { id: 'd2', desc: 'Supermercado Extra', cat: 'geral', subcat: 'Geral', cartao: 'nu', conta: null,
    valor: 250, parcelas: 1, mesInicio: 9, anoInicio: 2026, dataCompra: '2026-09-01',
    fixa: false, diaVencimento: null, debitoAutomatico: false, pagoMeses: {}, split: [], repasses: {}, createdAt: 'd2' },
  { id: 'd3', desc: 'Posto Ipiranga', cat: 'geral', subcat: 'Geral', cartao: 'nu', conta: null,
    valor: 300, parcelas: 3, mesInicio: 8, anoInicio: 2026, dataCompra: '2026-08-30',
    fixa: false, diaVencimento: null, debitoAutomatico: false, pagoMeses: {}, split: [], repasses: {}, createdAt: 'd3' },
];

try {

// ── 1. Campo de pesquisa visível na aba Fatura ────────────────────────────
await check('INVOICE_SEARCH_01_FIELD_VISIBLE', async () => {
  await loadState(baseSyntheticState({ despesas: FIXTURE_DESPESAS }));
  const r = await page.evaluate(() => {
    currentMonth = 9; currentYear = 2026;
    navigate('cartoes'); selecionarFaturaCartao('nu');
    const input = document.getElementById('cartaoFaturaSearchInput');
    const rect = input?.getBoundingClientRect();
    return {
      existe: !!input,
      visivel: !!rect && rect.width > 0 && rect.height > 0,
      dentroDaFatura: !!document.querySelector('#page-cartoes #cartaoFaturaSearchInput'),
    };
  });
  const ok = r.existe && r.visivel && r.dentroDaFatura;
  return { ok, detail: `o campo #cartaoFaturaSearchInput precisa existir, estar visível e estar dentro de #page-cartoes — obtido=${JSON.stringify(r)}` };
}, 'campo de pesquisa fica visível e utilizável na aba Fatura');

// ── 2. Pesquisa por descrição ─────────────────────────────────────────────
await check('INVOICE_SEARCH_02_FILTER_BY_DESCRIPTION', async () => {
  const r = await page.evaluate(() => {
    navigate('cartoes'); selecionarFaturaCartao('nu');
    const input = document.getElementById('cartaoFaturaSearchInput');
    input.value = 'amazon'; input.dispatchEvent(new Event('input'));
    const html = document.getElementById('cartaoFaturaItens').innerHTML;
    return { temAmazon: html.includes('Amazon Prime'), temExtra: html.includes('Supermercado Extra'), temPosto: html.includes('Posto Ipiranga') };
  });
  const ok = r.temAmazon && !r.temExtra && !r.temPosto;
  return { ok, detail: `pesquisar "amazon" deve mostrar só "Amazon Prime" e esconder as demais compras da fatura — obtido=${JSON.stringify(r)}` };
}, 'pesquisa por descrição filtra só os lançamentos correspondentes da fatura atual');

// ── 3. Case-insensitive ────────────────────────────────────────────────────
await check('INVOICE_SEARCH_03_CASE_INSENSITIVE', async () => {
  const r = await page.evaluate(() => {
    navigate('cartoes'); selecionarFaturaCartao('nu');
    const input = document.getElementById('cartaoFaturaSearchInput');
    const resultados = {};
    for (const termo of ['SUPERMERCADO', 'sUpErMeRcAdO', 'supermercado']) {
      input.value = termo; input.dispatchEvent(new Event('input'));
      resultados[termo] = document.getElementById('cartaoFaturaItens').innerHTML.includes('Supermercado Extra');
    }
    return resultados;
  });
  const ok = Object.values(r).every(Boolean);
  return { ok, detail: `"SUPERMERCADO", "sUpErMeRcAdO" e "supermercado" devem encontrar o mesmo lançamento — obtido=${JSON.stringify(r)}` };
}, 'pesquisa não diferencia maiúsculas de minúsculas');

// ── 4. Texto sem correspondência ──────────────────────────────────────────
await check('INVOICE_SEARCH_04_NO_MATCH_MESSAGE', async () => {
  const r = await page.evaluate(() => {
    navigate('cartoes'); selecionarFaturaCartao('nu');
    const despesasAntes = JSON.stringify(state.despesas);
    const input = document.getElementById('cartaoFaturaSearchInput');
    input.value = 'zzz-nao-existe-zzz'; input.dispatchEvent(new Event('input'));
    const html = document.getElementById('cartaoFaturaItens').innerHTML;
    return {
      mensagemClara: /nenhum/i.test(html) && /encontrad/i.test(html),
      semItens: !html.includes('Amazon Prime') && !html.includes('Supermercado Extra') && !html.includes('Posto Ipiranga'),
      despesasInalteradas: JSON.stringify(state.despesas) === despesasAntes,
    };
  });
  const ok = r.mensagemClara && r.semItens && r.despesasInalteradas;
  return { ok, detail: `sem correspondência, deve aparecer uma mensagem clara de "nenhum ... encontrado", sem nenhum item, e sem alterar state.despesas — obtido=${JSON.stringify(r)}` };
}, 'texto sem correspondência exibe mensagem clara sem apagar ou alterar dados');

// ── 5. Limpar a pesquisa restaura a listagem completa ─────────────────────
await check('INVOICE_SEARCH_05_CLEAR_RESTORES_FULL_LIST', async () => {
  const r = await page.evaluate(() => {
    navigate('cartoes'); selecionarFaturaCartao('nu');
    const input = document.getElementById('cartaoFaturaSearchInput');
    input.value = 'amazon'; input.dispatchEvent(new Event('input'));
    const filtrado = document.getElementById('cartaoFaturaItens').innerHTML;
    limparPesquisaFatura();
    const restaurado = document.getElementById('cartaoFaturaItens').innerHTML;
    return {
      filtradoSoAmazon: filtrado.includes('Amazon Prime') && !filtrado.includes('Supermercado Extra'),
      inputVazio: document.getElementById('cartaoFaturaSearchInput').value === '',
      restauradoCompleto: restaurado.includes('Amazon Prime') && restaurado.includes('Supermercado Extra') && restaurado.includes('Posto Ipiranga'),
    };
  });
  const ok = r.filtradoSoAmazon && r.inputVazio && r.restauradoCompleto;
  return { ok, detail: `limpar a pesquisa (botão "Limpar") precisa esvaziar o campo e mostrar de novo as 3 compras da fatura — obtido=${JSON.stringify(r)}` };
}, 'limpar a pesquisa restaura imediatamente a listagem completa da fatura');

// ── 5b. Texto vazio (digitado, não só o botão Limpar) também mostra tudo ──
await check('INVOICE_SEARCH_05B_EMPTY_TEXT_SHOWS_ALL', async () => {
  const r = await page.evaluate(() => {
    navigate('cartoes'); selecionarFaturaCartao('nu');
    const input = document.getElementById('cartaoFaturaSearchInput');
    input.value = 'amazon'; input.dispatchEvent(new Event('input'));
    input.value = ''; input.dispatchEvent(new Event('input'));
    const html = document.getElementById('cartaoFaturaItens').innerHTML;
    return { todasPresentes: html.includes('Amazon Prime') && html.includes('Supermercado Extra') && html.includes('Posto Ipiranga') };
  });
  const ok = r.todasPresentes;
  return { ok, detail: `apagar o texto manualmente até ficar vazio deve mostrar todos os lançamentos da fatura, igual ao comportamento anterior — obtido=${JSON.stringify(r)}` };
}, 'texto vazio preserva o comportamento anterior: exibe todos os lançamentos da fatura');

// ── 6. Fatura vazia ────────────────────────────────────────────────────────
await check('INVOICE_SEARCH_06_EMPTY_INVOICE', async () => {
  await loadState(baseSyntheticState({ despesas: [] }));
  const r = await page.evaluate(() => {
    currentMonth = 9; currentYear = 2026;
    navigate('cartoes'); selecionarFaturaCartao('nu');
    const semBusca = document.getElementById('cartaoFaturaItens').innerHTML;
    const input = document.getElementById('cartaoFaturaSearchInput');
    input.value = 'qualquer coisa'; input.dispatchEvent(new Event('input'));
    const comBusca = document.getElementById('cartaoFaturaItens').innerHTML;
    return {
      campoAindaVisivel: !!document.getElementById('cartaoFaturaSearchInput'),
      semBuscaVazia: /nenhuma compra/i.test(semBusca),
      comBuscaVazia: /nenhuma compra/i.test(comBusca),
    };
  });
  const ok = r.campoAindaVisivel && r.semBuscaVazia && r.comBuscaVazia;
  return { ok, detail: `fatura sem nenhuma compra deve manter a mensagem original ("Nenhuma compra nesta fatura ainda"), com ou sem texto digitado, e o campo continua visível — obtido=${JSON.stringify(r)}` };
}, 'fatura vazia mantém a mensagem original e o campo de pesquisa continua acessível');

// ── 7. Ordenação original preservada com o filtro ativo ───────────────────
await check('INVOICE_SEARCH_07_ORDER_PRESERVED', async () => {
  await loadState(baseSyntheticState({ despesas: FIXTURE_DESPESAS }));
  const r = await page.evaluate(() => {
    currentMonth = 9; currentYear = 2026;
    navigate('cartoes'); selecionarFaturaCartao('nu');
    // Sem filtro: dataCompra desc -> Amazon (02/09) antes de Extra (01/09).
    const semFiltro = document.getElementById('cartaoFaturaItens').innerHTML;
    const posAmazonSemFiltro = semFiltro.indexOf('Amazon Prime');
    const posExtraSemFiltro = semFiltro.indexOf('Supermercado Extra');
    const input = document.getElementById('cartaoFaturaSearchInput');
    // Filtro amplo o bastante pra manter os dois itens de setembro visíveis.
    input.value = '2026'; input.dispatchEvent(new Event('input'));
    const comFiltro = document.getElementById('cartaoFaturaItens').innerHTML;
    const posAmazonComFiltro = comFiltro.indexOf('Amazon Prime');
    const posExtraComFiltro = comFiltro.indexOf('Supermercado Extra');
    return {
      ordemOriginal: posAmazonSemFiltro !== -1 && posExtraSemFiltro !== -1 && posAmazonSemFiltro < posExtraSemFiltro,
      ordemComFiltro: posAmazonComFiltro !== -1 && posExtraComFiltro !== -1 && posAmazonComFiltro < posExtraComFiltro,
    };
  });
  const ok = r.ordemOriginal && r.ordemComFiltro;
  return { ok, detail: `a ordem (mais recente primeiro, ordenarItensFaturaDesc) precisa ser a mesma com ou sem filtro ativo — obtido=${JSON.stringify(r)}` };
}, 'a pesquisa não altera a ordenação original da fatura (mais recente primeiro)');

// ── 8. Total da fatura inalterado durante a filtragem ─────────────────────
await check('INVOICE_SEARCH_08_TOTAL_UNCHANGED', async () => {
  const r = await page.evaluate(() => {
    navigate('cartoes'); selecionarFaturaCartao('nu');
    const totalAntes = calcByCardForMonth(9, 2026)['nu'];
    const resumoAntes = document.getElementById('cartaoFaturaResumo').innerHTML;
    const input = document.getElementById('cartaoFaturaSearchInput');
    input.value = 'amazon'; input.dispatchEvent(new Event('input'));
    const totalDepois = calcByCardForMonth(9, 2026)['nu'];
    const resumoDepois = document.getElementById('cartaoFaturaResumo').innerHTML;
    return { totalAntes, totalDepois, resumoIdentico: resumoAntes === resumoDepois };
  });
  const ok = r.totalAntes === r.totalDepois && r.resumoIdentico;
  return { ok, detail: `calcByCardForMonth e o card-resumo (total, status de pagamento, fechamento/vencimento) precisam ficar idênticos ao filtrar a lista — obtido=${JSON.stringify(r)}` };
}, 'total, saldo e status da fatura permanecem inalterados durante a filtragem');

// ── 9. state.despesas integralmente inalterado ────────────────────────────
await check('INVOICE_SEARCH_09_DESPESAS_UNCHANGED', async () => {
  const r = await page.evaluate(() => {
    const antes = JSON.stringify(state.despesas);
    navigate('cartoes'); selecionarFaturaCartao('nu');
    const input = document.getElementById('cartaoFaturaSearchInput');
    input.value = 'posto'; input.dispatchEvent(new Event('input'));
    input.value = 'zzz-sem-match'; input.dispatchEvent(new Event('input'));
    limparPesquisaFatura();
    const depois = JSON.stringify(state.despesas);
    return { igual: antes === depois };
  });
  const ok = r.igual;
  return { ok, detail: `state.despesas precisa continuar byte-a-byte idêntico depois de pesquisar, não encontrar nada e limpar — obtido=${JSON.stringify(r)}` };
}, 'pesquisar/limpar nunca muta state.despesas');

// ── 11. Importador de PDF não reapareceu ──────────────────────────────────
await check('INVOICE_SEARCH_11_PDF_IMPORTER_STILL_ABSENT', async () => {
  const r = await page.evaluate(() => {
    navigate('cartoes');
    const html = document.getElementById('page-cartoes').innerHTML;
    return {
      elementosAusentes: !document.getElementById('faturaPdfInput') && !document.getElementById('faturaPdfCartao') && !document.getElementById('faturaPdfStatus'),
      semTexto: !html.includes('Importar Fatura em PDF') && !html.includes('Escolher arquivo PDF'),
    };
  });
  const ok = r.elementosAusentes && r.semTexto;
  return { ok, detail: `a correção do campo de pesquisa não pode reintroduzir o importador de PDF (Gate 5) na UI normal — obtido=${JSON.stringify(r)}` };
}, 'importador de PDF continua fora da interface normal de Cartões/Faturas');

await check('NO_SCRIPT_ERRORS', async () => ({ ok: consoleErrors.length === 0, detail: `erros de console acumulados: ${JSON.stringify(consoleErrors)}` }), 'nenhum erro de execução ao longo da correção do campo de pesquisa da fatura');

} finally {
  await close();
}

const fails = results.filter((r) => r.status === 'FAIL').length;
console.log(`gate5-invoice-transaction-search: TOTAL=${results.length} PASS=${results.length - fails} FAIL=${fails}`);
if (fails > 0) process.exitCode = 1;

export { results };
