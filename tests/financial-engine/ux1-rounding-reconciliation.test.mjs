// Correção P2 da auditoria Codex docs/audits/UX1-E-PARCELADA-CODEX-2026-10-03.md
// (branch fix/parcelada-dia-vencimento, base 87f068e).
//
// O card "A pagar até DD/MM" arredonda o agregado do motor (p.obligations);
// cada linha da lista arredonda o próprio valor. Com frações de centavo (ex.:
// parcela 100/3) as duas somas diferem. A lista passa a exibir uma linha
// explícita "Ajuste de arredondamento" (sem data, sem botão de pagamento, fora
// de .cash-pay-row) com a diferença: linhas + ajuste = total = card, centavo a
// centavo. O motor, as linhas e o state continuam idênticos ao commit-base.
//
// Somente dados sintéticos.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openHarness, makeRunner, baseSyntheticState, REPO_ROOT } from './harness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Ponta auditada (FAIL P2), imediatamente antes desta correção.
const BASE_COMMIT = '87f068e';
const TODAY = '2026-10-03';
const END = '2026-10-31';
const FIXED_NOW = new Date(2026, 9, 3, 12); // 03/10/2026

const { browser, page, baseUrl, loadState, close, consoleErrors } = await openHarness();
const { check, results } = makeRunner('ux1-rounding-reconciliation');
await page.clock.setFixedTime(FIXED_NOW);
await page.reload({ waitUntil: 'domcontentloaded' });

const cards = [
  { id: 'dinheiro', name: 'Dinheiro/PIX', color: '#38e2b4', fecha: null, paga: null },
  { id: 'nu', name: 'Nubank', color: '#820ad1', fecha: 3, paga: 10 },
  { id: 'mp', name: 'Mercado Pago', color: '#00b1ea', fecha: 1, paga: 7 },
  { id: 'semfecha', name: 'Cartão sem fechamento configurado', color: '#ff8800', fecha: null, paga: null },
];
// Compra legada (sem dataCompra) iniciada em 09/2026: em 10/2026 a parcela é valor/parcelas.
const compra = (id, cartao, valor, over = {}) => ({ id, desc: `Compra ${id}`, cat: 'geral', subcat: 'Geral', cartao, conta: cartao === 'dinheiro' ? 'c1' : null,
  valor, parcelas: 3, mesInicio: 9, anoInicio: 2026, dataCompra: null, fixa: false, diaVencimento: null, debitoAutomatico: false,
  ignorarAntes: null, pagoMeses: {}, split: [], repasses: {}, createdAt: id, ...over });
const fixture = (despesas, extra = {}) => baseSyntheticState({ cards, despesas, financialPreferences: { projectionEndDate: END }, ...extra });

// Três faturas de 100/3 → motor 100,00; linhas 3 × 33,33 = 99,99; ajuste +0,01.
const tresFaturas = () => fixture([compra('a', 'nu', 100), compra('b', 'mp', 100), compra('c', 'semfecha', 100)]);
// Duas faturas de 200/3 → motor 133,33; linhas 2 × 66,67 = 133,34; ajuste −0,01.
const ajusteNegativo = () => fixture([compra('a', 'nu', 200), compra('b', 'mp', 200)]);
// Faturas + PIX parcelado com dia (parcela de 09 já paga) + contribuição fracionária (20/3):
// motor 33,333… × 3 + 6,666… = 106,67; linhas 33,33 × 3 + 6,67 = 106,66; ajuste +0,01.
const mistura = () => fixture([compra('a', 'nu', 100), compra('b', 'mp', 100), compra('pix', 'dinheiro', 100, { diaVencimento: 15, pagoMeses: { '2026-09': true } })],
  { contribuicaoAjustes: { '2026-10': 20 / 3 } });

const cents = (t) => {
  const neg = /[−-]/.test(t);
  const v = Math.round(Number(t.replace(/[^\d,]/g, '').replace(',', '.')) * 100);
  return neg ? -v : v;
};
const openDash = () => page.evaluate(() => { currentMonth = 10; currentYear = 2026; navigate('dashboard'); });
const view = () => page.evaluate(() => {
  const adj = document.getElementById('cashPayAdjust');
  const p = getCashOutlookView().p;
  return {
    engineCents: toCents(p.obligations), availableCents: toCents(p.available),
    card: document.getElementById('cashObligations').innerText,
    total: document.getElementById('cashPayTotal').innerText,
    result: document.getElementById('cashResult').innerText,
    resultLabel: document.getElementById('cashResultLabel').textContent,
    rows: [...document.querySelectorAll('#cashPayList .cash-pay-row')].map((r) => ({
      name: r.querySelector('.item-row-name').innerText, kind: r.dataset.kind, cents: Number(r.dataset.cents),
      shown: r.querySelector('.item-row-val').innerText, button: !!r.querySelector('button') })),
    adjust: adj ? { kind: adj.dataset.kind, cents: Number(adj.dataset.cents), shown: adj.querySelector('.item-row-val').innerText,
      text: adj.innerText, button: !!adj.querySelector('button'), isPayRow: adj.classList.contains('cash-pay-row') } : null,
  };
});
// Invariante: linhas exibidas + ajuste exibido = total exibido = card exibido = motor.
const reconciles = (v) => {
  const rowsShown = v.rows.reduce((s, r) => s + cents(r.shown), 0);
  const rowsData = v.rows.reduce((s, r) => s + r.cents, 0);
  const adjShown = v.adjust ? cents(v.adjust.shown) : 0;
  return rowsShown === rowsData && rowsShown + adjShown === cents(v.total) && cents(v.total) === cents(v.card)
    && cents(v.card) === v.engineCents && (v.adjust ? v.adjust.cents === adjShown : true);
};
const adjustIsNotPayable = (a) => !!a && a.kind === 'rounding' && !a.button && !a.isPayRow
  && /Ajuste de arredondamento/.test(a.text) && /Não é uma conta a pagar/.test(a.text);

try {

await check('UX1R_01_REPRO_TWO_INVOICES', async () => {
  // Cenário exato do relatório Codex: duas faturas de 100/3 em cartões diferentes.
  await loadState(fixture([compra('a', 'nu', 100), compra('b', 'semfecha', 100)])); await openDash();
  const v = await view();
  const ok = reconciles(v) && v.card === 'R$ 66,67' && v.total === 'R$ 66,67' && v.rows.length === 2
    && v.rows.every((r) => r.shown === 'R$ 33,33' && r.button) && adjustIsNotPayable(v.adjust) && v.adjust.shown === '+ R$ 0,01';
  return { ok, detail: JSON.stringify(v) };
}, 'duas faturas de 100/3: linhas 33,33 + 33,33, ajuste "+ R$ 0,01", total 66,67 = card 66,67');

await check('UX1R_02_THREE_FRACTIONAL_INVOICES', async () => {
  await loadState(tresFaturas()); await openDash();
  const v = await view();
  const ok = reconciles(v) && v.card === 'R$ 100,00' && v.total === 'R$ 100,00' && v.rows.length === 3
    && v.rows.every((r) => r.kind === 'invoice' && r.shown === 'R$ 33,33') && adjustIsNotPayable(v.adjust) && v.adjust.cents === 1;
  return { ok, detail: JSON.stringify(v) };
}, 'três faturas de 100/3: linhas 3 × 33,33 = 99,99 + ajuste 0,01 = total 100,00 = card');

await check('UX1R_03_NEGATIVE_ADJUSTMENT', async () => {
  await loadState(ajusteNegativo()); await openDash();
  const v = await view();
  const ok = reconciles(v) && v.card === 'R$ 133,33' && v.total === 'R$ 133,33'
    && v.rows.every((r) => r.shown === 'R$ 66,67') && adjustIsNotPayable(v.adjust) && v.adjust.cents === -1 && v.adjust.shown === '− R$ 0,01';
  return { ok, detail: JSON.stringify(v) };
}, 'duas faturas de 200/3: linhas 2 × 66,67 = 133,34 + ajuste "− R$ 0,01" = total 133,33 = card');

await check('UX1R_04_MIX_EXPENSE_CONTRIBUTION', async () => {
  await loadState(mistura()); await openDash();
  const v = await view();
  const kinds = v.rows.map((r) => r.kind).sort().join(',');
  const contrib = v.rows.find((r) => r.kind === 'contribution');
  const pix = v.rows.find((r) => r.kind === 'expense');
  // Folga = disponível − motor, o mesmo número do card de resultado.
  const ok = reconciles(v) && kinds === 'contribution,expense,invoice,invoice' && v.card === 'R$ 106,67'
    && contrib && contrib.shown === 'R$ 6,67' && !contrib.button && pix && pix.shown === 'R$ 33,33' && pix.button
    && adjustIsNotPayable(v.adjust) && v.adjust.cents === 1
    && v.resultLabel === 'Folga de caixa' && cents(v.result) === v.availableCents - v.engineCents;
  return { ok, detail: JSON.stringify(v) };
}, 'faturas + PIX parcelado + contribuição 20/3: linhas 106,66 + ajuste 0,01 = total 106,67 = card; folga = disponível − card');

await check('UX1R_05_NO_ADJUSTMENT_WHEN_EXACT', async () => {
  await loadState(fixture([compra('a', 'nu', 90), compra('b', 'mp', 60)])); await openDash();
  const v = await view();
  const ok = reconciles(v) && v.adjust === null && v.card === 'R$ 50,00' && v.total === 'R$ 50,00';
  return { ok, detail: JSON.stringify(v) };
}, 'parcelas exatas (30,00 + 20,00): nenhuma linha de ajuste, total 50,00 = card');

await check('UX1R_06_AFTER_INVOICE_PAYMENT', async () => {
  await loadState(tresFaturas()); await openDash();
  const antes = await view();
  const steps = [];
  // Ação existente: "✓ Pago" abre o modal de pagamento da fatura; confirma debitando a Conta 1.
  for (const nome of ['Fatura Nubank', 'Fatura Mercado Pago']) {
    await page.locator('#cashPayList .cash-pay-row', { hasText: nome }).getByRole('button', { name: '✓ Pago' }).click();
    await page.locator('#pagarFaturaConta').selectOption('c1');
    await page.getByRole('button', { name: '✓ Confirmar pagamento' }).click();
    steps.push(await view());
  }
  const paid = await page.evaluate(() => [isFaturaPaga('nu', 10, 2026), isFaturaPaga('mp', 10, 2026)]);
  const [um, dois] = steps;
  // Fatura paga sai do disponível e do a pagar juntos: a folga (900,00) não muda.
  const ok = paid.every(Boolean) && [antes, ...steps].every(reconciles) && steps.every((v) => v.result === antes.result)
    && um.rows.length === 2 && um.card === 'R$ 66,67' && um.adjust && um.adjust.cents === 1
    && dois.rows.length === 1 && dois.card === 'R$ 33,33' && dois.adjust === null;
  return { ok, detail: JSON.stringify({ paid, steps }) };
}, '"✓ Pago" em fatura: 3 → 2 faturas (66,66 + ajuste 0,01 = 66,67) → 1 fatura (33,33, sem ajuste); sempre concilia');

await check('UX1R_07_AFTER_EXPENSE_AND_CONTRIBUTION_PAYMENT', async () => {
  await loadState(mistura()); await openDash();
  const antes = await view();
  await page.locator('#cashPayList .cash-pay-row', { hasText: 'Compra pix' }).getByRole('button', { name: '✓ Pago' }).click();
  const pix = await view();
  const pixPago = await page.evaluate(() => !!state.despesas.find((d) => d.id === 'pix').pagoMeses['2026-10']);
  // Contribuição é marcada no painel Destinação; aqui só o estado de pago.
  await page.evaluate(() => { state.contribuicaoPaga = { ...(state.contribuicaoPaga || {}), '2026-10': true }; renderDashboard(); });
  const contrib = await view();
  // PIX pago sai do disponível e do a pagar: a folga não muda. Restam
  // 33,333… × 2 + 6,666… = 73,333…, que arredonda igual às linhas: sem ajuste.
  const ok = [antes, pix, contrib].every(reconciles) && pixPago
    && !pix.rows.some((r) => r.kind === 'expense') && pix.card === 'R$ 73,33' && pix.adjust === null
    && pix.availableCents < antes.availableCents && pix.result === antes.result && cents(pix.result) === pix.availableCents - pix.engineCents
    && !contrib.rows.some((r) => r.kind === 'contribution') && contrib.card === 'R$ 66,67' && contrib.adjust && contrib.adjust.cents === 1;
  return { ok, detail: JSON.stringify({ antes, pix, contrib }) };
}, 'após pagar o PIX (73,33, ajuste some) e a contribuição (66,66 + 0,01 = 66,67, ajuste volta): linhas, ajuste, total e card conciliam; folga inalterada');

await check('UX1R_08_RENDER_DOES_NOT_MUTATE', async () => {
  await loadState(mistura());
  const r = await page.evaluate(() => {
    const antes = JSON.stringify(state);
    for (const p of ['dashboard', 'analise', 'dashboard']) { currentMonth = 10; currentYear = 2026; navigate(p); }
    renderDashboard();
    return { same: JSON.stringify(state) === antes, rounding: JSON.stringify(state).includes('rounding') };
  });
  return { ok: r.same && !r.rounding, detail: JSON.stringify(r) };
}, 'ajuste é só apresentação: renderizar não altera state nem grava nada');

await check('UX1R_09_ENGINE_AND_ROWS_IDENTICAL_TO_BASE', async () => {
  let baseHtml;
  try { baseHtml = execFileSync('git', ['show', `${BASE_COMMIT}:index.html`], { cwd: REPO_ROOT, maxBuffer: 64 * 1024 * 1024 }).toString('utf8'); }
  catch (e) { return { ok: false, detail: `git show falhou: ${e.message}` }; }
  const basePage = await browser.newPage({ viewport: { width: 1440, height: 1600 } });
  await basePage.route('**/cdn.jsdelivr.net/npm/chart.js@**', (r) => r.fulfill({ path: path.join(__dirname, 'fixtures', 'chart-stub.js'), contentType: 'application/javascript' }));
  await basePage.route('**/cdnjs.cloudflare.com/**', (r) => r.abort());
  await basePage.route('**fonts.googleapis.com/**', (r) => r.abort());
  await basePage.route('**fonts.gstatic.com/**', (r) => r.abort());
  await basePage.route('**/__ux1r_base__.html', (r) => r.fulfill({ body: baseHtml, contentType: 'text/html; charset=utf-8' }));
  await basePage.clock.setFixedTime(FIXED_NOW);
  await basePage.goto(`${baseUrl}/__ux1r_base__.html`, { waitUntil: 'domcontentloaded' });
  const snap = (raw) => {
    migrateAppData(JSON.parse(JSON.stringify(raw)));
    const outlook = ['2026-10-31', '2026-10-15', '2026-12-31'].map((e) => getFinancialOutlook('2026-10-03', e));
    const personal = [[10, 2026], [11, 2026]].map(([m, a]) => getPersonalMonthProjection(m, a, { today: '2026-10-03' }));
    currentMonth = 10; currentYear = 2026; navigate('dashboard');
    // textContent normalizado: a página-base não tem o appShell visível (innerText muda só em espaços).
    const text = (el) => el.textContent.replace(/\s+/g, ' ').trim();
    const rows = [...document.querySelectorAll('#cashPayList .cash-pay-row')].map((r) => [r.dataset.kind, r.dataset.cents, text(r)]);
    return JSON.stringify({ outlook, personal, rows, card: text(document.getElementById('cashObligations')),
      result: text(document.getElementById('cashResult')), state });
  };
  const diffs = [];
  for (const [i, raw] of [tresFaturas(), ajusteNegativo(), mistura()].entries()) {
    const now = await page.evaluate(snap, raw);
    const base = await basePage.evaluate(snap, raw);
    if (now !== base) diffs.push(i);
  }
  await basePage.close();
  return { ok: diffs.length === 0, detail: `fixtures com diferença: ${JSON.stringify(diffs)}` };
}, `motor, projeção pessoal, linhas pagáveis, cards e state idênticos a ${BASE_COMMIT}; só a linha de ajuste é nova`);

await check('UX1R_10_MOBILE_390', async () => {
  await loadState(mistura());
  await page.setViewportSize({ width: 390, height: 844 });
  const r = await page.evaluate(() => {
    currentMonth = 10; currentYear = 2026; navigate('dashboard');
    const el = document.getElementById('dashProximosVencimentos');
    return { fits: el.clientWidth > 0 && el.scrollWidth <= el.clientWidth + 2, page: document.documentElement.scrollWidth <= window.innerWidth + 1,
      adjust: !!document.getElementById('cashPayAdjust') };
  });
  await page.setViewportSize({ width: 1440, height: 1600 });
  return { ok: r.fits && r.page && r.adjust, detail: JSON.stringify(r) };
}, 'em 390 px a lista com a linha de ajuste não gera rolagem lateral');

await check('UX1R_11_NO_SCRIPT_ERRORS', async () => ({ ok: consoleErrors.length === 0, detail: JSON.stringify(consoleErrors) }), 'nenhum erro de console');

} finally {
  await close();
}
const fail = results.filter((r) => r.status === 'FAIL').length;
console.log(`ux1-rounding-reconciliation: TOTAL=${results.length} PASS=${results.length - fail} FAIL=${fail}`);
process.exitCode = fail ? 1 : 0;
