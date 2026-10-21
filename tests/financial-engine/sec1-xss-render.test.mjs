// SEC-1 — XSS na renderização (nomes de categorias, cartões, subcategorias,
// pessoas, cofrinhos e perfis; handler delSubcat; handlers e cores de perfis;
// cores de cartões, pessoas e cofrinhos). Base cf0b048.
//
// Tudo é verificado no DOM interpretado pelo navegador (não por comparação de
// strings do template): nenhum payload executa, nenhum elemento/atributo
// injetado aparece, o texto aparece como texto, os controles continuam
// funcionando e os dados persistidos não mudam só por renderizar.
//
// Dados 100% sintéticos. Sem OAuth real: o Drive é simulado com page.route
// e um token de teste; nenhuma requisição sai para a rede.
//
// Os payloads viajam Node→página sempre como TEXTO JSON (JSON.stringify
// escapa surrogates isolados e caracteres de controle em ASCII), pra que
// nenhum caractere seja alterado no transporte do Playwright.
import { openHarness, makeRunner, baseSyntheticState } from './harness.mjs';

const { page, loadState, close, consoleErrors } = await openHarness();
const { check, results } = makeRunner('sec1-xss-render');

await page.clock.setFixedTime(new Date(2026, 9, 15, 12)); // 15/10/2026

const dialogs = [];
page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss().catch(() => {}); });
const pwnRequests = [];
await page.route('**/pwn.invalid/**', (route) => { pwnRequests.push(route.request().url()); route.abort(); });

// Marca de execução: qualquer payload que rode incrementa window.__xss.
const X = 'window.__xss=(window.__xss||0)+1';
const PAYLOADS = [
  `<img src=x data-pwn onerror="${X}">`,
  `"><svg data-pwn onload="${X}">`,
  `'),${X},('`,
  `"),${X},("`,
  `&#39;),${X},(&#39;`,
  `&quot;),${X},(&quot;`,
  `\\'),${X},(\\'`,
  `" autofocus data-pwn onfocus="${X}" x="`,
  `</script><script data-pwn>${X}</script>`,
  '`${' + X + '}`',
  'a & b &amp; c &lt; d &#x27;',
  'linha1\r\nlinha2\rfim\nsó LF',
  'nul\u0000byte',
  'Ünïcødé ação 😀 中文',
  'sep linha par',
  'lone\ud800high\udc00low',
  `javascript:${X}`,
  "aspas ' simples e \" duplas",
  'barra \\ invertida \\\\ dupla',
];
const BAD_COLORS = [
  'red;background-image:url(https://pwn.invalid/c1)',
  `#fff" data-pwn onmouseover="${X}`,
  `"><img src=x data-pwn onerror="${X}">`,
  '#12345',
  'expression(window.__xss=1)',
  '#aabbcc;background:url(https://pwn.invalid/c2)',
  'url(https://pwn.invalid/c3)',
];
const GOOD_COLORS = ['#AbCdEf', '#abc', '#abcd', '#aabbccdd'];
// SEC-1R — cores legadas válidas que o <input type=color> não representa.
const LEGACY_COLORS = ['#abc', '#abcd', '#aabbccdd', '#AbCdEf'];

function syntheticData() {
  const cats = PAYLOADS.map((p, i) => ({ id: `cat${i}`, name: p, subs: [p, `sub${i}`] }));
  // "Dinheiro/PIX" (único cartão direto) também recebe nome e cor maliciosos:
  // é o único que aparece no banner de filtro e no formulário de despesa.
  const cards = [{ id: 'dinheiro', name: PAYLOADS[7], color: BAD_COLORS[1], fecha: null, paga: null }]
    .concat(PAYLOADS.map((p, i) => ({ id: `card${i}`, name: p, color: i < GOOD_COLORS.length ? GOOD_COLORS[i] : BAD_COLORS[i % BAD_COLORS.length], fecha: 3, paga: 10 })));
  const pessoas = PAYLOADS.map((p, i) => ({ id: `pes${i}`, name: p, color: BAD_COLORS[i % BAD_COLORS.length] }));
  const cofrinhos = PAYLOADS.map((p, i) => ({ id: `cof${i}`, name: p, color: BAD_COLORS[i % BAD_COLORS.length], saldoInicial: 10 }));
  const movimentacoesCofrinhos = PAYLOADS.map((p, i) => ({ id: `mc${i}`, cofrinhoId: `cof${i}`, valor: 5, mes: 10, ano: 2026, obs: 'depósito sintético', contaId: 'c1', createdAt: `m${i}` }));
  const despesas = PAYLOADS.map((p, i) => ({
    id: `d${i}`, desc: `Compra sintética ${i}`, cat: `cat${i}`, subcat: p, cartao: `card${i}`, conta: null,
    valor: 100 + i, parcelas: i === 0 ? 3 : 1, mesInicio: 10, anoInicio: 2026, dataCompra: '2026-10-02',
    fixa: false, pagoMeses: {}, split: [{ personId: `pes${i}`, percent: 50 }],
  }));
  // SEC-1R — contas pessoais, contas e reservas do escritório com cores
  // maliciosas e legadas (nomes comuns: nomes de conta já eram escapados).
  const contas = [{ id: 'c1', name: 'Conta 1', color: '#5b7fff', saldoInicial: 1000 }]
    .concat(BAD_COLORS.map((c, i) => ({ id: `cx${i}`, name: `Conta sintética ${i}`, color: c, saldoInicial: 10 })))
    .concat(LEGACY_COLORS.map((c, i) => ({ id: `cl${i}`, name: `Conta legada ${i}`, color: c, saldoInicial: 10 })));
  const office = {
    contas: BAD_COLORS.map((c, i) => ({ id: `ocx${i}`, name: `Conta escritório ${i}`, color: c, saldoInicial: 100 }))
      .concat(LEGACY_COLORS.map((c, i) => ({ id: `ocl${i}`, name: `Conta escritório legada ${i}`, color: c, saldoInicial: 100 }))),
    reservas: BAD_COLORS.map((c, i) => ({ id: `orx${i}`, nome: `Reserva sintética ${i}`, finalidade: 'investimento', color: c, saldoInicial: 0 }))
      .concat(LEGACY_COLORS.map((c, i) => ({ id: `orl${i}`, nome: `Reserva legada ${i}`, finalidade: 'investimento', color: c, saldoInicial: 0 }))),
  };
  const data = baseSyntheticState({ categories: cats, cards, pessoas, cofrinhos, movimentacoesCofrinhos, despesas, contas, office });
  // Perfis: o ativo tem os dados; os outros têm id, nome e cor maliciosos (X6).
  const perfis = { perfil_ok: { id: 'perfil_ok', name: 'Perfil sintético', color: '#5b7fff', data } };
  PAYLOADS.forEach((p, i) => { perfis[p] = { id: p, name: p, color: BAD_COLORS[i % BAD_COLORS.length], data: {} }; });
  return { version: 2, perfilAtivo: 'perfil_ok', perfis };
}
const DATA_JSON = JSON.stringify(syntheticData());
const PAYLOADS_JSON = JSON.stringify(PAYLOADS);
const BAD_COLORS_JSON = JSON.stringify(BAD_COLORS);

// Helpers instalados na página (normalizações do parser HTML documentadas):
//  - texto: CRLF/CR → LF (pré-processamento do fluxo de entrada) e U+0000
//    descartado pelo construtor da árvore;
//  - atributo: CRLF/CR → LF e U+0000 → U+FFFD.
async function installPageHelpers() {
  await page.evaluate(({ payloadsJson, badColorsJson }) => {
    window.__P = JSON.parse(payloadsJson);
    window.__BAD = JSON.parse(badColorsJson);
    window.__normText = (s) => String(s).replace(/\r\n?/g, '\n').replace(/\u0000/g, '');
    window.__normAttr = (s) => String(s).replace(/\r\n?/g, '\n').replace(/\u0000/g, '�');
    // Varredura de segurança: execução, elementos/atributos injetados, CSS
    // malicioso em style inline.
    window.__secScan = () => {
      const bad = [];
      if (window.__xss) bad.push(`__xss=${window.__xss}`);
      document.querySelectorAll('[data-pwn]').forEach((el) => bad.push(`data-pwn em <${el.tagName.toLowerCase()}>`));
      // atributo "x" só é suspeito em elemento HTML (em SVG, <rect x> é legítimo)
      document.querySelectorAll('[x]').forEach((el) => { if (el.namespaceURI === 'http://www.w3.org/1999/xhtml') bad.push(`atributo x em <${el.tagName.toLowerCase()}>`); });
      document.querySelectorAll('[autofocus]').forEach((el) => bad.push(`autofocus em <${el.tagName.toLowerCase()}>`));
      document.querySelectorAll('#appShell script, #modalOverlay script, #appShell iframe, #modalOverlay iframe').forEach((el) => bad.push(`<${el.tagName.toLowerCase()}> injetado`));
      document.querySelectorAll('[style]').forEach((el) => {
        const st = el.getAttribute('style');
        if (/pwn\.invalid|expression\(|__xss/i.test(st)) bad.push(`style malicioso em <${el.tagName.toLowerCase()}>: ${st.slice(0, 80)}`);
      });
      return bad;
    };
    // Quantos payloads aparecem como texto literal dentro de um container.
    window.__missingTexts = (sel, list) => {
      const el = document.querySelector(sel);
      if (!el) return ['container ausente: ' + sel];
      const t = el.textContent;
      return list.map((p, i) => (t.includes(window.__normText(p)) ? null : i)).filter((x) => x !== null);
    };
  }, { payloadsJson: PAYLOADS_JSON, badColorsJson: BAD_COLORS_JSON });
}

const allIdx = PAYLOADS.map((_, i) => i);

try {

// ── 0. Prova no navegador: jsArg/esc ida e volta HTML → JS / HTML → texto ──
await loadState(baseSyntheticState());
await installPageHelpers();

await check('SEC1_JSARG_ROUNDTRIP_EXACT', async () => {
  const r = await page.evaluate(() => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const wrong = [];
    window.__P.concat(['', 'simples']).forEach((p, i) => {
      window.__got = undefined;
      host.innerHTML = `<button type="button" onclick="window.__got=${jsArg(p)}">b</button>`;
      host.firstElementChild.click();
      if (window.__got !== p) wrong.push(i);
      // dois argumentos na mesma chamada, como delSubcat
      window.__got2 = undefined;
      host.innerHTML = `<button type="button" onclick="window.__got2=[${jsArg('cat')},${jsArg(p)}]">b</button>`;
      host.firstElementChild.click();
      if (!window.__got2 || window.__got2[0] !== 'cat' || window.__got2[1] !== p) wrong.push(`${i}/2args`);
    });
    host.remove();
    return { wrong, scan: window.__secScan() };
  });
  return { ok: r.wrong.length === 0 && r.scan.length === 0, detail: JSON.stringify(r) };
}, 'jsArg: o handler inline recebe exatamente o valor original (aspas, entidades, &, barra invertida, CR/LF, NUL, U+2028/2029, surrogates isolados, backticks, </script>) e nada executa');

await check('SEC1_ESC_ROUNDTRIP_TEXT_AND_ATTR', async () => {
  const r = await page.evaluate(() => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const wrongText = [], wrongAttr = [];
    window.__P.forEach((p, i) => {
      host.innerHTML = `<select><option value="${esc(p)}">${esc(p)}</option></select><span>${esc(p)}</span>`;
      const opt = host.querySelector('option'), span = host.querySelector('span');
      if (host.children.length !== 2 || host.querySelectorAll('*').length !== 3) wrongText.push(`${i}:estrutura`);
      if (span.textContent !== window.__normText(p) || opt.textContent !== window.__normText(p)) wrongText.push(i);
      if (opt.value !== window.__normAttr(p)) wrongAttr.push(i);
    });
    host.remove();
    return { wrongText, wrongAttr, scan: window.__secScan() };
  });
  return { ok: !r.wrongText.length && !r.wrongAttr.length && !r.scan.length, detail: JSON.stringify(r) };
}, 'esc(): texto e atributo value voltam como o valor original (só com as normalizações do parser HTML: CR→LF; NUL removido no texto e U+FFFD no atributo), sem elementos extras');

await check('SEC1_SAFE_COLOR_HELPERS', async () => {
  const r = await page.evaluate(() => {
    const css = ['#abc', '#abcd', '#aabbcc', '#aabbccdd', '#AbCdEf'].every((c) => safeCssColor(c) === c);
    const cssRej = ['#ab', '#abcde', '#aabbccd', '#aabbccdde', 'red', '', null, undefined, 42, '#aabbcc\n', ' #aabbcc', ...window.__BAD]
      .every((c) => safeCssColor(c) === '#888888');
    const fallbackLiteral = safeCssColor('x', 'inherit') === 'inherit' && safeCssColor('#abc', 'inherit') === '#abc';
    const inp = ['#aabbcc', '#AbCdEf'].every((c) => safeColorInput(c) === c);
    const inpRej = ['#abc', '#abcd', '#aabbccdd', 'red', null, ...window.__BAD].every((c) => safeColorInput(c) === '#888888');
    return { css, cssRej, fallbackLiteral, inp, inpRej };
  });
  return { ok: Object.values(r).every(Boolean), detail: JSON.stringify(r) };
}, 'safeCssColor aceita só hex de 3/4/6/8 dígitos (fallback fixo); safeColorInput aceita só #rrggbb');

// ── 1. Importação JSON sintética pelo caminho real (input file → importData) ──
await loadState(baseSyntheticState());
await installPageHelpers();
await page.evaluate((json) => {
  const input = document.querySelector('input[type=file][accept=".json"]');
  const dt = new DataTransfer();
  dt.items.add(new File([json], 'sec1-sintetico.json', { type: 'application/json' }));
  input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
}, DATA_JSON);
await page.waitForFunction(() => perfilAtivo === 'perfil_ok' && state.categories && state.categories.length > 5, null, { timeout: 5000 });
await installPageHelpers();

// Instantâneo do que seria persistido, logo depois da importação.
const snapshotAfterImport = await page.evaluate(() => JSON.stringify(buildSaveObject()));

// Passos de renderização: cada um roda e devolve o container a inspecionar e
// os índices de payload que precisam aparecer como texto ali.
async function runRenderSteps(label) {
  const steps = await page.evaluate(() => {
    const out = [];
    const all = window.__P.map((_, i) => i);
    const step = (name, fn, sel, expect) => {
      window.__xss = undefined;
      let err = null;
      try { fn(); } catch (e) { err = e.message; }
      out.push({ name, err, missing: sel ? window.__missingTexts(sel, expect.map((i) => window.__P[i])) .map((k) => expect[k]) : [], scan: window.__secScan() });
    };
    const ids = (pfx) => window.__P.map((_, i) => `${pfx}${i}`);
    step('dashboard', () => navigate('dashboard'), '#page-dashboard', []);
    // renderResumoPagar não é chamado pela UI atual (o container não existe
    // no HTML desde o UX-1); o sink foi corrigido mesmo assim e é exercitado
    // aqui com um container temporário.
    step('resumo a pagar (Fatura <cartão>, sink sem uso na UI)', () => {
      const tmp = document.createElement('div'); tmp.id = 'dashResumoPagar'; document.getElementById('page-dashboard').appendChild(tmp);
      const byCard = {}; window.__P.forEach((_, i) => { byCard[`card${i}`] = 10 + i; });
      renderResumoPagar({ totalDespPrevisao: 0, emCaixaSaidas: 0, emCaixaDisponivel: 0, byCard, desps: [], contrib: 0, isProjecaoFutura: false, saldoPiorCenario: 0 });
    }, '#dashResumoPagar', all);
    step('resumo a pagar: remover container temporário', () => document.getElementById('dashResumoPagar').remove(), null, []);
    step('relatório mensal', () => navigate('relatorio'), '#page-relatorio', all);
    step('receitas (reembolsos por pessoa)', () => navigate('receitas'), '#page-receitas', all);
    step('despesas agrupadas', () => navigate('despesas'), '#page-despesas', all);
    step('despesas filtradas por cartão direto (banner)', () => navigateToDespesasCartao('dinheiro'), '#despFiltroCartaoBanner', [7]);
    step('despesas: formulário (categorias)', () => { navigate('despesas'); populateDespForma(); }, '#despCat', all);
    step('despesas: formulário (cartão direto)', () => {}, '#despCartao', [7]);
    step('despesas: subcategorias do formulário', () => { document.getElementById('despCat').value = 'cat3'; updateSubcats(); }, '#despSubcat', [3]);
    step('despesas: divisão com pessoas', () => { currentSplitRows = [{ personId: 'pes5', percent: 50 }]; renderSplitRows(); }, '#despSplitList', all);
    step('editar despesa (cat/cartão/sub/pessoas)', () => { currentSplitRows = []; openEditDespesa('d4'); }, '#modalBody', all);
    step('editar despesa: subcategorias', () => { document.getElementById('eDespCat').value = 'cat8'; eUpdateSubcats(); }, '#eDespSubcat', [8]);
    step('parcelamentos', () => navigate('parcelamentos'), '#page-parcelamentos', [0]);
    step('categorias (lista e seletor de pai)', () => navigate('categorias'), '#page-categorias', all);
    step('cartões', () => navigate('cartoes'), '#page-cartoes', all);
    step('editar cartão', () => openEditCartao('card9'), '#modalBody', []);
    step('nova compra no cartão', () => openNovaCompraCartao(), '#modalBody', all);
    step('nova compra: subcategorias', () => { document.getElementById('nDespCat').value = 'cat11'; nUpdateSubcats(); }, '#nDespSubcat', [11]);
    step('conferência de fatura PDF', () => {
      faturaPdfItensExtraidos = [{ data: '02/10', desc: 'Item sintético', valor: 10, cat: 'cat12', subcat: window.__P[12], incluir: true }];
      const box = document.createElement('div'); box.id = 'sec1PdfBox'; box.innerHTML = renderFaturaConferenciaBody('card12');
      document.getElementById('modalBody').replaceChildren(box);
    }, '#sec1PdfBox', all);
    step('pessoas', () => navigate('pessoas'), '#page-pessoas', all);
    step('editar pessoa', () => openEditPessoa('pes2'), '#modalBody', []);
    step('reembolsos / pessoas', () => navigate('relatorioPessoas'), '#page-relatorioPessoas', all);
    step('cofrinho', () => navigate('cofrinho'), '#page-cofrinho', all);
    step('depositar no cofrinho', () => openDepositarCofrinho(), '#modalBody', all);
    step('análise: filtros', () => { navigate('analise'); }, '#filtCat', all);
    step('análise: filtro de cartão', () => {}, '#filtCartao', all);
    step('análise: filtro de pessoa', () => {}, '#filtPessoa', all);
    step('análise: subcategorias do filtro', () => { document.getElementById('filtCat').value = 'cat14'; onFiltCatChange(); }, '#filtSubcat', [14]);
    step('e se... (simulador)', () => {
      navigate('eSe');
      eseItens = [{ id: 'e1', desc: 'Sim', valor: 10, parcelas: 1, mesInicio: 10, anoInicio: 2026, cat: 'cat1', cartao: 'card1' }];
      renderEseItemList();
    }, '#page-eSe', all);
    // SEC-1R — cores de contas pessoais, lista unificada, card de saldos,
    // panorama/reservas/contas do escritório, modais de conta e bolinha do perfil.
    step('contas pessoais (lista e lista unificada)', () => navigate('contas'), '#page-contas', []);
    step('dashboard: card de saldos das contas', () => navigate('dashboard'), '#dashSaldoContas', []);
    step('editar conta pessoal', () => openEditConta('cx1'), '#modalBody', []);
    step('escritório: panorama', () => { closeModal(); navigate('escritorio'); officeSubTab = 'visao'; renderEscritorio(); }, '#escritorioSubContent', []);
    step('escritório: reservas', () => renderOfficeReservasTab(), '#escritorioSubContent', []);
    step('escritório: contas (configurações)', () => renderOfficeConfigTab(), '#escritorioSubContent', []);
    step('editar conta do escritório', () => openEditOfficeConta('ocx2'), '#modalBody', []);
    step('seletor de perfil (bolinha via CSSOM)', () => { closeModal(); perfis.perfil_ok.color = window.__BAD[6]; renderPerfilSwitcher(); }, null, []);
    perfis.perfil_ok.color = '#5b7fff'; renderPerfilSwitcher();
    step('perfis (modal)', () => openPerfilModal(), '#modalBody', all);
    step('renomear perfil malicioso', () => openRenamePerfil(window.__P[2]), '#modalBody', []);
    step('excluir perfil (confirmação)', () => confirmDeletePerfil(window.__P[0]), '#modalBody', [0]);
    step('reset: nome do perfil ativo', () => { perfis.perfil_ok.name = window.__P[1]; abrirResetModal(); }, '#resetEscopoTexto', [1]);
    step('reset: alternar escopo', () => { const c = document.getElementById('resetFabricaCheck'); c.checked = true; onResetFabricaToggle(); c.checked = false; onResetFabricaToggle(); }, '#resetEscopoTexto', [1]);
    perfis.perfil_ok.name = 'Perfil sintético';
    closeModal();
    return out;
  });
  // dá tempo a qualquer busca de recurso disparada por CSS (url(...)) aparecer
  await page.waitForTimeout(400);
  return steps;
}

// SEC-1R — cores renderizadas em contas pessoais e no escritório: inválidas
// viram #888888; legadas válidas (3/4/8 dígitos, maiúsculas) são mantidas.
async function accountColorCheck() {
  const r = await page.evaluate(() => {
    const NB = window.__BAD.length;
    const styles = (sel) => [...document.querySelectorAll(`${sel} [style]`)].map((e) => e.getAttribute('style'));
    // fallback de cada ponto: #888888 (padrão) ou a constante literal de quem
    // chama — panorama usa var(--muted), reservas do escritório usam #5b7fff.
    const conta = (sel, n, fb = '#888888') => styles(sel).filter((s) => s.includes(`background:${fb}`)).length >= n;
    const legadas = (sel) => ['#abc', '#abcd', '#aabbccdd', '#AbCdEf'].every((c) => styles(sel).some((s) => s.includes(`background:${c}`)));
    navigate('contas');
    const contas = { fallback: conta('#page-contas', NB * 2), legadas: legadas('#page-contas') };
    navigate('dashboard');
    const card = { fallback: conta('#dashSaldoContas', NB), legadas: legadas('#dashSaldoContas') };
    navigate('escritorio'); officeSubTab = 'visao'; renderEscritorio();
    const panorama = { fallback: conta('#escritorioSubContent', NB, 'var(--muted)'), legadas: legadas('#escritorioSubContent') };
    renderOfficeReservasTab();
    const reservas = { fallback: conta('#escritorioSubContent', NB, '#5b7fff'), legadas: legadas('#escritorioSubContent') };
    renderOfficeConfigTab();
    const contasEsc = { fallback: conta('#escritorioSubContent', NB), legadas: legadas('#escritorioSubContent') };
    openEditConta('cx2'); const inpConta = document.getElementById('eContaColor').value;
    openEditConta('cl3'); const inpContaLeg = document.getElementById('eContaColor').value;
    openEditOfficeConta('ocx5'); const inpEsc = document.getElementById('eOContaColor').value;
    closeModal();
    perfis.perfil_ok.color = window.__BAD[6]; renderPerfilSwitcher();
    const dot = document.getElementById('perfilAtivoDot');
    const dotOk = getComputedStyle(dot).backgroundImage === 'none' && getComputedStyle(dot).backgroundColor === 'rgb(136, 136, 136)';
    perfis.perfil_ok.color = '#5b7fff'; renderPerfilSwitcher();
    return { contas, card, panorama, reservas, contasEsc, inpConta, inpContaLeg, inpEsc, dotOk, scan: window.__secScan() };
  });
  await page.waitForTimeout(300);
  const blocks = [r.contas, r.card, r.panorama, r.reservas, r.contasEsc];
  const ok = blocks.every((b) => b.fallback && b.legadas) && r.inpConta === '#888888' && r.inpContaLeg === '#abcdef'
    && r.inpEsc === '#888888' && r.dotOk && r.scan.length === 0 && pwnRequests.length === 0;
  return { ok, detail: JSON.stringify({ ...r, pwnRequests: pwnRequests.length }) };
}

const stepsImport = await runRenderSteps('import');
await check('SEC1_IMPORT_ALL_SINKS_NO_EXECUTION', async () => {
  const bad = stepsImport.filter((s) => s.scan.length || s.err);
  return { ok: bad.length === 0 && dialogs.length === 0 && pwnRequests.length === 0, detail: `passos=${stepsImport.length} com problema=${JSON.stringify(bad)} dialogs=${dialogs.length} pwnRequests=${pwnRequests.length}` };
}, 'importação JSON sintética: em todas as telas e modais do escopo nenhum payload executa, nenhum elemento/atributo é injetado, nenhum CSS malicioso, nenhum diálogo e nenhuma requisição a pwn.invalid');

await check('SEC1_IMPORT_TEXT_RENDERED_LITERALLY', async () => {
  const bad = stepsImport.filter((s) => s.missing.length);
  return { ok: bad.length === 0, detail: JSON.stringify(bad.map((s) => ({ passo: s.name, faltando: s.missing }))) };
}, 'importação JSON sintética: cada nome/subcategoria aparece como texto literal no container esperado de cada tela/modal');

await check('SEC1_SELECT_VALUES_ROUNDTRIP', async () => {
  const r = await page.evaluate(() => {
    navigate('despesas'); populateDespForma();
    const wrong = [];
    window.__P.forEach((p, i) => {
      document.getElementById('despCat').value = `cat${i}`; updateSubcats();
      const sel = document.getElementById('despSubcat');
      const opt = [...sel.options].find((o) => o.value === window.__normAttr(p));
      if (!opt) { wrong.push(`${i}:sem opção`); return; }
      sel.value = opt.value;
      if (sel.value !== window.__normAttr(p)) wrong.push(`${i}:valor`);
      if (opt.textContent !== window.__normText(p)) wrong.push(`${i}:texto`);
    });
    return { wrong, scan: window.__secScan() };
  });
  return { ok: !r.wrong.length && !r.scan.length, detail: JSON.stringify(r) };
}, 'select de subcategoria: cada opção mantém value e texto iguais ao dado (com as normalizações do parser) — a seleção continua utilizável');

await check('SEC1_COLORS_FALLBACK_AND_INPUTS', async () => {
  const r = await page.evaluate(() => {
    navigate('cartoes');
    openEditCartao('card9');   // cor maliciosa
    const bad = document.getElementById('eCardColor').value;
    openEditCartao('card0');   // #AbCdEf válido
    const good = document.getElementById('eCardColor').value;
    openEditPessoa('pes1');
    const pes = document.getElementById('ePersonColor').value;
    openRenamePerfil(window.__P[1]);
    const perf = document.getElementById('renamePerfilCor').value;
    closeModal();
    navigateToDespesasCartao('dinheiro');
    const strong = document.querySelector('#despFiltroCartaoBanner strong');
    const bannerColor = strong ? getComputedStyle(strong).color : null;
    return { bad, good, pes, perf, bannerColor, scan: window.__secScan() };
  });
  const ok = r.bad === '#888888' && r.good === '#abcdef' && r.pes === '#888888' && r.perf === '#888888'
    && r.bannerColor === 'rgb(136, 136, 136)' && r.scan.length === 0 && pwnRequests.length === 0;
  return { ok, detail: JSON.stringify(r) };
}, 'cores importadas inválidas viram o fallback fixo #888888 no CSS e nos <input type=color>; cor válida é preservada; nenhum CSS malicioso aplicado');

await check('SEC1R_IMPORT_ACCOUNT_AND_OFFICE_COLORS', accountColorCheck,
  'importação: cores de contas pessoais (lista, lista unificada, card de saldos), panorama/reservas/contas do escritório, modais de conta e bolinha do perfil — inválidas viram #888888, legadas válidas são mantidas, nenhum CSS malicioso nem requisição externa');

await check('SEC1_RENDER_DOES_NOT_CHANGE_PERSISTED_DATA', async () => {
  const r = await page.evaluate((before) => {
    const after = JSON.stringify(buildSaveObject());
    const st = perfis.perfil_ok.data;
    const coresIntactas = st.cards.slice(1).every((c, i) => c.color === (i < 4 ? ['#AbCdEf', '#abc', '#abcd', '#aabbccdd'][i] : window.__BAD[i % window.__BAD.length]))
      && st.pessoas.every((p, i) => p.color === window.__BAD[i % window.__BAD.length]);
    const nomesIntactos = st.categories.every((c, i) => c.name === window.__P[i] && c.subs[0] === window.__P[i]);
    // SEC-1R — cores de contas e do escritório também intactas (inválidas e legadas)
    const LEG = ['#abc', '#abcd', '#aabbccdd', '#AbCdEf'];
    const contasIntactas = window.__BAD.every((c, i) => st.contas.find((x) => x.id === `cx${i}`)?.color === c)
      && LEG.every((c, i) => st.contas.find((x) => x.id === `cl${i}`)?.color === c)
      && window.__BAD.every((c, i) => st.office.contas.find((x) => x.id === `ocx${i}`)?.color === c && st.office.reservas.find((x) => x.id === `orx${i}`)?.color === c)
      && LEG.every((c, i) => st.office.contas.find((x) => x.id === `ocl${i}`)?.color === c && st.office.reservas.find((x) => x.id === `orl${i}`)?.color === c);
    return { igual: after === before, coresIntactas, nomesIntactos, contasIntactas };
  }, snapshotAfterImport);
  return { ok: r.igual && r.coresIntactas && r.nomesIntactos && r.contasIntactas, detail: JSON.stringify(r) };
}, 'renderizar todas as telas e modais não altera nada do que seria persistido: nomes, subcategorias e cores (inclusive inválidas) continuam exatamente como importados');

// ── 2. Controles continuam funcionando (handlers do escopo com jsArg) ──
await check('SEC1_DELSUBCAT_HANDLER_EXACT_ARG', async () => {
  const r = await page.evaluate(() => {
    window.__xss = undefined;
    navigate('categorias');
    const calls = [];
    const orig = window.delSubcat;
    window.delSubcat = (...a) => { calls.push(a); return orig(...a); };
    const wrong = [];
    window.__P.forEach((p, i) => {
      const spans = [...document.querySelectorAll('#page-categorias .badge > span[onclick]')];
      const target = spans.find((s) => s.parentElement.firstChild.textContent.trim() === window.__normText(p).trim()
        && s.getAttribute('onclick').includes(`cat${i}`));
      if (!target) { wrong.push(`${i}:sem botão`); return; }
      const n = calls.length;
      target.click();
      const call = calls[n];
      const cat = state.categories.find((c) => c.id === `cat${i}`);
      if (!call || call[0] !== `cat${i}` || call[1] !== p) wrong.push(`${i}:arg`);
      if (cat.subs.includes(p) || !cat.subs.includes(`sub${i}`)) wrong.push(`${i}:efeito`);
    });
    window.delSubcat = orig;
    return { wrong, chamadas: calls.length, scan: window.__secScan() };
  });
  return { ok: r.wrong.length === 0 && r.chamadas === PAYLOADS.length && r.scan.length === 0, detail: JSON.stringify(r) };
}, 'botão ✕ de subcategoria: delSubcat recebe exatamente (id da categoria, subcategoria original) para todos os payloads, remove só aquela subcategoria e nada executa');

await check('SEC1_PROFILE_HANDLERS_EXACT_ID', async () => {
  const r = await page.evaluate(() => {
    window.__xss = undefined;
    const wrong = [];
    const row = (id) => [...document.querySelectorAll('#modalBody .item-row')].find((el) => el.querySelector('.item-row-name')?.textContent === window.__normText(perfis[id].name));
    // trocar de perfil clicando na linha
    const alvoSwitch = window.__P[3];
    openPerfilModal(); row(alvoSwitch).click();
    if (perfilAtivo !== alvoSwitch) wrong.push('switch');
    switchPerfil('perfil_ok');
    // renomear: ✎ abre o modal certo e Salvar grava no perfil certo
    const alvoRename = window.__P[6];
    openPerfilModal(); row(alvoRename).querySelector('.btn-ghost').click();
    document.getElementById('renamePerfilNome').value = 'Renomeado sintético';
    [...document.querySelectorAll('#modalBody .btn-success')][0].click();
    if (perfis[alvoRename]?.name !== 'Renomeado sintético') wrong.push('rename');
    // excluir: ✕ abre a confirmação e o botão exclui exatamente aquele perfil
    const alvoDel = window.__P[9];
    const antes = Object.keys(perfis).length;
    openPerfilModal(); row(alvoDel).querySelector('.btn-danger').click();
    document.querySelector('#modalBody .btn-danger').click();
    if (perfis[alvoDel] || Object.keys(perfis).length !== antes - 1 || !perfis[window.__P[8]]) wrong.push('delete');
    closeModal();
    return { wrong, ativo: perfilAtivo === 'perfil_ok', scan: window.__secScan() };
  });
  return { ok: r.wrong.length === 0 && r.ativo && r.scan.length === 0, detail: JSON.stringify(r) };
}, 'perfis com id malicioso: trocar, renomear e excluir pelos botões atingem exatamente o perfil certo e nada executa');

// ── 2b. SEC-1R: salvar um modal sem mexer na cor preserva a cor salva ──
const LEG_SAVE = ['#abc', '#abcd', '#aabbccdd', '#AbCdEf', '#aabbcc', 'url(https://pwn.invalid/legado)'];
function legacyData() {
  const base = baseSyntheticState({
    cards: [{ id: 'dinheiro', name: 'Dinheiro/PIX', color: '#38e2b4', fecha: null, paga: null }]
      .concat(LEG_SAVE.map((c, i) => ({ id: `lc${i}`, name: `Cartão L${i}`, color: c, fecha: 3, paga: 10 }))),
    contas: LEG_SAVE.map((c, i) => ({ id: `lk${i}`, name: `Conta L${i}`, color: c, saldoInicial: 10 })),
    pessoas: LEG_SAVE.map((c, i) => ({ id: `lp${i}`, name: `Pessoa L${i}`, color: c })),
    office: { contas: LEG_SAVE.map((c, i) => ({ id: `lo${i}`, name: `Escritório L${i}`, color: c, saldoInicial: 100 })) },
  });
  const perfis = { perfil_ok: { id: 'perfil_ok', name: 'Perfil sintético', color: '#5b7fff', data: base } };
  LEG_SAVE.forEach((c, i) => { perfis[`perfil_l${i}`] = { id: `perfil_l${i}`, name: `Perfil L${i}`, color: c, data: {} }; });
  return { version: 2, perfilAtivo: 'perfil_ok', perfis };
}
await loadState(legacyData());
await installPageHelpers();
await check('SEC1R_EDIT_SAVE_WITHOUT_COLOR_EDIT_PRESERVES_COLOR', async () => {
  const r = await page.evaluate((leg) => {
    window.__xss = undefined;
    const kinds = [
      { k: 'perfil', open: (i) => openRenamePerfil(`perfil_l${i}`), get: (i) => perfis[`perfil_l${i}`].color, input: 'renamePerfilCor' },
      { k: 'cartão', open: (i) => openEditCartao(`lc${i}`), get: (i) => state.cards.find((c) => c.id === `lc${i}`).color, input: 'eCardColor' },
      { k: 'conta', open: (i) => openEditConta(`lk${i}`), get: (i) => state.contas.find((c) => c.id === `lk${i}`).color, input: 'eContaColor' },
      { k: 'pessoa', open: (i) => openEditPessoa(`lp${i}`), get: (i) => state.pessoas.find((c) => c.id === `lp${i}`).color, input: 'ePersonColor' },
      { k: 'conta escritório', open: (i) => openEditOfficeConta(`lo${i}`), get: (i) => state.office.contas.find((c) => c.id === `lo${i}`).color, input: 'eOContaColor' },
    ];
    const save = () => document.querySelector('#modalBody .btn-success').click();
    const wrong = [];
    kinds.forEach(({ k, open, get, input }) => {
      leg.forEach((c, i) => {
        open(i); save();
        if (get(i) !== c) wrong.push(`${k}#${i}: sem edição, ${JSON.stringify(c)} virou ${JSON.stringify(get(i))}`);
      });
      // edição explícita (evento input do seletor) grava a nova cor
      open(0);
      const el = document.getElementById(input); el.value = '#123456'; el.dispatchEvent(new Event('input', { bubbles: true }));
      save();
      if (get(0) !== '#123456') wrong.push(`${k}: edição explícita não gravou (${JSON.stringify(get(0))})`);
    });
    closeModal();
    return { wrong, scan: window.__secScan() };
  }, LEG_SAVE);
  await page.waitForTimeout(300);
  return { ok: r.wrong.length === 0 && r.scan.length === 0 && pwnRequests.length === 0, detail: JSON.stringify(r) };
}, 'perfil, cartão, conta, pessoa e conta do escritório: abrir o modal e salvar sem mexer na cor mantém exatamente a cor salva (#abc, #abcd, #aabbccdd, #AbCdEf, #aabbcc e até um valor inválido); mexer na cor (evento input) grava a nova');

// ── 3. Cadastros pela interface ──
await loadState(baseSyntheticState({ categories: [{ id: 'geral', name: 'Geral', subs: [] }] }));
await installPageHelpers();
await check('SEC1_UI_CADASTROS_NO_EXECUTION_TEXT_LITERAL', async () => {
  const r = await page.evaluate(() => {
    window.__xss = undefined;
    const P = window.__P.filter((p) => p.trim());
    const stored = { cat: [], sub: [], card: [], pes: [], cof: [] };
    P.forEach((p, i) => {
      navigate('categorias');
      document.getElementById('newCatName').value = `u${i} ${p}`; addCategoria();
      stored.cat.push(state.categories[state.categories.length - 1].name);
      document.getElementById('subcatParent').value = 'geral';
      document.getElementById('newSubcatName').value = `u${i} ${p}`; addSubcategoria();
      stored.sub.push(state.categories.find((c) => c.id === 'geral').subs.slice(-1)[0]);
      navigate('cartoes');
      document.getElementById('newCardName').value = `u${i} ${p}`; addCartao();
      stored.card.push(state.cards[state.cards.length - 1].name);
      navigate('pessoas');
      document.getElementById('newPersonName').value = `u${i} ${p}`; addPessoa();
      stored.pes.push(state.pessoas[state.pessoas.length - 1].name);
      navigate('cofrinho');
      document.getElementById('newCofrinhoName').value = `u${i} ${p}`; addCofrinho();
      stored.cof.push(state.cofrinhos[state.cofrinhos.length - 1].name);
    });
    const miss = (sel, list) => { const t = document.querySelector(sel)?.textContent || ''; return list.filter((s) => !t.includes(window.__normText(s))).length; };
    navigate('categorias'); const mCat = miss('#page-categorias', stored.cat.concat(stored.sub));
    navigate('cartoes'); const mCard = miss('#page-cartoes', stored.card);
    navigate('pessoas'); const mPes = miss('#page-pessoas', stored.pes);
    navigate('cofrinho'); const mCof = miss('#page-cofrinho', stored.cof);
    navigate('despesas'); populateDespForma(); const mForm = miss('#despCat', stored.cat);
    openNovaCompraCartao(); const mCompra = miss('#modalBody', stored.card) + miss('#modalBody', stored.cat); closeModal();
    navigate('analise'); const mFilt = miss('#filtPessoa', stored.pes);
    const cadastrados = { cat: stored.cat.length, sub: stored.sub.length, card: stored.card.length, pes: stored.pes.length, cof: stored.cof.length };
    return { total: P.length, cadastrados, faltando: { mCat, mCard, mPes, mCof, mForm, mCompra, mFilt }, scan: window.__secScan() };
  });
  const allStored = Object.values(r.cadastrados).every((n) => n === r.total);
  const noneMissing = Object.values(r.faltando).every((n) => n === 0);
  return { ok: allStored && noneMissing && r.scan.length === 0 && dialogs.length === 0, detail: JSON.stringify(r) };
}, 'cadastros pela interface (categoria, subcategoria, cartão, pessoa, cofrinho) com payloads: todos gravados, exibidos como texto literal nas listas e seletores, nada executa');

await check('SEC1_UI_PROFILE_NAME_NO_EXECUTION', async () => {
  const r = await page.evaluate(() => {
    window.__xss = undefined;
    const nome = window.__P[0];
    openPerfilModal();
    document.getElementById('novoPerfilNome').value = nome;
    criarNovoPerfil();
    const criado = perfis[perfilAtivo].name;
    abrirResetModal();
    const t = document.getElementById('resetEscopoTexto').textContent.includes(window.__normText(criado));
    openPerfilModal();
    const lista = document.getElementById('modalBody').textContent.includes(window.__normText(criado));
    closeModal();
    return { criado: criado === nome, t, lista, scan: window.__secScan() };
  });
  return { ok: r.criado && r.t && r.lista && r.scan.length === 0, detail: JSON.stringify(r) };
}, 'perfil criado pela interface com nome malicioso aparece como texto no modal de perfis e no modal de reset, sem executar');

// ── 4. Carregamento do Drive simulado (sem rede, token de teste) ──
const driveUploads = [];
await page.route('**/www.googleapis.com/**', async (route) => {
  const req = route.request();
  const url = req.url();
  if (req.method() !== 'GET') { driveUploads.push(`${req.method()} ${url}`); return route.fulfill({ status: 200, contentType: 'application/json', body: '{"id":"sec1-drive-file"}' }); }
  if (url.includes('/drive/v3/files/sec1-drive-file')) return route.fulfill({ status: 200, contentType: 'application/json', body: DATA_JSON });
  if (url.includes('/drive/v3/files?')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: [{ id: 'sec1-drive-file', name: 'finflow_data.json', modifiedTime: '2026-10-15T12:00:00Z' }] }) });
  return route.abort();
});
await loadState(baseSyntheticState());
await installPageHelpers();
await page.evaluate(async () => {
  localStorage.removeItem('finflow_unsynced');
  accessToken = 'test-token-not-a-real-credential';
  await syncFromDrive(true);
  renderAll();
});
await installPageHelpers();
const snapshotAfterDrive = await page.evaluate(() => JSON.stringify(buildSaveObject()));
const uploadsBeforeRender = driveUploads.length;
const stepsDrive = await runRenderSteps('drive');

await check('SEC1_DRIVE_LOAD_ALL_SINKS_NO_EXECUTION', async () => {
  const bad = stepsDrive.filter((s) => s.scan.length || s.err || s.missing.length);
  const veioDoDrive = await page.evaluate(() => perfilAtivo === 'perfil_ok' && state.categories.length === window.__P.length);
  return { ok: veioDoDrive && bad.length === 0 && dialogs.length === 0 && pwnRequests.length === 0, detail: `veioDoDrive=${veioDoDrive} passos=${stepsDrive.length} com problema=${JSON.stringify(bad)}` };
}, 'dados carregados do Drive simulado: todas as telas e modais do escopo exibem os payloads como texto, sem execução, injeção ou CSS malicioso');

await check('SEC1R_DRIVE_ACCOUNT_AND_OFFICE_COLORS', accountColorCheck,
  'Drive simulado: as mesmas cores de contas e do escritório são validadas na renderização, sem CSS malicioso nem requisição externa');

await check('SEC1_DRIVE_RENDER_NO_PERSISTENCE_CHANGE', async () => {
  const igual = await page.evaluate((before) => JSON.stringify(buildSaveObject()) === before, snapshotAfterDrive);
  const uploadsDuranteRender = driveUploads.length - uploadsBeforeRender;
  return { ok: igual && uploadsDuranteRender === 0, detail: `igual=${igual} uploadsDuranteRender=${uploadsDuranteRender}` };
}, 'renderizar os dados vindos do Drive não altera o que seria persistido e não dispara nenhum envio ao Drive');

await check('NO_SCRIPT_ERRORS', async () => ({ ok: consoleErrors.length === 0, detail: `erros de console: ${JSON.stringify(consoleErrors)}` }), 'nenhum erro de execução ao longo da suíte SEC-1');

} finally {
  await close();
}

const fails = results.filter((r) => r.status === 'FAIL').length;
console.log(`sec1-xss-render: TOTAL=${results.length} PASS=${results.length - fails} FAIL=${fails}`);
if (fails > 0) process.exitCode = 1;

export { results };
