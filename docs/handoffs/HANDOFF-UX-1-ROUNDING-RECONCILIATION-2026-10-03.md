# Handoff — correção P2 do UX-1: conciliação da lista "A pagar" com o card, 03/10/2026

Fluxo: Claude implementa → Codex audita. Este documento é a entrega da
correção, não uma auditoria nem uma aprovação. Achado de origem:
`docs/audits/UX1-E-PARCELADA-CODEX-2026-10-03.md` (P2). Especificação:
`docs/gates/UX-1-DASHBOARD-CAIXA.md`, regra 4 (nota adicionada).

## Proveniência

- **Branch:** `fix/parcelada-dia-vencimento`.
- **Hash-base:** `87f068e83e0e783d8309cf96ebcb205fa778a72a` (ponta auditada, FAIL P2).
- **Commit funcional:** `8909c98b4b5376d943a0b3c87a59773fd2042fb3`.
- **Hash-final:** commit documental com este handoff, a nota na
  especificação e `docs/PROGRESS.md` (ver `git log -1`).
- Relatório e script do Codex (`UX1-E-PARCELADA-CODEX-2026-10-03.md`,
  `repro-ux1-rounding-2026-10-03.mjs`) e os dois relatórios
  `PERSONAL-CASH-PROJECTION-SCENARIOS-REAUDIT*.md` continuam não rastreados e
  sem alteração.
- Sem push, merge, rebase ou alteração de `main`. Nenhum gate novo iniciado.

## Causa

`renderCashHighlight` mostra `toCents(p.obligations)`: o motor soma valores
com frações de centavo e só o agregado é arredondado. `getCashObligationItems`
arredondava cada linha e a lista somava as linhas arredondadas. Com duas
faturas de 100/3: card 66,67; linhas 33,33 + 33,33 = 66,66.

## Correção (só apresentação)

- `getCashObligationItems(p)` (`index.html:7732`): calcula
  `adjustCents = toCents(p.obligations) − Σ linhas`. Se for diferente de zero,
  acrescenta um item `{id:'rounding', kind:'rounding', label:'Ajuste de
  arredondamento', amountCents:adjustCents, date:null}`. Assim, a soma do
  array é igual ao card por construção.
- `renderProximosVencimentos` (`index.html:7767`): separa o ajuste das linhas
  pagáveis e o exibe em `#cashPayAdjust` (`.cash-pay-adjust`, **fora** de
  `.cash-pay-row`), antes do total. O ajuste não tem data, status nem botão
  "✓ Pago". O sinal é explícito (`+ R$ 0,01` / `− R$ 0,01`) e o texto diz
  "Frações de centavo das parcelas: cada linha mostra o valor arredondado, o
  total usa a soma exata. Não é uma conta a pagar." O total da lista soma
  linhas + ajuste.
- CSS: estilo atenuado para `.cash-pay-adjust` e o mesmo empilhamento de
  `.cash-pay-row` em telas ≤ 480 px.
- Inalterados: `getFinancialOutlook` e o restante do motor, valores de cada
  linha, card, Necessidade/Folga, `state`, persistência, ações de pagamento,
  regra/rótulo de vencimento das parceladas.

Alternativa descartada: distribuir os centavos entre as linhas (maior resto).
Isso mudaria o valor de uma fatura no Dashboard em relação à tela de
Cartões/Faturas e esconderia a diferença, contrariando o pedido de tornar
explícito qualquer ajuste.

## Testes

Arquivo novo `tests/financial-engine/ux1-rounding-reconciliation.test.mjs`
(11 casos, registrado em `run-all.mjs`). Hoje fixado em 03/10/2026, "Planejar
até" 31/10/2026, só dados sintéticos. Invariante verificada em cada cenário:
Σ linhas exibidas + ajuste exibido = total exibido = card exibido =
`toCents(p.obligations)`.

| Caso | Cenário | Resultado |
|---|---|---|
| UX1R_01 | Repro Codex: 2 faturas 100/3 | 33,33 + 33,33 + **+0,01** = 66,67 = card |
| UX1R_02 | 3 faturas 100/3 (com/sem data) | 99,99 + 0,01 = 100,00 |
| UX1R_03 | 2 faturas 200/3 | 133,34 **− 0,01** = 133,33 |
| UX1R_04 | 2 faturas + PIX parcelado com dia + contribuição 20/3 | 106,66 + 0,01 = 106,67; folga = disponível − card |
| UX1R_05 | Parcelas exatas | sem linha de ajuste |
| UX1R_06 | "✓ Pago" + modal em 2 faturas, sequencialmente | 66,66 + 0,01 = 66,67 → 33,33 sem ajuste; folga inalterada |
| UX1R_07 | Pagar PIX e depois contribuição | 73,33 sem ajuste → 66,66 + 0,01 = 66,67; folga inalterada |
| UX1R_08 | Renderizar Dashboard/Análise | `state` idêntico, nada gravado |
| UX1R_09 | Comparação com `87f068e` (3 fixtures) | motor (3 horizontes), projeção pessoal, linhas pagáveis, cards e `state` idênticos |
| UX1R_10 | 390 px | sem rolagem lateral com a linha de ajuste |
| UX1R_11 | Console | sem erros |

As comparações de motor existentes continuam passando: `UX1_13` contra
`a90547f` e o caso de equivalência de `parcelada-dia-vencimento` contra
`a475634`.

## Comandos e resultados (raiz do repositório)

```text
node tests/financial-engine/run-all.mjs
  → TOTAL_PASS=757 TOTAL_FAIL=0, exit 0  (base 746 + 11 novos)
    ux1-cash-dashboard 17/17 · parcelada-dia-vencimento 13/13 · ux1-rounding-reconciliation 11/11
node docs/audits/repro-ux1-rounding-2026-10-03.mjs           → card 66,67 = lista 66,67, exit 0
node docs/audits/repro-ux1-rounding-2026-10-03.mjs 87f068e   → FAIL reproduzido na base, exit 1
git diff --check                                              → sem erros
```

O script do Codex mede `getCashObligationItems(p)`, que agora inclui o item de
ajuste. As linhas `.cash-pay-row` que ele imprime continuam 33,33 + 33,33, e o
ajuste aparece em `#cashPayAdjust`, fora dessas linhas.

## Limitações e pontos para o revisor

- **Mudança de contrato:** `getCashObligationItems` pode devolver um item
  `kind:'rounding'`, que não é evento do motor. Os consumidores no código são
  `renderProximosVencimentos` e o script do Codex. Quem quiser apenas as
  obrigações pagáveis precisa filtrar `kind!=='rounding'`.
- O ajuste fica limitado a meio centavo por linha. Ele não aparece quando o
  arredondamento por linha coincide com o do agregado.
- Necessidade/Folga continuam como `toCents(p.available − p.obligations)`,
  sem alteração. Nos cenários testados, o resultado é igual a disponível
  exibido − card. Se o saldo disponível também tiver frações de centavo, essa
  subtração dos cards pode divergir em 1 centavo. Isso não foi tratado porque
  fica fora do escopo autorizado, que cobre lista, total e card.
- Somente dados sintéticos. Não houve validação com backup real, OAuth/Drive
  autenticado nem inspeção visual manual, e não foram geradas capturas novas.
- Os pontos EXTERNAL_REVIEW_REQUIRED do patch de parceladas continuam como
  registrados na auditoria Codex.
