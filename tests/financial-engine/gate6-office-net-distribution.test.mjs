// Gate 6 — Caixa do Escritório: imposto e RRT deduzidos ANTES da divisão
// percentual (receitaLiquidaDistribuivel = receitaBruta - imposto - RRTs),
// dividida em 5 destinos fixos (repasse pessoal 65% / operação 15% /
// reserva de crescimento 10% / capital de giro 7% / marketing 3%), com
// provisão de RRT/imposto prioritária sobre entradas realizadas parciais.
// Convive lado a lado com a regra legada (gate3-distribution.test.mjs,
// regrasDistribuicao 3 destinos) — projeto.regraDistribuicao decide qual
// motor se aplica; nenhum teste legado é alterado por este arquivo.
import { openHarness, makeRunner, baseSyntheticState } from './harness.mjs';

const { page, loadState, close } = await openHarness();
const { check, results } = makeRunner('gate6-office-net-distribution');

async function setupBase() {
  await loadState(baseSyntheticState({ contas: [{ id: 'c1', name: 'Conta Pessoal', color: '#5b7fff', saldoInicial: 0 }] }));
  await page.evaluate(() => {
    state.office.contas.push({ id: 'oc1', name: 'Conta Escritório', color: '#ff9900', saldoInicial: 0 });
  });
}
await setupBase();

// ---------------------------------------------------------------------------
// Cenário 1 do escopo — uma RRT de Projeto
// ---------------------------------------------------------------------------
await check('CEN01-uma-rrt-projeto', async () => {
  const r = await page.evaluate(() => {
    state.office.projetos.push({
      id: 'pA', nome: 'Projeto A', cliente: 'Cliente A', valorContrato: 3000, status: 'contratado',
      dataContrato: '2026-09-01', observacao: '', createdAt: 'pA', regraDistribuicao: 'v2',
      rrts: [{ id: 'rrtA1', tipo: 'projeto', valor: 130.64, status: 'prevista', numero: '', dataEmissao: null, dataPagamento: null, createdAt: 'rrtA1' }],
    });
    const p = state.office.projetos.find((x) => x.id === 'pA');
    const dist = calculateProjectDistributionV2(p);
    return dist;
  });
  const ok = r.receitaBruta === 3000 && r.impostoProvisionado === 150 && r.rrtProvisionada === 130.64
    && r.receitaLiquidaDistribuivel === 2719.36
    && r.porDestino.repasse_pessoal === 1767.58 && r.porDestino.operacao === 407.90
    && r.porDestino.reserva_crescimento === 271.94 && r.porDestino.capital_giro === 190.36
    && r.porDestino.marketing === 81.58;
  return { ok, detail: `esperado bruto=3000 imposto=150 rrt=130.64 liquido=2719.36 repasse=1767.58 operacao=407.90 crescimento=271.94 capitalGiro=190.36 marketing=81.58 — obtido: ${JSON.stringify(r)}` };
}, 'item 1/3/7/8/9 — receita bruta 3000, imposto 5%, uma RRT de Projeto 130,64 → cenário 1 do escopo bate exatamente');

// ---------------------------------------------------------------------------
// Cenário 2 do escopo — duas RRTs
// ---------------------------------------------------------------------------
await check('CEN02-duas-rrts', async () => {
  const r = await page.evaluate(() => {
    state.office.projetos.push({
      id: 'pB', nome: 'Projeto B', cliente: 'Cliente B', valorContrato: 3000, status: 'contratado',
      dataContrato: '2026-09-01', observacao: '', createdAt: 'pB', regraDistribuicao: 'v2',
      rrts: [
        { id: 'rrtB1', tipo: 'projeto', valor: 130.64, status: 'prevista', numero: '', dataEmissao: null, dataPagamento: null, createdAt: 'rrtB1' },
        { id: 'rrtB2', tipo: 'execucao', valor: 130.64, status: 'prevista', numero: '', dataEmissao: null, dataPagamento: null, createdAt: 'rrtB2' },
      ],
    });
    const p = state.office.projetos.find((x) => x.id === 'pB');
    return calculateProjectDistributionV2(p);
  });
  const ok = r.rrtProvisionada === 261.28 && r.receitaLiquidaDistribuivel === 2588.72
    && r.porDestino.repasse_pessoal === 1682.67 && r.porDestino.operacao === 388.31
    && r.porDestino.reserva_crescimento === 258.87 && r.porDestino.capital_giro === 181.21
    && r.porDestino.marketing === 77.66;
  return { ok, detail: `esperado rrt=261.28 liquido=2588.72 repasse=1682.67 operacao=388.31 crescimento=258.87 capitalGiro=181.21 marketing=77.66 — obtido: ${JSON.stringify(r)}` };
}, 'item 3/4/8/9 — duas RRTs (Projeto + Execução), valores iguais → cenário 2 do escopo bate exatamente');

// ---------------------------------------------------------------------------
// Item 2 — uma RRT de Execução (isolada, valor diferente)
// ---------------------------------------------------------------------------
await check('RRT-execucao-isolada', async () => {
  const r = await page.evaluate(() => {
    state.office.projetos.push({
      id: 'pC', nome: 'Projeto C', cliente: 'Cliente C', valorContrato: 1000, status: 'contratado',
      dataContrato: '2026-09-01', observacao: '', createdAt: 'pC', regraDistribuicao: 'v2',
      rrts: [{ id: 'rrtC1', tipo: 'execucao', valor: 50, status: 'prevista', numero: '', dataEmissao: null, dataPagamento: null, createdAt: 'rrtC1' }],
    });
    const p = state.office.projetos.find((x) => x.id === 'pC');
    return calculateProjectDistributionV2(p);
  });
  // bruto 1000, imposto 5%=50, rrt execucao=50, liquido=900
  const ok = r.impostoProvisionado === 50 && r.rrtProvisionada === 50 && r.receitaLiquidaDistribuivel === 900;
  return { ok, detail: `esperado imposto=50 rrt=50 liquido=900 — obtido: ${JSON.stringify(r)}` };
}, 'item 2 — projeto com uma RRT de Execução isolada é deduzida corretamente');

// ---------------------------------------------------------------------------
// Item 5 — edição de RRT sem duplicação
// ---------------------------------------------------------------------------
await check('RRT-edicao-sem-duplicacao', async () => {
  const r = await page.evaluate(() => {
    const p = state.office.projetos.find((x) => x.id === 'pA');
    const rrt = p.rrts.find((x) => x.id === 'rrtA1');
    rrt.valor = 200; rrt.numero = 'RRT-0001'; rrt.status = 'emitida'; rrt.dataEmissao = '2026-09-10';
    resyncProjectV2('pA');
    const dist = calculateProjectDistributionV2(p);
    return { qtdRrts: p.rrts.length, rrtProvisionada: dist.rrtProvisionada };
  });
  const ok = r.qtdRrts === 1 && r.rrtProvisionada === 200;
  return { ok, detail: `editar valor/número/status da RRT existente — qtdRrts=${r.qtdRrts} (esp. 1), rrtProvisionada=${r.rrtProvisionada} (esp. 200)` };
}, 'item 5 — editar uma RRT já registrada atualiza o valor sem criar um segundo registro');

await check('RRT-nao-cria-terceira', async () => {
  const r = await page.evaluate(() => {
    const p = state.office.projetos.find((x) => x.id === 'pB');
    const antes = p.rrts.length;
    // addProjetoRRT bloqueia explicitamente ao atingir 2 registros.
    addProjetoRRT('pB', 'projeto'); // já existe um 'projeto' neste projeto — deve ser rejeitado também por tipo duplicado
    return { antes, depois: p.rrts.length };
  });
  const ok = r.antes === 2 && r.depois === 2;
  return { ok, detail: `tentar adicionar RRT além do máximo/tipo duplicado — antes=${r.antes}, depois=${r.depois} (esp. 2 e 2, nunca uma terceira)` };
}, 'item 7 do escopo RRT — nunca cria uma terceira RRT nem duplica tipo');

// ---------------------------------------------------------------------------
// Item 6 — mudar o valor padrão não altera RRT já registrada
// ---------------------------------------------------------------------------
await check('RRT-valor-padrao-nao-retroativo', async () => {
  const r = await page.evaluate(() => {
    state.office.rrtValorPadrao = 999;
    const p = state.office.projetos.find((x) => x.id === 'pA');
    const rrt = p.rrts.find((x) => x.id === 'rrtA1');
    return { valorRrtExistente: rrt.valor, padraoNovo: getOfficeRrtValorPadrao() };
  });
  const ok = r.valorRrtExistente === 200 && r.padraoNovo === 999;
  return { ok, detail: `mudar o valor padrão vigente pra 999 — RRT já registrada continua=${r.valorRrtExistente} (esp. 200, inalterada), novo padrão=${r.padraoNovo} (esp. 999)` };
}, 'item 6 — alterar o valor padrão vigente da RRT nunca altera retroativamente uma RRT já registrada em um projeto');

await check('RRT-novo-registro-usa-padrao-atual', async () => {
  const r = await page.evaluate(() => {
    state.office.projetos.push({
      id: 'pD', nome: 'Projeto D', cliente: 'Cliente D', valorContrato: 5000, status: 'contratado',
      dataContrato: '2026-09-01', observacao: '', createdAt: 'pD', regraDistribuicao: 'v2', rrts: [],
    });
    addProjetoRRT('pD', 'projeto');
    const p = state.office.projetos.find((x) => x.id === 'pD');
    return { valor: p.rrts[0].valor };
  });
  const ok = r.valor === 999;
  return { ok, detail: `RRT nova criada depois da mudança do padrão usa o padrão VIGENTE no momento do cadastro=${r.valor} (esp. 999)` };
}, 'item 1/2 — ao adicionar uma RRT nova, o valor inicial vem do padrão vigente do escritório, editável depois');

// ---------------------------------------------------------------------------
// Item 10/13 — recebível previsto não impacta caixa real nem gera repasse
// ---------------------------------------------------------------------------
await check('previsto-sem-impacto-caixa', async () => {
  const r = await page.evaluate(() => {
    state.office.recebiveis.push({ id: 'recA1', projetoId: 'pA', descricao: 'Entrada', valor: 3000, estado: 'previsto', dataPrevista: '2026-09-20', dataRecebimento: null, contaDestino: 'oc1', createdAt: 'recA1' });
    syncDerivedPersonalTransfer('recA1');
    const repasse = state.office.repasses.find((rp) => rp.recebivelId === 'recA1');
    const saldoOffice = getOfficeOperationalBalance();
    const saldoPessoal = state.contas.reduce((s, c) => s + calcSaldoConta(c.id), 0);
    return { temRepasse: !!repasse, saldoOffice, saldoPessoal };
  });
  const ok = r.temRepasse === false && r.saldoOffice === 0 && r.saldoPessoal === 0;
  return { ok, detail: `recebível ainda previsto — temRepasse=${r.temRepasse} (esp. false), saldo escritório=${r.saldoOffice}, saldo pessoal=${r.saldoPessoal} (esp. 0 e 0)` };
}, 'item 10/13 — recebível previsto (regra v2) não gera repasse nem qualquer disponibilidade real, previsto nunca é caixa');

// ---------------------------------------------------------------------------
// Item 11/12 — recebimento parcial com provisão prioritária de imposto+RRT
// ---------------------------------------------------------------------------
await check('provisao-prioritaria-parcial', async () => {
  const r = await page.evaluate(() => {
    // pA: imposto+RRT = 150+200(RRT já editada) = 350. Recebe 300 primeiro — deve ficar 100% provisionado.
    const rec = state.office.recebiveis.find((x) => x.id === 'recA1');
    rec.valor = 300; rec.estado = 'recebido'; rec.dataRecebimento = '2026-09-20';
    syncDerivedPersonalTransfer('recA1');
    return {
      provisionadoCent: rec.provisionadoRealizadoCent, distribuivelCent: rec.distribuivelRealizadoCent,
      temRepasse: !!state.office.repasses.find((rp) => rp.recebivelId === 'recA1'),
      reservasMovs: state.office.movimentacoesReservas.filter((m) => m.origemRecebivelId === 'recA1').length,
    };
  });
  const ok = r.provisionadoCent === 30000 && r.distribuivelCent === 0 && r.temRepasse === false && r.reservasMovs === 0;
  return { ok, detail: `recebido 300 de um total a provisionar de 350 — 100% provisionado, nada distribuível: provisionadoCent=${r.provisionadoCent} (esp. 30000), distribuivelCent=${r.distribuivelCent} (esp. 0), repasse=${r.temRepasse}, movs reserva=${r.reservasMovs} (esp. 0)` };
}, 'item 12 — provisão de imposto+RRT é prioritária: entrada realizada menor que o total a provisionar fica inteiramente provisionada, nada é distribuído ainda');

await check('provisao-prioritaria-excedente', async () => {
  const r = await page.evaluate(() => {
    // Segunda parcela do mesmo projeto pA: 200, completando a provisão (faltavam 50) e distribuindo o excedente (150).
    state.office.recebiveis.push({ id: 'recA2', projetoId: 'pA', descricao: 'Parcela 1/1', valor: 200, estado: 'recebido', dataPrevista: '2026-10-01', dataRecebimento: '2026-10-01', contaDestino: 'oc1', createdAt: 'recA2' });
    syncDerivedPersonalTransfer('recA2');
    const rec = state.office.recebiveis.find((x) => x.id === 'recA2');
    return { provisionadoCent: rec.provisionadoRealizadoCent, distribuivelCent: rec.distribuivelRealizadoCent };
  });
  const ok = r.provisionadoCent === 5000 && r.distribuivelCent === 15000;
  return { ok, detail: `faltavam 50 pra completar a provisão de 350 — provisionadoCent=${r.provisionadoCent} (esp. 5000=50), distribuivelCent=${r.distribuivelCent} (esp. 15000=150, o excedente já é distribuível)` };
}, 'item 11/12 — recebimento parcial subsequente completa a provisão pendente e só o excedente vira distribuível');

// ---------------------------------------------------------------------------
// Item 15 — reservas empresariais separadas, geradas pelo excedente acima
// ---------------------------------------------------------------------------
await check('reservas-separadas-do-excedente', async () => {
  const r = await page.evaluate(() => {
    // distribuivel=150 → 65/15/10/7/3% => 97.50/22.50/15.00/10.50/4.50
    const saldoOperacao = getSaldoOfficeReserva('oreserva_sys_operacao');
    const saldoCrescimento = getSaldoOfficeReserva('oreserva_sys_crescimento');
    const saldoCapitalGiro = getSaldoOfficeReserva('oreserva_sys_capital_giro');
    const saldoMarketing = getSaldoOfficeReserva('oreserva_sys_marketing');
    const repasse = state.office.repasses.find((rp) => rp.recebivelId === 'recA2');
    const reservadoTotal = getOfficeReservedBalance();
    return { saldoOperacao, saldoCrescimento, saldoCapitalGiro, saldoMarketing, repasseValor: repasse ? repasse.valor : null, reservadoTotal };
  });
  const ok = r.saldoOperacao === 22.5 && r.saldoCrescimento === 15 && r.saldoCapitalGiro === 10.5 && r.saldoMarketing === 4.5
    && r.repasseValor === 97.5 && r.reservadoTotal === (22.5 + 15 + 10.5 + 4.5);
  return { ok, detail: `esperado operacao=22.5 crescimento=15 capitalGiro=10.5 marketing=4.5 repasse=97.5 — obtido: ${JSON.stringify(r)}` };
}, 'item 15 — operação/crescimento/capital de giro/marketing viram reservas empresariais separadas e identificáveis, nunca uma reserva genérica de 30%, nunca repasse pessoal');

await check('reservas-nao-sao-despesa-nem-pessoal', async () => {
  const r = await page.evaluate(() => {
    const saldoPessoal = state.contas.reduce((s, c) => s + calcSaldoConta(c.id), 0);
    const despesasOffice = (state.office.despesas || []).length;
    return { saldoPessoal, despesasOffice };
  });
  const ok = r.saldoPessoal === 0 && r.despesasOffice === 0;
  return { ok, detail: `reservas aplicadas não geram despesa nem entram no saldo pessoal — saldoPessoal=${r.saldoPessoal}, despesasOffice=${r.despesasOffice} (esp. 0 e 0)` };
}, 'RESERVAS EMPRESARIAIS — destinos empresariais nunca viram despesa operacional nem saldo pessoal disponível no momento da separação');

// ---------------------------------------------------------------------------
// Item 13/14 — repasse previsto sem entrada pessoal real, depois realizado
// ---------------------------------------------------------------------------
await check('repasse-previsto-sem-caixa-pessoal', async () => {
  const r = await page.evaluate(() => {
    const saldoPessoal = state.contas.reduce((s, c) => s + calcSaldoConta(c.id), 0);
    const receita = state.receitas.find((x) => x.officeTransferId === 'off_recA2');
    return { saldoPessoal, estadoReceita: receita ? receita.estado : null };
  });
  const ok = r.saldoPessoal === 0 && r.estadoReceita === 'previsto';
  return { ok, detail: `repasse pessoal derivado do recebimento parcial ainda é 'previsto' — saldo pessoal=${r.saldoPessoal} (esp. 0), estado da receita=${r.estadoReceita} (esp. previsto)` };
}, 'item 13 — repasse pessoal derivado de caixa real ainda assim fica previsto até ser efetivamente transferido, nunca cria disponibilidade pessoal sozinho');

await check('repasse-realizado-vinculado', async () => {
  const r = await page.evaluate(() => {
    const repasse = state.office.repasses.find((rp) => rp.recebivelId === 'recA2');
    const saldoOfficeAntes = calcSaldoOfficeConta('oc1');
    const saldoPessoalAntes = calcSaldoConta('c1');
    realizeOfficeTransfer(repasse.id, '2026-10-05', 'oc1', 'c1');
    const saldoOfficeDepois = calcSaldoOfficeConta('oc1');
    const saldoPessoalDepois = calcSaldoConta('c1');
    const receita = state.receitas.find((x) => x.officeTransferId === repasse.officeTransferId);
    return { saldoOfficeAntes, saldoOfficeDepois, saldoPessoalAntes, saldoPessoalDepois, receitaEstado: receita.estado, mesmoOfficeTransferId: receita.officeTransferId === repasse.officeTransferId };
  });
  const ok = Math.round((r.saldoOfficeAntes - r.saldoOfficeDepois) * 100) === 9750
    && Math.round((r.saldoPessoalDepois - r.saldoPessoalAntes) * 100) === 9750
    && r.receitaEstado === 'recebido' && r.mesmoOfficeTransferId;
  return { ok, detail: `realizar o repasse — saldo escritório caiu ${((r.saldoOfficeAntes - r.saldoOfficeDepois)).toFixed(2)}, saldo pessoal subiu ${((r.saldoPessoalDepois - r.saldoPessoalAntes)).toFixed(2)} (esp. 97.50 nos dois), receita=${r.receitaEstado}, vínculo preservado=${r.mesmoOfficeTransferId}` };
}, 'item 14 — repasse realizado move o mesmo valor do escritório pro pessoal, mesmo evento lógico nos dois lados (officeTransferId preservado)');

// ---------------------------------------------------------------------------
// Item 19 — ausência de duplicação financeira ao recalcular
// ---------------------------------------------------------------------------
await check('sem-duplicacao-ao-recalcular', async () => {
  const r = await page.evaluate(() => {
    syncDerivedPersonalTransfer('recA1'); syncDerivedPersonalTransfer('recA1');
    syncDerivedPersonalTransfer('recA2'); syncDerivedPersonalTransfer('recA2'); syncDerivedPersonalTransfer('recA2');
    resyncProjectV2('pA'); resyncProjectV2('pA');
    return {
      qtdRepasses: state.office.repasses.filter((rp) => rp.recebivelId === 'recA2').length,
      qtdReceitas: state.receitas.filter((x) => x.officeTransferId === 'off_recA2').length,
      qtdMovsReserva: state.office.movimentacoesReservas.filter((m) => m.origemRecebivelId === 'recA2').length,
      qtdReservasSistema: (state.office.reservas || []).filter((rv) => rv.sistema).length,
    };
  });
  const ok = r.qtdRepasses === 1 && r.qtdReceitas === 1 && r.qtdMovsReserva === 4 && r.qtdReservasSistema === 4;
  return { ok, detail: `recalcular repetidamente após já realizado — repasses=${r.qtdRepasses}, receitas=${r.qtdReceitas}, movs reserva=${r.qtdMovsReserva} (esp. 1,1,4), reservas de sistema únicas=${r.qtdReservasSistema} (esp. 4, nunca uma por projeto)` };
}, 'item 19 — recalcular a distribuição depois de realizada nunca duplica repasse, receita ou movimentação de reserva; reservas de sistema são únicas e compartilhadas entre projetos');

// ---------------------------------------------------------------------------
// Item 16/20 — importação de backup antigo preserva histórico e usa legado
// ---------------------------------------------------------------------------
await check('backup-antigo-preserva-legado', async () => {
  const r = await page.evaluate(() => {
    const legacyRaw = {
      categories: [{ id: 'geral', name: 'Geral', subs: ['Geral'] }],
      cards: [{ id: 'dinheiro', name: 'Dinheiro/PIX', color: '#38e2b4', fecha: null, paga: null }],
      contas: [], movimentacoesContas: [], receitas: [], despesas: [], pessoas: [], cofrinhos: [], movimentacoesCofrinhos: [],
      excedentes: {}, contribuicaoAjustes: {}, faturasPagas: {}, contribuicaoPaga: {},
      office: {
        ativo: true, nome: 'Escritório Antigo',
        contas: [{ id: 'oc_old', name: 'Conta Antiga', color: '#000', saldoInicial: 0 }],
        movimentacoesContas: [],
        // Projeto legado SEM rrts/regraDistribuicao (formato pré-Gate 6), com um
        // recebível JÁ efetivamente recebido sob a regra antiga.
        projetos: [{ id: 'pOld', nome: 'Projeto Antigo', cliente: 'Cliente Antigo', valorContrato: 10000, status: 'contratado', dataContrato: '2026-01-01', observacao: '', createdAt: 'pOld' }],
        recebiveis: [{ id: 'recOld', projetoId: 'pOld', descricao: 'Entrada', valor: 4000, estado: 'recebido', dataPrevista: '2026-01-10', dataRecebimento: '2026-01-10', contaDestino: 'oc_old', createdAt: 'recOld' }],
        despesas: [], reservas: [], movimentacoesReservas: [],
        repasses: [{ id: 'rpOld', tipo: 'planejado', recebivelId: 'recOld', valor: 1200, estado: 'recebido', dataPrevista: '2026-01-10', dataRecebimento: '2026-01-10', officeTransferId: 'off_recOld', createdAt: 'rpOld' }],
        regrasDistribuicao: [{ destino: 'reserva', percentual: 40 }, { destino: 'impostos', percentual: 30 }, { destino: 'repasse_pessoal', percentual: 30 }],
      },
    };
    migrateAppData(legacyRaw);
    const p = state.office.projetos.find((x) => x.id === 'pOld');
    const rec = state.office.recebiveis.find((x) => x.id === 'recOld');
    const rp = state.office.repasses.find((x) => x.id === 'rpOld');
    return { regraDistribuicao: p.regraDistribuicao, rrts: p.rrts, recValorPreservado: rec.valor, repasseValorPreservado: rp.valor };
  });
  const ok = r.regraDistribuicao === 'legacy' && Array.isArray(r.rrts) && r.rrts.length === 0
    && r.recValorPreservado === 4000 && r.repasseValorPreservado === 1200;
  return { ok, detail: `projeto antigo com recebível já realizado — regraDistribuicao=${r.regraDistribuicao} (esp. legacy), rrts=${JSON.stringify(r.rrts)} (esp. []), valores preservados sem reinterpretação: recebível=${r.recValorPreservado} (esp. 4000), repasse=${r.repasseValorPreservado} (esp. 1200)` };
}, 'item 16/20 — importar um backup antigo (projeto sem rrts/regraDistribuicao, com recebível/repasse já realizado) preserva tudo, nunca reinterpreta como v2, nunca inventa RRT');

await check('projeto-antigo-so-previsto-migra-para-v2', async () => {
  const r = await page.evaluate(() => {
    const legacyRaw = {
      categories: [{ id: 'geral', name: 'Geral', subs: ['Geral'] }],
      cards: [{ id: 'dinheiro', name: 'Dinheiro/PIX', color: '#38e2b4', fecha: null, paga: null }],
      contas: [], movimentacoesContas: [], receitas: [], despesas: [], pessoas: [], cofrinhos: [], movimentacoesCofrinhos: [],
      excedentes: {}, contribuicaoAjustes: {}, faturasPagas: {}, contribuicaoPaga: {},
      office: {
        ativo: true, nome: 'Escritório',
        contas: [{ id: 'oc_new', name: 'Conta', color: '#000', saldoInicial: 0 }],
        movimentacoesContas: [],
        projetos: [{ id: 'pNaoRealizado', nome: 'Projeto Só Previsto', cliente: 'Cliente Y', valorContrato: 5000, status: 'contratado', dataContrato: '2026-02-01', observacao: '', createdAt: 'pNaoRealizado' }],
        recebiveis: [{ id: 'recNaoRealizado', projetoId: 'pNaoRealizado', descricao: 'Entrada', valor: 5000, estado: 'previsto', dataPrevista: '2026-03-01', dataRecebimento: null, contaDestino: 'oc_new', createdAt: 'recNaoRealizado' }],
        despesas: [], reservas: [], movimentacoesReservas: [], repasses: [],
        regrasDistribuicao: [{ destino: 'reserva', percentual: null }, { destino: 'impostos', percentual: null }, { destino: 'repasse_pessoal', percentual: null }],
      },
    };
    migrateAppData(legacyRaw);
    const p = state.office.projetos.find((x) => x.id === 'pNaoRealizado');
    return { regraDistribuicao: p.regraDistribuicao, rrts: p.rrts, precisaConfig: projetoNecessitaConfiguracaoRRT(p) };
  });
  const ok = r.regraDistribuicao === 'v2' && Array.isArray(r.rrts) && r.rrts.length === 0 && r.precisaConfig === true;
  return { ok, detail: `projeto antigo ainda inteiramente previsto (nada realizado) — regraDistribuicao=${r.regraDistribuicao} (esp. v2), rrts=${JSON.stringify(r.rrts)} (esp. [], nunca inventada), precisaConfiguracaoRRT=${r.precisaConfig} (esp. true, sinalizado explicitamente)` };
}, 'item 5/6 do escopo de migração — projeto contratado ainda sem nada realizado migra pra v2 sem inventar RRT, sinalizando "RRT não configurada"');

// ---------------------------------------------------------------------------
// Item 17/18 — export/import round-trip e idempotência da migração
// ---------------------------------------------------------------------------
await setupBase();
await check('export-import-preserva-campos-novos', async () => {
  const r = await page.evaluate(() => {
    state.office.impostoPercentual = 7.5;
    state.office.rrtValorPadrao = 321.09;
    state.office.projetos.push({
      id: 'pE', nome: 'Projeto E', cliente: 'Cliente E', valorContrato: 2000, status: 'contratado',
      dataContrato: '2026-09-01', observacao: '', createdAt: 'pE', regraDistribuicao: 'v2',
      rrts: [{ id: 'rrtE1', tipo: 'projeto', valor: 111.11, status: 'emitida', numero: 'RRT-9', dataEmissao: '2026-09-05', dataPagamento: null, createdAt: 'rrtE1' }],
    });
    const exported1 = JSON.stringify(buildSaveObject());
    migrateAppData(JSON.parse(exported1));
    const exported2 = JSON.stringify(buildSaveObject());
    const p = state.office.projetos.find((x) => x.id === 'pE');
    return { idempotente: exported1 === exported2, impostoPercentual: state.office.impostoPercentual, rrtValorPadrao: state.office.rrtValorPadrao, rrt: p.rrts[0], regraDistribuicao: p.regraDistribuicao };
  });
  const ok = r.idempotente && r.impostoPercentual === 7.5 && r.rrtValorPadrao === 321.09
    && r.rrt.valor === 111.11 && r.rrt.status === 'emitida' && r.rrt.numero === 'RRT-9' && r.rrt.dataEmissao === '2026-09-05'
    && r.regraDistribuicao === 'v2';
  return { ok, detail: `export→import→export idêntico=${r.idempotente}; imposto=${r.impostoPercentual} (esp. 7.5), rrtValorPadrao=${r.rrtValorPadrao} (esp. 321.09), RRT preservada=${JSON.stringify(r.rrt)}, regra=${r.regraDistribuicao}` };
}, 'item 17/18 — export/import round-trip preserva impostoPercentual, rrtValorPadrao, rrts e regraDistribuicao; reimportar duas vezes produz o mesmo resultado (migração idempotente)');

console.log(`TOTAL=${results.length} PASS=${results.filter((r) => r.status === 'PASS').length} FAIL=${results.filter((r) => r.status === 'FAIL').length}`);
await close();
process.exit(results.some((r) => r.status === 'FAIL') ? 1 : 0);
