// Gate 5 (UAT) — patch "Saldo que permanece nas contas"
// (docs/gates/CASH-BALANCE-UI.md).
//
// Com contas pessoais cadastradas, getTotalsForMonth() já usa
// calcSaldoConta()/calcSaldoContaAte() como fonte de verdade do saldo —
// state.excedentes não influencia nada nesse caso (ver getTotalsForMonth).
// Antes deste patch, o Dashboard mesmo assim mostrava o bloco "Guardar em
// Caixa" com botão "+ Guardar", sugerindo ao usuário que ele precisava
// declarar de novo dinheiro que já está nas contas. Este teste cobre:
//   1. Com contas: o bloco informativo aparece no lugar do legado, sem
//      botão, com o mesmo valor que alimenta o saldo real (atual/passado)
//      e rotulado como projeção no mês futuro.
//   2. Registros antigos de state.excedentes continuam intactos no estado
//      e no backup, mesmo não sendo mais usados no cálculo com contas.
//   3. O modal/confirmador legado (chamada direta, sem passar pelo botão
//      removido) não abre nem grava state.excedentes nem agenda salvamento
//      enquanto houver contas.
//   4. Sem contas: mecanismo e rótulo legados continuam funcionando
//      exatamente como antes (regressão).
//   5. Trocar de "perfil" (recarregar state com/sem contas) reavalia o
//      bloco sem vazar o saldo do estado anterior.
import { openHarness, makeRunner, baseSyntheticState } from './harness.mjs';

const { page, loadState, close } = await openHarness();
const { check, results } = makeRunner('gate5-cash-balance-ui');

await page.clock.setFixedTime(new Date(2026, 8, 17, 12)); // 17/09/2026, mês real = setembro/2026

try {
await check('CASH_UI_01_LABEL_WITH_ACCOUNTS', async () => {
  await loadState(baseSyntheticState({ excedentes: { '2026-07': 500 } }));
  await page.evaluate(() => { currentMonth = 9; currentYear = 2026; renderDashboard(); });
  const text = await page.locator('#dashExcedentePanel').innerText();
  // "mini-label" tem text-transform:uppercase via CSS — innerText reflete o
  // texto renderizado (maiúsculo), por isso a comparação é case-insensitive.
  const ok = /saldo que permanece nas contas/i.test(text) && !/guardar em caixa/i.test(text) && !text.includes('+ Guardar');
  return { ok, detail: `painel="${text.replace(/\n+/g, ' | ')}" (esp. rótulo informativo presente, "Guardar em Caixa"/"+ Guardar" ausentes)` };
}, 'com contas, o bloco informativo substitui o legado "Guardar em Caixa"');

await check('CASH_UI_02_VALUE_MATCHES_REAL_SOURCE_CURRENT', async () => {
  const r = await page.evaluate(() => {
    currentMonth = 9; currentYear = 2026; renderDashboard();
    const totals = getTotalsForMonth(9, 2026);
    return { shown: document.getElementById('dashExcedentePanel').innerText, expected: fmtBRL(totals.emCaixaDisponivel) };
  });
  const ok = r.shown.includes(r.expected);
  return { ok, detail: `valor mostrado deve conter ${r.expected} (mesma fonte de getTotalsForMonth) — painel="${r.shown.replace(/\n+/g, ' | ')}"` };
}, 'mês atual: valor informativo é exatamente o mesmo que alimenta o saldo real (calcSaldoConta)');

await check('CASH_UI_03_VALUE_MATCHES_PAST_CUTOFF', async () => {
  const r = await page.evaluate(() => {
    currentMonth = 7; currentYear = 2026; renderDashboard();
    const totals = getTotalsForMonth(7, 2026);
    return { shown: document.getElementById('dashExcedentePanel').innerText, expected: fmtBRL(totals.emCaixaDisponivel), isFuturo: totals.isProjecaoFutura };
  });
  const ok = !r.isFuturo && r.shown.includes(r.expected);
  return { ok, detail: `mês passado (julho/2026): valor deve usar o corte histórico (calcSaldoContaAte) — expected=${r.expected}, painel="${r.shown.replace(/\n+/g, ' | ')}"` };
}, 'mês passado: usa o corte histórico existente, mesmo valor de getTotalsForMonth');

await check('CASH_UI_04_FUTURE_LABELED_AS_PROJECTION', async () => {
  const r = await page.evaluate(() => {
    currentMonth = 12; currentYear = 2026; renderDashboard();
    const totals = getTotalsForMonth(12, 2026);
    return { shown: document.getElementById('dashExcedentePanel').innerText, expected: fmtBRL(totals.emCaixaDisponivel), isFuturo: totals.isProjecaoFutura };
  });
  const ok = r.isFuturo && r.shown.includes(r.expected) && /proje[cç][aã]o/i.test(r.shown) && !/saldo real/i.test(r.shown);
  return { ok, detail: `mês futuro (dezembro/2026): deve rotular como projeção, nunca como saldo real — expected=${r.expected}, painel="${r.shown.replace(/\n+/g, ' | ')}"` };
}, 'mês futuro: rotulado explicitamente como projeção, nunca chamado de saldo real');

await check('CASH_UI_05_LEGACY_RECORDS_PRESERVED', async () => {
  const r = await page.evaluate(() => {
    currentMonth = 9; currentYear = 2026; renderDashboard();
    const inStateBefore = JSON.parse(JSON.stringify(state.excedentes));
    // buildSaveObject() envolve o state atual num perfil ({version,perfilAtivo,perfis})
    // — o roundtrip completo (salvar e reabrir) é reimportar esse objeto.
    const saved = buildSaveObject();
    migrateAppData(JSON.parse(JSON.stringify(saved)));
    currentMonth = 9; currentYear = 2026; renderDashboard();
    return { inStateBefore, inStateAfterRoundtrip: JSON.parse(JSON.stringify(state.excedentes)) };
  });
  const ok = r.inStateBefore['2026-07'] === 500 && r.inStateAfterRoundtrip['2026-07'] === 500;
  return { ok, detail: `state.excedentes deve preservar o registro antigo intacto antes e depois do roundtrip de backup (buildSaveObject → migrateAppData) — antes=${JSON.stringify(r.inStateBefore)}, depois=${JSON.stringify(r.inStateAfterRoundtrip)}` };
}, 'registros antigos de excedentes permanecem íntegros no estado e sobrevivem ao roundtrip de backup, mesmo não sendo usados com contas');

await check('CASH_UI_06_LEGACY_MODAL_BLOCKED_WITH_ACCOUNTS', async () => {
  const r = await page.evaluate(() => {
    currentMonth = 9; currentYear = 2026; renderDashboard();
    const genBefore = saveGeneration, excedentesBefore = JSON.stringify(state.excedentes);
    openExcedenteCaixa();
    const modalOpenedAfterOpen = document.getElementById('modalOverlay').classList.contains('open');
    confirmarExcedente();
    limparExcedente();
    return {
      modalOpenedAfterOpen,
      genUnchanged: saveGeneration === genBefore,
      excedentesUnchanged: JSON.stringify(state.excedentes) === excedentesBefore,
    };
  });
  const ok = !r.modalOpenedAfterOpen && r.genUnchanged && r.excedentesUnchanged;
  return { ok, detail: `com contas: openExcedenteCaixa não deve abrir modal, e confirmarExcedente/limparExcedente chamados diretamente não podem gravar state.excedentes nem incrementar saveGeneration (scheduleSave) — obtido=${JSON.stringify(r)}` };
}, 'chamada direta ao modal/confirmador legado não abre nem grava state.excedentes nem agenda salvamento, com contas presentes');

await check('CASH_UI_07_WITHOUT_ACCOUNTS_LEGACY_INTACT', async () => {
  await loadState(baseSyntheticState({ contas: [], excedentes: {} }));
  const r = await page.evaluate(() => {
    currentMonth = 9; currentYear = 2026; renderDashboard();
    const panelBefore = document.getElementById('dashExcedentePanel').innerText;
    const hasLegacyButton = /\+ Guardar/.test(panelBefore) && /guardar em caixa/i.test(panelBefore);
    const hasInformativeLabel = /saldo que permanece nas contas/i.test(panelBefore);
    openExcedenteCaixa();
    const modalOpened = document.getElementById('modalOverlay').classList.contains('open');
    document.getElementById('excedValor').value = '300';
    confirmarExcedente();
    return { hasLegacyButton, hasInformativeLabel, modalOpened, excedenteMesSetembro: state.excedentes['2026-09'] };
  });
  const ok = r.hasLegacyButton && !r.hasInformativeLabel && r.modalOpened && r.excedenteMesSetembro === 300;
  return { ok, detail: `sem contas: botão/rótulo legado devem continuar, modal deve abrir e confirmar deve gravar o valor — obtido=${JSON.stringify(r)}` };
}, 'sem contas: mecanismo e rótulo legados de "Guardar em Caixa" continuam funcionando exatamente como antes');

await check('CASH_UI_08_NEXT_MONTH_REFLECTS_LEGACY_EXCEDENTE', async () => {
  const r = await page.evaluate(() => {
    currentMonth = 10; currentYear = 2026; renderDashboard();
    return getTotalsForMonth(10, 2026).excedentAcum;
  });
  const ok = r === 300;
  return { ok, detail: `sem contas, o excedente declarado em setembro (300) deve aparecer acumulado em outubro — obtido=${r}` };
}, 'sem contas: excedente declarado reflete no mês seguinte (regressão)');

await check('CASH_UI_09_PROFILE_SWITCH_NO_LEAK', async () => {
  // Cenário real de troca de perfil (switchPerfil), não só um novo loadState:
  // perfil "semContas" tem excedente legado de 700 declarado; perfil
  // "comContas" tem conta bancária. Trocar de "semContas" para "comContas"
  // deve reavaliar a interface para o bloco informativo, sem vazar o
  // excedente do perfil anterior.
  const raw = {
    version: 2, perfilAtivo: 'semContas',
    perfis: {
      semContas: { id: 'semContas', name: 'Sem Contas', color: '#5b7fff', data: baseSyntheticState({ contas: [], excedentes: { '2026-08': 700 } }) },
      comContas: { id: 'comContas', name: 'Com Contas', color: '#38e2b4', data: baseSyntheticState({ excedentes: {} }) },
    },
  };
  await loadState(raw);
  const r = await page.evaluate(() => {
    currentMonth = 9; currentYear = 2026; renderDashboard();
    const beforeSwitch = document.getElementById('dashExcedentePanel').innerText;
    switchPerfil('comContas');
    const afterSwitch = document.getElementById('dashExcedentePanel').innerText;
    return {
      beforeHadLegacy: /guardar em caixa/i.test(beforeSwitch),
      afterHasInformative: /saldo que permanece nas contas/i.test(afterSwitch),
      afterLeaksLegacyValue: /guardar em caixa/i.test(afterSwitch) || afterSwitch.includes('700'),
      excedentesIsolatedInOtherProfile: perfis.semContas.data.excedentes['2026-08'] === 700,
    };
  });
  const ok = r.beforeHadLegacy && r.afterHasInformative && !r.afterLeaksLegacyValue && r.excedentesIsolatedInOtherProfile;
  return { ok, detail: `trocar para o perfil com contas deve mostrar o bloco informativo, sem vazar o excedente/rótulo do perfil anterior, e sem alterar o excedente guardado no outro perfil — obtido=${JSON.stringify(r)}` };
}, 'mudança de perfil (switchPerfil) reavalia a interface sem vazar saldo entre perfis');
} finally {
  await close();
}

const fails = results.filter((r) => r.status === 'FAIL').length;
console.log(`gate5-cash-balance-ui: TOTAL=${results.length} PASS=${results.length - fails} FAIL=${fails}`);
if (fails > 0) process.exitCode = 1;

export { results };
