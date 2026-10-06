// Gate 5.x — vencimento de fatura no mês seguinte ao fechamento.
//
// Cartão que paga num dia <= ao do fechamento (AMAZON: fecha 17, paga 1) vence
// no mês SEGUINTE à competência; Nubank (fecha 3 / paga 10) e MP (fecha 2 /
// paga 7) continuam vencendo no próprio mês. getDataVencimentoFatura é o ponto
// único dessa regra, usado por getChronologicalProjection e por
// calcProximosVencimentos. Só a DATA muda: competência, total da fatura,
// faturasPagas/faturasContas/faturasAjustes e os saldos ficam intocados — a
// última parte compara calcSaldoContaAte entre o commit-base e o código atual.
//
// Regressão com backup real (opcional, nunca versionado):
//   FINFLOW_REAL_BACKUP=/caminho/finflow_backup_2026-10-06_integral.json \
//     node gate5-invoice-due-date-next-month.test.mjs
// FINFLOW_BASELINE_REF troca o commit-base (default: f468295). Nenhum valor
// real é impresso — só a contagem de saldos comparados e de diferenças.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openHarness, makeRunner, baseSyntheticState, REPO_ROOT } from './harness.mjs';

const BASELINE_REF = process.env.FINFLOW_BASELINE_REF || 'f468295';
const REAL_BACKUP = process.env.FINFLOW_REAL_BACKUP;
const CHART_STUB_PATH = path.join(REPO_ROOT, 'tests', 'financial-engine', 'fixtures', 'chart-stub.js');

const AMAZON = { id: 'amazon', name: 'AMAZON', color: '#ff9900', fecha: 17, paga: 1 };
const MP = { id: 'mp', name: 'MP', color: '#00b1ea', fecha: 2, paga: 7 };

function stateComCartoes(extra = {}) {
  const base = baseSyntheticState();
  return { ...base, cards: [...base.cards, AMAZON, MP], ...extra };
}

const { page, loadState, close } = await openHarness();
const { check, results } = makeRunner('gate5-invoice-due-date-next-month');
const venc = (card, mes, ano) => page.evaluate(([c, m, a]) => getDataVencimentoFatura(c, m, a), [card, mes, ano]);

try {
  await loadState(stateComCartoes());

  // --- 1 a 7: função pura ---------------------------------------------------
  await check('VENC_01_AMAZON_MES_SEGUINTE', async () => (await venc(AMAZON, 10, 2026)) === '2026-11-01',
    'AMAZON {fecha:17, paga:1}, competência 10/2026 → 2026-11-01');
  await check('VENC_02_AMAZON_VIRADA_DE_ANO', async () => (await venc(AMAZON, 12, 2026)) === '2027-01-01',
    'AMAZON, competência 12/2026 → 2027-01-01');
  await check('VENC_03_NUBANK_INALTERADO', async () => (await venc({ fecha: 3, paga: 10 }, 10, 2026)) === '2026-10-10',
    'Nubank {fecha:3, paga:10}, competência 10/2026 → 2026-10-10');
  await check('VENC_04_MP_INALTERADO', async () => (await venc(MP, 10, 2026)) === '2026-10-07' && (await venc(MP, 12, 2026)) === '2026-12-07',
    'MP {fecha:2, paga:7} → mesmo mês, inclusive em dezembro');
  await check('VENC_05_PAGA_IGUAL_FECHA', async () => (await venc({ fecha: 10, paga: 10 }, 10, 2026)) === '2026-11-10',
    'paga == fecha (10/10) → mês seguinte');
  await check('VENC_06_SEM_FECHA_LEGADO', async () => (await venc({ fecha: null, paga: 1 }, 10, 2026)) === '2026-10-01'
    && (await venc({ paga: 20 }, 10, 2026)) === '2026-10-20',
    'sem fecha (null/ausente) e com paga → mesmo mês');
  await check('VENC_07_SEM_PAGA_NULL', async () => (await venc({ fecha: 17, paga: null }, 10, 2026)) === null
    && (await venc({ fecha: 17 }, 10, 2026)) === null && (await venc({ fecha: 17, paga: 32 }, 10, 2026)) === null,
    'sem paga válido → null');
  await check('VENC_07B_ULTIMO_DIA_DO_MES_DE_VENCIMENTO', async () => (await venc({ fecha: 31, paga: 31 }, 1, 2026)) === '2026-02-28'
    && (await venc({ fecha: 5, paga: 31 }, 2, 2028)) === '2028-02-29',
    'dia limitado ao último dia do mês em que a fatura vence');

  // --- 8: integração com a projeção ----------------------------------------
  // Compra em 20/09 (depois do fechamento de 17/09) cai na fatura de
  // competência 10/2026, que fecha em 17/10 e vence em 01/11.
  const comFaturaAmazon = () => loadState(stateComCartoes({
    despesas: [{ id: 'compra', desc: 'Compra AMAZON', cat: 'geral', subcat: 'Geral', cartao: 'amazon', valor: 281.20,
      parcelas: 1, mesInicio: 9, anoInicio: 2026, dataCompra: '2026-09-20', pagoMeses: {}, split: [], repasses: {} }],
  }));
  await check('VENC_08A_FORA_DE_A_PAGAR_ATE_29_10', async () => {
    await comFaturaAmazon();
    return page.evaluate(() => {
      const total = calcByCardForMonth(10, 2026).amazon;
      const p = getChronologicalProjection('2026-10-06', '2026-10-29');
      const todos = p.events.concat(p.undated);
      return { ok: Math.abs(total - 281.20) < 0.005 && !todos.some((e) => e.kind === 'invoice') && p.obligations === 0
        && !p.events.some((e) => e.overdue), detail: `competência 10/2026=${total}; obrigações=${p.obligations}; eventos=${todos.length}` };
    });
  }, 'fatura AMAZON de 10/2026 não entra no período até 29/10, não é atrasada e não infla as obrigações');
  await check('VENC_08B_APARECE_EM_01_11', async () => {
    await comFaturaAmazon();
    return page.evaluate(() => {
      const p = getChronologicalProjection('2026-10-06', '2026-11-05');
      const e = p.events.find((x) => x.id === 'invoice:amazon:2026-10');
      return { ok: !!e && e.date === '2026-11-01' && e.originalDate === '2026-11-01' && !e.overdue && e.month === '2026-10'
        && Math.abs(e.amount + 281.20) < 0.005 && p.events.filter((x) => x.kind === 'invoice').length === 1,
        detail: e ? `data=${e.date}; month=${e.month}; overdue=${e.overdue}` : 'evento ausente' };
    });
  }, 'com endDate 2026-11-05 a fatura aparece em 2026-11-01, com month ainda igual à competência');
  await check('VENC_08C_NUBANK_E_MP_NA_PROJECAO', async () => {
    await loadState(stateComCartoes({
      despesas: ['nu', 'mp'].map((cartao) => ({ id: `compra-${cartao}`, desc: 'Compra', cat: 'geral', subcat: 'Geral', cartao, valor: 100,
        parcelas: 1, mesInicio: 9, anoInicio: 2026, dataCompra: '2026-09-20', pagoMeses: {}, split: [], repasses: {} })),
    }));
    return page.evaluate(() => {
      const p = getChronologicalProjection('2026-10-06', '2026-10-29');
      const data = (id) => p.events.find((e) => e.id === `invoice:${id}:2026-10`)?.date;
      return { ok: data('nu') === '2026-10-10' && data('mp') === '2026-10-07', detail: `nu=${data('nu')}; mp=${data('mp')}` };
    });
  }, 'faturas Nubank e MP de 10/2026 continuam vencendo em outubro na projeção');
  await check('VENC_08D_PROXIMOS_VENCIMENTOS', async () => {
    await comFaturaAmazon();
    await page.clock.setFixedTime(new Date(2026, 9, 6, 12, 0, 0));
    try {
      return await page.evaluate(() => {
        const f = calcProximosVencimentos().find((x) => x.tipo === 'fatura' && x.card.id === 'amazon');
        return { ok: !!f && f.diffDias === 26 && f.fechoMes === 10 && f.fechoAno === 2026 && f.pagaMes === 11 && f.pagaAno === 2026,
          detail: f ? `diffDias=${f.diffDias}; competência=${f.fechoMes}/${f.fechoAno}; vence=${f.pagaMes}/${f.pagaAno}` : 'fatura ausente' };
      });
    } finally { await page.clock.setFixedTime(new Date()); }
  }, 'Próximos vencimentos em 06/10: fatura AMAZON de outubro vence em 26 dias (01/11), não "vencida"');
} finally { await close(); }

// --- 9: regressão de saldos, commit-base x código atual ---------------------
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'finflow-invoice-due-date-'));
const baselineDir = path.join(scratch, 'baseline');
fs.mkdirSync(baselineDir);
fs.writeFileSync(path.join(baselineDir, 'index.html'),
  execFileSync('git', ['show', `${BASELINE_REF}:index.html`], { cwd: REPO_ROOT, maxBuffer: 1024 * 1024 * 64 }));

async function saldos(rootDir, raw) {
  const server = http.createServer((req, res) => fs.readFile(path.join(rootDir, 'index.html'), (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(data);
  }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch(process.env.FINFLOW_CHROMIUM_PATH ? { executablePath: process.env.FINFLOW_CHROMIUM_PATH } : {});
  try {
    const pg = await browser.newPage();
    await pg.route('**/cdn.jsdelivr.net/npm/chart.js@**', (route) => route.fulfill({ path: CHART_STUB_PATH, contentType: 'application/javascript' }));
    await pg.route('**/cdnjs.cloudflare.com/**', (route) => route.abort());
    await pg.route('**fonts.googleapis.com/**', (route) => route.abort());
    await pg.route('**fonts.gstatic.com/**', (route) => route.abort());
    await pg.goto(`http://127.0.0.1:${server.address().port}/index.html`, { waitUntil: 'domcontentloaded' });
    return await pg.evaluate((data) => {
      migrateAppData(data);
      const out = [];
      for (const c of state.contas || []) {
        for (let mes = 1; mes <= 10; mes++) out.push([c.id, mes, calcSaldoContaAte(c.id, mes, 2026)]);
        out.push([c.id, 'atual', calcSaldoConta(c.id)]);
      }
      return out;
    }, raw);
  } finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
}
async function compararSaldos(raw) {
  const antes = await saldos(baselineDir, raw), depois = await saldos(REPO_ROOT, raw);
  const diffs = antes.filter((a, i) => JSON.stringify(a) !== JSON.stringify(depois[i])).length + Math.abs(antes.length - depois.length);
  return { ok: antes.length > 0 && diffs === 0, detail: `${antes.length} saldos comparados; ${diffs} diferenças (base ${BASELINE_REF})` };
}

try {
  // Fixture sintética com faturas AMAZON/Nubank pagas por conta, pra exercitar
  // o débito de fatura dentro de calcSaldoContaAte.
  await check('VENC_09A_SALDOS_SINTETICOS_IDENTICOS', () => compararSaldos(stateComCartoes({
    despesas: ['amazon', 'nu', 'mp'].flatMap((cartao, i) => [8, 9].map((mes) => ({ id: `${cartao}-${mes}`, desc: 'Compra', cat: 'geral', subcat: 'Geral',
      cartao, valor: 100 + 10 * i + mes, parcelas: 1, mesInicio: mes, anoInicio: 2026, dataCompra: `2026-0${mes}-20`, pagoMeses: {}, split: [], repasses: {} }))),
    faturasPagas: { 'amazon_2026-09': true, 'nu_2026-09': true, 'amazon_2026-10': true },
    faturasContas: { 'amazon_2026-09': 'c1', 'nu_2026-09': 'c1', 'amazon_2026-10': 'c1' },
  })), 'calcSaldoContaAte (jan–out/2026) e calcSaldoConta idênticos entre o commit-base e o código atual');

  if (REAL_BACKUP) {
    await check('VENC_09B_SALDOS_BACKUP_REAL_IDENTICOS', () => compararSaldos(JSON.parse(fs.readFileSync(REAL_BACKUP, 'utf8'))),
      'backup real: calcSaldoContaAte de todas as contas, jan–out/2026, idêntico antes e depois');
  } else {
    console.log('[SKIP] VENC_09B_SALDOS_BACKUP_REAL_IDENTICOS: defina FINFLOW_REAL_BACKUP para comparar com o backup real (não versionado)');
  }
} finally { fs.rmSync(scratch, { recursive: true, force: true }); }

const fail = results.filter((r) => r.status === 'FAIL').length;
console.log(`gate5-invoice-due-date-next-month: TOTAL=${results.length} PASS=${results.length - fail} FAIL=${fail}`);
process.exitCode = fail ? 1 : 0;
