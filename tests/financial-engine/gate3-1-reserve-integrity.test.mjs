// Gate 3.1 — seção 3-8/18: uma reserva empresarial NOVA nunca pode nascer
// com saldo != 0 (isso criaria patrimônio do nada). Aplicação/resgate
// continuam preservando o patrimônio total (caixa + reserva). Reservas
// LEGADAS com saldoInicial continuam sendo respeitadas, sem migração
// destrutiva nem inferência de conta/data.
import { openHarness, makeRunner, baseSyntheticState } from './harness.mjs';

const { page, loadState, close } = await openHarness();
const { check, results } = makeRunner('gate3-1-reserve-integrity');

await loadState(baseSyntheticState());
await page.evaluate(() => {
  state.office.contas.push({ id: 'oc1', name: 'Conta Escritório', color: '#ff9900', saldoInicial: 5000 });
});

// OR01 — aplicação e resgate preservam o patrimônio total do escritório.
await check('OR01', async () => {
  const r = await page.evaluate(() => {
    renderOfficeReservasTab();
    document.getElementById('newOReservaNome').value = 'Reserva Nova';
    document.getElementById('newOReservaFinalidade').value = 'impostos';
    addOfficeReserva();
    const reserva = state.office.reservas.find((x) => x.nome === 'Reserva Nova');
    const patrimonioAntes = getOfficeFinancialPatrimony();

    // Aplicar R$ 1.000 (via fluxo de UI real: abre o modal e confirma).
    openAplicarOfficeReserva(reserva.id);
    document.getElementById('aplicOReservaValor').value = '1000';
    document.getElementById('aplicOReservaConta').value = 'oc1';
    confirmarAplicarOfficeReserva(reserva.id);
    const caixaAposAplicar = getOfficeOperationalBalance();
    const reservaAposAplicar = getSaldoOfficeReserva(reserva.id);
    const patrimonioAposAplicar = getOfficeFinancialPatrimony();

    // Resgatar R$ 300.
    openResgatarOfficeReserva(reserva.id);
    document.getElementById('resgOReservaValor').value = '300';
    document.getElementById('resgOReservaConta').value = 'oc1';
    confirmarResgatarOfficeReserva(reserva.id);
    const caixaAposResgatar = getOfficeOperationalBalance();
    const reservaAposResgatar = getSaldoOfficeReserva(reserva.id);
    const patrimonioAposResgatar = getOfficeFinancialPatrimony();

    return { patrimonioAntes, caixaAposAplicar, reservaAposAplicar, patrimonioAposAplicar, caixaAposResgatar, reservaAposResgatar, patrimonioAposResgatar };
  });
  const ok = r.patrimonioAntes === 5000
    && r.caixaAposAplicar === 4000 && r.reservaAposAplicar === 1000 && r.patrimonioAposAplicar === 5000
    && r.caixaAposResgatar === 4300 && r.reservaAposResgatar === 700 && r.patrimonioAposResgatar === 5000;
  return { ok, detail: JSON.stringify(r) };
}, 'aplicar R$1000 e resgatar R$300 de uma reserva nova preserva o patrimônio total do escritório (5000) em todo momento');

// OR02 — uma reserva nova nunca cria patrimônio.
await check('OR02', async () => {
  const r = await page.evaluate(() => {
    const caixaAntes = getOfficeOperationalBalance();
    const patrimonioAntes = getOfficeFinancialPatrimony();
    renderOfficeReservasTab();
    document.getElementById('newOReservaNome').value = 'Outra Reserva';
    document.getElementById('newOReservaFinalidade').value = 'equipamentos';
    addOfficeReserva();
    const reserva = state.office.reservas.find((x) => x.nome === 'Outra Reserva');
    return {
      caixaAntes, patrimonioAntes,
      saldoReservaNova: getSaldoOfficeReserva(reserva.id),
      saldoInicialBruto: reserva.saldoInicial,
      caixaDepois: getOfficeOperationalBalance(),
      patrimonioDepois: getOfficeFinancialPatrimony(),
    };
  });
  const ok = r.saldoReservaNova === 0 && r.saldoInicialBruto === 0
    && r.caixaDepois === r.caixaAntes && r.patrimonioDepois === r.patrimonioAntes;
  return { ok, detail: `criar uma reserva nova NUNCA altera o caixa (${r.caixaAntes}→${r.caixaDepois}) nem o patrimônio total (${r.patrimonioAntes}→${r.patrimonioDepois}) — a reserva nasce com saldo=${r.saldoReservaNova} (esp. 0)` };
}, 'criar uma nova reserva empresarial nunca cria patrimônio do nada — nasce sempre com saldo 0, sem opção de saldo inicial na UI');

// OR02b — a UI de criação de reserva não oferece mais o campo de saldo inicial.
await check('OR02b', async () => {
  const r = await page.evaluate(() => {
    renderOfficeReservasTab();
    return { existeCampoSaldoInicial: !!document.getElementById('newOReservaSaldoInicial') };
  });
  const ok = r.existeCampoSaldoInicial === false;
  return { ok, detail: `formulário de nova reserva não expõe mais "Saldo inicial" — existeCampoSaldoInicial=${r.existeCampoSaldoInicial} (esp. false)` };
}, 'a UI de criação de nova reserva não oferece mais o campo "Saldo inicial"');

// OR03 — compatibilidade com reserva LEGADA (saldoInicial de antes do Gate 3.1)
// importada de um backup: nunca é apagada, alterada, nem recebe movimentação
// inventada — o saldo histórico continua sendo calculado como antes.
await check('OR03', async () => {
  const raw = baseSyntheticState({ office: {
    ativo: true, nome: 'Escritório',
    contas: [{ id: 'ocLeg', name: 'Conta Legada', color: '#ff9900', saldoInicial: 2000 }],
    movimentacoesContas: [], projetos: [], recebiveis: [], despesas: [],
    reservas: [{ id: 'orLegada', nome: 'Reserva Legada', finalidade: 'impostos', color: '#5b7fff', saldoInicial: 1000 }],
    movimentacoesReservas: [], repasses: [],
    regrasDistribuicao: [{ destino: 'reserva', percentual: null }, { destino: 'impostos', percentual: null }, { destino: 'repasse_pessoal', percentual: null }],
  } });
  await loadState(raw);
  const r = await page.evaluate(() => {
    const reserva = state.office.reservas.find((x) => x.id === 'orLegada');
    return {
      saldoInicialPreservado: reserva.saldoInicial,
      saldoCalculado: getSaldoOfficeReserva('orLegada'),
      qtdMovimentacoes: (state.office.movimentacoesReservas || []).filter((m) => m.reservaId === 'orLegada').length,
      patrimonioTotal: getOfficeFinancialPatrimony(),
    };
  });
  const ok = r.saldoInicialPreservado === 1000 && r.saldoCalculado === 1000 && r.qtdMovimentacoes === 0 && r.patrimonioTotal === 3000;
  return { ok, detail: `reserva legada (saldoInicial=1000, de antes do Gate 3.1) importada — saldoInicial preservado=${r.saldoInicialPreservado} (esp. 1000), saldo calculado=${r.saldoCalculado} (esp. 1000, sem inventar movimentação), qtd movimentações inventadas=${r.qtdMovimentacoes} (esp. 0), patrimônio total=${r.patrimonioTotal} (esp. 3000 = 2000 caixa + 1000 reserva)` };
}, 'reserva legada com saldoInicial > 0 (de antes do Gate 3.1) é preservada exatamente como estava — nunca migrada, alterada ou recebe movimentação/conta/data inventada');

await close();

const fails = results.filter((r) => r.status === 'FAIL').length;
console.log(`\ngate3-1-reserve-integrity.test.mjs: TOTAL=${results.length} PASS=${results.length - fails} FAIL=${fails}`);
if (fails > 0) process.exitCode = 1;

export { results };
