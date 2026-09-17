// Gate 3 — seção 41/42: separação patrimonial pessoa física × escritório
// (O01-O04) e semântica de recebíveis (OR01-OR05).
import { openHarness, makeRunner, baseSyntheticState } from './harness.mjs';

const { page, loadState, close } = await openHarness();
const { check, results } = makeRunner('gate3-separation');

// O01/O02 — saldo do escritório NUNCA contamina o saldo pessoal, e vice-versa.
await check('O01', async () => {
  await loadState(baseSyntheticState({ contas: [{ id: 'c1', name: 'Conta 1', color: '#5b7fff', saldoInicial: 1000 }] }));
  const r = await page.evaluate(() => {
    state.office.contas.push({ id: 'oc1', name: 'Conta Escritório', color: '#ff9900', saldoInicial: 5000 });
    const disponivelPessoal = state.contas.reduce((s, c) => s + calcSaldoConta(c.id), 0);
    const saldoEscritorio = getOfficeOperationalBalance();
    return { disponivelPessoal, saldoEscritorio };
  });
  const ok = r.disponivelPessoal === 1000 && r.saldoEscritorio === 5000;
  return { ok, detail: `disponível pessoal=${r.disponivelPessoal} (esp. 1000), saldo escritório=${r.saldoEscritorio} (esp. 5000) — nunca somados` };
}, 'pessoal=1000, escritório=5000: disponível pessoal continua 1000, nunca 6000 nem 9000');

await check('O02', async () => {
  const r = await page.evaluate(() => {
    // Movimenta o caixa do escritório (despesa) — saldo pessoal não deve mudar.
    const antes = state.contas.reduce((s, c) => s + calcSaldoConta(c.id), 0);
    state.office.despesas.push({ id: 'od1', descricao: 'Software', categoria: 'Software', valor: 500, data: '2026-09-05', conta: 'oc1', projetoId: null, status: 'pago', createdAt: 'od1' });
    const depois = state.contas.reduce((s, c) => s + calcSaldoConta(c.id), 0);
    return { antes, depois, saldoEscritorioDepois: getOfficeOperationalBalance() };
  });
  const ok = r.antes === r.depois && r.depois === 1000 && r.saldoEscritorioDepois === 4500;
  return { ok, detail: `saldo pessoal antes=${r.antes}, depois de uma despesa do escritório=${r.depois} (esp. iguais, 1000); saldo escritório=${r.saldoEscritorioDepois} (esp. 4500)` };
}, 'uma despesa do escritório reduz o saldo do escritório, nunca o saldo pessoal');

await check('O03', async () => {
  const r = await page.evaluate(() => {
    state.cofrinhos.push({ id: 'cof1', name: 'Reserva Pessoal', color: '#38e2b4', saldoInicial: 2000 });
    const saldoEscritorioAntes = getOfficeOperationalBalance();
    return { saldoEscritorioAntes };
  });
  const ok = r.saldoEscritorioAntes === 4500;
  return { ok, detail: `cofrinho pessoal (2000) cadastrado; saldo operacional do escritório continua ${r.saldoEscritorioAntes} (esp. 4500, inalterado)` };
}, 'cofrinho pessoal não altera o caixa operacional do escritório');

await check('O04', async () => {
  const r = await page.evaluate(() => {
    state.office.reservas.push({ id: 'or1', nome: 'Reserva de Impostos', finalidade: 'impostos', color: '#5b7fff', saldoInicial: 1000 });
    const saldoPessoal = state.contas.reduce((s, c) => s + calcSaldoConta(c.id), 0);
    return { saldoPessoal };
  });
  const ok = r.saldoPessoal === 1000;
  return { ok, detail: `reserva empresarial (1000) cadastrada; saldo pessoal continua ${r.saldoPessoal} (esp. 1000, inalterado)` };
}, 'reserva empresarial não altera o caixa pessoal');

// ---------------------------------------------------------------------------
// Recebíveis (OR01-OR05)
// ---------------------------------------------------------------------------
await check('OR01', async () => {
  await loadState(baseSyntheticState());
  const r = await page.evaluate(() => {
    state.office.contas.push({ id: 'oc1', name: 'Conta Escritório', color: '#ff9900', saldoInicial: 0 });
    state.office.recebiveis.push({ id: 'rec1', projetoId: null, descricao: 'Entrada', valor: 2000, estado: 'previsto', dataPrevista: '2026-09-25', dataRecebimento: null, contaDestino: 'oc1', createdAt: 'rec1' });
    return { saldo: calcSaldoOfficeConta('oc1'), operacional: getOfficeOperationalBalance() };
  });
  const ok = r.saldo === 0 && r.operacional === 0;
  return { ok, detail: `recebível previsto (2000) não entra no caixa real — saldo=${r.saldo}, operacional=${r.operacional} (esp. 0 nos dois)` };
}, 'recebível previsto não entra no caixa real do escritório');

await check('OR02', async () => {
  const r = await page.evaluate(() => {
    const rec = state.office.recebiveis.find((x) => x.id === 'rec1');
    rec.estado = 'recebido'; rec.dataRecebimento = '2026-09-25';
    return { saldo: calcSaldoOfficeConta('oc1') };
  });
  const ok = r.saldo === 2000;
  return { ok, detail: `recebível marcado recebido na data real (25/09) — saldo=${r.saldo} (esp. 2000)` };
}, 'recebível recebido entra no caixa real na data real');

await check('OR03', async () => {
  const r = await page.evaluate(() => {
    state.office.recebiveis.push({ id: 'rec2', projetoId: null, descricao: 'Parcela 2', valor: 1500, estado: 'recebido', dataPrevista: '2026-09-30', dataRecebimento: '2026-10-03', contaDestino: 'oc1', createdAt: 'rec2' });
    return {
      ate_setembro: calcSaldoOfficeContaAte('oc1', 9, 2026),
      ate_outubro: calcSaldoOfficeContaAte('oc1', 10, 2026),
    };
  });
  const ok = r.ate_setembro === 2000 && r.ate_outubro === 3500;
  return { ok, detail: `previsto p/ setembro, recebido em outubro — até set=${r.ate_setembro} (esp. 2000, sem o rec2), até out=${r.ate_outubro} (esp. 3500, rec2 entra em outubro)` };
}, 'previsto para setembro, recebido em outubro: o impacto de caixa é em outubro (data real), não na previsão');

await check('OR04', async () => {
  const r = await page.evaluate(() => {
    const antes = calcSaldoOfficeConta('oc1');
    const rec = state.office.recebiveis.find((x) => x.id === 'rec2');
    // "Recebimento" repetido (idempotência simples: reafirmar o mesmo estado/data não duplica, pois calcSaldoOfficeConta soma cada recebível uma vez, nunca por evento de toggle).
    rec.estado = 'recebido'; rec.dataRecebimento = '2026-10-03';
    const depois = calcSaldoOfficeConta('oc1');
    return { antes, depois, qtdRecebiveis: state.office.recebiveis.length };
  });
  const ok = r.antes === r.depois && r.qtdRecebiveis === 2;
  return { ok, detail: `reafirmar o mesmo recebimento não duplica — antes=${r.antes}, depois=${r.depois} (esp. iguais), qtd recebíveis=${r.qtdRecebiveis} (esp. 2)` };
}, 'recebimento não duplica o recebível nem o valor contado');

await check('OR05', async () => {
  const r = await page.evaluate(() => {
    const antes = calcSaldoOfficeConta('oc1');
    state.office.recebiveis.push({ id: 'rec3', projetoId: null, descricao: 'Cancelada', valor: 999, estado: 'cancelado', dataPrevista: '2026-09-01', dataRecebimento: null, contaDestino: 'oc1', createdAt: 'rec3' });
    const depois = calcSaldoOfficeConta('oc1');
    return { antes, depois };
  });
  const ok = r.antes === r.depois;
  return { ok, detail: `recebível cancelado (999) não altera o saldo — antes=${r.antes}, depois=${r.depois} (esp. iguais)` };
}, 'recebível cancelado nunca entra no caixa');

await close();

const fails = results.filter((r) => r.status === 'FAIL').length;
console.log(`\ngate3-separation.test.mjs: TOTAL=${results.length} PASS=${results.length - fails} FAIL=${fails}`);
if (fails > 0) process.exitCode = 1;

export { results };
