// Gate 5 (UAT) — correção da regressão reproduzida pela auditoria Codex
// (docs/audits/CARDS-INVOICES-ADJUSTED-TOTAL-REVIEW.md, base 2074d42,
// entrega Claude Code 3e547c8).
//
// Achado: renderDespesasAgrupadas passou a usar calcByCardForMonth como total
// efetivo de QUALQUER grupo tratado como "cartão de crédito"
// (isCartaoDeCredito(id) === id!=='dinheiro'). O grupo "Outros" — onde ficam
// preservadas as compras de um cartão personalizado que foi excluído via
// delCartao (a despesa nunca é migrada, excluída ou reclassificada) — tem id
// interno `_outros`, que não existe em calcByCardForMonth (essa função só
// itera state.cards). O total efetivo caía em 0, escondendo o valor real da
// compra na visão padrão (agrupada), enquanto a visão filtrada (que sempre
// teve fallback pra g.total) continuava correta — duas telas discordando.
//
// Correção: só usar o total de calcByCardForMonth quando o cartão tiver
// chave real nessa estrutura; caso contrário (grupo "Outros" ou qualquer
// referência a cartão ausente), preservar a soma das parcelas (g.total).
// Nenhuma migração/exclusão/reclassificação de lançamento, nenhuma mudança
// na política de exclusão de cartões (delCartao continua igual).
import { openHarness, makeRunner, baseSyntheticState } from './harness.mjs';

const { page, loadState, close, consoleErrors } = await openHarness();
const { check, results } = makeRunner('gate5-cards-orphan-total');

await page.clock.setFixedTime(new Date(2026, 8, 17, 12)); // 17/09/2026

try {

await check('ORPHAN_CARD_DELETE_PRESERVES_DESPESA_NO_MUTATION', async () => {
  // 1. cartão personalizado com compra lançada.
  await loadState(baseSyntheticState({
    cards: [
      { id: 'dinheiro', name: 'Dinheiro/PIX', color: '#38e2b4', fecha: null, paga: null },
      { id: 'custom', name: 'Cartão Personalizado', color: '#ff5599', fecha: 3, paga: 10 },
    ],
    despesas: [{ id: 'compraCustom', desc: 'Compra no cartão personalizado', cat: 'geral', subcat: '', cartao: 'custom',
      conta: null, valor: 120, parcelas: 1, mesInicio: 9, anoInicio: 2026, dataCompra: '2026-09-02',
      fixa: false, pagoMeses: {}, split: [], repasses: {}, createdAt: 'compraCustom' }],
  }));
  const r = await page.evaluate(() => {
    currentMonth = 9; currentYear = 2026;
    const saldoAntes = state.contas.reduce((s, c) => s + calcSaldoConta(c.id), 0);
    const despesaAntes = JSON.stringify(state.despesas);

    // 2. exclusão do cartão pelas funções reais da interface.
    delCartao('custom');

    // 3. lançamento preservado (nem migrado, nem apagado, nem reclassificado).
    const despesaDepois = JSON.stringify(state.despesas);
    const despesaPreservada = state.despesas.length === 1 && state.despesas[0].cartao === 'custom' && state.despesas[0].valor === 120;

    // 5. ausência de mutação financeira (excluir cartão não é evento de caixa).
    const saldoDepois = state.contas.reduce((s, c) => s + calcSaldoConta(c.id), 0);

    // Sem o cartão (e seu dia de fechamento), getCompetenciaFatura cai no
    // modo legado "mês da compra + 1" (mesInicio=9 -> outubro/2026) — mesma
    // regra que já existia antes desta correção para despesas sem essa
    // informação; não é o achado sob teste, só onde o lançamento aparece.
    currentMonth = 10; currentYear = 2026;

    // 4. visão agrupada e filtro "pendentes" mostrando o mesmo valor.
    window._despFiltro = 'todas';
    navigate('despesas');
    const htmlAgrupada = document.getElementById('despesasList').innerHTML;

    window._despFiltro = 'pendentes';
    navigate('despesas');
    const htmlPendentes = document.getElementById('despesasList').innerHTML;
    window._despFiltro = 'todas';

    return {
      cartaoRemovido: !state.cards.find(c => c.id === 'custom'),
      despesaPreservada,
      despesaInalterada: despesaAntes === despesaDepois,
      saldoAntes, saldoDepois,
      agrupadaMostra120: htmlAgrupada.includes('120,00'),
      agrupadaMostra0: /R\$\s*0,00/.test(htmlAgrupada) && htmlAgrupada.includes('Outros'),
      pendentesMostra120: htmlPendentes.includes('120,00'),
      htmlAgrupadaTemOutros: htmlAgrupada.includes('Outros'),
    };
  });
  const ok = r.cartaoRemovido && r.despesaPreservada && r.despesaInalterada
    && r.saldoAntes === r.saldoDepois
    && r.htmlAgrupadaTemOutros && r.agrupadaMostra120 && !r.agrupadaMostra0
    && r.pendentesMostra120;
  return { ok, detail: `excluir um cartão personalizado (delCartao) com compra lançada não pode migrar/apagar/reclassificar o lançamento nem mexer no saldo, e o grupo "Outros" precisa mostrar R$ 120,00 (não R$ 0,00) tanto na visão agrupada quanto no filtro "pendentes" — obtido=${JSON.stringify(r)}` };
}, 'compra de cartão personalizado excluído continua em "Outros" com o valor real, coerente entre visão agrupada e filtro "pendentes", sem mutação financeira');

await check('NO_SCRIPT_ERRORS', async () => ({ ok: consoleErrors.length === 0, detail: `erros de console acumulados: ${JSON.stringify(consoleErrors)}` }), 'nenhum erro de execução ao longo do fluxo de cartão órfão');

} finally {
  await close();
}

const fails = results.filter((r) => r.status === 'FAIL').length;
console.log(`gate5-cards-orphan-total: TOTAL=${results.length} PASS=${results.length - fails} FAIL=${fails}`);
if (fails > 0) process.exitCode = 1;

export { results };
