// Gate 3.3 — seção 4-20: "sem movimentações/referências" não é o mesmo que
// "financeiramente vazio". ENTIDADE FINANCEIRAMENTE EXCLUÍVEL = SEM HISTÓRICO
// + SEM REFERÊNCIAS + SALDO EFETIVO = ZERO. Este arquivo testa a nova camada
// de proteção por saldo em canDeleteOfficeReserve/canDeleteOfficeAccount
// (seções 7-10), a precedência do histórico/referência sobre o saldo (seção
// 9), o tratamento de ID inexistente (seção 10), a preservação de patrimônio
// em AMBOS os casos — bloqueado e permitido (INV-O-DELETE-PATRIMONY-2, seção
// 17) — e o teste integrado de conservação patrimonial (seção 19-20).
import { openHarness, makeRunner, baseSyntheticState } from './harness.mjs';

const { page, loadState, close } = await openHarness();
const { check, results } = makeRunner('gate3-3-balance-protection');

// ---------------------------------------------------------------------------
// OA_BALANCE — conta empresarial
// ---------------------------------------------------------------------------
await loadState(baseSyntheticState());

await check('OA_BALANCE_01', async () => {
  const r = await page.evaluate(() => {
    state.office.contas.push({ id: 'oaSaldo5000', name: 'Conta Saldo 5000', color: '#111', saldoInicial: 5000 });
    const c = canDeleteOfficeAccount('oaSaldo5000');
    delOfficeConta('oaSaldo5000');
    return { allowed: c.allowed, reason: c.reason, aindaExiste: state.office.contas.some((x) => x.id === 'oaSaldo5000') };
  });
  const ok = r.allowed === false && r.reason === 'has_nonzero_balance' && r.aindaExiste === true;
  return { ok, detail: `conta saldoInicial=5000 sem refs/movimentações — allowed=${r.allowed} (esp. false), reason=${r.reason} (esp. has_nonzero_balance), continua existindo` };
}, 'conta com saldoInicial=5000 e nenhuma referência/movimentação → exclusão bloqueada por saldo não zero');

await check('OA_BALANCE_02', async () => {
  const r = await page.evaluate(() => {
    state.office.contas.push({ id: 'oaSaldoZero', name: 'Conta Saldo Zero', color: '#111', saldoInicial: 0 });
    const c = canDeleteOfficeAccount('oaSaldoZero');
    delOfficeConta('oaSaldoZero');
    return { allowed: c.allowed, aindaExiste: state.office.contas.some((x) => x.id === 'oaSaldoZero') };
  });
  const ok = r.allowed === true && r.aindaExiste === false;
  return { ok, detail: `conta saldoInicial=0 sem refs/movimentações — allowed=${r.allowed} (esp. true), removida (aindaExiste=${r.aindaExiste}, esp. false)` };
}, 'conta com saldoInicial=0 e nenhuma referência/movimentação → exclusão permitida');

await check('OA_BALANCE_03', async () => {
  const r = await page.evaluate(() => {
    state.office.contas.push({ id: 'oaSaldoNeg', name: 'Conta Saldo Negativo', color: '#111', saldoInicial: -500 });
    const c = canDeleteOfficeAccount('oaSaldoNeg');
    delOfficeConta('oaSaldoNeg');
    return { allowed: c.allowed, reason: c.reason, aindaExiste: state.office.contas.some((x) => x.id === 'oaSaldoNeg') };
  });
  const ok = r.allowed === false && r.reason === 'has_nonzero_balance' && r.aindaExiste === true;
  return { ok, detail: `conta saldoInicial=-500 — allowed=${r.allowed} (esp. false), reason=${r.reason} (esp. has_nonzero_balance) — saldo negativo também bloqueia` };
}, 'conta com saldoInicial=-500 (saldo negativo) → exclusão também bloqueada, não só saldo positivo');

await check('OA_BALANCE_04', async () => {
  const r = await page.evaluate(() => {
    state.office.contas.push({ id: 'oaTolerancia', name: 'Conta Tolerância', color: '#111', saldoInicial: 0.001 });
    const c = canDeleteOfficeAccount('oaTolerancia');
    delOfficeConta('oaTolerancia');
    return { allowed: c.allowed, aindaExiste: state.office.contas.some((x) => x.id === 'oaTolerancia') };
  });
  const ok = r.allowed === true && r.aindaExiste === false;
  return { ok, detail: `conta saldoInicial=0.001 (< MONEY_EPSILON=0.005) — allowed=${r.allowed} (esp. true) — tratado como efetivamente zero, removida` };
}, 'conta com saldo residual de 0.001 (dentro da tolerância monetária) → tratada como zero, exclusão permitida');

await check('OA_BALANCE_05', async () => {
  const r = await page.evaluate(() => {
    state.office.contas.push({ id: 'oaZeroComMov', name: 'Conta Zero Com Movimentação', color: '#111', saldoInicial: 0 });
    // Aplicação de 200 seguida de resgate de 200: saldo efetivo volta a zero,
    // mas movimentacoesContas continua com os dois lançamentos — histórico
    // real, mesmo com saldo líquido zero.
    state.office.reservas.push({ id: 'orParaZeroComMov', nome: 'Reserva Auxiliar', finalidade: 'outro', color: '#5b7fff', saldoInicial: 0 });
    openAplicarOfficeReserva('orParaZeroComMov');
    document.getElementById('aplicOReservaValor').value = '200';
    document.getElementById('aplicOReservaConta').value = 'oaZeroComMov';
    confirmarAplicarOfficeReserva('orParaZeroComMov');
    openResgatarOfficeReserva('orParaZeroComMov');
    document.getElementById('resgOReservaValor').value = '200';
    document.getElementById('resgOReservaConta').value = 'oaZeroComMov';
    confirmarResgatarOfficeReserva('orParaZeroComMov');
    const saldoEfetivo = calcSaldoOfficeConta('oaZeroComMov');
    const c = canDeleteOfficeAccount('oaZeroComMov');
    delOfficeConta('oaZeroComMov');
    return { saldoEfetivo, allowed: c.allowed, reason: c.reason, aindaExiste: state.office.contas.some((x) => x.id === 'oaZeroComMov') };
  });
  const ok = r.saldoEfetivo === 0 && r.allowed === false && r.reason === 'has_movimentacao' && r.aindaExiste === true;
  return { ok, detail: `saldo efetivo=${r.saldoEfetivo} (esp. 0) mas allowed=${r.allowed} (esp. false), reason=${r.reason} (esp. has_movimentacao) — histórico bloqueia mesmo com saldo líquido zero` };
}, 'conta com saldo efetivo zero mas com movimentacoesContas (aplicação+resgate) → ainda bloqueada por histórico, saldo zero não basta');

await page.evaluate(() => {
  state.office.contas.push({ id: 'oaBalanceMutation', name: 'Conta Mutation Check', color: '#111', saldoInicial: 1234.56 });
});
await check('OA_BALANCE_06', async () => {
  const r = await page.evaluate(() => {
    const snapshotAntes = JSON.stringify(state.office);
    delOfficeConta('oaBalanceMutation'); // bloqueado por saldo não zero
    const snapshotDepois = JSON.stringify(state.office);
    return { estadoIdentico: snapshotAntes === snapshotDepois };
  });
  const ok = r.estadoIdentico === true;
  return { ok, detail: `tentativa bloqueada por saldo — snapshot de state.office idêntico antes/depois=${r.estadoIdentico} (esp. true)` };
}, 'tentativa de excluir conta bloqueada POR SALDO = ZERO MUTATION (nenhum campo de state.office muda)');

await check('OA_BALANCE_07', async () => {
  const r = await page.evaluate(() => {
    const patrimonioAntes = getOfficeFinancialPatrimony();
    delOfficeConta('oaBalanceMutation'); // já sabemos que é bloqueado
    const patrimonioDepois = getOfficeFinancialPatrimony();
    return { patrimonioAntes, patrimonioDepois };
  });
  const ok = r.patrimonioAntes === r.patrimonioDepois;
  return { ok, detail: `patrimônio antes=${r.patrimonioAntes}, depois=${r.patrimonioDepois} (esperado igual)` };
}, 'tentativa bloqueada por saldo não altera getOfficeFinancialPatrimony()');

// ---------------------------------------------------------------------------
// OR_BALANCE — reserva empresarial
// ---------------------------------------------------------------------------
await loadState(baseSyntheticState());
await page.evaluate(() => {
  state.office.contas.push({ id: 'ocParaReservas', name: 'Conta Auxiliar Reservas', color: '#111', saldoInicial: 10000 });
});

await check('OR_BALANCE_01', async () => {
  const r = await page.evaluate(() => {
    // Reserva LEGADA: saldoInicial>0 preservado por compatibilidade histórica
    // (Gate 3.1, seção 21 do Gate 3.3) — nunca migrado/zerado, mas também
    // nunca deletável enquanto carregar esse saldo.
    state.office.reservas.push({ id: 'orLegadoSaldo', nome: 'Reserva Legada', finalidade: 'outro', color: '#5b7fff', saldoInicial: 1000 });
    const c = canDeleteOfficeReserve('orLegadoSaldo');
    delOfficeReserva('orLegadoSaldo');
    return { allowed: c.allowed, reason: c.reason, aindaExiste: state.office.reservas.some((x) => x.id === 'orLegadoSaldo') };
  });
  const ok = r.allowed === false && r.reason === 'has_nonzero_balance' && r.aindaExiste === true;
  return { ok, detail: `reserva legada saldoInicial=1000 sem movimentações — allowed=${r.allowed} (esp. false), reason=${r.reason} (esp. has_nonzero_balance)` };
}, 'reserva legada com saldoInicial=1000 e nenhuma movimentação → exclusão bloqueada por saldo não zero');

await check('OR_BALANCE_02', async () => {
  const r = await page.evaluate(() => {
    state.office.reservas.push({ id: 'orSaldoZero', nome: 'Reserva Saldo Zero', finalidade: 'outro', color: '#5b7fff', saldoInicial: 0 });
    const c = canDeleteOfficeReserve('orSaldoZero');
    delOfficeReserva('orSaldoZero');
    return { allowed: c.allowed, aindaExiste: state.office.reservas.some((x) => x.id === 'orSaldoZero') };
  });
  const ok = r.allowed === true && r.aindaExiste === false;
  return { ok, detail: `reserva saldoInicial=0 sem movimentações — allowed=${r.allowed} (esp. true), removida (aindaExiste=${r.aindaExiste}, esp. false)` };
}, 'reserva com saldoInicial=0 e nenhuma movimentação → exclusão permitida');

await check('OR_BALANCE_03', async () => {
  const r = await page.evaluate(() => {
    state.office.reservas.push({ id: 'orLegadoNeg', nome: 'Reserva Legada Negativa', finalidade: 'outro', color: '#5b7fff', saldoInicial: -100 });
    const c = canDeleteOfficeReserve('orLegadoNeg');
    delOfficeReserva('orLegadoNeg');
    return { allowed: c.allowed, reason: c.reason, aindaExiste: state.office.reservas.some((x) => x.id === 'orLegadoNeg') };
  });
  const ok = r.allowed === false && r.reason === 'has_nonzero_balance' && r.aindaExiste === true;
  return { ok, detail: `reserva legada saldoInicial=-100 — allowed=${r.allowed} (esp. false), reason=${r.reason} (esp. has_nonzero_balance) — saldo negativo também bloqueia` };
}, 'reserva legada com saldoInicial=-100 (saldo negativo) → exclusão também bloqueada');

await check('OR_BALANCE_04', async () => {
  const r = await page.evaluate(() => {
    state.office.reservas.push({ id: 'orTolerancia', nome: 'Reserva Tolerância', finalidade: 'outro', color: '#5b7fff', saldoInicial: -0.002 });
    const c = canDeleteOfficeReserve('orTolerancia');
    delOfficeReserva('orTolerancia');
    return { allowed: c.allowed, aindaExiste: state.office.reservas.some((x) => x.id === 'orTolerancia') };
  });
  const ok = r.allowed === true && r.aindaExiste === false;
  return { ok, detail: `reserva saldoInicial=-0.002 (< MONEY_EPSILON=0.005 em módulo) — allowed=${r.allowed} (esp. true) — tratado como efetivamente zero` };
}, 'reserva com saldo residual de -0.002 (dentro da tolerância monetária) → tratada como zero, exclusão permitida');

await check('OR_BALANCE_05', async () => {
  const r = await page.evaluate(() => {
    state.office.reservas.push({ id: 'orZeroComHistorico', nome: 'Reserva Zero Com Histórico', finalidade: 'outro', color: '#5b7fff', saldoInicial: 0 });
    openAplicarOfficeReserva('orZeroComHistorico');
    document.getElementById('aplicOReservaValor').value = '500';
    document.getElementById('aplicOReservaConta').value = 'ocParaReservas';
    confirmarAplicarOfficeReserva('orZeroComHistorico');
    openResgatarOfficeReserva('orZeroComHistorico');
    document.getElementById('resgOReservaValor').value = '500';
    document.getElementById('resgOReservaConta').value = 'ocParaReservas';
    confirmarResgatarOfficeReserva('orZeroComHistorico');
    const saldoEfetivo = getSaldoOfficeReserva('orZeroComHistorico');
    const c = canDeleteOfficeReserve('orZeroComHistorico');
    delOfficeReserva('orZeroComHistorico');
    return { saldoEfetivo, allowed: c.allowed, reason: c.reason, aindaExiste: state.office.reservas.some((x) => x.id === 'orZeroComHistorico') };
  });
  const ok = r.saldoEfetivo === 0 && r.allowed === false && r.reason === 'has_financial_history' && r.aindaExiste === true;
  return { ok, detail: `saldo efetivo=${r.saldoEfetivo} (esp. 0) mas allowed=${r.allowed} (esp. false), reason=${r.reason} (esp. has_financial_history) — histórico bloqueia mesmo com saldo líquido zero` };
}, 'reserva com saldo efetivo zero mas com aplicação+resgate → ainda bloqueada por histórico, saldo zero não basta');

await page.evaluate(() => {
  state.office.reservas.push({ id: 'orBalanceMutation', nome: 'Reserva Mutation Check', finalidade: 'outro', color: '#5b7fff', saldoInicial: 777.77 });
});
await check('OR_BALANCE_06', async () => {
  const r = await page.evaluate(() => {
    const snapshotAntes = JSON.stringify(state.office);
    delOfficeReserva('orBalanceMutation'); // bloqueado por saldo não zero
    const snapshotDepois = JSON.stringify(state.office);
    return { estadoIdentico: snapshotAntes === snapshotDepois };
  });
  const ok = r.estadoIdentico === true;
  return { ok, detail: `tentativa bloqueada por saldo — snapshot de state.office idêntico antes/depois=${r.estadoIdentico} (esp. true)` };
}, 'tentativa de excluir reserva bloqueada POR SALDO = ZERO MUTATION (nenhum campo de state.office muda)');

await check('OR_BALANCE_07', async () => {
  const r = await page.evaluate(() => {
    const patrimonioAntes = getOfficeFinancialPatrimony();
    delOfficeReserva('orBalanceMutation'); // já sabemos que é bloqueado
    const patrimonioDepois = getOfficeFinancialPatrimony();
    return { patrimonioAntes, patrimonioDepois };
  });
  const ok = r.patrimonioAntes === r.patrimonioDepois;
  return { ok, detail: `patrimônio antes=${r.patrimonioAntes}, depois=${r.patrimonioDepois} (esperado igual)` };
}, 'tentativa bloqueada por saldo (reserva) não altera getOfficeFinancialPatrimony()');

// ---------------------------------------------------------------------------
// DELETE_PRECEDENCE — histórico/referência sempre vence a checagem de saldo
// ---------------------------------------------------------------------------
await loadState(baseSyntheticState());

await check('DELETE_PRECEDENCE_01', async () => {
  const r = await page.evaluate(() => {
    // Conta com saldo NÃO ZERO *e* com movimentação vinculada — a checagem de
    // saldo por si só já bloquearia, mas o motivo reportado deve ser o
    // estrutural/histórico (Gate 3.2), nunca has_nonzero_balance substituindo-o.
    state.office.contas.push({ id: 'ocPrecedencia', name: 'Conta Precedência', color: '#111', saldoInicial: 5000 });
    state.office.reservas.push({ id: 'orPrecedencia', nome: 'Reserva Precedência', finalidade: 'outro', color: '#5b7fff', saldoInicial: 0 });
    openAplicarOfficeReserva('orPrecedencia');
    document.getElementById('aplicOReservaValor').value = '1000';
    document.getElementById('aplicOReservaConta').value = 'ocPrecedencia';
    confirmarAplicarOfficeReserva('orPrecedencia');
    const saldo = calcSaldoOfficeConta('ocPrecedencia');
    const c = canDeleteOfficeAccount('ocPrecedencia');
    return { saldo, allowed: c.allowed, reason: c.reason };
  });
  const ok = r.saldo !== 0 && r.allowed === false && r.reason === 'has_movimentacao';
  return { ok, detail: `conta com saldo=${r.saldo} (≠0) E movimentação vinculada — allowed=${r.allowed} (esp. false), reason=${r.reason} (esp. has_movimentacao, NÃO has_nonzero_balance)` };
}, 'conta com saldo não zero E movimentação vinculada → motivo reportado é o histórico/estrutural, saldo nunca substitui a checagem de referência');

await check('DELETE_PRECEDENCE_02', async () => {
  const r = await page.evaluate(() => {
    // Reserva com saldo NÃO ZERO *e* histórico de aplicação — mesmo raciocínio.
    const saldo = getSaldoOfficeReserva('orPrecedencia');
    const c = canDeleteOfficeReserve('orPrecedencia');
    return { saldo, allowed: c.allowed, reason: c.reason };
  });
  const ok = r.saldo !== 0 && r.allowed === false && r.reason === 'has_financial_history';
  return { ok, detail: `reserva com saldo=${r.saldo} (≠0) E aplicação registrada — allowed=${r.allowed} (esp. false), reason=${r.reason} (esp. has_financial_history, NÃO has_nonzero_balance)` };
}, 'reserva com saldo não zero E histórico de aplicação → motivo reportado é o histórico, saldo nunca substitui a checagem de histórico');

// ---------------------------------------------------------------------------
// DELETE_NOT_FOUND — ID inexistente nunca é tratado como entidade deletável
// ---------------------------------------------------------------------------
await check('DELETE_NOT_FOUND_01', async () => {
  const r = await page.evaluate(() => {
    const qtdContasAntes = state.office.contas.length;
    const c = canDeleteOfficeAccount('id_que_nao_existe_conta');
    delOfficeConta('id_que_nao_existe_conta');
    return { allowed: c.allowed, reason: c.reason, qtdContasAntes, qtdContasDepois: state.office.contas.length };
  });
  const ok = r.allowed === false && r.reason === 'not_found' && r.qtdContasAntes === r.qtdContasDepois;
  return { ok, detail: `conta inexistente — allowed=${r.allowed} (esp. false), reason=${r.reason} (esp. not_found), qtd contas antes=${r.qtdContasAntes} depois=${r.qtdContasDepois} (zero mutation)` };
}, 'canDeleteOfficeAccount para ID de conta inexistente → allowed:false, reason:not_found, nunca allowed:true');

await check('DELETE_NOT_FOUND_02', async () => {
  const r = await page.evaluate(() => {
    const qtdReservasAntes = state.office.reservas.length;
    const c = canDeleteOfficeReserve('id_que_nao_existe_reserva');
    delOfficeReserva('id_que_nao_existe_reserva');
    return { allowed: c.allowed, reason: c.reason, qtdReservasAntes, qtdReservasDepois: state.office.reservas.length };
  });
  const ok = r.allowed === false && r.reason === 'not_found' && r.qtdReservasAntes === r.qtdReservasDepois;
  return { ok, detail: `reserva inexistente — allowed=${r.allowed} (esp. false), reason=${r.reason} (esp. not_found), qtd reservas antes=${r.qtdReservasAntes} depois=${r.qtdReservasDepois} (zero mutation)` };
}, 'canDeleteOfficeReserve para ID de reserva inexistente → allowed:false, reason:not_found, nunca allowed:true');

// ---------------------------------------------------------------------------
// INV-O-DELETE-PATRIMONY-2 — tanto exclusão BLOQUEADA quanto PERMITIDA
// preservam o patrimônio (a única entidade deletável tem saldo zero, por
// construção — logo excluí-la nunca pode mudar CAIXA + RESERVAS).
// ---------------------------------------------------------------------------
await loadState(baseSyntheticState());
await page.evaluate(() => {
  state.office.contas.push({ id: 'ocInvBlocked', name: 'Conta Inv Bloqueada', color: '#111', saldoInicial: 9000 });
  state.office.reservas.push({ id: 'orInvBlocked', nome: 'Reserva Inv Bloqueada', finalidade: 'outro', color: '#5b7fff', saldoInicial: 250 });
});

await check('INV_O_DELETE_PATRIMONY_2_BLOCKED', async () => {
  const r = await page.evaluate(() => {
    const patrimonioAntes = getOfficeFinancialPatrimony();
    delOfficeConta('ocInvBlocked'); // bloqueado por saldo
    delOfficeReserva('orInvBlocked'); // bloqueado por saldo
    const patrimonioDepois = getOfficeFinancialPatrimony();
    return { patrimonioAntes, patrimonioDepois };
  });
  const ok = r.patrimonioAntes === r.patrimonioDepois;
  return { ok, detail: `exclusão BLOQUEADA (conta+reserva) — patrimônio antes=${r.patrimonioAntes}, depois=${r.patrimonioDepois} (esperado igual)` };
}, 'INV-O-DELETE-PATRIMONY-2 (caso bloqueado): tentativa de exclusão bloqueada nunca altera o patrimônio do escritório');

await page.evaluate(() => {
  state.office.contas.push({ id: 'ocInvAllowed', name: 'Conta Inv Permitida', color: '#111', saldoInicial: 0 });
  state.office.reservas.push({ id: 'orInvAllowed', nome: 'Reserva Inv Permitida', finalidade: 'outro', color: '#5b7fff', saldoInicial: 0 });
});
await check('INV_O_DELETE_PATRIMONY_2_ALLOWED', async () => {
  const r = await page.evaluate(() => {
    const patrimonioAntes = getOfficeFinancialPatrimony();
    const c1 = canDeleteOfficeAccount('ocInvAllowed');
    delOfficeConta('ocInvAllowed'); // permitido — saldo zero, sem histórico
    const c2 = canDeleteOfficeReserve('orInvAllowed');
    delOfficeReserva('orInvAllowed'); // permitido — saldo zero, sem histórico
    const patrimonioDepois = getOfficeFinancialPatrimony();
    return {
      allowed1: c1.allowed, allowed2: c2.allowed, patrimonioAntes, patrimonioDepois,
      contaAindaExiste: state.office.contas.some((x) => x.id === 'ocInvAllowed'),
      reservaAindaExiste: state.office.reservas.some((x) => x.id === 'orInvAllowed'),
    };
  });
  const ok = r.allowed1 === true && r.allowed2 === true
    && r.patrimonioAntes === r.patrimonioDepois
    && r.contaAindaExiste === false && r.reservaAindaExiste === false;
  return { ok, detail: JSON.stringify(r) };
}, 'INV-O-DELETE-PATRIMONY-2 (caso permitido): exclusão PERMITIDA (saldo zero, sem histórico) também preserva o patrimônio — a única entidade deletável já tinha saldo zero');

// ---------------------------------------------------------------------------
// Teste integrado de conservação patrimonial (seção 19-20 do Gate 3.3):
// Conta PJ 5000 → +2000 recebimento → -500 despesa → 1000 aplicação →
// 300 resgate → -700 repasse realizado ao Jow. Cada passo verificado só com
// os motores reais já existentes (calcSaldoOfficeConta, getSaldoOfficeReserva,
// getOfficeFinancialPatrimony, calcSaldoConta) — nenhuma fórmula nova.
// ---------------------------------------------------------------------------
await loadState(baseSyntheticState({ contas: [{ id: 'pcConserv', name: 'Pessoal Conserv', color: '#5b7fff', saldoInicial: 0 }] }));

await check('CONSERVATION_INTEGRATED_01_CONTA_CRIADA', async () => {
  const r = await page.evaluate(() => {
    state.office.contas.push({ id: 'ocConserv', name: 'Conta PJ Conservação', color: '#ff9900', saldoInicial: 5000 });
    return { saldoConta: calcSaldoOfficeConta('ocConserv'), patrimonio: getOfficeFinancialPatrimony() };
  });
  const ok = r.saldoConta === 5000 && r.patrimonio === 5000;
  return { ok, detail: JSON.stringify(r) };
}, 'passo 1 — conta PJ criada com saldoInicial=5000: saldo=5000, patrimônio=5000');

await check('CONSERVATION_INTEGRATED_02_RECEBIMENTO', async () => {
  const r = await page.evaluate(() => {
    state.office.projetos.push({ id: 'pjConserv', nome: 'Projeto Conserv', cliente: 'Cliente X', valorContrato: 2000, status: 'contratado', dataContrato: '2026-09-01', observacao: '', createdAt: 'pjConserv' });
    state.office.recebiveis.push({ id: 'recConserv', projetoId: 'pjConserv', descricao: 'Recebimento cliente', valor: 2000, estado: 'recebido', dataPrevista: '2026-09-05', dataRecebimento: '2026-09-05', contaDestino: 'ocConserv', createdAt: 'recConserv' });
    return { saldoConta: calcSaldoOfficeConta('ocConserv'), patrimonio: getOfficeFinancialPatrimony() };
  });
  const ok = r.saldoConta === 7000 && r.patrimonio === 7000;
  return { ok, detail: JSON.stringify(r) };
}, 'passo 2 — recebimento de cliente +2000 (recebível estado=recebido, dataRecebimento válida): saldo=7000, patrimônio=7000 (receita realizada aumenta o patrimônio)');

await check('CONSERVATION_INTEGRATED_03_DESPESA', async () => {
  const r = await page.evaluate(() => {
    state.office.despesas.push({ id: 'despConserv', descricao: 'Despesa empresarial', categoria: 'Operacional', valor: 500, data: '2026-09-06', conta: 'ocConserv', projetoId: null, status: 'pago', createdAt: 'despConserv' });
    return { saldoConta: calcSaldoOfficeConta('ocConserv'), patrimonio: getOfficeFinancialPatrimony() };
  });
  const ok = r.saldoConta === 6500 && r.patrimonio === 6500;
  return { ok, detail: JSON.stringify(r) };
}, 'passo 3 — despesa empresarial -500: saldo=6500, patrimônio=6500 (despesa realizada diminui o patrimônio)');

await check('CONSERVATION_INTEGRATED_04_APLICACAO', async () => {
  const r = await page.evaluate(() => {
    state.office.reservas.push({ id: 'orConserv', nome: 'Reserva Conserv', finalidade: 'outro', color: '#5b7fff', saldoInicial: 0 });
    openAplicarOfficeReserva('orConserv');
    document.getElementById('aplicOReservaValor').value = '1000';
    document.getElementById('aplicOReservaConta').value = 'ocConserv';
    confirmarAplicarOfficeReserva('orConserv');
    return {
      saldoConta: calcSaldoOfficeConta('ocConserv'), saldoReserva: getSaldoOfficeReserva('orConserv'),
      patrimonio: getOfficeFinancialPatrimony(),
    };
  });
  const ok = r.saldoConta === 5500 && r.saldoReserva === 1000 && r.patrimonio === 6500;
  return { ok, detail: JSON.stringify(r) };
}, 'passo 4 — aplicação de 1000 na reserva: caixa=5500, reserva=1000, patrimônio continua 6500 (aplicação muda composição, nunca o total)');

await check('CONSERVATION_INTEGRATED_05_RESGATE', async () => {
  const r = await page.evaluate(() => {
    openResgatarOfficeReserva('orConserv');
    document.getElementById('resgOReservaValor').value = '300';
    document.getElementById('resgOReservaConta').value = 'ocConserv';
    confirmarResgatarOfficeReserva('orConserv');
    return {
      saldoConta: calcSaldoOfficeConta('ocConserv'), saldoReserva: getSaldoOfficeReserva('orConserv'),
      patrimonio: getOfficeFinancialPatrimony(),
    };
  });
  const ok = r.saldoConta === 5800 && r.saldoReserva === 700 && r.patrimonio === 6500;
  return { ok, detail: JSON.stringify(r) };
}, 'passo 5 — resgate de 300 da reserva: caixa=5800, reserva=700, patrimônio continua 6500 (resgate muda composição, nunca o total)');

await check('CONSERVATION_INTEGRATED_06_REPASSE_REALIZADO', async () => {
  const r = await page.evaluate(() => {
    const officePatrimonioAntes = getOfficeFinancialPatrimony();
    const pessoalAntes = calcSaldoConta('pcConserv');
    // Repasse construído diretamente (mesma forma que syncDerivedPersonalTransfer
    // produziria) pra isolar o valor exato de 700 pedido pelo cenário — a
    // TRANSIÇÃO de estado em si usa o motor real realizeOfficeTransfer, nunca
    // uma fórmula nova.
    const transferId = 'conservTransfer';
    state.office.repasses.push({ id: 'repConserv', tipo: 'planejado', recebivelId: 'recConserv', valor: 700, estado: 'previsto', dataPrevista: '2026-09-10', dataRecebimento: null, officeTransferId: transferId, createdAt: 'repConserv' });
    state.receitas.push({ id: 'receitaConserv', tipo: 'repasse_escritorio', nome: 'Repasse do Escritório — Conserv', valor: 700, certeza: 'contratado', estado: 'previsto', dataPrevista: '2026-09-10', dataRecebimento: null, competenciaMes: 9, competenciaAno: 2026, mes: 9, ano: 2026, conta: null, origem: 'office_distribution', officeTransferId: transferId, createdAt: 'receitaConserv' });
    realizeOfficeTransfer('repConserv', '2026-09-10', 'ocConserv', 'pcConserv');
    return {
      officePatrimonioAntes, officePatrimonioDepois: getOfficeFinancialPatrimony(),
      saldoConta: calcSaldoOfficeConta('ocConserv'), saldoReserva: getSaldoOfficeReserva('orConserv'),
      pessoalAntes, pessoalDepois: calcSaldoConta('pcConserv'),
    };
  });
  const ok = r.officePatrimonioAntes === 6500 && r.officePatrimonioDepois === 5800
    && r.saldoConta === 5100 && r.saldoReserva === 700
    && r.pessoalAntes === 0 && r.pessoalDepois === 700;
  return { ok, detail: JSON.stringify(r) };
}, 'passo 6 — repasse realizado ao Jow -700: patrimônio do escritório cai de 6500 para 5800 (exatamente -700), caixa pessoal sobe de 0 para 700 (exatamente +700) — o valor transferido não é criado nem destruído, só muda de lado');

// ---------------------------------------------------------------------------
// PF ↔ PJ — conservação consolidada dedicada, pra repasse E retirada
// extraordinária isoladamente (seção 20 do Gate 3.3): PF+PJ nunca duplica
// nem destrói o valor transferido.
// ---------------------------------------------------------------------------
await loadState(baseSyntheticState({ contas: [{ id: 'pfRepasse', name: 'Pessoal Repasse', color: '#5b7fff', saldoInicial: 500 }] }));
await page.evaluate(() => {
  state.office.contas.push({ id: 'pjRepasse', name: 'PJ Repasse', color: '#111', saldoInicial: 2000 });
});
await check('PF_PJ_CONSERVATION_REPASSE_01', async () => {
  const r = await page.evaluate(() => {
    const pjAntes = getOfficeFinancialPatrimony();
    const pfAntes = calcSaldoConta('pfRepasse');
    const transferId = 'pfPjRepasseTransfer';
    state.office.repasses.push({ id: 'pfPjRepasse', tipo: 'planejado', recebivelId: null, valor: 800, estado: 'previsto', dataPrevista: '2026-09-12', dataRecebimento: null, officeTransferId: transferId, createdAt: 'pfPjRepasse' });
    state.receitas.push({ id: 'pfPjRepasseReceita', tipo: 'repasse_escritorio', nome: 'Repasse PF/PJ', valor: 800, certeza: 'contratado', estado: 'previsto', dataPrevista: '2026-09-12', dataRecebimento: null, competenciaMes: 9, competenciaAno: 2026, mes: 9, ano: 2026, conta: null, origem: 'office_distribution', officeTransferId: transferId, createdAt: 'pfPjRepasseReceita' });
    realizeOfficeTransfer('pfPjRepasse', '2026-09-12', 'pjRepasse', 'pfRepasse');
    const pjDepois = getOfficeFinancialPatrimony();
    const pfDepois = calcSaldoConta('pfRepasse');
    return {
      pjAntes, pjDepois, pfAntes, pfDepois,
      consolidadoAntes: pjAntes + pfAntes, consolidadoDepois: pjDepois + pfDepois,
    };
  });
  const ok = r.pjDepois === r.pjAntes - 800 && r.pfDepois === r.pfAntes + 800
    && r.consolidadoAntes === r.consolidadoDepois;
  return { ok, detail: JSON.stringify(r) };
}, 'repasse realizado de 800: PJ cai 800, PF sobe 800, consolidado PF+PJ permanece idêntico (nenhuma criação/destruição de dinheiro)');

await loadState(baseSyntheticState({ contas: [{ id: 'pfRetirada', name: 'Pessoal Retirada', color: '#5b7fff', saldoInicial: 200 }] }));
await page.evaluate(() => {
  state.office.contas.push({ id: 'pjRetirada', name: 'PJ Retirada', color: '#111', saldoInicial: 3000 });
});
await check('PF_PJ_CONSERVATION_RETIRADA_01', async () => {
  const r = await page.evaluate(() => {
    const pjAntes = getOfficeFinancialPatrimony();
    const pfAntes = calcSaldoConta('pfRetirada');
    createExtraordinaryWithdrawal(600, '2026-09-13', 'pjRetirada', 'pfRetirada', 'teste conservação');
    const pjDepois = getOfficeFinancialPatrimony();
    const pfDepois = calcSaldoConta('pfRetirada');
    return {
      pjAntes, pjDepois, pfAntes, pfDepois,
      consolidadoAntes: pjAntes + pfAntes, consolidadoDepois: pjDepois + pfDepois,
    };
  });
  const ok = r.pjDepois === r.pjAntes - 600 && r.pfDepois === r.pfAntes + 600
    && r.consolidadoAntes === r.consolidadoDepois;
  return { ok, detail: JSON.stringify(r) };
}, 'retirada extraordinária de 600: PJ cai 600, PF sobe 600, consolidado PF+PJ permanece idêntico (nenhuma criação/destruição de dinheiro)');

await close();

const fails = results.filter((r) => r.status === 'FAIL').length;
console.log(`\ngate3-3-balance-protection.test.mjs: TOTAL=${results.length} PASS=${results.length - fails} FAIL=${fails}`);
if (fails > 0) process.exitCode = 1;

export { results };
