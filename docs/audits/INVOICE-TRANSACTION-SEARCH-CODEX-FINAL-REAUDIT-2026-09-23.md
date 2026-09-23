# Reauditoria Codex final — testes da pesquisa na fatura — 23/09/2026

## Resultado

**PASS.**

Fluxo preservado: Claude corrigiu os testes e o handoff; Codex revisou o diff,
executou os controles positivos e negativos e registrou esta aprovação. Nenhum
código ou teste foi alterado durante a reauditoria.

## Proveniência e escopo

- Branch: `fix/invoice-transaction-search`.
- Base desta rodada: `8720eee07e55f85203c9113b71dc8a8e846b7861`.
- Correção dos testes: `9d88ca7971ca442793b2a3e16159874ba1856e43`.
- Atualização do handoff: `d05d4ccc905e462839d7eac941f5577363098fba`.
- Correção funcional preservada no histórico:
  `98ed82663521310f3d1aac9dc0577b0313ff3ec4`.
- HEAD e working tree foram conferidos antes de qualquer análise; somente os
  dois commits informados estavam após a base.
- O commit `9d88ca7` altera somente
  `tests/financial-engine/gate5-invoice-transaction-search.test.mjs`.
- O commit `d05d4cc` altera somente
  `docs/handoffs/HANDOFF-INVOICE-TRANSACTION-SEARCH-2026-09-23.md`.
- `index.html` é byte a byte idêntico em `8720eee`, no HEAD e no working tree:
  blob `be7f62c7cb384b48230493e20a8a877228ddce03`.
- Os dois relatórios Codex anteriores permanecem intactos.

## Revisão dos testes

- `FINFLOW_ONLY_CHECKS=ID[,ID]` somente seleciona quais chamadas de `check`
  são executadas. Sem a variável, o arquivo executa normalmente os 18 casos;
  isso foi confirmado por execução integral.
- Cada caso 13–18 chama `loadState(baseSyntheticState(...))` por conta própria,
  portanto não depende da ordem nem do estado deixado por outro caso.
- `pesquisarNaFatura` exige ao menos dois lançamentos na competência e confirma
  que exatamente um permanece visível. Assim, o filtro está realmente ativo
  antes de `changeMonth()`.
- `trocarMesELerFatura` chama o `changeMonth(1)` ou `changeMonth(-1)` de
  produção e lê imediatamente campo, query e DOM, sem limpar ou sobrescrever o
  termo entre a ação e a asserção.
- `limpezaOk` verifica diretamente: período, campo vazio, query vazia, todos os
  itens novos visíveis, ausência da mensagem falsa e ausência dos itens da
  competência anterior.
- O caso 17 preserva as verificações originais de pesquisa por `NETFLIX`, sem
  resultado legítimo com `amazon` e restauração pelo botão Limpar.
- O caso 18 preserva troca de cartão e saída/reabertura, agora intercaladas com
  duas trocas reais de competência que dependem da limpeza de `changeMonth()`.
- Todos os casos relevantes comparam `JSON.stringify(state.despesas)` antes e
  depois; nenhuma mutação foi observada.
- `Uber Dezembro` é apenas o segundo lançamento necessário para provar que
  `natal` filtra um conjunto real; não há alteração de produto ou harness.

## Prova de mutação independente

Cada caso foi executado sozinho em processo separado com o teste atual. Para o
controle negativo, o harness recebeu somente em memória o `index.html` exato de
`ae9b5bdf3e01b23d9325a60b73dc62a12fbb8455`; nenhum arquivo do checkout foi
substituído.

| Caso | HEAD corrigido | Sem as quatro linhas | Asserções que detectaram a mutação |
|---|---:|---:|---|
| 13 set→out | PASS | FAIL | `campoVazio=false`, `queryInterna=amazon`, `novosVisiveis=false`, `semMsgFalsa=false` |
| 14 out→set | PASS | FAIL | `campoVazio=false`, `queryInterna=netflix`, `novosVisiveis=false`, `semMsgFalsa=false` |
| 15 dez→jan | PASS | FAIL | `campoVazio=false`, `queryInterna=natal`, `novosVisiveis=false`, `semMsgFalsa=false` |
| 16 jan→dez | PASS | FAIL | `campoVazio=false`, `queryInterna=escolar`, `novosVisiveis=false`, `semMsgFalsa=false` |
| 17 pesquisa após troca | PASS | FAIL | `campoVazio=false`, `queryInterna=amazon`, `novosVisiveis=false`, `semMsgFalsa=false` |
| 18 cartão/reabertura + trocas | PASS | FAIL | volta: `queryInterna=netflix`; ida: `queryInterna=farmacia`; em ambas campo não vazio, lista incompleta e mensagem falsa |

Nos casos 17 e 18, as verificações originais permaneceram verdadeiras no
mutante; a falha veio especificamente das novas asserções ligadas à ausência da
limpeza. Isso elimina o falso positivo identificado na reauditoria anterior.

## Validações executadas

- Casos 13–18 isolados no HEAD: **6 PASS / 0 FAIL**, cada processo com
  `TOTAL=1 PASS=1 FAIL=0`.
- Casos 13–18 isolados sem a limpeza: **0 PASS / 6 FAIL**, todos com exit code
  diferente de zero e a asserção causadora registrada acima.
- Arquivo específico completo, sem `FINFLOW_ONLY_CHECKS`:
  **18 PASS / 0 FAIL**.
- Suíte financeira completa: **627 PASS / 0 FAIL**.
- `git diff --check 8720eee..d05d4cc`: **PASS**, sem saída.
- Integridade final de `index.html`: blob do HEAD, working tree e base desta
  rodada iguais a `be7f62c7cb384b48230493e20a8a877228ddce03`.
- Working tree permaneceu limpa após a prova de mutação.
- Backup real: não disponível no repositório; ausência não tratada como falha.

## Segurança do repositório

Nenhum checkout, merge, rebase, push ou publicação foi executado. A referência
`origin/main` permaneceu `71edc74867d89d73832875c4ab456491f207c189` e não
foi alterada. Todos os relatórios anteriores foram preservados.

## Decisão

A correção dos testes fecha o P3 da reauditoria anterior. Os seis casos agora
possuem prova red-green independente e observam o comportamento real de
`changeMonth()` sem preparação artificial que esconda o defeito.

**REAUDITORIA CODEX: PASS**
