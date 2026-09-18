// Gate 5 — UAT: salário legado editado e marcado "Recorrente (mensal)" passa
// a ser convertido, NO MESMO REGISTRO, para o modelo recorrente atual
// (certeza + recorrencia + recebidoPorMes), tornando-se elegível ao seletor
// "Salário principal do ciclo". Usa os handlers reais (openEditReceita /
// saveEditReceita); nenhuma data de recebimento é inventada.
import { openHarness, makeRunner, baseSyntheticState } from './harness.mjs';

const { page, loadState, close } = await openHarness();
const { check, results } = makeRunner('gate5-salario-legacy-conversion');

async function setup(extraRecs = []) {
  await loadState(baseSyntheticState());
  await page.evaluate((extra) => {
    state.receitas.push({ id: 'leg', tipo: 'salario', nome: 'Salário Antigo', valor: 5000, mes: 5, ano: 2026,
      conta: 'c1', recorrente: false, recebidaMeses: {}, createdAt: 'leg' });
    extra.forEach((r) => state.receitas.push(r));
  }, extraRecs);
}
// Abre o modal real, ajusta campos e chama o handler real de salvar.
function edit(id, { recorrente, dates = {}, valor, tipo } = {}) {
  return page.evaluate(({ id, recorrente, dates, valor, tipo }) => {
    openEditReceita(id);
    if (tipo !== undefined) document.getElementById('eRecTipo').value = tipo;
    if (valor !== undefined) document.getElementById('eRecValor').value = valor;
    if (recorrente !== undefined) { document.getElementById('eRecFixo').checked = recorrente; onERecFixoChange(); }
    document.querySelectorAll('.eRecLegacyData').forEach((el) => { if (dates[el.dataset.mk] !== undefined) el.value = dates[el.dataset.mk]; });
    const box = document.getElementById('eRecConversaoBox');
    const boxVisible = !!box && box.style.display !== 'none';
    const modalText = document.getElementById('modalBody').textContent;
    saveEditReceita(id);
    return { boxVisible, modalText };
  }, { id, recorrente, dates, valor, tipo });
}
const snap = () => page.evaluate(() => ({
  n: state.receitas.length, saldo: calcSaldoConta('c1'),
  r: JSON.parse(JSON.stringify(state.receitas.find((x) => x.id === 'leg'))),
  cycle: getCurrentFinancialCycle('2026-09-15'),
}));

await check('LEGSAL_01_02_03', async () => {
  await setup();
  const antes = await snap();
  const ui = await edit('leg', { recorrente: true });
  const d = await snap();
  const r = d.r;
  const ok = r.id === 'leg' && d.n === antes.n && r.certeza === 'recorrente' && r.tipo === 'salario'
    && r.recorrencia && r.recorrencia.type === 'last_weekday_of_month' && r.recorrencia.weekday === 5
    && r.recebidoPorMes && Object.keys(r.recebidoPorMes).length === 0
    && r.competenciaMes === 5 && r.competenciaAno === 2026 && r.nome === 'Salário Antigo' && r.valor === 5000
    && r.conta === 'c1' && r.createdAt === 'leg' && r.recorrente === true
    && ui.boxVisible && ui.modalText.includes('sem criar uma receita duplicada');
  return { ok, detail: JSON.stringify({ id: r.id, n: d.n, certeza: r.certeza, rec: r.recorrencia }) };
}, 'mesmo id, mesma quantidade, campos do modelo atual, campos originais preservados, aviso na UI');

await check('LEGSAL_04', async () => {
  await setup();
  await edit('leg', { recorrente: true });
  const d = await page.evaluate(() => {
    renderDashboard();
    const opts = [...document.querySelectorAll('#primarySalarySelect option')].map((o) => o.value);
    return { opts, sel: document.getElementById('primarySalarySelect').textContent };
  });
  return { ok: d.opts.includes('leg') && !d.sel.includes('Nenhum salário recorrente'), detail: JSON.stringify(d.opts) };
}, 'salário convertido aparece no seletor do Dashboard (sem "Nenhum salário recorrente")');

await check('LEGSAL_05_06', async () => {
  await setup();
  await edit('leg', { recorrente: true });
  const d = await snap();
  const naoInventou = JSON.stringify(d.r.recebidoPorMes) === '{}' && d.r.dataRecebimento === undefined && d.r.estado === undefined;
  return { ok: naoInventou && d.cycle.cycleUnavailable === true && d.cycle.selectionRequired !== true, detail: JSON.stringify(d.cycle) };
}, 'nenhuma data/recebido inventado; sem data real o ciclo permanece indisponível (único salário: seleção automática)');

await check('LEGSAL_07_08_09', async () => {
  await setup();
  const antes = await snap();
  await edit('leg', { recorrente: true });
  const conv = await snap();
  const semMudarSaldo = conv.saldo === antes.saldo;
  // Usuário informa a data real via fluxo existente de confirmação.
  const d = await page.evaluate(() => {
    currentMonth = 8; currentYear = 2026;
    toggleReceitaRecebida('leg');
    document.getElementById('confRecDataRecebimento').value = '2026-08-28';
    confirmarReceitaRecebidaComData('leg');
    confirmarReceitaRecebidaComData('leg'); // repetir não duplica
    return { saldo: calcSaldoConta('c1'), cycle: getCurrentFinancialCycle('2026-09-15'), n: state.receitas.length,
      rpm: JSON.parse(JSON.stringify(state.receitas[0].recebidoPorMes)) };
  });
  const ok = semMudarSaldo && d.saldo === antes.saldo + 5000 && d.cycle.cycleUnavailable !== true
    && d.cycle.startDate === '2026-08-28' && d.n === 1 && Object.keys(d.rpm).length === 1;
  return { ok, detail: `saldo ${antes.saldo}->${conv.saldo}->${d.saldo}, ciclo=${JSON.stringify(d.cycle)}` };
}, 'converter não altera saldo; data real explícita gera ciclo e entra no caixa exatamente uma vez');

await check('LEGSAL_LEGACY_RECEIVED', async () => {
  await setup();
  await page.evaluate(() => { state.receitas[0].recebidaMeses = { '2026-07': true, '2026-06': false }; });
  const antes = await snap();
  // Sem data real para a competência já recebida: bloqueia, zero mutação.
  await edit('leg', { recorrente: true });
  const bloqueado = await snap();
  const zero = JSON.stringify(bloqueado.r) === JSON.stringify(antes.r) && bloqueado.saldo === antes.saldo;
  // Data inválida também bloqueia.
  await edit('leg', { recorrente: true, dates: { '2026-07': '2026-02-31' } });
  const invalido = await snap();
  const zero2 = invalido.r.certeza === undefined;
  // Data real válida: converte, saldo inalterado, histórico legado preservado.
  await edit('leg', { recorrente: true, dates: { '2026-07': '2026-07-31' } });
  const d = await snap();
  const ok = zero && zero2 && d.r.certeza === 'recorrente' && d.saldo === antes.saldo
    && d.r.recebidoPorMes['2026-07'].dataRecebimento === '2026-07-31' && Object.keys(d.r.recebidoPorMes).length === 1
    && d.r.recebidaMeses['2026-07'] === true && d.n === 1;
  return { ok, detail: `saldo ${antes.saldo}->${d.saldo}, rpm=${JSON.stringify(d.r.recebidoPorMes)}` };
}, 'competência legada já recebida exige data real; falha sem mutação; saldo preservado; recebidaMeses mantido');

await check('LEGSAL_10', async () => {
  await setup();
  await page.evaluate(() => { state.receitas[0].recebidaMeses = { '2026-07': true }; });
  await edit('leg', { recorrente: true, dates: { '2026-07': '2026-07-31' } });
  const r = await page.evaluate(() => {
    const before = JSON.parse(JSON.stringify(buildSaveObject()));
    migrateAppData(JSON.parse(JSON.stringify(before)));
    const after = JSON.parse(JSON.stringify(buildSaveObject()));
    const pick = (o) => o.perfis[o.perfilAtivo].data.receitas;
    return { a: pick(before), b: pick(after) };
  });
  return { ok: JSON.stringify(r.a) === JSON.stringify(r.b) && r.b[0].certeza === 'recorrente' && r.b[0].id === 'leg', detail: JSON.stringify(r.b[0]) };
}, 'exportação/importação preserva o salário convertido');

await check('LEGSAL_11_14', async () => {
  await setup();
  await edit('leg', { recorrente: true });
  const a = await snap();
  // Edição posterior abre o editor do novo modelo; não recria nem degrada.
  const ed = await page.evaluate(() => {
    openEditReceita('leg');
    document.getElementById('eRecNome2').value = 'Salário Renomeado';
    saveEditReceitaNovoModelo('leg');
    openEditReceita('leg'); saveEditReceitaNovoModelo('leg');
    const r = state.receitas.find((x) => x.id === 'leg');
    return { n: state.receitas.length, r: JSON.parse(JSON.stringify(r)) };
  });
  const ok = ed.n === 1 && ed.r.nome === 'Salário Renomeado' && ed.r.certeza === 'recorrente'
    && JSON.stringify(ed.r.recorrencia) === JSON.stringify(a.r.recorrencia) && ed.r.createdAt === 'leg' && ed.r.competenciaMes === 5;
  return { ok, detail: JSON.stringify(ed.r) };
}, 'salário já no modelo novo é idempotente após várias edições, sem duplicar');

await check('LEGSAL_12', async () => {
  const extras = [
    { id: 'ext', tipo: 'extra', nome: 'Extra', valor: 300, mes: 5, ano: 2026, conta: 'c1', recorrente: false, recebidaMeses: {}, createdAt: 'ext' },
    { id: 'rep', tipo: 'repasse', nome: 'Reembolso', valor: 100, mes: 5, ano: 2026, conta: 'c1', recorrente: false, recebidaMeses: {}, createdAt: 'rep' },
    { id: 'dec', tipo: 'decimo', nome: '13º', valor: 900, mes: 5, ano: 2026, conta: 'c1', recorrente: false, recebidaMeses: {}, createdAt: 'dec' },
  ];
  await setup(extras);
  for (const id of ['ext', 'rep', 'dec']) await edit(id, { recorrente: true });
  const depois = await page.evaluate(() => state.receitas.filter((r) => r.id !== 'leg'));
  const semModelo = depois.length === 3 && depois.every((r) => r.certeza === undefined && r.recorrencia === undefined);
  const legIntacto = await page.evaluate(() => state.receitas[0].certeza === undefined);
  // Trocar o tipo de outro tipo PARA salário na mesma edição também não converte.
  await edit('ext', { recorrente: true, tipo: 'salario' });
  const ext = await page.evaluate(() => state.receitas.find((r) => r.id === 'ext'));
  return { ok: semModelo && legIntacto && ext.certeza === undefined, detail: 'sem certeza/recorrencia nos demais' };
}, 'outros tipos de receita (e salários não editados) não são convertidos');

await check('LEGSAL_13', async () => {
  await setup();
  const antes = await snap();
  await edit('leg', { recorrente: true, valor: '0' });
  const d = await snap();
  const zero = JSON.stringify(d.r) === JSON.stringify(antes.r) && d.n === antes.n;
  // Desmarcado: só a flag muda, sem conversão.
  await edit('leg', { recorrente: false });
  const u = await snap();
  return { ok: zero && u.r.certeza === undefined && u.r.recorrente === false, detail: JSON.stringify(u.r) };
}, 'valor inválido bloqueia antes de qualquer mutação; sem marcar recorrente não converte');

await check('LEGSAL_15', async () => {
  await setup([{ id: 'leg2', tipo: 'salario', nome: 'Outro', valor: 100, mes: 5, ano: 2026, conta: 'c1', recorrente: false, recebidaMeses: {}, createdAt: 'leg2' }]);
  const r = await page.evaluate(() => {
    setFinancialPreference('primarySalaryId', 'leg'); // ainda legado: rejeitado
    const a = state.financialPreferences?.primarySalaryId || null;
    setFinancialPreference('primarySalaryId', 'inexistente');
    const b = state.financialPreferences?.primarySalaryId || null;
    return { a, b };
  });
  await edit('leg', { recorrente: true });
  await edit('leg2', { recorrente: true });
  const r2 = await page.evaluate(() => {
    const semEscolha = getCurrentFinancialCycle('2026-09-15');
    setFinancialPreference('primarySalaryId', 'leg');
    const p = state.financialPreferences.primarySalaryId;
    setFinancialPreference('primarySalaryId', 'nada');
    return { semEscolha, p, depois: state.financialPreferences.primarySalaryId };
  });
  const ok = r.a === null && r.b === null && r2.semEscolha.selectionRequired === true && r2.p === 'leg' && r2.depois === 'leg';
  return { ok, detail: JSON.stringify({ r, r2 }) };
}, 'primarySalaryId nunca aponta a registro inexistente/inelegível; com 2 elegíveis exige seleção explícita');

await close();

const fails = results.filter((r) => r.status === 'FAIL').length;
console.log(`\ngate5-salario-legacy-conversion.test.mjs: TOTAL=${results.length} PASS=${results.length - fails} FAIL=${fails}`);
if (fails > 0) process.exitCode = 1;

export { results };
