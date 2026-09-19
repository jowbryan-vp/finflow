# Auditoria Codex — Cartões / Faturas

Base `cbb6e55`, implementação Claude Code `d87a925`, branch `gate/5-uat-corrections`. Resultado: **FAIL**, apesar de `npm test` executado pelo Codex com **415 PASS / 0 FAIL** e `git diff --check` sem erros. O diff não alterou o motor de saldos/projeções; os achados são de fluxos e validação da nova interface. Não houve push nem merge.

## Achados reproduzidos com o harness e dados sintéticos

1. **Separação incompleta das áreas.** Com uma compra no cartão `nu` na fatura de setembro, `navigate('despesas')` ainda renderiza a compra em `#despesasList` e um botão `Pagar fatura` no grupo Nubank; a nova área também mostra a mesma compra. Reproduzido com `htmlIncludesCredit=true`, `htmlIncludesPayInvoice=true`. O escopo e handoff pedem que compras no crédito, parcelas e pagamento de fatura fiquem na área Cartões / Faturas, e PIX/dinheiro/débito em Despesas. Filtrar apenas o seletor do formulário não atende a isso. Corrigir listagem/ações de Despesas e revisar destinos dos totais agregados do Dashboard, filtros e conversão mista do “E se...” para que não escondam crédito sem aviso. Preservar relatórios, categorias, pesquisa e o acesso a todos os lançamentos.

2. **Combinação inválida de recorrência e parcelas.** Na nova área, marcar `Despesa fixa (recorrente)`, escolher `3` parcelas, valor `300`, data `2026-09-02` e salvar gera `fixa=true, parcelas=3`. `getDespesasForMonth` só estende uma despesa fixa quando `parcelas===1`; portanto o lançamento exibirá três parcelas e depois sumirá, contrariando o rótulo de recorrência. O formulário antigo já força uma parcela ao marcar fixa. Aplicar a mesma exclusão mútua na nova entrada, inclusive validação no salvamento, e testar.

3. **Data apagada muda a fatura sem aviso.** O novo formulário permite limpar `Data da compra`. `salvarNovaCompraCartao` grava `dataCompra=null` e usa o mês atual como `mesInicio`; `getCompetenciaFatura` então usa o fallback legado “mês + 1”. Reproduzido: a compra nova sem data foi salva e atribuída à fatura de outubro de 2026. Compras novas não devem entrar silenciosamente no modo legado; exigir data de compra válida antes de gravar, sem mutação em caso de erro. Preservar o fallback apenas para registros antigos/importação existente.

4. **Fatura vazia pode ser paga na nova área.** Sem compras, `renderFaturaCartoes` mostra total `0` e botão `Marcar como Paga`. Reproduzido: marcar essa fatura vazia a deixa `isFaturaPaga=true`; adicionar depois uma compra de `200` à mesma fatura reduz automaticamente o saldo da conta de `1000` para `800`, sem um novo ato de pagamento. A área não deve oferecer nem aceitar pagamento de fatura de valor zero; manter opção de desmarcar estados legados já pagos. Testar zero, posterior compra e saldo. Investigar se alguma outra ação da nova tela altera uma fatura já marcada paga sem confirmação; registrar limites sem ampliar o motor financeiro fora deste escopo.

## Próxima entrega esperada

Claude Code corrige apenas esses achados, com testes sintéticos permanentes que falham antes da correção quando possível. Não enfraquecer os 415 testes existentes. Executar a suíte completa, documentar mudança e limitações, fazer commit explícito e parar para nova auditoria Codex. Não iniciar outro gate, não usar backup real, não fazer push/merge.
