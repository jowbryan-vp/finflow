# Auditoria Codex — Gate 5 UAT Corrections

Resultado: **FAIL — correções necessárias antes da aprovação**.

- Base auditada: `1d8e4577763447393d4a3e4ea5a612b3955805a9`
- Implementação auditada: `4ae015ee5a3cce94c1e79cb3a27084111fa9a683`
- Branch: `gate/5-uat-corrections`
- Auditor: Codex, após encerramento da edição pelo Claude Code

## Verificações aprovadas

- A implementação é descendente direta da base aprovada e o checkout recebido estava limpo.
- O diff contém somente os oito arquivos declarados no handoff.
- `git diff --check 1d8e457..4ae015e`: exit code 0.
- A suíte completa foi executada duas vezes pelo Codex: nas duas execuções, `TOTAL_PASS=347 TOTAL_FAIL=0`, sem reprodução do flake informado.
- A filtragem temporal de parcelamentos, a compatibilidade do tipo interno `repasse` e a proteção contra download manual por cima de `finflow_unsynced` estão coerentes nos casos cobertos.

## Achados

### 1. [P2] Entrada prevista sem data é aceita e desaparece das projeções mensais

Em `addOfficeProjeto()`, a data prevista da entrada é lida, mas só a data da primeira parcela e a data real de uma entrada já recebida são validadas. Assim, um contrato de R$ 500,00 totalmente previsto como entrada, sem data prevista, é criado com um recebível `Entrada` em estado `previsto` e `dataPrevista:null`.

Reprodução independente, usando o formulário real:

```json
{"created":true,"dataPrevista":null}
```

`getOfficeReceivables()` exclui todo recebível sem data de referência, portanto essa entrada não aparece em nenhum `getOfficeReceivablesPrevistoTotal(mes, ano)`. O contrato fica cadastrado, mas sua entrada prevista some do planejamento mensal do Caixa do Escritório.

Correção esperada: quando `entradaCent > 0` e a entrada não estiver marcada como recebida, exigir uma `dataEntradaPrevista` válida antes de qualquer mutação. Adicionar teste de rejeição sem mutação e teste positivo demonstrando que a entrada aparece no mês previsto.

### 2. [P2] Valores com mais de duas casas não são normalizados no projeto

O código calcula `contratoCent` e `entradaCent` corretamente, mas grava no projeto os valores brutos de `parseFloat` (`valorContrato` e `valorEntrada`). Os recebíveis são gravados a partir dos centavos normalizados.

Reprodução independente com contrato digitado como `100.005`, entrada zero e três parcelas:

```json
{
  "storedContract":100.005,
  "receivablesSum":100.00999999999999,
  "exactlyEqual":false
}
```

Isso quebra a afirmação de que contrato e recebíveis usam uma única representação monetária exata e pode exibir totais divergentes. O atributo HTML `step="0.01"` não substitui validação/normalização na função, pois valores colados ou estados programáticos ainda chegam ao handler.

Correção esperada: persistir `projeto.valorContrato = contratoCent / 100` e `projeto.valorEntrada = entradaCent / 100` (ou rejeitar explicitamente mais de duas casas), usando os valores normalizados em toda apresentação e geração. Adicionar teste com valor subcentavo.

### 3. [P2] Recarga ainda rejeita `initApp()` após a primeira falha de Drive sem ID em cache

No caminho `finflow_unsynced === '1'`, `initApp()` executa `await findDataFile()` fora do `try/catch`. O comentário diz que essa chamada “só lê o id do arquivo do cache local”, mas, quando `finflow_drive_file_id` ainda não existe — cenário comum na primeira tentativa de salvar — `findDataFile()` acessa a rede.

Com `finflow_unsynced=1`, sem `finflow_drive_file_id` e `fetch` rejeitando com o erro real do usuário, a reprodução obteve:

```json
{"name":"TypeError","message":"Failed to fetch"}
```

Logo, `initApp()` rejeita antes de chegar ao `try { await saveToDrive(); }`, e o `renderAll()` final também não é executado. Esse caso não é coberto pelos testes de Drive entregues.

Correção esperada: envolver também a resolução do ID no tratamento de erro ou eliminar a pré-busca obrigatória. A inicialização deve permanecer resolvida e utilizável com o cache local, preservar `finflow_unsynced`, não baixar remoto e mostrar a mensagem amigável. Adicionar teste chamando `initApp()` com pendência local, sem ID em cache e `fetch` rejeitado.

## Decisão

Não aprovado para integração nesta revisão. Devolver ao Claude Code para um patch restrito aos três achados, com novos testes permanentes. Depois, repetir a suíte completa e reenviar hashes para nova auditoria Codex.

Limite preservado: nenhuma credencial, backup real ou acesso OAuth real foi usado nesta auditoria. O bloqueio ambiental da rede da Prefeitura continua dependente de teste manual; os achados acima são reproduções sintéticas do comportamento do código.
