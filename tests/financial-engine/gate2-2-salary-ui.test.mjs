// Gate 2.2 (seção 15/16/27) — confirmação de recebimento de salário com data
// real editável (SALARY_RECEIPT_UI_01..06).
//
// Motivo: toggleReceitaRecebida() gravava a data de hoje automaticamente ao
// marcar 'previsto → recebido', mesmo para lançamentos retroativos (usuário
// confirmando HOJE um salário que entrou há semanas). Isso violava a mesma
// regra absoluta de caixa (seção 8) que o Gate 2.1 já protegia no motor —
// só que aqui o problema era na UI, não no motor. Agora toggleReceitaRecebida
// abre openConfirmarReceitaRecebidaModal (que sugere hoje, mas é editável)
// e só grava via confirmarReceitaRecebidaComData, que valida a data com
// isValidISODateString antes de tocar em qualquer estado. O caminho de
// DESMARCAR (recebido → previsto) continua instantâneo, sem modal (seção 16)
// — testado aqui em SALARY_RECEIPT_UI_06 (não duplica ocorrência).
import { openHarness, makeRunner, baseSyntheticState } from './harness.mjs';

const { page, loadState, close } = await openHarness();
const { check, results } = makeRunner('gate2-2-salary-ui');

function pushSalario(competenciaMes, competenciaAno) {
  return page.evaluate(({ competenciaMes, competenciaAno }) => {
    state.receitas.push({
      id: 'sal', tipo: 'salario', nome: 'Salário', valor: 5000, mes: competenciaMes, ano: competenciaAno,
      competenciaMes, competenciaAno, conta: 'c1', certeza: 'recorrente',
      recorrencia: { type: 'last_weekday_of_month', weekday: 5 },
      recebidoPorMes: {}, createdAt: 'sal',
    });
  }, { competenciaMes, competenciaAno });
}

// SALARY_RECEIPT_UI_01 — confirma com a data de hoje (o default sugerido
// pelo modal, sem o usuário alterar nada).
await check('SALARY_RECEIPT_UI_01', async () => {
  await loadState(baseSyntheticState());
  await pushSalario(9, 2026);
  const r = await page.evaluate(() => {
    currentMonth = 9; currentYear = 2026;
    toggleReceitaRecebida('sal'); // previsto -> abre modal (não grava nada ainda)
    const hoje = new Date();
    const hojeISO = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
    const inputValueAntesDeConfirmar = document.getElementById('confRecDataRecebimento').value;
    confirmarReceitaRecebidaComData('sal'); // confirma sem alterar o input
    const r2 = state.receitas.find((x) => x.id === 'sal');
    return {
      inputValueAntesDeConfirmar, hojeISO,
      dataRecebimento: r2.recebidoPorMes['2026-09'] && r2.recebidoPorMes['2026-09'].dataRecebimento,
      estado: r2.recebidoPorMes['2026-09'] && r2.recebidoPorMes['2026-09'].estado,
    };
  });
  const ok = r.inputValueAntesDeConfirmar === r.hojeISO && r.dataRecebimento === r.hojeISO && r.estado === 'recebido';
  return { ok, detail: `input default=${r.inputValueAntesDeConfirmar} (esp. ${r.hojeISO}), dataRecebimento gravada=${r.dataRecebimento} (esp. ${r.hojeISO}), estado=${r.estado} (esp. recebido)` };
}, 'modal sugere hoje como default; confirmar sem alterar grava a data de hoje como dataRecebimento real');

// SALARY_RECEIPT_UI_02 — confirma com uma data passada (lançamento
// retroativo — seção 15, exemplo literal do gate: hoje != 28/08, usuário
// registra recebimento ocorrido em 28/08).
await check('SALARY_RECEIPT_UI_02', async () => {
  await loadState(baseSyntheticState());
  await pushSalario(9, 2026);
  const r = await page.evaluate(() => {
    currentMonth = 9; currentYear = 2026;
    toggleReceitaRecebida('sal');
    document.getElementById('confRecDataRecebimento').value = '2026-08-28';
    confirmarReceitaRecebidaComData('sal');
    const r2 = state.receitas.find((x) => x.id === 'sal');
    return r2.recebidoPorMes['2026-09'];
  });
  const ok = r && r.estado === 'recebido' && r.dataRecebimento === '2026-08-28';
  return { ok, detail: `recebidoPorMes['2026-09']=${JSON.stringify(r)} (esp. estado:'recebido', dataRecebimento:'2026-08-28' — data retroativa, nunca a data de hoje)` };
}, 'usuário pode informar uma data passada ao confirmar (nunca é forçado a aceitar a data de hoje)');

// SALARY_RECEIPT_UI_03 — confirma com uma data de mês diferente da
// competência (a mesma divergência competência×caixa do resto do Gate 2.2,
// agora entrando pela UI em vez de um fixture pré-gravado).
await check('SALARY_RECEIPT_UI_03', async () => {
  await loadState(baseSyntheticState());
  await pushSalario(9, 2026);
  const r = await page.evaluate(() => {
    currentMonth = 9; currentYear = 2026;
    toggleReceitaRecebida('sal');
    document.getElementById('confRecDataRecebimento').value = '2026-10-02';
    confirmarReceitaRecebidaComData('sal');
    const r2 = state.receitas.find((x) => x.id === 'sal');
    return {
      recebidoPorMesSetembro: r2.recebidoPorMes['2026-09'],
      cashSetembro: getCashRevenuesForMonth(9, 2026).length,
      cashOutubro: getCashRevenuesForMonth(10, 2026).length,
      qtdReceitas: state.receitas.length,
    };
  });
  const ok = r.recebidoPorMesSetembro && r.recebidoPorMesSetembro.dataRecebimento === '2026-10-02'
    && r.cashSetembro === 0 && r.cashOutubro === 1 && r.qtdReceitas === 1;
  return { ok, detail: `recebidoPorMes['2026-09']=${JSON.stringify(r.recebidoPorMesSetembro)}, cash setembro=${r.cashSetembro} (esp. 0), cash outubro=${r.cashOutubro} (esp. 1), nº receitas=${r.qtdReceitas} (esp. 1, nenhuma segunda ocorrência criada)` };
}, 'confirmar com uma data de outro mês mantém a identidade de competência (setembro) e reflete no caixa do mês real (outubro), sem duplicar');

// SALARY_RECEIPT_UI_04 — data inválida é rejeitada (input vazio/malformado
// nunca produz impacto de caixa — seção 17).
await check('SALARY_RECEIPT_UI_04', async () => {
  await loadState(baseSyntheticState());
  await pushSalario(9, 2026);
  const r = await page.evaluate(() => {
    currentMonth = 9; currentYear = 2026;
    toggleReceitaRecebida('sal');
    // <input type="date"> já normaliza qualquer valor malformado pra string
    // vazia no navegador real — simulado aqui atribuindo '' diretamente, o
    // mesmo estado que confirmarReceitaRecebidaComData precisa rejeitar.
    document.getElementById('confRecDataRecebimento').value = '';
    confirmarReceitaRecebidaComData('sal');
    const r2 = state.receitas.find((x) => x.id === 'sal');
    return { recebidoPorMes: r2.recebidoPorMes, modalAindaAberto: document.getElementById('modalOverlay').classList.contains('open') };
  });
  const ok = Object.keys(r.recebidoPorMes).length === 0 && r.modalAindaAberto === true;
  return { ok, detail: `recebidoPorMes=${JSON.stringify(r.recebidoPorMes)} (esp. {} — nenhuma gravação), modal ainda aberto=${r.modalAindaAberto} (esp. true — confirmarReceitaRecebidaComData rejeita e não fecha o modal, dando ao usuário a chance de corrigir)` };
}, 'data inválida/vazia nunca produz impacto de caixa: rejeitada antes de tocar em qualquer estado, modal permanece aberto');

// SALARY_RECEIPT_UI_05 — cancelar a confirmação não altera nada.
await check('SALARY_RECEIPT_UI_05', async () => {
  await loadState(baseSyntheticState());
  await pushSalario(9, 2026);
  const r = await page.evaluate(() => {
    currentMonth = 9; currentYear = 2026;
    toggleReceitaRecebida('sal');
    document.getElementById('confRecDataRecebimento').value = '2026-09-25';
    closeModal(); // botão "Cancelar" do modal
    const r2 = state.receitas.find((x) => x.id === 'sal');
    return { recebidoPorMes: r2.recebidoPorMes, modalAberto: document.getElementById('modalOverlay').classList.contains('open') };
  });
  const ok = Object.keys(r.recebidoPorMes).length === 0 && r.modalAberto === false;
  return { ok, detail: `recebidoPorMes=${JSON.stringify(r.recebidoPorMes)} (esp. {} — cancelar nunca grava), modal aberto=${r.modalAberto} (esp. false)` };
}, 'cancelar a confirmação (fechar o modal sem confirmar) não altera o estado da receita');

// SALARY_RECEIPT_UI_06 — desmarcar (recebido -> previsto) não cria uma
// segunda ocorrência nem deixa lixo em recebidoPorMes.
await check('SALARY_RECEIPT_UI_06', async () => {
  await loadState(baseSyntheticState());
  await pushSalario(9, 2026);
  const r = await page.evaluate(() => {
    currentMonth = 9; currentYear = 2026;
    toggleReceitaRecebida('sal');
    document.getElementById('confRecDataRecebimento').value = '2026-09-25';
    confirmarReceitaRecebidaComData('sal'); // marca como recebida
    const antes = state.receitas.length;
    toggleReceitaRecebida('sal'); // já recebida -> desmarca direto, sem modal
    const r2 = state.receitas.find((x) => x.id === 'sal');
    return {
      antes, depois: state.receitas.length,
      recebidoPorMesTemChave: Object.prototype.hasOwnProperty.call(r2.recebidoPorMes, '2026-09'),
      modalAbertoDepoisDeDesmarcar: document.getElementById('modalOverlay').classList.contains('open'),
    };
  });
  const ok = r.antes === 1 && r.depois === 1 && r.recebidoPorMesTemChave === false && r.modalAbertoDepoisDeDesmarcar === false;
  return { ok, detail: `nº receitas antes=${r.antes}, depois=${r.depois} (esp. 1 e 1 — nunca cria uma segunda), recebidoPorMes ainda tem a chave 2026-09=${r.recebidoPorMesTemChave} (esp. false — removida, não só zerada), modal abriu ao desmarcar=${r.modalAbertoDepoisDeDesmarcar} (esp. false — desmarcar é instantâneo, sem modal)` };
}, 'desmarcar uma ocorrência recebida remove a chave de recebidoPorMes instantaneamente, sem modal e sem criar uma segunda ocorrência');

await close();

const fails = results.filter((r) => r.status === 'FAIL').length;
console.log(`\ngate2-2-salary-ui.test.mjs: TOTAL=${results.length} PASS=${results.length - fails} FAIL=${fails}`);
if (fails > 0) process.exitCode = 1;

export { results };
