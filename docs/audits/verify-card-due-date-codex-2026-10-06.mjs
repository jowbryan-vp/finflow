// Independent synthetic audit; run from any cwd with node <this file>.
import assert from 'node:assert/strict';
import { openHarness, baseSyntheticState } from '../../tests/financial-engine/harness.mjs';
const h = await openHarness();
try {
  await h.page.clock.setFixedTime(new Date(2026, 9, 6, 12));
  await h.page.reload({ waitUntil: 'domcontentloaded' });
  await h.loadState(baseSyntheticState({
    cards: [{ id: 'amz', name: 'Synthetic card', fecha: 17, paga: 1, color: '#444444' }],
    despesas: [{ id: 'purchase', desc: 'Synthetic purchase', cat: 'geral', subcat: 'Geral', cartao: 'amz',
      valor: 600, parcelas: 3, mesInicio: 9, anoInicio: 2026, dataCompra: '2026-09-05',
      fixa: false, pagoMeses: {}, split: [], repasses: {}, createdAt: 'synthetic' }],
  }));
  const r = await h.page.evaluate(() => {
    const snapshot = JSON.stringify(state);
    const invoices = (start, end) => getChronologicalProjection(start, end).events.filter(e => e.kind === 'invoice');
    const before = invoices('2026-09-30', '2026-09-30');
    const onDue = invoices('2026-10-01', '2026-10-01');
    const overdue = invoices('2026-10-06', '2026-11-01');
    const nextYear = invoices('2027-01-01', '2027-01-31');
    const action = cashObligationAction(onDue[0]);
    const leap = getDataVencimentoFatura({fecha:31,paga:31}, 2028, 1);
    const immutable = JSON.stringify(state) === snapshot;
    currentMonth = 10; currentYear = 2026;
    navigate('dashboard');
    return { before, onDue, overdue, nextYear, action, leap, immutable,
      rows: document.getElementById('cashPayList').innerText };
  });
  assert.equal(r.before.length, 0);
  assert.equal(r.onDue.length, 1);
  assert.equal(r.onDue[0].id, 'invoice:amz:2026-09');
  assert.equal(r.onDue[0].date, '2026-10-01');
  assert.equal(r.onDue[0].overdue, false);
  assert.equal(r.overdue.length, 2);
  assert.equal(r.overdue[0].originalDate, '2026-10-01');
  assert.equal(r.overdue[0].overdue, true);
  assert.equal(r.overdue.reduce((s,e)=>s-e.amount,0), 400);
  assert.equal(r.nextYear.length, 3);
  assert.equal(r.nextYear.reduce((s,e)=>s-e.amount,0), 600);
  assert.match(r.action, /toggleFaturaPaga\('amz',9,2026\)/);
  assert.equal(r.leap, '2028-02-29');
  assert.equal(r.immutable, true);
  // Execute the real Dashboard payment action and confirmation.
  await h.page.locator('#cashPayList button').first().click();
  await h.page.locator('#pagarFaturaConta').selectOption('c1');
  await h.page.getByRole('button', {name:'✓ Confirmar pagamento', exact:true}).click();
  const paid = await h.page.evaluate(() => ({
    keys: state.faturasPagas, accounts: state.faturasContas,
    current: calcSaldoConta('c1'), sep: calcSaldoContaAte('c1',9,2026), oct:calcSaldoContaAte('c1',10,2026),
    pending: getChronologicalProjection('2026-10-06','2026-11-01').events.filter(e=>e.kind==='invoice').map(e=>e.id),
  }));
  assert.equal(paid.keys['amz_2026-09'], true);
  assert.equal(paid.keys['amz_2026-10'], undefined);
  assert.equal(paid.accounts['amz_2026-09'], 'c1');
  assert.equal(paid.current, 800);
  assert.equal(paid.sep, 1000);
  assert.equal(paid.oct, 800);
  assert.deepEqual(paid.pending, ['invoice:amz:2026-10']);
  assert.deepEqual(h.consoleErrors, []);
  console.log(JSON.stringify({result:'PASS', projection:r, payment:paid, consoleErrors:h.consoleErrors}, null, 2));
} finally { await h.close(); }
