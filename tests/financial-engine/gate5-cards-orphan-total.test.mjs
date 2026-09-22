// Gate 5 (UAT) — correção da regressão reproduzida pela auditoria Codex
// (docs/audits/CARDS-INVOICES-ADJUSTED-TOTAL-REVIEW.md, base 2074d42,
// entrega Claude Code 3e547c8).
//
// Achado: renderDespesasAgrupadas passou a usar calcByCardForMonth como total
// efetivo de QUALQUER grupo tratado como "cartão de crédito"
// (isCartaoDeCredito(id) === id!=='dinheiro'). O grupo "Outros" — onde ficam
// preservadas as compras de um cartão cujo id não existe mais em
// state.cards — tem id interno `_outros`, que não existe em
// calcByCardForMonth (essa função só itera state.cards). O total efetivo
// caía em 0, escondendo o valor real da compra na visão padrão (agrupada),
// enquanto a visão filtrada (que sempre teve fallback pra g.total)
// continuava correta — duas telas discordando.
//
// Correção: só usar o total de calcByCardForMonth quando o cartão tiver
// chave real nessa estrutura; caso contrário (grupo "Outros" ou qualquer
// referência a cartão ausente), preservar a soma das parcelas (g.total).
// Nenhuma migração/exclusão/reclassificação de lançamento.
//
// Nota pós gate5-cards-delete-integrity: delCartao passou a BLOQUEAR a
// exclusão de qualquer cartão personalizado com histórico (despesa, fatura
// paga, conta de pagamento ou ajuste vinculado) — exatamente pra impedir que
// esse cenário de órfão volte a ser criado por uma ação do usuário. O
// fallback do grupo "Outros" continua sendo código de defesa legítimo (ex:
// estado antigo/importado de antes dessa proteção existir, ou qualquer outra
// forma de state.cards e state.despesas divergirem), então este teste
// constrói o cenário órfão diretamente no estado — simulando um backup
// legado — em vez de chamar delCartao, que agora bloqueia esse caminho de
// propósito (coberto por gate5-cards-delete-integrity.test.mjs).
import { openHarness, makeRunner, baseSyntheticState } from './harness.mjs';

const { page, loadState, close, consoleErrors } = await openHarness();
const { check, results } = makeRunner('gate5-cards-orphan-total');

await page.clock.setFixedTime(new Date(2026, 8, 17, 12)); // 17/09/2026

try {

await check('ORPHAN_CARD_LEGACY_STATE_PRESERVES_DESPESA_NO_MUTATION', async () => {
  // Estado legado/importado: uma despesa referencia um cartão que não existe
  // mais em state.cards (ex: backup de antes da proteção de exclusão com
  // histórico, ou qualquer outra divergência fora do controle de delCartao).
  // A UI precisa continuar mostrando esse valor coerentemente, mesmo sem
  // conseguir recriar esse estado pelas funções reais do app hoje.
  await loadState(baseSyntheticState({
    cards: [
      { id: 'dinheiro', name: 'Dinheiro/PIX', color: '#38e2b4', fecha: null, paga: null },
      // "custom" propositalmente ausente de state.cards.
    ],
    despesas: [{ id: 'compraCustom', desc: 'Compra em cartão legado ausente', cat: 'geral', subcat: '', cartao: 'custom',
      conta: null, valor: 120, parcelas: 1, mesInicio: 9, anoInicio: 2026, dataCompra: '2026-09-02',
      fixa: false, pagoMeses: {}, split: [], repasses: {}, createdAt: 'compraCustom' }],
  }));
  const r = await page.evaluate(() => {
    // Sem o cartão (e seu dia de fechamento), getCompetenciaFatura cai no
    // modo legado "mês da compra + 1" (mesInicio=9 -> outubro/2026) — mesma
    // regra que já existia antes desta correção para despesas sem essa
    // informação; não é o achado sob teste, só onde o lançamento aparece.
    currentMonth = 10; currentYear = 2026;
    const saldoAntes = state.contas.reduce((s, c) => s + calcSaldoConta(c.id), 0);
    const despesaAntes = JSON.stringify(state.despesas);

    // Visão agrupada e filtro "pendentes" mostrando o mesmo valor.
    window._despFiltro = 'todas';
    navigate('despesas');
    const htmlAgrupada = document.getElementById('despesasList').innerHTML;

    window._despFiltro = 'pendentes';
    navigate('despesas');
    const htmlPendentes = document.getElementById('despesasList').innerHTML;
    window._despFiltro = 'todas';

    // Ausência de mutação financeira e do lançamento (só renderizar não
    // pode migrar/apagar/reclassificar nada).
    const despesaDepois = JSON.stringify(state.despesas);
    const saldoDepois = state.contas.reduce((s, c) => s + calcSaldoConta(c.id), 0);

    return {
      despesaInalterada: despesaAntes === despesaDepois,
      saldoAntes, saldoDepois,
      agrupadaMostra120: htmlAgrupada.includes('120,00'),
      agrupadaMostra0: /R\$\s*0,00/.test(htmlAgrupada) && htmlAgrupada.includes('Outros'),
      pendentesMostra120: htmlPendentes.includes('120,00'),
      htmlAgrupadaTemOutros: htmlAgrupada.includes('Outros'),
    };
  });
  const ok = r.despesaInalterada && r.saldoAntes === r.saldoDepois
    && r.htmlAgrupadaTemOutros && r.agrupadaMostra120 && !r.agrupadaMostra0
    && r.pendentesMostra120;
  return { ok, detail: `uma despesa cujo cartão não existe mais em state.cards não pode ser migrada/apagada/reclassificada nem mexer no saldo, e o grupo "Outros" precisa mostrar R$ 120,00 (não R$ 0,00) tanto na visão agrupada quanto no filtro "pendentes" — obtido=${JSON.stringify(r)}` };
}, 'despesa de cartão ausente em state.cards (estado legado) continua em "Outros" com o valor real, coerente entre visão agrupada e filtro "pendentes", sem mutação financeira');

await check('NO_SCRIPT_ERRORS', async () => ({ ok: consoleErrors.length === 0, detail: `erros de console acumulados: ${JSON.stringify(consoleErrors)}` }), 'nenhum erro de execução ao longo do fluxo de cartão órfão');

} finally {
  await close();
}

const fails = results.filter((r) => r.status === 'FAIL').length;
console.log(`gate5-cards-orphan-total: TOTAL=${results.length} PASS=${results.length - fails} FAIL=${fails}`);
if (fails > 0) process.exitCode = 1;

export { results };
