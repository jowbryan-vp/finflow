// Gate UX-1 — Dashboard de caixa (Necessidade / Folga de caixa).
//
// O Dashboard responde só "consigo pagar tudo até o próximo salário?": três
// cards (Disponível agora / A pagar até DD/MM / Necessidade ou Folga de caixa)
// tirados de getFinancialOutlook(hoje, fim do ciclo), uma linha informativa e
// a lista do que compõe "A pagar". O orçamento por competência, a projeção
// detalhada e as preferências ficam na aba Análise. O card "Resultado
// projetado do mês" não existe mais em nenhuma tela.
//
// Fixture sintética (fixtures/ux1-cash-dashboard-fixture.mjs) com a forma do
// caso relatado em 30/09/2026 — nenhum dado real.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openHarness, makeRunner, REPO_ROOT } from './harness.mjs';
import { cashFixture, CASH_TODAY, CASH_END } from './fixtures/ux1-cash-dashboard-fixture.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Último commit aprovado antes deste gate (reauditoria 2 PASS). O motor
// (getFinancialOutlook / getPersonalMonthProjection) precisa devolver os
// mesmos números nos dois.
const BASE_COMMIT = 'a90547fe36be18a7658010b8bc89f87a2d52e8ee';

const { browser, page, baseUrl, loadState, close, consoleErrors } = await openHarness();
const { check, results } = makeRunner('ux1-cash-dashboard');
await page.clock.setFixedTime(new Date(2026, 8, 30, 12)); // 30/09/2026

const txt = (sel) => page.locator(sel).innerText();
const openDash = () => page.evaluate(() => { currentMonth = 10; currentYear = 2026; navigate('dashboard'); });
const openAnalise = () => page.evaluate(() => { currentMonth = 10; currentYear = 2026; navigate('analise'); });
const cents = (t) => {
  const neg = /[−-]/.test(t);
  const v = Math.round(Number(t.replace(/[^\d,]/g, '').replace(',', '.')) * 100);
  return neg ? -v : v;
};
const heroState = () => page.evaluate(() => ({
  label: document.getElementById('cashResultLabel').textContent, // maiúsculas só via CSS
  value: document.getElementById('cashResult').innerText,
  cls: document.getElementById('cashResult').className,
  tile: document.getElementById('cashResultTile').className,
  note: document.getElementById('cashResultNote').innerText,
  color: getComputedStyle(document.getElementById('cashResult')).color,
}));
const listState = () => page.evaluate(() => ({
  rows: [...document.querySelectorAll('#cashPayList .cash-pay-row')].map((r) => ({
    date: r.querySelector('.cash-pay-date').innerText, name: r.querySelector('.item-row-name').innerText,
    kind: r.dataset.kind, cents: Number(r.dataset.cents), shown: r.querySelector('.item-row-val').innerText })),
  total: document.getElementById('cashPayTotal').innerText,
  title: document.querySelector('#cashPayList .card-title').innerText,
}));
// Saldo da conta 1 que leva o disponível a um valor exato (6.705,89 na base).
const withAvailable = (availableCents) => cashFixture({ saldo1: (availableCents - 670589 + 140589) / 100 });

try {

// ── Cenário de aceitação ──────────────────────────────────────────────────
await check('UX1_01_ACCEPTANCE_NEED', async () => {
  await loadState(cashFixture()); await openDash();
  const h = await heroState();
  const r = { avail: await txt('#cashAvailable'), oblLabel: await page.locator('#cashObligationsLabel').textContent(), obl: await txt('#cashObligations'), ...h };
  const ok = r.avail === 'R$ 6.705,89' && r.oblLabel.toLowerCase() === 'a pagar até 29/10' && r.obl === 'R$ 11.978,13'
    && r.label === 'Necessidade de caixa' && r.value === 'R$ 5.272,24' && !/[−-]/.test(r.value)
    && r.cls.includes('red') && r.tile.includes('t-danger') && r.color === 'rgb(255, 95, 109)'
    && r.note === 'Falta cobrir para pagar tudo até 29/10.';
  return { ok, detail: JSON.stringify(r) };
}, 'Disponível 6.705,89 · A pagar até 29/10 11.978,13 · Necessidade de caixa R$ 5.272,24 (vermelho, sem sinal)');

await check('UX1_02_SAME_NUMBERS_AS_ENGINE', async () => {
  const r = await page.evaluate(([t, e]) => {
    const p = getFinancialOutlook(t, e);
    return { available: toCents(p.available), obligations: toCents(p.obligations), committed: toCents(p.committed),
      contracted: toCents(p.contracted), cycleEnd: getCurrentFinancialCycle(t).endDate };
  }, [CASH_TODAY, CASH_END]);
  const shown = { a: cents(await txt('#cashAvailable')), o: cents(await txt('#cashObligations')), c: cents(await txt('#cashResult')) };
  const ok = r.cycleEnd === CASH_END && r.available === 670589 && r.obligations === 1197813 && r.committed === -527224
    && shown.a === r.available && shown.o === r.obligations && shown.c === Math.abs(r.committed);
  return { ok, detail: JSON.stringify({ r, shown }) };
}, 'cards reaproveitam exatamente getFinancialOutlook(hoje, fim do ciclo)');

await check('UX1_03_MISSING_ACCOUNT_LINE', async () => {
  const line = await txt('#cashMissingAccount');
  const issues = await page.evaluate(([t, e]) => getFinancialOutlook(t, e).issues.filter((i) => i.reason === 'missing_personal_account'), [CASH_TODAY, CASH_END]);
  const ok = line.includes('R$ 3.120,00') && /previstos sem conta de destino/.test(line) && /defina a conta para entrarem no caixa/.test(line)
    && issues.length === 2 && issues.reduce((s, i) => s + Math.round(i.amount * 100), 0) === 312000;
  return { ok, detail: JSON.stringify({ line, issues }) };
}, '"R$ 3.120,00 previstos sem conta de destino" vem dos itens marcados pelo motor em issues');

await check('UX1_04_LIST_MATCHES_CARD', async () => {
  const l = await listState();
  const card = cents(await txt('#cashObligations'));
  const sum = l.rows.reduce((s, r) => s + r.cents, 0);
  const shownSum = l.rows.reduce((s, r) => s + cents(r.shown), 0);
  const names = l.rows.map((r) => `${r.date} ${r.name}`);
  const esperado = ['07/10 Fatura MP', '08/10 IPOG', '10/10 FIES', '10/10 Unimed', '10/10 Fatura NU', '20/10 Claro', 'sem data Contribuição', 'sem data Ricardo'];
  const ok = sum === 1197813 && shownSum === 1197813 && card === 1197813 && cents(l.total) === card
    && JSON.stringify(names) === JSON.stringify(esperado) && l.title.includes('A pagar até 29/10');
  return { ok, detail: JSON.stringify({ sum, shownSum, card, total: l.total, names }) };
}, 'lista "A pagar até 29/10" ordenada por data (sem data no fim) soma 11.978,13, centavo a centavo com o card');

await check('UX1_05_CONTRACTED_LINE', async () => {
  const zero = await txt('#cashInfo');
  const semComplemento = await page.evaluate(() => !document.getElementById('cashIfReceived'));
  // Receita confirmada, com data e conta pessoal → entra em p.contracted.
  const add = (valor) => page.evaluate((v) => {
    state.receitas = state.receitas.filter((r) => r.id !== 'conf');
    state.receitas.push({ id: 'conf', tipo: 'outro', nome: 'Projeto confirmado', valor: v, conta: 'c1', certeza: 'contratado', estado: 'previsto',
      dataPrevista: '2026-10-20', dataRecebimento: null, competenciaMes: 10, competenciaAno: 2026, mes: 10, ano: 2026, tributavel: false, createdAt: 'conf' });
    renderDashboard();
  }, valor);
  await add(2000);
  const parcial = await txt('#cashInfo');
  await add(6000);
  const sobra = await txt('#cashInfo');
  const hero = await heroState();
  const ok = zero.includes('A receber confirmado até 29/10: R$ 0,00') && semComplemento
    && parcial.includes('A receber confirmado até 29/10: R$ 2.000,00') && parcial.includes('Se tudo entrar, a necessidade cai para R$ 3.272,24')
    && sobra.includes('R$ 6.000,00') && sobra.includes('Se tudo entrar, passa a sobrar R$ 727,76')
    && hero.label === 'Necessidade de caixa' && hero.value === 'R$ 5.272,24';
  return { ok, detail: JSON.stringify({ zero, parcial, sobra }) };
}, 'a receber confirmado: R$ 0,00; 2.000 → necessidade cai para 3.272,24; 6.000 → passa a sobrar 727,76 (card não muda)');

// ── Sinal → rótulo e cor ──────────────────────────────────────────────────
await check('UX1_06_SLACK_GREEN', async () => {
  await loadState(withAvailable(1270589)); await openDash();
  const h = await heroState();
  const ok = h.label === 'Folga de caixa' && h.value === 'R$ 727,76' && h.cls.includes('green') && !h.cls.includes('red')
    && h.tile.includes('t-ok') && h.color === 'rgb(56, 226, 180)' && h.note === 'Sobra depois de pagar tudo até 29/10.'
    && await page.evaluate(() => !document.getElementById('cashIfReceived'));
  return { ok, detail: JSON.stringify(h) };
}, 'disponível 12.705,89 > a pagar → "Folga de caixa" R$ 727,76 (verde)');

await check('UX1_07_ZERO_IS_SLACK', async () => {
  await loadState(withAvailable(1197813)); await openDash();
  const h = await heroState();
  const committed = await page.evaluate(([t, e]) => toCents(getFinancialOutlook(t, e).committed), [CASH_TODAY, CASH_END]);
  const ok = committed === 0 && h.label === 'Folga de caixa' && h.value === 'R$ 0,00' && h.cls.includes('green') && h.tile.includes('t-ok');
  return { ok, detail: JSON.stringify({ committed, ...h }) };
}, 'exatamente zero → "Folga de caixa" R$ 0,00 (verde)');

await check('UX1_08_ONE_CENT_NEED_ABS', async () => {
  await loadState(withAvailable(1197812)); await openDash();
  const h = await heroState();
  const ok = h.label === 'Necessidade de caixa' && h.value === 'R$ 0,01' && h.cls.includes('red');
  return { ok, detail: JSON.stringify(h) };
}, 'um centavo negativo → "Necessidade de caixa" R$ 0,01, em módulo');

// ── Card removido / blocos movidos ────────────────────────────────────────
await check('UX1_09_PROJECTED_CARD_REMOVED_EVERYWHERE', async () => {
  await loadState(cashFixture());
  const r = await page.evaluate(() => {
    const pages = [...document.querySelectorAll('.nav-item[data-page]')].map((n) => n.dataset.page);
    const hits = [];
    currentMonth = 10; currentYear = 2026;
    for (const p of pages) {
      navigate(p);
      if (document.getElementById('pmResultadoProjetado') || document.getElementById('pmResultadoFormula') || document.getElementById('pmResultadoTexto')
        || document.body.innerText.includes('Resultado projetado do mês')) hits.push(p);
    }
    navigate('dashboard');
    return { pages, hits };
  });
  const src = fs.readFileSync(path.join(REPO_ROOT, 'index.html'), 'utf8');
  const ok = r.pages.length >= 10 && r.hits.length === 0 && !src.includes('pmResultadoProjetado') && !src.includes('Resultado projetado do mês');
  return { ok, detail: JSON.stringify(r) };
}, '"Resultado projetado do mês" (pmResultadoProjetado) não existe em nenhuma página nem no código da interface');

await check('UX1_10_DASHBOARD_ONLY_CASH', async () => {
  const r = await page.evaluate(() => {
    const dash = document.getElementById('page-dashboard');
    const has = (sel) => !!dash.querySelector(sel);
    return { text: dash.innerText, moved: ['#anResumoMensal', '#anDetalhamento', '#pmSaldoAcumulado', '#pmResultadoCompleto', '#outlookProjected', '#pmPiorCenario',
      '#primarySalarySelect', '#projectionEndDate', '#variableMethodSelect', '#historyStartMonthInput', '#outlookPotentials'].filter(has) };
  });
  const ok = r.moved.length === 0 && !/Fluxo de caixa a partir de hoje/.test(r.text) && !/Resumo pessoal/.test(r.text) && !/Após obrigações/.test(r.text)
    && /Caixa até o próximo salário/.test(r.text);
  return { ok, detail: JSON.stringify(r.moved) };
}, 'Dashboard não tem mais o resumo por competência, cenários, saldo projetado nem preferências');

await check('UX1_11_ANALISE_HAS_COMPETENCE_AND_SCENARIOS', async () => {
  await openAnalise();
  const r = await page.evaluate(() => {
    const an = document.getElementById('page-analise');
    const vis = (id) => { const el = document.getElementById(id); return !!el && an.contains(el) && el.getClientRects().length > 0; };
    return {
      vis: ['anResumoMensal', 'pmEntradasPrevistas', 'pmSaidasPrevistas', 'pmResultadoCompleto', 'pmSaldoAcumulado', 'pmCompEntradas', 'pmCompSaidas',
        'pmPiorCenario', 'pmMelhorCenario', 'outlookProjected', 'outlookPotentials', 'anPrevisaoMedia', 'outlookRisk',
        'primarySalarySelect', 'projectionEndDate', 'variableMethodSelect', 'historyStartMonthInput', 'filtCat'].filter((id) => !vis(id)),
      titulo: document.querySelector('#anResumoMensal .section-title').innerText,
      aviso: document.getElementById('pmCompetenciaAviso').innerText,
      projetado: document.getElementById('outlookProjected').closest('.pm-tile').innerText,
    };
  });
  const ok = r.vis.length === 0 && /orçamento do mês — competência outubro 2026/i.test(r.titulo) && /não caixa/i.test(r.aviso)
    && r.projetado.includes('Saldo projetado em 29/10/2026 (fim do período)') && r.projetado.includes('estimativa variável');
  return { ok, detail: JSON.stringify(r) };
}, 'Análise mostra competência (título explícito), resultado completo, saldo acumulado, saldo projetado com estimativa, cenários, potenciais e preferências');

await check('UX1_12_PREFERENCES_IN_ANALISE_REFLECT_DASHBOARD', async () => {
  await openAnalise();
  await page.locator('#projectionEndDate').fill('2026-10-15');
  await page.locator('#projectionEndDate').dispatchEvent('change');
  const saved = await page.evaluate(() => state.financialPreferences.projectionEndDate);
  const eng = await page.evaluate((t) => toCents(getFinancialOutlook(t, '2026-10-15').obligations), CASH_TODAY);
  const dashLabel = await page.locator('#cashObligationsLabel').textContent(); const dashObl = cents(await txt('#cashObligations'));
  const l = await listState(); const sum = l.rows.reduce((s, x) => s + x.cents, 0);
  await page.locator('#variableMethodSelect').selectOption('simple');
  const method = await page.evaluate(() => state.financialPreferences.variableMethod);
  await page.getByRole('button', { name: 'Usar fim do ciclo' }).click();
  const back = await page.locator('#cashObligationsLabel').textContent();
  const ok = saved === '2026-10-15' && dashLabel.toLowerCase() === 'a pagar até 15/10' && dashObl === eng && eng === 1193323 && sum === eng
    && l.title.includes('15/10') && method === 'simple' && back.toLowerCase() === 'a pagar até 29/10';
  return { ok, detail: JSON.stringify({ saved, dashLabel, dashObl, eng, sum, method, back }) };
}, '"Planejar até" e método alterados na Análise (setFinancialPreference) refletem no destaque e na lista do Dashboard');

// ── Motor intacto: mesmos números que o commit-base ───────────────────────
await check('UX1_13_ENGINE_IDENTICAL_TO_BASE', async () => {
  let baseHtml;
  try { baseHtml = execFileSync('git', ['show', `${BASE_COMMIT}:index.html`], { cwd: REPO_ROOT, maxBuffer: 64 * 1024 * 1024 }).toString('utf8'); }
  catch (e) { return { ok: false, detail: `git show falhou: ${e.message}` }; }
  const basePage = await browser.newPage();
  await basePage.route('**/cdn.jsdelivr.net/npm/chart.js@**', (r) => r.fulfill({ path: path.join(__dirname, 'fixtures', 'chart-stub.js'), contentType: 'application/javascript' }));
  await basePage.route('**/cdnjs.cloudflare.com/**', (r) => r.abort());
  await basePage.route('**fonts.googleapis.com/**', (r) => r.abort());
  await basePage.route('**fonts.gstatic.com/**', (r) => r.abort());
  await basePage.route('**/__ux1_base__.html', (r) => r.fulfill({ body: baseHtml, contentType: 'text/html; charset=utf-8' }));
  await basePage.clock.setFixedTime(new Date(2026, 8, 30, 12));
  await basePage.goto(`${baseUrl}/__ux1_base__.html`, { waitUntil: 'domcontentloaded' });
  const fixtures = [cashFixture(), withAvailable(1270589), withAvailable(1197813)];
  // Variação com receita confirmada, potencial e pagamento já marcado.
  const rica = cashFixture();
  rica.receitas.push({ id: 'conf', tipo: 'outro', nome: 'Projeto confirmado', valor: 2000, conta: 'c1', certeza: 'contratado', estado: 'previsto', dataPrevista: '2026-10-20', dataRecebimento: null, competenciaMes: 10, competenciaAno: 2026, mes: 10, ano: 2026, tributavel: false, createdAt: 'conf' });
  rica.receitas.push({ id: 'pot', tipo: 'projeto', nome: 'Proposta', valor: 9000, certeza: 'potencial', estado: 'previsto', dataPrevista: '2026-10-12', conta: null, tributavel: false, createdAt: 'pot' });
  rica.despesas.find((d) => d.id === 'ipog').pagoMeses = { '2026-10': true };
  fixtures.push(rica);
  const snap = (raw) => {
    migrateAppData(JSON.parse(JSON.stringify(raw)));
    const out = { outlook: [], personal: [] };
    for (const end of ['2026-10-29', '2026-10-15', '2026-12-31']) {
      const p = getFinancialOutlook('2026-09-30', end);
      out.outlook.push({ ...p, issues: p.issues.map((i) => ({ id: i.id, reason: i.reason })), issueAmounts: p.issues.map((i) => i.amount) });
    }
    for (const [m, a] of [[9, 2026], [10, 2026], [11, 2026], [1, 2027]]) out.personal.push(getPersonalMonthProjection(m, a, { today: '2026-09-30' }));
    return JSON.stringify(out);
  };
  const diffs = [];
  let extraOk = true;
  for (const [i, raw] of fixtures.entries()) {
    const now = JSON.parse(await page.evaluate(snap, raw));
    const base = JSON.parse(await basePage.evaluate(snap, raw));
    // Única diferença permitida: issues de receita sem conta passam a trazer o
    // valor do item (amount); antes não traziam nada.
    for (const o of base.outlook) o.issueAmounts = o.issueAmounts.map(() => null);
    for (const [k, o] of now.outlook.entries()) {
      const flagged = o.issues.map((x, j) => [x.reason, o.issueAmounts[j]]);
      if (!flagged.every(([reason, amt]) => (reason === 'missing_personal_account') === Number.isFinite(amt))) extraOk = false;
      if (base.outlook[k].issueAmounts.some((x) => x !== null)) extraOk = false;
      o.issueAmounts = o.issueAmounts.map(() => null);
    }
    if (JSON.stringify(now) !== JSON.stringify(base)) diffs.push(i);
  }
  await basePage.close();
  return { ok: diffs.length === 0 && extraOk, detail: `fixtures com diferença: ${JSON.stringify(diffs)}; amount só em missing_personal_account=${extraOk}` };
}, `getFinancialOutlook e getPersonalMonthProjection idênticos ao commit-base ${BASE_COMMIT.slice(0, 7)} (só o valor informativo em issues é novo)`);

// ── Ação de pagamento e ausência de mutação ───────────────────────────────
await check('UX1_14_RENDER_DOES_NOT_MUTATE', async () => {
  await loadState(cashFixture());
  const r = await page.evaluate(() => {
    const antes = JSON.stringify(state);
    for (const p of ['dashboard', 'analise', 'dashboard']) { currentMonth = 10; currentYear = 2026; navigate(p); }
    for (const d of [1, -1, -1, 1]) changeMonth(d);
    renderDashboard(); renderAnalise();
    return JSON.stringify(state) === antes;
  });
  return { ok: r, detail: `state inalterado=${r}` };
}, 'renderizar Dashboard e Análise e trocar de mês não alteram state');

await check('UX1_15_PAY_BUTTON_KEEPS_CONSISTENCY', async () => {
  await openDash();
  await page.locator('#cashPayList .cash-pay-row', { hasText: 'IPOG' }).getByRole('button', { name: '✓ Pago' }).click();
  const paid = await page.evaluate(() => !!state.despesas.find((d) => d.id === 'ipog').pagoMeses['2026-10']);
  const l = await listState(); const card = cents(await txt('#cashObligations'));
  const sum = l.rows.reduce((s, x) => s + x.cents, 0);
  const h = await heroState(); const avail = cents(await txt('#cashAvailable'));
  // PIX pago sai da conta: disponível e a pagar caem 490, a necessidade não muda.
  const ok = paid && !l.rows.some((x) => x.name === 'IPOG') && card === 1197813 - 49000 && sum === card && avail === 670589 - 49000 && h.value === 'R$ 5.272,24';
  return { ok, detail: JSON.stringify({ paid, card, sum, avail, value: h.value }) };
}, '"✓ Pago" na lista usa a ação existente; item sai, disponível e a pagar caem juntos e card/lista continuam batendo');

// ── Celular ───────────────────────────────────────────────────────────────
await check('UX1_16_MOBILE_390', async () => {
  await loadState(cashFixture());
  await page.setViewportSize({ width: 390, height: 844 });
  const r = await page.evaluate(() => {
    const fits = (id) => { const el = document.getElementById(id); return el.clientWidth > 0 && el.scrollWidth <= el.clientWidth + 2; };
    currentMonth = 10; currentYear = 2026; navigate('dashboard');
    const tops = [...document.querySelectorAll('#cashHighlight .hero-tile')].map((t) => Math.round(t.getBoundingClientRect().top));
    const dash = { hero: fits('dashHero'), lista: fits('dashProximosVencimentos'), empilhado: new Set(tops).size === 3,
      page: document.documentElement.scrollWidth <= window.innerWidth + 1 };
    navigate('analise');
    const an = { config: fits('anConfigPlanejamento'), resumo: fits('anResumoMensal'), caixa: fits('anProjecaoCaixa'), page: document.documentElement.scrollWidth <= window.innerWidth + 1 };
    navigate('dashboard');
    return { dash, an };
  });
  await page.setViewportSize({ width: 1440, height: 1600 });
  const ok = Object.values(r.dash).every(Boolean) && Object.values(r.an).every(Boolean);
  return { ok, detail: JSON.stringify(r) };
}, 'em 390 px os três cards empilham, sem rolagem lateral no Dashboard nem na Análise');

await check('UX1_17_NO_SCRIPT_ERRORS', async () => ({ ok: consoleErrors.length === 0, detail: JSON.stringify(consoleErrors) }), 'nenhum erro de console');

// ── Capturas de tela (só quando pedidas) ──────────────────────────────────
if (process.env.FINFLOW_SCREENSHOT_DIR) {
  const dir = process.env.FINFLOW_SCREENSHOT_DIR;
  // Avisos transitórios e a tela de login do Drive (o harness não tem OAuth) podem surgir no meio
  // da captura de página inteira; ficam fora das imagens.
  await page.addStyleTag({ content: '#toast,#authScreen{display:none!important}#appShell{display:flex!important}' });
  const shot = async (state, name, where) => {
    await loadState(state);
    for (const [w, h, suf] of [[1440, 1100, 'desktop'], [390, 844, 'mobile']]) {
      await page.setViewportSize({ width: w, height: h });
      await page.evaluate((p) => {
        // Mesmo estado de tela do loadState do harness (sem OAuth).
        document.getElementById('authScreen').style.display = 'none'; document.getElementById('appShell').style.display = 'flex';
        currentMonth = 10; currentYear = 2026; navigate(p); window.scrollTo(0, 0);
      }, where);
      if (suf === 'mobile') await page.waitForFunction(() => document.getElementById('sidebar').getBoundingClientRect().right <= 1);
      // Toasts (ex.: aviso de Drive sem login no harness) não entram na captura.
      await page.waitForFunction(() => !document.getElementById('toast').classList.contains('show'), null, { timeout: 15000 });
      await page.screenshot({ path: `${dir}/ux1-${name}-${suf}.png`, fullPage: true });
    }
    await page.setViewportSize({ width: 1440, height: 1600 });
  };
  await shot(cashFixture(), 'dashboard-necessidade', 'dashboard');
  await shot(withAvailable(1270589), 'dashboard-folga', 'dashboard');
  await shot(cashFixture(), 'analise', 'analise');
}

} finally {
  await close();
}
const fail = results.filter((r) => r.status === 'FAIL').length;
console.log(`ux1-cash-dashboard: TOTAL=${results.length} PASS=${results.length - fail} FAIL=${fail}`);
process.exitCode = fail ? 1 : 0;
