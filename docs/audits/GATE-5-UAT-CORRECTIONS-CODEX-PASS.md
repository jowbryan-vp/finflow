# Auditoria Codex — Gate 5 UAT Corrections (patch corretivo)

Resultado: **PASS — aprovado tecnicamente para integração, condicionado ao teste manual do Google Drive no ambiente da Prefeitura**.

- Branch: `gate/5-uat-corrections`
- Auditoria anterior: `c4f8d39fcf8fe9ae7a7c6768f0d091f30ab3ef47`
- Patch corretivo auditado: `93966b04927e6392955c6bad010f20cd25bc6ea2`
- Auditor: Codex, após encerramento da edição pelo Claude Code

## Escopo verificado

- `93966b0` é descendente direto de `c4f8d39`; os commits `4ae015e` e `c4f8d39` permanecem intactos, sem squash.
- O diff corretivo contém somente os quatro arquivos declarados no handoff: `index.html`, os dois testes Gate 5 e o relatório de implementação.
- `git diff --check c4f8d39..93966b0`: exit code 0.
- A árvore recebida estava limpa antes da auditoria.
- A suíte completa foi executada duas vezes de forma independente pelo Codex. Ambas terminaram com `TOTAL_PASS=364 TOTAL_FAIL=0`.

## Revalidação dos achados anteriores

### 1. Entrada prevista sem data

Resolvido. Quando existe entrada prevista maior que zero, `addOfficeProjeto()` exige `dataEntradaPrevista` válida antes de qualquer mutação. O caso sem data foi reproduzido novamente e retornou:

```json
{"created":false,"dataPrevista":null}
```

O caso positivo com data válida também está coberto: a entrada aparece somente na competência prevista e não entra no caixa real antes do recebimento.

### 2. Normalização monetária do projeto

Resolvido. `valorContrato` e `valorEntrada` passam a ser persistidos a partir dos centavos inteiros usados para gerar os recebíveis. A reprodução com `100.005` resultou em contrato armazenado como `100.01`, e a soma é igual quando comparada em centavos.

A representação intermediária `100.00999999999999` observada na soma JavaScript é o comportamento binário normal de ponto flutuante e não configura divergência financeira, pois a igualdade em centavos foi confirmada.

### 3. Inicialização com pendência local e falha de rede

Resolvido no comportamento do código. Com `finflow_unsynced='1'`, sem ID de arquivo em cache e `fetch` rejeitando com `TypeError('Failed to fetch')`, `initApp()` não rejeitou, preservou a pendência local e alcançou a renderização:

```json
{"initError":null}
```

Os testes permanentes também cobrem a preservação do estado local, ausência de download remoto nesse caminho, mensagem amigável, recuperação posterior e atualização do arquivo existente sem criar duplicata.

## Decisão

O patch corretivo `93966b0` resolve os três achados da auditoria anterior e não apresentou regressões nas verificações executadas. O Gate 5 fica **aprovado tecnicamente nesta revisão**.

A aprovação não confirma o funcionamento do Google Drive real na rede da Prefeitura. Ainda é obrigatório realizar UAT manual nesta máquina para verificar rede/proxy, origem OAuth e acesso a `www.googleapis.com`. Nenhum token, Client ID, credencial ou backup financeiro real foi usado nesta auditoria.

Nenhum merge em `main` e nenhum push foram executados pelo Codex.
