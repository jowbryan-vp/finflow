// Gate 3 — seção 47: projetos (PJ01-PJ05) — potencial ≠ recebível
// contratado, e nunca gera caixa ou repasse automático sem ser 'contratado'.
import { openHarness, makeRunner, baseSyntheticState } from './harness.mjs';

const { page, loadState, close } = await openHarness();
const { check, results } = makeRunner('gate3-projects');

await loadState(baseSyntheticState());
await page.evaluate(() => {
  state.office.contas.push({ id: 'oc1', name: 'Conta Escritório', color: '#ff9900', saldoInicial: 0 });
  // Regra de repasse_pessoal configurada (20%) — necessária pra PJ04 exercitar de fato a geração.
  // Gate 3.1: os 3 destinos precisam estar preenchidos e somar 100.
  state.office.regrasDistribuicao.find((r) => r.destino === 'reserva').percentual = 40;
  state.office.regrasDistribuicao.find((r) => r.destino === 'impostos').percentual = 40;
  state.office.regrasDistribuicao.find((r) => r.destino === 'repasse_pessoal').percentual = 20;
});

await check('PJ01', async () => {
  const r = await page.evaluate(() => {
    state.office.projetos.push({ id: 'p1', nome: 'Projeto Potencial', cliente: 'Cliente X', valorContrato: 10000, status: 'potencial', dataContrato: null, observacao: '', createdAt: 'p1' });
    return { operacional: getOfficeOperationalBalance() };
  });
  const ok = r.operacional === 0;
  return { ok, detail: `projeto potencial (contrato R$10000) cadastrado — saldo operacional=${r.operacional} (esp. 0)` };
}, 'projeto potencial não gera caixa');

await check('PJ02', async () => {
  const r = await page.evaluate(() => {
    // Mesmo com um recebível hipotético vinculado a um projeto potencial, nenhum repasse é gerado.
    state.office.recebiveis.push({ id: 'rp1', projetoId: 'p1', descricao: 'Entrada (hipotética)', valor: 2000, estado: 'previsto', dataPrevista: '2026-10-01', dataRecebimento: null, contaDestino: 'oc1', createdAt: 'rp1' });
    syncDerivedPersonalTransfer('rp1');
    const repasse = state.office.repasses.find((rp) => rp.recebivelId === 'rp1');
    const receita = state.receitas.find((x) => x.officeTransferId === 'off_rp1');
    return { temRepasse: !!repasse, temReceita: !!receita };
  });
  const ok = r.temRepasse === false && r.temReceita === false;
  return { ok, detail: `recebível de projeto potencial → repasse gerado=${r.temRepasse}, receita gerada=${r.temReceita} (esp. false, false)` };
}, 'projeto potencial não gera automaticamente repasse pessoal, mesmo com recebível e regra configurada');

await check('PJ03', async () => {
  const r = await page.evaluate(() => {
    state.office.projetos.push({ id: 'p2', nome: 'Projeto Contratado Sem Recebível', cliente: 'Cliente Y', valorContrato: 8000, status: 'contratado', dataContrato: '2026-09-01', observacao: '', createdAt: 'p2' });
    return { operacional: getOfficeOperationalBalance() };
  });
  const ok = r.operacional === 0;
  return { ok, detail: `projeto contratado (R$8000) sem nenhum recebível cadastrado — saldo operacional=${r.operacional} (esp. 0)` };
}, 'projeto contratado sem recebível não gera caixa');

await check('PJ04', async () => {
  const r = await page.evaluate(() => {
    state.office.recebiveis.push({ id: 'rp2', projetoId: 'p2', descricao: 'Entrada', valor: 2000, estado: 'previsto', dataPrevista: '2026-10-15', dataRecebimento: null, contaDestino: 'oc1', createdAt: 'rp2' });
    syncDerivedPersonalTransfer('rp2');
    const operacional = getOfficeOperationalBalance();
    const repasse = state.office.repasses.find((rp) => rp.recebivelId === 'rp2');
    const receita = state.receitas.find((x) => x.officeTransferId === 'off_rp2');
    return { operacional, repasseValor: repasse ? repasse.valor : null, repasseEstado: repasse ? repasse.estado : null, receitaEstado: receita ? receita.estado : null };
  });
  const ok = r.operacional === 0 && r.repasseValor === 400 && r.repasseEstado === 'previsto' && r.receitaEstado === 'previsto';
  return { ok, detail: `recebível previsto (2000) de projeto contratado, regra 20% → operacional=${r.operacional} (esp. 0), repasse gerado=${r.repasseValor} (esp. 400) estado=${r.repasseEstado} (esp. previsto), receita pessoal estado=${r.receitaEstado} (esp. previsto)` };
}, 'projeto contratado com recebível previsto gera somente previsão (repasse previsto), nunca caixa real');

await check('PJ05', async () => {
  const r = await page.evaluate(() => {
    const p2 = state.office.projetos.find((p) => p.id === 'p2');
    p2.status = 'cancelado';
    (state.office.recebiveis || []).filter((rec) => rec.projetoId === 'p2').forEach((rec) => syncDerivedPersonalTransfer(rec.id));
    const repasse = state.office.repasses.find((rp) => rp.recebivelId === 'rp2');
    const receita = state.receitas.find((x) => x.officeTransferId === 'off_rp2');
    return { repasseEstado: repasse ? repasse.estado : null, receitaEstado: receita ? receita.estado : null };
  });
  const ok = r.repasseEstado === 'cancelado' && r.receitaEstado === 'cancelado';
  return { ok, detail: `projeto cancelado → repasse derivado estado=${r.repasseEstado} (esp. cancelado), receita estado=${r.receitaEstado} (esp. cancelado) — nenhuma nova previsão gerada` };
}, 'projeto cancelado não gera novas previsões — a previsão já existente é invalidada, nunca criada de novo');

await close();

const fails = results.filter((r) => r.status === 'FAIL').length;
console.log(`\ngate3-projects.test.mjs: TOTAL=${results.length} PASS=${results.length - fails} FAIL=${fails}`);
if (fails > 0) process.exitCode = 1;

export { results };
