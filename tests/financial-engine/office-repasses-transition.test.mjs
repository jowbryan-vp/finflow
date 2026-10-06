// Repasses do escritório na fase de transição (legado → regra do escritório).
//
// Parte 1 — "Repasses pessoais a transferir" só conta repasse previsto cuja
// origem já é caixa (isOfficeRepasseATransferir): recebível anterior realizado,
// recebimento do modelo atual, ou repasse sem recebível. Repasse planejado de
// parcela futura não reduz o Disponível de hoje; aparece na projeção, no mês
// do recebível. Mesmo critério no painel, no alerta e na lista de projetos.
//
// Parte 2 — "Já coberto / dar baixa": baixa de repasse previsto SEM
// transferência (o dinheiro já saiu por retirada extraordinária). Nenhuma
// movimentação de conta; a receita pessoal prevista é cancelada; o repasse
// baixado nunca é ressuscitado pelo sync do recebível; a baixa pode ser
// desfeita.
//
// Aceite com backup real (opcional, nunca versionado; nenhum nome é impresso):
//   FINFLOW_REAL_BACKUP=/caminho/finflow_backup_2026-10-06.json \
//     node office-repasses-transition.test.mjs
import fs from 'node:fs';
import { openHarness, makeRunner, baseSyntheticState } from './harness.mjs';

const HOJE = '2026-10-06';
const { page, loadState, close } = await openHarness();
const { check, results } = makeRunner('office-repasses-transition');

// Projeto do modelo anterior: entrada já recebida (repasse 900) e duas parcelas
// futuras (repasse 300 cada), regra 40/30/30.
async function cenarioLegado() {
  await loadState(baseSyntheticState({ contas: [{ id: 'c1', name: 'Conta Pessoal', color: '#5b7fff', saldoInicial: 500 }] }));
  await page.evaluate(() => {
    state.office.contas.push({ id: 'oc1', name: 'Conta Escritório', color: '#ff9900', saldoInicial: 0 });
    state.office.projetos.push({ id: 'p1', nome: 'Projeto Legado', cliente: 'Cliente', valorContrato: 5000, status: 'contratado', dataContrato: '2026-09-01', observacao: '', createdAt: 'p1' });
    state.office.regrasDistribuicao.find((x) => x.destino === 'reserva').percentual = 40;
    state.office.regrasDistribuicao.find((x) => x.destino === 'impostos').percentual = 30;
    state.office.regrasDistribuicao.find((x) => x.destino === 'repasse_pessoal').percentual = 30;
    state.office.recebiveis.push(
      { id: 'recA', projetoId: 'p1', descricao: 'Entrada', valor: 3000, estado: 'recebido', dataPrevista: '2026-09-15', dataRecebimento: '2026-09-15', contaDestino: 'oc1', createdAt: 'recA' },
      { id: 'recB', projetoId: 'p1', descricao: 'Parcela 1/2', valor: 1000, estado: 'previsto', dataPrevista: '2026-11-15', dataRecebimento: null, contaDestino: 'oc1', createdAt: 'recB' },
      { id: 'recC', projetoId: 'p1', descricao: 'Parcela 2/2', valor: 1000, estado: 'previsto', dataPrevista: '2026-12-15', dataRecebimento: null, contaDestino: 'oc1', createdAt: 'recC' });
    ['recA', 'recB', 'recC'].forEach((id) => syncDerivedPersonalTransfer(id));
  });
}
const repasseDe = (recId) => page.evaluate((id) => state.office.repasses.find((rp) => rp.recebivelId === id).id, recId);
const saldos = () => page.evaluate(() => JSON.stringify({ office: state.office.contas.map((c) => calcSaldoOfficeContaCent(c.id)),
  pessoal: state.contas.map((c) => calcSaldoConta(c.id)), movOffice: state.office.movimentacoesContas.length, movPessoal: state.movimentacoesContas.length }));

try {
  // --- Parte 1 --------------------------------------------------------------
  await cenarioLegado();
  await check('P1_SO_ORIGEM_REALIZADA_COMPROMETE', () => page.evaluate((hoje) => {
    const previstos = state.office.repasses.filter((rp) => rp.estado === 'previsto').reduce((s, rp) => s + rp.valor, 0);
    const pos = getOfficeCashPositionV3(hoje), P = getOfficePainelV3(hoje);
    return { ok: previstos === 1500 && pos.caixaRealCent === 300000 && pos.repassesPendentesCent === 90000 && pos.comprometidoCent === 90000
      && pos.disponibilidadeGerencialCent === 210000 && P.repassesPendentesCent === 90000 && P.composicao.repassesPendentesCent === 90000
      && P.composicao.disponivelCent === 210000,
      detail: `previstos=${previstos}; a transferir=${pos.repassesPendentesCent}; disponível=${pos.disponibilidadeGerencialCent}` };
  }, HOJE), 'três repasses previstos (900+300+300), só o de recebível realizado (900) reduz o Disponível de hoje');
  await check('P1_ALERTA_E_LISTA_DE_PROJETOS', () => page.evaluate((hoje) => {
    const alerta = getOfficeVisaoGeralV3(hoje, 3).atencao.find((a) => a.tipo === 'repasses_pendentes');
    const linha = getOfficeProjetoLinhaV3(findOfficeProjeto('p1'), hoje);
    const pend = linha.pendencias.find((x) => x.tipo === 'repasse_a_transferir');
    return { ok: !!alerta && alerta.valorCent === 90000 && linha.repasse.aTransferirCent === 90000 && !!pend && pend.valorCent === 90000,
      detail: `alerta=${alerta && alerta.valorCent}; aTransferirCent=${linha.repasse.aTransferirCent}` };
  }, HOJE), "alerta 'repasses_pendentes' e aTransferirCent do projeto usam o mesmo número (900)");
  await check('P1_FUTUROS_SO_NA_PROJECAO_NO_MES_DO_RECEBIVEL', () => page.evaluate((hoje) => {
    const linhas = getOfficeProjecaoMensalV3(hoje, 3).linhas;
    const v = linhas.map((l) => l.repassesPendentesProjetadosCent);
    return { ok: JSON.stringify(v) === '[90000,120000,150000]' && linhas.every((l) => l.conservacaoOk && l.obrigacoesConservadas),
      detail: `out/nov/dez=${JSON.stringify(v)}` };
  }, HOJE), 'projeção: o repasse de cada parcela futura passa a pesar só no mês em que o recebível entra');
  await check('P1_SEM_RECEBIVEL_E_MODELO_ATUAL_CONTINUAM', () => page.evaluate(() => {
    const semOrigem = isOfficeRepasseATransferir({ estado: 'previsto', recebivelId: null, valor: 100 });
    // Modelo atual: recebivelId aponta pra parcela (nunca "realizada" por estado), mas o repasse nasce de um recebimento efetivo.
    const modeloAtual = isOfficeRepasseATransferir({ estado: 'previsto', recebivelId: 'recB', recebimentoId: 'rcb1', valor: 100 });
    const futuro = isOfficeRepasseATransferir({ estado: 'previsto', recebivelId: 'recB', valor: 100 });
    const orfao = isOfficeRepasseATransferir({ estado: 'previsto', recebivelId: 'nao-existe', valor: 100 });
    const realizado = isOfficeRepasseATransferir({ estado: 'recebido', recebivelId: 'recA', valor: 100 });
    return { ok: semOrigem && modeloAtual && !futuro && !orfao && !realizado, detail: JSON.stringify({ semOrigem, modeloAtual, futuro, orfao, realizado }) };
  }), 'sem recebivelId e repasse de recebimento do modelo atual continuam a transferir; parcela futura não');

  // --- Parte 2: baixa sem transferência -------------------------------------
  await check('P2_BAIXA_NAO_MOVIMENTA_CONTAS', async () => {
    await cenarioLegado();
    const id = await repasseDe('recA');
    const antes = await saldos();
    const r = await page.evaluate(([repId, hoje]) => {
      const retirada = createExtraordinaryWithdrawal(200, '2026-09-20', 'oc1', 'c1', 'transição');
      const retiradaMovId = state.office.movimentacoesContas.find((m) => m.officeTransferId === retirada).id;
      const base = JSON.stringify({ o: state.office.contas.map((c) => calcSaldoOfficeContaCent(c.id)), p: state.contas.map((c) => calcSaldoConta(c.id)),
        mo: state.office.movimentacoesContas.length, mp: state.movimentacoesContas.length, nr: state.receitas.length });
      const ok = baixarOfficeRepasseSemTransferencia(repId, officeHojeISO(), 'Coberto por retiradas extraordinárias na transição', [retiradaMovId, 'id-inexistente', retiradaMovId]);
      const depois = JSON.stringify({ o: state.office.contas.map((c) => calcSaldoOfficeContaCent(c.id)), p: state.contas.map((c) => calcSaldoConta(c.id)),
        mo: state.office.movimentacoesContas.length, mp: state.movimentacoesContas.length, nr: state.receitas.length });
      const rp = state.office.repasses.find((x) => x.id === repId), receita = state.receitas.find((x) => x.officeTransferId === 'off_recA');
      const pos = getOfficeCashPositionV3(hoje);
      return { ok, mesmo: base === depois, rp, receitaEstado: receita.estado, retiradaMovId, pend: pos.repassesPendentesCent, disp: pos.disponibilidadeGerencialCent,
        caixa: pos.caixaRealCent, baixado: isOfficeRepasseBaixado(rp), hoje: officeHojeISO(), invariantes: verificarInvariantesEscritorioV3() };
    }, [id, HOJE]);
    return { ok: !!antes && r.ok && r.mesmo && r.rp.estado === 'cancelado' && r.rp.motivoBaixa === 'coberto_por_retirada' && r.rp.dataBaixa === r.hoje
      && JSON.stringify(r.rp.retiradasVinculadas) === JSON.stringify([r.retiradaMovId]) && r.rp.obs === 'Coberto por retiradas extraordinárias na transição'
      && r.rp.valor === 900 && r.receitaEstado === 'cancelado' && r.baixado && r.pend === 0 && r.disp === r.caixa && r.invariantes.length === 0,
      detail: `saldos/movimentações iguais=${r.mesmo}; estado=${r.rp.estado}; receita=${r.receitaEstado}; a transferir=${r.pend}; vinculadas=${JSON.stringify(r.rp.retiradasVinculadas)}` };
  }, 'baixa: repasse cancelado com motivoBaixa/dataBaixa/retiradasVinculadas/obs, receita pessoal cancelada, nenhuma movimentação e nenhum saldo alterado');
  await check('P2_RECEITA_SOME_DA_PROJECAO_PESSOAL', async () => {
    await cenarioLegado();
    const id = await repasseDe('recA');
    return page.evaluate((repId) => {
      const receitaId = state.receitas.find((x) => x.officeTransferId === 'off_recA').id;
      const citada = () => JSON.stringify(getChronologicalProjection('2026-09-01', '2026-12-31')).includes(receitaId);
      const antes = citada();
      baixarOfficeRepasseSemTransferencia(repId, officeHojeISO(), 'x', []);
      const depois = citada();
      return { ok: antes && !depois, detail: `na projeção antes=${antes}; depois=${depois}` };
    }, id);
  }, 'a receita pessoal prevista do repasse baixado deixa de aparecer na projeção pessoal');
  await check('P2_SYNC_LEGADO_NAO_RESSUSCITA', async () => {
    await cenarioLegado();
    const id = await repasseDe('recB');
    return page.evaluate((repId) => {
      baixarOfficeRepasseSemTransferencia(repId, officeHojeISO(), 'x', []);
      const rec = state.office.recebiveis.find((x) => x.id === 'recB');
      rec.valor = 2000; rec.dataPrevista = '2026-11-20'; syncDerivedPersonalTransfer('recB');
      rec.estado = 'recebido'; rec.dataRecebimento = '2026-10-05'; syncDerivedPersonalTransfer('recB'); syncDerivedPersonalTransfer('recB');
      const reps = state.office.repasses.filter((x) => x.recebivelId === 'recB'), receitas = state.receitas.filter((x) => x.officeTransferId === 'off_recB');
      return { ok: reps.length === 1 && isOfficeRepasseBaixado(reps[0]) && reps[0].valor === 300 && receitas.length === 1 && receitas[0].estado === 'cancelado'
        && getOfficeCashPositionV3('2026-10-06').repassesPendentesCent === 90000,
        detail: `repasses=${reps.length}; estado=${reps[0].estado}; valor=${reps[0].valor}; receita=${receitas[0].estado}` };
    }, id);
  }, 'editar/receber o recebível depois da baixa não recria nem reativa o repasse (modelo anterior)');
  await check('P2_SYNC_V2_NAO_RESSUSCITA_E_CONTINUA_ALOCADO', async () => {
    await loadState(baseSyntheticState({ contas: [{ id: 'c1', name: 'Conta Pessoal', color: '#5b7fff', saldoInicial: 0 }] }));
    return page.evaluate(() => {
      state.office.contas.push({ id: 'oc1', name: 'Conta Escritório', color: '#ff9900', saldoInicial: 0 });
      state.office.projetos.push({ id: 'pV2', nome: 'Projeto v2', cliente: 'Cliente', valorContrato: 5000, status: 'contratado', dataContrato: '2026-09-01', observacao: '', createdAt: 'pV2', regraDistribuicao: 'v2', rrts: [] });
      state.office.rrtValorPadrao = 200;
      setProjetoRrtRequirement('pV2', 'one'); addProjetoRRT('pV2', 'projeto'); confirmarAddProjetoRRT('pV2', 'projeto'); closeModal();
      state.office.recebiveis.push({ id: 'recV', projetoId: 'pV2', descricao: 'Entrada', valor: 5000, estado: 'recebido', dataPrevista: '2026-09-20', dataRecebimento: '2026-09-20', contaDestino: 'oc1', createdAt: 'recV' });
      syncDerivedPersonalTransfer('recV');
      const rp = state.office.repasses.find((x) => x.recebivelId === 'recV');
      if (!rp || rp.estado !== 'previsto' || !(rp.valor > 0)) return { ok: false, detail: 'pré-condição: repasse v2 previsto não foi gerado' };
      const valor = rp.valor, alocadoAntes = getProjetoAlocadoPorDestinoCent('pV2', null).repasse_pessoal;
      baixarOfficeRepasseSemTransferencia(rp.id, officeHojeISO(), 'x', []);
      syncDerivedPersonalTransfer('recV'); resyncProjectV2('pV2');
      const reps = state.office.repasses.filter((x) => x.recebivelId === 'recV'), receita = state.receitas.find((x) => x.officeTransferId === 'off_recV');
      const alocadoDepois = getProjetoAlocadoPorDestinoCent('pV2', null).repasse_pessoal;
      return { ok: reps.length === 1 && isOfficeRepasseBaixado(reps[0]) && reps[0].valor === valor && receita.estado === 'cancelado'
        && alocadoAntes === Math.round(valor * 100) && alocadoDepois === alocadoAntes && getOfficeCashPositionV3('2026-10-06').repassesPendentesCent === 0,
        detail: `estado=${reps[0].estado}; receita=${receita.estado}; alocado antes/depois=${alocadoAntes}/${alocadoDepois}` };
    });
  }, 'regra v2: recálculo não reativa o repasse baixado, e ele continua contando como já alocado ao pessoal');
  await check('P2_DESFAZER_BAIXA', async () => {
    await cenarioLegado();
    const id = await repasseDe('recA');
    return page.evaluate(([repId, hoje]) => {
      const antes = JSON.stringify(state.office.repasses.find((x) => x.id === repId));
      baixarOfficeRepasseSemTransferencia(repId, officeHojeISO(), 'x', []);
      const ok = desfazerBaixaOfficeRepasse(repId), denovo = desfazerBaixaOfficeRepasse(repId);
      const rp = state.office.repasses.find((x) => x.id === repId), receita = state.receitas.find((x) => x.officeTransferId === 'off_recA');
      return { ok: ok && !denovo && JSON.stringify(rp) === antes && receita.estado === 'previsto' && getOfficeCashPositionV3(hoje).repassesPendentesCent === 90000
        && state.office.repasses.length === 3 && state.receitas.filter((x) => x.officeTransferId === 'off_recA').length === 1,
        detail: `repasse restaurado idêntico=${JSON.stringify(rp) === antes}; receita=${receita.estado}` };
    }, [id, HOJE]);
  }, 'desfazer a baixa devolve o repasse a previsto (sem campos de baixa) e reativa a receita prevista, sem duplicar');
  await check('P2_SO_PREVISTO_E_DATA_VALIDA', async () => {
    await cenarioLegado();
    const [a, b] = [await repasseDe('recA'), await repasseDe('recB')];
    return page.evaluate(([repA, repB]) => {
      const amanha = new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10);
      const futura = baixarOfficeRepasseSemTransferencia(repB, amanha, 'x', []), invalida = baixarOfficeRepasseSemTransferencia(repB, '2026-02-31', 'x', []);
      const inexistente = baixarOfficeRepasseSemTransferencia('nao-existe', officeHojeISO(), 'x', []);
      realizeOfficeTransfer(repA, '2026-09-16', 'oc1', 'c1');
      const realizado = baixarOfficeRepasseSemTransferencia(repA, officeHojeISO(), 'x', []);
      const primeira = baixarOfficeRepasseSemTransferencia(repB, officeHojeISO(), 'x', []), segunda = baixarOfficeRepasseSemTransferencia(repB, officeHojeISO(), 'y', []);
      const naoBaixadoDesfaz = desfazerBaixaOfficeRepasse(repA);
      return { ok: !futura && !invalida && !inexistente && !realizado && primeira && !segunda && !naoBaixadoDesfaz
        && state.office.repasses.find((x) => x.id === repA).estado === 'recebido' && state.office.repasses.find((x) => x.id === repB).obs === 'x',
        detail: JSON.stringify({ futura, invalida, inexistente, realizado, primeira, segunda, naoBaixadoDesfaz }) };
    }, [a, b]);
  }, 'baixa recusa data futura/inválida, repasse inexistente ou já realizado; é idempotente; desfazer só age em repasse baixado');

  // --- Parte 2: interface ----------------------------------------------------
  await check('P2_UI_BAIXA_E_DESFAZER', async () => {
    await cenarioLegado();
    const id = await repasseDe('recA');
    await page.evaluate(() => { createExtraordinaryWithdrawal(200, '2026-09-20', 'oc1', 'c1', 'transição'); renderOfficeRepassesTab(); });
    const antes = await saldos();
    const botoes = await page.evaluate(() => ({ baixar: document.querySelectorAll('#escritorioSubContent button[onclick^="openBaixarOfficeRepasse"]').length,
      realizar: document.querySelectorAll('#escritorioSubContent button[onclick^="openRealizarOfficeRepasse"]').length }));
    await page.evaluate((repId) => openBaixarOfficeRepasse(repId), id);
    const modal = await page.evaluate(() => ({ motivo: document.getElementById('baixaRepasseMotivo').value, data: document.getElementById('baixaRepasseData').value,
      hoje: officeHojeISO(), retiradas: document.querySelectorAll('.baixaRepasseRetirada').length }));
    await page.evaluate((repId) => { document.querySelector('.baixaRepasseRetirada').checked = true; confirmarBaixarOfficeRepasse(repId); }, id);
    const depois = await saldos();
    const lista = await page.evaluate((repId) => {
      const html = document.getElementById('escritorioSubContent').innerHTML, rp = state.office.repasses.find((x) => x.id === repId);
      return { badge: html.includes('Baixado (coberto)'), desfazer: document.querySelectorAll('#escritorioSubContent button[onclick^="desfazerBaixaOfficeRepasseUI"]').length,
        baixar: document.querySelectorAll('#escritorioSubContent button[onclick^="openBaixarOfficeRepasse"]').length, vinculadas: rp.retiradasVinculadas.length,
        modalAberto: document.getElementById('modalOverlay').classList.contains('open') };
    }, id);
    await page.evaluate((repId) => desfazerBaixaOfficeRepasseUI(repId), id);
    const fim = await page.evaluate((repId) => ({ estado: state.office.repasses.find((x) => x.id === repId).estado,
      badge: document.getElementById('escritorioSubContent').innerHTML.includes('Baixado (coberto)') }), id);
    return { ok: botoes.baixar === 3 && botoes.realizar === 3 && modal.motivo === 'Coberto por retiradas extraordinárias na transição' && modal.data === modal.hoje
      && modal.retiradas === 1 && antes === depois && lista.badge && lista.desfazer === 1 && lista.baixar === 2 && lista.vinculadas === 1 && !lista.modalAberto
      && fim.estado === 'previsto' && !fim.badge,
      detail: JSON.stringify({ botoes, modal: { motivo: modal.motivo, retiradas: modal.retiradas }, lista, fim, saldosIguais: antes === depois }) };
  }, 'aba Repasses: botão "Já coberto / dar baixa", modal com motivo padrão/data/retiradas, selo "Baixado (coberto)" e "Desfazer baixa"');

  // --- Aceite com o backup real (opcional) ----------------------------------
  if (process.env.FINFLOW_REAL_BACKUP) {
    await check('REAL_DISPONIVEL_SEM_PARCELAS_FUTURAS_E_BAIXA', async () => {
      await loadState(JSON.parse(fs.readFileSync(process.env.FINFLOW_REAL_BACKUP, 'utf8')));
      return page.evaluate(() => {
        const hoje = officeHojeISO(), off = state.office, cent = (v) => Math.round((v || 0) * 100);
        const snap = () => JSON.stringify({ o: off.contas.map((c) => calcSaldoOfficeContaCent(c.id)), p: state.contas.map((c) => calcSaldoConta(c.id)),
          mo: off.movimentacoesContas.length, mp: state.movimentacoesContas.length });
        const invAntes = verificarInvariantesEscritorioV3().length;
        const previstos = off.repasses.filter((rp) => rp.estado === 'previsto');
        const aTransferir = previstos.filter(isOfficeRepasseATransferir), futuros = previstos.filter((rp) => !isOfficeRepasseATransferir(rp));
        const P = getOfficePainelV3(hoje), somaAT = aTransferir.reduce((s, rp) => s + cent(rp.valor), 0);
        const alerta = getOfficeVisaoGeralV3(hoje, 3).atencao.find((a) => a.tipo === 'repasses_pendentes');
        const base = snap(), ids = new Set(aTransferir.map((rp) => rp.officeTransferId));
        aTransferir.forEach((rp) => baixarOfficeRepasseSemTransferencia(rp.id, hoje, 'Coberto por retiradas extraordinárias na transição', []));
        const P2 = getOfficePainelV3(hoje);
        const receitasVivas = state.receitas.filter((r) => ids.has(r.officeTransferId) && r.estado === 'previsto').length;
        const proj = JSON.stringify(getChronologicalProjection(hoje, hoje.slice(0, 4) + '-12-31'));
        const naProjecao = state.receitas.filter((r) => ids.has(r.officeTransferId)).filter((r) => proj.includes(r.id)).length;
        const ok = P.repassesPendentesCent === somaAT && (somaAT === 0 ? !alerta : alerta.valorCent === somaAT)
          && futuros.every((rp) => { const rec = off.recebiveis.find((r) => r.id === rp.recebivelId); return rec && rec.estado === 'previsto'; })
          && snap() === base && P2.repassesPendentesCent === 0 && P2.caixaRealCent === P.caixaRealCent
          && P2.disponibilidadeGerencialCent === P.disponibilidadeGerencialCent + somaAT && receitasVivas === 0 && naProjecao === 0
          && verificarInvariantesEscritorioV3().length === invAntes;
        return { ok, detail: `previstos=${previstos.length}; a transferir=${aTransferir.length}; futuros fora do Disponível=${futuros.length}; após baixa a transferir=${P2.repassesPendentesCent}; invariantes=${verificarInvariantesEscritorioV3().length}` };
      });
    }, 'backup real: parcelas futuras fora do Disponível; baixar os repasses de origem realizada não muda saldos e tira as receitas previstas da projeção');
  } else {
    console.log('[SKIP] REAL_DISPONIVEL_SEM_PARCELAS_FUTURAS_E_BAIXA: defina FINFLOW_REAL_BACKUP para o aceite com o backup real (não versionado)');
  }
} finally { await close(); }

const fail = results.filter((r) => r.status === 'FAIL').length;
console.log(`office-repasses-transition: TOTAL=${results.length} PASS=${results.length - fail} FAIL=${fail}`);
process.exitCode = fail ? 1 : 0;
