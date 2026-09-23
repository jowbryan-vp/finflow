# Reauditoria Codex — correção P2 da pesquisa na fatura — 23/09/2026

## Resultado

**FAIL — nova correção Claude necessária.**

A correção de produto do P2 funciona, mas a entrega não satisfaz o critério
explícito de qualidade/red-green dos seis casos novos: os casos 17 e 18 passam
mesmo quando as quatro linhas funcionais são removidas. Codex não corrigiu
código nem testes; apenas revisou, reproduziu e documentou.

## Escopo e proveniência

- Branch: `fix/invoice-transaction-search`.
- Base reaudita: `ae9b5bdf3e01b23d9325a60b73dc62a12fbb8455`.
- Correção funcional: `98ed82663521310f3d1aac9dc0577b0313ff3ec4`.
- Documentação/handoff: `6f4f7be3b89d9ec04894deab66f87022272a4b06`.
- HEAD inicial confirmado exatamente em `6f4f7be3b89d9ec04894deab66f87022272a4b06`.
- Antes da reauditoria, a working tree estava limpa, o merge-base era
  exatamente `ae9b5bd` e somente os dois commits informados estavam depois da
  base.
- Diff revisado integralmente: `index.html`,
  `tests/financial-engine/gate5-invoice-transaction-search.test.mjs` e
  `docs/handoffs/HANDOFF-INVOICE-TRANSACTION-SEARCH-2026-09-23.md`.

## Correção funcional — aprovada isoladamente

- `changeMonth()` limpa `#cartaoFaturaSearchInput` depois de ajustar mês/ano e
  antes de `renderAll()`.
- A alteração de produto está restrita às quatro linhas declaradas em
  `index.html:2322-2325`.
- O valor do próprio input continua sendo a única fonte efetiva do termo;
  buscas no código não encontraram variável, cache ou listener adicional.
- Set→out, out→set, dez→jan e jan→dez limparam campo/query, mostraram
  imediatamente todos os lançamentos da nova competência e não exibiram a
  mensagem falsa de nenhum resultado.
- Pesquisa após a troca, troca de cartão e saída/reabertura continuaram
  funcionando.
- Total/status continuaram baseados na fatura completa; ordenação e
  `state.despesas` permaneceram inalterados.
- Nenhum listener foi adicionado; nenhum erro de console foi observado.
- Nenhuma regra financeira, RRT, escritório, conta ou transferência foi
  alterada no diff funcional.

## Achado

### P3 — casos 17 e 18 não ficam vermelhos sem a correção funcional

- Arquivo/linhas:
  `tests/financial-engine/gate5-invoice-transaction-search.test.mjs:327-368`.
- Cenário de reprodução:
  1. Execute a lógica dos casos 13–18 contra o `index.html` da base
     `ae9b5bdf3e01b23d9325a60b73dc62a12fbb8455`, sem as quatro linhas novas de
     `changeMonth()`.
  2. Os casos 13–16 falham corretamente: o termo permanece e surge a mensagem
     falsa de nenhum resultado nas quatro direções.
  3. O caso 17 passa porque, logo após `changeMonth(1)`, sobrescreve o termo
     residual com `NETFLIX` antes de verificar campo vazio ou lista completa.
  4. O caso 18 também passa porque testa apenas limpezas antigas de troca de
     cartão e reabertura; ele não depende da correção de `changeMonth()`.
- Evidência observada na base:
  - quatro trocas: query antiga preservada e `falseNoResult=true`;
  - `case17PassesWithoutFix=true`;
  - `case18PassesWithoutFix=true`.
- Impacto: a alegação do handoff de que “os casos 13–18 falham” sem a correção
  é falsa, e dois dos seis testes novos não demonstram o ciclo red-green
  exigido. O risco ao produto é baixo porque 13–16 cobrem corretamente o P2,
  mas a qualidade/evidência de teste solicitada não foi entregue por completo.
- Esperado: cada caso 13–18 deve conter ao menos uma asserção que dependa da
  limpeza feita por `changeMonth()`, falhando na base e passando no HEAD, sem
  enfraquecer seus objetivos específicos. O handoff deve registrar o resultado
  real depois dessa correção dos testes.

## Verificações executadas

- Arquivo específico: **18 PASS / 0 FAIL** no HEAD corrigido.
- Suíte completa: **627 PASS / 0 FAIL**.
- `git diff --check ae9b5bd..6f4f7be`: **PASS**, sem saída.
- Controle negativo contra `index.html` de `ae9b5bd`, servido somente em
  memória: casos 13–16 falharam como esperado; casos 17–18 passaram
  indevidamente.
- Verificação prática no Chromium/harness pelas setas reais
  `button[onclick="changeMonth(±1)"]`: as quatro trocas passaram, com campo
  vazio, lista completa, status pendente, nenhuma mensagem falsa, nenhuma
  mutação de `state.despesas` e console limpo.
- Backup real: não disponível no repositório; ausência não tratada como falha.

## Prompt completo para nova correção Claude

```text
Você é o implementador Claude no fluxo obrigatório “Claude implementa → Codex
reaudita”. Trabalhe exclusivamente na branch fix/invoice-transaction-search a
partir do HEAD que contém este relatório. Antes de editar, confirme branch,
status e histórico. Não faça checkout, merge, rebase, push ou publicação e não
toque na main.

A correção funcional do P2 em changeMonth() foi aprovada isoladamente. Não
altere index.html nem qualquer código de produto/financeiro. Corrija somente a
qualidade dos testes e a documentação descrita no achado P3 de
docs/audits/INVOICE-TRANSACTION-SEARCH-CODEX-REAUDIT-2026-09-23.md.

Hoje os casos INVOICE_SEARCH_17_SEARCH_WORKS_AFTER_MONTH_CHANGE e
INVOICE_SEARCH_18_CARD_SWITCH_AND_REOPEN_STILL_CLEAR passam contra a base
ae9b5bdf3e01b23d9325a60b73dc62a12fbb8455 sem as quatro linhas funcionais. O
caso 17 sobrescreve o termo residual imediatamente depois de changeMonth(1), e
o caso 18 só testa comportamentos antigos. Ajuste cada um para manter seu
objetivo específico, mas incluir uma asserção real dependente da limpeza de
changeMonth(): o campo/query deve estar vazio e a nova competência completa
imediatamente após uma troca real. Assim, individualmente, 13–18 devem falhar
sem a correção funcional e passar com ela. Não use mocks da função, não limpe o
input manualmente antes da asserção e não prepare o estado de modo que mascare o
termo residual.

Execute e documente um controle negativo real contra ae9b5bd mostrando cada
ID 13, 14, 15, 16, 17 e 18 em FAIL, depois restaure o HEAD corrigido e mostre
18 PASS / 0 FAIL. Execute também a suíte completa (627 PASS / 0 FAIL) e
git diff --check. Atualize apenas o handoff para substituir a afirmação
incorreta pela evidência real; não edite nem apague relatórios Codex.

Faça commits somente dos testes e do handoff, entregue hashes, diff/stat,
resultados e working tree limpa. Não declare PASS; a decisão cabe à próxima
reauditoria Codex.
```

## Segurança do repositório

Nenhum checkout, merge, rebase, push ou publicação foi executado. A referência
`origin/main` observada permaneceu `71edc74867d89d73832875c4ab456491f207c189` e
não foi alterada.
