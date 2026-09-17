// Gate 3 — padrão realista de uso do escritório (sem dados pessoais):
// projeto contratado → recebível recebido em parcelas → distribuição
// configurada (reserva + impostos + repasse pessoal) → repasse realizado →
// mais tarde, uma retirada extraordinária isolada cobre uma necessidade
// pontual, sem se misturar com o fluxo planejado de repasse.
import { openHarness, makeRunner, baseSyntheticState } from './harness.mjs';

const { page, loadState, close } = await openHarness();
const { check, results } = makeRunner('gate3-real-patterns');

await loadState(baseSyntheticState({ contas: [{ id: 'c1', name: 'Conta Pessoal', color: '#5b7fff', saldoInicial: 600 }] }));

await check('padrao-projeto-com-distribuicao-completa', async () => {
  const r = await page.evaluate(() => {
    state.office.contas.push({ id: 'oc1', name: 'Conta Escritório', color: '#ff9900', saldoInicial: 0 });
    state.office.reservas.push({ id: 'orImpostos', nome: 'Reserva de Impostos', finalidade: 'impostos', color: '#5b7fff', saldoInicial: 0 });
    state.office.reservas.push({ id: 'orCapGiro', nome: 'Capital de Giro', finalidade: 'capital_de_giro', color: '#38e2b4', saldoInicial: 0 });

    // Regra de distribuição configurada pelo usuário (nunca inventada):
    // 10% reserva, 65% impostos, 25% repasse pessoal — soma exatamente 100%
    // (Gate 3.1: uma configuração completa precisa alocar 100% do recebível
    // entre os 3 destinos, sem sobra implícita).
    state.office.regrasDistribuicao = [
      { destino: 'reserva', percentual: 10 },
      { destino: 'impostos', percentual: 65 },
      { destino: 'repasse_pessoal', percentual: 25 },
    ];

    // Projeto contratado com um cliente (dados fictícios).
    state.office.projetos.push({ id: 'pj1', nome: 'Reforma Comercial', cliente: 'Cliente Fictício', valorContrato: 20000, status: 'contratado', dataContrato: '2026-08-01', observacao: '', createdAt: 'pj1' });

    // Primeira parcela (entrada): prevista em 10/09, recebida de fato em 15/09.
    state.office.recebiveis.push({ id: 'rc1', projetoId: 'pj1', descricao: 'Entrada (40%)', valor: 8000, estado: 'previsto', dataPrevista: '2026-09-10', dataRecebimento: null, contaDestino: 'oc1', createdAt: 'rc1' });
    const antesDoRecebimento = getOfficeOperationalBalance();
    const rc1 = state.office.recebiveis.find((x) => x.id === 'rc1');
    rc1.estado = 'recebido'; rc1.dataRecebimento = '2026-09-15'; // data real ≠ prevista (mesma disciplina do Gate 2.1)
    const depoisDoRecebimento = getOfficeOperationalBalance();

    // Distribuição: só o repasse_pessoal gera vínculo automático com o
    // pessoal (reserva/impostos ficam só como cálculo informativo — este
    // Gate não implementa movimentação automática pra reserva/impostos,
    // apenas o repasse pessoal, conforme a arquitetura decidida).
    syncDerivedPersonalTransfer('rc1');
    const repasse = state.office.repasses.find((rp) => rp.recebivelId === 'rc1');
    const receitaPessoal = state.receitas.find((x) => x.officeTransferId === 'off_rc1');
    const saldoPessoalAntesRealizar = state.contas.reduce((s, c) => s + calcSaldoConta(c.id), 0);

    // O escritório efetivamente transfere ao Jow.
    realizeOfficeTransfer(repasse.id, '2026-09-16', 'oc1', 'c1');
    const saldoPessoalDepoisRealizar = state.contas.reduce((s, c) => s + calcSaldoConta(c.id), 0);
    const saldoEscritorioFinal = getOfficeOperationalBalance();

    return {
      antesDoRecebimento, depoisDoRecebimento,
      repasseValor: repasse.valor, receitaPessoalValor: receitaPessoal.valor, receitaPessoalOrigem: receitaPessoal.origem,
      saldoPessoalAntesRealizar, saldoPessoalDepoisRealizar, saldoEscritorioFinal,
    };
  });
  const ok = r.antesDoRecebimento === 0 && r.depoisDoRecebimento === 8000
    && r.repasseValor === 2000 && r.receitaPessoalValor === 2000 && r.receitaPessoalOrigem === 'office_distribution'
    && r.saldoPessoalDepoisRealizar === r.saldoPessoalAntesRealizar + 2000
    && r.saldoEscritorioFinal === 6000; // 8000 recebidos - 2000 repassados
  return { ok, detail: JSON.stringify(r) };
}, 'projeto contratado → entrada recebida na data real → distribuição configurada (25% repasse) → repasse pessoal realizado corretamente');

await check('padrao-retirada-extraordinaria-nao-se-mistura-ao-fluxo-planejado', async () => {
  const r = await page.evaluate(() => {
    // Meses depois, uma necessidade pontual pessoal surge e o Jow retira
    // parte do caixa operacional do escritório — precisa ficar
    // explicitamente separado do fluxo de repasse planejado já existente.
    const saldoEscritorioAntes = getOfficeOperationalBalance();
    const qtdRepassesPlanejadosAntes = state.receitas.filter((x) => x.tipo === 'repasse_escritorio').length;
    const transferId = createExtraordinaryWithdrawal(1200, '2026-11-03', 'oc1', 'c1', 'reforma da própria casa');
    const saldoEscritorioDepois = getOfficeOperationalBalance();
    const qtdRepassesPlanejadosDepois = state.receitas.filter((x) => x.tipo === 'repasse_escritorio').length;
    const qtdRetiradas = state.receitas.filter((x) => x.tipo === 'retirada_escritorio').length;
    const retirada = state.receitas.find((x) => x.officeTransferId === transferId);
    return {
      saldoEscritorioAntes, saldoEscritorioDepois, qtdRepassesPlanejadosAntes, qtdRepassesPlanejadosDepois, qtdRetiradas,
      retiradaTipo: retirada.tipo, retiradaOrigem: retirada.origem,
    };
  });
  const ok = r.saldoEscritorioDepois === r.saldoEscritorioAntes - 1200
    && r.qtdRepassesPlanejadosAntes === r.qtdRepassesPlanejadosDepois // não cria nem altera nenhum repasse planejado
    && r.qtdRetiradas === 1
    && r.retiradaTipo === 'retirada_escritorio' && r.retiradaOrigem === 'office_extraordinary_withdrawal';
  return { ok, detail: JSON.stringify(r) };
}, 'retirada extraordinária pontual (1200) nunca se mistura, altera ou duplica o repasse planejado já realizado — permanece separada e identificável');

await close();

const fails = results.filter((r) => r.status === 'FAIL').length;
console.log(`\ngate3-real-patterns.test.mjs: TOTAL=${results.length} PASS=${results.length - fails} FAIL=${fails}`);
if (fails > 0) process.exitCode = 1;

export { results };
