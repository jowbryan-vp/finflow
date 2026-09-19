// Gate 5 — achado 1: renderParcelamentos() só deve exibir parcelamentos cuja
// competência do mês selecionado esteja entre a primeira e a última parcela
// (inclusive). Correção de filtragem/apresentação apenas — nenhum dado de
// state.despesas é alterado ou excluído (verificado no fim do arquivo).
import { openHarness, makeRunner, baseSyntheticState } from './harness.mjs';

const { page, loadState, close } = await openHarness();
const { check, results } = makeRunner('gate5-parcelamentos-periodo');

await loadState(baseSyntheticState());

async function setPeriodoERenderiza(mes, ano) {
  return page.evaluate(([mes, ano]) => {
    currentMonth = mes; currentYear = ano;
    renderParcelamentos();
    const html = document.getElementById('parcelamentosList').innerHTML;
    const title = document.querySelector('#page-parcelamentos .card-title').textContent;
    return { html, title };
  }, [mes, ano]);
}

function visivel(html, despesaId) {
  // O botão de editar passou a chamar abrirEdicaoDespesaNaAreaCerta() (ajuste
  // Cartões / Faturas — docs/gates/CARDS-INVOICES-UI.md), que decide entre
  // Cartões/Faturas e Despesas conforme d.cartao e então abre o mesmo
  // openEditDespesa(). A regra de PERÍODO testada aqui (achado 1) não muda —
  // só o destino da edição, verificado à parte em gate5-cards-invoices-ui.test.mjs.
  return html.includes(`abrirEdicaoDespesaNaAreaCerta('${despesaId}')`);
}

// P5-01: título do card atualizado
await check('P5-01', async () => {
  const { title } = await setPeriodoERenderiza(1, 2026);
  return { ok: title === 'Parcelamentos Ativos no Período', detail: `título="${title}"` };
}, 'card title passa a ser "Parcelamentos Ativos no Período"');

// Cartão de crédito com fechamento em 03 — compra ANTES do fechamento (dia
// 02/09/2026), 3x → competências set/out/nov 2026 (mesma regra de getCompetenciaFatura).
await page.evaluate(() => {
  state.cards.push({ id: 'credAntes', name: 'Cartão Antes', color: '#111', fecha: 3, paga: 10 });
  state.despesas.push({ id: 'cAntes', desc: 'parcela cartão antes fechamento', cat: 'geral', subcat: 'Geral',
    cartao: 'credAntes', conta: null, valor: 300, parcelas: 3, mesInicio: 9, anoInicio: 2026,
    dataCompra: '2026-09-02', fixa: false, diaVencimento: null, debitoAutomatico: false,
    pagoMeses: {}, split: [], repasses: {}, createdAt: 'cAntes' });
});

await check('P5-02', async () => {
  const { html } = await setPeriodoERenderiza(8, 2026); // mês anterior ao início (set/2026)
  return { ok: !visivel(html, 'cAntes'), detail: 'ago/2026 (esp. oculto)' };
}, 'mês anterior ao início: oculto');

await check('P5-03', async () => {
  const { html } = await setPeriodoERenderiza(9, 2026); // primeira parcela
  return { ok: visivel(html, 'cAntes'), detail: 'set/2026, 1ª parcela (esp. visível)' };
}, 'primeira parcela: visível');

await check('P5-04', async () => {
  const { html } = await setPeriodoERenderiza(10, 2026); // mês intermediário
  return { ok: visivel(html, 'cAntes'), detail: 'out/2026, parcela intermediária (esp. visível)' };
}, 'mês intermediário: visível');

await check('P5-05', async () => {
  const { html } = await setPeriodoERenderiza(11, 2026); // última parcela
  return { ok: visivel(html, 'cAntes'), detail: 'nov/2026, última parcela (esp. visível)' };
}, 'última parcela: visível');

await check('P5-06', async () => {
  const { html } = await setPeriodoERenderiza(12, 2026); // mês posterior ao término
  return { ok: !visivel(html, 'cAntes'), detail: 'dez/2026 (esp. oculto)' };
}, 'mês posterior ao término: oculto');

// Cartão com compra DEPOIS do fechamento (dia 04/09, fecha=03) → out/nov/dez 2026.
await page.evaluate(() => {
  state.despesas.push({ id: 'cDepois', desc: 'parcela cartão depois fechamento', cat: 'geral', subcat: 'Geral',
    cartao: 'credAntes', conta: null, valor: 300, parcelas: 3, mesInicio: 9, anoInicio: 2026,
    dataCompra: '2026-09-04', fixa: false, diaVencimento: null, debitoAutomatico: false,
    pagoMeses: {}, split: [], repasses: {}, createdAt: 'cDepois' });
});
await check('P5-07', async () => {
  const semRolagem = await setPeriodoERenderiza(9, 2026); // ainda mês da compra, mas rolou pra fatura de outubro
  const comRolagem = await setPeriodoERenderiza(10, 2026);
  return { ok: !visivel(semRolagem.html, 'cDepois') && visivel(comRolagem.html, 'cDepois'),
    detail: `set/2026 visível=${visivel(semRolagem.html, 'cDepois')} (esp. false), out/2026 visível=${visivel(comRolagem.html, 'cDepois')} (esp. true)` };
}, 'cartão com compra depois do fechamento: rola pra fatura seguinte, período reflete a rolagem');

// Virada de ano: compra 20/12/2026, 3x → jan/fev/mar 2027.
await page.evaluate(() => {
  state.despesas.push({ id: 'cVirada', desc: 'parcela virada de ano', cat: 'geral', subcat: 'Geral',
    cartao: 'credAntes', conta: null, valor: 300, parcelas: 3, mesInicio: 12, anoInicio: 2026,
    dataCompra: '2026-12-20', fixa: false, diaVencimento: null, debitoAutomatico: false,
    pagoMeses: {}, split: [], repasses: {}, createdAt: 'cVirada' });
});
await check('P5-08', async () => {
  const dez2026 = await setPeriodoERenderiza(12, 2026);
  const jan2027 = await setPeriodoERenderiza(1, 2027);
  const mar2027 = await setPeriodoERenderiza(3, 2027);
  const abr2027 = await setPeriodoERenderiza(4, 2027);
  const ok = !visivel(dez2026.html, 'cVirada') && visivel(jan2027.html, 'cVirada') &&
    visivel(mar2027.html, 'cVirada') && !visivel(abr2027.html, 'cVirada');
  return { ok, detail: `dez/2026=${visivel(dez2026.html,'cVirada')}(esp.false) jan/2027=${visivel(jan2027.html,'cVirada')}(esp.true) mar/2027=${visivel(mar2027.html,'cVirada')}(esp.true) abr/2027=${visivel(abr2027.html,'cVirada')}(esp.false)` };
}, 'parcelamento atravessando a virada do ano: início jan/2027, fim mar/2027');

// Registro legado sem dataCompra: usa o fallback "mesInicio+1" (modo legado
// de getCompetenciaFatura), mesmo com cartão que tem fechamento configurado.
await page.evaluate(() => {
  state.despesas.push({ id: 'cLegado', desc: 'parcela legada sem dataCompra', cat: 'geral', subcat: 'Geral',
    cartao: 'credAntes', conta: null, valor: 200, parcelas: 2, mesInicio: 6, anoInicio: 2026,
    dataCompra: null, fixa: false, diaVencimento: null, debitoAutomatico: false,
    pagoMeses: {}, split: [], repasses: {}, createdAt: 'cLegado' });
});
await check('P5-09', async () => {
  // legado: mesInicio(6)+1 = competência 07/2026 até 08/2026 (2 parcelas)
  const antes = await setPeriodoERenderiza(6, 2026);
  const ini = await setPeriodoERenderiza(7, 2026);
  const fim = await setPeriodoERenderiza(8, 2026);
  const depois = await setPeriodoERenderiza(9, 2026);
  const ok = !visivel(antes.html, 'cLegado') && visivel(ini.html, 'cLegado') &&
    visivel(fim.html, 'cLegado') && !visivel(depois.html, 'cLegado');
  return { ok, detail: `jun/2026=${visivel(antes.html,'cLegado')}(esp.false) jul/2026=${visivel(ini.html,'cLegado')}(esp.true) ago/2026=${visivel(fim.html,'cLegado')}(esp.true) set/2026=${visivel(depois.html,'cLegado')}(esp.false)` };
}, 'registro legado sem dataCompra: usa fallback mesInicio+1, preservado (não é excluído nem alterado)');

// Dinheiro/PIX: nunca rola — usa mesInicio/anoInicio direto.
await page.evaluate(() => {
  state.despesas.push({ id: 'cDinheiro', desc: 'parcela dinheiro/pix', cat: 'geral', subcat: 'Geral',
    cartao: 'dinheiro', conta: 'c1', valor: 400, parcelas: 4, mesInicio: 3, anoInicio: 2026,
    dataCompra: '2026-03-15', fixa: false, diaVencimento: null, debitoAutomatico: false,
    pagoMeses: {}, split: [], repasses: {}, createdAt: 'cDinheiro' });
});
await check('P5-10', async () => {
  const antes = await setPeriodoERenderiza(2, 2026);
  const ini = await setPeriodoERenderiza(3, 2026);
  const fim = await setPeriodoERenderiza(6, 2026);
  const depois = await setPeriodoERenderiza(7, 2026);
  const ok = !visivel(antes.html, 'cDinheiro') && visivel(ini.html, 'cDinheiro') &&
    visivel(fim.html, 'cDinheiro') && !visivel(depois.html, 'cDinheiro');
  return { ok, detail: `fev/2026=${visivel(antes.html,'cDinheiro')}(esp.false) mar/2026=${visivel(ini.html,'cDinheiro')}(esp.true) jun/2026=${visivel(fim.html,'cDinheiro')}(esp.true) jul/2026=${visivel(depois.html,'cDinheiro')}(esp.false)` };
}, 'dinheiro/PIX sem rolagem de fatura: usa mesInicio/anoInicio direto, sem ajuste de fechamento');

// Estado vazio específico do período.
await check('P5-11', async () => {
  const { html } = await setPeriodoERenderiza(1, 2030); // nenhum parcelamento ativo tão longe no futuro
  return { ok: html.includes('Nenhum parcelamento ativo neste período'), detail: html.slice(0, 80) };
}, 'período sem parcelamentos ativos mostra mensagem específica do período');

// Confirmação final: nenhum dado original foi alterado/excluído por toda a navegação acima.
await check('P5-12', async () => {
  const r = await page.evaluate(() => {
    const d = state.despesas.find((x) => x.id === 'cAntes');
    return { existe: !!d, parcelas: d && d.parcelas, valor: d && d.valor, mesInicio: d && d.mesInicio,
      total: state.despesas.length };
  });
  const ok = r.existe && r.parcelas === 3 && r.valor === 300 && r.mesInicio === 9 && r.total === 5;
  return { ok, detail: `despesas preservadas: total=${r.total} (esp. 5), cAntes intacta=${r.existe}` };
}, 'nenhuma despesa foi alterada ou excluída pela navegação de período (filtragem pura)');

await close();

const fails = results.filter((r) => r.status === 'FAIL').length;
console.log(`\ngate5-parcelamentos-periodo.test.mjs: TOTAL=${results.length} PASS=${results.length - fails} FAIL=${fails}`);
if (fails > 0) process.exitCode = 1;

export { results };
