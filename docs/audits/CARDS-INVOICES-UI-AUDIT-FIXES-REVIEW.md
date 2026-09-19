# Auditoria Codex — correções de Cartões / Faturas

Branch `gate/5-uat-corrections`, base `2e40531`, entrega Claude Code `99aa8f8`.
Resultado: **FAIL**, por um desvio reproduzível no valor exibido no novo resumo de cartão em Despesas. Esta é uma auditoria independente do commit recebido; o Codex não alterou o código de produção.

## Verificações

- `git diff 2e40531..99aa8f8 --check`: sem erros.
- `npm test` em `tests/financial-engine`: **429 PASS / 0 FAIL** (incluindo os 14 testes novos). Os quatro achados originais estão corrigidos nos cenários testados: separação das ações, exclusão de fixa + parcelada, data obrigatória para compra nova e bloqueio de pagamento da fatura vazia.
- Revisão do diff e das funções relacionadas em `index.html`; reprodução adicional no navegador de testes com estado sintético. Nenhum backup real foi usado.

## Achado impeditivo — resumo de cartão diverge da fatura ajustada

`renderDespesasAgrupadas` e `renderDespesasDetalhadas` exibem `g.total`, a soma bruta de `_valorParcela`, no novo resumo por cartão. A fatura e o pagamento usam `calcByCardForMonth`, que aplica `state.faturasAjustes`. Portanto um ajuste manual deixa duas telas com valores diferentes para a mesma fatura. Isso contraria a exigência de manter o total do cartão visível e coerente no novo resumo; o relatório de implementação afirma que o resumo usa o mesmo total de `calcByCardForMonth`, mas o código não o faz.

Reprodução independente: conta e cartão sintéticos; compra única de R$ 150 em `nu` na fatura de setembro/2026; `faturasAjustes['nu_2026-09']=155`. Em Despesas, tanto na visão agrupada quanto no filtro `pendentes`, o novo resumo mostra **R$ 150,00**. Em Cartões / Faturas e em `getTotalsForMonth(9,2026).byCard.nu`, o total é **R$ 155,00**. A diferença pode levar o usuário a confiar no valor menor ao abrir Despesas, embora o pagamento debite R$ 155.

Corrigir os resumos de cartão em Despesas para mostrar o total efetivo da fatura do cartão/mês, inclusive após ajuste manual, sem mexer nas regras de cálculo ou no valor das compras individuais. Adicionar teste sintético permanente que ajuste uma fatura e compare os resumos (agrupado e filtrado) à tela Cartões / Faturas e ao total usado no pagamento. Conferir também o caso em que há ajuste positivo e nenhuma compra lançada, para não informar que não há despesa enquanto existe fatura a pagar. Manter pagamentos diretos, categorias, relatórios e os 429 testes atuais.

## Limite financeiro conhecido

O relatório Claude registrou corretamente que uma nova compra em fatura **já paga e não vazia** ainda aumenta o total pago e debita a conta sem nova confirmação. Esse comportamento já existia antes desta correção e não foi alterado em `99aa8f8`; fica pendente de decisão de produto e escopo próprio. Não o considerar resolvido pelo bloqueio de fatura vazia nem iniciar outro gate antes de tratá-lo explicitamente.

Sem push ou merge. `baseline-home.log` e `debug1.mjs` continuam fora do commit.
