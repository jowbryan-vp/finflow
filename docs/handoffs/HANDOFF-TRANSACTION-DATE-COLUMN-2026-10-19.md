# Handoff — coluna de data nas listas de transações (19/10/2026)

Implementação Claude Code, para auditoria independente do Codex.

- Worktree: `C:\Dev\FinFlow-datas`
- Branch: `feat/transaction-date-column`
- Hash-base: `784725f` (main local; mesma ponta de `release/main-merge-2026-10-06`)
- Hash da implementação: `ad072fe`
- Escopo: `docs/gates/TRANSACTION-DATE-COLUMN.md`

## Arquivos alterados

- `index.html`: helpers `getDataExibicaoDespesa`, `getDataExibicaoReceita`,
  `fmtDataTransacao`, `itemRowDateHTML`; estilo `.item-row-date`; célula/coluna de
  data nas listas e tabelas do escopo.
- `tests/financial-engine/transaction-date-column.test.mjs` (novo, 13 casos).
- `tests/financial-engine/run-all.mjs`: inclui o novo arquivo.
- `docs/gates/TRANSACTION-DATE-COLUMN.md` (escopo).

## Testes

`cd tests/financial-engine && npm ci --ignore-scripts && npm test`

| | PASS | FAIL |
|---|---|---|
| Base `784725f` | 793 | 7 |
| `ad072fe` | 806 | 7 |

`transaction-date-column`: 13/13. As 7 falhas já existem na base e são as mesmas
nos dois lados: G1-C02, G1-C06 (regra do dia do fechamento),
INVOICE_PURCHASES_ORDERED_DESC_..., PCP_EXTRA_OFFICE_GENERATION_NATURE,
PDV_09_IDENTICAL_TO_BASE, UX1R_09_ENGINE_AND_ROWS_IDENTICAL_TO_BASE. No teste de
ordem da fatura, só os índices de posição no HTML mudam (as linhas ficaram mais
longas); a causa (`-1` da compra no dia do fechamento) é a mesma da base.

## Limitações

- Despesas antigas sem `dataCompra` e receitas do modelo legado ficam com a
  célula vazia (como pedido); parcelas de projeto extra não têm data gravada.
- Despesa pessoal não grava data de pagamento (`pagoMeses` é booleano); por isso
  a coluna mostra compra ou vencimento, nunca a data em que foi paga.
- Parcelas mostram o dia da compra original, não o vencimento da parcela.
- Ordenação das listas não mudou.
- Sem verificação visual manual em navegador real nem com backup real.
- Sem push, merge ou publicação.

## Correção do FAIL P2 (auditoria `TRANSACTION-DATE-COLUMN-CODEX-2026-10-19.md`)

Achado: no celular a célula de data espremia `.item-row-info` até 0 px
(Receitas/Despesas a 390/430 px) e botões saíam da linha.

Correção, só CSS (`index.html`, bloco `@media (max-width:600px)` após
`.item-row-date`): linhas que têm a célula de data passam a quebrar em duas
faixas, data + descrição em cima, valor e ações embaixo à direita
(`flex-wrap`, `::after` de 100% como quebra, `order:2` para o que vem depois
da descrição). Acima de 600 px nada muda. Usa `:has()`; navegador sem suporte
mantém o layout da entrega anterior.

Medidas com o script Codex `docs/audits/verify-transaction-date-column-2026-10-19.mjs`:
`defects: []`, saída 0; largura da descrição 276/250 px (430), 236/210 px
(390), 206/180 px (360) em Receitas/Despesas; nenhum filho além da borda da
linha; state inalterado; sem erros de console.

Teste novo `TDC_13_LAYOUT_CELULAR_E_DESKTOP` (48 linhas, 4 telas — Receitas,
Despesas com acordeão aberto, Transferências, Escritório — em 1440/430/390/360
px; com e sem data, prevista, paga, recebida, resumo de cartão e contribuição):
descrição ≥ 150 px no celular, todos os filhos dentro da linha, data à esquerda,
valor visível; no desktop data, descrição e valor na mesma faixa. Contraprova:
com o `index.html` de `ad072fe` o caso falha (descrição de 7 px a 430 px); com a
correção passa. `transaction-date-column`: 14/14.
