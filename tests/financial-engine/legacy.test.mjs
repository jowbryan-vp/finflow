// G1-L01..G1-L04 — legacy compatibility guarantees. The single non-negotiable
// rule behind all four: a despesa with no dataCompra is a LEGACY record, and
// nothing this gate does may reinterpret its invoice competência, or invent a
// dataCompra for it, ever — not on load, not on save, not across repeated
// migrations.
import { openHarness, makeRunner, baseSyntheticState, REPO_ROOT } from './harness.mjs';

const { page, loadState, close } = await openHarness();
const { check, results } = makeRunner('legacy');

// G1-L01: an old-style despesa (dataCompra never set at all — undefined, the
// way every despesa created before this gate looks) must land in exactly the
// same invoice it always did: mesInicio+1, day-blind, regardless of the
// card's `fecha`.
await check('G1-L01', async () => {
  await loadState(baseSyntheticState());
  const hit = await page.evaluate(() => {
    // Pushed the same way `state.despesas.push(...)` looked before dataCompra
    // existed — no dataCompra key at all — then migrateState() is what
    // back-fills defaults for a freshly-loaded/older document.
    state.despesas.push({ id: 'l01', desc: 'despesa antiga', cat: 'geral', subcat: 'Geral', cartao: 'nu', conta: null,
      valor: 150, parcelas: 1, mesInicio: 9, anoInicio: 2026,
      fixa: false, diaVencimento: null, debitoAutomatico: false, pagoMeses: {}, split: [], repasses: {}, createdAt: 'l01' });
    migrateState();
    const d = state.despesas.find((x) => x.id === 'l01');
    const found = getDespesasForMonth(10, 2026).find((x) => x.id === 'l01');
    return { dataCompraAfterMigrate: d.dataCompra, foundInOutubro: !!found };
  });
  return { ok: hit.dataCompraAfterMigrate === null && hit.foundInOutubro,
    detail: `dataCompra após migrateState=${JSON.stringify(hit.dataCompraAfterMigrate)}, aparece em out/2026=${hit.foundInOutubro}` };
}, 'despesa antiga (dataCompra nunca existiu), mesInicio=9/2026, cartão crédito fecha=03 → esperado outubro/2026, exatamente como antes de getCompetenciaFatura existir');

// G1-L02: importing an old backup twice in a row (as if the user closed and
// reopened the app, or re-imported the same file) must not shift ANY
// historical invoice competência between the two loads.
await check('G1-L02', async () => {
  const raw = baseSyntheticState({
    despesas: [
      { id: 'l02a', desc: 'antiga A', cat: 'geral', subcat: 'Geral', cartao: 'nu', conta: null, valor: 100, parcelas: 1, mesInicio: 6, anoInicio: 2026, fixa: false, diaVencimento: null, debitoAutomatico: false, pagoMeses: {}, split: [], repasses: {}, createdAt: 'l02a' },
      { id: 'l02b', desc: 'antiga B', cat: 'geral', subcat: 'Geral', cartao: 'nu', conta: null, valor: 200, parcelas: 3, mesInicio: 3, anoInicio: 2026, fixa: false, diaVencimento: null, debitoAutomatico: false, pagoMeses: {}, split: [], repasses: {}, createdAt: 'l02b' },
    ],
  });
  await loadState(raw);
  const snapshot1 = await page.evaluate(() => {
    const months = [];
    for (let ano = 2026; ano <= 2027; ano++) for (let mes = 1; mes <= 12; mes++) {
      getDespesasForMonth(mes, ano).forEach((d) => months.push(`${d.id}:${mes}/${ano}#${d._parcel}`));
    }
    return months;
  });
  // Re-import the SAME raw backup object again (fresh migrateAppData call —
  // simulates closing and reopening the file) and take the snapshot again.
  await loadState(raw);
  const snapshot2 = await page.evaluate(() => {
    const months = [];
    for (let ano = 2026; ano <= 2027; ano++) for (let mes = 1; mes <= 12; mes++) {
      getDespesasForMonth(mes, ano).forEach((d) => months.push(`${d.id}:${mes}/${ano}#${d._parcel}`));
    }
    return months;
  });
  const same = JSON.stringify(snapshot1) === JSON.stringify(snapshot2);
  return { ok: same, detail: same ? 'idêntico nas duas importações' : `MUDOU: antes=${JSON.stringify(snapshot1)} depois=${JSON.stringify(snapshot2)}` };
}, 'importar o mesmo backup antigo duas vezes seguidas → nenhuma fatura histórica muda de competência entre uma importação e outra');

// G1-L03: opening and re-saving an old backup, without the user editing any
// despesa, must not invent a dataCompra for any of them. This is the
// migrateState() default-fill path specifically: it must set dataCompra to
// null, never to today's date or any guessed value.
await check('G1-L03', async () => {
  const raw = baseSyntheticState({
    despesas: [
      { id: 'l03a', desc: 'antiga', cat: 'geral', subcat: 'Geral', cartao: 'nu', conta: null, valor: 50, parcelas: 1, mesInicio: 1, anoInicio: 2026, fixa: false, diaVencimento: null, debitoAutomatico: false, pagoMeses: {}, split: [], repasses: {}, createdAt: 'l03a' },
      { id: 'l03b', desc: 'antiga fixa', cat: 'geral', subcat: 'Geral', cartao: 'dinheiro', conta: 'c1', valor: 80, parcelas: 1, mesInicio: 1, anoInicio: 2026, fixa: true, diaVencimento: 5, debitoAutomatico: false, pagoMeses: {}, split: [], repasses: {}, createdAt: 'l03b' },
    ],
  });
  await loadState(raw);
  const all = await page.evaluate(() => {
    // "Abrir e salvar sem editar" — call migrateState() again (the function
    // that runs on every load, including a save round-trip) without touching
    // any despesa in between.
    migrateState();
    return state.despesas.map((d) => ({ id: d.id, dataCompra: d.dataCompra }));
  });
  const noneInvented = all.every((d) => d.dataCompra === null);
  return { ok: noneInvented, detail: JSON.stringify(all) };
}, 'abrir e salvar backup antigo sem editar despesas → nenhuma dataCompra inventada automaticamente (todas continuam null)');

// G1-L04: editing a non-temporal field (desc) of a legacy despesa through the
// REAL edit-despesa modal + save path must leave it legacy (dataCompra still
// null) and must not change its invoice competência.
await check('G1-L04', async () => {
  const raw = baseSyntheticState({
    despesas: [
      { id: 'l04', desc: 'nome antigo', cat: 'geral', subcat: 'Geral', cartao: 'nu', conta: null, valor: 120, parcelas: 1, mesInicio: 9, anoInicio: 2026, fixa: false, diaVencimento: null, debitoAutomatico: false, pagoMeses: {}, split: [], repasses: {}, createdAt: 'l04' },
    ],
  });
  await loadState(raw);
  const before = await page.evaluate(() => {
    const d = state.despesas.find((x) => x.id === 'l04');
    return { dataCompra: d.dataCompra, competencia: getCompetenciaFatura(d.dataCompra, state.cards.find((c) => c.id === d.cartao), d.mesInicio, d.anoInicio) };
  });
  const after = await page.evaluate(() => {
    openEditDespesa('l04'); // renders the real edit modal into #modalBody
    document.getElementById('eDespDesc').value = 'nome novo (só troquei a descrição)';
    saveEditDespesa('l04');
    const d = state.despesas.find((x) => x.id === 'l04');
    return { desc: d.desc, dataCompra: d.dataCompra, mesInicio: d.mesInicio, anoInicio: d.anoInicio,
      competencia: getCompetenciaFatura(d.dataCompra, state.cards.find((c) => c.id === d.cartao), d.mesInicio, d.anoInicio) };
  });
  const ok = after.desc.includes('nome novo') && after.dataCompra === null
    && after.competencia.mes === before.competencia.mes && after.competencia.ano === before.competencia.ano;
  return { ok, detail: `antes=${JSON.stringify(before)}, depois=${JSON.stringify(after)}` };
}, 'editar só a descrição de uma despesa legada (via openEditDespesa/saveEditDespesa reais) → continua legada (dataCompra=null), competência da fatura não muda');

await close();

const fails = results.filter((r) => r.status === 'FAIL').length;
console.log(`\nlegacy.test.mjs: TOTAL=${results.length} PASS=${results.length - fails} FAIL=${fails}`);
if (fails > 0) process.exitCode = 1;

export { results };
