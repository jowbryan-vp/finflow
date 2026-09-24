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
4. Vínculo estrutural completo (ver seção 6) → `office_personal_transfer`.
5. `incomeNature` explícito e válido → esse valor, exceto `office_personal_transfer`
   sem vínculo estrutural, que é falso e cai em `other` (ou `reimbursement` se
   `tipo === 'repasse'`). Um `salary` explícito em
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
- **Repasse pessoal exige vínculo estrutural.** Só é repasse quando a receita
  tem, ao mesmo tempo, `origem === 'office_distribution'`, `officeTransferId`
  string não vazia e um repasse real em `state.office.repasses` com esse mesmo
  `officeTransferId` (`isStructuralOfficeTransfer`). `incomeNature` sozinho
  nunca basta, nem origem sozinha, nem id sozinho, nem id sem repasse
  correspondente. Nunca se olha a descrição.
- **Causa-raiz do achado:** `classifyPersonalIncome` aceitava qualquer
  `incomeNature` válido, e o seletor manual oferecia "Repasse pessoal do
  escritório"; uma "Venda avulsa" declarando essa natureza entrava no repasse
  pendente e no pior cenário.
- **Receita inválida:** é neutralizada (não rejeitada, para não perder o
  lançamento) como `other`. Valor, conta, data, status e demais campos ficam
  intactos; nenhum `officeTransferId` é inventado.
- **Camadas de defesa:**
  - leitura/cálculo: `classifyPersonalIncome` ignora a natureza falsa;
  - persistência (fronteira única): `buildSaveObject` saneia TODOS os perfis,
    ativo e inativos, cada um contra o próprio `office.repasses`, antes de
    qualquer serialização. Cache local, Drive, `saveToDrive`, `scheduleSave` e
    exportação passam por ela; não há normalização isolada por caminho;
  - migração/importação/restauração: `migrateAppData` sanea todos os perfis
    (backup multiperfil) e `migrateState` grava `office_personal_transfer` só com vínculo
    comprovado e neutraliza a falsa; idempotente;
  - interface: a criação e as duas edições não oferecem a opção; ela só
    aparece, desabilitada, em receita que já tem o vínculo. O formulário
    explica que o repasse é criado automaticamente pelo Caixa do Escritório;
    `applyIncomeNatureFromSelect` recusa o valor mesmo se a interface for adulterada.
- **Geração automática:** as duas gerações estruturadas do repasse (regra
  legada e v2) criam receita e repasse juntos e continuam gravando a natureza.
- **Backup:** exportação e importação preservam o campo; um backup legítimo
  (com o repasse em `state.office`) mantém a classificação.

## 7. Lançamentos sem data comprovada

Não ganham competência inventada e ficam fora de todos os valores. São
listados em "Pendências a conferir", com o valor e o motivo:
- receita sem data prevista;
- recebimento sem data válida;
- despesa sem competência;
- despesa com cartão não cadastrado.

## 8. Painel "Destinação" (fonte única)

"Saldo que permanece nas contas" usa `getPersonalMonthProjection().saldoAcumulado`,
a mesma fonte do cartão "Saldo acumulado estimado"; não há mais cálculo
paralelo (antes usava `getTotalsForMonth`/`calcProjecaoFutura`, que divergia).

- **Atual ou futura:** saldo atual das contas pessoais + resultado pendente de
  cada competência até o fim da selecionada. O texto mostra período, fórmula
  (`Saldo atual X + resultado pendente Y`) e diz que não é o saldo de hoje
  nem o resultado do mês.
- **Passada:** o saldo acumulado não existe. O painel mostra outra métrica,
  rotulada "Saldo histórico das contas ao fim de <competência>", que é o corte
  do razão já existente (`calcSaldoContaAte`), nunca o saldo atual.
- Contas e reservas do escritório, e recebíveis, ficam de fora.
- Sem contas cadastradas, o bloco "Guardar em Caixa" continua como antes.

## 9. Gráfico anual "Ano corrente — realizado e previsto"

Quatro séries por mês, todas de `getPersonalMonthFlows` (as mesmas funções dos
cartões mensais, via `getPersonalYearSeries`): Entradas realizadas, Entradas
previstas, Saídas realizadas, Saídas previstas. Barras empilhadas por lado
(entradas e saídas); realizado é sólido e previsto é claro com borda
tracejada, além da legenda em texto. O tooltip mostra mês/ano, a série pelo
nome e o valor. "Previsto" nunca inclui valor realizado. Antes usava
`previstoEntradas`/`totalDespPrevisao` de `getTotalsForMonth`, que incluem o
já recebido/pago.
