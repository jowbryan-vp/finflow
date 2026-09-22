# Auditoria Codex — imutabilidade de fatura paga

Branch `gate/5-uat-corrections`, base `2674abe`, entrega Claude Code `9945cb2`.
Resultado: **PASS**. As rotas pessoais que podem alterar a composição ou o total de uma fatura agora bloqueiam a operação quando qualquer competência afetada já está paga, sem desmarcação automática ou segundo modelo de pagamento.

## Evidências

- `git diff 2674abe..9945cb2 --check`: sem erros.
- `npm test` em `tests/financial-engine`: **460 PASS / 0 FAIL** (446 anteriores e 14 novos).
- Criação avulsa, parcelada e recorrente, edição de origem ou destino, exclusão, importação de PDF, conversão do “E se...” e ajuste/remoção de ajuste foram revisados antes dos respectivos pontos de mutação.
- Importação de PDF e conversão do “E se...” são atômicas: se um item atingir fatura paga, nenhum item do lote é gravado.
- Desmarcar a fatura libera novamente as operações; dinheiro/PIX permanece fora da regra.
- Chamadas diretas às funções protegidas não contornam as guardas. Estado, saldo, modal, página e `saveGeneration` permanecem estáveis nos bloqueios aplicáveis.

## Verificações independentes adicionais

- A rota “E se...” foi exercitada separadamente: item preservado, página inalterada, nenhum salvamento e mensagem correta.
- Uma despesa fixa recorrente iniciada antes de uma competência paga foi reconhecida como bloqueada.
- O resultado de `despesaTocaFaturaPaga` foi comparado com a presença real produzida por `getDespesasForMonth` em **3.600 combinações** de cartão com e sem fechamento, data real ou legado, início, parcelas, recorrência, `ignorarAntes`, meses e viradas de ano: **zero divergências**.
- A leitura de chaves por sufixo `_AAAA-MM` preserva identificadores de cartão que contenham sublinhados e considera apenas valores verdadeiros de `faturasPagas`.

## Conclusão

Não foram encontrados achados reproduzíveis no escopo. O saldo debitado por uma fatura paga permanece congelado até que o usuário a desmarque explicitamente. A área Cartões / Faturas pode seguir para teste de uso desta rodada.

Sem push ou merge. `baseline-home.log` e `debug1.mjs` continuam fora do commit.
