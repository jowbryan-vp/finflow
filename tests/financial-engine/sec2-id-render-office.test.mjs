// SEC-2B2 — identificadores do domínio escritório em HTML e handlers inline.
//
// Testes defensivos em navegador real, com dados 100% sintéticos. Os
// registros v3 (projeto/parcela/RRT/custo/repasse) nascem pelo próprio motor
// (criarContratoV3, registrarRecebimentoV3, pagarCompromissoV3...) para
// garantir um estado financeiro internamente consistente; só os IDs
// resultantes são trocados por strings adversariais depois de criados —
// exatamente o que um import malicioso mudaria num registro por outro lado
// válido. OAuth/Drive reais nunca são usados.
import { openHarness, makeRunner, baseSyntheticState } from './harness.mjs';

const { page, loadState, close, consoleErrors } = await openHarness();
const { check, results } = makeRunner('sec2-id-render-office');

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
  conta: `conta-escritorio:${SPECIAL}`,
  projeto: `projeto:${SPECIAL}`,
  parcela: `parcela:${SPECIAL}`,
  rrt: `rrt:${SPECIAL}`,
  custo: `custo:${SPECIAL}`,
  despesaPagamento: `despesa-pagamento:${SPECIAL}`,
  despesa: `despesa-avulsa:${SPECIAL}`,
  reserva: `reserva:${SPECIAL}`,
  repasse: `repasse:${SPECIAL}`,
  projetoV2: `projeto-legado:${SPECIAL}`,
  rrtV2: `rrt-legado:${SPECIAL}`,
  recebivelV2: `recebivel-legado:${SPECIAL}`,
});
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
    // Variante para handlers com múltiplos argumentos — compara a lista inteira.
    window.__captureClickArgs = (fnName, selector, expected) => {
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
          if (args && JSON.stringify(args) === JSON.stringify(expected)) { el = candidate; break; }
        }
      } finally { window[fnName] = original; }
      return {
        ok: !!args && JSON.stringify(args) === JSON.stringify(expected),
        args,
        onclick: el.getAttribute('onclick'),
      };
    };
    window.__optionHasExact = (selector, expected) => {
      const el = document.querySelector(selector);
      if (!el) return { ok: false, reason: `ausente:${selector}` };
      const values = [...el.options].map((o) => o.value);
      return { ok: values.includes(expected), values };
    };
    window.__attrHasExact = (selector, attr, expected) => {
      const el = document.querySelector(selector);
      if (!el) return { ok: false, reason: `ausente:${selector}` };
      return { ok: el.getAttribute(attr) === expected, value: el.getAttribute(attr) };
    };
  }, IDS_JSON);
}

// Monta o estado do escritório inteiramente pelo motor aprovado (contrato v3,
// recebimento, pagamento de custo) e só troca os IDs resultantes pelos IDs
// sintéticos adversariais depois de criados — o motor nunca aceita um ID
// externo na criação (sempre gera com uid()).
async function setupOfficeState() {
  await loadState(baseSyntheticState());
  const r = await page.evaluate((ids) => {
    state.office = state.office || {};
    state.office.ativo = true;
    state.office.contas = [{ id: ids.conta, name: 'Conta do escritório sintética', color: '#112233', saldoInicial: 10000 }];

    confirmarConfigTributaria(10);
    salvarDistribuicaoBaseSegura({
      destinos: OFFICE_DESTINOS_DISTRIBUICAO.map((d, i) => ({ destino: d.id, bp: [6500, 1500, 1000, 700, 300][i] })),
      confirm: true,
    });

    const created = criarContratoV3({
      nome: 'Projeto sintético', cliente: 'Cliente sintético', valorContratoCent: 500000,
      status: 'contratado', dataContrato: '2026-09-01', contaDestino: ids.conta,
      tributacao: { tributavel: true }, rrtRequirementStatus: 'required',
      rrts: [{ tipo: 'projeto', descricao: 'RRT sintética', valorPrevistoCent: 10000 }],
      custosDiretos: [{ descricao: 'Custo sintético', categoria: 'Outros', valorPrevistoCent: 5000 }],
      parcelas: 1,
    });
    if (!created.ok) return { ok: false, step: 'criarContratoV3', created };
    const projetoIdOriginal = created.projetoId;
    const parcelaOriginal = getParcelasV3(projetoIdOriginal)[0];

    // Recebimento PARCIAL (300000 de 500000): materializa provisão/cobertura/
    // repasse normalmente, mas deixa saldo>0 na parcela, então o botão
    // "Registrar recebimento" continua existindo para o teste capturar.
    const receb = registrarRecebimentoV3(parcelaOriginal.id, { valorCent: 300000, data: '2026-10-05', contaId: ids.conta });
    if (!receb.ok) return { ok: false, step: 'registrarRecebimentoV3', receb };

    const pagamento = pagarCompromissoV3('custo_direto', projetoIdOriginal, findOfficeProjeto(projetoIdOriginal).custosDiretos[0].id,
      { valorCent: 5000, data: '2026-10-07', contaId: ids.conta });
    if (!pagamento.ok) return { ok: false, step: 'pagarCompromissoV3', pagamento };

    // Troca os IDs gerados pelos sintéticos adversariais, cascateando toda
    // referência cruzada — simula um backup/import malicioso de um registro
    // por outro lado estruturalmente válido.
    const p = findOfficeProjeto(projetoIdOriginal);
    const rp = (state.office.repasses || []).find((x) => x.recebivelId === parcelaOriginal.id);
    p.id = ids.projeto;
    (state.office.recebiveis || []).forEach((x) => { if (x.projetoId === projetoIdOriginal) x.projetoId = ids.projeto; });
    (state.office.despesas || []).forEach((x) => { if (x.projetoId === projetoIdOriginal) x.projetoId = ids.projeto; if (x.vinculo && x.vinculo.projetoId === projetoIdOriginal) x.vinculo.projetoId = ids.projeto; });
    p.rrts[0].id = ids.rrt;
    p.custosDiretos[0].id = ids.custo;
    const pagoDesp = (state.office.despesas || []).find((x) => x.vinculo && x.vinculo.projetoId === ids.projeto);
    if (pagoDesp) { if (pagoDesp.vinculo.refId !== ids.custo) pagoDesp.vinculo.refId = ids.custo; pagoDesp.id = ids.despesaPagamento; }
    const parc = (state.office.recebiveis || []).find((x) => x.projetoId === ids.projeto);
    parc.id = ids.parcela;
    if (rp) { rp.recebivelId = ids.parcela; rp.id = ids.repasse; }

    state.office.reservas = [{ id: ids.reserva, nome: 'Reserva sintética', finalidade: 'impostos', color: '#445566', saldoInicial: 0 }];
    state.office.despesas.push({
      id: ids.despesa, descricao: 'Despesa avulsa sintética', categoria: 'Outros', valor: 50,
      data: '2026-10-06', conta: ids.conta, projetoId: null, status: 'pago', createdAt: uid(),
    });

    // Projeto do modelo financeiro anterior (v2) — exercita o editor legado
    // (renderProjetoRrtSection) e a aba "Recebíveis" não-v3.
    state.office.projetos.push({
      id: ids.projetoV2, nome: 'Projeto legado sintético', cliente: 'Cliente legado sintético',
      valorContrato: 1000, status: 'contratado', dataContrato: '2026-01-01', observacao: '',
      createdAt: uid(), regraDistribuicao: 'v2',
      rrts: [{ id: ids.rrtV2, tipo: 'projeto', valor: 100, status: 'prevista', numero: '', dataEmissao: null, dataPagamento: null, createdAt: uid() }],
      rrtRequirement: 'two', rrtRequirementConfirmedAt: new Date().toISOString(), rrtRequirementConfirmedBy: null,
    });
    state.office.recebiveis.push({
      id: ids.recebivelV2, projetoId: ids.projetoV2, descricao: 'Recebível legado sintético', valor: 1000,
      estado: 'previsto', dataPrevista: '2026-11-01', dataRecebimento: null, contaDestino: ids.conta, createdAt: uid(),
    });

    // Estabiliza o ponto fixo da migração: a receita pessoal derivada do
    // repasse (syncDerivedPersonalTransfer) nasce sem `recebidaMeses`, campo
    // que migrateAppData só preenche numa passada — nada a ver com IDs do
    // escritório, mas precisa estar estável antes do instantâneo "antes" dos
    // testes de roundtrip/não-mutação, senão a 1ª chamada de migrateAppData
    // do próprio teste pareceria (falsamente) uma mutação.
    migrateAppData(buildSaveObject());

    renderEscritorio();
    return { ok: true, projetoId: p.id, rrtId: p.rrts[0].id, custoId: p.custosDiretos[0].id, parcelaId: parc.id, repasseId: rp ? rp.id : null, pagoDespesaId: pagoDesp ? pagoDesp.id : null };
  }, IDS);
  if (!r.ok) throw new Error(`setupOfficeState falhou em ${r.step}: ${JSON.stringify(r)}`);
  return r;
}

function allOk(items) {
  return items.every((x) => x && x.ok);
}

try {
  const setup = await setupOfficeState();
  await installHelpers();
  const importedSnapshot = await page.evaluate(() => JSON.stringify(buildSaveObject()));

  await check('SEC2B2_OFFICE_PROJECT_LIST_AND_DETAIL_EXACT_ARGS', async () => {
    const r = await page.evaluate(() => {
      switchOfficeTab('projetos');
      const open = __captureClick('abrirProjeto', '.prj-linha [onclick*="abrirProjeto"]', __IDS.projeto);
      const dataAttr = __attrHasExact('.prj-linha[data-projeto]', 'data-projeto', __IDS.projeto);
      abrirProjeto(__IDS.projeto);
      const detailAttr = __attrHasExact('#officeContratoDetalhe[data-projeto]', 'data-projeto', __IDS.projeto);
      const aditivo = __captureClick('abrirAditivoV3', '#ocCompTit ~ [onclick*="abrirAditivoV3"], .ov-cab [onclick*="abrirAditivoV3"]', __IDS.projeto);
      closeModal();
      return { open, dataAttr, detailAttr, aditivo, scan: __sec2Scan() };
    });
    return { ok: allOk([r.open, r.dataAttr, r.detailAttr, r.aditivo]) && !r.scan.length, detail: JSON.stringify(r) };
  }, 'lista de projetos e detalhe do contrato V3 preservam o ID do projeto em atributo e handlers');

  await check('SEC2B2_OFFICE_RECEIVABLES_EXACT_ARGS', async () => {
    const r = await page.evaluate(() => {
      abrirProjeto(__IDS.projeto);
      abrirAbaContratoV3('recebimentos');
      const receber = __captureClick('abrirRecebimentoV3', '#ocParcelas [onclick*="abrirRecebimentoV3"]', __IDS.parcela);
      closeModal();
      switchOfficeTab('recebiveis');
      const editLegacy = __captureClick('openEditOfficeRecebivel', '[onclick*="openEditOfficeRecebivel"]', __IDS.recebivelV2);
      const delLegacy = __captureClick('delOfficeRecebivel', '[onclick*="delOfficeRecebivel"]', __IDS.recebivelV2);
      openEditOfficeRecebivel(__IDS.recebivelV2);
      const save = __captureClick('saveEditOfficeRecebivel', '#modalBody [onclick*="saveEditOfficeRecebivel"]', __IDS.recebivelV2);
      const contaOpt = __optionHasExact('#eRecebConta', __IDS.conta);
      closeModal();
      return { receber, editLegacy, delLegacy, save, contaOpt, scan: __sec2Scan() };
    });
    return { ok: allOk([r.receber, r.editLegacy, r.delLegacy, r.save, r.contaOpt]) && !r.scan.length, detail: JSON.stringify(r) };
  }, 'recebimentos do contrato V3 e recebíveis do modelo anterior preservam IDs exatos');

  await check('SEC2B2_OFFICE_COSTS_AND_RRT_EXACT_ARGS', async () => {
    const r = await page.evaluate(() => {
      abrirProjeto(__IDS.projeto);
      abrirAbaContratoV3('custos');
      const novoCusto = __captureClick('abrirNovoCustoV3', '#ocCustos [onclick*="abrirNovoCustoV3"]', __IDS.projeto);
      const dataId = __attrHasExact('[data-id]', 'data-id', __IDS.custo);
      const estornar = __captureClick('abrirEstornoV3', '#ocCustos [onclick*="abrirEstornoV3"]', __IDS.despesaPagamento);
      closeModal();
      abrirAbaContratoV3('rrts');
      const novaRrt = __captureClick('abrirNovaRrtV3', '#ocRrts [onclick*="abrirNovaRrtV3"]', __IDS.projeto);
      const situacaoRrt = __captureClick('abrirRrtRequirementV3', '#ocRrts [onclick*="abrirRrtRequirementV3"]', __IDS.projeto);
      const pagar = __captureClickArgs('abrirPagamentoV3', '#ocRrts [onclick*="abrirPagamentoV3"]', ['rrt', __IDS.projeto, __IDS.rrt]);
      closeModal();
      return { novoCusto, dataId, estornar, novaRrt, situacaoRrt, pagar, scan: __sec2Scan() };
    });
    return { ok: allOk([r.novoCusto, r.dataId, r.estornar, r.novaRrt, r.situacaoRrt, r.pagar]) && !r.scan.length, detail: JSON.stringify(r) };
  }, 'custos diretos e RRTs do contrato V3 preservam ID do projeto, do item e da despesa de pagamento');

  await check('SEC2B2_OFFICE_TAXATION_EXACT_ARGS', async () => {
    const r = await page.evaluate(() => {
      abrirProjeto(__IDS.projeto);
      abrirAbaContratoV3('tributacao');
      const aliquota = __captureClick('abrirAliquotaContratoV3', '#ocTributos [onclick*="abrirAliquotaContratoV3"]', __IDS.projeto);
      closeModal();
      const pagarTributo = __captureClick('abrirPagamentoTributoV3', '#ocTributos [onclick*="abrirPagamentoTributoV3"]', __IDS.projeto);
      closeModal();
      // delOfficeProjeto em #ocHistorico só aparece quando D.podeExcluir é
      // true (sem movimentação realizada) — este contrato já tem recebimento
      // e pagamento, então o botão some aqui por design, não por bug; o
      // mesmo handler é exercitado via o projeto do modelo anterior abaixo
      // (renderProjetoAnterior, onde o botão é incondicional).
      return { aliquota, pagarTributo, scan: __sec2Scan() };
    });
    return { ok: allOk([r.aliquota, r.pagarTributo]) && !r.scan.length, detail: JSON.stringify(r) };
  }, 'tributação do contrato V3 preserva o ID do projeto');

  await check('SEC2B2_OFFICE_LEGACY_RRT_EDITOR_EXACT_ARGS', async () => {
    const r = await page.evaluate(() => {
      openEditOfficeProjeto(__IDS.projetoV2);
      const valorId = __attrHasExact(`#eRrtValor_${CSS.escape(__IDS.rrtV2)}`, 'id', `eRrtValor_${__IDS.rrtV2}`);
      const saveRrt = __captureClickArgs('saveProjetoRRT', '[onclick*="saveProjetoRRT"]', [__IDS.projetoV2, __IDS.rrtV2]);
      const delRrt = __captureClickArgs('delProjetoRRT', '[onclick*="delProjetoRRT"]', [__IDS.projetoV2, __IDS.rrtV2]);
      const salvarDecisao = __captureClick('salvarDecisaoRrtRequirement', '[onclick*="salvarDecisaoRrtRequirement"]', __IDS.projetoV2);
      const save = __captureClick('saveEditOfficeProjeto', '#modalBody [onclick*="saveEditOfficeProjeto"]', __IDS.projetoV2);
      closeModal();
      // Projeto do modelo financeiro anterior aberto pelo roteamento real de
      // abrirProjeto (regraDistribuicao!=='v3' → abrirProjetoAnterior): aqui
      // delOfficeProjeto e openEditOfficeProjeto são incondicionais.
      officeProjetoAnteriorAberto = null; officeContratoAberto = null;
      abrirProjeto(__IDS.projetoV2);
      const dataProjetoAnterior = __attrHasExact('#officeProjetoAnterior[data-projeto]', 'data-projeto', __IDS.projetoV2);
      const editAnterior = __captureClick('openEditOfficeProjeto', '#officeProjetoAnterior [onclick*="openEditOfficeProjeto"]', __IDS.projetoV2);
      const delAnterior = __captureClick('delOfficeProjeto', '#officeProjetoAnterior [onclick*="delOfficeProjeto"]', __IDS.projetoV2);
      return { valorId, saveRrt, delRrt, salvarDecisao, save, dataProjetoAnterior, editAnterior, delAnterior, scan: __sec2Scan() };
    });
    return {
      ok: allOk([r.valorId, r.saveRrt, r.delRrt, r.salvarDecisao, r.save, r.dataProjetoAnterior, r.editAnterior, r.delAnterior]) && !r.scan.length,
      detail: JSON.stringify(r),
    };
  }, 'editor de projeto, RRT e tela do modelo anterior (legado) preservam IDs exatos em atributo e handlers');

  await check('SEC2B2_OFFICE_RESERVES_EXACT_ARGS', async () => {
    const r = await page.evaluate(() => {
      switchOfficeTab('repasses'); // navega para fora de "reservas" primeiro, garante re-render limpo
      renderOfficeReservasTab();
      const aplicar = __captureClick('openAplicarOfficeReserva', '[onclick*="openAplicarOfficeReserva"]', __IDS.reserva);
      // __captureClick substitui a function real por um gravador de args — o
      // modal de verdade não abre. Chama a function real à parte para
      // inspecionar o select de conta que ela desenha.
      openAplicarOfficeReserva(__IDS.reserva);
      const contaAplicar = __optionHasExact('#aplicOReservaConta', __IDS.conta);
      closeModal();
      const resgatar = __captureClick('openResgatarOfficeReserva', '[onclick*="openResgatarOfficeReserva"]', __IDS.reserva);
      openResgatarOfficeReserva(__IDS.reserva);
      const contaResgatar = __optionHasExact('#resgOReservaConta', __IDS.conta);
      closeModal();
      const del = __captureClick('delOfficeReserva', '[onclick*="delOfficeReserva"]', __IDS.reserva);
      return { aplicar, contaAplicar, resgatar, contaResgatar, del, scan: __sec2Scan() };
    });
    return { ok: allOk([r.aplicar, r.contaAplicar, r.resgatar, r.contaResgatar, r.del]) && !r.scan.length, detail: JSON.stringify(r) };
  }, 'reservas empresariais e contas vinculadas preservam IDs exatos');

  await check('SEC2B2_OFFICE_TRANSFERS_EXACT_ARGS', async () => {
    const r = await page.evaluate(() => {
      renderOfficeRepassesTab();
      const realizar = __captureClick('openRealizarOfficeRepasse', '[onclick*="openRealizarOfficeRepasse"]', __IDS.repasse);
      openRealizarOfficeRepasse(__IDS.repasse);
      const contaOrigem = __optionHasExact('#realizRepasseContaOrigem', __IDS.conta);
      closeModal();
      const baixar = __captureClick('openBaixarOfficeRepasse', '[onclick*="openBaixarOfficeRepasse"]', __IDS.repasse);
      closeModal();
      return { realizar, contaOrigem, baixar, scan: __sec2Scan() };
    });
    return { ok: allOk([r.realizar, r.contaOrigem, r.baixar]) && !r.scan.length, detail: JSON.stringify(r) };
  }, 'repasses planejados preservam o ID exato nos handlers e nos selects de conta');

  await check('SEC2B2_OFFICE_EXPENSES_EXACT_ARGS', async () => {
    const r = await page.evaluate(() => {
      switchOfficeTab('despesas');
      const del = __captureClick('delOfficeDespesa', '[onclick*="delOfficeDespesa"]', __IDS.despesa);
      const contaOpt = __optionHasExact('#newODespConta', __IDS.conta);
      return { del, contaOpt, scan: __sec2Scan() };
    });
    return { ok: allOk([r.del, r.contaOpt]) && !r.scan.length, detail: JSON.stringify(r) };
  }, 'despesas do escritório preservam o ID exato no handler de exclusão');

  await check('SEC2B2_OFFICE_ACCOUNTS_CONFIG_EXACT_ARGS', async () => {
    const r = await page.evaluate(() => {
      switchOfficeTab('config');
      const edit = __captureClick('openEditOfficeConta', '[onclick*="openEditOfficeConta"]', __IDS.conta);
      openEditOfficeConta(__IDS.conta);
      const save = __captureClick('saveEditOfficeConta', '#modalBody [onclick*="saveEditOfficeConta"]', __IDS.conta);
      closeModal();
      const del = __captureClick('delOfficeConta', '[onclick*="delOfficeConta"]', __IDS.conta);
      return { edit, save, del, scan: __sec2Scan() };
    });
    return { ok: allOk([r.edit, r.save, r.del]) && !r.scan.length, detail: JSON.stringify(r) };
  }, 'contas empresariais em Configurações preservam o ID exato nos handlers');

  await check('SEC2B2_RENDER_HAS_NO_UNEXPECTED_HTML_OR_EXECUTION', async () => {
    const r = await page.evaluate(() => {
      const failures = [];
      for (const tab of ['visao', 'projetos', 'projecao', 'recebiveis', 'despesas', 'reservas', 'repasses', 'config']) {
        try { switchOfficeTab(tab); } catch (e) { failures.push(`${tab}:${e.message}`); }
        failures.push(...__sec2Scan().map((x) => `${tab}:${x}`));
      }
      try { abrirProjeto(__IDS.projeto); for (const aba of ['resumo', 'recebimentos', 'custos', 'rrts', 'tributacao', 'distribuicao', 'historico']) { abrirAbaContratoV3(aba); failures.push(...__sec2Scan().map((x) => `aba-${aba}:${x}`)); } }
      catch (e) { failures.push(`abas:${e.message}`); }
      try { openEditOfficeProjeto(__IDS.projetoV2); failures.push(...__sec2Scan().map((x) => `editV2:${x}`)); closeModal(); }
      catch (e) { failures.push(`editV2:${e.message}`); }
      return { failures, executed: window.__sec2Executed };
    });
    return { ok: !r.failures.length && !r.executed && !dialogs.length && !externalRequests.length, detail: JSON.stringify({ ...r, dialogs: dialogs.length, externalRequests }) };
  }, 'telas do escritório não ganham elementos/atributos inesperados e conteúdo do ID não executa');

  await check('SEC2B2_RENDER_DOES_NOT_MUTATE_PERSISTED_IDS', async () => {
    const after = await page.evaluate(() => JSON.stringify(buildSaveObject()));
    return { ok: after === importedSnapshot, detail: `igual=${after === importedSnapshot}` };
  }, 'renderizar e operar os controles capturados não remapeia nem modifica IDs persistidos do escritório');

  await check('SEC2B2_SAVE_RELOAD_ROUNDTRIP', async () => {
    const r = await page.evaluate((ids) => {
      const before = JSON.stringify(buildSaveObject());
      const copy = JSON.parse(before);
      migrateAppData(copy);
      const after = JSON.stringify(buildSaveObject());
      return {
        equal: before === after,
        projeto: findOfficeProjeto(ids.projeto)?.id,
        conta: findOfficeConta(ids.conta)?.id,
      };
    }, IDS);
    return { ok: r.equal && r.projeto === IDS.projeto && r.conta === IDS.conta, detail: JSON.stringify(r) };
  }, 'persistência e recarregamento mantêm IDs do escritório exatamente');

  await check('SEC2B2_NO_SCRIPT_ERRORS', async () => ({
    ok: consoleErrors.length === 0,
    detail: JSON.stringify(consoleErrors),
  }), 'nenhum erro de script durante a suíte');
} finally {
  await close();
}

const failures = results.filter((r) => r.status === 'FAIL').length;
console.log(`sec2-id-render-office: TOTAL=${results.length} PASS=${results.length - failures} FAIL=${failures}`);
if (failures) process.exitCode = 1;

export { results };
