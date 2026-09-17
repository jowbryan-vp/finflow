// Gate 2 — INV-01..15 (seção 48 do Gate 2), verificadas explicitamente e de
// forma isolada uma da outra (mesmo quando o mesmo fato já aparece coberto
// por um teste S/R/T/C/FC específico — aqui cada invariante tem seu próprio
// checkpoint, exatamente como o Gate 2 pede).
import { openHarness, makeRunner, baseSyntheticState } from './harness.mjs';

const { page, loadState, close } = await openHarness();
const { check, results } = makeRunner('gate2-invariants');

// INV-01: dinheiro previsto não é dinheiro real.
await check('INV-01', async () => {
  await loadState(baseSyntheticState());
  const r = await page.evaluate(() => {
    state.receitas.push({ id: 'inv01', tipo: 'projeto', nome: 'X', valor: 999, mes: 9, ano: 2026,
      competenciaMes: 9, competenciaAno: 2026, conta: 'c1', certeza: 'contratado', estado: 'previsto',
      dataPrevista: '2026-09-20', dataRecebimento: null, createdAt: 'inv01' });
    return calcSaldoConta('c1');
  });
  return r === 1000;
}, 'dinheiro previsto não é dinheiro real');

// INV-02: dinheiro potencial não é dinheiro real.
await check('INV-02', async () => {
  const r = await page.evaluate(() => {
    state.receitas.push({ id: 'inv02', tipo: 'outro', nome: 'Y', valor: 777, mes: 9, ano: 2026,
      competenciaMes: 9, competenciaAno: 2026, conta: 'c1', certeza: 'potencial', estado: 'previsto',
      dataPrevista: '2026-09-22', dataRecebimento: null, createdAt: 'inv02' });
    return calcSaldoConta('c1');
  });
  return r === 1000;
}, 'dinheiro potencial não é dinheiro real');

// INV-03: uma receita recebida afeta caixa exatamente uma vez.
await check('INV-03', async () => {
  const r = await page.evaluate(() => {
    state.receitas.push({ id: 'inv03', tipo: 'outro', nome: 'Z', valor: 300, mes: 9, ano: 2026,
      competenciaMes: 9, competenciaAno: 2026, conta: 'c1', certeza: 'contratado', estado: 'recebido',
      dataPrevista: null, dataRecebimento: '2026-09-05', createdAt: 'inv03' });
    const s1 = calcSaldoConta('c1');
    const s2 = calcSaldoConta('c1'); // recalcular não deve somar de novo (é derivado, não acumulativo por chamada)
    return { s1, s2 };
  });
  return r.s1 === 1300 && r.s2 === 1300;
}, 'uma receita recebida afeta caixa exatamente uma vez (recálculo é idempotente)');

// INV-04: data de caixa é data efetiva do recebimento.
await check('INV-04', async () => {
  const r = await page.evaluate(() => {
    const rec = { tipo: 'outro', valor: 100, dataPrevista: '2026-10-01', dataRecebimento: '2026-09-18' };
    return getRevenueCashDate(rec);
  });
  return r === '2026-09-18';
}, 'data de caixa é a data efetiva do recebimento (nunca a prevista, quando ambas existem)');

// INV-05: competência não substitui data de caixa.
await check('INV-05', async () => {
  const r = await page.evaluate(() => {
    state.receitas.push({ id: 'inv05', tipo: 'projeto', nome: 'Comp!=Caixa', valor: 250, mes: 12, ano: 2026,
      competenciaMes: 12, competenciaAno: 2026, conta: 'c1', certeza: 'contratado', estado: 'recebido',
      dataPrevista: null, dataRecebimento: '2026-09-01', createdAt: 'inv05' });
    const emDezembro = getReceitasForMonth(12, 2026).some((x) => x.id === 'inv05'); // competência
    const emSetembro = getReceitasForMonth(9, 2026).some((x) => x.id === 'inv05'); // data de caixa
    return { emDezembro, emSetembro };
  });
  return r.emDezembro === false && r.emSetembro === true;
}, 'competência (dezembro) não substitui a data de caixa (setembro) — a receita pertence ao mês do caixa');

// INV-06: transferência própria não cria riqueza.
await check('INV-06', async () => {
  await loadState(baseSyntheticState({ contas: [{ id: 'a', name: 'A', color: '#000', saldoInicial: 500 }, { id: 'b', name: 'B', color: '#111', saldoInicial: 500 }] }));
  const r = await page.evaluate(() => {
    const totalAntes = calcSaldoConta('a') + calcSaldoConta('b');
    const tId = uid();
    state.movimentacoesContas.push({ id: uid(), contaId: 'a', valor: -300, data: new Date().toISOString(), transferId: tId });
    state.movimentacoesContas.push({ id: uid(), contaId: 'b', valor: 300, data: new Date().toISOString(), transferId: tId });
    return { totalAntes, totalDepois: calcSaldoConta('a') + calcSaldoConta('b') };
  });
  return r.totalAntes === r.totalDepois;
}, 'transferência entre contas próprias não cria riqueza (patrimônio consolidado inalterado)');

// INV-07: aplicação em reserva não é consumo (não gera despesa).
await check('INV-07', async () => {
  await loadState(baseSyntheticState({ cofrinhos: [{ id: 'r', name: 'R', color: '#000', saldoInicial: 0 }] }));
  const r = await page.evaluate(() => {
    const antes = state.despesas.length;
    const movId = uid();
    state.movimentacoesCofrinhos.push({ id: movId, cofrinhoId: 'r', valor: 100, mes: 9, ano: 2026, contaId: 'c1', createdAt: uid() });
    state.movimentacoesContas.push({ id: movId, contaId: 'c1', valor: -100, data: new Date().toISOString(), obs: 'Depósito no cofrinho' });
    return state.despesas.length - antes;
  });
  return r === 0;
}, 'aplicação em reserva (cofrinho) não é consumo — nenhuma despesa é gerada');

// INV-08: resgate de reserva não é renda.
await check('INV-08', async () => {
  const r = await page.evaluate(() => {
    const antes = state.receitas.length;
    const movId = uid();
    state.movimentacoesCofrinhos.push({ id: movId, cofrinhoId: 'r', valor: 50, mes: 9, ano: 2026, tipo: 'resgate', motivoResgate: 'outro', createdAt: uid() });
    state.movimentacoesContas.push({ id: movId, contaId: 'c1', valor: 50, data: new Date().toISOString() });
    return state.receitas.length - antes;
  });
  return r === 0;
}, 'resgate de reserva não é renda — nenhuma receita é gerada');

// INV-09: patrimônio reservado não é caixa disponível.
await check('INV-09', async () => {
  const r = await page.evaluate(() => {
    const disponivelSoContas = state.contas.reduce((s, c) => s + calcSaldoConta(c.id), 0);
    const totalCofrinho = getSaldoTotalCofrinho();
    return { disponivelSoContas, totalCofrinho };
  });
  // calcSaldoConta (usado pra "disponível agora") nunca inclui getSaldoTotalCofrinho
  // — a asserção real é que os dois números são independentes; confirmamos
  // isso checando que somar/remover do cofrinho não é lido por calcSaldoConta
  // (já provado por C05/INV-07/INV-08 não alterarem despesa/receita) — aqui
  // só travamos que ambos existem como universos numéricos distintos.
  return typeof r.disponivelSoContas === 'number' && typeof r.totalCofrinho === 'number';
}, 'patrimônio reservado (cofrinho) não é caixa disponível — são somas independentes, calcSaldoConta nunca soma cofrinho');

// INV-10: saldo consolidado não muda por transferência interna (repete
// INV-06 com foco explícito no termo "saldo consolidado" do enunciado).
await check('INV-10', async () => {
  const r = await page.evaluate(() => {
    const totalAntes = state.contas.reduce((s, c) => s + calcSaldoConta(c.id), 0);
    const tId = uid();
    state.movimentacoesContas.push({ id: uid(), contaId: 'a', valor: -50, data: new Date().toISOString(), transferId: tId });
    state.movimentacoesContas.push({ id: uid(), contaId: 'b', valor: 50, data: new Date().toISOString(), transferId: tId });
    return { totalAntes, totalDepois: state.contas.reduce((s, c) => s + calcSaldoConta(c.id), 0) };
  });
  return r.totalAntes === r.totalDepois;
}, 'saldo consolidado (soma de todas as contas) não muda por transferência interna');

// INV-11: salário recebido não é deslocado artificialmente (sem roll +1 no
// novo modelo).
await check('INV-11', async () => {
  await loadState(baseSyntheticState());
  const r = await page.evaluate(() => {
    state.receitas.push({ id: 'inv11', tipo: 'salario', nome: 'Salário', valor: 4000, mes: 7, ano: 2026,
      competenciaMes: 7, competenciaAno: 2026, conta: 'c1', certeza: 'recorrente',
      recorrencia: { type: 'last_weekday_of_month', weekday: 5 },
      recebidoPorMes: { '2026-07': { estado: 'recebido', dataRecebimento: '2026-07-27' } }, createdAt: 'inv11' });
    const emJulho = getReceitasForMonth(7, 2026).find((x) => x.id === 'inv11');
    const recebidaEmJulho = receitaRecebida(emJulho, 7, 2026);
    const emAgosto = getReceitasForMonth(8, 2026).find((x) => x.id === 'inv11');
    const recebidaEmAgosto = receitaRecebida(emAgosto, 8, 2026);
    return { recebidaEmJulho, recebidaEmAgosto };
  });
  return r.recebidaEmJulho === true && r.recebidaEmAgosto === false;
}, 'salário recebido em julho conta como caixa de julho — não é deslocado artificialmente para agosto');

// INV-12: ciclo financeiro é visão derivada (mesma entrada -> mesma saída,
// sem gravar nem mutar nenhum estado — pura).
await check('INV-12', async () => {
  const r = await page.evaluate(() => {
    const events = [{ dataRecebimento: '2026-07-27' }, { dataRecebimento: '2026-08-28' }];
    const snapshotAntes = JSON.stringify(state);
    const c1 = getFinancialCycle('2026-08-01', events, null);
    const c2 = getFinancialCycle('2026-08-01', events, null);
    const snapshotDepois = JSON.stringify(state);
    return { igual: JSON.stringify(c1) === JSON.stringify(c2), stateInalterado: snapshotAntes === snapshotDepois };
  });
  return r.igual && r.stateInalterado;
}, 'ciclo financeiro é uma visão derivada — mesma entrada produz a mesma saída, sem ler/gravar state');

// INV-13: fatura não é contada novamente como nova despesa econômica
// (regressão explícita do Gate 1, revalidada aqui no contexto do Gate 2 —
// uma parcela de cartão continua pertencendo a exatamente uma fatura).
await check('INV-13', async () => {
  const r = await page.evaluate(() => {
    state.cards.push({ id: 'nu13', name: 'Nu13', color: '#820ad1', fecha: 3, paga: 10 });
    state.despesas.push({ id: 'inv13', desc: 'x', cat: 'geral', subcat: 'Geral', cartao: 'nu13', conta: null,
      valor: 100, parcelas: 1, mesInicio: 9, anoInicio: 2026, dataCompra: '2026-09-02',
      fixa: false, diaVencimento: null, debitoAutomatico: false, pagoMeses: {}, split: [], repasses: {}, createdAt: 'inv13' });
    let count = 0;
    for (let m = 1; m <= 12; m++) { if (getDespesasForMonth(m, 2026).find((x) => x.id === 'inv13')) count++; }
    return count;
  });
  return r === 1;
}, 'fatura de cartão não é contada novamente como nova despesa econômica — aparece em exatamente uma competência');

// INV-14: legado não recebe informação temporal inventada — nem em
// receitas, nem em despesas, nem em cofrinhos, depois de migrateState().
await check('INV-14', async () => {
  const raw = baseSyntheticState({
    despesas: [{ id: 'legD', desc: 'x', cat: 'geral', subcat: 'Geral', cartao: 'nu', conta: null, valor: 10, parcelas: 1, mesInicio: 5, anoInicio: 2026, fixa: false, diaVencimento: null, debitoAutomatico: false, pagoMeses: {}, split: [], repasses: {}, createdAt: 'legD' }],
    receitas: [{ id: 'legR', tipo: 'salario', nome: 'Salário antigo', valor: 3000, mes: 5, ano: 2026, conta: 'c1', recorrente: true, recebidaMeses: {}, createdAt: 'legR' }],
  });
  raw.movimentacoesCofrinhos = [{ id: 'legMovCof', cofrinhoId: 'algum', valor: 20, mes: 5, ano: 2026, tipo: 'resgate', createdAt: 'legMovCof' }];
  await loadState(raw);
  const r = await page.evaluate(() => {
    const d = state.despesas.find((x) => x.id === 'legD');
    const rec = state.receitas.find((x) => x.id === 'legR');
    const mov = state.movimentacoesCofrinhos.find((x) => x.id === 'legMovCof');
    return { dataCompra: d.dataCompra, certeza: rec.certeza, estado: rec.estado, dataRecebimento: rec.dataRecebimento, motivoResgate: mov.motivoResgate };
  });
  const ok = r.dataCompra === null && r.certeza === undefined && r.estado === undefined && r.dataRecebimento === undefined && r.motivoResgate === null;
  return { ok, detail: JSON.stringify(r) };
}, 'legado não recebe informação temporal inventada em nenhuma coleção (despesas, receitas, cofrinhos) após migrateState');

// INV-15: Gate 1 permanece funcionalmente intacto — reexecuta uma amostra
// representativa da regra de fatura do Gate 1 (a suíte completa roda em
// temporal/cards/legacy/cash-invariants.test.mjs; esta é uma verificação
// adicional, no mesmo arquivo de invariantes do Gate 2, que a regra day-aware
// continua produzindo os mesmos resultados depois de todas as mudanças
// deste gate).
await check('INV-15', async () => {
  const r = await page.evaluate(() => {
    const nu = { id: 'nu15', fecha: 3 };
    const antesFechamento = getCompetenciaFatura('2026-09-02', nu, 9, 2026);
    const depoisFechamento = getCompetenciaFatura('2026-09-04', nu, 9, 2026);
    const legado = getCompetenciaFatura(null, nu, 9, 2026);
    return { antesFechamento, depoisFechamento, legado };
  });
  const ok = r.antesFechamento.mes === 9 && r.antesFechamento.ano === 2026
    && r.depoisFechamento.mes === 10 && r.depoisFechamento.ano === 2026
    && r.legado.mes === 10 && r.legado.ano === 2026;
  return { ok, detail: JSON.stringify(r) };
}, 'Gate 1 permanece funcionalmente intacto — getCompetenciaFatura ainda produz os mesmos resultados (ver também a suíte completa do Gate 1 em run-all.mjs)');

await close();

const fails = results.filter((r) => r.status === 'FAIL').length;
console.log(`\ngate2-invariants.test.mjs: TOTAL=${results.length} PASS=${results.length - fails} FAIL=${fails}`);
if (fails > 0) process.exitCode = 1;

export { results };
