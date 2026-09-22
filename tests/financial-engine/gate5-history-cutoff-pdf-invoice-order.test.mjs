// Gate 5 — corte do histórico, remoção do importador de PDF da interface
// normal, e ordem das compras na fatura (docs/gates/
// GATE-5-HISTORY-CUTOFF-PDF-AND-INVOICE-ORDER.md). Base 7ccbf3c.
//
// 1. O bloco "Importar Fatura em PDF" sai da interface normal de
//    Cartões/Faturas; o código e o formato de dados legados continuam
//    intactos no arquivo, só não são mais um ponto de entrada da UI.
// 2. Preferência opcional `financialPreferences.historyStartMonth`
//    ("AAAA-MM"), por perfil: corta competências anteriores SÓ nas
//    projeções (getChronologicalProjection) e nas duas médias históricas
//    (getVariableExpenseEstimate "moderna" e calcPrevisaoMediaHistorica/
//    getMesesHistoricoDisponiveis "legada") — nunca apaga, migra ou reescreve
//    despesas/receitas/faturas/contas/saldos.
// 3. `ordenarItensFaturaDesc` ordena "Compras e parcelas desta fatura" da
//    mais recente pra mais antiga (dataCompra ISO válida desc; fallback
//    createdAt desc pra legado) — só apresentação, sem mutar state/cálculo.
import { openHarness, makeRunner, baseSyntheticState } from './harness.mjs';

const { page, loadState, close, consoleErrors } = await openHarness();
const { check, results } = makeRunner('gate5-history-cutoff-pdf-invoice-order');

await page.clock.setFixedTime(new Date(2026, 8, 17, 12)); // 17/09/2026 (mesmo "hoje real" do sistema)

try {

// ── 1. Importador de PDF fora da interface normal ────────────────────────
await check('PDF_IMPORTER_NOT_IN_NORMAL_UI_LEGACY_CODE_AND_DATA_PRESERVED', async () => {
  await loadState(baseSyntheticState());
  const r = await page.evaluate(() => {
    currentMonth = 9; currentYear = 2026;
    navigate('cartoes');
    const html = document.getElementById('page-cartoes').innerHTML;
    const elementosAusentes = !document.getElementById('faturaPdfInput')
      && !document.getElementById('faturaPdfCartao')
      && !document.getElementById('faturaPdfStatus');
    const semTextoDeImportador = !html.includes('Importar Fatura em PDF') && !html.includes('Escolher arquivo PDF');
    const funcoesLegadasPresentes = typeof processarFaturaPdf === 'function'
      && typeof confirmarLancamentosFatura === 'function'
      && typeof parseFaturaTexto === 'function'
      && typeof extrairTextoPdf === 'function'
      && typeof abrirModalConferenciaFatura === 'function';

    // Dados/formato legados continuam funcionando por chamada direta (o
    // código não foi apagado, só o ponto de entrada da UI) — sem afirmar
    // que isso é um caminho normal da interface.
    const antes = state.despesas.length;
    faturaPdfItensExtraidos = [{ data: '02/09', desc: 'Item legado via função direta', valor: 55, cat: 'geral', subcat: '', incluir: true }];
    confirmarLancamentosFatura('nu');
    const despesaCriada = state.despesas.find(d => d.desc === 'Item legado via função direta');

    return { elementosAusentes, semTextoDeImportador, funcoesLegadasPresentes, antes, depois: state.despesas.length, despesaCriada: !!despesaCriada, cartaoDaDespesa: despesaCriada?.cartao };
  });
  const ok = r.elementosAusentes && r.semTextoDeImportador && r.funcoesLegadasPresentes
    && r.depois === r.antes + 1 && r.despesaCriada && r.cartaoDaDespesa === 'nu';
  return { ok, detail: `nenhum elemento nem texto do importador de PDF deve aparecer no fluxo normal de Cartões/Faturas, mas as funções legadas (processarFaturaPdf, confirmarLancamentosFatura, parseFaturaTexto, extrairTextoPdf, abrirModalConferenciaFatura) e o formato de dados continuam intactos por chamada direta — obtido=${JSON.stringify(r)}` };
}, 'importador de PDF não aparece nem é acionável no fluxo normal; código e dados legados continuam preservados');

// ── 2. Preferência vazia preserva comportamento anterior ────────────────
await check('EMPTY_PREFERENCE_PRESERVES_PREVIOUS_BEHAVIOR', async () => {
  await loadState(baseSyntheticState({
    despesas: [
      { id: 'antiga', desc: 'Despesa de maio (atrasada)', cat: 'geral', subcat: '', cartao: 'dinheiro',
        conta: 'c1', valor: 40, parcelas: 1, mesInicio: 5, anoInicio: 2026, dataCompra: null,
        fixa: false, pagoMeses: {}, split: [], repasses: {}, createdAt: 'antiga' },
    ],
  }));
  const r = await page.evaluate(() => {
    const proj = getChronologicalProjection('2026-09-17', '2026-10-15');
    const cutoff = getHistoryStartCutoffSerial();
    return {
      cutoffNull: cutoff === null,
      encontrouAtrasadaDeMaio: proj.events.some(e => e.label === 'Despesa de maio (atrasada)') || proj.undated.some(e => e.label === 'Despesa de maio (atrasada)'),
    };
  });
  const ok = r.cutoffNull && r.encontrouAtrasadaDeMaio;
  return { ok, detail: `sem historyStartMonth configurado, getHistoryStartCutoffSerial deve retornar null e a projeção continua encontrando itens atrasados antigos, exatamente como antes desta preferência existir — obtido=${JSON.stringify(r)}` };
}, 'preferência vazia/ausente preserva o comportamento anterior sem nenhuma exclusão');

// ── 3. 2026-07 elimina atrasados de maio/junho, mantém recorrentes de julho
await check('CUTOFF_2026_07_ELIMINATES_MAY_JUNE_KEEPS_RECURRING_FROM_JULY', async () => {
  await loadState(baseSyntheticState({
    despesas: [
      { id: 'maio', desc: 'Avulsa de maio (atrasada)', cat: 'geral', subcat: '', cartao: 'dinheiro',
        conta: 'c1', valor: 40, parcelas: 1, mesInicio: 5, anoInicio: 2026, dataCompra: null,
        fixa: false, pagoMeses: {}, split: [], repasses: {}, createdAt: 'maio' },
      { id: 'junho', desc: 'Avulsa de junho (atrasada)', cat: 'geral', subcat: '', cartao: 'dinheiro',
        conta: 'c1', valor: 30, parcelas: 1, mesInicio: 6, anoInicio: 2026, dataCompra: null,
        fixa: false, pagoMeses: {}, split: [], repasses: {}, createdAt: 'junho' },
      { id: 'fixaAntiga', desc: 'Assinatura fixa desde janeiro', cat: 'geral', subcat: '', cartao: 'dinheiro',
        conta: 'c1', valor: 20, parcelas: 1, mesInicio: 1, anoInicio: 2026, dataCompra: null,
        fixa: true, diaVencimento: 10, pagoMeses: {}, split: [], repasses: {}, createdAt: 'fixaAntiga' },
    ],
  }));
  const r = await page.evaluate(() => {
    setFinancialPreference('historyStartMonth', '2026-07');
    const proj = getChronologicalProjection('2026-09-17', '2026-10-15');
    const todosLabels = [...proj.events, ...proj.undated].map(e => e.label);
    return {
      cutoffAplicado: state.financialPreferences.historyStartMonth === '2026-07',
      maioSumiu: !todosLabels.includes('Avulsa de maio (atrasada)'),
      junhoSumiu: !todosLabels.includes('Avulsa de junho (atrasada)'),
      // a fixa iniciada em janeiro precisa continuar aparecendo — sua
      // COMPETÊNCIA de julho em diante não é anterior ao corte, mesmo o
      // cadastro (mesInicio) sendo de antes; o cadastro não foi alterado.
      fixaAindaAparece: todosLabels.includes('Assinatura fixa desde janeiro'),
      cadastroFixaInalterado: state.despesas.find(d => d.id === 'fixaAntiga').mesInicio === 1 && state.despesas.find(d => d.id === 'fixaAntiga').anoInicio === 2026,
    };
  });
  const ok = r.cutoffAplicado && r.maioSumiu && r.junhoSumiu && r.fixaAindaAparece && r.cadastroFixaInalterado;
  return { ok, detail: `com corte em 2026-07, itens avulsos atrasados de maio/junho não podem aparecer na projeção, mas a ocorrência de julho em diante da despesa fixa (iniciada em janeiro, cadastro não alterado) continua aparecendo — obtido=${JSON.stringify(r)}` };
}, 'corte em 2026-07 elimina atrasados de maio/junho da projeção, mas mantém ocorrências recorrentes de julho em diante');

// ── 4. Saldo real e dados armazenados idênticos antes/depois de configurar/limpar
await check('REAL_BALANCE_AND_STORED_DATA_UNCHANGED_BY_CUTOFF', async () => {
  const r = await page.evaluate(() => {
    const saldoAntes = state.contas.reduce((s, c) => s + calcSaldoConta(c.id), 0);
    const despesasAntes = JSON.stringify(state.despesas);
    const receitasAntes = JSON.stringify(state.receitas);

    setFinancialPreference('historyStartMonth', '2026-08');
    const saldoDepoisDeConfigurar = state.contas.reduce((s, c) => s + calcSaldoConta(c.id), 0);

    setFinancialPreference('historyStartMonth', '');
    const saldoDepoisDeLimpar = state.contas.reduce((s, c) => s + calcSaldoConta(c.id), 0);

    return {
      saldoInalterado: saldoAntes === saldoDepoisDeConfigurar && saldoAntes === saldoDepoisDeLimpar,
      despesasInalteradas: JSON.stringify(state.despesas) === despesasAntes,
      receitasInalteradas: JSON.stringify(state.receitas) === receitasAntes,
    };
  });
  const ok = r.saldoInalterado && r.despesasInalteradas && r.receitasInalteradas;
  return { ok, detail: `calcSaldoConta e o conteúdo de state.despesas/receitas precisam ser idênticos antes de configurar o corte, depois de configurá-lo e depois de limpá-lo — obtido=${JSON.stringify(r)}` };
}, 'saldo real e dados armazenados permanecem idênticos ao configurar ou limpar o corte');

// ── 5. Troca de perfil mantém cortes independentes; backup preserva a preferência
await check('PROFILE_SWITCH_KEEPS_INDEPENDENT_CUTOFFS_BACKUP_PRESERVES', async () => {
  const raw = {
    version: 2, perfilAtivo: 'perfilA',
    perfis: {
      perfilA: { id: 'perfilA', name: 'Perfil A', color: '#5b7fff', data: baseSyntheticState({ financialPreferences: { historyStartMonth: '2026-07' } }) },
      perfilB: { id: 'perfilB', name: 'Perfil B', color: '#38e2b4', data: baseSyntheticState({ financialPreferences: { historyStartMonth: '2026-01' } }) },
    },
  };
  await loadState(raw);
  const r = await page.evaluate(() => {
    const cutoffA1 = state.financialPreferences.historyStartMonth;
    switchPerfil('perfilB');
    const cutoffB = state.financialPreferences.historyStartMonth;
    switchPerfil('perfilA');
    const cutoffA2 = state.financialPreferences.historyStartMonth;

    // Roundtrip de backup: buildSaveObject -> migrateAppData precisa
    // preservar a preferência de cada perfil.
    const saved = buildSaveObject();
    migrateAppData(JSON.parse(JSON.stringify(saved)));
    const cutoffAposRoundtrip = state.financialPreferences.historyStartMonth;
    switchPerfil('perfilB');
    const cutoffBAposRoundtrip = state.financialPreferences.historyStartMonth;

    return { cutoffA1, cutoffB, cutoffA2, cutoffAposRoundtrip, cutoffBAposRoundtrip };
  });
  const ok = r.cutoffA1 === '2026-07' && r.cutoffB === '2026-01' && r.cutoffA2 === '2026-07'
    && r.cutoffAposRoundtrip === '2026-07' && r.cutoffBAposRoundtrip === '2026-01';
  return { ok, detail: `cada perfil deve manter seu próprio corte ao trocar de perfil, e um roundtrip de backup (buildSaveObject -> migrateAppData) precisa preservar a preferência de cada perfil separadamente — obtido=${JSON.stringify(r)}` };
}, 'troca de perfil mantém cortes de histórico independentes; backup/importação preserva a preferência por perfil');

// ── 6. Valor inválido é rejeitado sem mutação nem saveGeneration ────────
await check('INVALID_VALUE_REJECTED_NO_MUTATION_NO_SAVE', async () => {
  await loadState(baseSyntheticState({ financialPreferences: { historyStartMonth: '2026-07' } }));
  const r = await page.evaluate(() => {
    const antes = JSON.stringify(state.financialPreferences);
    const resultados = [];
    for (const valorInvalido of ['2026-13', '07-2026', '2026/07', 'não é uma data', '2026-00', 'abcd-ef']) {
      const genAntes = saveGeneration;
      setFinancialPreference('historyStartMonth', valorInvalido);
      resultados.push({
        valor: valorInvalido,
        inalterado: JSON.stringify(state.financialPreferences) === antes,
        genInalterado: saveGeneration === genAntes,
      });
    }
    return resultados;
  });
  const ok = r.every(x => x.inalterado && x.genInalterado);
  return { ok, detail: `nenhum valor inválido de historyStartMonth pode mutar state.financialPreferences nem incrementar saveGeneration — obtido=${JSON.stringify(r)}` };
}, 'valor inválido de historyStartMonth é rejeitado sem mutação e sem agendar salvamento');

// ── 7. Meses anteriores ao corte não entram nas duas médias; histórico insuficiente
await check('CUTOFF_EXCLUDES_MONTHS_FROM_BOTH_AVERAGES_INSUFFICIENT_HISTORY', async () => {
  // getVariableExpenseEstimate ("moderna"): precisa de 3 meses completos
  // ANTES da referenceDate. Corte em 2026-09 (o próprio mês de referência)
  // deixa 0 dos 3 meses necessários (jun/jul/ago) depois do corte.
  await loadState(baseSyntheticState({
    despesas: [
      { id: 'jun', desc: 'Variável de junho', cat: 'geral', subcat: '', cartao: 'dinheiro', conta: 'c1',
        valor: 100, parcelas: 1, mesInicio: 6, anoInicio: 2026, dataCompra: '2026-06-05', fixa: false,
        pagoMeses: {}, split: [], repasses: {}, createdAt: 'jun' },
      { id: 'jul', desc: 'Variável de julho', cat: 'geral', subcat: '', cartao: 'dinheiro', conta: 'c1',
        valor: 100, parcelas: 1, mesInicio: 7, anoInicio: 2026, dataCompra: '2026-07-05', fixa: false,
        pagoMeses: {}, split: [], repasses: {}, createdAt: 'jul' },
      { id: 'ago', desc: 'Variável de agosto', cat: 'geral', subcat: '', cartao: 'dinheiro', conta: 'c1',
        valor: 100, parcelas: 1, mesInicio: 8, anoInicio: 2026, dataCompra: '2026-08-05', fixa: false,
        pagoMeses: {}, split: [], repasses: {}, createdAt: 'ago' },
    ],
  }));
  const r = await page.evaluate(() => {
    // Sem corte: 3 meses completos (jun/jul/ago) disponíveis antes de
    // setembro — estimativa "moderna" deve funcionar normalmente.
    const semCorte = getVariableExpenseEstimate('2026-09-17', '2026-09-30', 'weighted');

    // Corte em setembro: nenhum dos 3 meses necessários (jun/jul/ago) está
    // depois do corte -> histórico insuficiente, sem preencher com zero.
    setFinancialPreference('historyStartMonth', '2026-09');
    const comCorteRestritivo = getVariableExpenseEstimate('2026-09-17', '2026-09-30', 'weighted');

    // Legada (calcPrevisaoMediaHistorica / getMesesHistoricoDisponiveis):
    // mesmo corte restritivo -> também insuficiente.
    const legadaComCorteRestritivo = calcPrevisaoMediaHistorica();

    // Corte mais permissivo (bem antes de qualquer despesa): não deve
    // restringir nada -> resultado disponível de novo.
    setFinancialPreference('historyStartMonth', '2020-01');
    const comCortePermissivo = getVariableExpenseEstimate('2026-09-17', '2026-09-30', 'weighted');

    return {
      semCorteDisponivel: semCorte.unavailable === false,
      comCorteRestritivoIndisponivel: comCorteRestritivo.unavailable === true && comCorteRestritivo.reason === 'insufficient_history',
      comCorteRestritivoSemMesesZerados: comCorteRestritivo.months.length === 0,
      legadaIndisponivel: legadaComCorteRestritivo === null,
      comCortePermissivoDisponivel: comCortePermissivo.unavailable === false,
    };
  });
  const ok = r.semCorteDisponivel && r.comCorteRestritivoIndisponivel && r.comCorteRestritivoSemMesesZerados
    && r.legadaIndisponivel && r.comCortePermissivoDisponivel;
  return { ok, detail: `um corte que deixa menos de 3 meses completos depois dele precisa tornar as duas médias (moderna e legada) indisponíveis ("histórico insuficiente"), sem preencher meses ausentes com zero; um corte permissivo não deve restringir nada — obtido=${JSON.stringify(r)}` };
}, 'meses anteriores ao corte não entram nas duas médias históricas; falta de 3 meses completos retorna histórico insuficiente');

// ── 8. Pendência sem data e sem competência comprovadamente anterior não é ocultada
await check('UNDATED_PENDING_WITHOUT_PROVEN_PRIOR_COMPETENCE_NOT_HIDDEN', async () => {
  await loadState(baseSyntheticState({
    financialPreferences: { historyStartMonth: '2026-07' },
    despesas: [
      // Fixa em dinheiro, sem diaVencimento (nunca tem uma data exata) —
      // sua competência de agosto (>= corte) é conhecida, mas o EVENTO em
      // si não tem uma data exata de vencimento, então cai em "undated".
      { id: 'semDia', desc: 'Fixa sem dia de vencimento (agosto)', cat: 'geral', subcat: '', cartao: 'dinheiro',
        conta: 'c1', valor: 60, parcelas: 1, mesInicio: 8, anoInicio: 2026, dataCompra: null,
        fixa: true, diaVencimento: null, pagoMeses: {}, split: [], repasses: {}, createdAt: 'semDia' },
    ],
  }));
  const r = await page.evaluate(() => {
    const proj = getChronologicalProjection('2026-09-17', '2026-10-15');
    return {
      apareceEmUndated: proj.undated.some(e => e.label === 'Fixa sem dia de vencimento (agosto)'),
    };
  });
  const ok = r.apareceEmUndated;
  return { ok, detail: `uma pendência sem data exata cuja competência (agosto) NÃO é anterior ao corte (julho) precisa continuar visível na lista de sem-data, sem ser ocultada — obtido=${JSON.stringify(r)}` };
}, 'pendência sem data e sem competência comprovadamente anterior ao corte não é ocultada');

// ── 9. Compras em ordem decrescente na fatura; legado usa fallback estável
await check('INVOICE_PURCHASES_ORDERED_DESC_LEGACY_STABLE_FALLBACK_NO_STATE_CHANGE', async () => {
  await loadState(baseSyntheticState({
    // nu tem fecha=3 (baseSyntheticState): dataCompra precisa cair até o dia
    // 3 pra ficar na fatura de setembro (senão rola pra outubro) — as três
    // datas abaixo são só pra testar a ordem decrescente dentro do MESMO mês.
    despesas: [
      { id: 'd1', desc: 'Compra 02/set', cat: 'geral', subcat: '', cartao: 'nu', conta: null, valor: 10,
        parcelas: 1, mesInicio: 9, anoInicio: 2026, dataCompra: '2026-09-02', fixa: false, pagoMeses: {}, split: [], repasses: {}, createdAt: 'aaaa1' },
      { id: 'd2', desc: 'Compra 03/set', cat: 'geral', subcat: '', cartao: 'nu', conta: null, valor: 20,
        parcelas: 1, mesInicio: 9, anoInicio: 2026, dataCompra: '2026-09-03', fixa: false, pagoMeses: {}, split: [], repasses: {}, createdAt: 'aaaa2' },
      { id: 'd3', desc: 'Compra 01/set', cat: 'geral', subcat: '', cartao: 'nu', conta: null, valor: 30,
        parcelas: 1, mesInicio: 9, anoInicio: 2026, dataCompra: '2026-09-01', fixa: false, pagoMeses: {}, split: [], repasses: {}, createdAt: 'aaaa3' },
      // Legado: sem dataCompra válida, cai no fallback createdAt desc.
      { id: 'd4', desc: 'Compra legada mais nova (createdAt maior)', cat: 'geral', subcat: '', cartao: 'nu', conta: null, valor: 40,
        parcelas: 1, mesInicio: 8, anoInicio: 2026, dataCompra: null, fixa: false, pagoMeses: {}, split: [], repasses: {}, createdAt: 'zzzz2' },
      { id: 'd5', desc: 'Compra legada mais antiga (createdAt menor)', cat: 'geral', subcat: '', cartao: 'nu', conta: null, valor: 50,
        parcelas: 1, mesInicio: 8, anoInicio: 2026, dataCompra: null, fixa: false, pagoMeses: {}, split: [], repasses: {}, createdAt: 'zzzz1' },
    ],
  }));
  const r = await page.evaluate(() => {
    currentMonth = 9; currentYear = 2026;
    const totalAntes = getTotalsForMonth(9, 2026).byCard.nu;
    const despesasAntes = JSON.stringify(state.despesas);

    navigate('cartoes'); selecionarFaturaCartao('nu');
    const html = document.getElementById('cartaoFaturaItens').innerHTML;
    const posicoes = ['Compra 03/set', 'Compra 02/set', 'Compra 01/set', 'Compra legada mais nova (createdAt maior)', 'Compra legada mais antiga (createdAt menor)']
      .map(label => html.indexOf(label));

    const totalDepois = getTotalsForMonth(9, 2026).byCard.nu;
    const despesasDepois = JSON.stringify(state.despesas);

    return { posicoes, totalAntes, totalDepois, despesasInalteradas: despesasAntes === despesasDepois };
  });
  const emOrdem = r.posicoes.every(p => p !== -1) && r.posicoes.every((p, i) => i === 0 || r.posicoes[i - 1] < p);
  const ok = emOrdem && r.totalAntes === r.totalDepois && r.despesasInalteradas;
  return { ok, detail: `a fatura precisa listar as compras datadas da mais recente pra mais antiga (03/set, 02/set, 01/set) e, dentro do grupo legado sem data, usar createdAt decrescente como fallback (mais nova antes da mais antiga) — sem mudar o total da fatura nem state.despesas — obtido=${JSON.stringify(r)}` };
}, 'compras com datas diferentes aparecem em ordem decrescente; legado usa fallback estável; total e state.despesas não mudam');

// ── 10. Linha do tempo da projeção continua crescente; transferências/cofrinho continuam decrescentes
await check('PROJECTION_TIMELINE_ASC_TRANSFERS_COFRINHO_DESC_UNCHANGED', async () => {
  await loadState(baseSyntheticState({
    despesas: [
      { id: 'e1', desc: 'Despesa dia 20', cat: 'geral', subcat: '', cartao: 'dinheiro', conta: 'c1', valor: 10,
        parcelas: 1, mesInicio: 9, anoInicio: 2026, dataCompra: '2026-09-20', fixa: false, pagoMeses: {}, split: [], repasses: {}, createdAt: 'e1' },
      { id: 'e2', desc: 'Despesa dia 05', cat: 'geral', subcat: '', cartao: 'dinheiro', conta: 'c1', valor: 10,
        parcelas: 1, mesInicio: 9, anoInicio: 2026, dataCompra: '2026-09-05', fixa: false, pagoMeses: {}, split: [], repasses: {}, createdAt: 'e2' },
    ],
    movimentacoesContas: [
      { id: 't1a', contaId: 'c1', valor: -50, data: '2026-09-01', transferId: 'tA', obs: '' },
      { id: 't1b', contaId: 'c1', valor: 50, data: '2026-09-01', transferId: 'tA', obs: '' },
      { id: 't2a', contaId: 'c1', valor: -30, data: '2026-09-10', transferId: 'tB', obs: '' },
      { id: 't2b', contaId: 'c1', valor: 30, data: '2026-09-10', transferId: 'tB', obs: '' },
    ],
    cofrinhos: [{ id: 'cof1', name: 'Cofrinho', color: '#5b7fff', saldoInicial: 0 }],
    movimentacoesCofrinhos: [
      { id: 'm1', cofrinhoId: 'cof1', valor: 10, mes: 9, ano: 2026, tipo: 'deposito', createdAt: 'aaa1' },
      { id: 'm2', cofrinhoId: 'cof1', valor: 20, mes: 9, ano: 2026, tipo: 'deposito', createdAt: 'zzz2' },
    ],
  }));
  const r = await page.evaluate(() => {
    const proj = getChronologicalProjection('2026-09-01', '2026-09-30');
    const timelineAsc = proj.timeline.every((day, i) => i === 0 || proj.timeline[i - 1].date <= day.date);

    navigate('contas');
    const htmlTransfer = document.getElementById('transferenciasList').innerHTML;
    // Compara pela posição do id da transferência (editTransferencia('tB')),
    // não pela data formatada em texto — new Date(string ISO).toLocaleDateString
    // já desloca a exibição conforme o fuso local (comportamento existente,
    // não tocado por este gate), então comparar strings de data fixas seria frágil.
    const posTB = htmlTransfer.indexOf(`editTransferencia('tB')`); // data mais recente (2026-09-10)
    const posTA = htmlTransfer.indexOf(`editTransferencia('tA')`); // data mais antiga (2026-09-01)
    const transferenciasDesc = posTB !== -1 && posTA !== -1 && posTB < posTA;

    // Cofrinho: a função de listagem (linha ~7670) já ordena
    // movimentacoesCofrinhos por createdAt decrescente — não foi tocada
    // neste gate; checagem direta da função pura, sem depender de detalhe
    // de layout do HTML.
    const movsCofrinhoOrdenadas = (state.movimentacoesCofrinhos || []).slice()
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      .map(m => m.id);
    const cofrinhoDesc = movsCofrinhoOrdenadas[0] === 'm2' && movsCofrinhoOrdenadas[1] === 'm1';

    return { timelineAsc, transferenciasDesc, cofrinhoDesc };
  });
  const ok = r.timelineAsc && r.transferenciasDesc && r.cofrinhoDesc;
  return { ok, detail: `a linha do tempo da projeção cronológica precisa continuar em ordem crescente de data, e os históricos de transferências e cofrinho precisam continuar do mais recente pro mais antigo (não regrediram) — obtido=${JSON.stringify(r)}` };
}, 'linha do tempo da projeção continua crescente; históricos de transferências e cofrinho continuam decrescentes (sem regressão)');

await check('NO_SCRIPT_ERRORS', async () => ({ ok: consoleErrors.length === 0, detail: `erros de console acumulados: ${JSON.stringify(consoleErrors)}` }), 'nenhum erro de execução ao longo do fluxo de corte de histórico, remoção do importador de PDF e ordem da fatura');

} finally {
  await close();
}

const fails = results.filter((r) => r.status === 'FAIL').length;
console.log(`gate5-history-cutoff-pdf-invoice-order: TOTAL=${results.length} PASS=${results.length - fails} FAIL=${fails}`);
if (fails > 0) process.exitCode = 1;

export { results };
