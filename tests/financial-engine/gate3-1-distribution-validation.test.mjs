// Gate 3.1 — seção 9-17: integridade matemática das regras de distribuição.
// Enquanto incompletas (algum destino ainda null), configured=false e nenhum
// repasse é gerado — igual ao Gate 3. NOVO neste gate: quando TODOS os
// destinos estão preenchidos, a soma tem que ser EXATAMENTE 100 — nunca
// normalizada automaticamente, nunca um percentual fora de [0,100] aceito.
import { openHarness, makeRunner, baseSyntheticState } from './harness.mjs';

const { page, loadState, close } = await openHarness();
const { check, results } = makeRunner('gate3-1-distribution-validation');

await loadState(baseSyntheticState());

// OD01 — 20+15+65=100 → válido.
await check('OD01', async () => {
  const r = await page.evaluate(() => validateOfficeDistributionRules([
    { destino: 'reserva', percentual: 20 }, { destino: 'impostos', percentual: 15 }, { destino: 'repasse_pessoal', percentual: 65 },
  ]));
  const ok = r.valid === true && r.configured === true && r.totalPercent === 100;
  return { ok, detail: JSON.stringify(r) };
}, '20 + 15 + 65 = 100 → PASS (válida e configurada)');

// OD02 — 0+20+80=100 → válido (zero é um percentual válido).
await check('OD02', async () => {
  const r = await page.evaluate(() => validateOfficeDistributionRules([
    { destino: 'reserva', percentual: 0 }, { destino: 'impostos', percentual: 20 }, { destino: 'repasse_pessoal', percentual: 80 },
  ]));
  const ok = r.valid === true && r.configured === true && r.totalPercent === 100;
  return { ok, detail: JSON.stringify(r) };
}, '0 + 20 + 80 = 100 → PASS (zero é um percentual válido, não é "incompleto")');

// OD03 — 60+60+60=180 → inválido (soma > 100).
await check('OD03', async () => {
  const r = await page.evaluate(() => validateOfficeDistributionRules([
    { destino: 'reserva', percentual: 60 }, { destino: 'impostos', percentual: 60 }, { destino: 'repasse_pessoal', percentual: 60 },
  ]));
  const ok = r.valid === false && r.totalPercent === 180 && r.reason === 'total_diferente_de_100';
  return { ok, detail: JSON.stringify(r) };
}, '60 + 60 + 60 = 180 → FAIL VALIDATION (soma > 100)');

// OD04 — 20+15+50=85 → inválido (soma < 100).
await check('OD04', async () => {
  const r = await page.evaluate(() => validateOfficeDistributionRules([
    { destino: 'reserva', percentual: 20 }, { destino: 'impostos', percentual: 15 }, { destino: 'repasse_pessoal', percentual: 50 },
  ]));
  const ok = r.valid === false && r.totalPercent === 85 && r.reason === 'total_diferente_de_100';
  return { ok, detail: JSON.stringify(r) };
}, '20 + 15 + 50 = 85 → FAIL VALIDATION (soma < 100)');

// OD05 — null+null+null → configured=false, nenhum repasse gerado.
await check('OD05', async () => {
  const r = await page.evaluate(() => validateOfficeDistributionRules([
    { destino: 'reserva', percentual: null }, { destino: 'impostos', percentual: null }, { destino: 'repasse_pessoal', percentual: null },
  ]));
  const ok = r.valid === true && r.configured === false;
  return { ok, detail: JSON.stringify(r) };
}, 'null + null + null → configured=false (estado inicial, nenhum repasse gerado)');

// OD06 — 20+null+80 → configured=false, nenhum repasse gerado (mesmo a soma dos preenchidos já sendo 100).
await check('OD06', async () => {
  const r = await page.evaluate(() => validateOfficeDistributionRules([
    { destino: 'reserva', percentual: 20 }, { destino: 'impostos', percentual: null }, { destino: 'repasse_pessoal', percentual: 80 },
  ]));
  const ok = r.valid === true && r.configured === false;
  return { ok, detail: JSON.stringify(r) };
}, '20 + null + 80 → configured=false (falta um destino, mesmo os preenchidos somando 100) — nenhum repasse gerado');

// OD07 — -10+20+90 → inválido (percentual negativo).
await check('OD07', async () => {
  const r = await page.evaluate(() => validateOfficeDistributionRules([
    { destino: 'reserva', percentual: -10 }, { destino: 'impostos', percentual: 20 }, { destino: 'repasse_pessoal', percentual: 90 },
  ]));
  const ok = r.valid === false && r.reason === 'percentual_fora_do_intervalo';
  return { ok, detail: JSON.stringify(r) };
}, '-10 + 20 + 90 → FAIL VALIDATION (percentual negativo, mesmo a soma sendo 100)');

// OD08 — 110+0+0 → inválido (percentual > 100).
await check('OD08', async () => {
  const r = await page.evaluate(() => validateOfficeDistributionRules([
    { destino: 'reserva', percentual: 110 }, { destino: 'impostos', percentual: 0 }, { destino: 'repasse_pessoal', percentual: 0 },
  ]));
  const ok = r.valid === false && r.reason === 'percentual_fora_do_intervalo';
  return { ok, detail: JSON.stringify(r) };
}, '110 + 0 + 0 → FAIL VALIDATION (percentual > 100)');

// Extras: NaN e Infinity — nunca aceitos.
await check('OD-nan-infinity', async () => {
  const r = await page.evaluate(() => ({
    comNaN: validateOfficeDistributionRules([{ destino: 'reserva', percentual: NaN }, { destino: 'impostos', percentual: 20 }, { destino: 'repasse_pessoal', percentual: 80 }]),
    comInfinity: validateOfficeDistributionRules([{ destino: 'reserva', percentual: Infinity }, { destino: 'impostos', percentual: 20 }, { destino: 'repasse_pessoal', percentual: 80 }]),
  }));
  const ok = r.comNaN.valid === false && r.comInfinity.valid === false;
  return { ok, detail: JSON.stringify(r) };
}, 'NaN e Infinity nunca são aceitos como percentual válido');

// ---------------------------------------------------------------------------
// OD09/OD10 — comportamento via UI (saveOfficeRegrasDistribuicao): uma
// tentativa inválida não altera a configuração anterior nem os repasses já
// derivados dela.
// ---------------------------------------------------------------------------
await loadState(baseSyntheticState({ contas: [{ id: 'c1', name: 'C1', color: '#000', saldoInicial: 500 }] }));
await page.evaluate(() => {
  state.office.contas.push({ id: 'oc1', name: 'OC1', color: '#111', saldoInicial: 0 });
  state.office.projetos.push({ id: 'p1', nome: 'P1', cliente: 'C', valorContrato: 5000, status: 'contratado', dataContrato: '2026-09-01', observacao: '', createdAt: 'p1' });
  // Configuração válida inicial, salva através da própria função de UI
  // (renderOfficeConfigTab escreve os inputs regraPercentual_0/1/2 no DOM,
  // independente de qual página/aba está "ativa" visualmente).
  renderOfficeConfigTab();
  document.getElementById('regraPercentual_0').value = '20'; // reserva
  document.getElementById('regraPercentual_1').value = '15'; // impostos
  document.getElementById('regraPercentual_2').value = '65'; // repasse_pessoal
  saveOfficeRegrasDistribuicao();
  state.office.recebiveis.push({ id: 'rec1', projetoId: 'p1', descricao: 'Entrada', valor: 4000, estado: 'previsto', dataPrevista: '2026-10-01', dataRecebimento: null, contaDestino: 'oc1', createdAt: 'rec1' });
  syncDerivedPersonalTransfer('rec1');
});

await check('OD09', async () => {
  const r = await page.evaluate(() => {
    // Tentativa inválida: soma 180.
    document.getElementById('regraPercentual_0').value = '60';
    document.getElementById('regraPercentual_1').value = '60';
    document.getElementById('regraPercentual_2').value = '60';
    saveOfficeRegrasDistribuicao();
    const regras = state.office.regrasDistribuicao;
    return {
      reserva: regras.find((x) => x.destino === 'reserva').percentual,
      impostos: regras.find((x) => x.destino === 'impostos').percentual,
      repasse_pessoal: regras.find((x) => x.destino === 'repasse_pessoal').percentual,
    };
  });
  const ok = r.reserva === 20 && r.impostos === 15 && r.repasse_pessoal === 65;
  return { ok, detail: `tentativa inválida (60+60+60) não alterou a configuração anterior válida — regras=${JSON.stringify(r)} (esp. 20/15/65, exatamente como antes)` };
}, 'tentativa de salvar uma configuração inválida (soma=180) NÃO altera a configuração anterior válida');

await check('OD10', async () => {
  const r = await page.evaluate(() => {
    const repasseAntes = state.office.repasses.find((rp) => rp.recebivelId === 'rec1');
    const valorAntes = repasseAntes.valor;
    const qtdAntes = state.office.repasses.filter((rp) => rp.recebivelId === 'rec1').length;
    // Repetir a mesma tentativa inválida (o formulário já está com 60/60/60 da checagem anterior).
    saveOfficeRegrasDistribuicao();
    const repasseDepois = state.office.repasses.find((rp) => rp.recebivelId === 'rec1');
    const qtdDepois = state.office.repasses.filter((rp) => rp.recebivelId === 'rec1').length;
    return { valorAntes, valorDepois: repasseDepois.valor, qtdAntes, qtdDepois };
  });
  const ok = r.valorAntes === r.valorDepois && r.qtdAntes === 1 && r.qtdDepois === 1;
  return { ok, detail: `tentativa inválida não alterou o repasse previsto já existente — valor antes=${r.valorAntes}, depois=${r.valorDepois} (esp. iguais), qtd=${r.qtdDepois} (esp. 1, nunca duplicado)` };
}, 'tentativa de salvar uma configuração inválida NÃO altera nenhum repasse previsto já derivado');

await close();

const fails = results.filter((r) => r.status === 'FAIL').length;
console.log(`\ngate3-1-distribution-validation.test.mjs: TOTAL=${results.length} PASS=${results.length - fails} FAIL=${fails}`);
if (fails > 0) process.exitCode = 1;

export { results };
