# Projeção pessoal por competência e cenários

Branch `fix/personal-cash-projection-scenarios`, base
`2eaf6467d6d8da6f0ba927bd6d414bb65d3274b8`. Implementação no commit
`ed4a3ac79d2c64ab5df95defa832a491476cb498`.

Este documento define a regra. Detalhes de entrega, testes e limitações
estão em `docs/handoffs/HANDOFF-PERSONAL-CASH-PROJECTION-SCENARIOS-2026-09-23.md`.

## 1. Conceitos separados

| Conceito | Fórmula | Usa saldo atual? |
|---|---|---|
| Saldo disponível agora | soma de `calcSaldoConta` das contas pessoais (`state.contas`) | é o próprio saldo |
| Resultado projetado do mês | entradas pendentes − saídas pendentes da competência | não |
| Resultado completo do mês | (entradas realizadas + pendentes) − (saídas realizadas + pendentes) | não |
| Saldo acumulado estimado | saldo agora + resultado projetado de cada competência, do mês atual até a selecionada | sim |

- **Competência passada:** o saldo acumulado mostra "Não disponível para
  competência passada". O saldo histórico não é reconstruído. Os resultados
  do mês continuam disponíveis.
- **Competência futura:** o saldo acumulado inclui o restante do mês atual
  e todos os meses intermediários, cada um contado uma única vez. O limite
  é de 120 meses a partir de hoje.
- **Valores monetários:** todos em centavos inteiros (`toCents`). A
  exibição usa `fmtCentsBRL`, que sempre mostra `−` em valores negativos.

## 2. Período

A competência do cabeçalho (`currentMonth/currentYear`) controla todos os
indicadores mensais, os cenários e a composição.

A seção **"Fluxo de caixa a partir de hoje"** (antes "Seu planejamento a
partir de hoje") continua usando `getChronologicalProjection` e
`getFinancialOutlook`, com estas regras:
- fica separada, abaixo do resumo mensal;
- mostra as datas inicial e final;
- avisa que não é o resultado da competência;
- nunca alimenta os indicadores mensais.

## 3. Entradas: classificação estruturada

A função `classifyPersonalIncome(r, primarySalaryId)` aplica as regras
abaixo em ordem. A primeira que se aplicar decide a classificação, e nenhuma
regra olha a descrição.

1. `tipo === 'resgate'` → movimento interno (resgate legado de cofrinho); não é renda.
2. `certeza === 'potencial'` → potencial. Fica fora de previstas, resultados
   e cenários. Se já tiver sido recebida, conta como realizada em "outras".
3. `id === salário principal` → `salary`. O salário principal é o
   `financialPreferences.primarySalaryId`, ou o único salário recorrente do
   modelo atual quando só existe um.
4. `origem === 'office_distribution'` com `officeTransferId` → `office_personal_transfer`.
5. `incomeNature` explícito e válido → esse valor. Um `salary` explícito em
   lançamento que não é o principal fica em `other`.
6. `tipo === 'repasse'` ("Reembolso de compra no cartão") → `reimbursement`.
7. Qualquer outro caso → `other` ("outras entradas confirmadas").

Outras regras de entrada:
- **Recebido ou pendente:** decidido por `receitaRecebida`, o critério
  canônico já usado pelo app.
- **Receita cancelada:** ignorada.
- **Reembolso de despesa compartilhada** (`d.split` ainda não recebido) é
  reembolso pendente. Quando recebido, sai da divisão. Se for lançado como
  receita, passa a existir só como receita `tipo:'repasse'`, nunca nas duas
  formas ao mesmo tempo.

## 4. Saídas

- **Dinheiro/PIX:** entra por parcela da competência. O status vem de
  `pagoMeses`.
- **Cartão de crédito:** entra somente pela fatura (`calcByCardForMonth`,
  com o ajuste manual de fatura). O status vem de `isFaturaPaga`. As compras
  individuais nunca são somadas junto com a fatura.
- **Contribuição:** entra por `calcContribuicao`, pendente até
  `isContribuicaoPaga`.
- **Fora das saídas:**
  - transferências entre contas (`transferId`);
  - depósitos e resgates de cofrinho, listados só como movimentos internos;
  - tudo em `state.office`.

## 5. Cenários da competência

- **Pior cenário** = salário principal pendente + repasse pessoal pendente −
  todas as saídas pendentes.
- **Melhor cenário** = pior cenário + reembolsos pendentes.

Não entram em nenhum dos dois cenários:
- receitas potenciais;
- outras entradas;
- receita bruta, reservas, imposto e RRT do escritório.

O que já foi recebido não é somado de novo nos cenários.

## 6. Natureza da receita (`incomeNature`)

- **Campo:** opcional, com os valores `salary`, `office_personal_transfer`,
  `reimbursement` e `other`. Quando ausente, a receita fica sem classificação.
- **Gravação:**
  - pelo usuário, no seletor "Natureza da receita" dos formulários de
    criação e de edição (legado e modelo atual);
  - automaticamente, nas duas gerações estruturadas de repasse pessoal do
    escritório.
- **Migração:** só grava o campo quando ele está ausente e a receita tem
  `origem === 'office_distribution'` com `officeTransferId`. É idempotente.
  Nada é classificado por descrição, e valores, datas, contas e status
  ficam intocados.
- **Backup:** exportação e importação preservam o campo, porque o JSON
  completo do perfil já é serializado.

## 7. Lançamentos sem data comprovada

Não ganham competência inventada e ficam fora de todos os valores. São
listados em "Pendências a conferir", com o valor e o motivo:
- receita sem data prevista;
- recebimento sem data válida;
- despesa sem competência;
- despesa com cartão não cadastrado.
