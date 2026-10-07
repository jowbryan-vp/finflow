// Gate — data real de pagamento da fatura (branch fix/card-due-date-next-month,
// ajuste sobre ab642e1 após o aceite contra o extrato).
//
// Debitar a fatura paga sempre no vencimento errava o saldo histórico de quem
// paga ANTES do vencimento (logo após o fechamento). Agora:
//   - state.faturasPagasData {"<cardId>_<AAAA-MM>": "AAAA-MM-DD"} guarda a data
//     real do pagamento, com a MESMA chave de faturasPagas; ausente = {} (backup
//     antigo continua válido, sem migração de conteúdo);
//   - o saldo por data (calcSaldoContaAte, via getMesDebitoFatura) debita no
//     mês da data real quando ela existe; senão, no mês do vencimento
//     (getDataVencimentoFatura) — sempre uma única vez;
//   - marcar como paga (Cartões/Faturas e Dashboard) pede a data, padrão hoje;
//     dá para editar depois; desmarcar remove a data;
//   - "Vence dd/mm" continua vindo só de getDataVencimentoFatura.
//
// Fixture sintética: "amz" fecha 17 / paga 1 (vence no mês seguinte), "nu"
// fecha 3 / paga 10 (vence no mesmo mês). Nenhum dado real.
import { openHarness, makeRunner, baseSyntheticState } from './harness.mjs';

const FIXED_NOW = new Date(2027, 1, 10, 12); // 10/02/2027
const TODAY = '2027-02-10';

const { page, loadState, close, consoleErrors } = await openHarness();
const { check, results } = makeRunner('card-invoice-payment-date');
// Relógio fixo ANTES do script da página rodar (REAL_TODAY_* lidos no load).
await page.clock.setFixedTime(FIXED_NOW);
await page.reload({ waitUntil: 'domcontentloaded' });

const CARDS = [
  { id: 'dinheiro', name: 'Dinheiro/PIX', color: '#38e2b4', fecha: null, paga: null },
  { id: 'amz', name: 'Amazon', color: '#ff9900', fecha: 17, paga: 1 },
  { id: 'nu', name: 'Nubank', color: '#820ad1', fecha: 3, paga: 10 },
];
const compra = (id, cartao, valor, dataCompra) => {
  const [y, m] = dataCompra.split('-').map(Number);
  return { id, desc: id, cat: 'geral', subcat: 'Geral', cartao, conta: null, valor, parcelas: 1,
    mesInicio: m, anoInicio: y, dataCompra, fixa: false, diaVencimento: null, debitoAutomatico: false,
    ignorarAntes: null, pagoMeses: {}, split: [], repasses: {}, createdAt: id };
};
// amz: competências set/2026 (316,11; vence 01/10) e dez/2026 (200; vence 01/01/2027).
// nu: competência set/2026 (100; vence 10/09).
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
  ...extra,
});
// Só a fatura amz de set/2026 paga pela c1, com a data informada (ou sem data).
const amzSetPaga = (data) => ({ faturasPagas: { 'amz_2026-09': true }, faturasContas: { 'amz_2026-09': 'c1' },
  ...(data === undefined ? {} : { faturasPagasData: { 'amz_2026-09': data } }) });
const MESES = [[8, 2026], [9, 2026], [10, 2026], [11, 2026], [12, 2026], [1, 2027], [2, 2027], [3, 2027]];
const saldos = (conta = 'c1') => page.evaluate(([c, meses]) => {
  const out = {};
  for (const [m, a] of meses) out[mesKey(m, a)] = Math.round(calcSaldoContaAte(c, m, a) * 100);
  out.atual = Math.round(calcSaldoConta(c) * 100);
  return out;
}, [conta, MESES]);
const cheio = 100000, semSet = 68389; // 1000,00 e 1000,00 − 316,11

try {

// ── Migração e fallback ──────────────────────────────────────────────────
await check('FPD_01_MIGRACAO_AUSENTE_VIRA_MAPA_VAZIO', async () => {
  await loadState(fixture(amzSetPaga(undefined)));
  const r = await page.evaluate(() => ({ mapa: JSON.stringify(state.faturasPagasData), pagas: JSON.stringify(state.faturasPagas),
    contas: JSON.stringify(state.faturasContas), data: getDataPagamentoFatura('amz', 2026, 9) }));
  const ok = r.mapa === '{}' && r.pagas === '{"amz_2026-09":true}' && r.contas === '{"amz_2026-09":"c1"}' && r.data === null;
  return { ok, detail: JSON.stringify(r) };
}, 'backup sem faturasPagasData carrega com mapa vazio; faturasPagas/faturasContas intactos');

await check('FPD_02_SEM_DATA_FALLBACK_NO_VENCIMENTO', async () => {
  const r = await saldos();
  const ok = r['2026-09'] === cheio && r['2026-10'] === semSet && r.atual === semSet;
  return { ok, detail: JSON.stringify(r) };
}, 'sem data de pagamento: débito no mês do vencimento (01/10), como antes deste ajuste');

// ── Data real: antecipado, no vencimento, atrasado ───────────────────────
await check('FPD_03_PAGAMENTO_ANTECIPADO_MESMO_MES_DO_FECHAMENTO', async () => {
  await loadState(fixture(amzSetPaga('2026-09-30')));
  const r = await saldos();
  const ok = r['2026-08'] === cheio && r['2026-09'] === semSet && r['2026-10'] === semSet && r.atual === semSet;
  return { ok, detail: JSON.stringify(r) };
}, 'fatura de set (fecha 17/09, vence 01/10) paga em 30/09: debita em set, e não de novo em out');

await check('FPD_04_PAGAMENTO_NO_VENCIMENTO', async () => {
  await loadState(fixture(amzSetPaga('2026-10-01')));
  const r = await saldos();
  return { ok: r['2026-09'] === cheio && r['2026-10'] === semSet && r['2026-11'] === semSet, detail: JSON.stringify(r) };
}, 'paga em 01/10 (no vencimento): debita em out');

await check('FPD_05_PAGAMENTO_ATRASADO', async () => {
  await loadState(fixture(amzSetPaga('2026-11-05')));
  const r = await saldos();
  const ok = r['2026-09'] === cheio && r['2026-10'] === cheio && r['2026-11'] === semSet && r['2026-12'] === semSet && r.atual === semSet;
  return { ok, detail: JSON.stringify(r) };
}, 'paga em 05/11 (atrasada): fora do saldo de out, dentro a partir de nov');

await check('FPD_06_CARTAO_QUE_VENCE_NO_MESMO_MES', async () => {
  await loadState(fixture({ faturasPagas: { 'nu_2026-09': true }, faturasContas: { 'nu_2026-09': 'c2' }, faturasPagasData: { 'nu_2026-09': '2026-10-02' } }));
  const comData = await saldos('c2');
  await loadState(fixture({ faturasPagas: { 'nu_2026-09': true }, faturasContas: { 'nu_2026-09': 'c2' } }));
  const semData = await saldos('c2');
  const ok = comData['2026-09'] === 50000 && comData['2026-10'] === 40000 && semData['2026-09'] === 40000 && semData['2026-10'] === 40000;
  return { ok, detail: JSON.stringify({ comData, semData }) };
}, 'Nubank (vence 10/09): paga em 02/10 debita em out; sem data continua debitando em set');

// ── Virada de ano ────────────────────────────────────────────────────────
const amzDez = (data) => ({ faturasPagas: { 'amz_2026-12': true }, faturasContas: { 'amz_2026-12': 'c1' },
  ...(data === undefined ? {} : { faturasPagasData: { 'amz_2026-12': data } }) });
await check('FPD_07_VIRADA_DE_ANO', async () => {
  const out = {};
  for (const [nome, data] of [['antecipado', '2026-12-20'], ['vencimento', '2027-01-01'], ['atrasado', '2027-02-03'], ['semData', undefined]]) {
    await loadState(fixture(amzDez(data)));
    out[nome] = await saldos();
  }
  const v = (n, k) => out[n][k];
  const ok = v('antecipado', '2026-11') === cheio && v('antecipado', '2026-12') === 80000 && v('antecipado', '2027-01') === 80000
    && v('vencimento', '2026-12') === cheio && v('vencimento', '2027-01') === 80000
    && v('atrasado', '2027-01') === cheio && v('atrasado', '2027-02') === 80000
    && v('semData', '2026-12') === cheio && v('semData', '2027-01') === 80000;
  return { ok, detail: JSON.stringify(out) };
}, 'fatura de dez/2026 (vence 01/01/2027): paga em 20/12 debita em dez/2026; em 01/01 ou sem data, jan/2027; em 03/02, fev/2027');

// ── Débito único ─────────────────────────────────────────────────────────
await check('FPD_08_DEBITO_UNICO', async () => {
  await loadState(fixture({
    faturasPagas: { 'amz_2026-09': true, 'amz_2026-12': true, 'nu_2026-09': true },
    faturasContas: { 'amz_2026-09': 'c1', 'amz_2026-12': 'c1', 'nu_2026-09': 'c1' },
    faturasPagasData: { 'amz_2026-09': '2026-09-30', 'amz_2026-12': '2027-02-03' } })); // nu sem data → vencimento 10/09
  const r = await saldos();
  const serie = MESES.map(([m, a]) => r[`${a}-${String(m).padStart(2, '0')}`]);
  const quedas = serie.slice(1).map((v, i) => serie[i] - v);
  // set: 316,11 + 100,00; fev/2027: 200,00; nenhum outro mês.
  const ok = JSON.stringify(quedas) === JSON.stringify([41611, 0, 0, 0, 0, 20000, 0]) && r['2027-03'] === r.atual && r.atual === 38389;
  return { ok, detail: JSON.stringify({ serie, quedas, atual: r.atual }) };
}, 'cada fatura paga debita exatamente uma vez; saldo por data depois do último pagamento = saldo atual');

await check('FPD_09_DATA_INVALIDA_OU_FATURA_NAO_PAGA_E_IGNORADA', async () => {
  await loadState(fixture({ ...amzSetPaga('30/09/2026'), }));
  const invalida = { data: await page.evaluate(() => getDataPagamentoFatura('amz', 2026, 9)), s: await saldos() };
  await loadState(fixture({ faturasPagas: { 'amz_2026-09': false }, faturasContas: {}, faturasPagasData: { 'amz_2026-09': '2026-09-30' } }));
  const naoPaga = { data: await page.evaluate(() => getDataPagamentoFatura('amz', 2026, 9)), s: await saldos() };
  const ok = invalida.data === null && invalida.s['2026-09'] === cheio && invalida.s['2026-10'] === semSet
    && naoPaga.data === null && naoPaga.s['2026-10'] === cheio && naoPaga.s.atual === cheio;
  return { ok, detail: JSON.stringify({ invalida, naoPaga }) };
}, 'data gravada inválida cai no fallback do vencimento; data órfã de fatura não paga não debita nada');

// ── Exibição do vencimento não muda ──────────────────────────────────────
await check('FPD_10_VENCIMENTO_EXIBIDO_INDEPENDE_DO_PAGAMENTO', async () => {
  await loadState(fixture(amzSetPaga('2026-09-30')));
  const r = await page.evaluate(() => {
    currentMonth = 9; currentYear = 2026; window._faturaCartaoSelecionado = 'amz'; navigate('cartoes'); renderCartoes();
    const tela = { venc: document.getElementById('cartaoFaturaVencimento').innerText, pago: document.getElementById('cartaoFaturaPagamento')?.innerText };
    navigate('dashboard');
    const bill = [...document.querySelectorAll('#billCards .bill-card')].map((x) => x.innerText.replace(/\s+/g, ' ')).find((t) => /amazon/i.test(t));
    return { tela, bill, helper: getDataVencimentoFatura(state.cards.find((c) => c.id === 'amz'), 2026, 9) };
  });
  const ok = r.tela.venc === '01/10/2026' && r.tela.pago === 'Pago em 30/09/2026' && r.helper === '2026-10-01'
    && r.bill.includes('Vence 01/10/2026') && r.bill.includes('Pago em 30/09/2026');
  return { ok, detail: JSON.stringify(r) };
}, 'paga em 30/09: telas continuam mostrando "Vence 01/10/2026" e passam a mostrar "Pago em 30/09/2026"');

// ── Fluxo de pagamento: Cartões/Faturas ──────────────────────────────────
const abrirFatura = (id, m, a) => page.evaluate(([i, mm, aa]) => {
  currentMonth = mm; currentYear = aa; window._faturaCartaoSelecionado = i; navigate('cartoes'); renderCartoes();
}, [id, m, a]);

await check('FPD_11_PAGAR_NA_TELA_DE_FATURAS_PEDE_DATA_PADRAO_HOJE', async () => {
  await loadState(fixture());
  await abrirFatura('amz', 12, 2026);
  await page.locator('#cartaoFaturaResumo button', { hasText: 'Marcar como Paga' }).click();
  const campo = await page.evaluate(() => { const el = document.getElementById('pagarFaturaData'); return { value: el?.value, max: el?.max }; });
  await page.locator('#pagarFaturaConta').selectOption('c1');
  await page.getByRole('button', { name: '✓ Confirmar pagamento', exact: true }).click();
  const r = await page.evaluate(() => ({ data: state.faturasPagasData['amz_2026-12'], paga: state.faturasPagas['amz_2026-12'], conta: state.faturasContas['amz_2026-12'],
    pago: document.getElementById('cartaoFaturaPagamento')?.innerText,
    jan: Math.round(calcSaldoContaAte('c1', 1, 2027) * 100), fev: Math.round(calcSaldoContaAte('c1', 2, 2027) * 100) }));
  const ok = campo.value === TODAY && campo.max === TODAY && r.data === TODAY && r.paga === true && r.conta === 'c1'
    && r.pago === 'Pago em 10/02/2027' && r.jan === cheio && r.fev === 80000;
  return { ok, detail: JSON.stringify({ campo, r }) };
}, 'Cartões/Faturas: modal traz a data de hoje; confirmar grava a data com a chave da competência e debita no mês dela');

await check('FPD_12_PAGAR_COM_DATA_ANTERIOR_ESCOLHIDA', async () => {
  await loadState(fixture());
  await abrirFatura('amz', 9, 2026);
  await page.locator('#cartaoFaturaResumo button', { hasText: 'Marcar como Paga' }).click();
  await page.locator('#pagarFaturaConta').selectOption('c1');
  await page.locator('#pagarFaturaData').fill('2026-09-30');
  await page.getByRole('button', { name: '✓ Confirmar pagamento', exact: true }).click();
  const r = { data: await page.evaluate(() => state.faturasPagasData['amz_2026-09']), s: await saldos() };
  return { ok: r.data === '2026-09-30' && r.s['2026-09'] === semSet && r.s['2026-10'] === semSet, detail: JSON.stringify(r) };
}, 'informar 30/09 no modal: fatura de set debita em set');

await check('FPD_13_DATA_VAZIA_OU_FUTURA_NAO_PAGA', async () => {
  await loadState(fixture());
  await abrirFatura('amz', 9, 2026);
  const antes = await page.evaluate(() => JSON.stringify(state));
  const tentar = async (valor) => {
    await page.evaluate(() => openPagarFaturaModal('amz', 9, 2026));
    await page.evaluate((v) => { document.getElementById('pagarFaturaConta').value = 'c1'; document.getElementById('pagarFaturaData').value = v; confirmarPagamentoFatura('amz', 9, 2026); }, valor);
    return page.evaluate((a) => ({ igual: JSON.stringify(state) === a, aberto: document.getElementById('modalOverlay').classList.contains('open') }), antes);
  };
  const r = { vazia: await tentar(''), futura: await tentar('2027-02-11') };
  await page.evaluate(() => closeModal());
  const ok = r.vazia.igual && r.vazia.aberto && r.futura.igual && r.futura.aberto;
  return { ok, detail: JSON.stringify(r) };
}, 'sem data ou com data futura o pagamento não é gravado (state intacto, modal continua aberto)');

// ── Fluxo de pagamento: Dashboard ────────────────────────────────────────
await check('FPD_14_PAGAR_PELO_DASHBOARD_PEDE_DATA', async () => {
  await loadState(fixture());
  await page.evaluate(() => { currentMonth = 2; currentYear = 2027; navigate('dashboard'); });
  const linha = page.locator('#cashPayList .cash-pay-row', { hasText: 'Fatura Amazon' }).first();
  await linha.locator('button').click();
  const campo = await page.evaluate(() => document.getElementById('pagarFaturaData')?.value);
  await page.locator('#pagarFaturaConta').selectOption('c1');
  await page.locator('#pagarFaturaData').fill('2026-09-25');
  await page.getByRole('button', { name: '✓ Confirmar pagamento', exact: true }).click();
  const r = await page.evaluate(() => ({ datas: JSON.stringify(state.faturasPagasData), pagas: Object.keys(state.faturasPagas).filter((k) => state.faturasPagas[k]) }));
  const s = await saldos();
  // A linha mais antiga em aberto é a competência set/2026.
  const ok = campo === TODAY && r.datas === '{"amz_2026-09":"2026-09-25"}' && r.pagas.join() === 'amz_2026-09' && s['2026-09'] === semSet;
  return { ok, detail: JSON.stringify({ campo, r, s }) };
}, 'Dashboard ("A pagar" → ✓ Pago): mesmo modal com data padrão hoje; a data informada é gravada na competência certa');

// ── Editar depois e desmarcar ────────────────────────────────────────────
await check('FPD_15_EDITAR_DATA_DEPOIS', async () => {
  await loadState(fixture(amzSetPaga(undefined)));
  await abrirFatura('amz', 9, 2026);
  const semData = await page.evaluate(() => document.getElementById('cartaoFaturaPagamento')?.innerText);
  await page.locator('#cartaoFaturaResumo button', { hasText: 'Data' }).click();
  const padrao = await page.evaluate(() => document.getElementById('editarFaturaData')?.value);
  await page.locator('#editarFaturaData').fill('2026-09-30');
  await page.getByRole('button', { name: '✓ Salvar data', exact: true }).click();
  const primeiro = { data: await page.evaluate(() => state.faturasPagasData['amz_2026-09']), s: await saldos() };
  await page.locator('#cartaoFaturaResumo button', { hasText: 'Data' }).click();
  const reaberto = await page.evaluate(() => document.getElementById('editarFaturaData')?.value);
  await page.locator('#editarFaturaData').fill('2026-11-05');
  await page.getByRole('button', { name: '✓ Salvar data', exact: true }).click();
  const segundo = { data: await page.evaluate(() => state.faturasPagasData['amz_2026-09']), s: await saldos(),
    resto: await page.evaluate(() => JSON.stringify([state.faturasPagas, state.faturasContas])) };
  const ok = semData === 'Pago · data não informada' && padrao === TODAY && primeiro.data === '2026-09-30' && primeiro.s['2026-09'] === semSet
    && reaberto === '2026-09-30' && segundo.data === '2026-11-05' && segundo.s['2026-10'] === cheio && segundo.s['2026-11'] === semSet
    && segundo.resto === '[{"amz_2026-09":true},{"amz_2026-09":"c1"}]';
  return { ok, detail: JSON.stringify({ semData, padrao, primeiro, reaberto, segundo }) };
}, 'fatura paga sem data: informar a data depois e corrigi-la de novo move o débito; pagamento e conta não mudam');

await check('FPD_16_EDITAR_DATA_INVALIDA_OU_FATURA_NAO_PAGA', async () => {
  await loadState(fixture(amzSetPaga('2026-09-30')));
  const r = await page.evaluate(() => {
    const antes = JSON.stringify(state);
    openEditarDataPagamentoFaturaModal('amz', 9, 2026);
    document.getElementById('editarFaturaData').value = '2027-02-11'; salvarDataPagamentoFatura('amz', 9, 2026);
    const futura = JSON.stringify(state) === antes;
    document.getElementById('editarFaturaData').value = ''; salvarDataPagamentoFatura('amz', 9, 2026);
    const vazia = JSON.stringify(state) === antes;
    closeModal();
    openEditarDataPagamentoFaturaModal('amz', 12, 2026); // não paga: não abre
    const abriu = document.getElementById('modalOverlay').classList.contains('open');
    return { futura, vazia, abriu, igual: JSON.stringify(state) === antes };
  });
  return { ok: r.futura && r.vazia && !r.abriu && r.igual, detail: JSON.stringify(r) };
}, 'edição rejeita data futura ou vazia; fatura não paga não abre o modal de data');

await check('FPD_17_DESMARCAR_REMOVE_A_DATA', async () => {
  await loadState(fixture(amzSetPaga('2026-09-30')));
  await abrirFatura('amz', 9, 2026);
  await page.locator('#cartaoFaturaResumo button', { hasText: 'Desmarcar' }).click();
  const r = await page.evaluate(() => ({ datas: JSON.stringify(state.faturasPagasData), contas: JSON.stringify(state.faturasContas), paga: isFaturaPaga('amz', 9, 2026),
    pago: document.getElementById('cartaoFaturaPagamento') }));
  const s = await saldos();
  const ok = r.datas === '{}' && r.contas === '{}' && r.paga === false && r.pago === null && s['2026-10'] === cheio && s.atual === cheio;
  return { ok, detail: JSON.stringify({ r, s }) };
}, 'desmarcar a fatura remove a data do pagamento junto com a conta; nada mais é debitado');

await check('FPD_18_EXPORTA_E_REIMPORTA', async () => {
  await loadState(fixture(amzSetPaga('2026-09-30')));
  const copia = await page.evaluate(() => JSON.parse(JSON.stringify(state)));
  await loadState(copia);
  const r = { datas: await page.evaluate(() => JSON.stringify(state.faturasPagasData)), s: await saldos() };
  return { ok: r.datas === '{"amz_2026-09":"2026-09-30"}' && r.s['2026-09'] === semSet, detail: JSON.stringify(r) };
}, 'a data do pagamento sobrevive a serializar e recarregar o state');

await check('FPD_19_SEM_MUTACAO_SEM_ERROS', async () => {
  await loadState(fixture(amzSetPaga('2026-09-30')));
  const igual = await page.evaluate(() => {
    const antes = JSON.stringify(state);
    currentMonth = 9; currentYear = 2026; navigate('dashboard'); navigate('cartoes'); navigate('relatorio');
    calcSaldoContaAte('c1', 9, 2026); getChronologicalProjection('2027-02-10', '2027-03-31');
    openEditarDataPagamentoFaturaModal('amz', 9, 2026); closeModal();
    return JSON.stringify(state) === antes;
  });
  return { ok: igual && consoleErrors.length === 0, detail: JSON.stringify({ igual, consoleErrors }) };
}, 'renderizar, calcular e abrir o modal de data não muda o state; nenhum erro de console na suíte');

} finally {
  await close();
}
const fail = results.filter((r) => r.status === 'FAIL').length;
console.log(`card-invoice-payment-date: TOTAL=${results.length} PASS=${results.length - fail} FAIL=${fail}`);
process.exitCode = fail ? 1 : 0;
