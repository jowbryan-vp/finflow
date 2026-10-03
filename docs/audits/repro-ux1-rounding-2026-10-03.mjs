// Investigação independente Codex; somente dados sintéticos, sem alterar produto.
// node docs/audits/repro-ux1-rounding-2026-10-03.mjs [revisao]
import { execFileSync } from 'node:child_process';
import { openHarness, baseSyntheticState, REPO_ROOT } from '../../tests/financial-engine/harness.mjs';
const revision = process.argv[2];
const h = await openHarness();
try {
  if (revision) {
    const html = execFileSync('git', ['show', `${revision}:index.html`], { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 5e6 });
    await h.page.route('**/index.html', route => route.fulfill({ body: html, contentType: 'text/html' }));
    await h.page.goto(`${h.baseUrl}/index.html`);
  }
  await h.page.clock.setFixedTime(new Date(2026, 9, 3, 12));
  await h.loadState(baseSyntheticState({
    financialPreferences: { projectionEndDate: '2026-10-31' },
    despesas: ['a', 'b'].map(id => ({ id, desc: `Compra ${id}`, cat: 'geral', subcat: 'Geral',
      cartao: id === 'a' ? 'nu' : 'semfecha', conta: null, valor: 100, parcelas: 3,
      mesInicio: 9, anoInicio: 2026, dataCompra: null, fixa: false, diaVencimento: null,
      pagoMeses: {}, split: [], repasses: {}, createdAt: id }))
  }));
  const result = await h.page.evaluate(() => {
    currentMonth = 10; currentYear = 2026; navigate('dashboard');
    const p = getCashOutlookView().p;
    return {
      card: document.getElementById('cashObligations').innerText,
      listTotal: document.getElementById('cashPayTotal').innerText,
      cardCents: toCents(p.obligations),
      listCents: getCashObligationItems(p).reduce((s, e) => s + e.amountCents, 0),
      rows: [...document.querySelectorAll('.cash-pay-row')].map(r => r.innerText),
    };
  });
  console.log(JSON.stringify({ revision: revision || 'working-tree', ...result }, null, 2));
  if (result.cardCents !== result.listCents) {
    console.error('FAIL: soma da lista diverge do card A pagar.');
    process.exitCode = 1;
  }
} finally { await h.close(); }
