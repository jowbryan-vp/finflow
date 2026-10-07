// Gate — data de vencimento de cartão que paga no mês SEGUINTE ao fechamento
// (branch fix/card-due-date-next-month, base d19efc0).
//
// Regra única (getDataVencimentoFatura): se card.paga <= card.fecha, a fatura
// de uma competência vence no mês seguinte; senão, no mesmo mês. Vale para a
// projeção cronológica / "A pagar" do Dashboard, para a data exibida nas
// telas de fatura e para o mês em que a fatura PAGA debita a conta no saldo
// por data (calcSaldoContaAte).
//
// O que NÃO pode mudar: a competência da compra (getCompetenciaFatura), o
// total da fatura (calcByCardForMonth) e as chaves de faturasPagas /
// faturasContas / faturasAjustes — nenhum backup precisa de migração.
//
// Fixture sintética: "amz" reproduz só a FORMA do caso relatado (fecha 17,
// paga 1, fatura de 316,11 paga por outra conta) — nenhum dado real.
import { openHarness, makeRunner, baseSyntheticState } from './harness.mjs';

const FIXED_NOW = new Date(2026, 8, 20, 12); // 20/09/2026
const TODAY = '2026-09-20';

const { page, loadState, close, consoleErrors } = await openHarness();
const { check, results } = makeRunner('card-due-date-next-month');
// Relógio fixo ANTES do script da página rodar (REAL_TODAY_* lidos no load).
await page.clock.setFixedTime(FIXED_NOW);
await page.reload({ waitUntil: 'domcontentloaded' });

const CARDS = [
  { id: 'dinheiro', name: 'Dinheiro/PIX', color: '#38e2b4', fecha: null, paga: null },
  { id: 'amz', name: 'Amazon', color: '#ff9900', fecha: 17, paga: 1 },   // paga < fecha  → mês seguinte
  { id: 'nu', name: 'Nubank', color: '#820ad1', fecha: 3, paga: 10 },    // paga > fecha  → mesmo mês
  { id: 'mp', name: 'MP', color: '#00b1ea', fecha: 2, paga: 7 },         // paga > fecha  → mesmo mês
  { id: 'igual', name: 'Igual', color: '#888888', fecha: 10, paga: 10 }, // paga == fecha → mês seguinte
  { id: 'fim', name: 'Fim do mês', color: '#444444', fecha: 31, paga: 31 }, // dia 31 em mês curto
  { id: 'semfecha', name: 'Sem fechamento', color: '#ff8800', fecha: null, paga: 5 },
  { id: 'sempaga', name: 'Sem pagamento', color: '#aa0000', fecha: 10, paga: null },
];
const compra = (id, cartao, valor, dataCompra) => {
  const [y, m] = dataCompra.split('-').map(Number);
  return { id, desc: id, cat: 'geral', subcat: 'Geral', cartao, conta: null, valor, parcelas: 1,
    mesInicio: m, anoInicio: y, dataCompra, fixa: false, diaVencimento: null, debitoAutomatico: false,
    ignorarAntes: null, pagoMeses: {}, split: [], repasses: {}, createdAt: id };
};
// amz: compra 05/09 (< dia 17) → competência set/2026; compra 05/12 → dez/2026.
// nu: compra 01/09 (< dia 3) → competência set/2026.
const fixture = (extra = {}) => baseSyntheticState({
  cards: CARDS,
  contas: [
    { id: 'c1', name: 'Conta 1', color: '#5b7fff', saldoInicial: 1000 },
    { id: 'c2', name: 'Conta 2', color: '#33aa55', saldoInicial: 500 },
  ],
  despesas: [
    compra('amz-set', 'amz', 316.11, '2026-09-05'),
    compra('amz-dez', 'amz', 200, '2026-12-05'),
    compra('nu-set', 'nu', 100, '2026-09-01'),
  ],
  faturasContas: {},
  ...extra,
});
const venc = (id, ano, mes) => page.evaluate(([i, a, m]) =>
  getDataVencimentoFatura(state.cards.find((c) => c.id === i), a, m), [id, ano, mes]);
const invoiceEvents = (end) => page.evaluate(([t, e]) => {
  const p = getChronologicalProjection(t, e);
  if (p.unavailable) throw new Error(`projeção indisponível: ${p.reason}`);
  const pick = (x) => ({ id: x.id, date: x.date, originalDate: x.originalDate || null, overdue: !!x.overdue, cents: Math.round(-x.amount * 100) });
  return { events: p.events.filter((x) => x.kind === 'invoice').map(pick), undated: p.undated.filter((x) => x.kind === 'invoice').map(pick) };
}, [TODAY, end]);
const near = (a, b) => Math.abs(a - b) < 0.005;

try {

await loadState(fixture());

// ── Helper puro ──────────────────────────────────────────────────────────
await check('CDD_01_PAGA_MENOR_QUE_FECHA_MES_SEGUINTE', async () => {
  const r = { set: await venc('amz', 2026, 9), mai: await venc('amz', 2026, 5), jun: await venc('amz', 2026, 6) };
  return { ok: r.set === '2026-10-01' && r.mai === '2026-06-01' && r.jun === '2026-07-01', detail: JSON.stringify(r) };
}, 'fecha 17 / paga 1: fatura de set/2026 vence 01/10/2026 (mai → 01/06, jun → 01/07)');

await check('CDD_02_PAGA_MAIOR_QUE_FECHA_MESMO_MES', async () => {
  const r = { nu: await venc('nu', 2026, 10), mp: await venc('mp', 2026, 10), nuDez: await venc('nu', 2026, 12) };
  return { ok: r.nu === '2026-10-10' && r.mp === '2026-10-07' && r.nuDez === '2026-12-10', detail: JSON.stringify(r) };
}, 'fecha 3 / paga 10 e fecha 2 / paga 7: vencimento no mesmo mês da competência');

await check('CDD_03_VIRADA_DE_ANO', async () => {
  const r = { amz: await venc('amz', 2026, 12), igual: await venc('igual', 2026, 12), nu: await venc('nu', 2026, 12) };
  return { ok: r.amz === '2027-01-01' && r.igual === '2027-01-10' && r.nu === '2026-12-10', detail: JSON.stringify(r) };
}, 'competência dez/2026 com paga<=fecha vence em jan/2027; com paga>fecha continua em dez/2026');

await check('CDD_04_PAGA_IGUAL_A_FECHA_MES_SEGUINTE', async () => {
  const r = await venc('igual', 2026, 9);
  return { ok: r === '2026-10-10', detail: String(r) };
}, 'fecha 10 / paga 10 (paga <= fecha): fatura de set vence 10/10');

await check('CDD_05_DIA_31_EM_MES_CURTO', async () => {
  const r = { jan: await venc('fim', 2027, 1), mar: await venc('fim', 2027, 3) };
  return { ok: r.jan === '2027-02-28' && r.mar === '2027-04-30', detail: JSON.stringify(r) };
}, 'dia 31 é limitado ao último dia do mês do vencimento (28/02 e 30/04)');

await check('CDD_06_SEM_FECHAMENTO_OU_SEM_PAGAMENTO', async () => {
  const r = { semfecha: await venc('semfecha', 2026, 9), sempaga: await venc('sempaga', 2026, 9),
    semCartao: await page.evaluate(() => getDataVencimentoFatura(undefined, 2026, 9)),
    debitoSemPaga: await page.evaluate(() => getMesDebitoFatura('sempaga', 2026, 9)),
    debitoSemCartao: await page.evaluate(() => getMesDebitoFatura('nao_existe', 2026, 9)) };
  const ok = r.semfecha === '2026-09-05' && r.sempaga === null && r.semCartao === null
    && r.debitoSemPaga === '2026-09' && r.debitoSemCartao === '2026-09';
  return { ok, detail: JSON.stringify(r) };
}, 'sem fechamento: mesmo mês (como sempre); sem dia de pagamento ou sem cartão: sem data, débito na competência');

// ── Competência, totais e chaves intactos ────────────────────────────────
await check('CDD_07_COMPETENCIA_E_TOTAIS_INALTERADOS', async () => {
  const r = await page.evaluate(() => {
    const amz = state.cards.find((c) => c.id === 'amz');
    return { antes: getCompetenciaFatura('2026-09-16', amz, 9, 2026), noDia: getCompetenciaFatura('2026-09-17', amz, 9, 2026),
      set: calcByCardForMonth(9, 2026).amz, out: calcByCardForMonth(10, 2026).amz, dez: calcByCardForMonth(12, 2026).amz,
      key: faturaKey('amz', 9, 2026) };
  });
  const ok = r.antes.mes === 9 && r.antes.ano === 2026 && r.noDia.mes === 10 && r.noDia.ano === 2026
    && near(r.set, 316.11) && r.out === 0 && near(r.dez, 200) && r.key === 'amz_2026-09';
  return { ok, detail: JSON.stringify(r) };
}, 'competência da compra, total da fatura por competência e faturaKey continuam os mesmos');

// ── Projeção cronológica / "A pagar" ─────────────────────────────────────
await check('CDD_08_PROJECAO_DATA_NO_MES_SEGUINTE', async () => {
  const r = await invoiceEvents('2026-10-31');
  const amz = r.events.find((x) => x.id === 'invoice:amz:2026-09'), nu = r.events.find((x) => x.id === 'invoice:nu:2026-09');
  const ok = amz && amz.date === '2026-10-01' && !amz.overdue && amz.cents === 31611
    && nu && nu.originalDate === '2026-09-10' && nu.overdue && r.undated.length === 0;
  return { ok, detail: JSON.stringify(r) };
}, 'fatura Amazon de set/2026 entra em 01/10/2026 (não vencida em 20/09); Nubank de set continua em 10/09');

await check('CDD_09_PROJECAO_FORA_DO_PERIODO_ATE_O_VENCIMENTO', async () => {
  const r = await invoiceEvents('2026-09-30');
  const ids = r.events.concat(r.undated).map((x) => x.id);
  return { ok: !ids.includes('invoice:amz:2026-09') && ids.includes('invoice:nu:2026-09'), detail: JSON.stringify(ids) };
}, 'período até 30/09: a fatura Amazon de set (vence 01/10) não é cobrada como vencida nem entra no período');

await check('CDD_10_PROJECAO_VIRADA_DE_ANO', async () => {
  const r = await invoiceEvents('2027-01-31');
  const dez = r.events.find((x) => x.id === 'invoice:amz:2026-12');
  return { ok: !!dez && dez.date === '2027-01-01' && dez.cents === 20000, detail: JSON.stringify(dez || null) };
}, 'fatura Amazon de dez/2026 é projetada em 01/01/2027');

await check('CDD_11_DASHBOARD_A_PAGAR', async () => {
  await page.evaluate(() => { currentMonth = 9; currentYear = 2026; navigate('dashboard'); });
  const r = await page.evaluate(() => {
    const v = getCashOutlookView();
    const rows = [...document.querySelectorAll('#cashPayList .cash-pay-row')].map((x) => ({
      date: x.querySelector('.cash-pay-date').innerText, name: x.querySelector('.item-row-name').innerText,
      meta: x.querySelector('.item-row-meta').innerText }));
    const bill = [...document.querySelectorAll('#billCards .bill-card')].map((x) => x.innerText.replace(/\s+/g, ' '));
    return { end: v.end, rows, bill };
  });
  const amz = r.rows.find((x) => x.name === 'Fatura Amazon');
  // Só exige a linha quando o fim do ciclo alcança 01/10; nunca pode aparecer vencida ou em 01/09.
  const linhaOk = r.end >= '2026-10-01' ? (!!amz && amz.date === '01/10' && !/Vencido/.test(amz.meta)) : !amz;
  const billOk = r.bill.some((t) => /amazon/i.test(t) && t.includes('Fecha 17 · Vence 01/10/2026'))
    && r.bill.some((t) => /nubank/i.test(t) && t.includes('Fecha 3 · Vence 10/09/2026'));
  return { ok: linhaOk && billOk, detail: JSON.stringify(r) };
}, 'Dashboard: "A pagar" data a fatura Amazon em 01/10 (nunca vencida em 01/09) e o card mostra o vencimento real');

// ── Tela Cartões/Faturas ─────────────────────────────────────────────────
await check('CDD_12_TELA_FATURA_VENCIMENTO', async () => {
  const r = await page.evaluate(() => {
    const ver = (id, m, a) => { currentMonth = m; currentYear = a; window._faturaCartaoSelecionado = id; navigate('cartoes'); renderCartoes();
      return document.getElementById('cartaoFaturaVencimento')?.innerText; };
    return { amzSet: ver('amz', 9, 2026), amzDez: ver('amz', 12, 2026), nuSet: ver('nu', 9, 2026), semPaga: ver('sempaga', 9, 2026) };
  });
  const ok = r.amzSet === '01/10/2026' && r.amzDez === '01/01/2027' && r.nuSet === '10/09/2026' && r.semPaga === '—';
  return { ok, detail: JSON.stringify(r) };
}, 'fatura Amazon de set/2026 aparece com vencimento 01/10/2026; dez → 01/01/2027; Nubank set → 10/09/2026');

// ── Saldo por data: fatura paga debita no mês do vencimento ──────────────
const pagas = { faturasPagas: { 'amz_2026-09': true, 'amz_2026-12': true, 'nu_2026-09': true },
  faturasContas: { 'amz_2026-09': 'c1', 'amz_2026-12': 'c1', 'nu_2026-09': 'c2' } };
const saldos = () => page.evaluate(() => {
  const at = (c, m, a) => Math.round(calcSaldoContaAte(c, m, a) * 100);
  return { c1: { ago: at('c1', 8, 2026), set: at('c1', 9, 2026), out: at('c1', 10, 2026), nov: at('c1', 11, 2026), dez: at('c1', 12, 2026), jan: at('c1', 1, 2027) },
    c2: { ago: at('c2', 8, 2026), set: at('c2', 9, 2026), out: at('c2', 10, 2026) },
    total: { c1: Math.round(calcSaldoConta('c1') * 100), c2: Math.round(calcSaldoConta('c2') * 100) } };
});

await check('CDD_13_SALDO_DEBITA_NO_MES_DO_VENCIMENTO', async () => {
  await loadState(fixture(pagas));
  const r = await saldos();
  const ok = r.c1.ago === 100000 && r.c1.set === 100000 && r.c1.out === 68389 && r.c1.nov === 68389;
  return { ok, detail: JSON.stringify(r.c1) };
}, 'fatura Amazon de set paga pela conta: saldo ao fim de set ainda sem o débito; ao fim de out com −316,11');

await check('CDD_14_SALDO_VIRADA_DE_ANO', async () => {
  const r = await saldos();
  return { ok: r.c1.dez === 68389 && r.c1.jan === 48389, detail: JSON.stringify(r.c1) };
}, 'fatura Amazon de dez/2026 paga: fora do saldo ao fim de dez/2026, dentro ao fim de jan/2027');

await check('CDD_15_SALDO_CARTAO_MESMO_MES_INALTERADO', async () => {
  const r = await saldos();
  return { ok: r.c2.ago === 50000 && r.c2.set === 40000 && r.c2.out === 40000, detail: JSON.stringify(r.c2) };
}, 'fatura Nubank de set (paga > fecha) continua debitando a conta em set');

await check('CDD_16_SALDO_ATUAL_INALTERADO', async () => {
  const r = await saldos();
  return { ok: r.total.c1 === 48389 && r.total.c2 === 40000 && r.c1.jan === r.total.c1, detail: JSON.stringify(r.total) };
}, 'calcSaldoConta (sem corte) não muda e coincide com o saldo por data depois do último vencimento');

await check('CDD_17_FATURA_PAGA_SAI_DA_PROJECAO', async () => {
  const r = await invoiceEvents('2027-01-31');
  const ids = r.events.concat(r.undated).map((x) => x.id);
  return { ok: !ids.some((i) => i === 'invoice:amz:2026-09' || i === 'invoice:amz:2026-12' || i === 'invoice:nu:2026-09'), detail: JSON.stringify(ids) };
}, 'fatura paga continua identificada pela chave de competência e sai da projeção');

await check('CDD_18_CARTAO_REMOVIDO_OU_SEM_PAGAMENTO', async () => {
  await loadState(fixture({
    despesas: [compra('sp-set', 'sempaga', 50, '2026-09-05')],
    faturasPagas: { 'sempaga_2026-09': true }, faturasContas: { 'sempaga_2026-09': 'c1' } }));
  const r = await page.evaluate(() => ({ ago: calcSaldoContaAte('c1', 8, 2026), set: calcSaldoContaAte('c1', 9, 2026) }));
  return { ok: r.ago === 1000 && r.set === 950, detail: JSON.stringify(r) };
}, 'cartão sem dia de pagamento: fatura paga continua debitando no mês da competência');

await check('CDD_19_SEM_MUTACAO_SEM_ERROS', async () => {
  await loadState(fixture(pagas));
  const igual = await page.evaluate(() => {
    const antes = JSON.stringify(state);
    currentMonth = 9; currentYear = 2026; navigate('dashboard'); navigate('cartoes'); navigate('relatorio');
    getChronologicalProjection('2026-09-20', '2027-01-31'); calcSaldoContaAte('c1', 9, 2026);
    return JSON.stringify(state) === antes;
  });
  return { ok: igual && consoleErrors.length === 0, detail: JSON.stringify({ igual, consoleErrors }) };
}, 'renderizar e calcular não muda o state (nenhuma migração); nenhum erro de console na suíte');

} finally {
  await close();
}
const fail = results.filter((r) => r.status === 'FAIL').length;
console.log(`card-due-date-next-month: TOTAL=${results.length} PASS=${results.length - fail} FAIL=${fail}`);
process.exitCode = fail ? 1 : 0;
