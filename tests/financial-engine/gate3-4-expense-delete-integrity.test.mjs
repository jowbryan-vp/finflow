// Gate 3.4 — decorre da auditoria patrimonial final do Gate 3.3: toda despesa
// empresarial cadastrada é, no modelo atual, financeiramente REALIZADA
// (addOfficeDespesa sempre grava status:'pago'; calcSaldoOfficeConta desconta
// toda despesa cadastrada incondicionalmente, sem checar status — não existe
// despesa "prevista" nesse modelo). Apagar uma despesa cadastrada faria
// dinheiro que já saiu reaparecer no saldo/patrimônio calculado, sem nenhum
// estorno/reembolso real por trás. canDeleteOfficeExpense/delOfficeDespesa
// fecham esse caminho: BLOCK total, zero mutation — EDITAR a despesa
// continua permitido normalmente (correção de dado ≠ exclusão destrutiva).
import { openHarness, makeRunner, baseSyntheticState } from './harness.mjs';

const { page, loadState, close } = await openHarness();
const { check, results } = makeRunner('gate3-4-expense-delete-integrity');

await loadState(baseSyntheticState());
await page.evaluate(() => {
  state.office.contas.push({ id: 'ocDespesaTeste', name: 'Conta Despesa Teste', color: '#111', saldoInicial: 1000 });
});

await check('OE_DELETE_01', async () => {
  const r = await page.evaluate(() => {
    state.office.despesas.push({ id: 'despOE01', descricao: 'Despesa OE01', categoria: 'Op', valor: 200, data: '2026-09-01', conta: 'ocDespesaTeste', projetoId: null, status: 'pago', createdAt: 'despOE01' });
    const saldoAntes = calcSaldoOfficeConta('ocDespesaTeste');
    delOfficeDespesa('despOE01');
    const saldoDepois = calcSaldoOfficeConta('ocDespesaTeste');
    return { saldoAntes, saldoDepois, aindaExiste: state.office.despesas.some((x) => x.id === 'despOE01') };
  });
  const ok = r.saldoAntes === 800 && r.saldoDepois === 800 && r.aindaExiste === true;
  return { ok, detail: `saldo antes da tentativa=${r.saldoAntes} (esp. 800), depois=${r.saldoDepois} (esp. 800), despesa continua existindo=${r.aindaExiste} (esp. true)` };
}, 'conta 1000 - despesa 200 = saldo 800; tentar excluir a despesa não muda o saldo, a despesa continua existindo');

await check('OE_DELETE_02', async () => {
  const r = await page.evaluate(() => {
    const patrimonioAntes = getOfficeFinancialPatrimony();
    delOfficeDespesa('despOE01'); // já sabemos que é bloqueado (OE_DELETE_01)
    const patrimonioDepois = getOfficeFinancialPatrimony();
    return { patrimonioAntes, patrimonioDepois };
  });
  const ok = r.patrimonioAntes === r.patrimonioDepois;
  return { ok, detail: `patrimônio antes=${r.patrimonioAntes}, depois=${r.patrimonioDepois} (esperado igual)` };
}, 'tentativa bloqueada de excluir despesa realizada não altera getOfficeFinancialPatrimony()');

await check('OE_DELETE_03', async () => {
  const r = await page.evaluate(() => {
    const snapshotAntes = JSON.stringify(state.office);
    delOfficeDespesa('despOE01'); // já sabemos que é bloqueado
    const snapshotDepois = JSON.stringify(state.office);
    return { estadoIdentico: snapshotAntes === snapshotDepois };
  });
  const ok = r.estadoIdentico === true;
  return { ok, detail: `snapshot de state.office idêntico antes/depois=${r.estadoIdentico} (esp. true)` };
}, 'tentativa bloqueada de excluir despesa realizada = ZERO MUTATION (nenhum campo de state.office muda)');

await check('OE_DELETE_04', async () => {
  // O formulário real (addOfficeDespesa) proíbe valor<=0 por construção — o
  // guard é testado diretamente contra o state, como o cenário pede, pra
  // confirmar que valor=0 também não vira uma "entidade deletável" por si só.
  const r = await page.evaluate(() => {
    state.office.despesas.push({ id: 'despOE04Zero', descricao: 'Despesa Valor Zero (estado legado/inválido — nunca produzido pelo formulário)', categoria: 'Op', valor: 0, data: '2026-09-02', conta: 'ocDespesaTeste', projetoId: null, status: 'pago', createdAt: 'despOE04Zero' });
    const c = canDeleteOfficeExpense('despOE04Zero');
    delOfficeDespesa('despOE04Zero');
    return { allowed: c.allowed, reason: c.reason, aindaExiste: state.office.despesas.some((x) => x.id === 'despOE04Zero') };
  });
  const ok = r.allowed === false && r.reason === 'realized_expense' && r.aindaExiste === true;
  return { ok, detail: `despesa valor=0 (nunca produzida pelo formulário real, testada direto no state) — allowed=${r.allowed} (esp. false), reason=${r.reason} (esp. realized_expense) — valor zero não torna a despesa deletável` };
}, 'despesa com valor=0 (estado que o formulário real proíbe, testado direto no state) → ainda BLOCK, valor zero não transforma histórico em entidade deletável');

await check('OE_DELETE_05', async () => {
  // Mesmo raciocínio pra um valor negativo num estado legado/inválido — o
  // guard protege o histórico independentemente do valor, sem corrigir/migrar
  // o dado.
  const r = await page.evaluate(() => {
    state.office.despesas.push({ id: 'despOE05Neg', descricao: 'Despesa Valor Negativo (estado legado/inválido)', categoria: 'Op', valor: -50, data: '2026-09-03', conta: 'ocDespesaTeste', projetoId: null, status: 'pago', createdAt: 'despOE05Neg' });
    const c = canDeleteOfficeExpense('despOE05Neg');
    delOfficeDespesa('despOE05Neg');
    return { allowed: c.allowed, reason: c.reason, aindaExiste: state.office.despesas.some((x) => x.id === 'despOE05Neg') };
  });
  const ok = r.allowed === false && r.reason === 'realized_expense' && r.aindaExiste === true;
  return { ok, detail: `despesa valor=-50 (estado legado/inválido, testado direto no state) — allowed=${r.allowed} (esp. false), reason=${r.reason} (esp. realized_expense)` };
}, 'despesa com valor negativo (estado legado/inválido) → ainda BLOCK, o guard protege o histórico independentemente do valor, sem migrar o dado');

await check('OE_DELETE_06', async () => {
  const r = await page.evaluate(() => {
    const qtdDespesasAntes = state.office.despesas.length;
    const c = canDeleteOfficeExpense('id_que_nao_existe_despesa');
    delOfficeDespesa('id_que_nao_existe_despesa');
    return { allowed: c.allowed, reason: c.reason, qtdDespesasAntes, qtdDespesasDepois: state.office.despesas.length };
  });
  const ok = r.allowed === false && r.reason === 'not_found' && r.qtdDespesasAntes === r.qtdDespesasDepois;
  return { ok, detail: `despesa inexistente — allowed=${r.allowed} (esp. false), reason=${r.reason} (esp. not_found), qtd despesas antes=${r.qtdDespesasAntes} depois=${r.qtdDespesasDepois} (zero mutation)` };
}, 'canDeleteOfficeExpense para ID de despesa inexistente → allowed:false, reason:not_found, nunca allowed:true');

await check('OE_DELETE_07', async () => {
  const r = await page.evaluate(() => {
    const saldoContaAntes = calcSaldoOfficeConta('ocDespesaTeste');
    delOfficeDespesa('despOE01'); // já sabemos que é bloqueado
    return {
      contaAindaExiste: state.office.contas.some((x) => x.id === 'ocDespesaTeste'),
      despesaAindaExiste: state.office.despesas.some((x) => x.id === 'despOE01'),
      saldoContaDepois: calcSaldoOfficeConta('ocDespesaTeste'),
      saldoContaAntes,
    };
  });
  const ok = r.contaAindaExiste === true && r.despesaAindaExiste === true && r.saldoContaAntes === r.saldoContaDepois;
  return { ok, detail: JSON.stringify(r) };
}, 'despesa associada a conta empresarial: tentativa de exclusão bloqueada não afeta a conta, a despesa, nem o saldo da conta');

await page.evaluate(() => {
  // Cenário mais rico pra OE_DELETE_08: reserva, aplicação/resgate,
  // recebível, projeto, repasse já realizado — pra confirmar que bloquear a
  // exclusão da despesa não toca em NADA fora de state.office.despesas.
  state.office.reservas.push({ id: 'orOE08', nome: 'Reserva OE08', finalidade: 'outro', color: '#5b7fff', saldoInicial: 0 });
  openAplicarOfficeReserva('orOE08');
  document.getElementById('aplicOReservaValor').value = '100';
  document.getElementById('aplicOReservaConta').value = 'ocDespesaTeste';
  confirmarAplicarOfficeReserva('orOE08');
  state.office.projetos.push({ id: 'pjOE08', nome: 'Projeto OE08', cliente: 'Cliente Y', valorContrato: 500, status: 'contratado', dataContrato: '2026-09-01', observacao: '', createdAt: 'pjOE08' });
  state.office.recebiveis.push({ id: 'recOE08', projetoId: 'pjOE08', descricao: 'Recebível OE08', valor: 500, estado: 'recebido', dataPrevista: '2026-09-05', dataRecebimento: '2026-09-05', contaDestino: 'ocDespesaTeste', createdAt: 'recOE08' });
});
await check('OE_DELETE_08', async () => {
  const r = await page.evaluate(() => {
    const antes = {
      recebiveis: JSON.stringify(state.office.recebiveis),
      reservas: JSON.stringify(state.office.reservas),
      movimentacoesReservas: JSON.stringify(state.office.movimentacoesReservas),
      movimentacoesContas: JSON.stringify(state.office.movimentacoesContas),
      repasses: JSON.stringify(state.office.repasses),
      projetos: JSON.stringify(state.office.projetos),
      receitas: JSON.stringify(state.receitas),
    };
    delOfficeDespesa('despOE01'); // já sabemos que é bloqueado
    const depois = {
      recebiveis: JSON.stringify(state.office.recebiveis),
      reservas: JSON.stringify(state.office.reservas),
      movimentacoesReservas: JSON.stringify(state.office.movimentacoesReservas),
      movimentacoesContas: JSON.stringify(state.office.movimentacoesContas),
      repasses: JSON.stringify(state.office.repasses),
      projetos: JSON.stringify(state.office.projetos),
      receitas: JSON.stringify(state.receitas),
    };
    return {
      recebiveisIdentico: antes.recebiveis === depois.recebiveis,
      reservasIdentico: antes.reservas === depois.reservas,
      movimentacoesReservasIdentico: antes.movimentacoesReservas === depois.movimentacoesReservas,
      movimentacoesContasIdentico: antes.movimentacoesContas === depois.movimentacoesContas,
      repassesIdentico: antes.repasses === depois.repasses,
      projetosIdentico: antes.projetos === depois.projetos,
      receitasIdentico: antes.receitas === depois.receitas,
    };
  });
  const ok = Object.values(r).every((v) => v === true);
  return { ok, detail: JSON.stringify(r) };
}, 'bloquear a exclusão de uma despesa não altera recebíveis, reservas, movimentacoesReservas, movimentacoesContas, repasses, projetos, ou receitas pessoais');

// ---------------------------------------------------------------------------
// MATRIZ FINAL DE EXCLUSÕES DO OFFICE (seção 22 do Gate 3.4) — consolida em um
// único teste por entidade o comportamento REAL já implementado (Gate 3.1 a
// 3.4), sem uniformizar nada: cada entidade documenta seu próprio
// comportamento esperado, não um padrão comum artificial.
// ---------------------------------------------------------------------------
await loadState(baseSyntheticState());
await page.evaluate(() => {
  state.office.contas.push({ id: 'mtxConta', name: 'Conta Matriz', color: '#111', saldoInicial: 0 });
});

await check('MATRIX_CONTA_VAZIA_ALLOW', async () => {
  const r = await page.evaluate(() => canDeleteOfficeAccount('mtxConta').allowed);
  return { ok: r === true, detail: `conta vazia (saldo 0, sem refs) — allowed=${r} (esp. true)` };
}, 'MATRIZ — Conta vazia → ALLOW');

await page.evaluate(() => { state.office.contas.push({ id: 'mtxContaSaldo', name: 'Conta Matriz Saldo', color: '#111', saldoInicial: 500 }); });
await check('MATRIX_CONTA_SALDO_BLOCK', async () => {
  const r = await page.evaluate(() => canDeleteOfficeAccount('mtxContaSaldo'));
  return { ok: r.allowed === false, detail: `conta com saldo≠0 — allowed=${r.allowed} (esp. false), reason=${r.reason}` };
}, 'MATRIZ — Conta com saldo != 0 → BLOCK');

await page.evaluate(() => {
  state.office.contas.push({ id: 'mtxContaHist', name: 'Conta Matriz Histórico', color: '#111', saldoInicial: 1000 });
  state.office.reservas.push({ id: 'mtxReservaHist', nome: 'Reserva Matriz Hist', finalidade: 'outro', color: '#5b7fff', saldoInicial: 0 });
  openAplicarOfficeReserva('mtxReservaHist');
  document.getElementById('aplicOReservaValor').value = '100';
  document.getElementById('aplicOReservaConta').value = 'mtxContaHist';
  confirmarAplicarOfficeReserva('mtxReservaHist');
});
await check('MATRIX_CONTA_HISTORICO_BLOCK', async () => {
  const r = await page.evaluate(() => canDeleteOfficeAccount('mtxContaHist'));
  return { ok: r.allowed === false && r.reason === 'has_movimentacao', detail: `conta com movimentação — allowed=${r.allowed} (esp. false), reason=${r.reason} (esp. has_movimentacao)` };
}, 'MATRIZ — Conta com histórico (movimentacoesContas) → BLOCK');

await page.evaluate(() => {
  state.office.contas.push({ id: 'mtxContaRef', name: 'Conta Matriz Referência', color: '#111', saldoInicial: 0 });
  state.office.projetos.push({ id: 'mtxProjRef', nome: 'Projeto Matriz Ref', cliente: 'C', valorContrato: 100, status: 'contratado', dataContrato: '2026-09-01', observacao: '', createdAt: 'mtxProjRef' });
  state.office.recebiveis.push({ id: 'mtxRecRef', projetoId: 'mtxProjRef', descricao: 'X', valor: 100, estado: 'previsto', dataPrevista: '2026-10-01', dataRecebimento: null, contaDestino: 'mtxContaRef', createdAt: 'mtxRecRef' });
});
await check('MATRIX_CONTA_REFERENCIA_BLOCK', async () => {
  const r = await page.evaluate(() => canDeleteOfficeAccount('mtxContaRef'));
  return { ok: r.allowed === false && r.reason === 'has_recebivel', detail: `conta referenciada por recebível — allowed=${r.allowed} (esp. false), reason=${r.reason} (esp. has_recebivel)` };
}, 'MATRIZ — Conta com referência (recebível.contaDestino) → BLOCK');

await page.evaluate(() => { state.office.reservas.push({ id: 'mtxReservaVazia', nome: 'Reserva Matriz Vazia', finalidade: 'outro', color: '#5b7fff', saldoInicial: 0 }); });
await check('MATRIX_RESERVA_VAZIA_ALLOW', async () => {
  const r = await page.evaluate(() => canDeleteOfficeReserve('mtxReservaVazia').allowed);
  return { ok: r === true, detail: `reserva vazia/saldo 0 — allowed=${r} (esp. true)` };
}, 'MATRIZ — Reserva vazia / saldo 0 → ALLOW');

await page.evaluate(() => { state.office.reservas.push({ id: 'mtxReservaSaldo', nome: 'Reserva Matriz Saldo', finalidade: 'outro', color: '#5b7fff', saldoInicial: 300 }); });
await check('MATRIX_RESERVA_SALDO_BLOCK', async () => {
  const r = await page.evaluate(() => canDeleteOfficeReserve('mtxReservaSaldo'));
  return { ok: r.allowed === false && r.reason === 'has_nonzero_balance', detail: `reserva com saldo≠0 — allowed=${r.allowed} (esp. false), reason=${r.reason} (esp. has_nonzero_balance)` };
}, 'MATRIZ — Reserva com saldo != 0 → BLOCK');

await check('MATRIX_RESERVA_HISTORICO_BLOCK', async () => {
  const r = await page.evaluate(() => canDeleteOfficeReserve('mtxReservaHist'));
  return { ok: r.allowed === false && r.reason === 'has_financial_history', detail: `reserva com histórico (aplicação) — allowed=${r.allowed} (esp. false), reason=${r.reason} (esp. has_financial_history)` };
}, 'MATRIZ — Reserva com histórico → BLOCK');

await check('MATRIX_RECEBIVEL_NAO_REALIZADO_ALLOW', async () => {
  // Comportamento ATUAL (pré-existente, fora do escopo deste gate): um
  // recebível ainda 'previsto' pode ser excluído normalmente.
  const r = await page.evaluate(() => {
    delOfficeRecebivel('mtxRecRef');
    return { aindaExiste: state.office.recebiveis.some((x) => x.id === 'mtxRecRef') };
  });
  return { ok: r.aindaExiste === false, detail: `recebível previsto (não realizado) — excluído normalmente, aindaExiste=${r.aindaExiste} (esp. false) — comportamento atual, não alterado por este gate` };
}, 'MATRIZ — Recebível não realizado → comportamento atual (ALLOW, não alterado por este gate)');

await page.evaluate(() => {
  state.office.recebiveis.push({ id: 'mtxRecRealizado', projetoId: 'mtxProjRef', descricao: 'Y', valor: 200, estado: 'recebido', dataPrevista: '2026-09-01', dataRecebimento: '2026-09-01', contaDestino: 'mtxContaRef', createdAt: 'mtxRecRealizado' });
});
await check('MATRIX_RECEBIVEL_REALIZADO_BLOCK', async () => {
  const r = await page.evaluate(() => {
    delOfficeRecebivel('mtxRecRealizado');
    return { aindaExiste: state.office.recebiveis.some((x) => x.id === 'mtxRecRealizado') };
  });
  return { ok: r.aindaExiste === true, detail: `recebível já recebido — tentativa de exclusão bloqueada, aindaExiste=${r.aindaExiste} (esp. true) — comportamento atual (já protegido antes do Gate 3.4), não alterado por este gate` };
}, 'MATRIZ — Recebível realizado → BLOCK (comportamento atual, não alterado por este gate)');

await check('MATRIX_DESPESA_REALIZADA_BLOCK', async () => {
  const r = await page.evaluate(() => {
    state.office.despesas.push({ id: 'mtxDespesa', descricao: 'Despesa Matriz', categoria: 'Op', valor: 50, data: '2026-09-01', conta: 'mtxContaRef', projetoId: null, status: 'pago', createdAt: 'mtxDespesa' });
    delOfficeDespesa('mtxDespesa');
    return { aindaExiste: state.office.despesas.some((x) => x.id === 'mtxDespesa') };
  });
  return { ok: r.aindaExiste === true, detail: `despesa (sempre realizada no modelo atual) — tentativa de exclusão bloqueada, aindaExiste=${r.aindaExiste} (esp. true) — NOVO neste gate` };
}, 'MATRIZ — Despesa realizada → BLOCK (implementado neste gate)');

await check('MATRIX_PROJETO_SEM_REALIZACAO_ALLOW', async () => {
  // Comportamento ATUAL: projeto sem nenhum recebível/repasse realizado
  // vinculado pode ser excluído normalmente.
  const r = await page.evaluate(() => {
    state.office.projetos.push({ id: 'mtxProjSemRealizacao', nome: 'Projeto Sem Realização', cliente: 'C', valorContrato: 100, status: 'potencial', dataContrato: null, observacao: '', createdAt: 'mtxProjSemRealizacao' });
    delOfficeProjeto('mtxProjSemRealizacao');
    return { aindaExiste: state.office.projetos.some((x) => x.id === 'mtxProjSemRealizacao') };
  });
  return { ok: r.aindaExiste === false, detail: `projeto sem recebível/repasse realizado vinculado — excluído normalmente, aindaExiste=${r.aindaExiste} (esp. false) — comportamento atual, não alterado por este gate` };
}, 'MATRIZ — Projeto sem realização vinculada → comportamento atual (ALLOW, não alterado por este gate)');

await check('MATRIX_PROJETO_COM_REALIZACAO_BLOCK', async () => {
  // mtxProjRef tem mtxRecRealizado (recebível já recebido) vinculado.
  const r = await page.evaluate(() => {
    delOfficeProjeto('mtxProjRef');
    return { aindaExiste: state.office.projetos.some((x) => x.id === 'mtxProjRef') };
  });
  return { ok: r.aindaExiste === true, detail: `projeto com recebível realizado vinculado — tentativa de exclusão bloqueada, aindaExiste=${r.aindaExiste} (esp. true) — comportamento atual, não alterado por este gate` };
}, 'MATRIZ — Projeto com realização vinculada → BLOCK (comportamento atual, não alterado por este gate)');

await close();

const fails = results.filter((r) => r.status === 'FAIL').length;
console.log(`\ngate3-4-expense-delete-integrity.test.mjs: TOTAL=${results.length} PASS=${results.length - fails} FAIL=${fails}`);
if (fails > 0) process.exitCode = 1;

export { results };
