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
      rrtRequirement: 'one', rrtRequirementConfirmedAt: '2026-09-01T00:00:00.000Z', rrtRequirementConfirmedBy: null,
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
      rrtRequirement: 'two', rrtRequirementConfirmedAt: '2026-09-01T00:00:00.000Z', rrtRequirementConfirmedBy: null,
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
    setProjetoRrtRequirement('pD', 'one'); // decisão precisa vir antes de qualquer RRT poder ser cadastrada
    addProjetoRRT('pD', 'projeto'); // abre o modal de confirmação, prefill com o padrão vigente (999)
    const valorPrefill = document.getElementById('novaProjRrtValor').value;
    confirmarAddProjetoRRT('pD', 'projeto'); // usuário confirma o valor prefillado sem alterar
    const p = state.office.projetos.find((x) => x.id === 'pD');
    return { valorPrefill, valor: p.rrts[0].valor };
  });
  const ok = r.valorPrefill === '999' && r.valor === 999;
  return { ok, detail: `modal de nova RRT prefilla com o padrão VIGENTE=${r.valorPrefill} (esp. "999"); confirmado, o registro criado tem valor=${r.valor} (esp. 999)` };
}, 'item 1/2 — o modal de nova RRT prefilla com o padrão vigente do escritório (nunca cria automático sem confirmação), valor editável antes de confirmar');

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
    return { regraDistribuicao: p.regraDistribuicao, rrts: p.rrts, precisaConfig: projetoNecessitaConfiguracaoRRT(p), rrtRequirement: p.rrtRequirement };
  });
  const ok = r.regraDistribuicao === 'v2' && Array.isArray(r.rrts) && r.rrts.length === 0 && r.precisaConfig === true && r.rrtRequirement === 'pending';
  return { ok, detail: `projeto antigo ainda inteiramente previsto (nada realizado) — regraDistribuicao=${r.regraDistribuicao} (esp. v2), rrts=${JSON.stringify(r.rrts)} (esp. [], nunca inventada), rrtRequirement=${r.rrtRequirement} (esp. pending), precisaConfiguracaoRRT=${r.precisaConfig} (esp. true, sinalizado explicitamente)` };
}, 'item 5/6/21 do escopo de migração — projeto contratado ainda sem nada realizado migra pra v2 sem inventar RRT, com rrtRequirement=pending (nunca "none")');

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
      rrtRequirement: 'one', rrtRequirementConfirmedAt: '2026-09-01T12:00:00.000Z', rrtRequirementConfirmedBy: 'Perfil Teste',
      rrts: [{ id: 'rrtE1', tipo: 'projeto', valor: 111.11, status: 'emitida', numero: 'RRT-9', dataEmissao: '2026-09-05', dataPagamento: null, createdAt: 'rrtE1' }],
    });
    const exported1 = JSON.stringify(buildSaveObject());
    migrateAppData(JSON.parse(exported1));
    const exported2 = JSON.stringify(buildSaveObject());
    const p = state.office.projetos.find((x) => x.id === 'pE');
    return {
      idempotente: exported1 === exported2, impostoPercentual: state.office.impostoPercentual, rrtValorPadrao: state.office.rrtValorPadrao, rrt: p.rrts[0], regraDistribuicao: p.regraDistribuicao,
      rrtRequirement: p.rrtRequirement, rrtRequirementConfirmedAt: p.rrtRequirementConfirmedAt, rrtRequirementConfirmedBy: p.rrtRequirementConfirmedBy,
    };
  });
  const ok = r.idempotente && r.impostoPercentual === 7.5 && r.rrtValorPadrao === 321.09
    && r.rrt.valor === 111.11 && r.rrt.status === 'emitida' && r.rrt.numero === 'RRT-9' && r.rrt.dataEmissao === '2026-09-05'
    && r.regraDistribuicao === 'v2' && r.rrtRequirement === 'one' && r.rrtRequirementConfirmedAt === '2026-09-01T12:00:00.000Z' && r.rrtRequirementConfirmedBy === 'Perfil Teste';
  return { ok, detail: `export→import→export idêntico=${r.idempotente}; imposto=${r.impostoPercentual} (esp. 7.5), rrtValorPadrao=${r.rrtValorPadrao} (esp. 321.09), RRT preservada=${JSON.stringify(r.rrt)}, regra=${r.regraDistribuicao}, rrtRequirement=${r.rrtRequirement} (esp. one), confirmedAt=${r.rrtRequirementConfirmedAt}, confirmedBy=${r.rrtRequirementConfirmedBy}` };
}, 'item 17/18/25/26 — export/import round-trip preserva impostoPercentual, rrtValorPadrao, rrts, regraDistribuicao e a decisão de RRT (rrtRequirement/confirmedAt/confirmedBy); reimportar duas vezes produz o mesmo resultado (migração idempotente)');

// ═══════════════════════════════════════════════════════════════════════
// Correção pós-auditoria (achados P1/P2/P3 sobre a implementação 9983605)
// ═══════════════════════════════════════════════════════════════════════

// ---------------------------------------------------------------------------
// Achado P1 — projeto v2 sem RRT configurada nunca materializa distribuição
// ---------------------------------------------------------------------------
await setupBase();
await check('bloqueio-sem-rrt-nao-gera-repasse-nem-reserva', async () => {
  const r = await page.evaluate(() => {
    state.office.projetos.push({
      id: 'pF', nome: 'Projeto F', cliente: 'Cliente F', valorContrato: 1000, status: 'contratado',
      dataContrato: '2026-09-01', observacao: '', createdAt: 'pF', regraDistribuicao: 'v2', rrts: [],
    });
    state.office.impostoPercentual = 0; // isola o achado: mesmo com imposto 0%, sem RRT a distribuição fica bloqueada
    state.office.recebiveis.push({ id: 'recF1', projetoId: 'pF', descricao: 'Entrada', valor: 1000, estado: 'recebido', dataPrevista: '2026-09-20', dataRecebimento: '2026-09-20', contaDestino: 'oc1', createdAt: 'recF1' });
    syncDerivedPersonalTransfer('recF1');
    const repasse = state.office.repasses.find((rp) => rp.recebivelId === 'recF1');
    const movsReserva = state.office.movimentacoesReservas.filter((m) => m.origemRecebivelId === 'recF1');
    const rec = state.office.recebiveis.find((x) => x.id === 'recF1');
    const saldoOffice = calcSaldoOfficeConta('oc1');
    return { temRepasse: !!repasse, qtdMovsReserva: movsReserva.length, congelado: rec.provisionadoRealizadoCent !== undefined, saldoOffice };
  });
  const ok = r.temRepasse === false && r.qtdMovsReserva === 0 && r.congelado === false && r.saldoOffice === 1000;
  return { ok, detail: `projeto sem RRT, imposto 0%, recebido R$1000 — repasse=${r.temRepasse} (esp. false), movs reserva=${r.qtdMovsReserva} (esp. 0), congelado=${r.congelado} (esp. false, nunca provisiona sem RRT), saldo do caixa operacional=${r.saldoOffice} (esp. 1000 — o dinheiro entra no caixa mesmo com distribuição bloqueada)` };
}, 'Achado P1 item 1/2/3 — projeto v2 contratado sem nenhuma RRT configurada nunca gera repasse nem reserva, mas o recebimento real continua entrando no caixa operacional');

await check('bloqueio-mensagem-ui', async () => {
  const r = await page.evaluate(() => {
    renderOfficeProjetosTab();
    const html = document.getElementById('escritorioSubContent').innerHTML;
    return { contemMensagem: html.includes('Distribuição bloqueada: informe se o projeto exige RRT.') };
  });
  const ok = r.contemMensagem === true;
  return { ok, detail: `interface exibe a mensagem exata de bloqueio (estado 'pending') — contém=${r.contemMensagem}` };
}, 'Achado P1 — a interface informa claramente "Distribuição bloqueada: informe se o projeto exige RRT."');

await check('configurar-rrt-libera-distribuicao', async () => {
  const r = await page.evaluate(() => {
    setProjetoRrtRequirement('pF', 'one'); // decisão explícita precisa vir antes de qualquer RRT
    addProjetoRRT('pF', 'projeto'); // abre o modal — ainda não cria nada
    document.getElementById('novaProjRrtValor').value = '100';
    confirmarAddProjetoRRT('pF', 'projeto');
    const repasse = state.office.repasses.find((rp) => rp.recebivelId === 'recF1');
    const movsReserva = state.office.movimentacoesReservas.filter((m) => m.origemRecebivelId === 'recF1');
    const rec = state.office.recebiveis.find((x) => x.id === 'recF1');
    return { temRepasse: !!repasse, valorRepasse: repasse ? repasse.valor : null, qtdMovsReserva: movsReserva.length, provisionadoCent: rec.provisionadoRealizadoCent };
  });
  // imposto 0%, RRT 100 -> distribuível 900. repasse 65%=585, 4 reservas somando 315.
  const ok = r.temRepasse === true && r.valorRepasse === 585 && r.qtdMovsReserva === 4 && r.provisionadoCent === 10000;
  return { ok, detail: `configurar a RRT (100) depois do recebimento já realizado destrava a distribuição — repasse=${r.temRepasse}/${r.valorRepasse} (esp. true/585), movs reserva=${r.qtdMovsReserva} (esp. 4), provisionadoCent=${r.provisionadoCent} (esp. 10000=100)` };
}, 'Achado P1 item 7/4 — configurar a RRT depois do recebimento realizado sincroniza, provisiona e materializa a distribuição corretamente, sem inventar RRT=0');

await check('configurar-rrt-nao-duplica-ao-resync', async () => {
  const r = await page.evaluate(() => {
    resyncProjectV2('pF'); resyncProjectV2('pF'); syncDerivedPersonalTransfer('recF1');
    return {
      qtdRepasses: state.office.repasses.filter((rp) => rp.recebivelId === 'recF1').length,
      qtdReceitas: state.receitas.filter((x) => x.officeTransferId === 'off_recF1').length,
      qtdMovsReserva: state.office.movimentacoesReservas.filter((m) => m.origemRecebivelId === 'recF1').length,
    };
  });
  const ok = r.qtdRepasses === 1 && r.qtdReceitas === 1 && r.qtdMovsReserva === 4;
  return { ok, detail: `recalcular repetidamente depois de destravar — repasses=${r.qtdRepasses}, receitas=${r.qtdReceitas}, movs reserva=${r.qtdMovsReserva} (esp. 1,1,4, nunca duplicado)` };
}, 'Achado P1 item 5 — liberar a distribuição depois de configurar a RRT não duplica repasse, receita pessoal nem reserva em recálculos seguintes');

await check('rrtValorPadrao-null-nao-cria-automatico-com-zero', async () => {
  const r = await page.evaluate(() => {
    state.office.rrtValorPadrao = null;
    state.office.projetos.push({
      id: 'pZ', nome: 'Projeto Z', cliente: 'Cliente Z', valorContrato: 500, status: 'contratado',
      dataContrato: '2026-09-01', observacao: '', createdAt: 'pZ', regraDistribuicao: 'v2', rrts: [],
    });
    setProjetoRrtRequirement('pZ', 'one');
    addProjetoRRT('pZ', 'projeto'); // abre modal, não cria nada ainda
    const antesDeConfirmar = state.office.projetos.find((x) => x.id === 'pZ').rrts.length;
    document.getElementById('novaProjRrtValor').value = ''; // usuário deixa em branco
    confirmarAddProjetoRRT('pZ', 'projeto'); // deve ser rejeitado
    const depoisDeConfirmarVazio = state.office.projetos.find((x) => x.id === 'pZ').rrts.length;
    return { antesDeConfirmar, depoisDeConfirmarVazio };
  });
  const ok = r.antesDeConfirmar === 0 && r.depoisDeConfirmarVazio === 0;
  return { ok, detail: `rrtValorPadrao null — addProjetoRRT nunca cria nada sozinho (rrts=${r.antesDeConfirmar}, esp. 0), confirmar com o campo em branco também é rejeitado (rrts=${r.depoisDeConfirmarVazio}, esp. 0 — nunca vira R$0,00 automático)` };
}, 'Achado P1 item 4/5/6 — rrtValorPadrao null nunca cria uma RRT automática de valor zero; campo em branco no modal é rejeitado');

await check('rrt-valor-zero-aceito-se-confirmado-explicitamente', async () => {
  const r = await page.evaluate(() => {
    addProjetoRRT('pZ', 'projeto');
    document.getElementById('novaProjRrtValor').value = '0'; // usuário digita e confirma 0 de propósito
    confirmarAddProjetoRRT('pZ', 'projeto');
    const p = state.office.projetos.find((x) => x.id === 'pZ');
    return { qtd: p.rrts.length, valor: p.rrts[0] ? p.rrts[0].valor : null };
  });
  const ok = r.qtd === 1 && r.valor === 0;
  return { ok, detail: `usuário digita e confirma explicitamente 0 — RRT criada com valor=${r.valor} (esp. 0), qtd=${r.qtd} (esp. 1)` };
}, 'Achado P1 item 6 — valor zero só é aceito quando digitado e confirmado explicitamente pelo usuário, nunca como fallback automático');

// ---------------------------------------------------------------------------
// Achado P2 — recebível v2 materializado não pode reverter para previsto/cancelado
// ---------------------------------------------------------------------------
await check('setup-materializado-para-reversao', async () => {
  const r = await page.evaluate(() => {
    const saldoOperacionalAntes = getOfficeOperationalBalance();
    const saldoReservasAntes = getOfficeReservedBalance();
    state.office.projetos.push({
      id: 'pG', nome: 'Projeto G', cliente: 'Cliente G', valorContrato: 1000, status: 'contratado',
      dataContrato: '2026-09-01', observacao: '', createdAt: 'pG', regraDistribuicao: 'v2',
      rrtRequirement: 'one', rrtRequirementConfirmedAt: '2026-09-01T00:00:00.000Z', rrtRequirementConfirmedBy: null,
      rrts: [{ id: 'rrtG1', tipo: 'projeto', valor: 0, status: 'prevista', numero: '', dataEmissao: null, dataPagamento: null, createdAt: 'rrtG1' }],
    });
    state.office.impostoPercentual = 0;
    state.office.recebiveis.push({ id: 'recG1', projetoId: 'pG', descricao: 'Entrada', valor: 1000, estado: 'recebido', dataPrevista: '2026-09-20', dataRecebimento: '2026-09-20', contaDestino: 'oc1', createdAt: 'recG1' });
    syncDerivedPersonalTransfer('recG1');
    const deltaOperacional = getOfficeOperationalBalance() - saldoOperacionalAntes;
    const deltaReservas = getOfficeReservedBalance() - saldoReservasAntes;
    const materializado = recebivelV2Materializado(state.office.recebiveis.find((x) => x.id === 'recG1'));
    return { deltaOperacional, deltaReservas, materializado };
  });
  const ok = r.materializado === true && Math.round(r.deltaOperacional * 100) === 65000 && Math.round(r.deltaReservas * 100) === 35000;
  return { ok, detail: `imposto 0%, RRT 0, recebido R$1000 — materializado=${r.materializado} (esp. true), delta operacional=${r.deltaOperacional} (esp. 650 — 1000 recebido menos 350 aplicado nas reservas), delta reservas=${r.deltaReservas} (esp. 350)` };
}, 'setup — recebível v2 totalmente materializado (repasse previsto + 4 reservas aplicadas), base pra testar a proteção de reversão');

await check('reversao-para-previsto-bloqueada', async () => {
  const r = await page.evaluate(() => {
    const antes = JSON.stringify(state.office.recebiveis.find((x) => x.id === 'recG1'));
    openEditOfficeRecebivel('recG1');
    const selectDisabled = document.getElementById('eRecebEstado').disabled;
    // Contorna o disabled da UI de propósito — a proteção real precisa estar
    // na função de gravação, não só no atributo disabled do campo.
    document.getElementById('eRecebEstado').disabled = false;
    document.getElementById('eRecebEstado').value = 'previsto';
    saveEditOfficeRecebivel('recG1');
    const depois = JSON.stringify(state.office.recebiveis.find((x) => x.id === 'recG1'));
    return { selectDisabled, inalterado: antes === depois };
  });
  const ok = r.selectDisabled === true && r.inalterado === true;
  return { ok, detail: `UI desabilita o campo de estado (disabled=${r.selectDisabled}, esp. true); mesmo contornando o disabled e chamando saveEditOfficeRecebivel diretamente com estado='previsto', nada muda (inalterado=${r.inalterado}, esp. true)` };
}, 'Achado P2 item 1/2/3/8/10 — recebível v2 materializado não pode voltar para previsto, nem pela UI nem por chamada direta contornando o disabled');

await check('reversao-para-cancelado-bloqueada', async () => {
  const r = await page.evaluate(() => {
    const antes = JSON.stringify(state.office.recebiveis.find((x) => x.id === 'recG1'));
    openEditOfficeRecebivel('recG1');
    document.getElementById('eRecebEstado').disabled = false;
    document.getElementById('eRecebEstado').value = 'cancelado';
    saveEditOfficeRecebivel('recG1');
    const depois = JSON.stringify(state.office.recebiveis.find((x) => x.id === 'recG1'));
    return { inalterado: antes === depois };
  });
  const ok = r.inalterado === true;
  return { ok, detail: `tentativa de cancelar um recebível já materializado — estado inalterado=${r.inalterado} (esp. true)` };
}, 'Achado P2 item 1/2/9 — recebível v2 materializado não pode ser cancelado');

await check('tentativa-bloqueada-nao-altera-caixa-reservas-repasse', async () => {
  const r = await page.evaluate(() => {
    const antes = {
      saldoOperacional: getOfficeOperationalBalance(), saldoReservas: getOfficeReservedBalance(),
      qtdMovsReserva: state.office.movimentacoesReservas.filter((m) => m.origemRecebivelId === 'recG1').length,
      repasse: JSON.stringify(state.office.repasses.find((rp) => rp.recebivelId === 'recG1')),
    };
    openEditOfficeRecebivel('recG1');
    document.getElementById('eRecebEstado').disabled = false;
    document.getElementById('eRecebEstado').value = 'previsto';
    saveEditOfficeRecebivel('recG1');
    const depois = {
      saldoOperacional: getOfficeOperationalBalance(), saldoReservas: getOfficeReservedBalance(),
      qtdMovsReserva: state.office.movimentacoesReservas.filter((m) => m.origemRecebivelId === 'recG1').length,
      repasse: JSON.stringify(state.office.repasses.find((rp) => rp.recebivelId === 'recG1')),
    };
    return { antes, depois };
  });
  const ok = r.antes.saldoOperacional === r.depois.saldoOperacional && r.antes.saldoReservas === r.depois.saldoReservas
    && r.antes.qtdMovsReserva === r.depois.qtdMovsReserva && r.antes.repasse === r.depois.repasse;
  return { ok, detail: `tentativa bloqueada de reversão — saldo operacional (${r.antes.saldoOperacional}→${r.depois.saldoOperacional}), reservas (${r.antes.saldoReservas}→${r.depois.saldoReservas}), movs reserva (${r.antes.qtdMovsReserva}→${r.depois.qtdMovsReserva}), repasse inalterado=${r.antes.repasse === r.depois.repasse} — nada muda` };
}, 'Achado P2 item 10 — uma tentativa bloqueada de reversão não altera estado, caixa, reservas nem repasse');

await check('valor-conta-data-imutaveis-apos-materializacao', async () => {
  const r = await page.evaluate(() => {
    const recAntes = JSON.parse(JSON.stringify(state.office.recebiveis.find((x) => x.id === 'recG1')));
    openEditOfficeRecebivel('recG1');
    const valorDisabled = document.getElementById('eRecebValor').disabled;
    const contaDisabled = document.getElementById('eRecebConta').disabled;
    const dataDisabled = document.getElementById('eRecebDataRecebimento').disabled;
    // Contorna o disabled e tenta mudar valor/conta diretamente, mantendo o
    // mesmo estado (pra isolar especificamente a proteção de valor/conta).
    document.getElementById('eRecebValor').disabled = false; document.getElementById('eRecebValor').value = '999999';
    document.getElementById('eRecebConta').disabled = false;
    document.getElementById('eRecebEstado').value = 'recebido';
    saveEditOfficeRecebivel('recG1');
    const recDepois = state.office.recebiveis.find((x) => x.id === 'recG1');
    return { valorDisabled, contaDisabled, dataDisabled, valorInalterado: recDepois.valor === recAntes.valor };
  });
  const ok = r.valorDisabled === true && r.contaDisabled === true && r.dataDisabled === true && r.valorInalterado === true;
  return { ok, detail: `campos desabilitados na UI (valor=${r.valorDisabled}, conta=${r.contaDisabled}, data=${r.dataDisabled}, esp. true nos três); mesmo contornando, o valor não muda=${r.valorInalterado} (esp. true)` };
}, 'Achado P2 item 8 — valor, conta de destino e data real de um recebível já materializado ficam imutáveis, mesmo contornando o disabled da UI');

// ---------------------------------------------------------------------------
// Achado P3 — reconciliação cumulativa por destino (soma bate com o projeto inteiro)
// ---------------------------------------------------------------------------
await check('reconciliacao-cumulativa-tres-parcelas', async () => {
  const r = await page.evaluate(() => {
    state.office.projetos.push({
      id: 'pH', nome: 'Projeto H', cliente: 'Cliente H', valorContrato: 1000, status: 'contratado',
      dataContrato: '2026-09-01', observacao: '', createdAt: 'pH', regraDistribuicao: 'v2',
      rrtRequirement: 'one', rrtRequirementConfirmedAt: '2026-09-01T00:00:00.000Z', rrtRequirementConfirmedBy: null,
      rrts: [{ id: 'rrtH1', tipo: 'projeto', valor: 0, status: 'prevista', numero: '', dataEmissao: null, dataPagamento: null, createdAt: 'rrtH1' }],
    });
    state.office.impostoPercentual = 0;
    const valores = { a: 333.33, b: 333.33, c: 333.34 };
    ['a', 'b', 'c'].forEach((suf, i) => {
      const id = 'recH' + suf;
      state.office.recebiveis.push({ id, projetoId: 'pH', descricao: 'Parcela ' + (i + 1), valor: valores[suf], estado: 'recebido', dataPrevista: '2026-09-2' + (i + 1), dataRecebimento: '2026-09-2' + (i + 1), contaDestino: 'oc1', createdAt: id });
      syncDerivedPersonalTransfer(id);
    });
    const ids = ['recHa', 'recHb', 'recHc'];
    const repasseTotal = state.office.repasses.filter((rp) => ids.includes(rp.recebivelId)).reduce((s, rp) => s + rp.valor, 0);
    const reservaTotal = (destino) => state.office.movimentacoesReservas.filter((m) => m.origemDestino === destino && ids.includes(m.origemRecebivelId)).reduce((s, m) => s + m.valor, 0);
    return {
      repasseTotal, operacaoTotal: reservaTotal('operacao'), crescimentoTotal: reservaTotal('reserva_crescimento'),
      capitalGiroTotal: reservaTotal('capital_giro'), marketingTotal: reservaTotal('marketing'),
    };
  });
  const ok = r.repasseTotal === 650 && r.operacaoTotal === 150 && r.crescimentoTotal === 100 && r.capitalGiroTotal === 70 && r.marketingTotal === 30;
  return { ok, detail: `esperado repasse=650 operacao=150 crescimento=100 capitalGiro=70 marketing=30 — obtido: ${JSON.stringify(r)}` };
}, 'Achado P3 item 12 — três parcelas de R$333,33/333,33/333,34 fecham exatamente com a divisão do projeto inteiro (650/150/100/70/30), nunca 650,01/69,99');

await check('reconciliacao-ordem-nao-afeta-totais-finais', async () => {
  const r = await page.evaluate(() => {
    state.office.projetos.push({
      id: 'pI', nome: 'Projeto I', cliente: 'Cliente I', valorContrato: 1000, status: 'contratado',
      dataContrato: '2026-09-01', observacao: '', createdAt: 'pI', regraDistribuicao: 'v2',
      rrtRequirement: 'one', rrtRequirementConfirmedAt: '2026-09-01T00:00:00.000Z', rrtRequirementConfirmedBy: null,
      rrts: [{ id: 'rrtI1', tipo: 'projeto', valor: 0, status: 'prevista', numero: '', dataEmissao: null, dataPagamento: null, createdAt: 'rrtI1' }],
    });
    state.office.impostoPercentual = 0;
    const valores = { a: 333.33, b: 333.33, c: 333.34 };
    const datas = { a: '2026-09-21', b: '2026-09-22', c: '2026-09-23' };
    ['a', 'b', 'c'].forEach((suf) => {
      state.office.recebiveis.push({ id: 'recI' + suf, projetoId: 'pI', descricao: 'Parcela', valor: valores[suf], estado: 'previsto', dataPrevista: datas[suf], dataRecebimento: null, contaDestino: 'oc1', createdAt: 'recI' + suf });
    });
    // Realiza fora da ordem de criação: c, depois a, depois b.
    ['c', 'a', 'b'].forEach((suf) => {
      const rec = state.office.recebiveis.find((x) => x.id === 'recI' + suf);
      rec.estado = 'recebido'; rec.dataRecebimento = datas[suf];
      syncDerivedPersonalTransfer('recI' + suf);
    });
    const ids = ['recIa', 'recIb', 'recIc'];
    const repasseTotal = state.office.repasses.filter((rp) => ids.includes(rp.recebivelId)).reduce((s, rp) => s + rp.valor, 0);
    const reservaTotal = (destino) => state.office.movimentacoesReservas.filter((m) => m.origemDestino === destino && ids.includes(m.origemRecebivelId)).reduce((s, m) => s + m.valor, 0);
    return {
      repasseTotal, operacaoTotal: reservaTotal('operacao'), crescimentoTotal: reservaTotal('reserva_crescimento'),
      capitalGiroTotal: reservaTotal('capital_giro'), marketingTotal: reservaTotal('marketing'),
    };
  });
  const ok = r.repasseTotal === 650 && r.operacaoTotal === 150 && r.crescimentoTotal === 100 && r.capitalGiroTotal === 70 && r.marketingTotal === 30;
  return { ok, detail: `mesmos valores (333.33/333.33/333.34), realizados fora de ordem (c, a, b) — totais finais: ${JSON.stringify(r)} (esp. 650/150/100/70/30, idênticos ao teste anterior)` };
}, 'Achado P3 item 13 — a ordem de realização dos recebíveis não altera os totais finais por destino');

await check('reconciliacao-muitos-recebiveis-pequenos', async () => {
  const r = await page.evaluate(() => {
    state.office.projetos.push({
      id: 'pJ', nome: 'Projeto J', cliente: 'Cliente J', valorContrato: 1000, status: 'contratado',
      dataContrato: '2026-09-01', observacao: '', createdAt: 'pJ', regraDistribuicao: 'v2',
      rrtRequirement: 'one', rrtRequirementConfirmedAt: '2026-09-01T00:00:00.000Z', rrtRequirementConfirmedBy: null,
      rrts: [{ id: 'rrtJ1', tipo: 'projeto', valor: 0, status: 'prevista', numero: '', dataEmissao: null, dataPagamento: null, createdAt: 'rrtJ1' }],
    });
    state.office.impostoPercentual = 0;
    const n = 37;
    const totalCent = 100000;
    const base = Math.floor(totalCent / n);
    const resto = totalCent - base * n;
    const ids = [];
    for (let i = 0; i < n; i++) {
      const valorCent = base + (i === n - 1 ? resto : 0);
      const id = 'recJ' + i;
      ids.push(id);
      state.office.recebiveis.push({ id, projetoId: 'pJ', descricao: 'Parcela ' + i, valor: valorCent / 100, estado: 'recebido', dataPrevista: '2026-10-01', dataRecebimento: '2026-10-01', contaDestino: 'oc1', createdAt: id });
      syncDerivedPersonalTransfer(id);
    }
    // Soma em centavos inteiros — evita que o próprio somatório do TESTE
    // (não a lógica em produção, que já soma em centavos) introduza ruído
    // de ponto flutuante ao somar 37+ parcelas de reais.
    const centOf = (v) => Math.round(v * 100);
    const repasseTotalCent = state.office.repasses.filter((rp) => ids.includes(rp.recebivelId)).reduce((s, rp) => s + centOf(rp.valor), 0);
    const reservaTotalCent = (destino) => state.office.movimentacoesReservas.filter((m) => m.origemDestino === destino && ids.includes(m.origemRecebivelId)).reduce((s, m) => s + centOf(m.valor), 0);
    const somaTudoCent = repasseTotalCent + reservaTotalCent('operacao') + reservaTotalCent('reserva_crescimento') + reservaTotalCent('capital_giro') + reservaTotalCent('marketing');
    return {
      repasseTotal: repasseTotalCent / 100, operacaoTotal: reservaTotalCent('operacao') / 100, crescimentoTotal: reservaTotalCent('reserva_crescimento') / 100,
      capitalGiroTotal: reservaTotalCent('capital_giro') / 100, marketingTotal: reservaTotalCent('marketing') / 100, somaTudo: somaTudoCent / 100,
    };
  });
  const ok = r.repasseTotal === 650 && r.operacaoTotal === 150 && r.crescimentoTotal === 100 && r.capitalGiroTotal === 70 && r.marketingTotal === 30 && r.somaTudo === 1000;
  return { ok, detail: `37 recebíveis pequenos somando R$1000,00 exato — totais finais: ${JSON.stringify(r)} (esp. 650/150/100/70/30, soma=1000, sem desvio sistemático)` };
}, 'Achado P3 item 14 — muitos recebíveis pequenos do mesmo projeto não acumulam desvio de arredondamento; a soma final bate exatamente com a divisão do projeto inteiro');

await check('resync-nao-duplica-muitos-recebiveis', async () => {
  const r = await page.evaluate(() => {
    const centOf = (v) => Math.round(v * 100);
    const totalOfCent = () => state.office.repasses.filter((rp) => state.office.recebiveis.some((x) => x.projetoId === 'pJ' && x.id === rp.recebivelId)).reduce((s, rp) => s + centOf(rp.valor), 0)
      + state.office.movimentacoesReservas.filter((m) => state.office.recebiveis.some((x) => x.projetoId === 'pJ' && x.id === m.origemRecebivelId)).reduce((s, m) => s + centOf(m.valor), 0);
    const totalAntes = totalOfCent() / 100;
    resyncProjectV2('pJ'); resyncProjectV2('pJ'); resyncProjectV2('pJ');
    const totalDepois = totalOfCent() / 100;
    return { totalAntes, totalDepois };
  });
  const ok = r.totalAntes === 1000 && r.totalDepois === 1000;
  return { ok, detail: `total materializado antes=${r.totalAntes}, depois de 3 resyncs=${r.totalDepois} (esp. ambos 1000, sem duplicar nem divergir)` };
}, 'Achado P1/P3 item 15 — reexecutar a sincronização sobre muitos recebíveis já materializados não cria diferenças nem duplicações');

// ---------------------------------------------------------------------------
// Item 16 — projeto legado continua usando exclusivamente o motor antigo
// ---------------------------------------------------------------------------
await check('projeto-legado-motor-antigo-intocado', async () => {
  const r = await page.evaluate(() => {
    state.office.projetos.push({ id: 'pLegacyCheck', nome: 'Projeto Legado', cliente: 'X', valorContrato: 2000, status: 'contratado', dataContrato: '2026-01-01', observacao: '', createdAt: 'pLegacyCheck', regraDistribuicao: 'legacy' });
    state.office.regrasDistribuicao.find((x) => x.destino === 'reserva').percentual = 40;
    state.office.regrasDistribuicao.find((x) => x.destino === 'impostos').percentual = 30;
    state.office.regrasDistribuicao.find((x) => x.destino === 'repasse_pessoal').percentual = 30;
    state.office.recebiveis.push({ id: 'recLegacyCheck', projetoId: 'pLegacyCheck', descricao: 'Entrada', valor: 2000, estado: 'previsto', dataPrevista: '2026-01-10', dataRecebimento: null, contaDestino: 'oc1', createdAt: 'recLegacyCheck' });
    syncDerivedPersonalTransfer('recLegacyCheck');
    const repasse = state.office.repasses.find((rp) => rp.recebivelId === 'recLegacyCheck');
    return { valor: repasse ? repasse.valor : null };
  });
  const ok = r.valor === 600; // 2000 × 30% do valor BRUTO — regra antiga, sem dedução de imposto/RRT
  return { ok, detail: `projeto 'legacy' continua usando o cálculo bruto antigo — repasse=${r.valor} (esp. 600 = 2000×30% do bruto, sem imposto/RRT deduzidos)` };
}, 'Achado item 16 — projeto legado continua usando exclusivamente o motor antigo (calculateOfficeDistribution sobre o valor bruto), nunca a regra líquida nova');

// ═══════════════════════════════════════════════════════════════════════
// Correção da segunda rodada de auditoria (achado P1: paradoxo de Alabama
// no rateio cumulativo — maior resto não é monotônico, podia materializar
// dinheiro fantasma). distribuirReceitaLiquidaCent passou a usar Sainte-
// Laguë (método de divisor, monotônico por construção).
// ═══════════════════════════════════════════════════════════════════════

// Materializa, em sequência, uma lista de recebíveis (em reais) de um
// projeto v2 com imposto 0% e uma RRT explicitamente configurada em
// R$0,00 (garante distribuível == soma dos recebíveis, sem provisão
// consumindo nada) — devolve, pra cada recebível, sua fatia por destino
// (nunca negativa) e a validação de que a soma bate com seu próprio
// distribuível, além dos totais finais agregados por destino.
async function materializarSequencial(page, projetoId, valoresReais, contratoReais) {
  return page.evaluate(({ projetoId, valoresReais, contratoReais }) => {
    state.office.projetos.push({
      id: projetoId, nome: 'Projeto ' + projetoId, cliente: 'Cliente', valorContrato: contratoReais, status: 'contratado',
      dataContrato: '2026-09-01', observacao: '', createdAt: projetoId, regraDistribuicao: 'v2',
      rrtRequirement: 'one', rrtRequirementConfirmedAt: '2026-09-01T00:00:00.000Z', rrtRequirementConfirmedBy: null,
      rrts: [{ id: 'rrt_' + projetoId, tipo: 'projeto', valor: 0, status: 'prevista', numero: '', dataEmissao: null, dataPagamento: null, createdAt: 'rrt_' + projetoId }],
    });
    state.office.impostoPercentual = 0;
    const centOf = (v) => Math.round(v * 100);
    const ids = [];
    const porRecebivel = [];
    valoresReais.forEach((valor, i) => {
      const id = projetoId + '_r' + i;
      ids.push(id);
      state.office.recebiveis.push({ id, projetoId, descricao: 'Parcela ' + i, valor, estado: 'recebido', dataPrevista: '2026-10-01', dataRecebimento: '2026-10-01', contaDestino: 'oc1', createdAt: id });
      syncDerivedPersonalTransfer(id);
      const rec = state.office.recebiveis.find((x) => x.id === id);
      const repasse = state.office.repasses.find((rp) => rp.recebivelId === id);
      const movs = state.office.movimentacoesReservas.filter((m) => m.origemRecebivelId === id);
      const porDestinoCent = { ...(rec.porDestinoRealizadoCent || {}) };
      const somaDestinosCent = Object.values(porDestinoCent).reduce((s, v) => s + v, 0);
      porRecebivel.push({
        valor, distribuivelCent: rec.distribuivelRealizadoCent, porDestinoCent, somaDestinosCent,
        repasseValorCent: repasse ? centOf(repasse.valor) : 0,
        movsNegativas: Object.values(porDestinoCent).some((v) => v < 0) || movs.some((m) => m.valor < 0) || (repasse && repasse.valor < 0),
      });
    });
    const repasseTotalCent = state.office.repasses.filter((rp) => ids.includes(rp.recebivelId)).reduce((s, rp) => s + centOf(rp.valor), 0);
    const reservaTotalCent = (destino) => state.office.movimentacoesReservas.filter((m) => m.origemDestino === destino && ids.includes(m.origemRecebivelId)).reduce((s, m) => s + centOf(m.valor), 0);
    const totalDistribuivelCent = state.office.recebiveis.filter((r) => ids.includes(r.id)).reduce((s, r) => s + (r.distribuivelRealizadoCent || 0), 0);
    return {
      porRecebivel,
      totais: {
        repasse_pessoal: repasseTotalCent, operacao: reservaTotalCent('operacao'), reserva_crescimento: reservaTotalCent('reserva_crescimento'),
        capital_giro: reservaTotalCent('capital_giro'), marketing: reservaTotalCent('marketing'),
      },
      totalDistribuivelCent,
      somaTotaisCent: repasseTotalCent + reservaTotalCent('operacao') + reservaTotalCent('reserva_crescimento') + reservaTotalCent('capital_giro') + reservaTotalCent('marketing'),
    };
  }, { projetoId, valoresReais, contratoReais });
}

const ESPERADO_15_CENTAVOS = { repasse_pessoal: 10, operacao: 2, reserva_crescimento: 2, capital_giro: 1, marketing: 0 };

await check('alabama-14-depois-1-centavo', async () => {
  const r = await materializarSequencial(page, 'pAla1', [0.14, 0.01], 0.15);
  const semNegativo = r.porRecebivel.every((x) => !x.movsNegativas);
  const somaPorRecebivelBate = r.porRecebivel.every((x) => x.somaDestinosCent === x.distribuivelCent);
  const totaisBatem = JSON.stringify(r.totais) === JSON.stringify(ESPERADO_15_CENTAVOS);
  const ok = semNegativo && somaPorRecebivelBate && totaisBatem && r.somaTotaisCent === 15 && r.totalDistribuivelCent === 15;
  return { ok, detail: `R$0,14 depois R$0,01 — porRecebivel=${JSON.stringify(r.porRecebivel)}, totais=${JSON.stringify(r.totais)} (esp. ${JSON.stringify(ESPERADO_15_CENTAVOS)}), semNegativo=${semNegativo}, somaPorRecebivelBate=${somaPorRecebivelBate}` };
}, 'Achado P1 (2ª rodada) — reprodução mínima: R$0,14 seguido de R$0,01 nunca gera alocação negativa e fecha em 10/2/2/1/0 centavos, nunca 16');

await check('alabama-1-centavo-depois-14', async () => {
  const r = await materializarSequencial(page, 'pAla2', [0.01, 0.14], 0.15);
  const semNegativo = r.porRecebivel.every((x) => !x.movsNegativas);
  const somaPorRecebivelBate = r.porRecebivel.every((x) => x.somaDestinosCent === x.distribuivelCent);
  const totaisBatem = JSON.stringify(r.totais) === JSON.stringify(ESPERADO_15_CENTAVOS);
  const ok = semNegativo && somaPorRecebivelBate && totaisBatem && r.somaTotaisCent === 15;
  return { ok, detail: `R$0,01 depois R$0,14 (ordem invertida) — totais=${JSON.stringify(r.totais)} (esp. ${JSON.stringify(ESPERADO_15_CENTAVOS)}, idênticos independente da ordem), semNegativo=${semNegativo}, somaPorRecebivelBate=${somaPorRecebivelBate}` };
}, 'Achado P1 (2ª rodada) — R$0,01 seguido de R$0,14 (ordem invertida) produz os mesmos totais finais, sem alocação negativa');

await check('alabama-100-14-depois-1-centavo', async () => {
  const r = await materializarSequencial(page, 'pAla3', [100.14, 0.01], 100.15);
  const semNegativo = r.porRecebivel.every((x) => !x.movsNegativas);
  const somaPorRecebivelBate = r.porRecebivel.every((x) => x.somaDestinosCent === x.distribuivelCent);
  const ok = semNegativo && somaPorRecebivelBate && r.somaTotaisCent === 10015 && r.totalDistribuivelCent === 10015;
  return { ok, detail: `R$100,14 depois R$0,01 — totais=${JSON.stringify(r.totais)}, soma=${r.somaTotaisCent} (esp. 10015), semNegativo=${semNegativo}, somaPorRecebivelBate=${somaPorRecebivelBate}` };
}, 'Achado P1 (2ª rodada) — caso realista R$100,14 seguido de R$0,01: sem alocação negativa, soma bate exatamente');

await check('alabama-1-centavo-depois-100-14', async () => {
  const r = await materializarSequencial(page, 'pAla4', [0.01, 100.14], 100.15);
  const semNegativo = r.porRecebivel.every((x) => !x.movsNegativas);
  const somaPorRecebivelBate = r.porRecebivel.every((x) => x.somaDestinosCent === x.distribuivelCent);
  const ok = semNegativo && somaPorRecebivelBate && r.somaTotaisCent === 10015;
  return { ok, detail: `R$0,01 depois R$100,14 (ordem invertida) — totais=${JSON.stringify(r.totais)}, soma=${r.somaTotaisCent} (esp. 10015), semNegativo=${semNegativo}, somaPorRecebivelBate=${somaPorRecebivelBate}` };
}, 'Achado P1 (2ª rodada) — R$0,01 seguido de R$100,14 (ordem invertida) produz o mesmo total final, sem alocação negativa');

await check('alabama-totais-100-14-independem-da-ordem', async () => {
  const r3 = await page.evaluate(() => {
    const ids = ['pAla3_r0', 'pAla3_r1'];
    const centOf = (v) => Math.round(v * 100);
    const repasseTotalCent = state.office.repasses.filter((rp) => ids.includes(rp.recebivelId)).reduce((s, rp) => s + centOf(rp.valor), 0);
    const reservaTotalCent = (destino) => state.office.movimentacoesReservas.filter((m) => m.origemDestino === destino && ids.includes(m.origemRecebivelId)).reduce((s, m) => s + centOf(m.valor), 0);
    return { repasse_pessoal: repasseTotalCent, operacao: reservaTotalCent('operacao'), reserva_crescimento: reservaTotalCent('reserva_crescimento'), capital_giro: reservaTotalCent('capital_giro'), marketing: reservaTotalCent('marketing') };
  });
  const r4 = await page.evaluate(() => {
    const ids = ['pAla4_r0', 'pAla4_r1'];
    const centOf = (v) => Math.round(v * 100);
    const repasseTotalCent = state.office.repasses.filter((rp) => ids.includes(rp.recebivelId)).reduce((s, rp) => s + centOf(rp.valor), 0);
    const reservaTotalCent = (destino) => state.office.movimentacoesReservas.filter((m) => m.origemDestino === destino && ids.includes(m.origemRecebivelId)).reduce((s, m) => s + centOf(m.valor), 0);
    return { repasse_pessoal: repasseTotalCent, operacao: reservaTotalCent('operacao'), reserva_crescimento: reservaTotalCent('reserva_crescimento'), capital_giro: reservaTotalCent('capital_giro'), marketing: reservaTotalCent('marketing') };
  });
  const ok = JSON.stringify(r3) === JSON.stringify(r4);
  return { ok, detail: `R$100,15 dividido em 100,14+0,01 vs 0,01+100,14 — totais finais idênticos=${ok}: ${JSON.stringify(r3)} vs ${JSON.stringify(r4)}` };
}, 'Achado P1 (2ª rodada) item 5 — o total final por destino depende só do total realizado, nunca da ordem das parcelas');

await check('alabama-muitas-parcelas-pequenas-irregulares', async () => {
  const r = await page.evaluate(() => {
    state.office.projetos.push({
      id: 'pAla5', nome: 'Projeto Alabama 5', cliente: 'Cliente', valorContrato: 1000, status: 'contratado',
      dataContrato: '2026-09-01', observacao: '', createdAt: 'pAla5', regraDistribuicao: 'v2',
      rrtRequirement: 'one', rrtRequirementConfirmedAt: '2026-09-01T00:00:00.000Z', rrtRequirementConfirmedBy: null,
      rrts: [{ id: 'rrt_pAla5', tipo: 'projeto', valor: 0, status: 'prevista', numero: '', dataEmissao: null, dataPagamento: null, createdAt: 'rrt_pAla5' }],
    });
    state.office.impostoPercentual = 0;
    // 41 parcelas irregulares (não múltiplas exatas de 100), soma exata em
    // centavos via resto na última — testa exatamente o cenário que
    // provoca o paradoxo de Alabama com mais frequência (totais
    // intermediários "feios").
    const n = 41, totalCent = 100000;
    const base = Math.floor(totalCent / n), resto = totalCent - base * n;
    const ids = [];
    let algumaNegativa = false, somaOk = true;
    for (let i = 0; i < n; i++) {
      const valorCent = base + (i === n - 1 ? resto : 0);
      const id = 'recAla5_' + i; ids.push(id);
      state.office.recebiveis.push({ id, projetoId: 'pAla5', descricao: 'P' + i, valor: valorCent / 100, estado: 'recebido', dataPrevista: '2026-10-01', dataRecebimento: '2026-10-01', contaDestino: 'oc1', createdAt: id });
      syncDerivedPersonalTransfer(id);
      const rec = state.office.recebiveis.find((x) => x.id === id);
      const porDestinoCent = rec.porDestinoRealizadoCent || {};
      if (Object.values(porDestinoCent).some((v) => v < 0)) algumaNegativa = true;
      const soma = Object.values(porDestinoCent).reduce((s, v) => s + v, 0);
      if (soma !== rec.distribuivelRealizadoCent) somaOk = false;
    }
    const centOf = (v) => Math.round(v * 100);
    const repasseTotalCent = state.office.repasses.filter((rp) => ids.includes(rp.recebivelId)).reduce((s, rp) => s + centOf(rp.valor), 0);
    const reservaTotalCent = (destino) => state.office.movimentacoesReservas.filter((m) => m.origemDestino === destino && ids.includes(m.origemRecebivelId)).reduce((s, m) => s + centOf(m.valor), 0);
    const somaTotal = repasseTotalCent + reservaTotalCent('operacao') + reservaTotalCent('reserva_crescimento') + reservaTotalCent('capital_giro') + reservaTotalCent('marketing');
    return { algumaNegativa, somaOk, repasseTotalCent, somaTotal };
  });
  const ok = r.algumaNegativa === false && r.somaOk === true && r.repasseTotalCent === 65000 && r.somaTotal === 100000;
  return { ok, detail: `41 parcelas irregulares somando R$1000,00 — nenhuma alocação negativa=${!r.algumaNegativa}, soma por recebível sempre bate=${r.somaOk}, repasse total=${r.repasseTotalCent} (esp. 65000), soma geral=${r.somaTotal} (esp. 100000)` };
}, 'Achado P1 (2ª rodada) item 14 — muitas parcelas pequenas e irregulares (propensas ao paradoxo de Alabama) nunca geram alocação negativa nem desvio na soma total');

// ═══════════════════════════════════════════════════════════════════════
// Correção da terceira rodada de auditoria (achado P1: desempate
// inconsistente entre prioridadeGanhar/prioridadePerder ainda quebrava a
// monotonicidade — caso R$0,49→R$0,50, pesos 65/15/10/7/3, repasse caía de
// 33 pra 32). distribuirReceitaLiquidaCent passou a usar SÓ estimativa por
// PISO (nunca arredondamento) + acréscimo — nunca precisa remover, elimina
// a segunda função de desempate inteiramente.
// ═══════════════════════════════════════════════════════════════════════

const ESPERADO_50_CENTAVOS = { repasse_pessoal: 33, operacao: 8, reserva_crescimento: 5, capital_giro: 3, marketing: 1 };

await check('alabama3-49-depois-1-centavo', async () => {
  const r = await materializarSequencial(page, 'pAla6', [0.49, 0.01], 0.50);
  const semNegativo = r.porRecebivel.every((x) => !x.movsNegativas);
  const somaPorRecebivelBate = r.porRecebivel.every((x) => x.somaDestinosCent === x.distribuivelCent);
  const totaisBatem = JSON.stringify(r.totais) === JSON.stringify(ESPERADO_50_CENTAVOS);
  const ok = semNegativo && somaPorRecebivelBate && totaisBatem && r.somaTotaisCent === 50 && r.totalDistribuivelCent === 50;
  return { ok, detail: `R$0,49 depois R$0,01 — porRecebivel=${JSON.stringify(r.porRecebivel)}, totais=${JSON.stringify(r.totais)} (esp. ${JSON.stringify(ESPERADO_50_CENTAVOS)}), semNegativo=${semNegativo}, somaPorRecebivelBate=${somaPorRecebivelBate}` };
}, 'Achado P1 (3ª rodada) — reprodução mínima: R$0,49 seguido de R$0,01 nunca gera alocação negativa e fecha em 33/8/5/3/1 centavos, nunca desvia (repasse nunca cai de 33 pra 32)');

await check('alabama3-1-centavo-depois-49', async () => {
  const r = await materializarSequencial(page, 'pAla7', [0.01, 0.49], 0.50);
  const semNegativo = r.porRecebivel.every((x) => !x.movsNegativas);
  const somaPorRecebivelBate = r.porRecebivel.every((x) => x.somaDestinosCent === x.distribuivelCent);
  const totaisBatem = JSON.stringify(r.totais) === JSON.stringify(ESPERADO_50_CENTAVOS);
  const ok = semNegativo && somaPorRecebivelBate && totaisBatem && r.somaTotaisCent === 50;
  return { ok, detail: `R$0,01 depois R$0,49 (ordem invertida) — totais=${JSON.stringify(r.totais)} (esp. ${JSON.stringify(ESPERADO_50_CENTAVOS)}, idênticos independente da ordem), semNegativo=${semNegativo}, somaPorRecebivelBate=${somaPorRecebivelBate}` };
}, 'Achado P1 (3ª rodada) — R$0,01 seguido de R$0,49 (ordem invertida) produz os mesmos totais finais, sem alocação negativa');

await check('alabama3-totais-49-independem-da-ordem', async () => {
  const totalOf = async (projetoId) => page.evaluate((ids) => {
    const centOf = (v) => Math.round(v * 100);
    const repasseTotalCent = state.office.repasses.filter((rp) => ids.includes(rp.recebivelId)).reduce((s, rp) => s + centOf(rp.valor), 0);
    const reservaTotalCent = (destino) => state.office.movimentacoesReservas.filter((m) => m.origemDestino === destino && ids.includes(m.origemRecebivelId)).reduce((s, m) => s + centOf(m.valor), 0);
    return { repasse_pessoal: repasseTotalCent, operacao: reservaTotalCent('operacao'), reserva_crescimento: reservaTotalCent('reserva_crescimento'), capital_giro: reservaTotalCent('capital_giro'), marketing: reservaTotalCent('marketing') };
  }, [projetoId + '_r0', projetoId + '_r1']);
  const t6 = await totalOf('pAla6');
  const t7 = await totalOf('pAla7');
  const ok = JSON.stringify(t6) === JSON.stringify(t7) && JSON.stringify(t6) === JSON.stringify(ESPERADO_50_CENTAVOS);
  return { ok, detail: `R$0,50 dividido em 0,49+0,01 vs 0,01+0,49 — totais finais idênticos=${JSON.stringify(t6) === JSON.stringify(t7)}: ${JSON.stringify(t6)} vs ${JSON.stringify(t7)} (esp. ambos ${JSON.stringify(ESPERADO_50_CENTAVOS)})` };
}, 'Achado P1 (3ª rodada) item 9 — o total final por destino depende só do total realizado, nunca da ordem das parcelas (caso 0,49/0,50)');

await check('alabama3-resync-nao-duplica', async () => {
  const r = await page.evaluate(() => {
    resyncProjectV2('pAla6'); resyncProjectV2('pAla6'); resyncProjectV2('pAla6');
    const ids = ['pAla6_r0', 'pAla6_r1'];
    return {
      qtdRepasses: state.office.repasses.filter((rp) => ids.includes(rp.recebivelId)).length,
      qtdMovsReserva: state.office.movimentacoesReservas.filter((m) => ids.includes(m.origemRecebivelId)).length,
    };
  });
  // r0 (R$0,49) tem repasse_pessoal=33>0 (1 repasse) e os 4 destinos de
  // reserva >0 (4 movimentações); r1 (R$0,01) tem repasse_pessoal=0 (marginal
  // — não cria repasse) e só operacao=1>0 (1 movimentação) — nunca duplicado
  // em 3 resyncs seguidos.
  const ok = r.qtdRepasses === 1 && r.qtdMovsReserva === 5;
  return { ok, detail: `resync repetido sobre R$0,49+R$0,01 já materializados — repasses=${r.qtdRepasses} (esp. 1 — a fatia marginal de repasse do 2º recebível é 0), movs reserva=${r.qtdMovsReserva} (esp. 5, nunca duplicado)` };
}, 'Achado P1 (3ª rodada) item 6 (retido) — reexecutar a sincronização depois da correção continua sem duplicar repasse nem reserva');

// ---------------------------------------------------------------------------
// Varredura exaustiva de monotonicidade — exigida pela auditoria: de 1 até
// pelo menos 2.000.000 de centavos, verificando a cada transição n-1 -> n
// que a soma bate, nenhum destino diminui, o incremento total é
// exatamente 1 centavo e exatamente um destino cresce. Roda inteiramente
// dentro do browser (um único page.evaluate, sem overhead de IPC por
// iteração) chamando a função de produção diretamente — não uma cópia.
// ---------------------------------------------------------------------------
await check('sainte-lague-monotonico-varredura-exaustiva', async () => {
  const r = await page.evaluate(() => {
    const LIMIT = 2000000;
    let prev = distribuirReceitaLiquidaCent(0);
    for (let n = 1; n <= LIMIT; n++) {
      const cur = distribuirReceitaLiquidaCent(n);
      let somaCur = 0, cresceram = 0, diminuiram = 0, deltaSoma = 0;
      for (const k of Object.keys(cur)) {
        const c = cur[k], p = prev[k] || 0;
        somaCur += c;
        if (c < p) diminuiram++;
        if (c > p) cresceram++;
        deltaSoma += (c - p);
      }
      if (somaCur !== n || cresceram !== 1 || diminuiram !== 0 || deltaSoma !== 1) {
        return { ok: false, n, cur, prev, somaCur, cresceram, diminuiram, deltaSoma };
      }
      prev = cur;
    }
    return { ok: true, limite: LIMIT };
  });
  return { ok: r.ok === true, detail: r.ok ? `monotônico e exato de 1 a ${r.limite} centavos (soma==n, exatamente 1 destino cresce, 0 diminuem, incremento total==1, em toda transição)` : `FALHOU em n=${r.n} — anterior=${JSON.stringify(r.prev)}, atual=${JSON.stringify(r.cur)}, soma=${r.somaCur} (esp. ${r.n}), cresceram=${r.cresceram} (esp. 1), diminuiram=${r.diminuiram} (esp. 0), deltaSoma=${r.deltaSoma} (esp. 1)` };
}, 'Achado P1 (3ª rodada) — varredura exaustiva de 1 a 2.000.000 de centavos: soma sempre exata, nenhum destino nunca diminui, exatamente um destino cresce um centavo por transição — a implementação anterior falhava exatamente em n=50');

console.log(`TOTAL=${results.length} PASS=${results.filter((r) => r.status === 'PASS').length} FAIL=${results.filter((r) => r.status === 'FAIL').length}`);
await close();
process.exit(results.some((r) => r.status === 'FAIL') ? 1 : 0);
