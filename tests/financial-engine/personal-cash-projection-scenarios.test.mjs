// Projeção pessoal por competência + cenários (branch
// fix/personal-cash-projection-scenarios, base 2eaf646; regra em
// docs/gates/PERSONAL-CASH-PROJECTION-SCENARIOS.md).
//
// Cobre getPersonalMonthProjection / getPersonalMonthFlows /
// classifyPersonalIncome (motor puro, centavos inteiros) e o resumo pessoal
// do Dashboard (#dashResumoMensal / #dashDetalhamento), que só apresenta o
// resultado do motor. Numeração PCP_NN segue a lista obrigatória da
// especificação (itens 1–51; o item 52 é a própria suíte run-all.mjs).
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openHarness, makeRunner, baseSyntheticState } from './harness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { page, loadState, close, consoleErrors } = await openHarness();
const { check, results } = makeRunner('personal-cash-projection-scenarios');

await page.clock.setFixedTime(new Date(2026, 8, 17, 12)); // 17/09/2026
const TODAY = '2026-09-17';

// ── Construtores de fixture (dados sintéticos, nunca dados reais) ─────────
const sal = (id, valor, extra = {}) => ({
  id, nome: 'Salário', tipo: 'salario', valor, conta: 'c1', certeza: 'recorrente', mes: 9, ano: 2026,
  competenciaMes: 9, competenciaAno: 2026, recorrencia: { type: 'last_weekday_of_month', weekday: 5 },
  recebidoPorMes: {}, tributavel: false, createdAt: id, ...extra,
});
const officeRec = (id, valor, data, estado = 'previsto', extra = {}) => {
  const [a, m] = data.split('-').map(Number);
  return {
    id, tipo: 'repasse_escritorio', nome: 'Repasse do Escritório — Projeto', valor, certeza: 'contratado', estado,
    dataPrevista: data, dataRecebimento: estado === 'recebido' ? data : null, competenciaMes: m, competenciaAno: a,
    mes: m, ano: a, conta: estado === 'recebido' ? 'c1' : null, origem: 'office_distribution',
    officeTransferId: 'off_' + id, tributavel: false, createdAt: id, ...extra,
  };
};
const reemb = (id, valor, mes, ano, recebida = false) => ({
  id, tipo: 'repasse', nome: 'Reembolso de compra', valor, mes, ano, conta: 'c1', recorrente: false,
  isRepasse: true, recebidaMeses: recebida ? { [`${ano}-${String(mes).padStart(2, '0')}`]: true } : {}, createdAt: id,
});
const unico = (id, nome, valor, data, extra = {}) => {
  const [a, m] = data.split('-').map(Number);
  return { id, tipo: 'outro', nome, valor, conta: 'c1', certeza: 'contratado', estado: 'previsto', dataPrevista: data,
    dataRecebimento: null, competenciaMes: m, competenciaAno: a, mes: m, ano: a, tributavel: false, createdAt: id, ...extra };
};
const desp = (id, desc, valor, { cartao = 'dinheiro', mes = 9, ano = 2026, fixa = false, parcelas = 1, dataCompra = null, pagoMeses = {}, split = [] } = {}) => ({
  id, desc, cat: 'geral', subcat: 'Geral', cartao, conta: cartao === 'dinheiro' ? 'c1' : null, valor, parcelas,
  mesInicio: mes, anoInicio: ano, dataCompra, fixa, diaVencimento: null, debitoAutomatico: false,
  pagoMeses, split, repasses: {}, createdAt: id,
});

// Cenário numérico obrigatório (seção 2/18 da especificação):
// entradas previstas 4.000,00 + 2.990,99 + 50,00 = 7.040,99;
// saídas previstas 3.000,00 (Dinheiro) + 8.862,48 (fatura Nubank) = 11.862,48.
function mainState(extra = {}) {
  const s = baseSyntheticState({
    receitas: [sal('sal', 4000), officeRec('rep', 2990.99, '2026-09-25'), reemb('reemb', 50, 9, 2026)],
    despesas: [
      desp('aluguel', 'Aluguel', 3000, { fixa: true }),
      desp('compra', 'Notebook', 8862.48, { cartao: 'nu', dataCompra: '2026-09-01' }),
    ],
    financialPreferences: { primarySalaryId: 'sal' },
    ...extra,
  });
  s.contas[0].saldoInicial = 374.77;
  return s;
}
const proj = (mes, ano) => page.evaluate(([m, a, t]) => getPersonalMonthProjection(m, a, { today: t }), [mes, ano, TODAY]);
const openDash = (mes, ano) => page.evaluate(([m, a]) => {
  currentMonth = m; currentYear = a; navigate('dashboard'); renderDashboard();
}, [mes, ano]);
const txt = (sel) => page.locator(sel).innerText();

try {

// ── 1. Exemplo obrigatório negativo ───────────────────────────────────────
await check('PCP_01_NEGATIVE_EXAMPLE', async () => {
  await loadState(mainState());
  const p = await proj(9, 2026);
  const ok = p.entradas.pendentes.total === 704099 && p.saidas.pendentes.total === 1186248 && p.resultadoProjetadoCents === -482149;
  return { ok, detail: `entradas=${p.entradas.pendentes.total} saídas=${p.saidas.pendentes.total} resultado=${p.resultadoProjetadoCents}` };
}, 'R$ 7.040,99 − R$ 11.862,48 = −R$ 4.821,49');

// ── 2. Positivo / 3. Zero ─────────────────────────────────────────────────
await check('PCP_02_POSITIVE', async () => {
  await loadState(baseSyntheticState({ receitas: [sal('sal', 10000)], despesas: [desp('d', 'Aluguel', 7500, { fixa: true })], financialPreferences: { primarySalaryId: 'sal' } }));
  const p = await proj(9, 2026);
  await openDash(9, 2026);
  const cls = await page.locator('#pmResultadoProjetado').getAttribute('class');
  const ok = p.resultadoProjetadoCents === 250000 && cls.includes('pos') && (await txt('#pmResultadoProjetado')) === 'R$ 2.500,00';
  return { ok, detail: JSON.stringify({ r: p.resultadoProjetadoCents, cls }) };
}, 'R$ 10.000,00 − R$ 7.500,00 = R$ 2.500,00 (verde)');

await check('PCP_03_ZERO', async () => {
  await loadState(baseSyntheticState({ receitas: [sal('sal', 5000)], despesas: [desp('d', 'Aluguel', 5000, { fixa: true })], financialPreferences: { primarySalaryId: 'sal' } }));
  const p = await proj(9, 2026);
  await openDash(9, 2026);
  const cls = await page.locator('#pmResultadoProjetado').getAttribute('class');
  const texto = await txt('#pmResultadoTexto');
  const ok = p.resultadoProjetadoCents === 0 && cls.includes('zero') && (await txt('#pmResultadoProjetado')) === 'R$ 0,00' && /zero/i.test(texto);
  return { ok, detail: JSON.stringify({ r: p.resultadoProjetadoCents, cls, texto }) };
}, 'R$ 5.000,00 − R$ 5.000,00 = R$ 0,00 (neutro)');

// ── 4. Sinal negativo nunca omitido ───────────────────────────────────────
await check('PCP_04_NEGATIVE_SIGN', async () => {
  await loadState(mainState());
  await openDash(9, 2026);
  const r = await page.evaluate(() => ({ f1: fmtCentsBRL(-482149), f2: fmtCentsBRL(-1), f3: fmtCentsBRL(1) }));
  const shown = await txt('#pmResultadoProjetado');
  const ok = r.f1 === '− R$ 4.821,49' && r.f2 === '− R$ 0,01' && r.f3 === 'R$ 0,01' && shown === '− R$ 4.821,49';
  return { ok, detail: JSON.stringify({ ...r, shown }) };
}, 'valores negativos sempre com "−"');

// ── 5/6. Saldo atual × resultado × saldo acumulado ────────────────────────
await check('PCP_05_BALANCE_NOT_IN_RESULT', async () => {
  const a = await proj(9, 2026);
  await page.evaluate(() => { state.contas[0].saldoInicial = 99999; });
  const b = await proj(9, 2026);
  const ok = a.saldoAgoraCents === 37477 && b.saldoAgoraCents === 9999900 && a.resultadoProjetadoCents === b.resultadoProjetadoCents && b.resultadoProjetadoCents === -482149;
  return { ok, detail: JSON.stringify({ a: a.saldoAgoraCents, b: b.saldoAgoraCents, ra: a.resultadoProjetadoCents, rb: b.resultadoProjetadoCents }) };
}, 'saldo atual não entra no resultado projetado da competência');

await check('PCP_06_BALANCE_IN_ACCUMULATED', async () => {
  await loadState(mainState());
  const p = await proj(9, 2026);
  // mês atual: 374,77 − 4.821,49 = −4.446,72
  const q = await proj(10, 2026);
  // futuro: + resultado de outubro (salário 4.000 − aluguel 3.000 = +1.000)
  const ok = p.period === 'current' && p.saldoAcumulado.available && p.saldoAcumulado.cents === -444672
    && q.period === 'future' && q.saldoAcumulado.cents === -444672 + 100000 && q.saldoAcumulado.months.length === 2;
  return { ok, detail: JSON.stringify({ atual: p.saldoAcumulado, futuro: q.saldoAcumulado }) };
}, 'saldo acumulado = saldo agora + pendentes até o fim da competência (inclui meses intermediários)');

// ── 7. Competência passada ────────────────────────────────────────────────
await check('PCP_07_PAST_NO_HISTORY', async () => {
  const p = await proj(8, 2026);
  await openDash(8, 2026);
  const shown = await txt('#pmSaldoAcumulado');
  const ok = p.period === 'past' && !p.saldoAcumulado.available && p.saldoAcumulado.cents === null
    && shown.includes('Não disponível para competência passada') && typeof p.resultadoCompletoCents === 'number';
  return { ok, detail: JSON.stringify({ period: p.period, acum: p.saldoAcumulado, shown }) };
}, 'competência passada não inventa saldo histórico; resultado do mês continua disponível');

// ── 8–12. Cenários ────────────────────────────────────────────────────────
await check('PCP_08_11_SCENARIOS', async () => {
  await loadState(mainState());
  const { cenarios: c } = await proj(9, 2026);
  const ok = c.pior.salarioCents === 400000 && c.pior.repasseCents === 299099 && c.pior.reembolsosCents === null
    && c.pior.saidasCents === 1186248 && c.pior.resultadoCents === -487149
    && c.melhor.reembolsosCents === 5000 && c.melhor.resultadoCents === -482149;
  return { ok, detail: JSON.stringify(c) };
}, 'pior −R$ 4.871,49 (salário + repasse − saídas); melhor −R$ 4.821,49 (+ reembolso)');
for (const [id, desc, fn] of [
  ['PCP_08_WORST_HAS_SALARY', 'pior cenário inclui salário principal', (c) => c.pior.salarioCents === 400000],
  ['PCP_09_WORST_HAS_OFFICE_TRANSFER', 'pior cenário inclui repasse pessoal pendente', (c) => c.pior.repasseCents === 299099],
  ['PCP_10_WORST_EXCLUDES_REIMBURSEMENT', 'pior cenário exclui reembolso', (c) => c.pior.reembolsosCents === null && c.pior.resultadoCents === c.pior.salarioCents + c.pior.repasseCents - c.pior.saidasCents],
  ['PCP_11_BEST_HAS_REIMBURSEMENT', 'melhor cenário inclui reembolso pendente', (c) => c.melhor.resultadoCents - c.pior.resultadoCents === 5000],
]) {
  await check(id, async () => { const { cenarios } = await proj(9, 2026); return { ok: fn(cenarios), detail: JSON.stringify(cenarios) }; }, desc);
}
await check('PCP_12_BEST_EXCLUDES_POTENTIAL', async () => {
  await loadState(mainState());
  const antes = await proj(9, 2026);
  await page.evaluate(() => { state.receitas.push({ id: 'pot', tipo: 'projeto', nome: 'Proposta', valor: 9000, certeza: 'potencial', estado: 'previsto', dataPrevista: '2026-09-20', conta: 'c1', tributavel: false }); });
  const p = await proj(9, 2026);
  const ok = p.potenciaisCents === 900000 && p.cenarios.melhor.resultadoCents === antes.cenarios.melhor.resultadoCents
    && p.resultadoProjetadoCents === antes.resultadoProjetadoCents && p.entradas.pendentes.total === antes.entradas.pendentes.total;
  return { ok, detail: JSON.stringify({ pot: p.potenciaisCents, melhor: p.cenarios.melhor.resultadoCents }) };
}, 'melhor cenário e resultado não incluem receita meramente potencial');

// ── 13–15, 27–28. Escritório nunca entra no pessoal ───────────────────────
async function comEscritorio() {
  await page.evaluate(() => {
    const off = state.office;
    off.contas.push({ id: 'oc1', name: 'Sicoob TH', color: '#0a0', saldoInicial: 50000 });
    off.recebiveis.push({ id: 'orc1', projetoId: 'p1', valor: 20000, estado: 'previsto', dataPrevista: '2026-09-20', dataRecebimento: null, contaDestino: 'oc1' });
    off.recebiveis.push({ id: 'orc2', projetoId: 'p1', valor: 8000, estado: 'recebido', dataPrevista: '2026-09-02', dataRecebimento: '2026-09-02', contaDestino: 'oc1' });
    off.despesas.push({ id: 'od1', desc: 'Imposto DAS', valor: 1400, conta: 'oc1', data: '2026-09-10', status: 'pago' });
    off.despesas.push({ id: 'od2', desc: 'RRT', valor: 120, conta: 'oc1', data: '2026-09-11', status: 'pago' });
    off.reservas = off.reservas || [];
    for (const [rid, nome] of [['oreserva_sys_operacao', 'Operação'], ['oreserva_sys_reserva_crescimento', 'Reserva de Crescimento'], ['oreserva_sys_capital_giro', 'Capital de Giro'], ['oreserva_sys_marketing', 'Marketing']]) {
      if (!off.reservas.some((r) => r.id === rid)) off.reservas.push({ id: rid, nome, saldoInicial: 0, sistema: true });
      off.movimentacoesReservas.push({ id: 'mv_' + rid, reservaId: rid, valor: 3000, tipo: 'aplicacao', data: '2026-09-03' });
    }
    off.repasses.push({ id: 'orp', tipo: 'planejado', recebivelId: 'orc1', valor: 2990.99, estado: 'previsto', dataPrevista: '2026-09-25', dataRecebimento: null, officeTransferId: 'off_rep' });
  });
}
const resumo = (p) => JSON.stringify([p.saldoAgoraCents, p.entradas, p.saidas, p.resultadoProjetadoCents, p.resultadoCompletoCents, p.cenarios]);
await check('PCP_13_OFFICE_GROSS_NEVER_PERSONAL', async () => {
  await loadState(mainState());
  const antes = await proj(9, 2026);
  await comEscritorio();
  const depois = await proj(9, 2026);
  const office = await page.evaluate(() => ({ bruto: getOfficeReceivablesPrevistoTotal(9, 2026), caixa: getOfficeOperationalBalance() }));
  const ok = resumo(antes) === resumo(depois) && office.bruto === 20000 && office.caixa > 0;
  return { ok, detail: JSON.stringify({ office, igual: resumo(antes) === resumo(depois) }) };
}, 'receita bruta do escritório (recebível de R$ 20.000) nunca entra na projeção pessoal');
await check('PCP_14_OFFICE_RESERVES_NEVER_PERSONAL', async () => {
  const p = await proj(9, 2026);
  const reservado = await page.evaluate(() => getOfficeReservedBalance());
  const ok = reservado === 12000 && p.saldoAgoraCents === 37477 && p.entradas.pendentes.total === 704099;
  return { ok, detail: JSON.stringify({ reservado, saldo: p.saldoAgoraCents }) };
}, 'Operação, Crescimento, Capital de Giro e Marketing nunca entram');
await check('PCP_15_TAX_RRT_NEVER_PERSONAL_INCOME', async () => {
  const p = await proj(9, 2026);
  const labels = [...p.items.entradasPendentes, ...p.items.entradasRealizadas, ...p.items.saidasPendentes, ...p.items.saidasRealizadas].map((i) => i.label).join('|');
  const ok = !/DAS|RRT/.test(labels) && p.saidas.pendentes.total === 1186248 && p.entradas.realizadas.total === 0;
  return { ok, detail: labels };
}, 'imposto e RRT do escritório nunca entram como receita (nem saída) pessoal');
await check('PCP_27_BUSINESS_ACCOUNT_NOT_IN_BALANCE', async () => {
  const p = await proj(9, 2026);
  const pessoal = await page.evaluate(() => state.contas.reduce((s, c) => s + calcSaldoConta(c.id), 0));
  const ok = p.saldoAgoraCents === Math.round(pessoal * 100) && p.saldoAgoraCents === 37477;
  return { ok, detail: JSON.stringify({ saldo: p.saldoAgoraCents, pessoal }) };
}, 'conta empresarial (Sicoob TH, R$ 50.000) não entra no saldo pessoal');
await check('PCP_28_RESERVES_NOT_IN_BALANCE', async () => {
  await page.evaluate(() => {
    state.cofrinhos.push({ id: 'cf1', nome: 'Viagem', saldoInicial: 0 });
    state.movimentacoesCofrinhos.push({ id: 'dep1', cofrinhoId: 'cf1', valor: 200, mes: 9, ano: 2026, tipo: 'deposito', createdAt: 'dep1' });
    state.movimentacoesContas.push({ id: 'dep1', contaId: 'c1', valor: -200, data: '2026-09-05', obs: 'Depósito no cofrinho', cofrinhoId: 'cf1' });
  });
  const p = await proj(9, 2026);
  const ok = p.saldoAgoraCents === 17477 && p.saidas.pendentes.total === 1186248 && p.saidas.realizadas.total === 0
    && p.items.internas.some((i) => i.kind === 'deposito_cofrinho' && i.amountCents === 20000);
  return { ok, detail: JSON.stringify({ saldo: p.saldoAgoraCents, saidas: p.saidas, internas: p.items.internas }) };
}, 'reservas empresariais fora do saldo; depósito no cofrinho não vira despesa (conta uma única vez, no saldo)');

// ── 16–17. Repasse do escritório: sem dupla contagem, parcial ─────────────
await check('PCP_16_OFFICE_TRANSFER_NOT_DOUBLED', async () => {
  const p = await proj(9, 2026);
  const n = p.items.entradasPendentes.filter((i) => i.nature === 'office_personal_transfer').length;
  const ok = p.entradas.pendentes.office_personal_transfer === 299099 && n === 1;
  return { ok, detail: JSON.stringify({ office: p.entradas.pendentes.office_personal_transfer, n }) };
}, 'repasse do escritório já transformado em receita pessoal conta uma vez (a receita), nunca o registro de origem');
await check('PCP_17_OFFICE_TRANSFER_PARTIAL', async () => {
  await loadState(mainState({ receitas: [sal('sal', 4000), officeRec('ra', 1000, '2026-09-05', 'recebido'), officeRec('rb', 1990.99, '2026-09-25')] }));
  const p = await proj(9, 2026);
  const ok = p.entradas.realizadas.office_personal_transfer === 100000 && p.entradas.pendentes.office_personal_transfer === 199099
    && p.cenarios.pior.repasseCents === 199099;
  return { ok, detail: JSON.stringify({ real: p.entradas.realizadas, pend: p.entradas.pendentes }) };
}, 'repasse parcialmente recebido: só o restante pendente entra na projeção/cenários');

// ── 18–19. Salário e reembolso recebidos ──────────────────────────────────
await check('PCP_18_SALARY_RECEIVED_NOT_PENDING', async () => {
  await loadState(mainState({ receitas: [sal('sal', 4000, { recebidoPorMes: { '2026-09': { estado: 'recebido', dataRecebimento: '2026-09-05' } } })] }));
  const p = await proj(9, 2026);
  const ok = p.entradas.realizadas.salary === 400000 && p.entradas.pendentes.salary === 0 && p.cenarios.pior.salarioCents === 0;
  return { ok, detail: JSON.stringify({ real: p.entradas.realizadas, pend: p.entradas.pendentes }) };
}, 'salário recebido fica só no realizado');
await check('PCP_19_REIMBURSEMENT_RECEIVED_ONLY_REALIZED', async () => {
  await loadState(mainState({ receitas: [sal('sal', 4000), reemb('reemb', 50, 9, 2026, true)] }));
  const p = await proj(9, 2026);
  const ok = p.entradas.realizadas.reimbursement === 5000 && p.entradas.pendentes.reimbursement === 0 && p.cenarios.melhor.reembolsosCents === 0;
  return { ok, detail: JSON.stringify({ real: p.entradas.realizadas, pend: p.entradas.pendentes }) };
}, 'reembolso recebido aparece somente no realizado');

// ── 20. Reembolso não reduz a despesa original ────────────────────────────
await check('PCP_20_REIMBURSEMENT_DOES_NOT_REDUCE_EXPENSE', async () => {
  await loadState(baseSyntheticState({
    pessoas: [{ id: 'ana', name: 'Ana', color: '#f0f' }],
    despesas: [desp('jantar', 'Jantar', 100, { split: [{ personId: 'ana', percent: 50 }] })],
  }));
  const a = await proj(9, 2026);
  await page.evaluate(() => toggleRepasse('jantar', 'ana', 9, 2026, false));
  const b = await proj(9, 2026);
  const ok = a.saidas.pendentes.total === 10000 && a.entradas.pendentes.reimbursement === 5000
    && b.saidas.pendentes.total === 10000 && b.entradas.pendentes.reimbursement === 0 && b.entradas.realizadas.reimbursement === 0;
  return { ok, detail: JSON.stringify({ a: [a.saidas.pendentes.total, a.entradas.pendentes.reimbursement], b: [b.saidas.pendentes.total, b.entradas.pendentes.reimbursement] }) };
}, 'despesa compartilhada continua cheia; o reembolso é linha própria e nunca abate a despesa de novo');

// ── 21–24. Realizado × pendente, parciais ─────────────────────────────────
await check('PCP_21_INCOME_NO_DUPLICATION', async () => {
  await loadState(mainState({ receitas: [sal('sal', 4000, { recebidoPorMes: { '2026-09': { estado: 'recebido', dataRecebimento: '2026-09-05' } } }), officeRec('rep', 2990.99, '2026-09-25'), reemb('reemb', 50, 9, 2026)] }));
  const p = await proj(9, 2026);
  const ids = [...p.items.entradasRealizadas, ...p.items.entradasPendentes].map((i) => i.id);
  const total = await page.evaluate(() => Math.round(getReceitasForMonth(9, 2026).reduce((s, r) => s + valorReceita(r), 0) * 100));
  const ok = new Set(ids).size === ids.length && p.entradas.realizadas.total + p.entradas.pendentes.total === total;
  return { ok, detail: JSON.stringify({ ids, total, real: p.entradas.realizadas.total, pend: p.entradas.pendentes.total }) };
}, 'cada entrada aparece uma vez: realizada OU pendente');
await check('PCP_22_EXPENSE_NO_DUPLICATION', async () => {
  await loadState(mainState({ despesas: [desp('aluguel', 'Aluguel', 3000, { fixa: true, pagoMeses: { '2026-09': true } }), desp('luz', 'Luz', 200), desp('compra', 'Notebook', 8862.48, { cartao: 'nu', dataCompra: '2026-09-01' })] }));
  const p = await proj(9, 2026);
  const ids = [...p.items.saidasRealizadas, ...p.items.saidasPendentes].map((i) => i.id);
  const ok = new Set(ids).size === ids.length && p.saidas.realizadas.total === 300000 && p.saidas.pendentes.total === 20000 + 886248;
  return { ok, detail: JSON.stringify({ ids, real: p.saidas.realizadas, pend: p.saidas.pendentes }) };
}, 'cada saída aparece uma vez: paga OU pendente');
await check('PCP_23_PARTIAL_PAYMENT', async () => {
  await loadState(baseSyntheticState({
    despesas: [desp('geladeira', 'Geladeira', 300, { parcelas: 3, pagoMeses: { '2026-09': true } }), desp('fixa', 'Internet', 150, { fixa: true }),
      desp('compra', 'Tênis', 500, { cartao: 'nu', dataCompra: '2026-09-01' })],
    faturasPagas: { 'nu_2026-09': true },
  }));
  const set = await proj(9, 2026); const out = await proj(10, 2026);
  const ok = set.saidas.realizadas.total === 10000 + 50000 && set.saidas.pendentes.total === 15000
    && set.saidas.realizadas.invoice === 50000 && out.saidas.pendentes.expense === 10000 + 15000;
  return { ok, detail: JSON.stringify({ set: set.saidas, out: out.saidas }) };
}, 'pagamento parcial das obrigações do mês: pago no realizado, só o restante no previsto');
await check('PCP_24_PARTIAL_RECEIPT', async () => {
  await loadState(baseSyntheticState({ receitas: [{ id: 'proj', tipo: 'extra', nome: 'Projeto parcelado', valor: 1000, mes: 9, ano: 2026, conta: 'c1', recorrente: false, tributavel: false,
    parcelas: [{ mes: 9, ano: 2026, valor: 600, recebida: true }, { mes: 9, ano: 2026, valor: 400, recebida: false }], createdAt: 'proj' }] }));
  const p = await proj(9, 2026);
  const ok = p.entradas.realizadas.other === 60000 && p.entradas.pendentes.other === 40000;
  return { ok, detail: JSON.stringify({ real: p.entradas.realizadas, pend: p.entradas.pendentes }) };
}, 'recebimento parcial: parte recebida no realizado, restante no previsto');

// ── 25–26. Cartão × fatura, transferência ─────────────────────────────────
await check('PCP_25_CARD_PURCHASE_VS_INVOICE', async () => {
  await loadState(baseSyntheticState({ despesas: [desp('c1x', 'Mercado', 300, { cartao: 'nu', dataCompra: '2026-09-01' }), desp('c2x', 'Farmácia', 200, { cartao: 'nu', dataCompra: '2026-09-02' })] }));
  const a = await proj(9, 2026);
  await page.evaluate(() => { state.faturasAjustes['nu_2026-09'] = 499.5; });
  const b = await proj(9, 2026);
  const ok = a.saidas.pendentes.invoice === 50000 && a.saidas.pendentes.expense === 0 && a.saidas.pendentes.total === 50000
    && a.items.saidasPendentes.length === 1 && b.saidas.pendentes.total === 49950;
  return { ok, detail: JSON.stringify({ a: a.saidas.pendentes, b: b.saidas.pendentes }) };
}, 'compras no cartão entram só pela fatura (com ajuste manual), nunca compra + fatura');
await check('PCP_26_TRANSFER_NOT_EXPENSE', async () => {
  await loadState(mainState());
  const a = await proj(9, 2026);
  await page.evaluate(() => {
    state.contas.push({ id: 'c2', name: 'Conta 2', color: '#123', saldoInicial: 0 });
    state.movimentacoesContas.push({ id: 't1a', contaId: 'c1', valor: -300, data: '2026-09-10', transferId: 't1' }, { id: 't1b', contaId: 'c2', valor: 300, data: '2026-09-10', transferId: 't1' });
  });
  const b = await proj(9, 2026);
  const ok = resumo(a) === resumo(b);
  return { ok, detail: JSON.stringify({ a: a.saidas, b: b.saidas, sa: a.saldoAgoraCents, sb: b.saldoAgoraCents }) };
}, 'transferência entre contas pessoais não é despesa nem receita e não altera o saldo total');

// ── 29–32. Competências independentes, viradas de ano ─────────────────────
await check('PCP_29_30_SEP_OCT_INDEPENDENT', async () => {
  await loadState(mainState());
  const set = await proj(9, 2026); const out = await proj(10, 2026); const set2 = await proj(9, 2026);
  const ok = set.resultadoProjetadoCents === -482149 && out.resultadoProjetadoCents === 100000
    && out.entradas.pendentes.office_personal_transfer === 0 && out.saidas.pendentes.invoice === 0 && resumo(set) === resumo(set2);
  return { ok, detail: JSON.stringify({ set: set.resultadoProjetadoCents, out: out.resultadoProjetadoCents }) };
}, 'setembro (−4.821,49) e outubro (+1.000,00) não se misturam');
await check('PCP_29_DASH_NO_MIX', async () => {
  await openDash(9, 2026); const s = await txt('#pmResultadoProjetado');
  await page.evaluate(() => changeMonth(1)); const o = await txt('#pmResultadoProjetado');
  await page.evaluate(() => changeMonth(-1)); const s2 = await txt('#pmResultadoProjetado');
  const ok = s === '− R$ 4.821,49' && o === 'R$ 1.000,00' && s2 === s;
  return { ok, detail: JSON.stringify({ s, o, s2 }) };
}, 'trocar de mês no Dashboard troca todos os indicadores mensais sem resíduo');
async function viradaAno() {
  await loadState(baseSyntheticState({
    receitas: [sal('sal', 4000, { mes: 12, ano: 2026, competenciaMes: 12, competenciaAno: 2026 })],
    despesas: [desp('natal', 'Presentes', 1500, { mes: 12, ano: 2026 }), desp('ipva', 'IPVA', 2500, { mes: 1, ano: 2027 })],
    financialPreferences: { primarySalaryId: 'sal' },
  }));
}
await check('PCP_31_DEC_TO_JAN', async () => {
  await viradaAno();
  await openDash(12, 2026); const dez = await txt('#pmResultadoProjetado');
  await page.evaluate(() => changeMonth(1));
  const jan = await txt('#pmResultadoProjetado');
  const periodo = await page.evaluate(() => `${currentMonth}/${currentYear}`);
  const p = await proj(1, 2027);
  const ok = dez === 'R$ 2.500,00' && periodo === '1/2027' && jan === 'R$ 1.500,00' && p.resultadoProjetadoCents === 150000;
  return { ok, detail: JSON.stringify({ dez, jan, periodo }) };
}, 'dezembro → janeiro: nova competência, novo ano, sem resíduo');
await check('PCP_32_JAN_TO_DEC', async () => {
  await page.evaluate(() => changeMonth(-1));
  const dez = await txt('#pmResultadoProjetado');
  const periodo = await page.evaluate(() => `${currentMonth}/${currentYear}`);
  const ok = periodo === '12/2026' && dez === 'R$ 2.500,00';
  return { ok, detail: JSON.stringify({ dez, periodo }) };
}, 'janeiro → dezembro: volta à competência anterior com os próprios valores');

// ── 33–34. Sem data e potenciais ──────────────────────────────────────────
await check('PCP_33_UNDATED_PENDENCY', async () => {
  await loadState(mainState());
  const antes = await proj(9, 2026);
  await page.evaluate(() => { state.receitas.push({ id: 'semdata', tipo: 'projeto', nome: 'Projeto sem data', valor: 777, conta: 'c1', certeza: 'contratado', estado: 'previsto', dataPrevista: null, dataRecebimento: null, tributavel: false }); });
  const p = await proj(9, 2026);
  await openDash(9, 2026);
  const pend = await txt('#pmPendencias');
  const noMes = [...p.items.entradasPendentes, ...p.items.entradasRealizadas].some((i) => i.id === 'semdata');
  const ok = resumo(p) === resumo(antes) && !noMes && p.pendenciasSemData.some((i) => i.id === 'semdata' && i.amountCents === 77700)
    && pend.includes('Projeto sem data') && /não estão incluídos/i.test(pend) && pend.includes('R$ 777,00');
  return { ok, detail: JSON.stringify({ pend: pend.slice(0, 200), lista: p.pendenciasSemData }) };
}, 'lançamento sem data fica fora dos cálculos e aparece em "Pendências a conferir", com valor (não zero)');
await check('PCP_34_POTENTIAL_SEPARATE', async () => {
  await page.evaluate(() => { state.receitas.push({ id: 'pot', tipo: 'projeto', nome: 'Proposta', valor: 9000, certeza: 'potencial', estado: 'previsto', dataPrevista: '2026-09-20', conta: 'c1', tributavel: false }); renderDashboard(); });
  const shown = await txt('#pmPotenciais');
  const entradas = await txt('#pmEntradasPrevistas');
  const ok = shown === 'R$ 9.000,00' && entradas === 'R$ 7.040,99';
  return { ok, detail: JSON.stringify({ shown, entradas }) };
}, 'receita potencial aparece separada e não soma nas entradas previstas');

// ── 35–36. Classificação estrutural, nunca por descrição ──────────────────
await check('PCP_35_36_NOT_BY_DESCRIPTION', async () => {
  await loadState(baseSyntheticState({ receitas: [
    unico('a', 'Salário extra', 100, '2026-09-10'),
    unico('b', 'Repasse do escritório', 200, '2026-09-10'),
    unico('c', 'Reembolso Amazon', 300, '2026-09-10'),
    { id: 'd', tipo: 'salario', nome: 'Salário', valor: 400, mes: 9, ano: 2026, conta: 'c1', recorrente: false, tributavel: false, recebidaMeses: {} },
    unico('e', 'Venda bicicleta', 500, '2026-09-10', { incomeNature: 'reimbursement' }),
    unico('f', 'Pagamento cliente', 600, '2026-09-10', { incomeNature: 'office_personal_transfer' }),
  ] }));
  const p = await proj(9, 2026);
  const nat = Object.fromEntries(p.items.entradasPendentes.map((i) => [i.id, i.nature]));
  const ok = nat.a === 'other' && nat.b === 'other' && nat.c === 'other' && nat.d === 'other'
    && nat.e === 'reimbursement' && nat.f === 'office_personal_transfer' && p.entradas.pendentes.salary === 0;
  return { ok, detail: JSON.stringify(nat) };
}, 'descrições com "salário", "repasse" ou "reembolso" não classificam sozinhas; só campos estruturados');
await check('PCP_35_NON_PRIMARY_SALARY_IS_OTHER', async () => {
  await loadState(baseSyntheticState({ receitas: [sal('s1', 4000), sal('s2', 1500)], financialPreferences: { primarySalaryId: 's1' } }));
  const p = await proj(9, 2026);
  const ok = p.entradas.pendentes.salary === 400000 && p.entradas.pendentes.other === 150000 && p.cenarios.pior.salarioCents === 400000;
  return { ok, detail: JSON.stringify(p.entradas.pendentes) };
}, 'só o salário principal (por id) entra no cenário conservador; o outro fica em outras entradas');

// ── 37–39. Migração, compatibilidade, round-trip ──────────────────────────
await check('PCP_37_38_MIGRATION', async () => {
  const legado = baseSyntheticState({ receitas: [reemb('old', 50, 9, 2026), { id: 'leg', tipo: 'outro', nome: 'Outro antigo', valor: 10, mes: 9, ano: 2026, conta: 'c1', recorrente: false },
    { ...officeRec('rep', 2990.99, '2026-09-25') }] });
  const r = await page.evaluate((raw) => {
    delete raw.receitas[2].incomeNature;
    migrateAppData(JSON.parse(JSON.stringify(raw)));
    const uma = JSON.stringify(state);
    const valoresAntes = JSON.stringify(raw.receitas.map((x) => [x.id, x.valor, x.mes, x.ano, x.conta, x.estado, x.dataPrevista]));
    const valoresDepois = JSON.stringify(state.receitas.map((x) => [x.id, x.valor, x.mes, x.ano, x.conta, x.estado, x.dataPrevista]));
    migrateState(); migrateState();
    return { idem: uma === JSON.stringify(state), valores: valoresAntes === valoresDepois,
      nat: state.receitas.map((x) => x.incomeNature === undefined ? null : x.incomeNature) };
  }, legado);
  const ok = r.idem && r.valores && r.nat[0] === null && r.nat[1] === null && r.nat[2] === 'office_personal_transfer';
  return { ok, detail: JSON.stringify(r) };
}, 'dados antigos sem natureza continuam sem natureza; só a origem estrutural do escritório é marcada; migração idempotente');
await check('PCP_39_EXPORT_IMPORT_ROUNDTRIP', async () => {
  await loadState(mainState({ receitas: [sal('sal', 4000), unico('e', 'Venda', 500, '2026-09-10', { incomeNature: 'reimbursement' }), officeRec('rep', 2990.99, '2026-09-25', 'previsto', { incomeNature: 'office_personal_transfer' })] }));
  const r = await page.evaluate(() => {
    const antes = getPersonalMonthProjection(9, 2026, { today: '2026-09-17' });
    const json = JSON.stringify(buildSaveObject());
    migrateAppData(JSON.parse(json));
    const depois = getPersonalMonthProjection(9, 2026, { today: '2026-09-17' });
    return { nat: state.receitas.map((x) => x.incomeNature ?? null), igual: JSON.stringify(antes) === JSON.stringify(depois), json2: JSON.stringify(buildSaveObject()) === json };
  });
  const ok = r.nat[1] === 'reimbursement' && r.nat[2] === 'office_personal_transfer' && r.igual && r.json2;
  return { ok, detail: JSON.stringify(r) };
}, 'exportação/importação preservam incomeNature e a projeção');

// ── 40. Perfis ────────────────────────────────────────────────────────────
await check('PCP_40_PROFILES_INDEPENDENT', async () => {
  await loadState(mainState());
  const r = await page.evaluate(() => {
    const a = getPersonalMonthProjection(9, 2026, { today: '2026-09-17' }).resultadoProjetadoCents;
    const idA = perfilAtivo;
    perfis.perfil_b = { id: 'perfil_b', name: 'Outro', color: '#abc', data: { receitas: [{ id: 's', tipo: 'salario', nome: 'Sal', valor: 100, conta: 'x', certeza: 'recorrente', mes: 9, ano: 2026, competenciaMes: 9, competenciaAno: 2026, recorrencia: { type: 'last_weekday_of_month', weekday: 5 }, recebidoPorMes: {}, tributavel: false }], despesas: [], contas: [{ id: 'x', name: 'X', saldoInicial: 5 }] } };
    switchPerfil('perfil_b');
    const b = getPersonalMonthProjection(9, 2026, { today: '2026-09-17' });
    switchPerfil(idA);
    const a2 = getPersonalMonthProjection(9, 2026, { today: '2026-09-17' }).resultadoProjetadoCents;
    return { a, b: b.resultadoProjetadoCents, bSaldo: b.saldoAgoraCents, a2 };
  });
  const ok = r.a === -482149 && r.b === 10000 && r.bSaldo === 500 && r.a2 === r.a;
  return { ok, detail: JSON.stringify(r) };
}, 'cada perfil tem sua projeção independente');

// ── 41–43. Nenhuma mutação ────────────────────────────────────────────────
await check('PCP_41_43_NO_STATE_MUTATION', async () => {
  await loadState(mainState());
  const r = await page.evaluate(() => {
    const rec = JSON.stringify(state.receitas), des = JSON.stringify(state.despesas), all = JSON.stringify(state);
    for (let m = 1; m <= 12; m++) getPersonalMonthProjection(m, 2026, { today: '2026-09-17' });
    const recCalc = JSON.stringify(state.receitas) === rec, desCalc = JSON.stringify(state.despesas) === des;
    currentMonth = 9; currentYear = 2026; navigate('dashboard');
    for (const d of [1, 1, 1, -1, -1, -1, -1, 1]) changeMonth(d);
    return { recCalc, desCalc, allUi: JSON.stringify(state) === all };
  });
  const ok = r.recCalc && r.desCalc && r.allUi;
  return { ok, detail: JSON.stringify(r) };
}, 'calcular e trocar competência não alteram state (receitas/despesas byte a byte)');

// ── 44–48. Interface ──────────────────────────────────────────────────────
await check('PCP_44_FULL_TITLES', async () => {
  await page.setViewportSize({ width: 1440, height: 1600 });
  await loadState(mainState()); await openDash(9, 2026);
  const r = await page.evaluate(() => [...document.querySelectorAll('#dashResumoMensal .pm-title')].map((el) => {
    const cs = getComputedStyle(el);
    return { t: el.textContent, ellipsis: cs.textOverflow === 'ellipsis', nowrap: cs.whiteSpace === 'nowrap', cortado: el.scrollWidth > el.clientWidth + 1 };
  }));
  const esperados = ['Saldo disponível agora', 'Entradas previstas', 'Saídas previstas', 'Resultado projetado do mês', 'Entradas já recebidas', 'Saídas já pagas', 'Resultado completo do mês', 'Saldo acumulado estimado'];
  const ok = JSON.stringify(r.map((x) => x.t)) === JSON.stringify(esperados) && r.every((x) => !x.ellipsis && !x.nowrap && !x.cortado);
  return { ok, detail: JSON.stringify(r) };
}, 'oito títulos completos, na ordem pedida, sem reticências nem corte');
async function semSobreposicao() {
  return page.evaluate(() => {
    const tiles = [...document.querySelectorAll('#dashResumoMensal .pm-tile, #dashDetalhamento .pm-tile')].map((e) => e.getBoundingClientRect());
    let overlap = false;
    for (let i = 0; i < tiles.length; i++) for (let j = i + 1; j < tiles.length; j++) {
      const a = tiles[i], b = tiles[j];
      if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) overlap = true;
    }
    const el = document.getElementById('dashResumoMensal');
    const valoresCabem = [...document.querySelectorAll('#dashResumoMensal .pm-value')].every((v) => v.scrollWidth <= v.clientWidth + 1);
    return { overlap, cabe: el.scrollWidth <= el.clientWidth + 2, valoresCabem, n: tiles.length,
      linha1: new Set([...document.querySelectorAll('#pmLinha1 .pm-tile')].map((e) => Math.round(e.getBoundingClientRect().top))).size };
  });
}
await check('PCP_45_RESPONSIVE', async () => {
  const largo = await semSobreposicao();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => renderDashboard());
  const estreito = await semSobreposicao();
  await page.setViewportSize({ width: 1440, height: 1600 });
  const ok = !largo.overlap && largo.cabe && largo.valoresCabem && largo.linha1 === 1 && !estreito.overlap && estreito.cabe && estreito.valoresCabem && estreito.linha1 === 4;
  return { ok, detail: JSON.stringify({ largo, estreito }) };
}, 'tela larga: 1ª linha em uma fileira; celular: cartões empilhados; sem sobreposição nem rolagem lateral');
await check('PCP_46_FORMULA_VISIBLE', async () => {
  await page.evaluate(() => renderDashboard());
  const f = await txt('#pmResultadoFormula');
  const comp = await txt('#pmCompEntradas');
  const ok = f === 'R$ 7.040,99 − R$ 11.862,48 = − R$ 4.821,49'
    && comp.includes('Salário principal: R$ 4.000,00') && comp.includes('Repasse pessoal do escritório: R$ 2.990,99')
    && comp.includes('Reembolsos: R$ 50,00') && comp.includes('Outras entradas confirmadas: R$ 0,00');
  return { ok, detail: JSON.stringify({ f, comp }) };
}, 'fórmula real visível e composição das entradas por origem');
await check('PCP_46B_SCENARIOS_VISIBLE', async () => {
  const pior = await txt('#pmPiorCenario'); const melhor = await txt('#pmMelhorCenario'); const saidas = await txt('#pmCompSaidas');
  const ok = pior.includes('R$ 4.000,00') && pior.includes('R$ 2.990,99') && pior.includes('não considerados') && pior.includes('− R$ 11.862,48') && pior.includes('− R$ 4.871,49')
    && melhor.includes('R$ 50,00') && melhor.includes('− R$ 4.821,49')
    && saidas.includes('Despesas (Dinheiro/PIX, fixas e parcelas): R$ 3.000,00') && saidas.includes('Faturas de cartão: R$ 8.862,48');
  return { ok, detail: JSON.stringify({ pior, melhor, saidas }) };
}, 'cenários e composição das saídas visíveis com valores reais');
await check('PCP_47_NEGATIVE_TEXT_NOT_ONLY_COLOR', async () => {
  const cls = await page.locator('#pmResultadoProjetado').getAttribute('class');
  const t = await txt('#pmResultadoTexto');
  const ok = cls.includes('neg') && /negativo/i.test(t) && (await txt('#pmResultadoProjetado')).startsWith('−');
  return { ok, detail: JSON.stringify({ cls, t }) };
}, 'resultado negativo tem sinal e texto, não só cor');
await check('PCP_48_TODAY_SECTION_SEPARATE', async () => {
  const hero = await txt('#dashHero');
  const antes = await txt('#pmResultadoProjetado');
  await page.evaluate(() => setFinancialPreference('projectionEndDate', '2026-12-31'));
  const depois = await txt('#pmResultadoProjetado');
  const ordem = await page.evaluate(() => {
    const a = document.getElementById('dashResumoMensal'), b = document.getElementById('dashHero');
    return !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  const ok = hero.includes('Fluxo de caixa a partir de hoje') && hero.includes('17/09/2026') && /não é o resultado da competência/i.test(hero)
    && !hero.includes('Resultado projetado do mês') && antes === depois && antes === '− R$ 4.821,49' && ordem;
  return { ok, detail: JSON.stringify({ antes, depois, ordem, hero: hero.slice(0, 220) }) };
}, '"Fluxo de caixa a partir de hoje" separado, com datas, e não altera os números mensais');

// ── 49–50. Pesquisa da fatura ─────────────────────────────────────────────
await check('PCP_49_INVOICE_SEARCH_STILL_WORKS', async () => {
  await loadState(mainState({ despesas: [desp('compra', 'Notebook', 8862.48, { cartao: 'nu', dataCompra: '2026-09-01' }), desp('c2', 'Farmácia', 40, { cartao: 'nu', dataCompra: '2026-09-02' })] }));
  const r = await page.evaluate(() => {
    currentMonth = 9; currentYear = 2026; navigate('cartoes'); selecionarFaturaCartao('nu');
    const input = document.getElementById('cartaoFaturaSearchInput');
    input.value = 'note'; input.dispatchEvent(new Event('input'));
    const html = document.getElementById('cartaoFaturaItens').innerHTML;
    changeMonth(1);
    return { filtra: html.includes('Notebook') && !html.includes('Farmácia'), limpo: input.value === '' };
  });
  return { ok: r.filtra && r.limpo, detail: JSON.stringify(r) };
}, 'pesquisa da fatura continua filtrando e sendo limpa na troca de mês');
await check('PCP_50_INVOICE_SEARCH_CASES_13_18', async () => {
  const ids = ['INVOICE_SEARCH_13_SEP_TO_OCT_CLEARS_SEARCH', 'INVOICE_SEARCH_14_OCT_TO_SEP_CLEARS_SEARCH', 'INVOICE_SEARCH_15_DEC_TO_JAN_CLEARS_SEARCH',
    'INVOICE_SEARCH_16_JAN_TO_DEC_CLEARS_SEARCH', 'INVOICE_SEARCH_17_SEARCH_WORKS_AFTER_MONTH_CHANGE', 'INVOICE_SEARCH_18_CARD_SWITCH_AND_REOPEN_STILL_CLEAR'];
  const out = execFileSync(process.execPath, [path.join(__dirname, 'gate5-invoice-transaction-search.test.mjs')],
    { encoding: 'utf8', env: { ...process.env, FINFLOW_ONLY_CHECKS: ids.join(',') } });
  const ok = ids.every((id) => out.includes(`[PASS] ${id}`)) && out.includes('TOTAL=6 PASS=6 FAIL=0');
  // Detalhe sem repetir a linha-resumo do processo filho: run-all.mjs lê o
  // PRIMEIRO "TOTAL=.. PASS=.. FAIL=.." da saída de cada arquivo.
  const linhas = out.split('\n').filter((l) => /^\[(PASS|FAIL)\]/.test(l)).map((l) => l.slice(0, 60));
  return { ok, detail: `${linhas.filter((l) => l.startsWith('[PASS]')).length}/6 aprovados — ${linhas.join(' | ')}` };
}, 'casos 13–18 da pesquisa da fatura continuam passando');

// ── Complementares ────────────────────────────────────────────────────────
await check('PCP_EXTRA_CONTRIBUTION_IS_OUTFLOW', async () => {
  await loadState(baseSyntheticState({ receitas: [sal('sal', 4000, { tributavel: true })], financialPreferences: { primarySalaryId: 'sal' } }));
  const a = await proj(9, 2026);
  await page.evaluate(() => { state.contribuicaoPaga['2026-09'] = true; });
  const b = await proj(9, 2026);
  const ok = a.saidas.pendentes.contribution === 40000 && b.saidas.pendentes.contribution === 0 && b.saidas.realizadas.contribution === 40000;
  return { ok, detail: JSON.stringify({ a: a.saidas, b: b.saidas }) };
}, 'contribuição é obrigação pessoal: pendente até ser paga, depois só no realizado');
await check('PCP_EXTRA_LEGACY_RESGATE_INTERNAL', async () => {
  await loadState(baseSyntheticState({ receitas: [{ id: 'rg', tipo: 'resgate', nome: 'Resgate do Cofrinho', valor: 300, mes: 9, ano: 2026, conta: 'c1', recorrente: false, recebidaMeses: { '2026-09': true } }] }));
  const p = await proj(9, 2026);
  const ok = p.entradas.realizadas.total === 0 && p.entradas.pendentes.total === 0 && p.items.internas.some((i) => i.id === 'rg');
  return { ok, detail: JSON.stringify({ ent: p.entradas, internas: p.items.internas }) };
}, 'resgate legado de cofrinho é movimento interno, nunca renda');
await check('PCP_EXTRA_CANCELLED_EXCLUDED', async () => {
  await loadState(baseSyntheticState({ receitas: [unico('x', 'Cancelada', 800, '2026-09-10', { estado: 'cancelado' })] }));
  const p = await proj(9, 2026);
  const ok = p.entradas.pendentes.total === 0 && p.pendenciasSemData.length === 0;
  return { ok, detail: JSON.stringify(p.entradas.pendentes) };
}, 'receita cancelada não entra em nada');
await check('PCP_EXTRA_NATURE_FORM', async () => {
  await loadState(baseSyntheticState());
  const r = await page.evaluate(() => {
    currentMonth = 9; currentYear = 2026; navigate('receitas');
    document.getElementById('recTipo').value = 'outro'; onRecTipoChange();
    document.getElementById('recNome').value = 'Reembolso plano de saúde';
    document.getElementById('recValor').value = '120';
    document.getElementById('recDataPrevista').value = '2026-09-20';
    document.getElementById('recNatureza').value = 'reimbursement';
    addReceita();
    const a = state.receitas[state.receitas.length - 1];
    document.getElementById('recTipo').value = 'outro'; onRecTipoChange();
    document.getElementById('recNome').value = 'Salário da esposa';
    document.getElementById('recValor').value = '90';
    document.getElementById('recDataPrevista').value = '2026-09-20';
    addReceita();
    const b = state.receitas[state.receitas.length - 1];
    openEditReceita(b.id);
    document.getElementById('eRecNatureza2').value = 'other';
    saveEditReceitaNovoModelo(b.id);
    openEditReceita(a.id);
    document.getElementById('eRecNatureza2').value = '';
    saveEditReceitaNovoModelo(a.id);
    return { a: a.incomeNature ?? null, b: b.incomeNature ?? null, opts: [...document.getElementById('recNatureza').options].map((o) => o.value) };
  });
  const ok = r.b === 'other' && r.a === null && JSON.stringify(r.opts) === JSON.stringify(['', 'salary', 'office_personal_transfer', 'reimbursement', 'other']);
  return { ok, detail: JSON.stringify(r) };
}, 'natureza escolhida explicitamente na criação/edição; vazio remove a classificação; nome não classifica');
await check('PCP_EXTRA_OFFICE_GENERATION_NATURE', async () => {
  const src = await page.evaluate(() => document.documentElement.outerHTML);
  const n = (src.match(/origem:'office_distribution', officeTransferId, incomeNature:'office_personal_transfer'/g) || []).length;
  return { ok: n === 2, detail: `pontos de geração com incomeNature=${n}` };
}, 'as duas gerações estruturadas de repasse pessoal gravam a natureza automaticamente');

// ── 51. Console ───────────────────────────────────────────────────────────
await check('PCP_51_NO_SCRIPT_ERRORS', async () => ({ ok: consoleErrors.length === 0, detail: JSON.stringify(consoleErrors) }), 'nenhum erro de console');

} finally {
  await close();
}

const fails = results.filter((r) => r.status === 'FAIL').length;
console.log(`personal-cash-projection-scenarios: TOTAL=${results.length} PASS=${results.length - fails} FAIL=${fails}`);
if (fails > 0) process.exitCode = 1;

export { results };
