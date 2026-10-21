// SEC-2B1 — identificadores do domínio pessoal em HTML e handlers inline.
//
// Testes defensivos em navegador real, com dados 100% sintéticos. IDs válidos
// para o domínio (strings) não são normalizados nem remapeados. Registros
// legados estruturalmente ambíguos (ID vazio/duplicado, tipo não textual e
// referência órfã) são caracterizados separadamente: esta etapa não os corrige.
// OAuth/Drive reais nunca são usados; o Drive é interceptado pelo Playwright.
import { openHarness, makeRunner, baseSyntheticState } from './harness.mjs';

const { page, loadState, close, consoleErrors } = await openHarness();
const { check, results } = makeRunner('sec2-id-render');

await page.clock.setFixedTime(new Date(2026, 9, 15, 12));

const dialogs = [];
page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss().catch(() => {}); });
const externalRequests = [];
await page.route('**/sec2.invalid/**', (route) => {
  externalRequests.push(route.request().url());
  route.abort();
});

const EXEC = 'window.__sec2Executed=(window.__sec2Executed||0)+1';
const SPECIAL = `id ' " & <tag> &#39; Ünicode 😀 com espaços \\ linha\n" data-sec2-injected autofocus onfocus="${EXEC}`;
const IDS = Object.freeze({
  category: `categoria:${SPECIAL}`,
  card: `cartao:${SPECIAL}`,
  account: `conta:${SPECIAL}`,
  revenue: `receita:${SPECIAL}`,
  expense: `despesa:${SPECIAL}`,
  person: `pessoa:${SPECIAL}`,
  saving: `cofrinho:${SPECIAL}`,
  savingMove: `mov-cofrinho:${SPECIAL}`,
  transfer: `transferencia:${SPECIAL}`,
  scenario: `cenario:${SPECIAL}`,
  missing: `inexistente:${SPECIAL}`,
});

function personalState() {
  return baseSyntheticState({
    categories: [{ id: IDS.category, name: 'Categoria sintética', subs: ['Sub sintética'] }],
    cards: [
      { id: 'dinheiro', name: 'Dinheiro/PIX', color: '#38e2b4', fecha: null, paga: null },
      { id: IDS.card, name: 'Cartão sintético', color: '#123456', fecha: 31, paga: 10 },
    ],
    contas: [
      { id: IDS.account, name: 'Conta sintética', color: '#654321', saldoInicial: 1000 },
      { id: 'conta-destino', name: 'Conta destino', color: '#234567', saldoInicial: 0 },
    ],
    receitas: [{
      id: IDS.revenue, nome: 'Receita sintética', tipo: 'extra', valor: 500,
      mes: 10, ano: 2026, conta: IDS.account, recebida: false, createdAt: '2026-10-01T10:00:00Z',
    }],
    despesas: [{
      id: IDS.expense, desc: 'Despesa sintética', cat: IDS.category, subcat: 'Sub sintética',
      cartao: 'dinheiro', conta: IDS.account, valor: 120, parcelas: 1, mesInicio: 10,
      anoInicio: 2026, dataCompra: '2026-10-02', fixa: false, pagoMeses: {},
      split: [{ personId: IDS.person, percent: 50 }], createdAt: '2026-10-02T10:00:00Z',
    }, {
      id: 'compra-cartao-sintetica', desc: 'Compra no cartão sintética', cat: IDS.category,
      subcat: 'Sub sintética', cartao: IDS.card, conta: null, valor: 80, parcelas: 1,
      mesInicio: 10, anoInicio: 2026, dataCompra: '2026-10-03', fixa: false,
      pagoMeses: {}, split: [], createdAt: '2026-10-03T10:00:00Z',
    }],
    pessoas: [{ id: IDS.person, name: 'Pessoa sintética', color: '#336699' }],
    cofrinhos: [{ id: IDS.saving, name: 'Cofrinho sintético', color: '#445566', saldoInicial: 100 }],
    movimentacoesCofrinhos: [{
      id: IDS.savingMove, cofrinhoId: IDS.saving, valor: 10, mes: 10, ano: 2026,
      obs: 'Movimento sintético', contaId: IDS.account, createdAt: '2026-10-03T10:00:00Z',
    }],
    movimentacoesContas: [
      { id: 'tr-out', transferId: IDS.transfer, contaId: IDS.account, valor: -20, data: '2026-10-04T10:00:00Z', obs: 'Transferência sintética' },
      { id: 'tr-in', transferId: IDS.transfer, contaId: 'conta-destino', valor: 20, data: '2026-10-04T10:00:00Z', obs: 'Transferência sintética' },
    ],
    faturasPagas: {}, faturasContas: {}, faturasPagasData: {}, faturasAjustes: {},
  });
}

function wrappedData() {
  const data = personalState();
  return {
    version: 2,
    perfilAtivo: 'perfil-sec2',
    perfis: { 'perfil-sec2': { id: 'perfil-sec2', name: 'Perfil SEC-2', color: '#5b7fff', data } },
  };
}

const DATA_JSON = JSON.stringify(wrappedData());
const IDS_JSON = JSON.stringify(IDS);

async function installHelpers() {
  await page.evaluate((idsJson) => {
    window.__IDS = JSON.parse(idsJson);
    window.__sec2Executed = 0;
    window.__sec2Scan = () => {
      const bad = [];
      if (window.__sec2Executed) bad.push(`exec=${window.__sec2Executed}`);
      document.querySelectorAll('[data-sec2-injected]').forEach((el) => bad.push(`data-sec2-injected:${el.tagName}`));
      document.querySelectorAll('[autofocus]').forEach((el) => bad.push(`autofocus:${el.tagName}`));
      document.querySelectorAll('[onfocus]').forEach((el) => bad.push(`onfocus:${el.tagName}`));
      document.querySelectorAll('#appShell script, #modalOverlay script, #appShell iframe, #modalOverlay iframe')
        .forEach((el) => bad.push(`elemento:${el.tagName}`));
      return bad;
    };
    window.__captureClick = (fnName, selector, expected) => {
      const elements = [...document.querySelectorAll(selector)];
      if (!elements.length) return { ok: false, reason: `ausente:${selector}` };
      const original = window[fnName];
      let args = null;
      window[fnName] = (...received) => { args = received; };
      let el = elements[0];
      try {
        for (const candidate of elements) {
          args = null;
          candidate.click();
          if (args?.[0] === expected) { el = candidate; break; }
        }
      } finally { window[fnName] = original; }
      return {
        ok: !!args && args[0] === expected,
        args,
        onclick: el.getAttribute('onclick'),
        elementCount: document.querySelectorAll(selector).length,
      };
    };
    window.__optionHasExact = (selector, expected) => {
      const el = document.querySelector(selector);
      if (!el) return { ok: false, reason: `ausente:${selector}` };
      const values = [...el.options].map((o) => o.value);
      return { ok: values.includes(expected), values };
    };
    window.__captureEvent = (fnName, selector, eventName, expected) => {
      const el = document.querySelector(selector);
      if (!el) return { ok: false, reason: `ausente:${selector}` };
      const original = window[fnName];
      let args = null;
      window[fnName] = (...received) => { args = received; };
      try { el.dispatchEvent(new Event(eventName, { bubbles: true })); }
      finally { window[fnName] = original; }
      return { ok: !!args && args[0] === expected, args, handler: el.getAttribute(`on${eventName}`) };
    };
  }, IDS_JSON);
}

async function importSynthetic() {
  await loadState(baseSyntheticState());
  await page.evaluate((json) => {
    const input = document.querySelector('input[type=file][accept=".json"]');
    const dt = new DataTransfer();
    dt.items.add(new File([json], 'sec2-identificadores-sinteticos.json', { type: 'application/json' }));
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, DATA_JSON);
  await page.waitForFunction((expected) => state?.contas?.some((x) => x.id === expected), IDS.account);
  await installHelpers();
}

function allOk(items) {
  return items.every((x) => x && x.ok);
}

try {
  // Importação pelo fluxo real e preservação byte a byte dos IDs textuais.
  await importSynthetic();
  const importedSnapshot = await page.evaluate(() => JSON.stringify(buildSaveObject()));

  await check('SEC2B1_IMPORT_PRESERVES_STRING_IDS', async () => {
    const observed = await page.evaluate(() => ({
      category: state.categories[0].id,
      card: state.cards.find((x) => x.id !== 'dinheiro').id,
      account: state.contas[0].id,
      revenue: state.receitas[0].id,
      expense: state.despesas[0].id,
      expenseRefs: [state.despesas[0].cat, state.despesas[0].cartao, state.despesas[0].conta, state.despesas[0].split[0].personId],
      person: state.pessoas[0].id,
      saving: state.cofrinhos[0].id,
      savingMove: state.movimentacoesCofrinhos[0].id,
      transfer: state.movimentacoesContas[0].transferId,
    }));
    const ok = observed.category === IDS.category && observed.card === IDS.card && observed.account === IDS.account
      && observed.revenue === IDS.revenue && observed.expense === IDS.expense
      && JSON.stringify(observed.expenseRefs) === JSON.stringify([IDS.category, 'dinheiro', IDS.account, IDS.person])
      && observed.person === IDS.person && observed.saving === IDS.saving
      && observed.savingMove === IDS.savingMove && observed.transfer === IDS.transfer;
    return { ok, detail: JSON.stringify(observed) };
  }, 'importação JSON mantém IDs e referências textuais exatamente, sem normalizar ou remapear');

  await check('SEC2B1_ACCOUNT_CONTROLS_EXACT_ARGS', async () => {
    const r = await page.evaluate(() => {
      navigate('contas');
      const edit = __captureClick('openEditConta', '#contasList [onclick*="openEditConta"]', __IDS.account);
      const adjust = __captureClick('openAjusteSaldoConta', '#contasList [onclick*="openAjusteSaldoConta"]', __IDS.account);
      const del = __captureClick('delConta', '#contasList [onclick*="delConta"]', __IDS.account);
      renderTransferencias();
      const transfer = __captureClick('editTransferencia', '#transferenciasList [onclick*="editTransferencia"]', __IDS.transfer);
      openTransferenciaModal(__IDS.transfer);
      const origin = __optionHasExact('#transfOrigem', __IDS.account);
      const destination = __optionHasExact('#transfDestino', __IDS.account);
      closeModal();
      return { edit, adjust, del, transfer, origin, destination, scan: __sec2Scan() };
    });
    return { ok: allOk([r.edit, r.adjust, r.del, r.transfer, r.origin, r.destination]) && !r.scan.length, detail: JSON.stringify(r) };
  }, 'contas e transferências entregam o ID exato aos handlers e aos selects');

  await check('SEC2B1_CARD_AND_INVOICE_CONTROLS_EXACT_ARGS', async () => {
    const r = await page.evaluate(() => {
      navigate('cartoes');
      const edit = __captureClick('openEditCartao', '#cartoesList [onclick*="openEditCartao"]', __IDS.card);
      const del = __captureClick('delCartao', '#cartoesList [onclick*="delCartao"]', __IDS.card);
      const selector = __optionHasExact('#cartaoFaturaSelect', __IDS.card);
      renderFaturaCartoes();
      const pay = __captureClick('toggleFaturaPaga', '#cartaoFaturaResumo [onclick*="toggleFaturaPaga"]', __IDS.card);
      openAjustarFaturaModal(__IDS.card, 10, 2026);
      const adjust = __captureClick('confirmarAjusteFatura', '#modalBody [onclick*="confirmarAjusteFatura"]', __IDS.card);
      closeModal();
      return { edit, del, selector, pay, adjust, scan: __sec2Scan() };
    });
    return { ok: allOk([r.edit, r.del, r.selector, r.pay, r.adjust]) && !r.scan.length, detail: JSON.stringify(r) };
  }, 'cartões, fatura e modal de ajuste preservam o ID exato no DOM e nos handlers');

  await check('SEC2B1_REVENUE_CONTROLS_EXACT_ARGS', async () => {
    const r = await page.evaluate(() => {
      navigate('receitas');
      const toggle = __captureClick('toggleReceitaRecebida', '#receitasList [onclick*="toggleReceitaRecebida"]', __IDS.revenue);
      const edit = __captureClick('openEditReceita', '#receitasList [onclick*="openEditReceita"]', __IDS.revenue);
      const del = __captureClick('delReceita', '#receitasList [onclick*="delReceita"]', __IDS.revenue);
      const account = __optionHasExact('#recConta', __IDS.account);
      openEditReceita(__IDS.revenue);
      const save = __captureClick('saveEditReceita', '#modalBody [onclick*="saveEditReceita"]', __IDS.revenue);
      const editAccount = __optionHasExact('#eRecConta', __IDS.account);
      closeModal();
      return { toggle, edit, del, account, save, editAccount, scan: __sec2Scan() };
    });
    return { ok: allOk([r.toggle, r.edit, r.del, r.account, r.save, r.editAccount]) && !r.scan.length, detail: JSON.stringify(r) };
  }, 'receitas e vínculos com conta preservam os IDs exatos');

  await check('SEC2B1_EXPENSE_CONTROLS_EXACT_ARGS', async () => {
    const r = await page.evaluate(() => {
      navigate('despesas');
      const edit = __captureClick('abrirEdicaoDespesaNaAreaCerta', '#despesasList [onclick*="abrirEdicaoDespesaNaAreaCerta"]', __IDS.expense);
      const del = __captureClick('delDespesa', '#despesasList [onclick*="delDespesa"]', __IDS.expense);
      populateDespForma();
      const category = __optionHasExact('#despCat', __IDS.category);
      const account = __optionHasExact('#despConta', __IDS.account);
      openEditDespesa(__IDS.expense);
      const save = __captureClick('saveEditDespesa', '#modalBody [onclick*="saveEditDespesa"]', __IDS.expense);
      const editCategory = __optionHasExact('#eDespCat', __IDS.category);
      const editCard = __optionHasExact('#eDespCartao', __IDS.card);
      const editAccount = __optionHasExact('#eDespConta', __IDS.account);
      const person = __optionHasExact('#eDespSplitList select', __IDS.person);
      closeModal();
      return { edit, del, category, account, save, editCategory, editCard, editAccount, person, scan: __sec2Scan() };
    });
    return { ok: allOk([r.edit, r.del, r.category, r.account, r.save, r.editCategory, r.editCard, r.editAccount, r.person]) && !r.scan.length, detail: JSON.stringify(r) };
  }, 'despesas, referências e divisão por pessoa preservam os IDs exatos');

  await check('SEC2B1_CATEGORY_PERSON_CONTROLS_EXACT_ARGS', async () => {
    const r = await page.evaluate(() => {
      navigate('categorias');
      const delCat = __captureClick('delCategoria', '#categoriasList [onclick*="delCategoria"]', __IDS.category);
      const parent = __optionHasExact('#subcatParent', __IDS.category);
      navigate('pessoas');
      const editPerson = __captureClick('openEditPessoa', '#pessoasList [onclick*="openEditPessoa"]', __IDS.person);
      const delPerson = __captureClick('delPessoa', '#pessoasList [onclick*="delPessoa"]', __IDS.person);
      currentSplitRows = [{ personId: __IDS.person, percent: 50 }];
      renderSplitRows();
      const split = __optionHasExact('#despSplitList select', __IDS.person);
      return { delCat, parent, editPerson, delPerson, split, scan: __sec2Scan() };
    });
    return { ok: allOk([r.delCat, r.parent, r.editPerson, r.delPerson, r.split]) && !r.scan.length, detail: JSON.stringify(r) };
  }, 'categorias e pessoas preservam IDs em handlers e opções');

  await check('SEC2B1_SAVING_CONTROLS_EXACT_ARGS', async () => {
    const r = await page.evaluate(() => {
      navigate('cofrinho');
      const rescue = __captureClick('openResgatarCofrinho', '#cofrinhoSaldoList [onclick*="openResgatarCofrinho"]', __IDS.saving);
      const edit = __captureClick('openEditSaldoInicialCofrinho', '#cofrinhoSaldoList [onclick*="openEditSaldoInicialCofrinho"]', __IDS.saving);
      const del = __captureClick('delCofrinho', '#cofrinhoSaldoList [onclick*="delCofrinho"]', __IDS.saving);
      const delMove = __captureClick('delMovimentacaoCofrinho', '#cofrinhoHistorico [onclick*="delMovimentacaoCofrinho"]', __IDS.savingMove);
      openDepositarCofrinho();
      const saving = __optionHasExact('#depCofrinhoId', __IDS.saving);
      const account = __optionHasExact('#depCofrinhoConta', __IDS.account);
      closeModal();
      openResgatarCofrinho(__IDS.saving);
      const rescueAccount = __optionHasExact('#resgateConta', __IDS.account);
      closeModal();
      return { rescue, edit, del, delMove, saving, account, rescueAccount, scan: __sec2Scan() };
    });
    return { ok: allOk([r.rescue, r.edit, r.del, r.delMove, r.saving, r.account, r.rescueAccount]) && !r.scan.length, detail: JSON.stringify(r) };
  }, 'cofrinhos, movimentos e contas vinculadas preservam IDs exatos');

  await check('SEC2B1_AUXILIARY_PERSONAL_SINKS', async () => {
    const r = await page.evaluate(() => {
      navigate('dashboard');
      const dashboardCard = __captureClick('navigateToDespesasCartao', '#billCards [onclick*="navigateToDespesasCartao"]', __IDS.card);
      openPagarContribuicaoModal();
      const contributionAccount = __optionHasExact('#pagarContribuicaoConta', __IDS.account);
      closeModal();
      openPagarFaturaModal(__IDS.card, 10, 2026);
      const invoiceAccount = __optionHasExact('#pagarFaturaConta', __IDS.account);
      const invoiceConfirm = __captureClick('confirmarPagamentoFatura', '#modalBody [onclick*="confirmarPagamentoFatura"]', __IDS.card);
      closeModal();
      navigate('analise');
      populateFiltros();
      const filterCategory = __optionHasExact('#filtCat', __IDS.category);
      const filterCard = __optionHasExact('#filtCartao', __IDS.card);
      const filterPerson = __optionHasExact('#filtPessoa', __IDS.person);
      renderComparativo();
      const comparison = __captureEvent('compToggleCat', '#compCategoriasChecks input[onchange*="compToggleCat"]', 'change', __IDS.category);
      const host = document.createElement('div');
      host.innerHTML = cashObligationAction({ kind: 'expense', id: `expense:${__IDS.expense}:2026-10` });
      document.body.appendChild(host);
      const cashAction = __captureClick('togglePago', 'body > div:last-child [onclick*="togglePago"]', __IDS.expense);
      host.remove();
      return { dashboardCard, contributionAccount, invoiceAccount, invoiceConfirm, filterCategory, filterCard, filterPerson, comparison, cashAction, scan: __sec2Scan() };
    });
    return {
      ok: allOk([r.dashboardCard, r.contributionAccount, r.invoiceAccount, r.invoiceConfirm,
        r.filterCategory, r.filterCard, r.filterPerson, r.comparison, r.cashAction]) && !r.scan.length,
      detail: JSON.stringify(r),
    };
  }, 'dashboard, pagamentos, filtros, comparativo e ação de caixa preservam identificadores pessoais');

  await check('SEC2B1_SCENARIO_CONTROLS_EXACT_ARGS', async () => {
    const r = await page.evaluate(() => {
      navigate('eSe');
      eseItens = [{ id: __IDS.scenario, desc: 'Compra cenário', valor: 100, parcelas: 2, mesInicio: 10, anoInicio: 2026, cat: __IDS.category, cartao: __IDS.card }];
      renderEseItemList();
      const remove = __captureClick('removeEseItem', '#eseItemList [onclick*="removeEseItem"]', __IDS.scenario);
      const update = __captureEvent('updateEseItem', '#eseItemList input[type="number"]', 'input', __IDS.scenario);
      const category = __optionHasExact('#eseItemList select[onchange*="\'cat\'"]', __IDS.category);
      const card = __optionHasExact('#eseItemList select[onchange*="\'cartao\'"]', __IDS.card);
      const desc = document.querySelector('#eseItemList input[type="text"]');
      desc.value = 'Descrição alterada';
      desc.dispatchEvent(new Event('change', { bubbles: true }));
      const directFind = eseItens[0].desc === 'Descrição alterada';
      return { remove, update, category, card, directFind, scan: __sec2Scan() };
    });
    return { ok: allOk([r.remove, r.update, r.category, r.card]) && r.directFind && !r.scan.length, detail: JSON.stringify(r) };
  }, 'simulador E se preserva IDs do item, categoria e cartão');

  await check('SEC2B1_RENDER_HAS_NO_UNEXPECTED_HTML_OR_EXECUTION', async () => {
    const r = await page.evaluate(() => {
      const failures = [];
      for (const target of ['dashboard', 'receitas', 'despesas', 'parcelamentos', 'categorias', 'cartoes', 'contas', 'pessoas', 'relatorioPessoas', 'cofrinho', 'analise', 'eSe']) {
        try { navigate(target); } catch (e) { failures.push(`${target}:${e.message}`); }
        failures.push(...__sec2Scan().map((x) => `${target}:${x}`));
      }
      return { failures, executed: window.__sec2Executed };
    });
    return { ok: !r.failures.length && !r.executed && !dialogs.length && !externalRequests.length, detail: JSON.stringify({ ...r, dialogs: dialogs.length, externalRequests }) };
  }, 'telas pessoais não ganham elementos/atributos inesperados e conteúdo do ID não executa');

  await check('SEC2B1_RENDER_DOES_NOT_MUTATE_PERSISTED_IDS', async () => {
    const after = await page.evaluate(() => JSON.stringify(buildSaveObject()));
    return { ok: after === importedSnapshot, detail: `igual=${after === importedSnapshot}` };
  }, 'renderizar e operar controles capturados não remapeia nem modifica IDs persistidos');

  await check('SEC2B1_SAVE_RELOAD_ROUNDTRIP', async () => {
    const r = await page.evaluate(() => {
      const before = JSON.stringify(buildSaveObject());
      const copy = JSON.parse(before);
      migrateAppData(copy);
      const after = JSON.stringify(buildSaveObject());
      return { equal: before === after, account: state.contas[0].id, expenseRef: state.despesas[0].cat };
    });
    return { ok: r.equal && r.account === IDS.account && r.expenseRef === IDS.category, detail: JSON.stringify(r) };
  }, 'persistência e recarregamento mantêm IDs e referências textuais exatamente');

  // Casos legados de integridade: são preservados, porém continuam ambíguos.
  await check('SEC2B1_LEGACY_INTEGRITY_CHARACTERIZATION', async () => {
    const r = await page.evaluate((missing) => {
      const weirdObject = { nested: 'id' };
      const raw = {
        categories: [
          { id: '', name: 'Vazio', subs: [] },
          { id: 'duplicado', name: 'Duplicado A', subs: [] },
          { id: 'duplicado', name: 'Duplicado B', subs: [] },
          { id: 42, name: 'Numérico', subs: [] },
          { id: null, name: 'Nulo', subs: [] },
          { id: weirdObject, name: 'Objeto', subs: [] },
        ],
        cards: [{ id: 'dinheiro', name: 'Dinheiro/PIX', color: '#38e2b4', fecha: null, paga: null }],
        contas: [], receitas: [], pessoas: [], cofrinhos: [], movimentacoesContas: [], movimentacoesCofrinhos: [],
        despesas: [{ id: '', desc: 'Órfã', cat: missing, subcat: '', cartao: 'dinheiro', valor: 1, parcelas: 1, mesInicio: 10, anoInicio: 2026, fixa: false, pagoMeses: {}, split: [{ personId: missing, percent: 50 }] }],
        excedentes: {}, contribuicaoAjustes: {}, faturasPagas: {}, contribuicaoPaga: {},
      };
      migrateAppData(raw);
      const saved = buildSaveObject().perfis[perfilAtivo].data;
      const ids = saved.categories.slice(0, 6).map((x) => x.id);
      const duplicateCount = saved.categories.filter((x) => x.id === 'duplicado').length;
      const firstDuplicate = saved.categories.find((x) => x.id === 'duplicado')?.name;
      const orphanKept = saved.despesas[0].cat === missing && saved.despesas[0].split[0].personId === missing;
      const host = document.createElement('div');
      host.innerHTML = `<select>${saved.categories.slice(0, 6).map((x) => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('')}</select>`;
      const domValues = [...host.querySelector('select').options].map((x) => x.value);
      return {
        emptyKept: ids[0] === '', duplicateCount, firstDuplicate, numberType: typeof ids[3],
        nullKept: ids[4] === null, objectKept: ids[5]?.nested === 'id', orphanKept, domValues,
        scan: __sec2Scan(),
      };
    }, IDS.missing);
    const ok = r.emptyKept && r.duplicateCount === 2 && r.firstDuplicate === 'Duplicado A'
      && r.numberType === 'number' && r.nullKept && r.objectKept && r.orphanKept
      && JSON.stringify(r.domValues) === JSON.stringify(['', 'duplicado', 'duplicado', '42', '', '[object Object]'])
      && !r.scan.length;
    return { ok, detail: JSON.stringify(r) };
  }, 'legado: dados mantêm ID vazio/duplicado/tipos inesperados e referências órfãs; controles HTML os convertem em strings e duplicados permanecem ambíguos');

  // Drive simulado: GETs respondem a partir da fixture; qualquer tentativa de
  // escrita é registrada para a asserção, nunca enviada à rede.
  const driveWrites = [];
  await page.route('**/www.googleapis.com/**', async (route) => {
    const req = route.request();
    const url = req.url();
    if (req.method() !== 'GET') {
      driveWrites.push(`${req.method()} ${url}`);
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"id":"sec2-drive-file"}' });
    }
    if (url.includes('/drive/v3/files/sec2-drive-file')) return route.fulfill({ status: 200, contentType: 'application/json', body: DATA_JSON });
    if (url.includes('/drive/v3/files?')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: [{ id: 'sec2-drive-file', name: 'finflow_data.json', modifiedTime: '2026-10-15T12:00:00Z' }] }) });
    return route.abort();
  });
  await loadState(baseSyntheticState());
  await page.evaluate(async () => {
    localStorage.removeItem('finflow_unsynced');
    accessToken = 'synthetic-sec2-token';
    await syncFromDrive(true);
    renderAll();
  });
  await installHelpers();

  await check('SEC2B1_DRIVE_SIMULATED_PRESERVES_IDS', async () => {
    const r = await page.evaluate(() => {
      navigate('contas');
      const account = __captureClick('openEditConta', '#contasList [onclick*="openEditConta"]', __IDS.account);
      navigate('despesas');
      const expense = __captureClick('abrirEdicaoDespesaNaAreaCerta', '#despesasList [onclick*="abrirEdicaoDespesaNaAreaCerta"]', __IDS.expense);
      const saved = buildSaveObject();
      return { account, expense, exact: saved.perfis[saved.perfilAtivo].data.categories[0].id === __IDS.category, scan: __sec2Scan() };
    });
    return { ok: r.account.ok && r.expense.ok && r.exact && !r.scan.length && !driveWrites.length, detail: JSON.stringify({ ...r, driveWrites }) };
  }, 'Drive simulado carrega os IDs exatos, controles funcionam e renderização não envia gravação');

  await check('SEC2B1_NO_SCRIPT_ERRORS', async () => ({
    ok: consoleErrors.length === 0,
    detail: JSON.stringify(consoleErrors),
  }), 'nenhum erro de script durante a suíte');
} finally {
  await close();
}

const failures = results.filter((r) => r.status === 'FAIL').length;
console.log(`sec2-id-render: TOTAL=${results.length} PASS=${results.length - failures} FAIL=${failures}`);
if (failures) process.exitCode = 1;

export { results };
