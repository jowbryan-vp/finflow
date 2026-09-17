// Gate 3 — seção 46: retirada extraordinária (OX01-OX05) — separada
// explicitamente do repasse planejado e nunca mascarada como salário.
import { openHarness, makeRunner, baseSyntheticState } from './harness.mjs';

const { page, loadState, close } = await openHarness();
const { check, results } = makeRunner('gate3-extraordinary');

await loadState(baseSyntheticState({ contas: [{ id: 'c1', name: 'Conta Pessoal', color: '#5b7fff', saldoInicial: 200 }] }));
await page.evaluate(() => {
  state.office.contas.push({ id: 'oc1', name: 'Conta Escritório', color: '#ff9900', saldoInicial: 5000 });
});

await check('OX01', async () => {
  const r = await page.evaluate(() => {
    const saldoEscritorioAntes = getOfficeOperationalBalance();
    const saldoPessoalAntes = state.contas.reduce((s, c) => s + calcSaldoConta(c.id), 0);
    const transferId = createExtraordinaryWithdrawal(2500, '2026-09-17', 'oc1', 'c1', 'cobrir contas pessoais');
    const saldoEscritorioDepois = getOfficeOperationalBalance();
    const saldoPessoalDepois = state.contas.reduce((s, c) => s + calcSaldoConta(c.id), 0);
    return { transferId, saldoEscritorioAntes, saldoEscritorioDepois, saldoPessoalAntes, saldoPessoalDepois };
  });
  const ok = !!r.transferId
    && r.saldoEscritorioDepois === r.saldoEscritorioAntes - 2500
    && r.saldoPessoalDepois === r.saldoPessoalAntes + 2500;
  return { ok, detail: `retirada extraordinária de 2500 — escritório ${r.saldoEscritorioAntes}→${r.saldoEscritorioDepois} (esp. -2500), pessoal ${r.saldoPessoalAntes}→${r.saldoPessoalDepois} (esp. +2500)` };
}, 'retirada extraordinária: escritório -2500 / pessoal +2500 exatos, é imediata (não passa por estado previsto)');

await check('OX02', async () => {
  const r = await page.evaluate(() => {
    const receita = state.receitas.find((x) => x.origem === 'office_extraordinary_withdrawal');
    return { tipo: receita ? receita.tipo : null, origem: receita ? receita.origem : null, estado: receita ? receita.estado : null };
  });
  const ok = r.tipo === 'retirada_escritorio' && r.origem === 'office_extraordinary_withdrawal' && r.estado === 'recebido';
  return { ok, detail: `retirada extraordinária nunca é classificada como 'repasse_escritorio'/planejado nem como salário/renda recorrente — tipo=${r.tipo} (esp. retirada_escritorio), origem=${r.origem}, estado=${r.estado}` };
}, 'retirada extraordinária permanece identificável separadamente — nunca mascarada como repasse planejado ou salário');

await check('OX03', async () => {
  const r = await page.evaluate(() => {
    // Repasse planejado normal (via distribuição) e retirada extraordinária DEVEM coexistir sem se misturar.
    state.office.projetos.push({ id: 'p1', nome: 'Projeto A', cliente: 'Cliente A', valorContrato: 5000, status: 'contratado', dataContrato: '2026-09-01', observacao: '', createdAt: 'p1' });
    // Gate 3.1: os 3 destinos precisam estar preenchidos e somar 100.
    state.office.regrasDistribuicao.find((x) => x.destino === 'reserva').percentual = 50;
    state.office.regrasDistribuicao.find((x) => x.destino === 'impostos').percentual = 30;
    state.office.regrasDistribuicao.find((x) => x.destino === 'repasse_pessoal').percentual = 20;
    state.office.recebiveis.push({ id: 'rec1', projetoId: 'p1', descricao: 'Entrada', valor: 5000, estado: 'previsto', dataPrevista: '2026-10-01', dataRecebimento: null, contaDestino: 'oc1', createdAt: 'rec1' });
    syncDerivedPersonalTransfer('rec1');
    const repassePlanejado = state.office.repasses.find((rp) => rp.recebivelId === 'rec1');
    const qtdRetiradas = state.receitas.filter((x) => x.tipo === 'retirada_escritorio').length;
    const qtdRepassesPlanejados = state.receitas.filter((x) => x.tipo === 'repasse_escritorio').length;
    return { repassePlanejadoValor: repassePlanejado ? repassePlanejado.valor : null, qtdRetiradas, qtdRepassesPlanejados };
  });
  const ok = r.repassePlanejadoValor === 1000 && r.qtdRetiradas === 1 && r.qtdRepassesPlanejados === 1;
  return { ok, detail: `repasse planejado (5000×20%=1000) e retirada extraordinária (2500) coexistem sem se fundir — repasse planejado=${r.repassePlanejadoValor} (esp. 1000), qtd retiradas=${r.qtdRetiradas} (esp. 1), qtd repasses planejados=${r.qtdRepassesPlanejados} (esp. 1) — nunca um único 'repasse normal' de 3500`};
}, 'retirada extraordinária (2500) e repasse planejado (1000) nunca são fundidos em um único evento de 3500');

await check('OX04', async () => {
  const r = await page.evaluate(() => {
    const saldoEscritorioAntes = getOfficeOperationalBalance();
    const saldoPessoalAntes = state.contas.reduce((s, c) => s + calcSaldoConta(c.id), 0);
    const patrimonioAntes = saldoEscritorioAntes + saldoPessoalAntes;
    createExtraordinaryWithdrawal(1000, '2026-09-18', 'oc1', 'c1', 'segunda retirada');
    const saldoEscritorioDepois = getOfficeOperationalBalance();
    const saldoPessoalDepois = state.contas.reduce((s, c) => s + calcSaldoConta(c.id), 0);
    const patrimonioDepois = saldoEscritorioDepois + saldoPessoalDepois;
    return { patrimonioAntes, patrimonioDepois };
  });
  const ok = r.patrimonioAntes === r.patrimonioDepois;
  return { ok, detail: `retirada extraordinária é neutra no patrimônio consolidado (só move de um lado pro outro) — antes=${r.patrimonioAntes}, depois=${r.patrimonioDepois} (esp. iguais)` };
}, 'retirada extraordinária é neutra no patrimônio consolidado');

await check('OX05', async () => {
  const r = await page.evaluate(() => {
    const qtdRetiradas = state.receitas.filter((x) => x.origem === 'office_extraordinary_withdrawal').length;
    const todasComOrigem = state.receitas.filter((x) => x.origem === 'office_extraordinary_withdrawal').every((x) => !!x.officeTransferId);
    return { qtdRetiradas, todasComOrigem };
  });
  const ok = r.qtdRetiradas === 2 && r.todasComOrigem === true;
  return { ok, detail: `todas as retiradas extraordinárias (${r.qtdRetiradas}, esp. 2) carregam proveniência explícita (officeTransferId) — nunca duas retiradas soltas sem vínculo` };
}, 'cada retirada extraordinária carrega proveniência explícita e única (officeTransferId)');

await close();

const fails = results.filter((r) => r.status === 'FAIL').length;
console.log(`\ngate3-extraordinary.test.mjs: TOTAL=${results.length} PASS=${results.length - fails} FAIL=${fails}`);
if (fails > 0) process.exitCode = 1;

export { results };
