# Auditoria Codex — integridade da exclusão de cartões

Branch `gate/5-uat-corrections`, base `27e9a15`, entrega Claude Code `5e179b0`.
Resultado: **PASS**. A exclusão de cartões personalizados agora preserva o histórico financeiro e o saldo, sem migração ou alteração das regras de fatura.

## Evidências

- `git diff 27e9a15..5e179b0 --check`: sem erros.
- `npm test` em `tests/financial-engine`: **446 PASS / 0 FAIL** (439 anteriores e 7 novos).
- Compra pendente vinculada bloqueia a exclusão sem mutar o estado ou agendar salvamento.
- Fatura paga de R$ 120 numa conta de R$ 1.000 permanece debitada: saldo R$ 880 antes e depois da tentativa bloqueada.
- Verificação independente confirmou o bloqueio quando a única referência está, separadamente, em `faturasPagas`, `faturasContas` ou `faturasAjustes`, inclusive para identificador de cartão com sublinhado.
- Cartão personalizado vazio continua excluível; cartão padrão continua protegido.
- A adaptação de `gate5-cards-orphan-total.test.mjs` é coerente: o estado órfão permanece coberto como compatibilidade de backup/legado, enquanto a interface deixa de produzi-lo.

## Revisão da implementação

`cartaoTemHistorico` verifica despesas pelo identificador exato e associa as chaves históricas removendo somente o sufixo temporal `_AAAA-MM`. Isso preserva identificadores que contenham sublinhados e cobre as três estruturas históricas sem depender do valor armazenado. `delCartao` retorna antes de qualquer mutação quando encontra vínculo; o caminho de exclusão do cartão vazio permanece inalterado.

Não foram encontrados desvios reproduzíveis no escopo. Não houve push ou merge. `baseline-home.log` e `debug1.mjs` continuam fora do commit.

## Limite ainda pendente

Permanece para decisão própria o comportamento de criação, edição, exclusão ou importação de compras que alterem uma fatura já marcada como paga. Esta entrega não modifica esse fluxo.
