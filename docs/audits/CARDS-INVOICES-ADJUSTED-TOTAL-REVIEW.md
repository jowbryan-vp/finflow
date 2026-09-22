# Auditoria Codex — total ajustado nos resumos de cartão

Branch `gate/5-uat-corrections`, base `2074d42`, entrega Claude Code `3e547c8`.
Resultado: **FAIL**, apesar de a correção principal estar correta, por uma regressão reproduzível no tratamento do grupo `Outros` após a exclusão de um cartão personalizado. Esta é uma auditoria independente; o Codex não alterou o código de produção.

## Verificações aprovadas

- `git diff 2074d42..3e547c8 --check`: sem erros.
- `npm test` em `tests/financial-engine`: **437 PASS / 0 FAIL** (429 anteriores e 8 novos).
- Com uma compra de R$ 150 e ajuste manual da fatura para R$ 155, as visões agrupada e `pendentes` de Despesas, Cartões / Faturas e o total usado pelo pagamento mostram R$ 155. A compra individual permanece em R$ 150.
- Uma fatura com ajuste positivo e nenhuma compra aparece nas visões agrupada, `pendentes` e filtro específico; continua ausente em `pagas` enquanto estiver pendente.

## Achado impeditivo — cartão removido passa a mostrar R$ 0 no grupo Outros

O aplicativo permite excluir um cartão personalizado em `delCartao` sem excluir ou reclassificar as compras vinculadas. `renderDespesasAgrupadas` já preservava esses registros num grupo `Outros`, usando a soma das parcelas. Após `3e547c8`, esse grupo é classificado como cartão de crédito porque seu identificador interno é `_outros`, mas `_outros` não existe em `calcByCardForMonth`. A nova expressão usa então zero como total efetivo, em vez de recorrer a `g.total`.

Reprodução independente com dados sintéticos e as funções reais da interface:

1. cadastrar o cartão personalizado `custom`, com fechamento no dia 3;
2. lançar nele uma compra de R$ 120;
3. executar `delCartao('custom')`, que remove o cartão e preserva a despesa;
4. abrir o mês em que o lançamento legado é apresentado após a remoção.

Resultado na visão agrupada de Despesas: `Outros`, `1 compra no cartão`, **R$ 0,00**. No filtro `pendentes`, o mesmo registro mostra **R$ 120,00**. `state.despesas[0].valor` e `_valorParcela` continuam em 120. Assim, duas visões da mesma tela discordam e a visão padrão oculta o valor real.

Corrigir somente o fallback do total agrupado: usar `calcByCardForMonth` quando a chave do cartão realmente existir nessa estrutura e preservar `g.total` para o grupo `Outros`/referências de cartões ausentes. Adicionar teste permanente cobrindo cartão personalizado com compra, exclusão do cartão e coerência entre visão agrupada e filtrada. Não migrar nem apagar o lançamento e não ampliar esta correção para redesenhar a política de exclusão de cartões.

## Limite já conhecido

Permanece fora deste patch a decisão de produto sobre novas compras adicionadas a uma fatura já paga e não vazia. Esse limite continua pendente e não foi considerado resolvido.

Sem push ou merge. `baseline-home.log` e `debug1.mjs` permanecem fora do commit.
