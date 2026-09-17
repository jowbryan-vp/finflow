// Gate 2 — seção 40: export → import → export preserva os novos campos
// semânticos intactos, sem inventar nada durante a importação.
import { openHarness, makeRunner, baseSyntheticState } from './harness.mjs';

const { page, loadState, close } = await openHarness();
const { check, results } = makeRunner('gate2-import-export');

await loadState(baseSyntheticState({
  cofrinhos: [{ id: 'cof1', name: 'Reserva', color: '#38e2b4', saldoInicial: 0 }],
}));

await page.evaluate(() => {
  // Receita nova — evento único (projeto).
  state.receitas.push({ id: 'exp1', tipo: 'projeto', nome: 'Projeto Export', valor: 1234.56, mes: 10, ano: 2026,
    competenciaMes: 10, competenciaAno: 2026, conta: 'c1', certeza: 'contratado', estado: 'recebido',
    dataPrevista: '2026-10-15', dataRecebimento: '2026-10-14', createdAt: 'exp1' });
  // Receita nova — salário recorrente, com uma competência já recebida.
  state.receitas.push({ id: 'exp2', tipo: 'salario', nome: 'Salário', valor: 5000, mes: 8, ano: 2026,
    competenciaMes: 8, competenciaAno: 2026, conta: 'c1', certeza: 'recorrente',
    recorrencia: { type: 'last_weekday_of_month', weekday: 5 },
    recebidoPorMes: { '2026-08': { estado: 'recebido', dataRecebimento: '2026-08-28' } }, createdAt: 'exp2' });
  // Resgate novo de cofrinho, com motivoResgate.
  const movId = uid();
  state.movimentacoesCofrinhos.push({ id: movId, cofrinhoId: 'cof1', valor: 300, mes: 9, ano: 2026, tipo: 'resgate', motivoResgate: 'cobertura_caixa', createdAt: uid() });
  state.movimentacoesContas.push({ id: movId, contaId: 'c1', valor: 300, data: new Date().toISOString(), obs: 'Resgate do cofrinho: Reserva' });
  // Transferência entre contas.
  const tId = uid();
  state.movimentacoesContas.push({ id: uid(), contaId: 'c1', valor: -50, data: new Date().toISOString(), transferId: tId });
});

const r = await page.evaluate(() => {
  const antes = buildSaveObject();
  const antesJson = JSON.parse(JSON.stringify(antes)); // simula export -> arquivo -> disco

  // "import": exatamente o que importData() faz, sem passar pelo <input type=file>.
  migrateAppData(antesJson);

  const depois = buildSaveObject();
  const depoisJson = JSON.parse(JSON.stringify(depois)); // simula um segundo export

  const pAntes = antesJson.perfis[antesJson.perfilAtivo].data;
  const pDepois = depoisJson.perfis[depoisJson.perfilAtivo].data;

  const rExp1Antes = pAntes.receitas.find((x) => x.id === 'exp1');
  const rExp1Depois = pDepois.receitas.find((x) => x.id === 'exp1');
  const rExp2Antes = pAntes.receitas.find((x) => x.id === 'exp2');
  const rExp2Depois = pDepois.receitas.find((x) => x.id === 'exp2');
  const movCofAntes = pAntes.movimentacoesCofrinhos.find((m) => m.tipo === 'resgate' && m.motivoResgate === 'cobertura_caixa');
  const movCofDepois = pDepois.movimentacoesCofrinhos.find((m) => m.tipo === 'resgate' && m.motivoResgate === 'cobertura_caixa');
  const transfAntes = pAntes.movimentacoesContas.filter((m) => m.transferId).length;
  const transfDepois = pDepois.movimentacoesContas.filter((m) => m.transferId).length;

  return {
    projetoIgual: JSON.stringify(rExp1Antes) === JSON.stringify(rExp1Depois),
    salarioIgual: JSON.stringify(rExp2Antes) === JSON.stringify(rExp2Depois),
    motivoResgatePreservado: !!movCofAntes && !!movCofDepois && movCofAntes.motivoResgate === movCofDepois.motivoResgate,
    transferenciasPreservadas: transfAntes === transfDepois && transfAntes > 0,
    camposNovosPresentes: rExp1Depois.certeza === 'contratado' && rExp1Depois.estado === 'recebido' && rExp1Depois.dataRecebimento === '2026-10-14'
      && rExp2Depois.certeza === 'recorrente' && !!rExp2Depois.recorrencia && !!rExp2Depois.recebidoPorMes['2026-08'],
  };
});

await check('import-export-01', () => r.projetoIgual, 'receita de projeto (evento único novo modelo) idêntica após export → import → export');
await check('import-export-02', () => r.salarioIgual, 'salário recorrente novo modelo (com recebidoPorMes) idêntico após export → import → export');
await check('import-export-03', () => r.motivoResgatePreservado, 'motivoResgate de um resgate novo é preservado no round-trip');
await check('import-export-04', () => r.transferenciasPreservadas, 'transferências (transferId) preservadas no round-trip');
await check('import-export-05', () => r.camposNovosPresentes, 'todos os campos semânticos novos (certeza, estado, dataRecebimento, recorrencia, recebidoPorMes) sobrevivem ao round-trip sem serem inventados nem perdidos');

await close();

const fails = results.filter((x) => x.status === 'FAIL').length;
console.log(`\ngate2-import-export.test.mjs: TOTAL=${results.length} PASS=${results.length - fails} FAIL=${fails}`);
if (fails > 0) process.exitCode = 1;

export { results };
