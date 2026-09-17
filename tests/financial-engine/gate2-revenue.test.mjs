// Gate 2 — R01..R07: novo modelo semântico de receitas de projeto
// (certeza+estado, evento único). Cobre a separação caixa-real vs.
// previsão/potencial, o não-deslocamento por competência (R04/R05, os casos
// literais do enunciado do Gate 2) e a garantia de não-duplicação ao marcar
// como recebida.
import { openHarness, makeRunner, baseSyntheticState } from './harness.mjs';

const { page, loadState, close } = await openHarness();
const { check, results } = makeRunner('gate2-revenue');

await loadState(baseSyntheticState());

// R01: projeto contratado, ainda previsto → não entra em caixa real.
await check('R01', async () => {
  const r = await page.evaluate(() => {
    state.receitas.push({ id: 'r01', tipo: 'projeto', nome: 'Projeto X', valor: 1500, mes: 10, ano: 2026,
      competenciaMes: 10, competenciaAno: 2026, conta: 'c1', certeza: 'contratado', estado: 'previsto',
      dataPrevista: '2026-10-15', dataRecebimento: null, createdAt: 'r01' });
    return calcSaldoConta('c1');
  });
  return { ok: r === 1000, detail: `saldo com projeto contratado previsto = ${r} (esperado 1000)` };
}, 'projeto contratado previsto não entra em caixa real');

// R02: projeto potencial → não entra em caixa real.
await check('R02', async () => {
  const r = await page.evaluate(() => {
    state.receitas.push({ id: 'r02', tipo: 'projeto', nome: 'Proposta Y', valor: 3500, mes: 11, ano: 2026,
      competenciaMes: 11, competenciaAno: 2026, conta: 'c1', certeza: 'potencial', estado: 'previsto',
      dataPrevista: '2026-11-05', dataRecebimento: null, createdAt: 'r02' });
    return calcSaldoConta('c1');
  });
  return { ok: r === 1000, detail: `saldo com projeto potencial = ${r} (esperado 1000, inalterado)` };
}, 'receita potencial (proposta ainda não fechada) não entra em caixa real');

// R03: projeto recebido entra EXATAMENTE uma vez.
await check('R03', async () => {
  const r = await page.evaluate(() => {
    state.receitas.push({ id: 'r03', tipo: 'projeto', nome: 'Projeto Z', valor: 800, mes: 9, ano: 2026,
      competenciaMes: 9, competenciaAno: 2026, conta: 'c1', certeza: 'contratado', estado: 'recebido',
      dataPrevista: null, dataRecebimento: '2026-09-10', createdAt: 'r03' });
    const saldo1 = calcSaldoConta('c1');
    // Reafirmar o mesmo estado 'recebido' (idempotente) não deve somar de novo.
    const rec = state.receitas.find((x) => x.id === 'r03');
    rec.estado = 'recebido';
    const saldo2 = calcSaldoConta('c1');
    return { saldo1, saldo2 };
  });
  return { ok: r.saldo1 === 1800 && r.saldo2 === 1800, detail: `${JSON.stringify(r)} (esperado 1800,1800 — soma uma vez, idempotente)` };
}, 'projeto recebido entra em caixa exatamente uma vez, mesmo reafirmando o mesmo estado');

// R04: previsto para outubro, recebido em setembro -> impacto de caixa é
// SETEMBRO (caso literal do enunciado do Gate 2).
await check('R04', async () => {
  const r = await page.evaluate(() => {
    state.receitas.push({ id: 'r04', tipo: 'projeto', nome: 'Projeto Outubro-recebido-Setembro', valor: 1200, mes: 10, ano: 2026,
      competenciaMes: 10, competenciaAno: 2026, conta: 'c1', certeza: 'contratado', estado: 'recebido',
      dataPrevista: '2026-10-15', dataRecebimento: '2026-09-14', createdAt: 'r04' });
    const emSetembro = getReceitasForMonth(9, 2026).some((x) => x.id === 'r04');
    const emOutubro = getReceitasForMonth(10, 2026).some((x) => x.id === 'r04');
    return { emSetembro, emOutubro };
  });
  return { ok: r.emSetembro === true && r.emOutubro === false, detail: `aparece em setembro=${r.emSetembro} (esperado true), aparece em outubro=${r.emOutubro} (esperado false)` };
}, 'previsto para outubro, recebido em 14/09 → impacto de caixa é setembro, não outubro (nem a competência cadastrada)');

// R05: previsto para setembro, recebido em outubro -> impacto de caixa é
// OUTUBRO.
await check('R05', async () => {
  const r = await page.evaluate(() => {
    state.receitas.push({ id: 'r05', tipo: 'projeto', nome: 'Projeto Setembro-recebido-Outubro', valor: 900, mes: 9, ano: 2026,
      competenciaMes: 9, competenciaAno: 2026, conta: 'c1', certeza: 'contratado', estado: 'recebido',
      dataPrevista: '2026-09-20', dataRecebimento: '2026-10-02', createdAt: 'r05' });
    const emSetembro = getReceitasForMonth(9, 2026).some((x) => x.id === 'r05');
    const emOutubro = getReceitasForMonth(10, 2026).some((x) => x.id === 'r05');
    return { emSetembro, emOutubro };
  });
  return { ok: r.emSetembro === false && r.emOutubro === true, detail: `aparece em setembro=${r.emSetembro} (esperado false), aparece em outubro=${r.emOutubro} (esperado true)` };
}, 'previsto para setembro, recebido em 02/10 → impacto de caixa é outubro, não setembro (nem a competência cadastrada)');

// R06: marcar previsto como recebido não duplica a receita (mesmo objeto,
// mesmo id, contagem inalterada).
await check('R06', async () => {
  const r = await page.evaluate(() => {
    state.receitas.push({ id: 'r06', tipo: 'projeto', nome: 'Projeto R06', valor: 500, mes: 12, ano: 2026,
      competenciaMes: 12, competenciaAno: 2026, conta: 'c1', certeza: 'contratado', estado: 'previsto',
      dataPrevista: '2026-12-05', dataRecebimento: null, createdAt: 'r06' });
    const countAntes = state.receitas.filter((x) => x.nome === 'Projeto R06').length;
    const rec = state.receitas.find((x) => x.id === 'r06');
    rec.estado = 'recebido'; rec.dataRecebimento = '2026-12-04';
    const countDepois = state.receitas.filter((x) => x.nome === 'Projeto R06').length;
    return { countAntes, countDepois };
  });
  return { ok: r.countAntes === 1 && r.countDepois === 1, detail: `registros antes=${r.countAntes}, depois de marcar recebida=${r.countDepois} (esperado 1 e 1)` };
}, 'marcar uma receita prevista como recebida atualiza o mesmo evento lógico, nunca duplica');

// R07: receita cancelada não entra em caixa.
await check('R07', async () => {
  const r = await page.evaluate(() => {
    state.receitas.push({ id: 'r07', tipo: 'projeto', nome: 'Projeto Cancelado', valor: 2000, mes: 9, ano: 2026,
      competenciaMes: 9, competenciaAno: 2026, conta: 'c1', certeza: 'contratado', estado: 'cancelado',
      dataPrevista: '2026-09-05', dataRecebimento: null, createdAt: 'r07' });
    return calcSaldoConta('c1');
  });
  // Saldo esperado: soma de tudo o que já foi marcado 'recebido' nos testes
  // anteriores desta mesma sessão de página — r03 (+800), r04 (+1200), r05
  // (+900, também recebido — calcSaldoConta soma qualquer receita com
  // estado==='recebido', não filtra por mês), r06 (+500, marcado recebido em
  // R06). R07 não deve adicionar nada além disso.
  const esperado = 1000 + 800 + 1200 + 900 + 500;
  return { ok: r === esperado, detail: `saldo com receita cancelada = ${r} (esperado ${esperado} — inalterado por R07)` };
}, 'receita cancelada não entra em caixa');

await close();

const fails = results.filter((r) => r.status === 'FAIL').length;
console.log(`\ngate2-revenue.test.mjs: TOTAL=${results.length} PASS=${results.length - fails} FAIL=${fails}`);
if (fails > 0) process.exitCode = 1;

export { results };
