# Handoff — projeção pessoal por competência e cenários, 23/09/2026

Fluxo: Claude implementa → Codex audita. Este documento é a entrega da
implementação, não uma auditoria nem uma aprovação.

## Proveniência

- **Branch:** `fix/personal-cash-projection-scenarios`, criada a partir de
  `2eaf6467d6d8da6f0ba927bd6d414bb65d3274b8` (`docs: registra reauditoria
  final da pesquisa na fatura`, com o relatório final PASS da pesquisa da
  fatura).
- **Conferência antes de editar:** branch correta, working tree limpa, HEAD
  igual à base e nenhum commit à frente.
- **Hash-base:** `2eaf6467d6d8da6f0ba927bd6d414bb65d3274b8`.
- **Commit funcional:** `ed4a3ac79d2c64ab5df95defa832a491476cb498`
  (`feat: projecao pessoal por competencia com pior/melhor cenario`).
- **Commit documental:** este handoff mais o documento da regra (ver `git log -1`).
- **Repositório:** `main` não foi tocada (`origin/main` continua em
  `71edc74…`). Não houve push, merge, rebase nem publicação.

## Causa do problema anterior

O Dashboard misturava três contas diferentes na mesma tela:

- O bloco superior ("Seu planejamento a partir de hoje") usava
  `getChronologicalProjection(hoje, fim do ciclo)`, um intervalo de datas
  que ignora a competência do cabeçalho. O "Saldo projetado" desse bloco é
  saldo atual − obrigações + a receber − estimativa variável. Quando não
  há eventos datados no intervalo, ele coincide com o saldo atual (ex.:
  R$ 374,77), mesmo que o mês selecionado tenha entradas e saídas previstas.
- O "Detalhamento do mês" usava `getTotalsForMonth` da competência.
  Nele, "Previsão de Entrada/Saída" eram totais que incluíam o que já
  aconteceu, e não havia resultado nem composição.
- Os cenários de `getTotalsForMonth` partiam do saldo das contas e não
  separavam salário, repasse do escritório e reembolso.

## Solução

### Motor

Funções puras em `index.html`, antes do bloco "GATE 3 — CAIXA DO ESCRITÓRIO":

- `getPersonalMonthFlows(mes, ano)`: entradas e saídas realizadas e
  pendentes da competência, por natureza e por tipo, com itens, resultados
  e cenários.
- `getPersonalMonthProjection(mes, ano, {today})`: acrescenta o período
  (past/current/future), o saldo disponível agora, o saldo acumulado
  estimado e as pendências sem data.
- `classifyPersonalIncome`, `getPrimarySalaryId`,
  `getPersonalUndatedPendencies`, `toCents` e `fmtCentsBRL`.

As fórmulas e as regras estão em
`docs/gates/PERSONAL-CASH-PROJECTION-SCENARIOS.md`.

### Fontes de cada valor

| Valor | Fonte |
|---|---|
| Saldo disponível agora | `calcSaldoConta` de cada `state.contas` (só pessoal) |
| Entradas por competência | `getReceitasForMonth` + `receitaRecebida` + `valorReceita` |
| Salário principal | `financialPreferences.primarySalaryId` (mesma regra do seletor/ciclo) |
| Repasse pessoal | receita pessoal com `origem:'office_distribution'` + `officeTransferId` |
| Reembolso | `tipo:'repasse'`, `incomeNature:'reimbursement'`, `getRepassesForMonth` não recebidos |
| Despesas Dinheiro/PIX | `getDespesasForMonth` (`_valorParcela`, `_pago`) |
| Faturas | `calcByCardForMonth` (com `faturasAjustes`) + `isFaturaPaga` |
| Contribuição | `calcContribuicao` + `isContribuicaoPaga` |
| Potenciais | receitas `certeza:'potencial'` não recebidas |

### Estratégia contra dupla contagem

- **Receitas:** cada ocorrência entra uma única vez, como realizada ou
  como pendente (critério canônico `receitaRecebida`).
- **Repasse do escritório:** só a receita pessoal vinculada conta. Os
  registros em `state.office.repasses`, recebíveis, reservas, imposto e
  RRT nunca são lidos pelo motor.
- **Cartão:** entra só pela fatura, nunca somado às compras.
- **Reembolso:** a despesa original continua cheia e o reembolso é uma
  linha própria de entrada. A divisão pendente e a receita de reembolso
  nunca coexistem.
- **Transferências e cofrinho:** transferências (`transferId`) e depósitos
  ou resgates de cofrinho são internos. Afetam só o saldo das contas, uma
  vez, pelo `calcSaldoConta` já existente.
- **Saldo acumulado:** o resultado de cada mês intermediário é somado uma
  vez, e o saldo atual entra só uma vez.

### Modelo e migração

- **Campo novo:** `incomeNature`, opcional, em cada receita.
- **Seletor "Natureza da receita":** fica no formulário de adicionar e nos
  dois modais de edição (legado e modelo atual). "Sem classificação" remove
  o campo. Receitas derivadas do escritório continuam sem edição no lado
  pessoal (comportamento anterior preservado).
- **Geração automática:** as duas gerações estruturadas de repasse pessoal
  (regra legada e regra v2) passam a gravar
  `incomeNature:'office_personal_transfer'`.
- **Migração (`migrateState`):** só grava o campo quando ele está ausente
  e a receita tem `origem==='office_distribution'` com `officeTransferId`.
  - é idempotente;
  - não usa descrição;
  - não altera valores, datas, contas nem status;
  - não classifica nenhum outro registro antigo.

### Interface (Dashboard)

1. **Resumo pessoal da competência, linha 1:** Saldo disponível agora ·
   Entradas previstas · Saídas previstas · Resultado projetado do mês, com a
   fórmula real (ex.: `R$ 7.040,99 − R$ 11.862,48 = − R$ 4.821,49`).
2. **Linha 2:** Entradas já recebidas · Saídas já pagas · Resultado completo
   do mês (com fórmula) · Saldo acumulado estimado.
3. **Títulos e aparência:**
   - títulos completos, que quebram linha e nunca usam reticências;
   - grade `auto-fit`, que reflui para várias linhas em telas estreitas;
   - resultado positivo em verde, negativo em vermelho, zero neutro;
   - sinal `−` e texto ("negativo (falta)", "positivo (sobra)", "zero
     (equilíbrio)") além da cor.
4. **Composição:**
   - entradas pendentes e realizadas: salário principal, repasse pessoal,
     reembolsos, outras, e receitas potenciais à parte;
   - saídas pendentes e pagas: despesas, faturas, contribuição, com os
     lançamentos.
5. **Cenários:** pior e melhor, com salário, repasse, reembolsos ("não
   considerados" no pior), saídas e resultado.
6. **Pendências a conferir:** lançamentos sem data, fora dos cálculos.
7. **"Fluxo de caixa a partir de hoje":** separado, abaixo, com datas e
   aviso. Os rótulos passaram a ser "Após obrigações do período" e "Saldo
   projetado em DD/MM/AAAA (fim do período)". O card antigo "Detalhamento
   do mês" foi substituído pela composição acima.

## Arquivos alterados

- `index.html`: motor, renderização do resumo, CSS `.pm-*`, seletor de
  natureza, geração automática e migração do `incomeNature`, renomeação da
  seção "a partir de hoje".
- `tests/financial-engine/personal-cash-projection-scenarios.test.mjs`
  (novo): 55 casos.
- `tests/financial-engine/run-all.mjs`: registra o arquivo novo.
- `docs/gates/PERSONAL-CASH-PROJECTION-SCENARIOS.md` e este handoff
  (commit documental).

## Testes

`personal-cash-projection-scenarios.test.mjs` cobre os itens 1 a 51 da
especificação. O item 52 é a suíte `run-all.mjs`. Casos principais:

| Itens | Casos |
|---|---|
| 1–4 | exemplo −4.821,49; positivo 2.500,00; zero; sinal `−` |
| 5–7 | saldo fora do resultado; dentro do acumulado (atual e futuro); passado sem reconstrução |
| 8–12 | pior −4.871,49 / melhor −4.821,49; potencial fora |
| 13–15, 27–28 | escritório (recebível bruto, Sicoob TH, 4 reservas de sistema, imposto, RRT) e cofrinho não afetam nada pessoal |
| 16–19 | repasse sem duplicidade; repasse parcial; salário e reembolso recebidos só no realizado |
| 20–26 | reembolso não abate despesa; sem duplicação; pagamento e recebimento parciais; cartão × fatura (com ajuste); transferência |
| 29–32 | set/out independentes; troca de mês no Dashboard; dez→jan; jan→dez |
| 33–36 | sem data em "Pendências"; potencial separado; classificação estrutural (descrições "Salário extra", "Repasse do escritório", "Reembolso Amazon" continuam `other`) |
| 37–40 | migração preserva legado e é idempotente; round-trip export/import; perfis independentes |
| 41–43 | `state` inalterado (receitas/despesas byte a byte) ao calcular e trocar competência |
| 44–48 | 8 títulos completos na ordem; responsivo 1440/390 sem sobreposição; fórmula, composição e cenários visíveis; texto além da cor; seção "a partir de hoje" separada |
| 49–50 | pesquisa da fatura funciona; casos 13–18 dela executados isolados (6/6) |
| extras | contribuição como saída; resgate legado interno; cancelada excluída; seletor de natureza; geração automática nos 2 pontos |
| 51 | console sem erros |

### Resultados

```
node tests/financial-engine/personal-cash-projection-scenarios.test.mjs
personal-cash-projection-scenarios: TOTAL=55 PASS=55 FAIL=0

node tests/financial-engine/gate5-invoice-transaction-search.test.mjs
gate5-invoice-transaction-search: TOTAL=18 PASS=18 FAIL=0

node tests/financial-engine/run-all.mjs
FINFLOW FINANCIAL-ENGINE SUITE: TOTAL_PASS=682 TOTAL_FAIL=0   (627 anteriores + 55)

git diff --check   -> sem saída
```

- **Controle de sensibilidade dos testes:** três mutações temporárias no
  motor, com o `index.html` restaurado depois e o hash conferido idêntico.

  | Mutação | Casos que falharam |
  |---|---|
  | Saldo somado ao resultado | 13 casos (01–06, 29–32, 40, 46, 48) |
  | Compra de cartão somada junto com a fatura | 16 casos (01, 22, 23, 25, 46B…) |
  | Classificação por "reembolso" na descrição | PCP_35_36 |

- **Primeira execução da suíte:** mostrou 633 em vez de 682, porque o
  `run-all.mjs` lê o primeiro `TOTAL=… PASS=…` da saída e o detalhe do caso
  50 repetia o resumo do processo filho. O detalhe foi corrigido no próprio
  teste; o `run-all.mjs` não foi alterado nessa lógica.

### Verificação no navegador

Chromium, pelo harness isolado do projeto, com o `index.html` real e dados
sintéticos. A interação foi real: cliques em `‹ ›` e troca de viewport.

| Competência | Resultado projetado | Saldo acumulado |
|---|---|---|
| Set/2026 (atual) | − R$ 4.821,49 | − R$ 4.146,72 |
| Out/2026 (futuro) | R$ 1.000,00 | − R$ 3.146,72 |
| Ago/2026 (passado) | R$ 0,00 | "Não disponível para competência passada" |
| Dez/2026 | − R$ 500,00 | − R$ 2.646,72 |
| Jan/2027 (virada) | R$ 1.000,00 | − R$ 1.646,72 |

Detalhes de setembro/2026 (mês atual):
- **Saldo agora:** R$ 674,77 = 554,77 + 300 recebido − 180 pago.
- **Fórmula:** `R$ 7.040,99 − R$ 11.862,48 = − R$ 4.821,49`.
- **Resultado completo:** − R$ 4.701,49.
- **Cenários:** pior − R$ 4.871,49; melhor − R$ 4.821,49.

Demais verificações:
- a volta para dezembro repetiu os mesmos valores;
- em todas as competências, a soma dos itens da composição bateu com cada
  total;
- telas de 1440 px e 390 px sem rolagem lateral, com títulos completos;
- `state` inalterado e console vazio.

## Limitações

- **Backup real:** não disponível no ambiente. A comparação não foi
  executada, e nenhum resultado foi inventado.
- **Pagamento ou recebimento parcial de um único lançamento:** o modelo não
  tem campo de valor parcial por registro. O "parcial" coberto é o que o
  modelo representa: parcelas, ou vários registros de uma mesma obrigação
  ou receita, com parte paga ou recebida (parcelas de despesa, parcelas de
  projeto extra, repasses por recebível). Nenhum campo novo foi inventado
  para isso.
- **Reembolso lançado como receita pela tela de Pessoas:** a receita
  `tipo:'repasse'` criada ali nasce sem `recebidaMeses`. Pelo critério
  canônico (`receitaRecebida`), ela aparece como reembolso pendente até ser
  marcada como recebida em Receitas. Esse comportamento é anterior e não
  foi alterado.
- **Saldo acumulado:** considera só os fluxos pendentes com competência.
  Pendências vencidas de meses anteriores ao atual e a estimativa de gastos
  variáveis não entram. A estimativa continua só no "Fluxo de caixa a
  partir de hoje".
- **Retirada extraordinária do escritório:** fica em "outras entradas". Ela
  é sempre realizada no ato, então nunca afeta o previsto nem os cenários.
- **Painel "Destinação" e gráfico anual:** corrigidos na rodada de correção (abaixo).
- **Verificação no navegador:** feita no harness isolado com dados
  sintéticos. O app real exige login Google, que não foi contornado.

## Instruções para a auditoria Codex

1. Confirmar a base `2eaf646`, os dois commits desta entrega e a working
   tree limpa.
2. Revisar `git diff 2eaf646..HEAD -- index.html`. Pontos de atenção:
   - `classifyPersonalIncome` (ordem das regras, nenhuma por descrição);
   - `getPersonalMonthFlows` (cartão só por fatura, split × receita de
     reembolso, contribuição, cofrinho);
   - o saldo acumulado para meses futuros;
   - a migração do `incomeNature`;
   - os dois pontos de geração do repasse.
3. Executar:
   - `node tests/financial-engine/personal-cash-projection-scenarios.test.mjs` (55/55);
   - `node tests/financial-engine/gate5-invoice-transaction-search.test.mjs` (18/18);
   - `node tests/financial-engine/run-all.mjs` (682/0);
   - `git diff --check 2eaf646..HEAD`.
4. Conferir que `state.office`, RRT, imposto, divisão do escritório,
   contas, transferências, faturas e pesquisa da fatura não mudaram de
   comportamento.
5. Se houver backup real disponível, rodar
   `tests/financial-engine/compare-real-backup.mjs`.

## Rodada de correção após FAIL da auditoria Codex (2026-09-23)

- **Branch:** `fix/personal-cash-projection-scenarios`.
- **Hash-base:** `d72e68f1084999813a34df0e2ad24c3b73c97ec1`.
- **Commit funcional:** `bdb65ffc52139263c96efa8d14d4478ad477face`.
- **Commit documental:** este (ver `git log -1`).
- Sem push, merge ou alteração na `main` (`origin/main` em `71edc74…`;
  `origin/fix/invoice-transaction-search` em `2eaf646…`).
- Dois arquivos não rastreados de outro trabalho (`baseline-home.log`,
  `debug1.mjs`) foram movidos, com autorização, para o scratchpad fora do repo.

### Achado 1 (P1) — falso repasse pessoal

- **Causa-raiz:** `classifyPersonalIncome` confiava em `incomeNature` sozinho e o
  seletor manual oferecia "Repasse pessoal do escritório".
- **Correção:** `isStructuralOfficeTransfer` exige `origem==='office_distribution'`
  + `officeTransferId` não vazio + repasse real em `state.office.repasses`.
  Natureza falsa vira `other` (valor, conta, data e status intactos) na leitura
  (`classifyPersonalIncome`), na gravação (`scheduleSave`), na migração/importação
  (`sanitizeIncomeNatures` em `migrateState`) e na interface (opção removida,
  com explicação; gravação recusa mesmo com interface adulterada). A migração
  antiga, que gravava a natureza só por origem+id, agora também exige o repasse.
- **Receita inválida:** neutralizada, não rejeitada, para não perder o lançamento.

### Achado 2 (P1) — contradição em "Destinação"

- **Causa-raiz:** o painel usava `getTotalsForMonth` (`emCaixaDisponivel`/
  `calcProjecaoFutura`), implementação paralela ao saldo acumulado do motor pessoal.
- **Correção:** `renderDestinacaoSaldoTile` consome `getPersonalMonthProjection`.
  Cenário obrigatório: 1.000 + 1.000 − 0 = R$ 2.000,00 nos dois painéis.
  Passado: mostra "Saldo histórico das contas ao fim de <mês>", corte do razão
  já existente (`calcSaldoContaAte`), rotulado como métrica diferente e nunca o
  saldo atual; o saldo acumulado segue indisponível. Texto com período, fórmula
  e diferença entre saldo atual, resultado e acumulado.
- **Ajuste em teste legado:** `CASH_UI_04` (Gate 5) comparava o futuro com o
  valor legado que a decisão de produto substituiu; passou a comparar com o motor
  pessoal e mantém a exigência de rótulo de projeção. `CASH_UI_03` (passado) segue intacto.

### Achado 3 (P2) — gráfico anual

- **Causa-raiz:** o gráfico usava `previstoEntradas`/`totalDespPrevisao`, que incluem
  o já recebido/pago, sob o nome "Previsto".
- **Correção:** título "Ano corrente — realizado e previsto" e 4 séries de
  `getPersonalMonthFlows` (`getPersonalYearSeries`); tooltip com mês, série e valor;
  `aria-label` no canvas. Salário 4.000 recebido + despesa 3.000 paga: realizadas
  4.000/3.000, previstas 0/0.

### Testes e resultados

`personal-cash-projection-scenarios.test.mjs` passou de 55 para 81 casos (+26:
`FIX_P1_01..11`, `FIX_DEST_01..08`, `FIX_CHART_01..07`).

```
node tests/financial-engine/personal-cash-projection-scenarios.test.mjs
  TOTAL=81 PASS=81 FAIL=0
node tests/financial-engine/gate5-invoice-transaction-search.test.mjs   TOTAL=18 PASS=18 FAIL=0
node tests/financial-engine/gate5-cash-balance-ui.test.mjs              TOTAL=9  PASS=9  FAIL=0
node tests/financial-engine/run-all.mjs   TOTAL_PASS=708 TOTAL_FAIL=0   (682 anteriores + 26)
git diff --check   -> sem saída
```

- **Falha antes, passa depois:** com o `index.html` de `d72e68f` e os testes novos,
  24 casos falharam (os `FIX_*` relevantes e os dois testes ajustados);
  com a correção, 81/81. Os três cenários originais da auditoria estão em
  `FIX_P1_01/05/11`, `FIX_DEST_01` e `FIX_CHART_01`.
- **Sensibilidade (mutações temporárias, arquivo restaurado e conferido por `cmp`):**

  | Mutação | Casos que falharam |
  |---|---|
  | `incomeNature` sozinho libera repasse (leitura e saneamento) | 8 (`PCP_35_36`, `FIX_P1_03/04/05/06/07/10/11`) |
  | Destinação volta a mostrar o saldo atual | 6 (`FIX_DEST_01/02/03/04/06/07`) |
  | Gráfico chama realizado de "Previsto" | 5 (`FIX_CHART_01/02/03/04/06`) |

- **Navegador (Chromium, harness isolado, dados sintéticos):** 1440, 1024, 768 e 390 px
  sem rolagem lateral, sem corte no painel nem no gráfico, console vazio.
  Migração repetida, round-trip de exportação/importação e backup manipulado
  cobertos por `FIX_P1_03/04/09`.

### Limitações

- **Backup real:** indisponível no ambiente; comparação não executada.
- **Coerência do vínculo:** verifica só a existência de um repasse com o mesmo
  `officeTransferId`; não confere valor nem estado. Uma receita antiga com
  origem+id sem repasse correspondente deixa de contar como repasse (fica em `other`).
- **Passado em "Destinação":** o corte histórico (`calcSaldoContaAte`) é o mesmo do
  Gate 5; se a auditoria preferir indisponibilidade total, é uma troca localizada.
- **Gráfico:** testado com o stub de Chart.js do harness (config inspecionada, não
  pixels); a aparência real das barras empilhadas depende do Chart.js do CDN.
- **Aplicação real:** exige login Google, não contornado.
