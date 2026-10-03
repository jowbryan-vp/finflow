// Patch — dia de vencimento em despesas PARCELADAS em Dinheiro/PIX
// (branch fix/parcelada-dia-vencimento, base a475634 = ponta do Gate UX-1).
//
// Desde o UX-1 o card do Dashboard (#dashProximosVencimentos, "A pagar até
// DD/MM") lista os itens de getFinancialOutlook — o motor já usava
// diaVencimento das parceladas em Dinheiro/PIX para datar o evento. Este patch:
//   - mostra "Parcela x/N" na linha da parcelada (número vindo do próprio
//     getDespesasForMonth, sem fórmula nova), sem mudar valores nem datas;
//   - formulários de criar/editar despesa exibem e preservam diaVencimento
//     também para parcelada (2+ parcelas) em Dinheiro/PIX; à vista e cartão
//     continuam null; debitoAutomatico continua só para fixa.
// O motor (getFinancialOutlook / getPersonalMonthProjection) e a lista do
// card precisam continuar idênticos ao commit-base em números e datas.
//
// Fixture sintética. A "IPOG" reproduz só a FORMA do caso relatado (valor
// 6860, 14 parcelas, início 07/2026, ignorarAntes 08/2026, dia 8, pagos
// 08 e 09/2026) — nenhum dado real.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openHarness, makeRunner, REPO_ROOT } from './harness.mjs';
import { cashFixture } from './fixtures/ux1-cash-dashboard-fixture.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Ponta do Gate UX-1, imediatamente antes deste patch.
const BASE_COMMIT = 'a47563467be442116de94093dd22cdc06eb6cf99';
const TODAY = '2026-10-01';
const CYCLE_END = '2026-10-29';
const FIXED_NOW = new Date(2026, 9, 1, 12); // 01/10/2026

const { browser, page, baseUrl, loadState, close, consoleErrors } = await openHarness();
const { check, results } = makeRunner('parcelada-dia-vencimento');
// Relógio fixo ANTES do script da página rodar (REAL_TODAY_* lidos no load).
await page.clock.setFixedTime(FIXED_NOW);
await page.reload({ waitUntil: 'domcontentloaded' });

const despesa = (over) => ({
  cat: 'geral', subcat: 'Geral', cartao: 'dinheiro', conta: 'c1', parcelas: 1, dataCompra: null,
  fixa: false, diaVencimento: null, debitoAutomatico: false, ignorarAntes: null, pagoMeses: {},
  split: [], repasses: {}, ...over, createdAt: over.id,
});
const ipog = (over = {}) => despesa({
  id: 'ipog', desc: 'IPOG', valor: 6860, parcelas: 14, mesInicio: 7, anoInicio: 2026,
  ignorarAntes: { mes: 8, ano: 2026 }, diaVencimento: 8, pagoMeses: { '2026-08': true, '2026-09': true }, ...over,
});
// Fixture do UX-1 (salário, faturas, fixas Unimed/FIES/Claro, Ricardo sem
// data) trocando a IPOG fixa pela parcelada e acrescentando as variações.
const fixture = (...extra) => {
  const s = cashFixture();
  s.despesas = s.despesas.filter((d) => d.id !== 'ipog').concat(extra);
  return s;
};

const listState = () => page.evaluate(() => [...document.querySelectorAll('#cashPayList .cash-pay-row')].map((r) => ({
  date: r.querySelector('.cash-pay-date').innerText, name: r.querySelector('.item-row-name').innerText,
  meta: r.querySelector('.item-row-meta').innerText, kind: r.dataset.kind, cents: Number(r.dataset.cents),
  shown: r.querySelector('.item-row-val').innerText })));
const openDash = async (raw) => {
  await loadState(raw);
  await page.evaluate(() => { currentMonth = 10; currentYear = 2026; navigate('dashboard'); });
  return listState();
};
const rowsOf = (rows, name) => rows.filter((r) => r.name === name);
const expenseEvents = (id, end) => page.evaluate(([t, e, ref]) => {
  const p = getFinancialOutlook(t, e);
  if (p.unavailable) throw new Error(`getFinancialOutlook indisponível: ${p.reason}`);
  return p.events.concat(p.undated).filter((x) => x.kind === 'expense' && x.id.split(':')[1] === ref)
    .map((x) => ({ id: x.id, date: x.date, originalDate: x.originalDate || null, overdue: !!x.overdue, cents: Math.round(-x.amount * 100), parcela: cashObligationInstallment(x) }));
}, [TODAY, end, id]);

try {

// ── Cenário real (forma do backup) ───────────────────────────────────────
await check('PDV_01_IPOG_REAL_SCENARIO', async () => {
  const rows = await openDash(fixture(ipog()));
  const r = rowsOf(rows, 'IPOG');
  const ev = await expenseEvents('ipog', CYCLE_END);
  const ok = r.length === 1 && r[0].date === '08/10' && r[0].meta === 'Parcela 4/14 · Em 7 dias'
    && r[0].cents === 49000 && r[0].shown === 'R$ 490,00' && r[0].kind === 'expense'
    && ev.length === 1 && ev[0].date === '2026-10-08' && !ev[0].overdue && ev[0].parcela === '4/14';
  return { ok, detail: JSON.stringify({ r, ev }) };
}, 'hoje 01/10/2026: IPOG aparece uma vez, 08/10, "Parcela 4/14", R$ 490,00 (não 6.860), não vencida');

// ── Pula parcelas pagas e mostra a próxima não paga ──────────────────────
await check('PDV_02_SKIPS_PAID', async () => {
  const semIgnorar = { ignorarAntes: null, pagoMeses: { '2026-07': true, '2026-08': true, '2026-09': true } };
  const r1 = rowsOf(await openDash(fixture(ipog(semIgnorar))), 'IPOG');
  // Outubro também pago: a próxima não paga é novembro (5/14), fora do ciclo
  // até 29/10 — no card não aparece; no motor com horizonte maior, é a primeira.
  const pagoOut = { pagoMeses: { '2026-08': true, '2026-09': true, '2026-10': true } };
  const r2 = rowsOf(await openDash(fixture(ipog(pagoOut))), 'IPOG');
  const ev = await expenseEvents('ipog', '2026-12-31');
  const ok = r1.length === 1 && r1[0].meta.startsWith('Parcela 4/14') && r1[0].date === '08/10'
    && r2.length === 0 && ev[0]?.date === '2026-11-08' && ev[0]?.parcela === '5/14' && !ev[0]?.overdue
    && ev.map((e) => e.parcela).join(',') === '5/14,6/14';
  return { ok, detail: JSON.stringify({ r1, r2, ev }) };
}, 'jul–set pagos → 4/14; out também pago → nada até 29/10 e a próxima no motor é 08/11 (5/14)');

// ── ignorarAntes ─────────────────────────────────────────────────────────
await check('PDV_03_RESPECTS_IGNORAR_ANTES', async () => {
  // Julho NÃO está em pagoMeses: só ignorarAntes impede que vire vencida.
  const com = rowsOf(await openDash(fixture(ipog())), 'IPOG').map((x) => x.meta);
  const sem = rowsOf(await openDash(fixture(ipog({ ignorarAntes: null }))), 'IPOG').map((x) => x.meta);
  const ok = com.length === 1 && com[0].startsWith('Parcela 4/14')
    && sem.length === 2 && sem[0] === 'Parcela 1/14 · Vencido desde 08/07' && sem[1].startsWith('Parcela 4/14');
  return { ok, detail: JSON.stringify({ com, sem }) };
}, 'com ignorarAntes 08/2026, a parcela 1/14 (julho, não marcada) não aparece; sem ele, aparece vencida (contraprova)');

// ── Vencida e não paga ───────────────────────────────────────────────────
await check('PDV_04_OVERDUE', async () => {
  const rows = rowsOf(await openDash(fixture(ipog({ pagoMeses: { '2026-08': true } }))), 'IPOG');
  const ev = await expenseEvents('ipog', CYCLE_END);
  const ok = rows.length === 2 && rows[0].date === '01/10' && rows[0].meta === 'Parcela 3/14 · Vencido desde 08/09' && rows[0].cents === 49000
    && rows[1].date === '08/10' && rows[1].meta.startsWith('Parcela 4/14')
    && ev[0].overdue && ev[0].originalDate === '2026-09-08' && ev[0].date === TODAY;
  return { ok, detail: JSON.stringify({ rows, ev }) };
}, 'setembro não pago → "Parcela 3/14 · Vencido desde 08/09" (como as fixas vencidas), além da 4/14');

// ── Depois da última parcela ─────────────────────────────────────────────
await check('PDV_05_AFTER_LAST_INSTALLMENT', async () => {
  const curta = despesa({ id: 'curso', desc: 'Curso 3x', valor: 1500, parcelas: 3, mesInicio: 7, anoInicio: 2026, diaVencimento: 5,
    pagoMeses: { '2026-07': true, '2026-08': true, '2026-09': true } });
  const rows = rowsOf(await openDash(fixture(curta)), 'Curso 3x');
  const ev = await expenseEvents('curso', '2027-09-30');
  // IPOG inteira paga (07/2026–08/2027): nada depois da 14/14.
  const tudoPago = Object.fromEntries(Array.from({ length: 14 }, (_, i) => { const m = 6 + i; return [`${2026 + Math.floor(m / 12)}-${String(m % 12 + 1).padStart(2, '0')}`, true]; }));
  await loadState(fixture(ipog({ pagoMeses: tudoPago })));
  const evIpog = await expenseEvents('ipog', '2027-09-30'); // 14/14 = 08/2027; limite do motor = 12 meses
  const ok = rows.length === 0 && ev.length === 0 && evIpog.length === 0;
  return { ok, detail: JSON.stringify({ rows, ev, evIpog }) };
}, 'parcelamento encerrado (3/3 em set) e IPOG com as 14 pagas não geram mais nenhum vencimento');

// ── Rótulo x/N e valor por parcela ───────────────────────────────────────
await check('PDV_06_LABEL_AND_INSTALLMENT_VALUE', async () => {
  const tres = despesa({ id: 'tres', desc: 'Boleto 3x', valor: 1000, parcelas: 3, mesInicio: 9, anoInicio: 2026, diaVencimento: 15,
    pagoMeses: { '2026-09': true } });
  const rows = rowsOf(await openDash(fixture(tres)), 'Boleto 3x');
  const viaHelper = await page.evaluate(() => { const d = getDespesasForMonth(10, 2026).find((x) => x.id === 'tres'); return { p: d._parcel, t: d._total, v: Math.round(d._valorParcela * 100) }; });
  const ok = rows.length === 1 && rows[0].date === '15/10' && rows[0].meta.startsWith('Parcela 2/3 · ')
    && rows[0].cents === 33333 && rows[0].shown === 'R$ 333,33'
    && viaHelper.p === 2 && viaHelper.t === 3 && viaHelper.v === 33333;
  return { ok, detail: JSON.stringify({ rows, viaHelper }) };
}, '1000 em 3x: "Parcela 2/3", R$ 333,33 — mesmo _parcel/_total/_valorParcela de getDespesasForMonth');

// ── Parcelada sem diaVencimento ──────────────────────────────────────────
await check('PDV_07_NO_DUE_DAY_NOT_DATED', async () => {
  const sem = despesa({ id: 'semdia', desc: 'Parcelada sem dia', valor: 900, parcelas: 3, mesInicio: 9, anoInicio: 2026,
    dataCompra: '2026-09-10', pagoMeses: { '2026-09': true } });
  const rows = rowsOf(await openDash(fixture(sem)), 'Parcelada sem dia');
  const ev = await expenseEvents('semdia', CYCLE_END);
  // Comportamento do UX-1 preservado: sem dia de vencimento, a parcela de
  // outubro não ganha data inventada — entra só como "sem data" no total.
  const ok = ev.length === 1 && ev[0].date === null && rows.length === 1 && rows[0].date === 'sem data'
    && rows[0].meta === 'Parcela 2/3 · sem data definida' && rows[0].cents === 30000;
  return { ok, detail: JSON.stringify({ rows, ev }) };
}, 'sem diaVencimento: nenhuma data de vencimento inventada; segue como "sem data" (regra do UX-1, ver handoff)');

// ── Parcelada no cartão ──────────────────────────────────────────────────
await check('PDV_08_CREDIT_CARD_STAYS_IN_INVOICE', async () => {
  // diaVencimento forçado no JSON de propósito: mesmo assim não vira linha própria.
  const cartao = despesa({ id: 'tv', desc: 'TV parcelada', cartao: 'nu', conta: null, valor: 3000, parcelas: 10, mesInicio: 9, anoInicio: 2026,
    dataCompra: '2026-09-20', diaVencimento: 8 }); // fecha dia 3 → 1ª parcela na fatura de outubro
  const rows = await openDash(fixture(cartao));
  const ev = await expenseEvents('tv', CYCLE_END);
  const nu = rows.find((r) => r.name === 'Fatura NU');
  const base = await openDash(fixture());
  const nuBase = base.find((r) => r.name === 'Fatura NU');
  const ok = rowsOf(rows, 'TV parcelada').length === 0 && ev.length === 0 && nu.cents - nuBase.cents === 30000
    && !rows.some((r) => r.kind === 'expense' && /Parcela/.test(r.meta));
  return { ok, detail: JSON.stringify({ ev, nu: nu.cents, nuBase: nuBase.cents }) };
}, 'parcelada no cartão não aparece como linha própria (nem com diaVencimento no JSON) — só soma R$ 300 na Fatura NU');

// ── Fixas e números idênticos ao commit-base ─────────────────────────────
await check('PDV_09_IDENTICAL_TO_BASE', async () => {
  let baseHtml;
  try { baseHtml = execFileSync('git', ['show', `${BASE_COMMIT}:index.html`], { cwd: REPO_ROOT, maxBuffer: 64 * 1024 * 1024 }).toString('utf8'); }
  catch (e) { return { ok: false, detail: `git show falhou: ${e.message}` }; }
  const basePage = await browser.newPage({ viewport: { width: 1440, height: 1600 } });
  await basePage.route('**/cdn.jsdelivr.net/npm/chart.js@**', (r) => r.fulfill({ path: path.join(__dirname, 'fixtures', 'chart-stub.js'), contentType: 'application/javascript' }));
  await basePage.route('**/cdnjs.cloudflare.com/**', (r) => r.abort());
  await basePage.route('**fonts.googleapis.com/**', (r) => r.abort());
  await basePage.route('**fonts.gstatic.com/**', (r) => r.abort());
  await basePage.route('**/__pdv_base__.html', (r) => r.fulfill({ body: baseHtml, contentType: 'text/html; charset=utf-8' }));
  await basePage.clock.setFixedTime(FIXED_NOW);
  await basePage.goto(`${baseUrl}/__pdv_base__.html`, { waitUntil: 'domcontentloaded' });
  const fixtures = [
    cashFixture(), // fixas (IPOG fixa do UX-1, Unimed, FIES, Claro) — regressão
    fixture(ipog()),
    fixture(ipog({ ignorarAntes: null })),
    fixture(ipog({ pagoMeses: { '2026-08': true } })),
    fixture(despesa({ id: 'semdia', desc: 'Parcelada sem dia', valor: 900, parcelas: 3, mesInicio: 9, anoInicio: 2026, dataCompra: '2026-09-10' })),
    fixture(despesa({ id: 'tv', desc: 'TV', cartao: 'nu', conta: null, valor: 3000, parcelas: 10, mesInicio: 8, anoInicio: 2026, dataCompra: '2026-08-20', diaVencimento: 8 })),
  ];
  // Débito automático (fixa) também precisa seguir igual.
  const deb = cashFixture(); deb.despesas.find((d) => d.id === 'unimed').debitoAutomatico = true; fixtures.push(deb);
  const snap = (raw) => {
    migrateAppData(JSON.parse(JSON.stringify(raw)));
    document.getElementById('authScreen').style.display = 'none'; document.getElementById('appShell').style.display = 'flex';
    currentMonth = 10; currentYear = 2026; navigate('dashboard');
    const engine = [];
    for (const end of ['2026-10-29', '2026-12-31', '2027-09-30']) engine.push(getFinancialOutlook('2026-10-01', end));
    const personal = [[9, 2026], [10, 2026], [11, 2026], [8, 2027]].map(([m, a]) => getPersonalMonthProjection(m, a, { today: '2026-10-01' }));
    const rows = [...document.querySelectorAll('#cashPayList .cash-pay-row')].map((r) => ({
      date: r.querySelector('.cash-pay-date').innerText, name: r.querySelector('.item-row-name').innerText,
      meta: r.querySelector('.item-row-meta').innerText, kind: r.dataset.kind, cents: r.dataset.cents,
      shown: r.querySelector('.item-row-val').innerText, action: r.lastElementChild.outerHTML }));
    return JSON.stringify({ engine, personal, rows, total: document.getElementById('cashPayTotal').innerText,
      cards: ['cashAvailable', 'cashObligations', 'cashResult'].map((id) => document.getElementById(id).innerText), state });
  };
  const diffs = [];
  for (const [i, raw] of fixtures.entries()) {
    const now = JSON.parse(await page.evaluate(snap, raw));
    const base = JSON.parse(await basePage.evaluate(snap, raw));
    // Única diferença permitida: prefixo "Parcela x/N · " no meta de despesa
    // parcelada (não fixa) em Dinheiro/PIX.
    const strip = (m) => m.replace(/^Parcela \d+\/\d+ · /, '');
    const labelOk = now.rows.every((r, j) => r.meta === base.rows[j]?.meta || (r.kind === 'expense' && strip(r.meta) === base.rows[j]?.meta));
    const fixasOk = now.rows.filter((r) => ['Unimed', 'FIES', 'Claro'].includes(r.name) || (i === 0 && r.name === 'IPOG')).every((r) => !/Parcela/.test(r.meta));
    now.rows.forEach((r) => { r.meta = strip(r.meta); });
    if (JSON.stringify(now) !== JSON.stringify(base) || !labelOk || !fixasOk) diffs.push(i);
  }
  await basePage.close();
  return { ok: diffs.length === 0, detail: `fixtures com diferença: ${JSON.stringify(diffs)}` };
}, `motor, projeção pessoal, cards, linhas (data/valor/ação), total e state idênticos a ${BASE_COMMIT.slice(0, 7)}; só o prefixo "Parcela x/N" é novo; fixas sem rótulo`);

// ── Formulário de criação ────────────────────────────────────────────────
await check('PDV_10_CREATE_FORM', async () => {
  await loadState(fixture());
  const r = await page.evaluate(() => {
    currentMonth = 10; currentYear = 2026; navigate('despesas');
    const $ = (id) => document.getElementById(id);
    const visivel = () => $('despVencimentoGroup').style.display !== 'none';
    const preencher = (desc, valor, parcelas, dia, fixa = false) => {
      $('despDesc').value = desc; $('despValor').value = String(valor); $('despCartao').value = 'dinheiro';
      onCartaoChange(); $('despConta').value = 'c1'; $('despDataCompra').value = '2026-10-01';
      $('despFixa').checked = fixa; onDespFixaChange();
      if (!fixa) { $('despParcelas').value = String(parcelas); calcParcel(); }
      $('despDiaVencimento').value = dia == null ? '' : String(dia);
    };
    const out = {};
    preencher('Pos 14x', 6860, 1, 8); out.aVistaVisivel = visivel();
    $('despParcelas').value = '14'; calcParcel(); out.parceladaVisivel = visivel();
    $('despDebitoAutomatico').checked = true; // tentado, mas não vale pra parcelada
    out.debitoVisivel = $('despDebitoAutoGroup').style.display !== 'none';
    addDespesa();
    const p = state.despesas.find((d) => d.desc === 'Pos 14x');
    out.parcelada = { dia: p?.diaVencimento, parcelas: p?.parcelas, debito: p?.debitoAutomatico, fixa: p?.fixa };
    out.posResetVisivel = visivel();
    preencher('Avista', 100, 1, 9); addDespesa();
    out.aVista = state.despesas.find((d) => d.desc === 'Avista')?.diaVencimento;
    preencher('Aluguel', 1200, 1, 5, true); $('despDebitoAutomatico').checked = true; out.fixaVisivel = visivel(); addDespesa();
    const f = state.despesas.find((d) => d.desc === 'Aluguel'); out.fixa = { dia: f?.diaVencimento, debito: f?.debitoAutomatico };
    return out;
  });
  const ok = !r.aVistaVisivel && r.parceladaVisivel && !r.debitoVisivel && r.parcelada.dia === 8 && r.parcelada.parcelas === 14
    && r.parcelada.debito === false && r.parcelada.fixa === false && !r.posResetVisivel && r.aVista === null
    && r.fixaVisivel && r.fixa.dia === 5 && r.fixa.debito === true;
  return { ok, detail: JSON.stringify(r) };
}, 'criar: campo aparece com 2+ parcelas em Dinheiro/PIX e salva o dia; à vista → null; débito automático só na fixa; fixa inalterada');

// ── Formulário de edição ─────────────────────────────────────────────────
await check('PDV_11_EDIT_FORM', async () => {
  await loadState(fixture(ipog()));
  const r = await page.evaluate(() => {
    const $ = (id) => document.getElementById(id);
    const get = () => JSON.parse(JSON.stringify(state.despesas.find((d) => d.id === 'ipog')));
    const out = {};
    const antes = get();
    openEditDespesa('ipog');
    out.visivel = $('eDespVencimentoGroup').style.display !== 'none'; out.valorCampo = $('eDespDiaVencimento').value;
    out.debitoVisivel = $('eDespDebitoAutoGroup').style.display !== 'none';
    saveEditDespesa('ipog');
    const depois = get();
    out.semMudanca = JSON.stringify(antes) === JSON.stringify(depois);
    // Muda o dia → salva o novo valor.
    openEditDespesa('ipog'); $('eDespDiaVencimento').value = '12'; saveEditDespesa('ipog'); out.novoDia = get().diaVencimento;
    // Parcelas → 1 (à vista em dinheiro): campo some e o dia vira null.
    openEditDespesa('ipog'); $('eDespParcelas').value = '1'; eOnParcelasChange();
    out.visivelAVista = $('eDespVencimentoGroup').style.display !== 'none';
    $('eDespParcelas').value = '14'; eOnParcelasChange(); out.visivelDeNovo = $('eDespVencimentoGroup').style.display !== 'none';
    $('eDespParcelas').value = '1'; saveEditDespesa('ipog'); out.aVista = get().diaVencimento;
    // Volta a 14x com dia 8, depois troca pro cartão: null.
    openEditDespesa('ipog'); $('eDespParcelas').value = '14'; eOnParcelasChange(); $('eDespDiaVencimento').value = '8'; saveEditDespesa('ipog');
    out.restaurado = get().diaVencimento;
    openEditDespesa('ipog'); $('eDespCartao').value = 'nu'; eOnCartaoChange();
    out.visivelCartao = $('eDespVencimentoGroup').style.display !== 'none';
    window._eDespDataCompraConfirmado = true; saveEditDespesa('ipog');
    out.cartao = { dia: get().diaVencimento, cartao: get().cartao };
    return out;
  });
  const ok = r.visivel && r.valorCampo === '8' && !r.debitoVisivel && r.semMudanca && r.novoDia === 12
    && !r.visivelAVista && r.visivelDeNovo && r.aVista === null && r.restaurado === 8
    && !r.visivelCartao && r.cartao.dia === null && r.cartao.cartao === 'nu';
  return { ok, detail: JSON.stringify(r) };
}, 'editar: IPOG abre com dia 8 visível e salvar sem mudanças não altera nada; 1 parcela ou cartão → null');

// ── Fixa: formulário de edição inalterado ────────────────────────────────
await check('PDV_12_FIXED_EDIT_UNCHANGED', async () => {
  await loadState(cashFixture());
  const r = await page.evaluate(() => {
    const d = state.despesas.find((x) => x.id === 'unimed'); d.debitoAutomatico = true; d.ignorarAntes = null; // save já normaliza undefined → null (comportamento anterior)
    const antes = JSON.stringify(d);
    openEditDespesa('unimed');
    const vis = document.getElementById('eDespVencimentoGroup').style.display !== 'none' && document.getElementById('eDespDebitoAutoGroup').style.display !== 'none';
    saveEditDespesa('unimed');
    return { vis, igual: antes === JSON.stringify(state.despesas.find((x) => x.id === 'unimed')) };
  });
  return { ok: r.vis && r.igual, detail: JSON.stringify(r) };
}, 'fixa com débito automático: campos visíveis e salvar sem mudanças preserva dia e débito');

await check('PDV_13_RENDER_NO_MUTATION_NO_ERRORS', async () => {
  await loadState(fixture(ipog()));
  const igual = await page.evaluate(() => {
    const antes = JSON.stringify(state);
    currentMonth = 10; currentYear = 2026; navigate('dashboard'); renderDashboard(); navigate('despesas'); navigate('dashboard');
    return JSON.stringify(state) === antes;
  });
  return { ok: igual && consoleErrors.length === 0, detail: JSON.stringify({ igual, consoleErrors }) };
}, 'renderizar o card com parcelada não muda o state; nenhum erro de console na suíte');

} finally {
  await close();
}
const fail = results.filter((r) => r.status === 'FAIL').length;
console.log(`parcelada-dia-vencimento: TOTAL=${results.length} PASS=${results.length - fail} FAIL=${fail}`);
process.exitCode = fail ? 1 : 0;
