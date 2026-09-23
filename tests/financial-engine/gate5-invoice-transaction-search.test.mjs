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
//   13-16. troca de mês/ano (set->out, out->set, dez->jan, jan->dez) com
//          pesquisa ativa limpa o termo e abre a nova competência completa
//          (achado P2, INVOICE-TRANSACTION-SEARCH-CODEX-AUDIT-2026-09-23)
//   17. pesquisa normal continua funcionando após a troca de mês
//   18. troca de cartão e sair/reabrir a aba continuam limpando a pesquisa
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

// ── 13. Troca de mês/ano com pesquisa ativa (achado P2 da auditoria Codex) ─
// docs/audits/INVOICE-TRANSACTION-SEARCH-CODEX-AUDIT-2026-09-23.md: changeMonth
// trocava a competência sem limpar #cartaoFaturaSearchInput, e o render
// seguinte reaplicava o termo antigo à fatura nova ("Nenhum lançamento
// encontrado…" falso). Cada competência abaixo tem lançamentos exclusivos,
// todos comprados antes do fechamento do Nubank (dia 3) do próprio mês.
const despMes = (id, desc, valor, mes, ano, dia) => ({
  id, desc, cat: 'geral', subcat: 'Geral', cartao: 'nu', conta: null,
  valor, parcelas: 1, mesInicio: mes, anoInicio: ano,
  dataCompra: `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`,
  fixa: false, diaVencimento: null, debitoAutomatico: false, pagoMeses: {}, split: [], repasses: {}, createdAt: id,
});
const FIXTURE_MESES = [
  despMes('s1', 'Amazon Prime', 39.9, 9, 2026, 2),
  despMes('s2', 'Farmacia Setembro', 80, 9, 2026, 1),
  despMes('o1', 'Netflix Outubro', 55.9, 10, 2026, 2),
  despMes('o2', 'Padaria Outubro', 20.1, 10, 2026, 1),
  despMes('z1', 'Presente Natal Dezembro', 150, 12, 2026, 1),
  despMes('j1', 'Material Escolar Janeiro', 210.5, 1, 2027, 1),
  despMes('j2', 'IPVA Janeiro', 400, 1, 2027, 2),
];

// Abre (mes/ano) na aba Fatura do Nubank, pesquisa `termo`, confirma o filtro,
// troca a competência via changeMonth(dir) real e devolve o que a nova fatura
// mostra. O total esperado é somado direto da fixture (conjunto completo).
async function trocarMesComPesquisa({ mes, ano, termo, dir }) {
  return page.evaluate(({ mes, ano, termo, dir, fixture }) => {
    currentMonth = mes; currentYear = ano;
    navigate('cartoes'); selecionarFaturaCartao('nu');
    const despesasAntes = JSON.stringify(state.despesas);
    const input = document.getElementById('cartaoFaturaSearchInput');
    input.value = termo; input.dispatchEvent(new Event('input'));
    const doMesOrigem = fixture.filter((d) => d.mesInicio === mes && d.anoInicio === ano);
    const htmlFiltrado = document.getElementById('cartaoFaturaItens').innerHTML;
    const filtroAtivoAntes = doMesOrigem.filter((d) => htmlFiltrado.includes(d.desc)).length === 1;

    changeMonth(dir);

    const doMesNovo = fixture.filter((d) => d.mesInicio === currentMonth && d.anoInicio === currentYear);
    const html = document.getElementById('cartaoFaturaItens').innerHTML;
    const resumo = document.getElementById('cartaoFaturaResumo').innerHTML;
    const totalEsperado = Math.round(doMesNovo.reduce((s, d) => s + d.valor, 0) * 100) / 100;
    const totalCalc = Math.round((calcByCardForMonth(currentMonth, currentYear)['nu'] || 0) * 100) / 100;
    return {
      filtroAtivoAntes,
      periodo: `${currentMonth}/${currentYear}`,
      campoVazio: document.getElementById('cartaoFaturaSearchInput').value === '',
      // O termo é lido do campo a cada render (não há outra variável de
      // estado): a query efetiva que renderFaturaCartoes aplicaria agora.
      queryInterna: (document.getElementById('cartaoFaturaSearchInput')?.value || '').trim().toLowerCase(),
      novosVisiveis: doMesNovo.length > 0 && doMesNovo.every((d) => html.includes(d.desc)),
      semMsgFalsa: !/nenhum lançamento encontrado/i.test(html),
      semItensDoMesAnterior: doMesOrigem.every((d) => !html.includes(d.desc)),
      totalEsperado, totalCalc,
      totalNoResumo: resumo.includes(fmtBRL(totalEsperado)),
      statusPendente: resumo.includes('Pendente'),
      despesasInalteradas: JSON.stringify(state.despesas) === despesasAntes,
    };
  }, { mes, ano, termo, dir, fixture: FIXTURE_MESES });
}
const trocaOk = (r, periodo) => r.filtroAtivoAntes && r.periodo === periodo && r.campoVazio && r.queryInterna === ''
  && r.novosVisiveis && r.semMsgFalsa && r.semItensDoMesAnterior
  && r.totalCalc === r.totalEsperado && r.totalNoResumo && r.statusPendente && r.despesasInalteradas;

await check('INVOICE_SEARCH_13_SEP_TO_OCT_CLEARS_SEARCH', async () => {
  await loadState(baseSyntheticState({ despesas: FIXTURE_MESES }));
  const r = await trocarMesComPesquisa({ mes: 9, ano: 2026, termo: 'amazon', dir: 1 });
  return { ok: trocaOk(r, '10/2026'), detail: `setembro com "amazon" -> changeMonth(1): campo/estado vazios, "Netflix Outubro" e "Padaria Outubro" visíveis, sem "nenhum lançamento encontrado", total = soma completa de outubro, state.despesas intacto — obtido=${JSON.stringify(r)}` };
}, 'setembro -> outubro com pesquisa ativa abre outubro completo, sem filtro residual');

await check('INVOICE_SEARCH_14_OCT_TO_SEP_CLEARS_SEARCH', async () => {
  const r = await trocarMesComPesquisa({ mes: 10, ano: 2026, termo: 'netflix', dir: -1 });
  return { ok: trocaOk(r, '9/2026'), detail: `outubro com "netflix" -> changeMonth(-1): setembro completo, sem filtro residual — obtido=${JSON.stringify(r)}` };
}, 'outubro -> setembro com pesquisa ativa abre setembro completo, sem filtro residual');

await check('INVOICE_SEARCH_15_DEC_TO_JAN_CLEARS_SEARCH', async () => {
  const r = await trocarMesComPesquisa({ mes: 12, ano: 2026, termo: 'natal', dir: 1 });
  return { ok: trocaOk(r, '1/2027'), detail: `dezembro/2026 com "natal" -> changeMonth(1) vira janeiro/2027 completo, sem filtro residual — obtido=${JSON.stringify(r)}` };
}, 'virada dezembro -> janeiro (troca de ano) limpa a pesquisa');

await check('INVOICE_SEARCH_16_JAN_TO_DEC_CLEARS_SEARCH', async () => {
  const r = await trocarMesComPesquisa({ mes: 1, ano: 2027, termo: 'escolar', dir: -1 });
  return { ok: trocaOk(r, '12/2026'), detail: `janeiro/2027 com "escolar" -> changeMonth(-1) volta a dezembro/2026 completo, sem filtro residual — obtido=${JSON.stringify(r)}` };
}, 'virada janeiro -> dezembro (troca de ano) limpa a pesquisa');

await check('INVOICE_SEARCH_17_SEARCH_WORKS_AFTER_MONTH_CHANGE', async () => {
  const r = await page.evaluate(() => {
    currentMonth = 9; currentYear = 2026;
    navigate('cartoes'); selecionarFaturaCartao('nu');
    const antes = JSON.stringify(state.despesas);
    const input = document.getElementById('cartaoFaturaSearchInput');
    input.value = 'amazon'; input.dispatchEvent(new Event('input'));
    changeMonth(1);
    input.value = 'NETFLIX'; input.dispatchEvent(new Event('input'));
    const filtrado = document.getElementById('cartaoFaturaItens').innerHTML;
    input.value = 'amazon'; input.dispatchEvent(new Event('input'));
    const semMatch = document.getElementById('cartaoFaturaItens').innerHTML;
    limparPesquisaFatura();
    const limpo = document.getElementById('cartaoFaturaItens').innerHTML;
    return {
      filtraNetflix: filtrado.includes('Netflix Outubro') && !filtrado.includes('Padaria Outubro'),
      semMatchLegitimo: /nenhum lançamento encontrado/i.test(semMatch),
      limparRestaura: limpo.includes('Netflix Outubro') && limpo.includes('Padaria Outubro'),
      despesasInalteradas: JSON.stringify(state.despesas) === antes,
    };
  });
  const ok = r.filtraNetflix && r.semMatchLegitimo && r.limparRestaura && r.despesasInalteradas;
  return { ok, detail: `depois da troca de mês, pesquisar/limpar continua funcionando normalmente na nova fatura — obtido=${JSON.stringify(r)}` };
}, 'pesquisa normal continua funcionando na nova competência após a troca de mês');

await check('INVOICE_SEARCH_18_CARD_SWITCH_AND_REOPEN_STILL_CLEAR', async () => {
  const r = await page.evaluate(() => {
    currentMonth = 10; currentYear = 2026;
    navigate('cartoes'); selecionarFaturaCartao('nu');
    const input = document.getElementById('cartaoFaturaSearchInput');
    input.value = 'netflix'; input.dispatchEvent(new Event('input'));
    selecionarFaturaCartao('semfecha'); selecionarFaturaCartao('nu');
    const aposCartao = { vazio: input.value === '', html: document.getElementById('cartaoFaturaItens').innerHTML };
    input.value = 'netflix'; input.dispatchEvent(new Event('input'));
    navigate('dashboard'); navigate('cartoes'); selecionarFaturaCartao('nu');
    const aposReabrir = { vazio: input.value === '', html: document.getElementById('cartaoFaturaItens').innerHTML };
    const completo = (h) => h.includes('Netflix Outubro') && h.includes('Padaria Outubro');
    return { cartaoLimpa: aposCartao.vazio && completo(aposCartao.html), reabrirLimpa: aposReabrir.vazio && completo(aposReabrir.html) };
  });
  const ok = r.cartaoLimpa && r.reabrirLimpa;
  return { ok, detail: `trocar de cartão e sair/reabrir a aba continuam limpando a pesquisa e exibindo a fatura completa — obtido=${JSON.stringify(r)}` };
}, 'troca de cartão e fechar/reabrir a fatura continuam limpando a pesquisa');

await check('NO_SCRIPT_ERRORS', async () => ({ ok: consoleErrors.length === 0, detail: `erros de console acumulados: ${JSON.stringify(consoleErrors)}` }), 'nenhum erro de execução ao longo da correção do campo de pesquisa da fatura');

} finally {
  await close();
}

const fails = results.filter((r) => r.status === 'FAIL').length;
console.log(`gate5-invoice-transaction-search: TOTAL=${results.length} PASS=${results.length - fails} FAIL=${fails}`);
if (fails > 0) process.exitCode = 1;

export { results };
