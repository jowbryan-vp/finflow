// Gate 1, section 22 — real-backup regression comparison.
//
// Compares the app's computed numbers for EVERY historical month, between
// the pre-Gate-1 baseline commit and the current code, using a COPY of the
// user's real backup. The ORIGINAL backup file is never opened for writing,
// only read — this script makes exactly one read of it and writes a copy
// into the session scratchpad (never into the repo, never overwriting the
// original).
//
// If even one historical number differs, Gate 1 = FAIL per the spec. This
// script prints only aggregate counts and a differences list — it does not
// print raw despesa/receita descriptions or names, to avoid leaking personal
// data into command output, logs or the report that quotes this script's
// results.
//
// Usage: node compare-real-backup.mjs <path-to-real-backup.json> [baseline-git-ref]
//   baseline-git-ref defaults to the Gate 1 baseline commit tag/hash if the
//   repo has one recorded; otherwise pass it explicitly (see tests/financial-engine/README.md).
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const CHART_STUB_PATH = path.join(__dirname, 'fixtures', 'chart-stub.js');

const backupArg = process.argv[2];
const baselineRef = process.argv[3] || '569c1cb';
if (!backupArg) {
  console.error('Usage: node compare-real-backup.mjs <path-to-real-backup.json> [baseline-git-ref]');
  process.exit(2);
}
if (!fs.existsSync(backupArg)) {
  console.error(`Backup file not found: ${backupArg}`);
  process.exit(2);
}

// --- 1. copy the real backup into a scratch dir, never touch the original ---
const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'finflow-gate1-realbackup-'));
const backupCopyPath = path.join(scratchDir, 'backup-copy.json');
fs.copyFileSync(backupArg, backupCopyPath);
const backupData = JSON.parse(fs.readFileSync(backupCopyPath, 'utf8'));
console.log(`Backup copiado (somente leitura do original) para: ${backupCopyPath}`);

// --- 2. materialize the pre-Gate-1 baseline index.html from git history ----
const baselineDir = path.join(scratchDir, 'baseline');
fs.mkdirSync(baselineDir);
const baselineHtml = execSync(`git show ${baselineRef}:index.html`, { cwd: REPO_ROOT, maxBuffer: 1024 * 1024 * 64 }).toString();
fs.writeFileSync(path.join(baselineDir, 'index.html'), baselineHtml);
console.log(`Baseline (pré-Gate-1) materializado a partir de ${baselineRef}: ${path.join(baselineDir, 'index.html')}`);

const currentDir = path.join(scratchDir, 'current');
fs.mkdirSync(currentDir);
fs.copyFileSync(path.join(REPO_ROOT, 'index.html'), path.join(currentDir, 'index.html'));

function serve(rootDir) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const filePath = path.join(rootDir, 'index.html');
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end(); return; }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(data);
      });
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function computeSnapshot(rootDir) {
  const server = await serve(rootDir);
  const { port } = server.address();
  const browser = await chromium.launch(process.env.FINFLOW_CHROMIUM_PATH
    ? { executablePath: process.env.FINFLOW_CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 1440, height: 1600 } });
  await page.route('**/cdn.jsdelivr.net/npm/chart.js@**', (route) => route.fulfill({ path: CHART_STUB_PATH, contentType: 'application/javascript' }));
  await page.route('**/cdnjs.cloudflare.com/**/pdf.min.js', (route) => route.abort());
  await page.route('**/cdnjs.cloudflare.com/**/pdf.worker.min.js', (route) => route.abort());
  await page.route('**fonts.googleapis.com/**', (route) => route.abort());
  await page.route('**fonts.gstatic.com/**', (route) => route.abort());
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'domcontentloaded' });

  const snapshot = await page.evaluate((backup) => {
    migrateAppData(backup);
    document.getElementById('authScreen').style.display = 'none';
    document.getElementById('appShell').style.display = 'flex';

    // Historical window: from the earliest despesa/receita competência found
    // in the data through REAL_TODAY (this month), inclusive. Future months
    // are explicitly out of scope for this comparison (Gate 1 doesn't touch
    // projections).
    let minY = REAL_TODAY_YEAR, minM = REAL_TODAY_MONTH;
    state.despesas.forEach((d) => { if (d.anoInicio < minY || (d.anoInicio === minY && d.mesInicio < minM)) { minY = d.anoInicio; minM = d.mesInicio; } });
    state.receitas.forEach((r) => { if (r.ano != null && (r.ano < minY || (r.ano === minY && r.mes < minM))) { minY = r.ano; minM = r.mes; } });

    const months = [];
    let y = minY, m = minM;
    while (y < REAL_TODAY_YEAR || (y === REAL_TODAY_YEAR && m <= REAL_TODAY_MONTH)) {
      const despesasMes = getDespesasForMonth(m, y);
      const receitasMes = getReceitasForMonth(m, y);
      const byCard = calcByCardForMonth(m, y);
      months.push({
        mes: m, ano: y,
        totalFaturas: Object.values(byCard).reduce((s, v) => s + v, 0),
        faturasPagasPorCartao: state.cards.filter((c) => c.id !== 'dinheiro').map((c) => isFaturaPaga(c.id, m, y)),
        nDespesas: despesasMes.length,
        somaDespesas: despesasMes.reduce((s, d) => s + (d._valorParcela || 0), 0),
        nReceitas: receitasMes.length,
        somaReceitas: receitasMes.reduce((s, r) => s + valorReceita(r), 0),
        nParcelas: despesasMes.filter((d) => (d._total || 1) > 1).length,
      });
      const next = addMonths(m, y, 1); m = next.mes; y = next.ano;
    }

    const saldoContas = state.contas.map((c) => ({ id: c.id, saldo: calcSaldoConta(c.id) }));

    return { months, saldoContas, minY, minM, realToday: { mes: REAL_TODAY_MONTH, ano: REAL_TODAY_YEAR } };
  }, backupData);

  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  return snapshot;
}

console.log('Computando snapshot da versão BASELINE (pré-Gate-1)...');
const before = await computeSnapshot(baselineDir);
console.log('Computando snapshot da versão ATUAL (pós-Gate-1)...');
const after = await computeSnapshot(currentDir);

// --- 3. compare, month by month, metric by metric ---------------------------
const diffs = [];
const maxLen = Math.max(before.months.length, after.months.length);
if (before.months.length !== after.months.length) {
  diffs.push({ field: 'nMeses', before: before.months.length, after: after.months.length });
}
for (let i = 0; i < maxLen; i++) {
  const b = before.months[i], a = after.months[i];
  if (!b || !a) { diffs.push({ field: `mes[${i}]`, before: b ? `${b.mes}/${b.ano}` : 'ausente', after: a ? `${a.mes}/${a.ano}` : 'ausente' }); continue; }
  const label = `${String(b.mes).padStart(2, '0')}/${b.ano}`;
  if (b.mes !== a.mes || b.ano !== a.ano) diffs.push({ field: `${label} mes/ano`, before: `${b.mes}/${b.ano}`, after: `${a.mes}/${a.ano}` });
  if (Math.abs(b.totalFaturas - a.totalFaturas) > 0.005) diffs.push({ field: `${label} totalFaturas`, before: b.totalFaturas, after: a.totalFaturas });
  if (JSON.stringify(b.faturasPagasPorCartao) !== JSON.stringify(a.faturasPagasPorCartao)) diffs.push({ field: `${label} faturasPagasPorCartao`, before: b.faturasPagasPorCartao, after: a.faturasPagasPorCartao });
  if (b.nDespesas !== a.nDespesas) diffs.push({ field: `${label} nDespesas`, before: b.nDespesas, after: a.nDespesas });
  if (Math.abs(b.somaDespesas - a.somaDespesas) > 0.005) diffs.push({ field: `${label} somaDespesas`, before: b.somaDespesas, after: a.somaDespesas });
  if (b.nReceitas !== a.nReceitas) diffs.push({ field: `${label} nReceitas`, before: b.nReceitas, after: a.nReceitas });
  if (Math.abs(b.somaReceitas - a.somaReceitas) > 0.005) diffs.push({ field: `${label} somaReceitas`, before: b.somaReceitas, after: a.somaReceitas });
  if (b.nParcelas !== a.nParcelas) diffs.push({ field: `${label} nParcelas`, before: b.nParcelas, after: a.nParcelas });
}
if (JSON.stringify(before.saldoContas) !== JSON.stringify(after.saldoContas)) {
  diffs.push({ field: 'saldoContas', before: before.saldoContas, after: after.saldoContas });
}

console.log(`\nMeses históricos comparados: ${before.months.length} (de ${String(before.minM).padStart(2, '0')}/${before.minY} até ${String(before.realToday.mes).padStart(2, '0')}/${before.realToday.ano})`);
console.log(`Diferenças encontradas: ${diffs.length}`);
if (diffs.length > 0) {
  console.log('\n--- DIFERENÇAS (Gate 1 = FAIL) ---');
  diffs.forEach((d) => console.log(`  ${d.field}: antes=${JSON.stringify(d.before)} depois=${JSON.stringify(d.after)}`));
}

fs.writeFileSync(path.join(scratchDir, 'comparison-result.json'), JSON.stringify({ before, after, diffs }, null, 2));
console.log(`\nResultado completo (contém números financeiros reais — não commitado) salvo em: ${path.join(scratchDir, 'comparison-result.json')}`);
console.log(`\nREAL_BACKUP_DIFFERENCES: ${diffs.length}`);
process.exitCode = diffs.length > 0 ? 1 : 0;
