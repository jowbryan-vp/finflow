// Gate 3 — seção 44/45/48: repasse previsto (OP01-OP04), repasse realizado
// (OP05-OP09) e idempotência da distribuição (seção 36/48).
import { openHarness, makeRunner, baseSyntheticState } from './harness.mjs';

const { page, loadState, close } = await openHarness();
const { check, results } = makeRunner('gate3-distribution');

await loadState(baseSyntheticState({ contas: [{ id: 'c1', name: 'Conta Pessoal', color: '#5b7fff', saldoInicial: 500 }] }));
await page.evaluate(() => {
  state.office.contas.push({ id: 'oc1', name: 'Conta Escritório', color: '#ff9900', saldoInicial: 0 });
  state.office.projetos.push({ id: 'p1', nome: 'Residência Silva', cliente: 'Silva', valorContrato: 10000, status: 'contratado', dataContrato: '2026-09-01', observacao: '', createdAt: 'p1' });
});

// OP01 — regra ainda NÃO configurada: recebível contratado não gera repasse (BLOCKED_DISTRIBUTION_RULE).
await check('OP01-bloqueado-sem-regra', async () => {
  const r = await page.evaluate(() => {
    state.office.recebiveis.push({ id: 'rec1', projetoId: 'p1', descricao: 'Entrada', valor: 3000, estado: 'previsto', dataPrevista: '2026-09-20', dataRecebimento: null, contaDestino: 'oc1', createdAt: 'rec1' });
    syncDerivedPersonalTransfer('rec1');
    const repasse = state.office.repasses.find((rp) => rp.recebivelId === 'rec1');
    return { temRepasse: !!repasse };
  });
  const ok = r.temRepasse === false;
  return { ok, detail: `sem regra de distribuição configurada, recebível contratado não gera repasse (temRepasse=${r.temRepasse}, esp. false) — nenhum percentual foi inventado` };
}, 'recebível contratado + regra NÃO configurada → não gera repasse (nunca inventa percentual)');

// Agora configura a regra e recalcula.
await check('OP01', async () => {
  const r = await page.evaluate(() => {
    // Gate 3.1: a distribuição só fica "configured" quando os 3 destinos
    // estão preenchidos e a soma é exatamente 100 — reserva e impostos
    // também precisam ser preenchidos aqui, não só repasse_pessoal.
    state.office.regrasDistribuicao.find((x) => x.destino === 'reserva').percentual = 40;
    state.office.regrasDistribuicao.find((x) => x.destino === 'impostos').percentual = 30;
    state.office.regrasDistribuicao.find((x) => x.destino === 'repasse_pessoal').percentual = 30;
    syncDerivedPersonalTransfer('rec1');
    const repasse = state.office.repasses.find((rp) => rp.recebivelId === 'rec1');
    const receita = state.receitas.find((x) => x.officeTransferId === 'off_rec1');
    return { repasseValor: repasse ? repasse.valor : null, receitaValor: receita ? receita.valor : null, receitaOrigem: receita ? receita.origem : null };
  });
  const ok = r.repasseValor === 900 && r.receitaValor === 900 && r.receitaOrigem === 'office_distribution';
  return { ok, detail: `recebível 3000 × 30% = 900 — repasse gerado=${r.repasseValor}, receita pessoal gerada=${r.receitaValor} (esp. 900 nos dois), origem=${r.receitaOrigem}` };
}, 'recebível contratado + regra configurada (30%) → gera um repasse previsto pessoal de valor correto');

await check('OP02', async () => {
  const r = await page.evaluate(() => {
    const saldoPessoal = state.contas.reduce((s, c) => s + calcSaldoConta(c.id), 0);
    return { saldoPessoal };
  });
  const ok = r.saldoPessoal === 500;
  return { ok, detail: `repasse previsto (900) não altera o caixa pessoal real — saldo pessoal=${r.saldoPessoal} (esp. 500, inalterado)` };
}, 'repasse previsto não altera caixa pessoal real');

await check('OP03', async () => {
  const r = await page.evaluate(() => {
    // Recalcula repetidamente — nunca duplica.
    syncDerivedPersonalTransfer('rec1'); syncDerivedPersonalTransfer('rec1'); syncDerivedPersonalTransfer('rec1');
    const qtdRepasses = state.office.repasses.filter((rp) => rp.recebivelId === 'rec1').length;
    const qtdReceitas = state.receitas.filter((x) => x.officeTransferId === 'off_rec1').length;
    return { qtdRepasses, qtdReceitas };
  });
  const ok = r.qtdRepasses === 1 && r.qtdReceitas === 1;
  return { ok, detail: `recalcular 3x seguidas — qtd repasses=${r.qtdRepasses}, qtd receitas=${r.qtdReceitas} (esp. 1 e 1, nunca duplicado)` };
}, 'recalcular a distribuição não duplica o repasse nem a receita derivada');

await check('OP04', async () => {
  const r = await page.evaluate(() => {
    const rec = state.office.recebiveis.find((x) => x.id === 'rec1');
    rec.valor = 4000; rec.dataPrevista = '2026-09-28';
    syncDerivedPersonalTransfer('rec1');
    const repasse = state.office.repasses.find((rp) => rp.recebivelId === 'rec1');
    const receita = state.receitas.find((x) => x.officeTransferId === 'off_rec1');
    return { repasseValor: repasse.valor, repasseDataPrevista: repasse.dataPrevista, receitaValor: receita.valor, receitaDataPrevista: receita.dataPrevista, qtdRepasses: state.office.repasses.filter((rp) => rp.recebivelId === 'rec1').length };
  });
  const ok = r.repasseValor === 1200 && r.repasseDataPrevista === '2026-09-28' && r.receitaValor === 1200 && r.receitaDataPrevista === '2026-09-28' && r.qtdRepasses === 1;
  return { ok, detail: `recebível alterado (4000 × 30% = 1200, nova data prevista) — repasse acompanhou: valor=${r.repasseValor}, data=${r.repasseDataPrevista} (esp. 1200, 2026-09-28), ainda 1 registro (${r.qtdRepasses})` };
}, 'alterar o recebível: o repasse previsto acompanha a regra, sem duplicar');

// OP05-OP09 — repasse realizado.
await check('OP05-OP09', async () => {
  const r = await page.evaluate(() => {
    const saldoEscritorioAntes = getOfficeOperationalBalance();
    const saldoPessoalAntes = state.contas.reduce((s, c) => s + calcSaldoConta(c.id), 0);
    const patrimonioConsolidadoAntes = saldoEscritorioAntes + saldoPessoalAntes;
    const repasse = state.office.repasses.find((rp) => rp.recebivelId === 'rec1');
    // Precisa ter dinheiro real na conta do escritório pra sair de fato —
    // simula o recebível tendo sido efetivamente recebido antes do repasse.
    const rec = state.office.recebiveis.find((x) => x.id === 'rec1');
    rec.estado = 'recebido'; rec.dataRecebimento = '2026-09-28';
    const saldoEscritorioComRecebimento = getOfficeOperationalBalance();
    const ok = realizeOfficeTransfer(repasse.id, '2026-09-29', 'oc1', 'c1');
    const saldoEscritorioDepois = getOfficeOperationalBalance();
    const saldoPessoalDepois = state.contas.reduce((s, c) => s + calcSaldoConta(c.id), 0);
    const patrimonioConsolidadoDepois = saldoEscritorioDepois + saldoPessoalDepois;
    const receita = state.receitas.find((x) => x.officeTransferId === 'off_rec1');
    const repasseDepois = state.office.repasses.find((rp) => rp.recebivelId === 'rec1');
    return {
      ok, saldoEscritorioComRecebimento, saldoEscritorioDepois, saldoPessoalAntes, saldoPessoalDepois,
      patrimonioConsolidadoAntes, patrimonioConsolidadoDepois, receitaEstado: receita.estado, receitaDataRecebimento: receita.dataRecebimento,
      repasseEstado: repasseDepois.estado, qtdReceitasVinculadas: state.receitas.filter((x) => x.officeTransferId === 'off_rec1').length,
    };
  });
  const okGeral = r.ok === true
    && r.saldoPessoalDepois === r.saldoPessoalAntes + 1200
    && r.saldoEscritorioDepois === r.saldoEscritorioComRecebimento - 1200
    && r.patrimonioConsolidadoDepois === r.patrimonioConsolidadoAntes + 4000 // o recebimento real do rec1 (4000) entrou no meio — a transferência em si é neutra
    && r.receitaEstado === 'recebido' && r.receitaDataRecebimento === '2026-09-29'
    && r.repasseEstado === 'recebido' && r.qtdReceitasVinculadas === 1;
  return { ok: okGeral, detail: JSON.stringify(r) };
}, 'realizar repasse: escritório -1200/pessoal +1200 exatos, patrimônio consolidado neutro quanto à transferência, mesmo evento pessoal passa a recebido (nunca uma segunda receita)');

await check('OP-idempotencia-realizar', async () => {
  const r = await page.evaluate(() => {
    const repasse = state.office.repasses.find((rp) => rp.recebivelId === 'rec1');
    const saldoAntes = getOfficeOperationalBalance();
    const ok2 = realizeOfficeTransfer(repasse.id, '2026-09-30', 'oc1', 'c1');
    const saldoDepois = getOfficeOperationalBalance();
    return { ok2, saldoAntes, saldoDepois };
  });
  const ok = r.ok2 === false && r.saldoAntes === r.saldoDepois;
  return { ok, detail: `chamar realizeOfficeTransfer de novo sobre um repasse já realizado — retorno=${r.ok2} (esp. false), saldo inalterado (${r.saldoAntes} === ${r.saldoDepois})` };
}, 'realizar um repasse já realizado não tem efeito nenhum (idempotente)');

await close();

const fails = results.filter((r) => r.status === 'FAIL').length;
console.log(`\ngate3-distribution.test.mjs: TOTAL=${results.length} PASS=${results.length - fails} FAIL=${fails}`);
if (fails > 0) process.exitCode = 1;

export { results };
