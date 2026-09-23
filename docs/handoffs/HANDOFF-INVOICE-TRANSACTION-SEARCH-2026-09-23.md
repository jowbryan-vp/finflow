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
