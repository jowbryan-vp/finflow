// Shared harness for the FinFlow financial-engine regression suite.
//
// Design goals (mandated by FINFLOW — IMPLEMENTATION GATE 1, section 16):
//   - deterministic: fixed synthetic fixtures, no wall-clock-dependent
//     assertions (REAL_TODAY_MONTH/REAL_TODAY_YEAR are read from the page,
//     never assumed).
//   - reproducible: spins up its own static file server and its own browser,
//     doesn't depend on a server already running on some port.
//   - isolated: never touches Google OAuth (migrateAppData is called directly
//     with synthetic data), never touches the real backup except through the
//     read-only comparison script, which works on a copy.
//   - no external file dependency outside the repo: the only "stub" needed
//     (fixtures/chart-stub.js) lives in this directory, not in /tmp.
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '..', '..');
const CHART_STUB_PATH = path.join(__dirname, 'fixtures', 'chart-stub.js');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.css': 'text/css',
};

function startStaticServer(rootDir) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(req.url.split('?')[0]);
      const filePath = path.join(rootDir, urlPath === '/' ? '/index.html' : urlPath);
      if (!filePath.startsWith(rootDir)) { res.writeHead(403); res.end(); return; }
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('not found'); return; }
        const ext = path.extname(filePath);
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
    server.on('error', reject);
  });
}

// A minimal, self-consistent synthetic dataset: two cards (one with no
// `fecha` on purpose, to exercise the legacy-fallback-when-no-closing-day
// path), one bank account, one category. Individual tests overlay whatever
// despesas/receitas they need on top via page.evaluate — this base state is
// intentionally empty of transactions.
export function baseSyntheticState(extra = {}) {
  return {
    categories: [{ id: 'geral', name: 'Geral', subs: ['Geral'] }],
    cards: [
      { id: 'dinheiro', name: 'Dinheiro/PIX', color: '#38e2b4', fecha: null, paga: null },
      { id: 'nu', name: 'Nubank', color: '#820ad1', fecha: 3, paga: 10 },
      { id: 'semfecha', name: 'Cartão sem fechamento configurado', color: '#ff8800', fecha: null, paga: null },
    ],
    contas: [{ id: 'c1', name: 'Conta 1', color: '#5b7fff', saldoInicial: 1000 }],
    movimentacoesContas: [],
    receitas: [],
    despesas: [],
    pessoas: [],
    cofrinhos: [],
    movimentacoesCofrinhos: [],
    excedentes: {},
    contribuicaoAjustes: {},
    faturasPagas: {},
    contribuicaoPaga: {},
    ...extra,
  };
}

// Opens one browser + one page loaded against a freshly-served copy of the
// real index.html, with Chart.js swapped for the local stub and pdf.js/fonts
// blocked (never fetched — no network dependency, no version drift). Returns
// { browser, page, server, close() } — call close() when done (each test file
// uses its own instance so failures don't cascade).
export async function openHarness() {
  const server = await startStaticServer(REPO_ROOT);
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1600 } });

  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !msg.text().includes('ERR_FAILED')) consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(err.message));

  await page.route('**/cdn.jsdelivr.net/npm/chart.js@**', (route) =>
    route.fulfill({ path: CHART_STUB_PATH, contentType: 'application/javascript' })
  );
  await page.route('**/cdnjs.cloudflare.com/**/pdf.min.js', (route) => route.abort());
  await page.route('**/cdnjs.cloudflare.com/**/pdf.worker.min.js', (route) => route.abort());
  await page.route('**fonts.googleapis.com/**', (route) => route.abort());
  await page.route('**fonts.gstatic.com/**', (route) => route.abort());

  await page.goto(`${baseUrl}/index.html`, { waitUntil: 'domcontentloaded' });

  async function loadState(rawState) {
    await page.evaluate((raw) => {
      migrateAppData(raw);
      document.getElementById('authScreen').style.display = 'none';
      document.getElementById('appShell').style.display = 'flex';
    }, rawState);
  }

  async function close() {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }

  return { browser, page, server, baseUrl, loadState, consoleErrors, close };
}

// --- tiny built-in test runner (no extra dependency) -----------------------
export function makeRunner(suiteName) {
  const results = [];
  return {
    async check(id, fn, detail) {
      let pass, error, extraDetail;
      try {
        const outcome = await fn();
        // A test fn may return either a plain boolean, or {ok, detail} when it
        // wants to report what it actually observed alongside the static
        // expectation text (e.g. the sequence of months a despesa landed in).
        if (outcome !== null && typeof outcome === 'object' && 'ok' in outcome) {
          pass = !!outcome.ok;
          extraDetail = outcome.detail;
        } else {
          pass = !!outcome;
        }
      } catch (e) {
        pass = false;
        error = e.message;
      }
      const status = pass ? 'PASS' : 'FAIL';
      const fullDetail = extraDetail ? `${detail} — obtido: ${extraDetail}` : detail;
      results.push({ suite: suiteName, id, status, detail: error ? `${fullDetail} — ERRO: ${error}` : fullDetail });
      console.log(`[${status}] ${id}: ${fullDetail}${error ? ` — ERRO: ${error}` : ''}`);
      return pass;
    },
    results,
  };
}
