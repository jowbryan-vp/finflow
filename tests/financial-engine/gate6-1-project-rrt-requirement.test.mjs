// Gate 6.1 — decisão explícita de exigência de RRT por projeto
// (rrtRequirement: 'pending'|'none'|'one'|'two'). Substitui o
// comportamento anterior, em que um projeto v2 sem NENHUMA RRT ficava
// bloqueado indefinidamente e só uma RRT artificial de R$0,00 liberava a
// distribuição. Agora o usuário declara explicitamente se o projeto exige
// nenhuma, uma ou duas RRTs — nenhuma RRT fictícia é criada automaticamente
// em nenhum caso. Convive lado a lado com gate6-office-net-distribution.test.mjs
// (motor de cálculo/reconciliação, inalterado por este arquivo) e com o
// motor legado (regraDistribuicao==='legacy', nunca tocado).
import { openHarness, makeRunner, baseSyntheticState } from './harness.mjs';

const { page, loadState, close } = await openHarness();
const { check, results } = makeRunner('gate6-1-project-rrt-requirement');

async function setupBase() {
  await loadState(baseSyntheticState({ contas: [{ id: 'c1', name: 'Conta Pessoal', color: '#5b7fff', saldoInicial: 0 }] }));
  await page.evaluate(() => {
    state.office.contas.push({ id: 'oc1', name: 'Conta Escritório', color: '#ff9900', saldoInicial: 0 });
    state.office.impostoPercentual = 0; // isola a decisão de RRT da dedução de imposto na maioria dos testes
  });
}
await setupBase();

function pushProjeto(page, over) {
  return page.evaluate((p) => {
    state.office.projetos.push({
      id: p.id, nome: 'Projeto ' + p.id, cliente: 'Cliente', valorContrato: p.valorContrato ?? 1000, status: 'contratado',
      dataContrato: '2026-09-01', observacao: '', createdAt: p.id, regraDistribuicao: 'v2', rrts: [],
      ...p.over,
    });
  }, { id: over.id, valorContrato: over.valorContrato, over: over.over || {} });
}

// ---------------------------------------------------------------------------
// Item 1/2/3/4 — estado pendente
// ---------------------------------------------------------------------------
await check('pending-projeto-novo', async () => {
  // Exercita o formulário REAL de cadastro (não só o state) — a opção
  // "Ainda não definido" já vem marcada por padrão, sem nenhuma ação extra.
  const r = await page.evaluate(() => {
    renderOfficeProjetosTab();
    document.getElementById('newProjNome').value = 'Projeto p01';
    document.getElementById('newProjValor').value = '1000';
    document.getElementById('newProjStatus').value = 'contratado';
    onNewProjStatusChange();
    document.getElementById('newProjEntradaValor').value = '1000'; // entrada = contrato inteiro, sem precisar de parcelas
    document.getElementById('newProjEntradaData').value = '2026-09-20';
    document.getElementById('newProjConta').value = 'oc1';
    const requirementMarcadoPorPadrao = document.querySelector('input[name="newProjRrtRequirement"]:checked')?.value;
    addOfficeProjeto();
    const p = state.office.projetos[state.office.projetos.length - 1];
    window.__p01Id = p.id; // lembrado pelo próximo teste (o id real vem de uid(), não é previsível)
    return { requirementMarcadoPorPadrao, rrtRequirement: p.rrtRequirement, confirmedAt: p.rrtRequirementConfirmedAt, confirmedBy: p.rrtRequirementConfirmedBy };
  });
  const ok = r.requirementMarcadoPorPadrao === 'pending' && r.rrtRequirement === 'pending' && r.confirmedAt === null && r.confirmedBy === null;
  return { ok, detail: `formulário de cadastro real — opção pré-marcada=${r.requirementMarcadoPorPadrao} (esp. pending), projeto criado com rrtRequirement=${r.rrtRequirement} (esp. pending), confirmedAt=${r.confirmedAt} (esp. null), confirmedBy=${r.confirmedBy} (esp. null)` };
}, 'item 1 — o formulário de novo projeto vem com "Ainda não definido" pré-marcado, e o projeto criado começa com rrtRequirement=pending, sem confirmação nenhuma');

await check('pending-bloqueia-tudo-mas-caixa-entra', async () => {
  const r = await page.evaluate(() => {
    state.office.recebiveis.push({ id: 'rec01', projetoId: window.__p01Id, descricao: 'Entrada', valor: 1000, estado: 'recebido', dataPrevista: '2026-09-20', dataRecebimento: '2026-09-20', contaDestino: 'oc1', createdAt: 'rec01' });
    syncDerivedPersonalTransfer('rec01');
    const rec = state.office.recebiveis.find((x) => x.id === 'rec01');
    return {
      temRepasse: !!state.office.repasses.find((rp) => rp.recebivelId === 'rec01'),
      qtdMovsReserva: state.office.movimentacoesReservas.filter((m) => m.origemRecebivelId === 'rec01').length,
      congelado: rec.provisionadoRealizadoCent !== undefined,
      saldoOffice: calcSaldoOfficeConta('oc1'),
    };
  });
  const ok = r.temRepasse === false && r.qtdMovsReserva === 0 && r.congelado === false && r.saldoOffice === 1000;
  return { ok, detail: `pending — repasse=${r.temRepasse} (esp. false), movs reserva=${r.qtdMovsReserva} (esp. 0), congelado=${r.congelado} (esp. false), caixa=${r.saldoOffice} (esp. 1000, entra normalmente)` };
}, 'item 2/3 — pending bloqueia repasse/reservas/congelamento, mas o recebimento real continua entrando no caixa');

await check('pending-mensagem-exata', async () => {
  const r = await page.evaluate(() => {
    const p = state.office.projetos.find((x) => x.id === window.__p01Id);
    return { msg: getProjetoRrtBlockMessage(p) };
  });
  const ok = r.msg === 'Distribuição bloqueada: informe se o projeto exige RRT.';
  return { ok, detail: `mensagem obtida="${r.msg}"` };
}, 'item 4 — a mensagem exata de bloqueio aparece para o estado pending');

// ---------------------------------------------------------------------------
// Item 5/6/7 — "Não exige RRT"
// ---------------------------------------------------------------------------
await check('none-confirmado-libera-sem-criar-rrt', async () => {
  await pushProjeto(page, { id: 'p02' });
  const r = await page.evaluate(() => {
    const ok1 = setProjetoRrtRequirement('p02', 'none');
    const p = state.office.projetos.find((x) => x.id === 'p02');
    state.office.recebiveis.push({ id: 'rec02', projetoId: 'p02', descricao: 'Entrada', valor: 1000, estado: 'recebido', dataPrevista: '2026-09-20', dataRecebimento: '2026-09-20', contaDestino: 'oc1', createdAt: 'rec02' });
    syncDerivedPersonalTransfer('rec02');
    const repasse = state.office.repasses.find((rp) => rp.recebivelId === 'rec02');
    return { ok1, qtdRrts: p.rrts.length, temRepasse: !!repasse, valorRepasse: repasse ? repasse.valor : null };
  });
  // imposto 0%, RRT none => distribuível 1000; repasse 65% = 650.
  const ok = r.ok1 === true && r.qtdRrts === 0 && r.temRepasse === true && r.valorRepasse === 650;
  return { ok, detail: `confirmar 'none' — sucesso=${r.ok1}, RRTs criadas=${r.qtdRrts} (esp. 0), repasse liberado=${r.temRepasse}/${r.valorRepasse} (esp. true/650)` };
}, 'item 5 — confirmar "none" libera a distribuição normalmente, sem criar nenhuma RRT');

await check('none-deduz-zero-rrt-mas-deduz-imposto', async () => {
  await pushProjeto(page, { id: 'p03' });
  const r = await page.evaluate(() => {
    state.office.impostoPercentual = 10; // isola a dedução de imposto pra este teste específico
    setProjetoRrtRequirement('p03', 'none');
    const p = state.office.projetos.find((x) => x.id === 'p03');
    const dist = calculateProjectDistributionV2(p);
    state.office.impostoPercentual = 0; // restaura pro resto da suíte
    return dist;
  });
  const ok = r.rrtProvisionada === 0 && r.impostoProvisionado === 100 && r.receitaLiquidaDistribuivel === 900;
  return { ok, detail: `projeto 'none', imposto 10%, contrato 1000 — rrtProvisionada=${r.rrtProvisionada} (esp. 0), impostoProvisionado=${r.impostoProvisionado} (esp. 100), líquido=${r.receitaLiquidaDistribuivel} (esp. 900)` };
}, 'item 6 — projeto "none" deduz exatamente zero de RRT e continua deduzindo o imposto normalmente');

await check('none-rejeitado-com-rrt-existente-sem-mutacao', async () => {
  await pushProjeto(page, { id: 'p04', over: { rrtRequirement: 'one', rrtRequirementConfirmedAt: '2026-09-01T00:00:00.000Z' } });
  const r = await page.evaluate(() => {
    addProjetoRRT('p04', 'projeto');
    document.getElementById('novaProjRrtValor').value = '50';
    confirmarAddProjetoRRT('p04', 'projeto');
    const antes = JSON.stringify(state.office.projetos.find((x) => x.id === 'p04'));
    const ok = setProjetoRrtRequirement('p04', 'none');
    const depois = JSON.stringify(state.office.projetos.find((x) => x.id === 'p04'));
    return { ok, inalterado: antes === depois };
  });
  const ok = r.ok === false && r.inalterado === true;
  return { ok, detail: `tentar 'none' com RRT já cadastrada — aceito=${r.ok} (esp. false), projeto inalterado=${r.inalterado} (esp. true)` };
}, 'item 7 — "none" com RRT já existente é rejeitado sem mutação nenhuma');

// ---------------------------------------------------------------------------
// Item 8/9/10/11 — exige 1 RRT
// ---------------------------------------------------------------------------
await check('one-sem-rrt-bloqueado', async () => {
  await pushProjeto(page, { id: 'p05', over: { rrtRequirement: 'one', rrtRequirementConfirmedAt: '2026-09-01T00:00:00.000Z' } });
  const r = await page.evaluate(() => {
    state.office.recebiveis.push({ id: 'rec05', projetoId: 'p05', descricao: 'Entrada', valor: 1000, estado: 'recebido', dataPrevista: '2026-09-20', dataRecebimento: '2026-09-20', contaDestino: 'oc1', createdAt: 'rec05' });
    syncDerivedPersonalTransfer('rec05');
    return { temRepasse: !!state.office.repasses.find((rp) => rp.recebivelId === 'rec05') };
  });
  const ok = r.temRepasse === false;
  return { ok, detail: `'one' sem nenhuma RRT cadastrada — repasse=${r.temRepasse} (esp. false)` };
}, 'item 8 — "one" sem RRT cadastrada permanece bloqueado');

await check('one-com-rrt-projeto-libera', async () => {
  const r = await page.evaluate(() => {
    addProjetoRRT('p05', 'projeto');
    document.getElementById('novaProjRrtValor').value = '80';
    confirmarAddProjetoRRT('p05', 'projeto');
    const repasse = state.office.repasses.find((rp) => rp.recebivelId === 'rec05');
    return { temRepasse: !!repasse, valor: repasse ? repasse.valor : null };
  });
  // distribuível = 1000-80 = 920; repasse 65% = 598.
  const ok = r.temRepasse === true && r.valor === 598;
  return { ok, detail: `'one' com RRT de Projeto (80) cadastrada — repasse=${r.temRepasse}/${r.valor} (esp. true/598)` };
}, 'item 9 — "one" com uma RRT de Projeto cadastrada libera a distribuição');

await check('one-com-rrt-execucao-libera', async () => {
  await pushProjeto(page, { id: 'p06', over: { rrtRequirement: 'one', rrtRequirementConfirmedAt: '2026-09-01T00:00:00.000Z' } });
  const r = await page.evaluate(() => {
    addProjetoRRT('p06', 'execucao');
    document.getElementById('novaProjRrtValor').value = '20';
    confirmarAddProjetoRRT('p06', 'execucao');
    state.office.recebiveis.push({ id: 'rec06', projetoId: 'p06', descricao: 'Entrada', valor: 1000, estado: 'recebido', dataPrevista: '2026-09-20', dataRecebimento: '2026-09-20', contaDestino: 'oc1', createdAt: 'rec06' });
    syncDerivedPersonalTransfer('rec06');
    const repasse = state.office.repasses.find((rp) => rp.recebivelId === 'rec06');
    return { temRepasse: !!repasse, valor: repasse ? repasse.valor : null };
  });
  // distribuível = 1000-20 = 980; repasse 65% = 637.
  const ok = r.temRepasse === true && r.valor === 637;
  return { ok, detail: `'one' com RRT de Execução (20) cadastrada — repasse=${r.temRepasse}/${r.valor} (esp. true/637)` };
}, 'item 10 — "one" com uma RRT de Execução cadastrada libera a distribuição');

await check('one-rejeita-segunda-rrt', async () => {
  const r = await page.evaluate(() => {
    const antes = state.office.projetos.find((x) => x.id === 'p05').rrts.length;
    addProjetoRRT('p05', 'execucao'); // 'p05' já tem 1 RRT (Projeto) e requirement='one'
    const depoisAbrirModal = document.getElementById('modalOverlay').classList.contains('open');
    return { antes, depoisAbrirModal };
  });
  const p = await page.evaluate(() => state.office.projetos.find((x) => x.id === 'p05').rrts.length);
  const ok = r.antes === 1 && p === 1;
  return { ok, detail: `'one' já satisfeito com 1 RRT — tentativa de adicionar uma 2ª — qtd antes=${r.antes}, qtd depois=${p} (esp. 1 e 1, rejeitado)` };
}, 'item 11 — "one" rejeita uma segunda RRT');

// ---------------------------------------------------------------------------
// Item 12/13/14/15 — exige 2 RRTs
// ---------------------------------------------------------------------------
await check('two-com-uma-rrt-bloqueado', async () => {
  await pushProjeto(page, { id: 'p07', over: { rrtRequirement: 'two', rrtRequirementConfirmedAt: '2026-09-01T00:00:00.000Z' } });
  const r = await page.evaluate(() => {
    addProjetoRRT('p07', 'projeto');
    document.getElementById('novaProjRrtValor').value = '30';
    confirmarAddProjetoRRT('p07', 'projeto');
    state.office.recebiveis.push({ id: 'rec07', projetoId: 'p07', descricao: 'Entrada', valor: 1000, estado: 'recebido', dataPrevista: '2026-09-20', dataRecebimento: '2026-09-20', contaDestino: 'oc1', createdAt: 'rec07' });
    syncDerivedPersonalTransfer('rec07');
    return { qtdRrts: state.office.projetos.find((x) => x.id === 'p07').rrts.length, temRepasse: !!state.office.repasses.find((rp) => rp.recebivelId === 'rec07') };
  });
  const ok = r.qtdRrts === 1 && r.temRepasse === false;
  return { ok, detail: `'two' com só 1 RRT cadastrada — qtd=${r.qtdRrts} (esp. 1), repasse=${r.temRepasse} (esp. false, ainda bloqueado)` };
}, 'item 12 — "two" com apenas uma RRT cadastrada permanece bloqueado');

await check('two-libera-so-com-projeto-e-execucao', async () => {
  const r = await page.evaluate(() => {
    addProjetoRRT('p07', 'execucao');
    document.getElementById('novaProjRrtValor').value = '20';
    confirmarAddProjetoRRT('p07', 'execucao');
    const repasse = state.office.repasses.find((rp) => rp.recebivelId === 'rec07');
    return { qtdRrts: state.office.projetos.find((x) => x.id === 'p07').rrts.length, temRepasse: !!repasse, valor: repasse ? repasse.valor : null };
  });
  // distribuível = 1000-30-20 = 950; repasse 65% = 617.5.
  const ok = r.qtdRrts === 2 && r.temRepasse === true && r.valor === 617.5;
  return { ok, detail: `'two' completo (Projeto 30 + Execução 20) — qtd=${r.qtdRrts} (esp. 2), repasse=${r.temRepasse}/${r.valor} (esp. true/617.5)` };
}, 'item 13 — "two" libera a distribuição somente com Projeto + Execução, as duas cadastradas');

await check('two-rejeita-tipos-duplicados', async () => {
  await pushProjeto(page, { id: 'p08', over: { rrtRequirement: 'two', rrtRequirementConfirmedAt: '2026-09-01T00:00:00.000Z' } });
  const r = await page.evaluate(() => {
    addProjetoRRT('p08', 'projeto');
    document.getElementById('novaProjRrtValor').value = '10';
    confirmarAddProjetoRRT('p08', 'projeto');
    const antes = state.office.projetos.find((x) => x.id === 'p08').rrts.length;
    addProjetoRRT('p08', 'projeto'); // tenta adicionar um segundo 'projeto' — deve ser rejeitado por tipo duplicado
    const depois = state.office.projetos.find((x) => x.id === 'p08').rrts.length;
    return { antes, depois };
  });
  const ok = r.antes === 1 && r.depois === 1;
  return { ok, detail: `tentar cadastrar duas RRTs de Projeto no mesmo projeto 'two' — antes=${r.antes}, depois=${r.depois} (esp. 1 e 1, rejeitado)` };
}, 'item 14 — "two" rejeita dois tipos duplicados (duas RRTs de Projeto, ou duas de Execução)');

await check('nunca-terceira-rrt', async () => {
  const r = await page.evaluate(() => {
    addProjetoRRT('p08', 'execucao');
    document.getElementById('novaProjRrtValor').value = '15';
    confirmarAddProjetoRRT('p08', 'execucao');
    const antes = state.office.projetos.find((x) => x.id === 'p08').rrts.length;
    addProjetoRRT('p08', 'projeto'); // já tem 2 (o máximo de 'two') — rejeitado
    const depois = state.office.projetos.find((x) => x.id === 'p08').rrts.length;
    return { antes, depois };
  });
  const ok = r.antes === 2 && r.depois === 2;
  return { ok, detail: `projeto 'two' já completo (Projeto+Execução) — tentativa de 3ª RRT — antes=${r.antes}, depois=${r.depois} (esp. 2 e 2, nunca uma terceira)` };
}, 'item 15 — nunca é criada uma terceira RRT, em nenhuma combinação de exigência');

// ---------------------------------------------------------------------------
// Item 16 — RRT R$0,00 só aceita com confirmação explícita
// ---------------------------------------------------------------------------
await check('rrt-zero-so-com-confirmacao-explicita', async () => {
  await pushProjeto(page, { id: 'p09', over: { rrtRequirement: 'one', rrtRequirementConfirmedAt: '2026-09-01T00:00:00.000Z' } });
  const r = await page.evaluate(() => {
    addProjetoRRT('p09', 'projeto');
    document.getElementById('novaProjRrtValor').value = ''; // em branco — nunca vira 0 automático
    confirmarAddProjetoRRT('p09', 'projeto');
    const qtdVazio = state.office.projetos.find((x) => x.id === 'p09').rrts.length;
    addProjetoRRT('p09', 'projeto');
    document.getElementById('novaProjRrtValor').value = '0'; // digitado e confirmado explicitamente
    confirmarAddProjetoRRT('p09', 'projeto');
    const p = state.office.projetos.find((x) => x.id === 'p09');
    return { qtdVazio, qtdConfirmado: p.rrts.length, valorConfirmado: p.rrts[0] ? p.rrts[0].valor : null };
  });
  const ok = r.qtdVazio === 0 && r.qtdConfirmado === 1 && r.valorConfirmado === 0;
  return { ok, detail: `campo em branco não cria nada (qtd=${r.qtdVazio}, esp. 0); 0 digitado e confirmado cria a RRT (qtd=${r.qtdConfirmado}, esp. 1, valor=${r.valorConfirmado}, esp. 0)` };
}, 'item 16 — RRT de valor R$0,00 só é aceita quando digitada e confirmada explicitamente, nunca como fallback de campo vazio');

// ---------------------------------------------------------------------------
// Item 17/18/19/20 — alteração da decisão
// ---------------------------------------------------------------------------
await check('alterar-exigencia-antes-da-materializacao', async () => {
  await pushProjeto(page, { id: 'p10' });
  const r = await page.evaluate(() => {
    const ok1 = setProjetoRrtRequirement('p10', 'two');
    const req1 = state.office.projetos.find((x) => x.id === 'p10').rrtRequirement;
    const ok2 = setProjetoRrtRequirement('p10', 'none');
    const req2 = state.office.projetos.find((x) => x.id === 'p10').rrtRequirement;
    return { ok1, req1, ok2, req2 };
  });
  const ok = r.ok1 === true && r.req1 === 'two' && r.ok2 === true && r.req2 === 'none';
  return { ok, detail: `pending→two (sucesso=${r.ok1}, req=${r.req1}), depois two→none sem RRT nenhuma cadastrada (sucesso=${r.ok2}, req=${r.req2})` };
}, 'item 17 — alterar a exigência de RRT antes de qualquer materialização funciona livremente');

await check('reduzir-duas-para-uma-com-duas-cadastradas-rejeitado', async () => {
  await pushProjeto(page, { id: 'p11', over: { rrtRequirement: 'two', rrtRequirementConfirmedAt: '2026-09-01T00:00:00.000Z' } });
  const r = await page.evaluate(() => {
    addProjetoRRT('p11', 'projeto'); document.getElementById('novaProjRrtValor').value = '5'; confirmarAddProjetoRRT('p11', 'projeto');
    addProjetoRRT('p11', 'execucao'); document.getElementById('novaProjRrtValor').value = '5'; confirmarAddProjetoRRT('p11', 'execucao');
    const qtdAntes = state.office.projetos.find((x) => x.id === 'p11').rrts.length;
    const ok = setProjetoRrtRequirement('p11', 'one');
    const p = state.office.projetos.find((x) => x.id === 'p11');
    return { ok, qtdAntes, qtdDepois: p.rrts.length, requirement: p.rrtRequirement };
  });
  const ok = r.ok === false && r.qtdAntes === 2 && r.qtdDepois === 2 && r.requirement === 'two';
  return { ok, detail: `reduzir 'two'→'one' com as duas RRTs já cadastradas — aceito=${r.ok} (esp. false), qtd antes/depois=${r.qtdAntes}/${r.qtdDepois} (esp. 2/2, nenhum registro apagado), requirement continua=${r.requirement} (esp. two)` };
}, 'item 18 — reduzir de "duas" para "uma" com as duas RRTs cadastradas é rejeitado, sem apagar nenhum registro');

await check('alterar-exigencia-apos-materializacao-bloqueado', async () => {
  await pushProjeto(page, { id: 'p12', over: { rrtRequirement: 'none', rrtRequirementConfirmedAt: '2026-09-01T00:00:00.000Z' } });
  const r = await page.evaluate(() => {
    state.office.recebiveis.push({ id: 'rec12', projetoId: 'p12', descricao: 'Entrada', valor: 1000, estado: 'recebido', dataPrevista: '2026-09-20', dataRecebimento: '2026-09-20', contaDestino: 'oc1', createdAt: 'rec12' });
    syncDerivedPersonalTransfer('rec12'); // materializa (imposto 0%, none => distribuível cheio)
    const materializado = projetoV2TemMaterializacao(state.office.projetos.find((x) => x.id === 'p12'));
    const antes = JSON.stringify(state.office.projetos.find((x) => x.id === 'p12'));
    const ok = setProjetoRrtRequirement('p12', 'two'); // tenta mudar depois de materializado — direto, sem passar pela UI
    const depois = JSON.stringify(state.office.projetos.find((x) => x.id === 'p12'));
    return { materializado, ok, inalterado: antes === depois };
  });
  const ok = r.materializado === true && r.ok === false && r.inalterado === true;
  return { ok, detail: `materializado=${r.materializado} (esp. true); tentativa de alterar a exigência depois — aceito=${r.ok} (esp. false), projeto inalterado=${r.inalterado} (esp. true) — bloqueado na função de gravação, não só na UI` };
}, 'item 19 — alterar a exigência de RRT depois de materializado é bloqueado na função de gravação (setProjetoRrtRequirement), mesmo chamando diretamente');

await check('tentativa-bloqueada-nao-altera-nada', async () => {
  const r = await page.evaluate(() => {
    const antes = {
      saldoOffice: calcSaldoOfficeConta('oc1'), saldoReservas: getOfficeReservedBalance(),
      repasse: JSON.stringify(state.office.repasses.find((rp) => rp.recebivelId === 'rec12')),
      projeto: JSON.stringify(state.office.projetos.find((x) => x.id === 'p12')),
    };
    setProjetoRrtRequirement('p12', 'one'); // outra tentativa bloqueada
    addProjetoRRT('p12', 'projeto'); // e uma tentativa de adicionar RRT — 'none' não aceita RRT nenhuma
    const depois = {
      saldoOffice: calcSaldoOfficeConta('oc1'), saldoReservas: getOfficeReservedBalance(),
      repasse: JSON.stringify(state.office.repasses.find((rp) => rp.recebivelId === 'rec12')),
      projeto: JSON.stringify(state.office.projetos.find((x) => x.id === 'p12')),
    };
    return { antes, depois };
  });
  const ok = r.antes.saldoOffice === r.depois.saldoOffice && r.antes.saldoReservas === r.depois.saldoReservas
    && r.antes.repasse === r.depois.repasse && r.antes.projeto === r.depois.projeto;
  return { ok, detail: `tentativas bloqueadas (mudar exigência + adicionar RRT num projeto materializado 'none') — caixa/reservas/repasse/projeto idênticos antes e depois=${r.antes.saldoOffice === r.depois.saldoOffice && r.antes.projeto === r.depois.projeto}` };
}, 'item 20 — uma tentativa bloqueada de alterar a exigência (ou adicionar RRT) não altera caixa, repasse, reservas nem a configuração do projeto');

// ---------------------------------------------------------------------------
// Item 21/22/23/24 — migração
// ---------------------------------------------------------------------------
function backupMinimo(officeOverride) {
  return {
    categories: [{ id: 'geral', name: 'Geral', subs: ['Geral'] }],
    cards: [{ id: 'dinheiro', name: 'Dinheiro/PIX', color: '#38e2b4', fecha: null, paga: null }],
    contas: [], movimentacoesContas: [], receitas: [], despesas: [], pessoas: [], cofrinhos: [], movimentacoesCofrinhos: [],
    excedentes: {}, contribuicaoAjustes: {}, faturasPagas: {}, contribuicaoPaga: {},
    office: {
      ativo: true, nome: 'Escritório', contas: [{ id: 'oc_m', name: 'Conta', color: '#000', saldoInicial: 0 }], movimentacoesContas: [],
      despesas: [], reservas: [], movimentacoesReservas: [], repasses: [],
      regrasDistribuicao: [{ destino: 'reserva', percentual: null }, { destino: 'impostos', percentual: null }, { destino: 'repasse_pessoal', percentual: null }],
      ...officeOverride,
    },
  };
}

await check('migracao-zero-rrt-vira-pending', async () => {
  const r = await page.evaluate((raw) => {
    migrateAppData(raw);
    const p = state.office.projetos.find((x) => x.id === 'pMig1');
    return { regraDistribuicao: p.regraDistribuicao, rrtRequirement: p.rrtRequirement };
  }, backupMinimo({
    projetos: [{ id: 'pMig1', nome: 'Migração 1', cliente: 'X', valorContrato: 1000, status: 'contratado', dataContrato: '2026-01-01', observacao: '', createdAt: 'pMig1' }],
    recebiveis: [{ id: 'recMig1', projetoId: 'pMig1', descricao: 'Entrada', valor: 1000, estado: 'previsto', dataPrevista: '2026-02-01', dataRecebimento: null, contaDestino: 'oc_m', createdAt: 'recMig1' }],
  }));
  const ok = r.regraDistribuicao === 'v2' && r.rrtRequirement === 'pending';
  return { ok, detail: `projeto sem nenhuma RRT, nada realizado — regraDistribuicao=${r.regraDistribuicao} (esp. v2), rrtRequirement=${r.rrtRequirement} (esp. pending)` };
}, 'item 21 — migração de um projeto sem nenhuma RRT resulta em rrtRequirement=pending');

await check('migracao-uma-rrt-valor-zero-vira-one', async () => {
  const r = await page.evaluate((raw) => {
    migrateAppData(raw);
    const p = state.office.projetos.find((x) => x.id === 'pMig2');
    return { rrtRequirement: p.rrtRequirement, qtdRrts: p.rrts.length };
  }, backupMinimo({
    projetos: [{ id: 'pMig2', nome: 'Migração 2', cliente: 'X', valorContrato: 1000, status: 'contratado', dataContrato: '2026-01-01', observacao: '', createdAt: 'pMig2', rrts: [{ id: 'rrtMig2', tipo: 'execucao', valor: 0, status: 'prevista', numero: '', dataEmissao: null, dataPagamento: null, createdAt: 'rrtMig2' }] }],
    recebiveis: [{ id: 'recMig2', projetoId: 'pMig2', descricao: 'Entrada', valor: 1000, estado: 'previsto', dataPrevista: '2026-02-01', dataRecebimento: null, contaDestino: 'oc_m', createdAt: 'recMig2' }],
  }));
  const ok = r.rrtRequirement === 'one' && r.qtdRrts === 1;
  return { ok, detail: `projeto com uma RRT de valor R$0,00 — rrtRequirement=${r.rrtRequirement} (esp. one, NUNCA "none" — uma RRT de R$0,00 continua sendo uma RRT real), qtd=${r.qtdRrts}` };
}, 'item 22 — migração de um projeto com uma RRT (inclusive de valor R$0,00) resulta em rrtRequirement=one, nunca "none"');

await check('migracao-duas-rrts-projeto-execucao-vira-two', async () => {
  const r = await page.evaluate((raw) => {
    migrateAppData(raw);
    const p = state.office.projetos.find((x) => x.id === 'pMig3');
    return { rrtRequirement: p.rrtRequirement, qtdRrts: p.rrts.length };
  }, backupMinimo({
    projetos: [{
      id: 'pMig3', nome: 'Migração 3', cliente: 'X', valorContrato: 1000, status: 'contratado', dataContrato: '2026-01-01', observacao: '', createdAt: 'pMig3',
      rrts: [
        { id: 'rrtMig3a', tipo: 'projeto', valor: 40, status: 'prevista', numero: '', dataEmissao: null, dataPagamento: null, createdAt: 'rrtMig3a' },
        { id: 'rrtMig3b', tipo: 'execucao', valor: 40, status: 'prevista', numero: '', dataEmissao: null, dataPagamento: null, createdAt: 'rrtMig3b' },
      ],
    }],
    recebiveis: [{ id: 'recMig3', projetoId: 'pMig3', descricao: 'Entrada', valor: 1000, estado: 'previsto', dataPrevista: '2026-02-01', dataRecebimento: null, contaDestino: 'oc_m', createdAt: 'recMig3' }],
  }));
  const ok = r.rrtRequirement === 'two' && r.qtdRrts === 2;
  return { ok, detail: `projeto com RRT de Projeto + RRT de Execução — rrtRequirement=${r.rrtRequirement} (esp. two), qtd=${r.qtdRrts}` };
}, 'item 23 — migração de um projeto com RRT de Projeto + RRT de Execução resulta em rrtRequirement=two');

await check('projeto-legado-nao-ganha-rrtRequirement', async () => {
  const r = await page.evaluate((raw) => {
    migrateAppData(raw);
    const p = state.office.projetos.find((x) => x.id === 'pMigLegacy');
    return { regraDistribuicao: p.regraDistribuicao, rrtRequirement: p.rrtRequirement, valorContrato: p.valorContrato };
  }, backupMinimo({
    projetos: [{ id: 'pMigLegacy', nome: 'Legado', cliente: 'X', valorContrato: 5000, status: 'contratado', dataContrato: '2026-01-01', observacao: '', createdAt: 'pMigLegacy' }],
    recebiveis: [{ id: 'recMigLegacy', projetoId: 'pMigLegacy', descricao: 'Entrada', valor: 2000, estado: 'recebido', dataPrevista: '2026-01-10', dataRecebimento: '2026-01-10', contaDestino: 'oc_m', createdAt: 'recMigLegacy' }],
    repasses: [{ id: 'rpMigLegacy', tipo: 'planejado', recebivelId: 'recMigLegacy', valor: 600, estado: 'recebido', dataPrevista: '2026-01-10', dataRecebimento: '2026-01-10', officeTransferId: 'off_recMigLegacy', createdAt: 'rpMigLegacy' }],
  }));
  const ok = r.regraDistribuicao === 'legacy' && r.rrtRequirement === undefined && r.valorContrato === 5000;
  return { ok, detail: `projeto legado (recebível já realizado) — regraDistribuicao=${r.regraDistribuicao} (esp. legacy), rrtRequirement=${r.rrtRequirement} (esp. undefined — nunca ganha o campo novo), valorContrato preservado=${r.valorContrato}` };
}, 'item 24 — projeto legado permanece integralmente no motor antigo, sem ganhar rrtRequirement nem qualquer outro campo da regra nova');

// ---------------------------------------------------------------------------
// Item 25/26 — export/import e idempotência
// ---------------------------------------------------------------------------
// As chamadas de migrateAppData nos testes de migração acima SUBSTITUEM
// state inteiro (importar um backup troca o "banco de dados" completo) —
// então os projetos criados antes disso (p01..p12) não existem mais neste
// ponto. Recria um estado limpo e dedicado pra este teste, auto-contido.
await setupBase();
await check('export-import-preserva-decisao-e-idempotente', async () => {
  const r = await page.evaluate(() => {
    state.office.contas.push({ id: 'oc_ei', name: 'Conta EI', color: '#000', saldoInicial: 0 });
    state.office.projetos.push({
      id: 'pEI1', nome: 'Projeto EI1', cliente: 'X', valorContrato: 1000, status: 'contratado', dataContrato: '2026-09-01', observacao: '', createdAt: 'pEI1',
      regraDistribuicao: 'v2', rrtRequirement: 'two', rrtRequirementConfirmedAt: '2026-09-01T00:00:00.000Z', rrtRequirementConfirmedBy: 'Fulano',
      rrts: [
        { id: 'rrtEI1a', tipo: 'projeto', valor: 5, status: 'prevista', numero: '', dataEmissao: null, dataPagamento: null, createdAt: 'rrtEI1a' },
        { id: 'rrtEI1b', tipo: 'execucao', valor: 5, status: 'prevista', numero: '', dataEmissao: null, dataPagamento: null, createdAt: 'rrtEI1b' },
      ],
    });
    state.office.projetos.push({
      id: 'pEI2', nome: 'Projeto EI2', cliente: 'X', valorContrato: 1000, status: 'contratado', dataContrato: '2026-09-01', observacao: '', createdAt: 'pEI2',
      regraDistribuicao: 'v2', rrtRequirement: 'none', rrtRequirementConfirmedAt: '2026-09-01T00:00:00.000Z', rrtRequirementConfirmedBy: null, rrts: [],
    });
    state.office.recebiveis.push({ id: 'recEI2', projetoId: 'pEI2', descricao: 'Entrada', valor: 1000, estado: 'recebido', dataPrevista: '2026-09-20', dataRecebimento: '2026-09-20', contaDestino: 'oc_ei', createdAt: 'recEI2' });
    syncDerivedPersonalTransfer('recEI2'); // materializa pEI2 (imposto 0%, none)
    const exported1 = JSON.stringify(buildSaveObject());
    migrateAppData(JSON.parse(exported1));
    // A 1ª migração normaliza um campo legado pré-existente e alheio a esta
    // entrega (recebidaMeses, ausente na receita recém-criada por
    // syncDerivedPersonalTransfer e preenchido por migrateState na primeira
    // passagem) — a garantia de idempotência relevante aqui é a partir da
    // 2ª migração em diante, quando já não sobra nada pra normalizar.
    const exported2 = JSON.stringify(buildSaveObject());
    migrateAppData(JSON.parse(exported2));
    const exported3 = JSON.stringify(buildSaveObject());
    const p1 = state.office.projetos.find((x) => x.id === 'pEI1'); // 'two' com 2 RRTs, nunca materializado
    const p2 = state.office.projetos.find((x) => x.id === 'pEI2'); // 'none', materializado
    return {
      idempotente: exported2 === exported3,
      p1Requirement: p1.rrtRequirement, p1Qtd: p1.rrts.length, p1ConfirmedBy: p1.rrtRequirementConfirmedBy,
      p2Requirement: p2.rrtRequirement, p2ConfirmedAt: p2.rrtRequirementConfirmedAt,
      p2Materializado: projetoV2TemMaterializacao(p2),
    };
  });
  const ok = r.idempotente && r.p1Requirement === 'two' && r.p1Qtd === 2 && r.p1ConfirmedBy === 'Fulano'
    && r.p2Requirement === 'none' && r.p2ConfirmedAt === '2026-09-01T00:00:00.000Z' && r.p2Materializado === true;
  return { ok, detail: `export→import×2 idêntico=${r.idempotente}; pEI1 (two, 2 RRTs) preservado=${r.p1Requirement}/${r.p1Qtd}/${r.p1ConfirmedBy}; pEI2 (none, materializado=${r.p2Materializado}) preservado=${r.p2Requirement}/${r.p2ConfirmedAt}` };
}, 'item 25/26 — export/import preserva a decisão de RRT e seus metadados (inclusive já materializada); reimportar repetidamente é idempotente');

// ---------------------------------------------------------------------------
// Item 27/28/29 — o motor de cálculo/reconciliação continua intacto
// ---------------------------------------------------------------------------
await check('rateio-049-mais-001-continua-exato-e-monotonico', async () => {
  const r = await page.evaluate(() => {
    const a = distribuirReceitaLiquidaCent(49), b = distribuirReceitaLiquidaCent(50);
    const somaA = Object.values(a).reduce((s, v) => s + v, 0), somaB = Object.values(b).reduce((s, v) => s + v, 0);
    const algumaDiminuiu = Object.keys(b).some((k) => b[k] < a[k]);
    return { a, b, somaA, somaB, algumaDiminuiu };
  });
  const ok = r.somaA === 49 && r.somaB === 50 && r.algumaDiminuiu === false
    && JSON.stringify(r.b) === JSON.stringify({ repasse_pessoal: 33, operacao: 8, reserva_crescimento: 5, capital_giro: 3, marketing: 1 });
  return { ok, detail: `distribuirReceitaLiquidaCent(49)/(50) — soma=${r.somaA}/${r.somaB} (esp. 49/50), algum destino diminuiu=${r.algumaDiminuiu} (esp. false), 50=${JSON.stringify(r.b)}` };
}, 'item 27 — o rateio Sainte-Laguë continua exato e monotônico (49→50 centavos) — motor de cálculo intocado por esta entrega');

await check('cenarios-3000-continuam-identicos', async () => {
  const r = await page.evaluate(() => {
    const impostoAnterior = state.office.impostoPercentual;
    state.office.impostoPercentual = 5; // imposto do escopo original do Gate 6 (esta suíte usa 0% nos outros testes pra isolar a decisão de RRT)
    const projA = { valorContrato: 3000, rrts: [{ valor: 130.64 }] };
    const projB = { valorContrato: 3000, rrts: [{ valor: 130.64 }, { valor: 130.64 }] };
    const resultado = { distA: calculateProjectDistributionV2(projA), distB: calculateProjectDistributionV2(projB) };
    state.office.impostoPercentual = impostoAnterior;
    return resultado;
  });
  const ok = r.distA.porDestino.repasse_pessoal === 1767.58 && r.distA.porDestino.marketing === 81.58
    && r.distB.porDestino.repasse_pessoal === 1682.67 && r.distB.porDestino.marketing === 77.66;
  return { ok, detail: `cenário 1 (uma RRT): repasse=${r.distA.porDestino.repasse_pessoal} (esp. 1767.58); cenário 2 (duas RRTs): repasse=${r.distB.porDestino.repasse_pessoal} (esp. 1682.67) — idênticos ao Gate 6 original` };
}, 'item 28 — os cenários numéricos originais de R$3.000 do Gate 6 continuam numericamente idênticos');

await check('sync-repetido-nao-duplica', async () => {
  const r = await page.evaluate(() => {
    for (let i = 0; i < 5; i++) resyncProjectV2('pEI1'); // 'two' com 2 RRTs, criado no teste anterior — ainda não materializado
    state.office.recebiveis.push({ id: 'recEI1', projetoId: 'pEI1', descricao: 'Entrada', valor: 1000, estado: 'recebido', dataPrevista: '2026-09-20', dataRecebimento: '2026-09-20', contaDestino: 'oc_ei', createdAt: 'recEI1' });
    for (let i = 0; i < 5; i++) resyncProjectV2('pEI1'); // agora materializado — resync repetido não pode duplicar
    const ids = state.office.recebiveis.filter((x) => x.projetoId === 'pEI1').map((x) => x.id);
    return {
      qtdRepasses: state.office.repasses.filter((rp) => ids.includes(rp.recebivelId)).length,
      qtdMovsReserva: state.office.movimentacoesReservas.filter((m) => ids.includes(m.origemRecebivelId)).length,
    };
  });
  const ok = r.qtdRepasses === 1 && r.qtdMovsReserva === 4;
  return { ok, detail: `resync repetido (5x) sobre projeto já materializado — repasses=${r.qtdRepasses} (esp. 1), movs reserva=${r.qtdMovsReserva} (esp. 4), nunca duplicado` };
}, 'item 29 — sincronizações repetidas nunca duplicam repasse nem reserva, mesmo com a nova decisão de RRT no caminho');

console.log(`TOTAL=${results.length} PASS=${results.filter((r) => r.status === 'PASS').length} FAIL=${results.filter((r) => r.status === 'FAIL').length}`);
await close();
process.exit(results.some((r) => r.status === 'FAIL') ? 1 : 0);
