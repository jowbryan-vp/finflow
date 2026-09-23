# Handoff — restauração da pesquisa de lançamento na aba Fatura, 23/09/2026

Fluxo: Claude implementa → Codex audita. Este documento é só a entrega da
implementação; não é auditoria nem aprovação final.

## Branch, HEAD inicial e final

- Branch nova: `fix/invoice-transaction-search`, criada exatamente a partir
  de `9896327775f11c74aed655259dd9028803f862f2` (`origin/feat/project-rrt-requirement`
  confirmado no mesmo commit via `git fetch origin` + `git ls-remote origin
  feat/project-rrt-requirement` antes de qualquer edição).
- Hash-base: `9896327775f11c74aed655259dd9028803f862f2`.
- Commit funcional: `23833c47c6100da578e680e49b3a72a411bb32a2`
  (`fix: restaura pesquisa de lançamento na aba Fatura`).
- Commit documental: este handoff (ver `git log -1` nesta branch).
- `main`: não tocada — nenhum checkout, merge, rebase, push ou publicação.
- Working tree limpa antes de começar e ao final.

## Arquivos alterados

- `index.html` — campo de pesquisa na aba Fatura + lógica de filtragem
  (ver "Correção" abaixo).
- `tests/financial-engine/gate5-invoice-transaction-search.test.mjs` (novo)
  — 12 casos cobrindo o escopo pedido.
- `tests/financial-engine/run-all.mjs` — registra o novo arquivo de teste.

## Investigação — causa-raiz

Busquei no histórico completo (`git log --all`) por qualquer versão prévia
de um campo de pesquisa dentro da aba **Fatura** (`page-cartoes`):

- `git log --all -S"Pesquisar"`, `-S"esquisar"`, `-S"filtrar"` etc. sobre
  `index.html`/`delivery/index.html` não encontraram nenhum campo de busca
  jamais associado à área de Cartões/Faturas.
- O botão global **"Pesquisar Lançamento"** (`abrirPesquisaLancamentos`,
  `index.html:5499` antes desta correção) existe desde o commit-base do
  repositório (`569c1cb`, "baseline snapshot before Gate 1") e sempre
  esteve presente só nos cards de **Receitas** e **Despesas**
  (`index.html:706` e `:780`) — nunca em Cartões/Faturas, em nenhum commit
  rastreado, incluindo os uploads manuais anteriores ao baseline
  (`0e8b934` e outros "Add files via upload").
- Esse botão global busca em `state.despesas`/`state.receitas` de **todos**
  os meses/anos, não filtra a fatura aberta — não é (e nunca foi) o mesmo
  recurso que a especificação pede ("filtrar somente os lançamentos
  exibidos na fatura atual").
- A remoção do importador de PDF (`62dcbef`, Gate 5) alterou o mesmo bloco
  de UI (`page-cartoes`) mas só tirou o formulário de importação — o diff
  desse commit (`git show 62dcbef -- index.html`) não toca nenhum campo de
  busca, porque nenhum existia ali antes.

**Conclusão:** não há, no histórico rastreado neste repositório, nenhum
commit que tenha removido uma pesquisa de lançamento *da aba Fatura*
especificamente — a lógica de busca (a função de correspondência
case-insensitive por descrição) sempre existiu, mas só ligada ao modal
global de Receitas/Despesas. A aba Fatura nunca teve um filtro inline
próprio. Tratei isso como a lacuna a fechar: um campo de pesquisa **novo**,
mas **reaproveitando o mesmo comportamento** (correspondência por
substring, case-insensitive, texto vazio mostra tudo) já usado pela busca
global, só que escopado apenas aos lançamentos da fatura aberta —
conforme pedido explicitamente ("Reutilize o comportamento anterior sempre
que possível, evitando recriar uma regra diferente").

Nem a UI nem a lógica de pesquisa *da fatura* foram removidas em algum
momento — porque nenhuma das duas existia antes desta correção. A busca
global (Receitas/Despesas) continua intacta e não foi tocada.

## Correção implementada

`index.html`:

1. **Campo visível** — novo `<input id="cartaoFaturaSearchInput">` +
   botão "Limpar", inseridos no card "Fatura" (`page-cartoes`), logo abaixo
   do botão "Nova compra no cartão" e acima da lista
   `#cartaoFaturaItens`. `oninput="renderFaturaCartoes()"` re-renderiza a
   cada tecla.
2. **Filtragem só de apresentação** — em `renderFaturaCartoes()`:
   - `itens` continua sendo **todas** as compras da fatura
     (`getDespesasForMonth(...).filter(d=>d.cartao===cardId)`), usado sem
     nenhuma alteração para `total` (`calcByCardForMonth`), `paga`
     (`isFaturaPaga`) e todo o resumo (`cartaoFaturaResumo`).
   - `itensExibidos = itens.filter(d=>matchFaturaSearch(d,query))` só
     decide o que é impresso em `#cartaoFaturaItens`; sem `query`,
     `itensExibidos===itens` (texto vazio = comportamento anterior).
   - A ordenação (`ordenarItensFaturaDesc`, Gate 5) é aplicada sobre
     `itensExibidos`, preservando a mesma ordem relativa de antes.
   - Sem nenhuma compra na fatura: mensagem original "Nenhuma compra nesta
     fatura ainda." (inalterada). Com compras mas sem correspondência da
     busca: nova mensagem "Nenhum lançamento encontrado com esse termo
     nesta fatura." — nenhum dado é apagado ou tocado em nenhum dos casos.
3. **`matchFaturaSearch(d, query)`** (função pura, nova) — compara
   `query` (já em minúsculas) contra: descrição (`d.desc`), categoria,
   subcategoria, cartão, valor formatado (`fmtBRL`) e data da compra
   (`dd/mm/aaaa` e ISO), cobrindo o mínimo pedido (descrição) e os
   critérios opcionais (valor/data/categoria/cartão) mesmo eles não tendo
   existido antes — decisão de produto: reaproveitar os mesmos campos já
   exibidos em cada linha da fatura (`despItemHTML`), então o usuário só
   pode buscar por algo que já está visível na tela.
4. **Limpeza** — `limparPesquisaFatura()` esvazia o campo e re-renderiza.
   O campo também é esvaziado automaticamente ao trocar de
   fatura/cartão (`selecionarFaturaCartao`) e ao sair da aba Fatura
   (`navigate()`), mesma convenção já usada pelos filtros de
   Despesas/Receitas (`despCartaoFiltro`, `_recFiltro`, `_despFiltro`)
   nessas mesmas funções — evita um termo de uma fatura filtrar
   silenciosamente outra fatura ou outra aba depois de navegar.

**Nada tocado:** `state.despesas` (nenhuma escrita em todo o fluxo de
busca), `calcByCardForMonth`, `isFaturaPaga`, `ordenarItensFaturaDesc`,
`getDespesasForMonth`, o importador de PDF (permanece comentado/fora da
UI, Gate 5), RRT, distribuição do escritório, Sainte-Laguë, contas,
transferências ou qualquer outro motor financeiro.

## Testes

Novo arquivo `tests/financial-engine/gate5-invoice-transaction-search.test.mjs`
(harness real via Playwright, mesmo padrão dos demais testes), registrado
em `run-all.mjs`. 12 casos:

1. `INVOICE_SEARCH_01_FIELD_VISIBLE` — campo visível dentro de `#page-cartoes`.
2. `INVOICE_SEARCH_02_FILTER_BY_DESCRIPTION` — filtra por descrição.
3. `INVOICE_SEARCH_03_CASE_INSENSITIVE` — maiúsculas/minúsculas/mistas.
4. `INVOICE_SEARCH_04_NO_MATCH_MESSAGE` — mensagem clara, `state.despesas` intacto.
5. `INVOICE_SEARCH_05_CLEAR_RESTORES_FULL_LIST` — botão "Limpar" restaura tudo.
6. `INVOICE_SEARCH_05B_EMPTY_TEXT_SHOWS_ALL` — apagar texto manualmente também restaura tudo.
7. `INVOICE_SEARCH_06_EMPTY_INVOICE` — fatura sem compras mantém mensagem original, com ou sem busca.
8. `INVOICE_SEARCH_07_ORDER_PRESERVED` — ordenação original preservada com filtro ativo.
9. `INVOICE_SEARCH_08_TOTAL_UNCHANGED` — total/resumo/status inalterados durante a filtragem.
10. `INVOICE_SEARCH_09_DESPESAS_UNCHANGED` — `state.despesas` byte-a-byte idêntico após buscar/limpar.
11. `INVOICE_SEARCH_11_PDF_IMPORTER_STILL_ABSENT` — importador de PDF continua fora da UI.
12. `NO_SCRIPT_ERRORS` — nenhum erro de console.

### Resultados

```
node tests/financial-engine/gate5-invoice-transaction-search.test.mjs
gate5-invoice-transaction-search: TOTAL=12 PASS=12 FAIL=0

node tests/financial-engine/run-all.mjs
FINFLOW FINANCIAL-ENGINE SUITE: TOTAL_PASS=621 TOTAL_FAIL=0
```

`git diff --check`: sem problemas de espaço em branco (saída vazia, exit 0).

### Comparação com backup real

Não executada: nenhum arquivo de backup real (`*backup*.json`) está
disponível neste ambiente/repositório, e nenhum caminho foi fornecido.
Risco considerado baixo — esta correção não toca nenhuma função de
cálculo usada por `compare-real-backup.mjs` (`calcByCardForMonth`,
`getDespesasForMonth`, saldo, projeção, etc.); é puramente um filtro de
apresentação sobre uma lista já calculada. Recomenda-se rodar
`compare-real-backup.mjs` com o backup real antes do gate final, se
disponível.

## Diff — escopo confirmado

```
git diff --stat 9896327..HEAD -- index.html tests/financial-engine
 index.html                                                    | 46 +++++++++++--
 tests/financial-engine/gate5-invoice-transaction-search.test.mjs | 249 ++++++++++++
 tests/financial-engine/run-all.mjs                             | 11 +
```

Nenhum outro arquivo alterado. `delivery/index.html` (snapshot histórico)
não foi tocado, como em correções anteriores.

## Limitações

- A busca por valor/data/categoria/cartão foi adicionada como extensão
  razoável (reaproveitando campos já exibidos na linha da fatura), não por
  ter existido antes — não há registro de que algum dia existiu.
- Comparação com backup real não executada (arquivo indisponível neste
  ambiente); ver seção acima.
- Working tree limpa ao final; nenhum push, merge ou alteração em `main`.

---

## Correção pós-auditoria Codex — P2 (filtro residual ao trocar mês/ano)

Fluxo: Claude corrige → Codex reaudita. Esta seção é só a entrega da
correção; não é aprovação. O relatório de auditoria
(`docs/audits/INVOICE-TRANSACTION-SEARCH-CODEX-AUDIT-2026-09-23.md`) não foi
editado.

### Proveniência

- Branch: `fix/invoice-transaction-search` (sem checkout/merge/rebase/push;
  `main` não tocada).
- Hash-base recebido: `ae9b5bdf3e01b23d9325a60b73dc62a12fbb8455`
  (`docs: registra auditoria da pesquisa na fatura`), confirmado antes de
  qualquer edição, com working tree limpa e diff vazio.
- Commit funcional: `98ed82663521310f3d1aac9dc0577b0313ff3ec4`
  (`fix: limpa pesquisa da fatura ao trocar mes/ano (P2 auditoria Codex)`).
- Commit documental: este acréscimo ao handoff (ver `git log -1`).

### Causa-raiz

`changeMonth(dir)` altera `currentMonth/currentYear` e chama `renderAll()`,
mas não esvaziava `#cartaoFaturaSearchInput`. `renderFaturaCartoes()` lê o
termo diretamente do campo a cada render — não existe outra variável de
estado da pesquisa —, então o termo da competência anterior era reaplicado
à nova fatura, que podia abrir com "Nenhum lançamento encontrado com esse
termo nesta fatura." falso. As limpezas já existentes cobriam só troca de
cartão (`selecionarFaturaCartao`) e saída da aba (`navigate`).

`changeMonth()` é o único código que altera `currentMonth/currentYear`
após a inicialização (conferido por busca em `index.html`), portanto é o
único ponto a corrigir — inclusive para as viradas dez→jan e jan→dez, que
passam pelo mesmo caminho.

### Correção

`index.html`, `changeMonth()`: esvazia `#cartaoFaturaSearchInput` depois de
ajustar mês/ano e antes de `updatePeriodLabel(); renderAll();` (+4 linhas,
mesma convenção de `selecionarFaturaCartao`/`navigate`). Como o campo é a
única fonte do termo, limpar o campo limpa campo visual e estado interno
juntos. Nenhuma alteração em total (`calcByCardForMonth`), status
(`isFaturaPaga`), ordenação (`ordenarItensFaturaDesc`), `state.despesas`,
`matchFaturaSearch`, busca global, importador de PDF, RRT, escritório,
contas ou transferências.

### Arquivos alterados

- `index.html` — +4 linhas em `changeMonth()`.
- `tests/financial-engine/gate5-invoice-transaction-search.test.mjs` —
  +6 casos (e cabeçalho de critérios atualizado). `run-all.mjs` já
  registrava o arquivo; não foi alterado.

### Testes novos

Fixture com lançamentos exclusivos por competência (set/out/dez 2026,
jan 2027), todos comprados antes do fechamento do Nubank (dia 3). Os casos
13–16 abrem a fatura, pesquisam um termo exclusivo do mês de origem,
confirmam o filtro ativo, chamam o `changeMonth(±1)` real e verificam:
período correto; campo vazio e query efetiva vazia; todos os lançamentos
da nova competência visíveis; ausência de "Nenhum lançamento
encontrado…"; nenhum item do mês anterior; `calcByCardForMonth` igual à
soma completa da fixture e esse total no resumo; status "Pendente";
`state.despesas` byte a byte inalterado.

13. `INVOICE_SEARCH_13_SEP_TO_OCT_CLEARS_SEARCH` — setembro → outubro.
14. `INVOICE_SEARCH_14_OCT_TO_SEP_CLEARS_SEARCH` — outubro → setembro.
15. `INVOICE_SEARCH_15_DEC_TO_JAN_CLEARS_SEARCH` — dez/2026 → jan/2027.
16. `INVOICE_SEARCH_16_JAN_TO_DEC_CLEARS_SEARCH` — jan/2027 → dez/2026.
17. `INVOICE_SEARCH_17_SEARCH_WORKS_AFTER_MONTH_CHANGE` — após a troca,
    pesquisar filtra, sem correspondência mostra a mensagem legítima,
    limpar restaura; `state.despesas` intacto.
18. `INVOICE_SEARCH_18_CARD_SWITCH_AND_REOPEN_STILL_CLEAR` — troca de
    cartão e sair/reabrir a aba continuam limpando e exibindo tudo.

`NO_SCRIPT_ERRORS` continua ao final cobrindo todos os casos (console
vazio).

**Correção desta afirmação (reauditoria P3):** a versão original deste
parágrafo dizia que os casos 13–18 falhavam sem a correção. Isso era
falso: só 13–16 dependiam da limpeza; 17 e 18 passavam sem ela (as falhas
deles observadas naquela rodada vinham de uma fixture com datas após o
fechamento, depois ajustada). A evidência real, após o fortalecimento dos
casos 17 e 18, está na seção "Fortalecimento dos casos 17 e 18" abaixo.

### Resultados

```
node tests/financial-engine/gate5-invoice-transaction-search.test.mjs
gate5-invoice-transaction-search: TOTAL=18 PASS=18 FAIL=0

node tests/financial-engine/run-all.mjs
FINFLOW FINANCIAL-ENGINE SUITE: TOTAL_PASS=627 TOTAL_FAIL=0

git diff --check   -> sem saída, exit 0
```

### Verificação prática no navegador

Chromium via harness isolado do projeto (`index.html` real, fixture
sintética; o app normal exige login Google, não contornado). Interação
real: digitação no campo (`page.fill`) e clique nos botões `‹`/`›` do
cabeçalho de período:

- Set 2026 + "amazon" → `›` → Out 2026: campo vazio, "Netflix Outubro"
  visível, total R$ 55,90, status Pendente.
- Out + "netflix" → `‹` → Set: campo vazio, "Amazon Prime" visível.
- Dez 2026 + "natal" → `›` → Jan 2027: campo vazio, "Material Escolar
  Janeiro" visível.
- Jan 2027 + "escolar" → `‹` → Dez 2026: campo vazio, "Presente Natal
  Dezembro" visível.
- `state.despesas` idêntico ao início; nenhum erro de console.

### Limitações

- Comparação com backup real continua não executada (nenhum backup
  disponível no ambiente).
- Verificação no navegador feita no harness isolado com fixture sintética,
  não na instância autenticada do app.
- Decisão final cabe à reauditoria Codex.

---

## Fortalecimento dos casos 17 e 18 (reauditoria Codex — P3)

Fluxo: Claude corrige → Codex reaudita. Só testes e este handoff; os
relatórios Codex não foram editados.

### Proveniência

- Branch: `fix/invoice-transaction-search` (sem checkout/merge/rebase/push;
  `main` não tocada — `origin/main` continua em
  `71edc74867d89d73832875c4ab456491f207c189`; não há `main` local).
- Hash-base recebido: `8720eee07e55f85203c9113b71dc8a8e846b7861`
  (`docs: registra reauditoria da correção da pesquisa`), confirmado com
  working tree limpa e diff vazio; `98ed826` (funcional) e `6f4f7be`
  (handoff) conferidos na ancestralidade.
- Commit de testes: `9d88ca7971ca442793b2a3e16159874ba1856e43`
  (`test: casos 17/18 da pesquisa na fatura dependem da limpeza de changeMonth`).
- Commit documental: este acréscimo (ver `git log -1`).
- `index.html` byte a byte inalterado nesta rodada: blob
  `be7f62c7cb384b48230493e20a8a877228ddce03` em `8720eee` e no HEAD final.

### Problema (P3)

17 sobrescrevia o termo residual (`NETFLIX`) logo após `changeMonth(1)`,
antes de qualquer verificação; 18 testava só troca de cartão e
sair/reabrir, sem passar por `changeMonth()`. Ambos passavam sem a
limpeza.

### Alterações em `gate5-invoice-transaction-search.test.mjs`

- Auxiliares comuns aos casos 13–18:
  - `pesquisarNaFatura` digita o termo e confirma que ele filtra de fato
    (exatamente 1 de ≥ 2 lançamentos da competência visível). Dezembro
    ganhou um 2º lançamento (`Uber Dezembro`) para "natal" filtrar de
    verdade.
  - `trocarMesELerFatura(dir)` chama o `changeMonth(dir)` real e lê a
    fatura nova imediatamente, sem digitar nem limpar nada no meio.
  - `limpezaOk` agrupa as asserções que dependem da limpeza: período
    esperado, campo vazio, query efetiva vazia (o campo é a única fonte do
    termo), todos os lançamentos da nova competência visíveis, sem
    "Nenhum lançamento encontrado…", sem itens do mês anterior.
- Cada caso 13–18 faz o próprio `loadState`; nenhum depende de outro.
- **Caso 17:** setembro com "amazon" ativo e filtrando → `changeMonth(1)`
  → **nova asserção `limpezaOk(troca, '10/2026')`** imediatamente após a
  troca. Só depois repete o objetivo original: "NETFLIX" filtra, "amazon"
  mostra a mensagem legítima de sem resultado, Limpar restaura,
  `state.despesas` intacto.
- **Caso 18:** mantém o objetivo original (troca de cartão e
  sair/reabrir limpam e mostram a fatura completa), intercalado com duas
  trocas reais com pesquisa ativa e confirmada:
  - out "netflix" → `changeMonth(-1)` → **nova asserção
    `limpezaOk(trocaVolta, '9/2026')`**;
  - set "farmacia" → `changeMonth(1)` → **nova asserção
    `limpezaOk(trocaIda, '10/2026')`**;
  - mais `state.despesas` byte a byte intacto ao final.
- `FINFLOW_ONLY_CHECKS=ID[,ID]` (opcional, só neste arquivo) roda casos
  isolados; sem a variável, o arquivo roda inteiro como antes.

### Controle negativo (mutação)

`index.html` substituído temporariamente pelo de
`ae9b5bdf3e01b23d9325a60b73dc62a12fbb8455`: `git diff ae9b5bd 98ed826 --
index.html` são exatamente as 4 linhas da limpeza. Blob mutante
`72a4ed7…` = blob de `ae9b5bd`. Cada caso rodou em processo próprio
(`FINFLOW_ONLY_CHECKS=<ID>`):

| Caso | Sem a limpeza | HEAD corrigido |
|---|---|---|
| 13 set→out | FAIL (exit 1) | PASS |
| 14 out→set | FAIL (exit 1) | PASS |
| 15 dez→jan | FAIL (exit 1) | PASS |
| 16 jan→dez | FAIL (exit 1) | PASS |
| 17 pesquisa após troca | FAIL (exit 1) | PASS |
| 18 cartão/reabrir + trocas | FAIL (exit 1) | PASS |

Causa das falhas sem a limpeza, pelos detalhes registrados:
- `campoVazio:false`;
- `queryInterna` igual ao termo antigo;
- `novosVisiveis:false`;
- `semMsgFalsa:false`.

No 17 e no 18, as partes originais continuaram `true`
(`filtraNetflix`, `semMatchLegitimo`, `limparRestaura`, `cartaoLimpa`,
`reabrirLimpa`). A falha vem só da ausência da limpeza em `changeMonth()`.

Depois da mutação, `index.html` foi restaurado de cópia de segurança. O
hash `be7f62c…` é igual ao blob do HEAD e `git diff --quiet index.html`
passou.

### Resultados

```
node tests/financial-engine/gate5-invoice-transaction-search.test.mjs
gate5-invoice-transaction-search: TOTAL=18 PASS=18 FAIL=0

node tests/financial-engine/run-all.mjs
FINFLOW FINANCIAL-ENGINE SUITE: TOTAL_PASS=627 TOTAL_FAIL=0

git diff --check   -> sem saída, exit 0
```

Diff desta rodada: só
`tests/financial-engine/gate5-invoice-transaction-search.test.mjs` (commit
de testes) e este handoff (commit documental).

### Limitações

- Comparação com backup real continua não executada (sem backup no
  ambiente).
- Decisão final cabe à reauditoria Codex.
