# Auditoria Codex — fallback do grupo Outros

Branch `gate/5-uat-corrections`, base `c4f33df`, entrega Claude Code `5a6a2ef`.
Resultado da entrega: **PASS**. A correção pontual elimina a regressão reproduzida sem alterar cálculos financeiros, política de exclusão ou lançamentos.

## Evidências

- `git diff c4f33df..5a6a2ef --check`: sem erros.
- `npm test` em `tests/financial-engine`: **439 PASS / 0 FAIL** (437 anteriores e 2 novos).
- Exclusão real de cartão personalizado com compra de R$ 120 preserva a despesa e o saldo; a visão agrupada `Outros` e o filtro `pendentes` mostram R$ 120.
- Cartões ainda cadastrados continuam usando `calcByCardForMonth`, inclusive o total após ajuste manual. O fallback para `g.total` só ocorre quando a chave não existe.
- Nenhum arquivo fora do escopo foi alterado; não houve push ou merge.

## Novo risco crítico encontrado durante a auditoria, anterior a este patch

Ao ampliar a reprodução para uma fatura já paga, foi confirmado que `delCartao` permite excluir um cartão personalizado com histórico financeiro. `calcSaldoConta` calcula pagamentos de fatura percorrendo os cartões ainda existentes; portanto, excluir o cartão faz um pagamento histórico desaparecer do saldo embora `state.despesas`, `state.faturasPagas` e `state.faturasContas` permaneçam gravados.

Reprodução sintética: conta com R$ 1.000; cartão `custom`; compra e fatura paga de R$ 120, vinculada à conta. Antes da exclusão, saldo R$ 880. Após `delCartao('custom')`, saldo R$ 1.000, enquanto a despesa, a marcação de pagamento e a conta da fatura continuam no estado. A exclusão também pode mudar a competência calculada de compras que dependiam do dia de fechamento removido.

Esse comportamento já existia antes de `5a6a2ef` e não invalida o fallback aprovado. Contudo, ele impede considerar o fluxo completo de cartões financeiramente encerrado. A próxima correção recomendada é bloquear a exclusão de cartão personalizado que tenha compras, faturas pagas, conta de pagamento ou ajustes vinculados, preservando a exclusão apenas de cartão vazio e sem histórico. A regra deve ser testada antes de qualquer próximo gate.

## Limite anterior ainda pendente

Também permanece pendente a regra para novas compras adicionadas a uma fatura já paga e não vazia. Nenhum dos dois riscos foi modificado nesta entrega.

`baseline-home.log` e `debug1.mjs` continuam fora do commit.
