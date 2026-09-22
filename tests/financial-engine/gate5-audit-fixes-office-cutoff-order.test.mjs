// Gate 5 — correção dos três achados da auditoria Codex sobre corte de
// histórico, PDF e ordem da fatura (docs/audits/
// HISTORY-CUTOFF-PDF-INVOICE-ORDER-REVIEW.md, documentação vigente ca9bb4d,
// entrega anterior Claude Code 62dcbef).
//
// 1. [P1] Seção 4 do Gate 5 (Descoberta do parcelamento no Caixa do
//    Escritório) não estava implementada: "Entrada e parcelamento" ficava
//    inteiramente oculta em Potencial. Agora fica sempre visível, com os
//    controles desabilitados fora de Contratado e uma indicação direta;
//    habilita imediatamente ao selecionar Contratado; sair de Contratado
//    antes do cadastro não persiste valores nem gera recebível (guarda de
//    addOfficeProjeto já existente, inalterada).
// 2. [P2] getChronologicalProjection aplicava o corte historyStartMonth só
//    no scan mensal, não no laço global sobre state.receitas que gera
//    missing_revenue_date/invalid_received_date pra itens únicos — uma
//    receita com competência (mes/ano) comprovadamente anterior ao corte
//    ainda disparava o aviso.
// 3. [P2] ordenarItensFaturaDesc não desempatava por `id` depois de
//    dataCompra/createdAt — a ordem final podia mudar conforme a ordem de
//    entrada do array (Array.sort só é estável quando não há mais critério).
import { openHarness, makeRunner, baseSyntheticState } from './harness.mjs';

const { page, loadState, close, consoleErrors } = await openHarness();
const { check, results } = makeRunner('gate5-audit-fixes-office-cutoff-order');

await page.clock.setFixedTime(new Date(2026, 8, 17, 12)); // 17/09/2026

try {

// ── Achado 1 / critério 11 ────────────────────────────────────────────
await check('OFFICE_ENTRADA_SECTION_ALWAYS_VISIBLE_DISABLED_OUTSIDE_CONTRATADO', async () => {
  await loadState(baseSyntheticState());
  await page.evaluate(() => {
    state.office.contas.push({ id: 'oc1', name: 'Conta Escritório', color: '#ff9900', saldoInicial: 0 });
  });
  const r = await page.evaluate(() => {
    navigate('escritorio');
    renderOfficeProjetosTab();
    const fieldsEl = document.getElementById('newProjContratadoFields');
    const hintEl = document.getElementById('newProjContratadoHint');

    // Estado inicial: status default é 'potencial'.
    const visivelInicialmente = fieldsEl && getComputedStyle(fieldsEl).display !== 'none' && !fieldsEl.hidden;
    const desabilitadoInicialmente = [...fieldsEl.querySelectorAll('input,select')].every(el => el.disabled);
    const dicaVisivelInicialmente = hintEl && hintEl.style.display !== 'none';

    // Seleciona Contratado: habilita imediatamente.
    document.getElementById('newProjStatus').value = 'contratado';
    onNewProjStatusChange();
    const habilitadoEmContratado = [...fieldsEl.querySelectorAll('input,select')].every(el => !el.disabled);
    const dicaOcultaEmContratado = hintEl.style.display === 'none';
    const aindaVisivelEmContratado = getComputedStyle(fieldsEl).display !== 'none';

    // Volta pra Potencial: desabilita de novo, sem sumir a seção.
    document.getElementById('newProjStatus').value = 'potencial';
    onNewProjStatusChange();
    const desabilitadoDeNovo = [...fieldsEl.querySelectorAll('input,select')].every(el => el.disabled);
    const aindaVisivelDeNovo = getComputedStyle(fieldsEl).display !== 'none';
    const dicaVisivelDeNovo = hintEl.style.display !== 'none';

    return {
      visivelInicialmente, desabilitadoInicialmente, dicaVisivelInicialmente,
      habilitadoEmContratado, dicaOcultaEmContratado, aindaVisivelEmContratado,
      desabilitadoDeNovo, aindaVisivelDeNovo, dicaVisivelDeNovo,
    };
  });
  const ok = r.visivelInicialmente && r.desabilitadoInicialmente && r.dicaVisivelInicialmente
    && r.habilitadoEmContratado && r.dicaOcultaEmContratado && r.aindaVisivelEmContratado
    && r.desabilitadoDeNovo && r.aindaVisivelDeNovo && r.dicaVisivelDeNovo;
  return { ok, detail: `a seção "Entrada e parcelamento" precisa estar sempre visível (nunca display:none) — desabilitada com dica em Potencial, habilitada e sem dica em Contratado, e desabilitada com dica de novo ao sair de Contratado — obtido=${JSON.stringify(r)}` };
}, 'seção Entrada e parcelamento fica sempre visível; desabilitada fora de Contratado, habilitada imediatamente ao selecionar Contratado');

await check('OFFICE_LEAVING_CONTRATADO_BEFORE_SAVE_PERSISTS_NOTHING', async () => {
  const r = await page.evaluate(() => {
    document.getElementById('newProjNome').value = 'Projeto abandonado';
    document.getElementById('newProjValor').value = '5000';
    document.getElementById('newProjStatus').value = 'contratado';
    onNewProjStatusChange();
    // Usuário digita os campos financeiros enquanto está em Contratado...
    document.getElementById('newProjEntradaValor').value = '1000';
    document.getElementById('newProjEntradaData').value = '2026-10-01';
    document.getElementById('newProjParcelasQtd').value = '4';
    document.getElementById('newProjParcelaData').value = '2026-11-01';
    document.getElementById('newProjConta').value = 'oc1';
    // ...mas muda de ideia e volta pra Potencial ANTES de salvar.
    document.getElementById('newProjStatus').value = 'potencial';
    onNewProjStatusChange();

    const projetosAntes = state.office.projetos.length;
    const recebiveisAntes = state.office.recebiveis.length;
    addOfficeProjeto();
    const projeto = state.office.projetos[state.office.projetos.length - 1];

    return {
      criouProjeto: state.office.projetos.length === projetosAntes + 1,
      statusFinal: projeto.status,
      semCamposFinanceirosPersistidos: projeto.valorEntrada === undefined && projeto.qtdParcelas === undefined,
      nenhumRecebivelCriado: state.office.recebiveis.length === recebiveisAntes,
    };
  });
  const ok = r.criouProjeto && r.statusFinal === 'potencial' && r.semCamposFinanceirosPersistidos && r.nenhumRecebivelCriado;
  return { ok, detail: `digitar valores enquanto Contratado e depois voltar pra Potencial antes de salvar não pode persistir nenhum campo financeiro no projeto nem criar recebível — obtido=${JSON.stringify(r)}` };
}, 'sair de Contratado antes do cadastro não persiste valores digitados nem gera recebível');

// ── Achado 1 / critério 12 ────────────────────────────────────────────
await check('OFFICE_CONTRATADO_FLOW_STILL_GENERATES_ONCE_AFTER_UI_CHANGE', async () => {
  const r = await page.evaluate(() => {
    document.getElementById('newProjNome').value = 'Projeto Regressão';
    document.getElementById('newProjCliente').value = 'Cliente Regressão';
    document.getElementById('newProjValor').value = '3000';
    document.getElementById('newProjStatus').value = 'contratado';
    onNewProjStatusChange();
    document.getElementById('newProjEntradaValor').value = '1000';
    document.getElementById('newProjEntradaData').value = '2026-10-01';
    document.getElementById('newProjEntradaRecebida').checked = false;
    document.getElementById('newProjParcelasQtd').value = '2';
    document.getElementById('newProjParcelaData').value = '2026-11-01';
    document.getElementById('newProjConta').value = 'oc1';

    const recebiveisAntes = state.office.recebiveis.length;
    addOfficeProjeto();
    const projeto = state.office.projetos[state.office.projetos.length - 1];
    const recebiveisDoProjeto = state.office.recebiveis.filter(r => r.projetoId === projeto.id);

    // Múltiplos renders não podem duplicar (mesma garantia de sempre —
    // geração só acontece no cadastro, nunca em render).
    renderOfficeProjetosTab(); renderOfficeProjetosTab();
    const recebiveisAposRenders = state.office.recebiveis.filter(r => r.projetoId === projeto.id).length;

    return {
      recebiveisGerados: recebiveisDoProjeto.length,
      entrada: recebiveisDoProjeto.find(x => x.descricao === 'Entrada')?.valor,
      somaTotal: recebiveisDoProjeto.reduce((s, x) => s + x.valor, 0),
      recebiveisAposRenders,
    };
  });
  const ok = r.recebiveisGerados === 3 && r.entrada === 1000 && Math.abs(r.somaTotal - 3000) < 0.01 && r.recebiveisAposRenders === 3;
  return { ok, detail: `o fluxo contratado (entrada + parcelas) continua gerando os recebíveis certos exatamente uma vez, mesmo depois da mudança de visibilidade da seção — obtido=${JSON.stringify(r)}` };
}, 'fluxo contratado continua gerando entrada/parcelas uma única vez após a correção de visibilidade');

// ── Achado 2 ─────────────────────────────────────────────────────────
await check('CUTOFF_SUPPRESSES_MISSING_REVENUE_DATE_FOR_PROVABLY_PRIOR_COMPETENCE', async () => {
  await loadState(baseSyntheticState({
    financialPreferences: { historyStartMonth: '2026-07' },
    receitas: [
      // Reprodução literal da auditoria: competência maio/2026 (antes do
      // corte), prevista, sem dataPrevista válida.
      { id: 'r-old', tipo: 'projeto', nome: 'Receita antiga', valor: 500, conta: 'c1',
        certeza: 'contratado', estado: 'previsto', dataPrevista: null, mes: 5, ano: 2026, recebidaMeses: {} },
      // Controle: mesma forma, mas competência DEPOIS do corte — precisa
      // continuar gerando o aviso normalmente (a checagem não pode ter
      // sido simplesmente desligada).
      { id: 'r-new', tipo: 'projeto', nome: 'Receita recente', valor: 500, conta: 'c1',
        certeza: 'contratado', estado: 'previsto', dataPrevista: null, mes: 8, ano: 2026, recebidaMeses: {} },
      // Controle: sem mes/ano (competência não determinável) — precisa
      // continuar visível/flagada, nunca oculta por suposição.
      { id: 'r-no-comp', tipo: 'projeto', nome: 'Receita sem competência', valor: 500, conta: 'c1',
        certeza: 'contratado', estado: 'previsto', dataPrevista: null, mes: null, ano: null, recebidaMeses: {} },
    ],
  }));
  const r = await page.evaluate(() => {
    const proj = getChronologicalProjection('2026-09-17', '2026-10-15');
    const razoes = id => proj.issues.filter(i => i.id === id).map(i => i.reason);
    return {
      antigaSemAviso: razoes('r-old').length === 0,
      recenteAindaComAviso: razoes('r-new').includes('missing_revenue_date'),
      semCompetenciaAindaComAviso: razoes('r-no-comp').includes('missing_revenue_date'),
    };
  });
  const ok = r.antigaSemAviso && r.recenteAindaComAviso && r.semCompetenciaAindaComAviso;
  return { ok, detail: `uma receita única de competência maio/2026 (antes do corte 2026-07) não pode gerar missing_revenue_date; a mesma situação em agosto/2026 (depois do corte) e uma receita sem competência determinável continuam gerando o aviso normalmente — obtido=${JSON.stringify(r)}` };
}, 'receita única com competência comprovadamente anterior ao corte não gera aviso de pendência (missing_revenue_date)');

await check('CUTOFF_SUPPRESSES_INVALID_RECEIVED_DATE_FOR_PROVABLY_PRIOR_COMPETENCE', async () => {
  await loadState(baseSyntheticState({
    financialPreferences: { historyStartMonth: '2026-07' },
    receitas: [
      { id: 'r-old-recv', tipo: 'projeto', nome: 'Recebida antiga sem data real válida', valor: 400, conta: 'c1',
        certeza: 'contratado', estado: 'recebido', dataRecebimento: null, mes: 5, ano: 2026, recebidaMeses: {} },
      { id: 'r-new-recv', tipo: 'projeto', nome: 'Recebida recente sem data real válida', valor: 400, conta: 'c1',
        certeza: 'contratado', estado: 'recebido', dataRecebimento: null, mes: 8, ano: 2026, recebidaMeses: {} },
    ],
  }));
  const r = await page.evaluate(() => {
    const proj = getChronologicalProjection('2026-09-17', '2026-10-15');
    const razoes = id => proj.issues.filter(i => i.id === id).map(i => i.reason);
    return {
      antigaSemAviso: razoes('r-old-recv').length === 0,
      recenteAindaComAviso: razoes('r-new-recv').includes('invalid_received_date'),
    };
  });
  const ok = r.antigaSemAviso && r.recenteAindaComAviso;
  return { ok, detail: `mesma regra pra invalid_received_date: competência de maio/2026 (antes do corte) não gera aviso; agosto/2026 (depois do corte) continua gerando — obtido=${JSON.stringify(r)}` };
}, 'receita única recebida com data real inválida e competência anterior ao corte não gera aviso (invalid_received_date)');

// ── Achado 3 ─────────────────────────────────────────────────────────
await check('INVOICE_ORDER_TIEBREAKS_BY_ID_DETERMINISTICALLY', async () => {
  const r = await page.evaluate(() => {
    // Reprodução literal da auditoria: mesma dataCompra, mesmo createdAt,
    // ids 'a' e 'b', em ordens de entrada opostas.
    const itemA = { id: 'a', desc: 'A', cartao: 'nu', valor: 10, dataCompra: '2026-09-02', createdAt: 'same' };
    const itemB = { id: 'b', desc: 'B', cartao: 'nu', valor: 20, dataCompra: '2026-09-02', createdAt: 'same' };
    const first = ordenarItensFaturaDesc([itemB, itemA]).map(x => x.id);
    const second = ordenarItensFaturaDesc([itemA, itemB]).map(x => x.id);
    return { first, second };
  });
  const ok = JSON.stringify(r.first) === JSON.stringify(r.second);
  return { ok, detail: `com dataCompra e createdAt empatados, a ordem de saída precisa ser a mesma independente da ordem de entrada (desempate determinístico por id) — obtido=${JSON.stringify(r)}` };
}, 'ordenarItensFaturaDesc desempata por id após dataCompra/createdAt, produzindo o mesmo resultado com entrada invertida');

await check('INVOICE_ORDER_TIEBREAK_DOES_NOT_MUTATE_STATE', async () => {
  await loadState(baseSyntheticState({
    despesas: [
      { id: 'x2', desc: 'Segunda no array', cat: 'geral', subcat: '', cartao: 'nu', conta: null, valor: 20,
        parcelas: 1, mesInicio: 9, anoInicio: 2026, dataCompra: '2026-09-02', fixa: false, pagoMeses: {}, split: [], repasses: {}, createdAt: 'same' },
      { id: 'x1', desc: 'Primeira no array', cat: 'geral', subcat: '', cartao: 'nu', conta: null, valor: 10,
        parcelas: 1, mesInicio: 9, anoInicio: 2026, dataCompra: '2026-09-02', fixa: false, pagoMeses: {}, split: [], repasses: {}, createdAt: 'same' },
    ],
  }));
  const r = await page.evaluate(() => {
    currentMonth = 9; currentYear = 2026;
    const despesasAntes = JSON.stringify(state.despesas);
    navigate('cartoes'); selecionarFaturaCartao('nu');
    const html = document.getElementById('cartaoFaturaItens').innerHTML;
    const posX1 = html.indexOf('Primeira no array');
    const posX2 = html.indexOf('Segunda no array');
    return {
      despesasInalteradas: JSON.stringify(state.despesas) === despesasAntes,
      ambosEncontrados: posX1 !== -1 && posX2 !== -1,
      // checagem direta e inequívoca: a posição relativa bate com o
      // critério de desempate por id usado em ordenarItensFaturaDesc
      // ((b.id).localeCompare(a.id) — id maior primeiro, "x2" antes de "x1").
      ordemBateComIdDesc: posX2 < posX1,
    };
  });
  const ok = r.despesasInalteradas && r.ambosEncontrados && r.ordemBateComIdDesc;
  return { ok, detail: `renderizar a fatura com o novo desempate por id não pode mutar state.despesas, e a ordem exibida precisa bater com o critério de desempate (id maior primeiro, já que dataCompra/createdAt empatam) — obtido=${JSON.stringify(r)}` };
}, 'desempate por id na fatura não muta state e produz ordem coerente com o critério documentado');

await check('NO_SCRIPT_ERRORS', async () => ({ ok: consoleErrors.length === 0, detail: `erros de console acumulados: ${JSON.stringify(consoleErrors)}` }), 'nenhum erro de execução ao longo dos três achados corrigidos');

} finally {
  await close();
}

const fails = results.filter((r) => r.status === 'FAIL').length;
console.log(`gate5-audit-fixes-office-cutoff-order: TOTAL=${results.length} PASS=${results.length - fails} FAIL=${fails}`);
if (fails > 0) process.exitCode = 1;

export { results };
