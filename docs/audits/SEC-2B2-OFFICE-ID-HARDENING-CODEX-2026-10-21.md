# Auditoria independente Codex — SEC-2B2

**Resultado:** `FINFLOW_GATE_SEC2B2_INDEPENDENT_AUDIT: PASS_WITH_CONDITIONS`

**Data:** 21/10/2026

**Branch auditada:** `sec/2-office-id-hardening`

**Base aprovada:** `71185fae8f817ccc69ba2579ecb566924032f3ce`

**Commit auditado:** `c36bc6dd29cde7bb1f19f438cdb1760096185f52`

**Pai direto:** `71185fae8f817ccc69ba2579ecb566924032f3ce`

## Veredito

Não encontrei falha bloqueante na proteção contextual dos identificadores
textuais do domínio escritório. O commit pode encerrar o SEC-2B2, limitado à
segurança de renderização desses IDs. Ele não deve ser interpretado como
saneamento da integridade dos identificadores nem como prova de que o lint
heurístico detecta sozinho todo sink futuro.

## Integridade e escopo do commit

O commit altera exatamente cinco arquivos:

1. `index.html`;
2. `tests/financial-engine/sec2-id-lint.mjs`;
3. `tests/financial-engine/sec2-id-render-office.test.mjs`;
4. `tests/financial-engine/run-all.mjs`;
5. `docs/gates/SEC-2B2-OFFICE-ID-HARDENING.md`.

Dimensão: 800 inserções e 107 remoções. `git diff --check` não encontrou erro.
A revisão linha a linha de `index.html` confirmou mudanças contextuais:
`jsArg(...)` em argumentos de handlers e `esc(...)` em valores de atributos,
com remoção das variáveis previamente escapadas para HTML e reutilizadas como
JavaScript. Não encontrei mudança de motor financeiro, schema, competência,
cartões, OAuth, Drive, cache, sincronização ou regra de negócio.

Hashes dos artefatos auditados:

- `index.html` SHA-256:
  `df9a99e99f116cadfa713dce6b939baa879f74aa79486851a23efe6db181c021`;
- `sec2-id-render-office.test.mjs` SHA-256:
  `f35312f9613ac13f9753960bcba0986524190d3cef47601b233c010967cd1d4f`.

## Inventário dos sinks

Na base `71185fa`, a contraprova isolada reproduziu o inventário original:

| Regra | Quantidade |
|---|---:|
| `HANDLER_QUOTED_RAW` | 70 |
| `HANDLER_ESC` | 31 |
| `ATTR_RAW_ID` | 26 |
| `HANDLER_INDIRECT` | 1 |
| `HANDLER_BARE_OTHER` | 1 |
| **Total** | **129** |

No commit auditado, o gate do lint encontra zero achado de segurança de ID não
justificado no escritório. Permanecem 94 `ATTR_RAW_NONID` no escritório e 218
no arquivo inteiro; são dívida explícita do SEC-2B3, não foram ocultados nem
reclassificados como seguros.

Uma varredura textual independente do trecho do escritório não encontrou sink
de ID cru residual importável. As ocorrências restantes eram texto, chamadas
de função ou IDs internos fixos.

## Whitelist

As duas novas exceções foram examinadas:

- `renderNovoContratoV3Form|i+1`: índice numérico de loop sobre array literal
  fechado, comparado como número;
- `officeAbaResumo|acao`: comando composto somente por literais internos de
  navegação; nenhuma entrada de `state` ou dado importado alcança a variável.

O teste de whitelist confirma oito entradas totais, todas presentes e sem
exceção órfã. Não encontrei justificativa falsa nas duas novas entradas.

## Testes reproduzidos pelo Codex

Resultados independentes:

- lint SEC-2: **4 PASS / 0 FAIL**;
- navegador SEC-2B2: **13 PASS / 0 FAIL**;
- navegador SEC-2B1: **15 PASS / 0 FAIL**;
- suíte financeira completa: **857 PASS / 7 FAIL**;
- `git diff --check`: limpo.

O teste SEC-2B2 usa Chromium real e IDs sintéticos com aspas simples e duplas,
`&`, tag, entidade HTML, Unicode, emoji, espaço, barra invertida, quebra de
linha e tentativa de criar atributos/handlers. Foram exercitados projetos e
contratos V3, recebimentos, custos, RRTs, tributação, modelo anterior,
reservas, repasses, despesas e contas empresariais. Os argumentos entregues
aos handlers e valores de atributos/selects foram comparados exatamente.

Também foram confirmados: ausência de execução, diálogo, elemento/atributo
inesperado e erro de script; ausência de mutação por renderização; e round-trip
pela fronteira `migrateAppData(buildSaveObject())` com preservação exata dos
IDs. O fluxo de seleção de arquivo não é repetido pelo teste novo, mas
`importData` apenas lê/parseia o arquivo e delega à mesma `migrateAppData`,
seguida de save/render; isso não cria um caminho alternativo para os sinks.

A contraprova da base fez o lint reencontrar os padrões vulneráveis. O controle
negativo do implementador, feito fora do commit, reintroduziu os dois sinks de
`officeProjetoLinhaHTML`; lint e Chromium falharam pelo atributo truncado e
handler JavaScript inválido. A revisão independente considera essa
sensibilidade coerente com o mecanismo testado.

## Sete falhas históricas

São nominalmente as mesmas da base SEC-2B1:

1. `G1-C02`;
2. `G1-C06`;
3. interrupção de `gate3-1-distribution-validation.test.mjs` ao escrever em
   elemento inexistente;
4. `INVOICE_PURCHASES_ORDERED_DESC_LEGACY_STABLE_FALLBACK_NO_STATE_CHANGE`;
5. `PCP_EXTRA_OFFICE_GENERATION_NATURE`;
6. `PDV_09_IDENTICAL_TO_BASE`;
7. `UX1R_09_ENGINE_AND_ROWS_IDENTICAL_TO_BASE`.

Nenhuma falha nova foi introduzida. Os testes legados não precisaram ser
alterados no SEC-2B2.

## Condições e limitações

1. O aceite cobre IDs textuais no domínio escritório. IDs vazios, duplicados,
   numéricos, nulos, objetos, referências órfãs e colisões continuam fora do
   escopo; especialmente, exclusões por igualdade podem afetar vários registros
   com ID duplicado.
2. O lint é uma barreira auxiliar. A implementação documentou uma lacuna real
   de `contextAt`: uma tag colada após `}` pode escapar da classificação. O sink
   existente correspondente foi corrigido e a varredura manual não encontrou
   outro residual, portanto isso não bloqueia o código atual. Até endurecer o
   heurístico, mudanças futuras no trecho devem manter revisão manual origem →
   sink; o lint não pode ser citado isoladamente como prova de ausência.
3. Os 94 `ATTR_RAW_NONID` do escritório permanecem reservados ao SEC-2B3.
4. OAuth/Drive reais, dados reais e publicação não foram exercitados nesta
   auditoria.

## Preservação

No encerramento da auditoria, antes deste relatório, a árvore do commit
auditado estava limpa e sem operação Git pendente. Permaneceram preservadas:

- `main`: `cf0b0482741f2a276c11f7ca54d96e44764459e4`;
- `sec/1-xss-render`: `4656f365fab152794ef2839a1caeb979a3f17e53`;
- `sec/2-id-hardening`: `71185fae8f817ccc69ba2579ecb566924032f3ce`;
- worktree W2-P: `30d5e217e255aed93ea9110b6d8f98edec33edb6`.

Nenhum push, merge, rebase, reset destrutivo ou publicação foi realizado.

## Próximo passo

O SEC-2B2 pode ser encerrado com as condições acima. O próximo gate de
segurança é o SEC-2B3, restrito aos valores não-ID crus em atributos, sem
misturá-lo com a dívida semântica de integridade de IDs.
