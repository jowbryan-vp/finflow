// Gate 3.2 — seção 4-15: um registro financeiro do escritório com histórico
// realizado nunca pode ser apagado destrutivamente. Reserva/conta vazias
// (sem nenhuma movimentação/referência) podem ser excluídas normalmente;
// qualquer uma com histórico bloqueia a exclusão com ZERO MUTATION — nada é
// apagado, nem sequer "compensado" automaticamente (nenhuma exclusão
// inteligente), e o patrimônio nunca muda por uma tentativa bloqueada.
import { openHarness, makeRunner, baseSyntheticState } from './harness.mjs';

const { page, loadState, close } = await openHarness();
const { check, results } = makeRunner('gate3-2-delete-integrity');

// ---------------------------------------------------------------------------
// RESERVA
// ---------------------------------------------------------------------------
await loadState(baseSyntheticState());
await page.evaluate(() => {
  state.office.contas.push({ id: 'oc1', name: 'Conta PJ', color: '#ff9900', saldoInicial: 5000 });
});

await check('OR_DELETE_01', async () => {
  const r = await page.evaluate(() => {
    state.office.reservas.push({ id: 'orVazia', nome: 'Reserva Vazia', finalidade: 'outro', color: '#5b7fff', saldoInicial: 0 });
    const check1 = canDeleteOfficeReserve('orVazia');
    delOfficeReserva('orVazia');
    const aindaExiste = state.office.reservas.some((x) => x.id === 'orVazia');
    return { allowed: check1.allowed, aindaExiste };
  });
  const ok = r.allowed === true && r.aindaExiste === false;
  return { ok, detail: `reserva sem nenhuma movimentação — canDeleteOfficeReserve.allowed=${r.allowed} (esp. true), removida de fato (aindaExiste=${r.aindaExiste}, esp. false)` };
}, 'reserva nova sem nenhuma movimentação vinculada pode ser excluída normalmente');

await check('OR_DELETE_02', async () => {
  const r = await page.evaluate(() => {
    state.office.reservas.push({ id: 'orComAplicacao', nome: 'Reserva Com Aplicação', finalidade: 'impostos', color: '#5b7fff', saldoInicial: 0 });
    openAplicarOfficeReserva('orComAplicacao');
    document.getElementById('aplicOReservaValor').value = '1000';
    document.getElementById('aplicOReservaConta').value = 'oc1';
    confirmarAplicarOfficeReserva('orComAplicacao');
    const check1 = canDeleteOfficeReserve('orComAplicacao');
    delOfficeReserva('orComAplicacao');
    const aindaExiste = state.office.reservas.some((x) => x.id === 'orComAplicacao');
    return { allowed: check1.allowed, aindaExiste };
  });
  const ok = r.allowed === false && r.aindaExiste === true;
  return { ok, detail: `reserva com uma aplicação — canDeleteOfficeReserve.allowed=${r.allowed} (esp. false), continua existindo (aindaExiste=${r.aindaExiste}, esp. true)` };
}, 'reserva com aplicação → exclusão bloqueada, reserva continua existindo');

await check('OR_DELETE_03', async () => {
  const r = await page.evaluate(() => {
    openResgatarOfficeReserva('orComAplicacao');
    document.getElementById('resgOReservaValor').value = '300';
    document.getElementById('resgOReservaConta').value = 'oc1';
    confirmarResgatarOfficeReserva('orComAplicacao');
    const check1 = canDeleteOfficeReserve('orComAplicacao');
    delOfficeReserva('orComAplicacao');
    const aindaExiste = state.office.reservas.some((x) => x.id === 'orComAplicacao');
    return { allowed: check1.allowed, aindaExiste };
  });
  const ok = r.allowed === false && r.aindaExiste === true;
  return { ok, detail: `reserva com aplicação + resgate — canDeleteOfficeReserve.allowed=${r.allowed} (esp. false), continua existindo` };
}, 'reserva com aplicação + resgate → exclusão bloqueada');

await check('OR_DELETE_04_05_06_07', async () => {
  const r = await page.evaluate(() => {
    const snapshotAntes = JSON.stringify(state.office);
    const patrimonioAntes = getOfficeFinancialPatrimony();
    const saldoContaAntes = calcSaldoOfficeConta('oc1');
    const saldoReservaAntes = getSaldoOfficeReserva('orComAplicacao');

    delOfficeReserva('orComAplicacao'); // já sabemos que é bloqueado (OR_DELETE_03)

    const snapshotDepois = JSON.stringify(state.office);
    const patrimonioDepois = getOfficeFinancialPatrimony();
    const saldoContaDepois = calcSaldoOfficeConta('oc1');
    const saldoReservaDepois = getSaldoOfficeReserva('orComAplicacao');

    return {
      estadoIdentico: snapshotAntes === snapshotDepois,
      patrimonioAntes, patrimonioDepois, saldoContaAntes, saldoContaDepois, saldoReservaAntes, saldoReservaDepois,
    };
  });
  const ok = r.estadoIdentico === true
    && r.patrimonioAntes === r.patrimonioDepois
    && r.saldoContaAntes === r.saldoContaDepois
    && r.saldoReservaAntes === r.saldoReservaDepois;
  return { ok, detail: JSON.stringify(r) };
}, 'tentativa bloqueada de excluir reserva = ZERO MUTATION (snapshot de state.office idêntico, patrimônio/saldo conta/saldo reserva inalterados)');

// ---------------------------------------------------------------------------
// CONTA EMPRESARIAL
// ---------------------------------------------------------------------------
await loadState(baseSyntheticState());
await page.evaluate(() => {
  state.office.contas.push({ id: 'ocVazia', name: 'Conta Vazia', color: '#111', saldoInicial: 0 });
});

await check('OA_DELETE_01', async () => {
  const r = await page.evaluate(() => {
    const check1 = canDeleteOfficeAccount('ocVazia');
    delOfficeConta('ocVazia');
    return { allowed: check1.allowed, aindaExiste: state.office.contas.some((x) => x.id === 'ocVazia') };
  });
  const ok = r.allowed === true && r.aindaExiste === false;
  return { ok, detail: `conta nova sem qualquer referência — allowed=${r.allowed} (esp. true), removida (aindaExiste=${r.aindaExiste}, esp. false)` };
}, 'conta nova sem qualquer referência pode ser excluída normalmente');

await page.evaluate(() => {
  state.office.contas.push({ id: 'ocRecebivel', name: 'Conta Recebível', color: '#111', saldoInicial: 0 });
  state.office.projetos.push({ id: 'p1', nome: 'P1', cliente: 'C', valorContrato: 1000, status: 'contratado', dataContrato: '2026-09-01', observacao: '', createdAt: 'p1' });
  state.office.recebiveis.push({ id: 'rec1', projetoId: 'p1', descricao: 'X', valor: 1000, estado: 'previsto', dataPrevista: '2026-10-01', dataRecebimento: null, contaDestino: 'ocRecebivel', createdAt: 'rec1' });
});
await check('OA_DELETE_02', async () => {
  const r = await page.evaluate(() => {
    const check1 = canDeleteOfficeAccount('ocRecebivel');
    delOfficeConta('ocRecebivel');
    return { allowed: check1.allowed, reason: check1.reason, aindaExiste: state.office.contas.some((x) => x.id === 'ocRecebivel') };
  });
  const ok = r.allowed === false && r.reason === 'has_recebivel' && r.aindaExiste === true;
  return { ok, detail: `conta vinculada a recebível (contaDestino) — allowed=${r.allowed} (esp. false), reason=${r.reason}, continua existindo` };
}, 'conta vinculada a recebível (contaDestino) → exclusão bloqueada');

await page.evaluate(() => {
  state.office.contas.push({ id: 'ocDespesa', name: 'Conta Despesa', color: '#111', saldoInicial: 0 });
  state.office.despesas.push({ id: 'od1', descricao: 'Software', categoria: 'Software', valor: 100, data: '2026-09-10', conta: 'ocDespesa', projetoId: null, status: 'pago', createdAt: 'od1' });
});
await check('OA_DELETE_03', async () => {
  const r = await page.evaluate(() => {
    const check1 = canDeleteOfficeAccount('ocDespesa');
    delOfficeConta('ocDespesa');
    return { allowed: check1.allowed, reason: check1.reason, aindaExiste: state.office.contas.some((x) => x.id === 'ocDespesa') };
  });
  const ok = r.allowed === false && r.reason === 'has_despesa' && r.aindaExiste === true;
  return { ok, detail: `conta vinculada a despesa (conta) — allowed=${r.allowed} (esp. false), reason=${r.reason}, continua existindo` };
}, 'conta vinculada a despesa (conta) → exclusão bloqueada');

await page.evaluate(() => {
  state.office.contas.push({ id: 'ocAplic', name: 'Conta Aplicação', color: '#111', saldoInicial: 5000 });
  state.office.reservas.push({ id: 'orAplic', nome: 'Reserva Aplic', finalidade: 'outro', color: '#5b7fff', saldoInicial: 0 });
  openAplicarOfficeReserva('orAplic');
  document.getElementById('aplicOReservaValor').value = '500';
  document.getElementById('aplicOReservaConta').value = 'ocAplic';
  confirmarAplicarOfficeReserva('orAplic');
});
await check('OA_DELETE_04', async () => {
  const r = await page.evaluate(() => {
    const check1 = canDeleteOfficeAccount('ocAplic');
    delOfficeConta('ocAplic');
    return { allowed: check1.allowed, reason: check1.reason, aindaExiste: state.office.contas.some((x) => x.id === 'ocAplic') };
  });
  const ok = r.allowed === false && r.reason === 'has_movimentacao' && r.aindaExiste === true;
  return { ok, detail: `conta com movimentação de aplicação em reserva — allowed=${r.allowed} (esp. false), reason=${r.reason}, continua existindo` };
}, 'conta com movimentação de aplicação em reserva → exclusão bloqueada');

await page.evaluate(() => {
  openResgatarOfficeReserva('orAplic');
  document.getElementById('resgOReservaValor').value = '100';
  document.getElementById('resgOReservaConta').value = 'ocAplic';
  confirmarResgatarOfficeReserva('orAplic');
});
await check('OA_DELETE_05', async () => {
  const r = await page.evaluate(() => {
    // ocAplic já tinha uma aplicação; agora também tem um resgate — ambos
    // são movimentacoesContas, então o bloqueio já vale por qualquer um dos
    // dois. Testamos numa conta NOVA só com resgate, pra isolar o caso.
    state.office.contas.push({ id: 'ocResgate', name: 'Conta Resgate', color: '#111', saldoInicial: 5000 });
    state.office.reservas.push({ id: 'orResgate', nome: 'Reserva Resgate', finalidade: 'outro', color: '#5b7fff', saldoInicial: 0 });
    openAplicarOfficeReserva('orResgate');
    document.getElementById('aplicOReservaValor').value = '400';
    document.getElementById('aplicOReservaConta').value = 'ocResgate';
    confirmarAplicarOfficeReserva('orResgate');
    // A aplicação já bloquearia por si — mas o objetivo do teste é confirmar
    // que um resgate SOZINHO também bloqueia; então usamos duas contas: uma
    // recebe a aplicação (ocResgateOrigemAplicacao) e outra recebe só o resgate.
    state.office.contas.push({ id: 'ocSoResgate', name: 'Conta Só Resgate', color: '#111', saldoInicial: 0 });
    openResgatarOfficeReserva('orResgate');
    document.getElementById('resgOReservaValor').value = '400';
    document.getElementById('resgOReservaConta').value = 'ocSoResgate';
    confirmarResgatarOfficeReserva('orResgate');
    const check1 = canDeleteOfficeAccount('ocSoResgate');
    delOfficeConta('ocSoResgate');
    return { allowed: check1.allowed, reason: check1.reason, aindaExiste: state.office.contas.some((x) => x.id === 'ocSoResgate') };
  });
  const ok = r.allowed === false && r.reason === 'has_movimentacao' && r.aindaExiste === true;
  return { ok, detail: `conta que recebeu somente um resgate de reserva — allowed=${r.allowed} (esp. false), reason=${r.reason}, continua existindo` };
}, 'conta com movimentação de resgate de reserva → exclusão bloqueada');

await page.evaluate(() => {
  // Duas contas separadas: uma recebe o recebível (contaDestino), a outra é
  // só a ORIGEM do repasse realizado — isola o bloqueio por movimentacoesContas
  // (has_movimentacao) do bloqueio por recebível (has_recebivel), que já foi
  // testado isoladamente em OA_DELETE_02.
  state.office.contas.push({ id: 'ocRepasseDestino', name: 'Conta Destino do Recebível', color: '#111', saldoInicial: 0 });
  state.office.contas.push({ id: 'ocRepasseOrigem', name: 'Conta Origem do Repasse', color: '#111', saldoInicial: 3000 });
  state.office.projetos.push({ id: 'p2', nome: 'P2', cliente: 'C', valorContrato: 5000, status: 'contratado', dataContrato: '2026-09-01', observacao: '', createdAt: 'p2' });
  state.office.regrasDistribuicao = [{ destino: 'reserva', percentual: 20 }, { destino: 'impostos', percentual: 30 }, { destino: 'repasse_pessoal', percentual: 50 }];
  state.office.recebiveis.push({ id: 'rec2', projetoId: 'p2', descricao: 'X', valor: 2000, estado: 'recebido', dataPrevista: '2026-09-10', dataRecebimento: '2026-09-10', contaDestino: 'ocRepasseDestino', createdAt: 'rec2' });
  syncDerivedPersonalTransfer('rec2');
  const repasse = state.office.repasses.find((rp) => rp.recebivelId === 'rec2');
  realizeOfficeTransfer(repasse.id, '2026-09-11', 'ocRepasseOrigem', 'c1');
});
await check('OA_DELETE_06', async () => {
  const r = await page.evaluate(() => {
    const check1 = canDeleteOfficeAccount('ocRepasseOrigem');
    delOfficeConta('ocRepasseOrigem');
    return { allowed: check1.allowed, reason: check1.reason, aindaExiste: state.office.contas.some((x) => x.id === 'ocRepasseOrigem') };
  });
  const ok = r.allowed === false && r.reason === 'has_movimentacao' && r.aindaExiste === true;
  return { ok, detail: `conta usada como origem de um repasse já realizado (não referenciada por nenhum recebível) — allowed=${r.allowed} (esp. false), reason=${r.reason}, continua existindo` };
}, 'conta utilizada em repasse ao Jow (movimentacoesContas via realizeOfficeTransfer) → exclusão bloqueada');

await page.evaluate(() => {
  state.office.contas.push({ id: 'ocRetirada', name: 'Conta Retirada', color: '#111', saldoInicial: 3000 });
  createExtraordinaryWithdrawal(500, '2026-09-12', 'ocRetirada', 'c1', 'teste');
});
await check('OA_DELETE_07', async () => {
  const r = await page.evaluate(() => {
    const check1 = canDeleteOfficeAccount('ocRetirada');
    delOfficeConta('ocRetirada');
    return { allowed: check1.allowed, reason: check1.reason, aindaExiste: state.office.contas.some((x) => x.id === 'ocRetirada') };
  });
  const ok = r.allowed === false && r.reason === 'has_movimentacao' && r.aindaExiste === true;
  return { ok, detail: `conta usada numa retirada extraordinária — allowed=${r.allowed} (esp. false), reason=${r.reason}, continua existindo` };
}, 'conta utilizada em retirada extraordinária → exclusão bloqueada');

await check('OA_DELETE_08_09', async () => {
  const r = await page.evaluate(() => {
    const snapshotAntes = JSON.stringify(state.office);
    const patrimonioAntes = getOfficeFinancialPatrimony();
    delOfficeConta('ocRetirada'); // já sabemos que é bloqueado (OA_DELETE_07)
    const snapshotDepois = JSON.stringify(state.office);
    const patrimonioDepois = getOfficeFinancialPatrimony();
    return { estadoIdentico: snapshotAntes === snapshotDepois, patrimonioAntes, patrimonioDepois };
  });
  const ok = r.estadoIdentico === true && r.patrimonioAntes === r.patrimonioDepois;
  return { ok, detail: JSON.stringify(r) };
}, 'tentativa bloqueada de excluir conta = ZERO MUTATION (snapshot idêntico), patrimônio do escritório inalterado');

// ---------------------------------------------------------------------------
// RELAÇÃO CRUZADA — conta + reserva vinculadas por uma aplicação.
// ---------------------------------------------------------------------------
await loadState(baseSyntheticState());
await page.evaluate(() => {
  state.office.contas.push({ id: 'ocCross', name: 'Conta PJ', color: '#ff9900', saldoInicial: 5000 });
  state.office.reservas.push({ id: 'orCross', nome: 'Reserva Cross', finalidade: 'outro', color: '#5b7fff', saldoInicial: 0 });
  openAplicarOfficeReserva('orCross');
  document.getElementById('aplicOReservaValor').value = '1000';
  document.getElementById('aplicOReservaConta').value = 'ocCross';
  confirmarAplicarOfficeReserva('orCross');
});

await check('OFFICE_DELETE_CROSS_01', async () => {
  const r = await page.evaluate(() => {
    const patrimonioAntes = getOfficeFinancialPatrimony();
    const saldoContaAntes = calcSaldoOfficeConta('ocCross');
    const saldoReservaAntes = getSaldoOfficeReserva('orCross');
    const qtdMovContasAntes = state.office.movimentacoesContas.length;
    const qtdMovReservasAntes = state.office.movimentacoesReservas.length;

    const checkReserva = canDeleteOfficeReserve('orCross');
    delOfficeReserva('orCross');
    const checkConta = canDeleteOfficeAccount('ocCross');
    delOfficeConta('ocCross');

    return {
      checkReservaAllowed: checkReserva.allowed, checkContaAllowed: checkConta.allowed,
      reservaAindaExiste: state.office.reservas.some((x) => x.id === 'orCross'),
      contaAindaExiste: state.office.contas.some((x) => x.id === 'ocCross'),
      patrimonioAntes, patrimonioDepois: getOfficeFinancialPatrimony(),
      saldoContaAntes, saldoContaDepois: calcSaldoOfficeConta('ocCross'),
      saldoReservaAntes, saldoReservaDepois: getSaldoOfficeReserva('orCross'),
      qtdMovContasAntes, qtdMovContasDepois: state.office.movimentacoesContas.length,
      qtdMovReservasAntes, qtdMovReservasDepois: state.office.movimentacoesReservas.length,
    };
  });
  const ok = r.checkReservaAllowed === false && r.checkContaAllowed === false
    && r.reservaAindaExiste === true && r.contaAindaExiste === true
    && r.patrimonioAntes === 5000 && r.patrimonioDepois === 5000
    && r.saldoContaAntes === 4000 && r.saldoContaDepois === 4000
    && r.saldoReservaAntes === 1000 && r.saldoReservaDepois === 1000
    && r.qtdMovContasAntes === r.qtdMovContasDepois && r.qtdMovReservasAntes === r.qtdMovReservasDepois;
  return { ok, detail: JSON.stringify(r) };
}, 'conta PJ=5000 → aplicação de 1000 na reserva → tentar excluir reserva E conta: ambas bloqueadas, nenhuma movimentação desaparece, patrimônio permanece 5000 (4000 caixa + 1000 reserva)');

await close();

const fails = results.filter((r) => r.status === 'FAIL').length;
console.log(`\ngate3-2-delete-integrity.test.mjs: TOTAL=${results.length} PASS=${results.length - fails} FAIL=${fails}`);
if (fails > 0) process.exitCode = 1;

export { results };
