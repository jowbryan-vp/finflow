# Auditoria Codex — Gate 5: conversão de salário legado

Resultado: **PASS — aprovado tecnicamente**.

- Branch: `gate/5-uat-corrections`
- Base auditada: `51a4627ce6fd15e9f6edffd620c89b1b14ba7afa`
- Implementação auditada: `3fb48c14585cf84f28d9b08278a9404db1333259`
- Auditor: Codex, após encerramento da edição pelo Claude Code

## Integridade do patch

- `3fb48c1` é descendente direto de `51a4627`; os commits anteriores permaneceram intactos.
- A árvore recebida estava limpa.
- O diff contém somente os quatro arquivos declarados no handoff.
- `git diff --check 51a4627..3fb48c1`: exit code 0.
- Nenhum push ou merge em `main` foi realizado.

## Verificações funcionais

- O salário legado é convertido no próprio objeto, preservando `id`, quantidade de receitas, nome, valor, conta e `createdAt`.
- A conversão adiciona os campos do modelo recorrente atual e torna o registro elegível ao seletor “Salário principal do ciclo”.
- Nenhuma data ou ocorrência recebida é inventada.
- Sem data real, o ciclo permanece indisponível e o saldo não muda.
- Competências explicitamente marcadas como recebidas no modelo antigo exigem datas reais válidas antes de qualquer mutação.
- Com datas reais informadas, o saldo permanece equivalente e cada competência entra no caixa uma única vez.
- Exportação/importação preserva o registro convertido.
- Edições posteriores são idempotentes e não recriam nem duplicam a receita.
- IDs inexistentes ou inelegíveis continuam impedidos de virar `primarySalaryId`.

## Reprodução adicional do caso real de UAT

Foi auditado separadamente o cenário em que o usuário já havia salvo o salário antigo com `recorrente:true` antes de receber o patch. Ao reabrir o mesmo registro e salvar:

- o checkbox já apareceu marcado;
- o aviso de conversão apareceu;
- o mesmo ID foi mantido;
- a quantidade de receitas permaneceu igual;
- o saldo permaneceu igual;
- o salário apareceu no seletor do Dashboard;
- `recebidoPorMes` permaneceu vazio, sem inventar histórico.

## Testes

- Teste específico: `10 PASS / 0 FAIL`.
- Suíte completa, primeira execução independente: `TOTAL_PASS=374 TOTAL_FAIL=0`.
- Suíte completa, segunda execução independente: `TOTAL_PASS=374 TOTAL_FAIL=0`.

## Decisão e limite

O patch `3fb48c1` resolve o achado de UAT sem duplicar o salário nem alterar o caixa durante a conversão. Está aprovado nesta revisão.

A conversão continua sendo acionada pela edição: para um registro que já havia sido marcado como recorrente antes deste patch, o usuário deve reabrir esse salário e clicar em **Salvar** uma vez após carregar a versão corrigida. Em seguida, deve conferir o seletor do Dashboard e informar a data real de recebimento pelo fluxo normal para que o ciclo seja calculado.

Nenhum backup financeiro real, token, Client ID ou credencial foi usado nesta auditoria.
