// Gate 3 — seção 52: export → import → export preserva state.office.* por
// completo (contas, projetos, recebíveis, despesas, reservas, regras de
// distribuição, repasses) e os campos de vínculo/proveniência
// (officeTransferId/origem) nas receitas pessoais derivadas.
import { openHarness, makeRunner, baseSyntheticState } from './harness.mjs';

const { page, loadState, close } = await openHarness();
const { check, results } = makeRunner('gate3-import-export');

await loadState(baseSyntheticState({ contas: [{ id: 'c1', name: 'C1', color: '#000', saldoInicial: 1000 }] }));

await page.evaluate(() => {
  state.office.ativo = true;
  state.office.contas.push({ id: 'oc1', name: 'Conta Escritório', color: '#ff9900', saldoInicial: 2000 });
  state.office.reservas.push({ id: 'or1', nome: 'Impostos', finalidade: 'impostos', color: '#5b7fff', saldoInicial: 300 });
  state.office.movimentacoesReservas.push({ id: 'movR1', reservaId: 'or1', valor: 300, mes: 9, ano: 2026, tipo: 'aplicacao', createdAt: 'movR1' });
  state.office.projetos.push({ id: 'p1', nome: 'Residência Export', cliente: 'Cliente Export', valorContrato: 12000, status: 'contratado', dataContrato: '2026-09-01', observacao: 'obs export', createdAt: 'p1' });
  state.office.despesas.push({ id: 'od1', descricao: 'Software', categoria: 'Software', valor: 150, data: '2026-09-10', conta: 'oc1', projetoId: 'p1', status: 'pago', createdAt: 'od1' });
  state.office.regrasDistribuicao.find((x) => x.destino === 'repasse_pessoal').percentual = 15;
  state.office.recebiveis.push({ id: 'rec1', projetoId: 'p1', descricao: 'Entrada', valor: 4000, estado: 'recebido', dataPrevista: '2026-09-20', dataRecebimento: '2026-09-22', contaDestino: 'oc1', createdAt: 'rec1' });
  syncDerivedPersonalTransfer('rec1');
  const repasse = state.office.repasses.find((rp) => rp.recebivelId === 'rec1');
  realizeOfficeTransfer(repasse.id, '2026-09-23', 'oc1', 'c1');
  // Uma retirada extraordinária também, pra garantir que ela sobrevive.
  createExtraordinaryWithdrawal(500, '2026-09-24', 'oc1', 'c1', 'emergência export');
});

const r = await page.evaluate(() => {
  const antes = buildSaveObject();
  const antesJson = JSON.parse(JSON.stringify(antes)); // simula export -> arquivo -> disco

  migrateAppData(antesJson); // "import": exatamente o que importData() faz

  const depois = buildSaveObject();
  const depoisJson = JSON.parse(JSON.stringify(depois)); // simula um segundo export

  const pAntes = antesJson.perfis[antesJson.perfilAtivo].data;
  const pDepois = depoisJson.perfis[depoisJson.perfilAtivo].data;

  const officeIgual = JSON.stringify(pAntes.office) === JSON.stringify(pDepois.office);

  const receitaRepasseAntes = pAntes.receitas.find((x) => x.officeTransferId === 'off_rec1');
  const receitaRepasseDepois = pDepois.receitas.find((x) => x.officeTransferId === 'off_rec1');
  const receitaRetiradaAntes = pAntes.receitas.find((x) => x.origem === 'office_extraordinary_withdrawal');
  const receitaRetiradaDepois = pDepois.receitas.find((x) => x.origem === 'office_extraordinary_withdrawal');

  return {
    officeIgual,
    officeAtivoPreservado: pDepois.office.ativo === true,
    qtdProjetos: pDepois.office.projetos.length,
    qtdRecebiveis: pDepois.office.recebiveis.length,
    qtdDespesas: pDepois.office.despesas.length,
    qtdReservas: pDepois.office.reservas.length,
    qtdRepasses: pDepois.office.repasses.length,
    regraPercentualPreservado: pDepois.office.regrasDistribuicao.find((x) => x.destino === 'repasse_pessoal').percentual === 15,
    receitaRepasseIgual: JSON.stringify(receitaRepasseAntes) === JSON.stringify(receitaRepasseDepois),
    receitaRepasseCamposPresentes: !!receitaRepasseDepois && receitaRepasseDepois.origem === 'office_distribution' && receitaRepasseDepois.officeTransferId === 'off_rec1' && receitaRepasseDepois.estado === 'recebido',
    receitaRetiradaIgual: JSON.stringify(receitaRetiradaAntes) === JSON.stringify(receitaRetiradaDepois),
    receitaRetiradaCamposPresentes: !!receitaRetiradaDepois && receitaRetiradaDepois.origem === 'office_extraordinary_withdrawal' && !!receitaRetiradaDepois.officeTransferId,
    // Idempotência do próprio round-trip: exportar de novo o resultado já
    // migrado dá exatamente o mesmo JSON (export -> import -> export é
    // idempotente, seção 52).
    exportIdempotenteNoRoundtrip: JSON.stringify(antesJson.perfis[antesJson.perfilAtivo].data.office) === JSON.stringify(depoisJson.perfis[depoisJson.perfilAtivo].data.office),
  };
});

await check('office-01', () => r.officeIgual, 'state.office completo (contas, projetos, recebíveis, despesas, reservas, movimentações, regras, repasses) idêntico após export → import → export');
await check('office-02', () => r.officeAtivoPreservado && r.qtdProjetos === 1 && r.qtdRecebiveis === 1 && r.qtdDespesas === 1 && r.qtdReservas === 1 && r.qtdRepasses === 1, 'todas as coleções do escritório preservam exatamente 1 registro cada (nada duplicado, nada perdido)');
await check('office-03', () => r.regraPercentualPreservado, 'regra de distribuição configurada (repasse_pessoal=15%) preservada — nunca resetada para null no round-trip');
await check('office-04', () => r.receitaRepasseIgual && r.receitaRepasseCamposPresentes, 'receita pessoal derivada do repasse (origem=office_distribution, officeTransferId=off_rec1, já recebida) preservada intacta');
await check('office-05', () => r.receitaRetiradaIgual && r.receitaRetiradaCamposPresentes, 'receita pessoal derivada da retirada extraordinária (origem=office_extraordinary_withdrawal + officeTransferId) preservada intacta');
await check('office-06', () => r.exportIdempotenteNoRoundtrip, 'export → import → export é idempotente para state.office (segunda exportação bit-a-bit igual à primeira)');

await close();

const fails = results.filter((x) => x.status === 'FAIL').length;
console.log(`\ngate3-import-export.test.mjs: TOTAL=${results.length} PASS=${results.length - fails} FAIL=${fails}`);
if (fails > 0) process.exitCode = 1;

export { results };
