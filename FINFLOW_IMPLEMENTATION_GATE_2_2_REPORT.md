# FINFLOW — IMPLEMENTATION GATE 2.2 — RELATÓRIO

**Consolidação temporal de receitas pessoais: competência ≠ caixa.**

Patch cirúrgico de consolidação da fundação temporal de receitas pessoais, identificado após auditoria externa dos Gates 2, 2.1 e 3.x.

---

## 1. Escopo executado

Separação explícita, no motor de receitas pessoais, entre a visão de **COMPETÊNCIA** (a que mês uma ocorrência recorrente "pertence" — a chave em `recebidoPorMes`) e a visão de **CAIXA** (o mês em que o dinheiro efetivamente entrou — `dataRecebimento`). Essas duas perguntas eram indevidamente colapsadas em uma só por `getReceitasEfetivasForMonth`, que usava `getReceitasForMonth` (materialização por competência) filtrado por `receitaRecebida` (status daquela competência) — nenhuma das duas perguntas "o dinheiro entrou **neste** mês?".

Executado:
- Nova função `getCashRevenuesForMonth(mes,ano)` como motor canônico de visão de caixa.
- `getReceitasEfetivasForMonth` redefinida como wrapper fino sobre a função acima (opção 1 da seção 10 do gate — os dois únicos callers são perguntas de caixa).
- `getReceivedSalaryEvents()` e `getCurrentFinancialCycle(referenceDate)` — adapters entre `state.receitas` e o motor puro `getFinancialCycle` (Gate 2, nunca reescrito).
- `isValidISODateString(str)` — validador real de data ISO.
- `toggleReceitaRecebida` deixa de forçar a data de hoje ao marcar uma ocorrência como recebida; abre `openConfirmarReceitaRecebidaModal` → `confirmarReceitaRecebidaComData`, com a data real editável.
- 35 novos testes (3 arquivos), todos wired em `run-all.mjs`.
- Regressão completa (262/262) e regressão do backup real (0 diferenças).

Não executado (fora de escopo, por instrução explícita do gate): Gate 4, motor de projeções, cenários Melhor/Pior, lógica de cartões, competência de faturas, Gate 1, Caixa do Escritório, regras/reservas/repasses do escritório, branding, layout geral, arquitetura de perfis, Drive Sync, refatorações oportunistas, redesign do Dashboard.

## 2. HEAD inicial / final

- **INITIAL_HEAD:** `fb748d5` (fechamento do Gate 3.4 — `GATE_3_SERIES_CLOSED: true`)
- **FINAL_HEAD:** `386e984` (`test(receitas): add temporal cash-view invariants and cycle adapter tests` — o commit de código/testes deste gate; o commit seguinte é apenas este relatório)

## 3. Arquivos alterados

- `index.html` — único arquivo de código alterado. Diff: **+210 / −17** linhas, 100% dentro das funções de receitas pessoais/salário/ciclo listadas na seção 1. Nenhuma linha de `state.office.*`, `calcSaldoOfficeConta*`, `getOfficeOperationalBalance`, `getOfficeFinancialPatrimony`, reservas/repasses/distribuição do escritório foi tocada (confirmado por `git diff index.html | grep -i office` → zero ocorrências).
- `tests/financial-engine/run-all.mjs` — 3 novas entradas no array `FILES`, com o bloco de comentário explicativo no mesmo estilo dos gates anteriores.
- `tests/financial-engine/gate2-2-cash-view.test.mjs` (novo, 18 testes).
- `tests/financial-engine/gate2-2-salary-ui.test.mjs` (novo, 6 testes).
- `tests/financial-engine/gate2-2-cycle-adapter.test.mjs` (novo, 11 testes).

## 4. Problema temporal encontrado

`getReceitasEfetivasForMonth(mes,ano) = getReceitasForMonth(mes,ano).filter(r=>receitaRecebida(r,mes,ano))`.

Para uma receita recorrente (salário), `getReceitasForMonth` materializa a ocorrência de **competência** daquele mês (via a chave `recebidoPorMes[mesKey(mes,ano)]`), e `receitaRecebida` só responde se **aquela ocorrência de competência específica** foi marcada como recebida — nunca "o caixa deste mês recebeu algum dinheiro". Exemplo concreto do próprio gate: salário com competência `2026-09`, `estado:'recebido'`, `dataRecebimento:'2026-10-02'` (pago com atraso) aparecia como "entrada real de setembro" (❌ errado — o dinheiro só entrou em outubro) e **nunca** aparecia como entrada de outubro (❌ — `getReceitasForMonth(10,2026)` materializa só a ocorrência de competência de outubro, uma ocorrência logicamente diferente).

Confirmado por reprodução isolada nos testes `REV_TIME_01/02` antes da correção (mantidos, agora passando) e formalizado nos invariantes REV-TIME-01..10 (seção 12).

## 5. Arquitetura competência×caixa implementada

Duas visões coexistem, nunca uma destruindo a outra:

- **VISÃO DE COMPETÊNCIA** — `getReceitasForMonth(mes,ano)`: "que ocorrência pertence a este mês, e qual seu status?". Já estava correta antes deste gate (nenhuma mudança) — inclusive seu próprio comentário original já dizia "evento único pertence ao mês da DATA DE CAIXA... nunca à competência", confirmando que essa parte do modelo já era intencional.
- **VISÃO DE CAIXA REAL** — `getCashRevenuesForMonth(mes,ano)` (nova): "que dinheiro efetivamente entrou neste mês, seja qual for a competência de origem?". Localiza eventos pelo impacto de caixa real, nunca por filtro sobre a materialização de competência.

`getReceitasEfetivasForMonth` passa a ser um wrapper puro sobre `getCashRevenuesForMonth` — mantido por compatibilidade de nome (não removido), sem duplicar lógica.

## 6. Novo helper de cash view — `getCashRevenuesForMonth`

Trata cada forma de receita separadamente:

- **Parceladas (`tipo:'extra'` com `parcelas[]`):** inclui a parcela cujo `mes/ano` bate com o mês consultado e que está `recebida` — comportamento já existente, preservado.
- **Novo modelo, recorrente (salário):** varre **todas** as chaves de `recebidoPorMes` (todas as competências já registradas), usa `getRecurringRevenueCashDate(r, competenciaKey)` (motor do Gate 2.1, reutilizado sem duplicação) para achar a data real de cada ocorrência, e inclui a ocorrência no mês cuja `cashDate.slice(0,7)` bate com o mês consultado — nunca no mês da própria `competenciaKey`. Tagueia o resultado com `_competenciaKey`, `_competenciaMes`, `_competenciaAno`, `_dataRecebimentoOcorrencia`, preservando a identidade original da ocorrência (nunca perdida, mesmo aparecendo num mês de caixa diferente).
- **Novo modelo, evento único:** `estado==='recebido' && dataRecebimento válida (isValidISODateString) && dataRecebimento.slice(0,7)===mês consultado` — nunca usa `dataPrevista` como caixa real.
- **Legado (recorrente antigo / avulsa antiga, sem `certeza`):** preserva **exatamente** o critério anterior via `receitaRecebida` — sem granularidade de data real nesse modelo, nunca uma data é inventada, nenhuma migração destrutiva.

## 7. Tratamento de recorrências cross-month

Uma ocorrência recorrente pode ter competência num mês e impacto de caixa em outro — em qualquer direção (atraso ou antecipação) e a qualquer distância. `getCashRevenuesForMonth` varre incondicionalmente todas as competências de cada receita recorrente a cada chamada — não há suposição de "a ocorrência do mês X só pode estar em `recebidoPorMes[X]`". Testado explicitamente em `CASH_MONTH_01` (atraso: setembro→outubro), `CASH_MONTH_02` (antecipação: setembro→agosto), `CASH_MONTH_03` (mesmo mês, caso normal), e nos invariantes REV-TIME-05/06/07/08/09 (identidade preservada, aparece no caixa de outro mês, no máximo uma vez, consulta cruzada nos dois sentidos).

## 8. Tratamento de eventos únicos

Investigado antes de qualquer mudança: `getReceitasForMonth`, para evento único do novo modelo, **já** materializa pela data de caixa (`getRevenueCashDate` = `dataRecebimento||dataPrevista`), nunca por uma competência separada — o próprio comentário original do Gate 2 já declarava essa regra. Ou seja, o cenário ilustrativo do gate (competência outubro / `dataPrevista` 15/10 / `dataRecebimento` 28/09) não corresponde a um caso real no schema atual: evento único **não tem** uma competência armazenada distinta de `dataPrevista`/`dataRecebimento`. Conclusão: **nenhuma mudança de código foi necessária** na materialização de evento único — `getCashRevenuesForMonth` apenas reforça a regra absoluta de caixa (seção 9) que já valia. Testado em `CASH_MONTH_04` (previsto nunca é caixa) e `REV_TIME_04` (dataPrevista nunca substitui dataRecebimento).

## 9. Tratamento legado

Nenhuma migração, reinterpretação ou criação de data sintética para registros legados (sem `certeza`). `getCashRevenuesForMonth` delega ao critério `receitaRecebida` exatamente como antes — o legado não tem granularidade de data real de recebimento, e este gate não inventa uma. `import/export` (seção 21) confirma que os campos legados (`recebidaMeses`, `recorrente`, `mes`, `ano`) atravessam o round-trip sem alteração.

## 10. Alterações no toggle de salário (UI)

`toggleReceitaRecebida(recId)`:
- **Desmarcar** (`recebido → previsto`): permanece **instantâneo**, sem modal — `delete r.recebidoPorMes[k]` (recorrente) ou `r.estado='previsto'; r.dataRecebimento=null` (evento único). Nunca cria uma segunda ocorrência (testado em `SALARY_RECEIPT_UI_06`).
- **Marcar** (`previsto → recebido`): deixa de gravar `new Date()` direto — agora chama `openConfirmarReceitaRecebidaModal(recId)`, que abre um modal com `<input type="date">` **pré-preenchido com hoje** (sugestão, não imposição) e editável. Confirmar chama `confirmarReceitaRecebidaComData(recId)`, que valida a data (`isValidISODateString`) antes de gravar qualquer coisa.

O mesmo bug existia identicamente no ramo de evento único de `toggleReceitaRecebida` (não só no de salário recorrente) — corrigido simetricamente na mesma função, por ser a mesma causa raiz, não uma refatoração oportunista separada.

## 11. Validação de datas

`isValidISODateString(str)`: exige o formato `YYYY-MM-DD` **e** que a data corresponda a um dia de calendário real (reconstrói com `new Date(y,mo-1,d)` e confere que ano/mês/dia não "rolaram"). Rejeita `"2026-13-10"`, `"2026-02-31"`, `"abcd-ef-gh"`, `"2026-00-10"`, string vazia, `undefined`, não-string. Usada em `confirmarReceitaRecebidaComData` — uma data inválida nunca produz impacto de caixa, o modal permanece aberto e nada é gravado. Nenhuma migração destrutiva de registros legados por causa desta nova validação (ela só entra no caminho de escrita do novo modal, nunca é aplicada retroativamente a dados existentes).

## 12. Adapter do ciclo financeiro

`getFinancialCycle(referenceDate, salaryEvents, expectedNextDate)` **não foi reescrita** — confirmado por `git diff` (zero alterações nessa função). O problema era puramente de integração: nada em `state.receitas` alimentava `salaryEvents`/`expectedNextDate`.

- `getReceivedSalaryEvents()` — percorre `state.receitas`, filtra salário recorrente do novo modelo (`certeza!==undefined && recorrencia && tipo==='salario'`), e para cada competência com ocorrência efetivamente recebida (via `getRecurringRevenueCashDate`, nunca duplicando a fórmula), produz `{competenciaKey, dataRecebimento, receitaId}`. Uma ocorrência sem data real válida nunca produz evento.
- `getCurrentFinancialCycle(referenceDate)` — integra `getReceivedSalaryEvents()` + `getExpectedSalaryDate` (motor puro já existente, reutilizado) + `getFinancialCycle`. `expectedNextDate` é usado **apenas** como limite projetado quando ainda não há um próximo salário efetivamente recebido — nunca tratado como evento de caixa real (`CYCLE_ADAPTER_09`).

Nada aqui persiste `cycleId` em nenhuma transação, move despesas de mês, ou altera competência de cartões — o ciclo continua uma visão inteiramente derivada, recalculada a cada chamada.

## 13. Auditoria completa de callers

| CALLER | FUNÇÃO CHAMADA | SEMÂNTICA ESPERADA | CLASSIFICAÇÃO | AÇÃO TOMADA |
|---|---|---|---|---|
| `getReceitasEfetivasForMonth` (definição) | `getReceitasForMonth` + `receitaRecebida` (antes) | "dinheiro que entrou este mês" | CASH_VIEW | Redefinida como wrapper de `getCashRevenuesForMonth` |
| `getReceitasContribuiveis` | `getReceitasEfetivasForMonth` | base de contribuição sobre caixa real | CASH_VIEW | Corrigida automaticamente (cascata da redefinição); função é código morto (zero callers no app — só existe como API testável) |
| `calcTotaisIsoladoMes` (`recsEfetivas`/`emCaixaEntradas`) | `getReceitasEfetivasForMonth` | "quanto efetivamente entrou este mês" | CASH_VIEW | Corrigida automaticamente, zero mudança de código nesta função |
| `calcTotaisIsoladoMes` (`todosRecs`/`previstoEntradas`) | `getReceitasForMonth` | "tudo lançado neste mês, recebido ou não" | COMPETENCE_VIEW | Inalterada — pergunta correta desde antes |
| `getReceitasPrevistasForMonth` | `getReceitasForMonth` + `!receitaRecebida` | "o que está previsto e ainda não confirmado nesta competência" | COMPETENCE_VIEW | Inalterada |
| `getReceitasContribuiveisPrevisao` | `getReceitasForMonth` | base "previsão" de contribuição (todas lançadas) | COMPETENCE_VIEW | Inalterada (seção 14) |
| `calcContribuicao` / `calcContribuicaoBase` | `getReceitasContribuiveisPrevisao` | regra econômica de contribuição (10% sobre previsto) | COMPETENCE_VIEW | Inalterada — regra econômica do gate não é alterada aqui |
| `calcVariacaoMesRecorrente` | `getReceitasForMonth` + `receitaRecebida` (filtra salário não recebido) | "salário garantido ainda não recebido" para projeção | COMPETENCE_VIEW / FORECAST_VIEW | Inalterada — motor de projeção protegido, fora de escopo |
| `calcProjecaoFutura` | `calcVariacaoMesRecorrente` (indireto) | projeção futura | FORECAST_VIEW | Inalterada — fora de escopo |
| `getTotalsForMonth` (branch mês atual real, com contas) | `getReceitasPrevistasForMonth` | "salário garantido ainda não recebido" (Pior Cenário) | COMPETENCE_VIEW | Inalterada |
| `getTotalsForMonth` (branch sem contas cadastradas) | `emCaixaEntradas`/`emCaixaSaidas` (via `calcTotaisIsoladoMes`) | "caixa real deste mês" | CASH_VIEW | Corrigida automaticamente via cascata |
| `getMesesHistoricoDisponiveis` | `getReceitasForMonth` | apenas checagem de presença ("há dado nesse mês?") | COMPETENCE_VIEW | Inalterada — confirmado código morto quanto a caixa, alimenta só `calcPrevisaoMediaHistorica` (protegida) |
| `renderReceitas` (lista da aba Receitas) | `getReceitasForMonth` + `receitaRecebida` (filtro de status) | "lista de lançamentos desta competência, com seu status" | COMPETENCE_VIEW | Inalterada — é exatamente a pergunta certa para uma lista por competência |
| `renderDashboard` (`pendentesCount`) | `getReceitasPrevistasForMonth` | contagem de pendências da competência exibida | COMPETENCE_VIEW | Inalterada |
| `renderDashboard`/hero "Em Caixa" (`emCaixaEntradas` via `t=getTotalsForMonth`) | cascata de `getReceitasEfetivasForMonth` | caixa real | CASH_VIEW | Corrigida automaticamente |
| `calcSaldoConta` | `getRecurringRevenueCashDate` / `getRevenueCashDate` (direto, nunca via `getReceitasEfetivasForMonth`) | saldo bancário por impacto de caixa real | CASH_VIEW | Já correta desde o Gate 2.1 — confirmada por leitura, zero mudança |
| `calcSaldoContaAte` | idem, com corte temporal por `cashDate.slice(0,7)<=limite` | saldo bancário histórico por caixa real | CASH_VIEW | Já correta desde o Gate 2.1 — confirmada por leitura, zero mudança |
| `receitaRecebida` | — (função-base) | "esta ocorrência de competência está marcada como recebida?" | COMPETENCE_VIEW (status da ocorrência) | Inalterada — nome e semântica já corretos, é a pergunta certa para status de competência |
| `isRevenueRealized` | `receitaRecebida` (delega) | idêntica a `receitaRecebida` | COMPETENCE_VIEW | Inalterada — código morto no app (só usado em teste legado do Gate 2), comentário existente já esclarece a semântica |
| `getRevenueCashDate` | — | data de caixa de evento único (`dataRecebimento\|\|dataPrevista`) | CASH_VIEW (motor puro) | Inalterada |

Nenhum caller de `getReceitasForMonth`, `getReceitasEfetivasForMonth`, `getReceitasPrevistasForMonth`, `receitaRecebida`, `isRevenueRealized`, `getRevenueCashDate`, `getRecurringRevenueCashDate`, `calcTotaisIsoladoMes` ou `getReceitasContribuiveis` ficou sem classificação.

## 14. Impacto em `calcTotaisIsoladoMes`

**Zero mudança de código.** `emCaixaEntradas = recsEfetivas.reduce(...)`, onde `recsEfetivas = getReceitasEfetivasForMonth(mes,ano)` — herda a correção inteiramente pela redefinição de `getReceitasEfetivasForMonth`. Verificado com o exemplo literal do gate (salário competência setembro, recebido 02/10, valor 5000): `calcTotaisIsoladoMes(9,2026).emCaixaEntradas === 0`; `calcTotaisIsoladoMes(10,2026).emCaixaEntradas === 5000` — teste `MONTHLY_CASH_TOTALS_01_ATRASO`. `previstoEntradas`/`totalDespPrevisao` (baseados em `getReceitasForMonth`/despesas previstas) permanecem inalterados — arquitetura geral de `getTotalsForMonth()` e das projeções não foi tocada.

## 15. Impacto no Dashboard

Único consumidor diretamente afetado: o hero "Em Caixa Agora"/resumo do mês, que herda `emCaixaEntradas` via `getTotalsForMonth → calcTotaisIsoladoMes`. Corrigido automaticamente, sem edição de `renderDashboard`. "Em Caixa Agora" de meses **futuros** (que usa `calcProjecaoFutura`, não a visão de caixa deste gate) permanece exatamente como estava — correção disso é explicitamente `DEFERRED_TO_GATE_4` (seção 32 do gate). Nenhum redesign do Dashboard.

## 16. Impacto no Relatório mensal

`renderRelatorio()`/`getTotalsForMonth()` foram auditados: os KPIs que usam `emCaixaEntradas`/`emCaixaSaidas`/`emCaixaLiquido`/`totalRec`/`totalDespEfetivo`/`saldo` (aliases de compatibilidade) são **CASH_VIEW** e foram corrigidos automaticamente pela cascata; os que usam `previstoEntradas`/`totalDespPrevisao`/`totalRecPrevisto` são **COMPETENCE_VIEW** e permanecem inalterados. Nenhum campo "Entrada Real"/"Saídas Efetivas"/"Saldo Real" mistura as duas visões — cada um deriva de exatamente uma fonte (`recsEfetivas` para caixa, `todosRecs`/`recsPrevistas` para competência). Nenhum redesign do Relatório.

## 17. Auditoria da contribuição

- `getReceitasContribuiveisPrevisao(mes,ano)` — usa `getReceitasForMonth` → **COMPETENCE_VIEW**. Inalterada.
- `calcContribuicao(mes,ano)` / `calcContribuicaoBase(mes,ano)` — ambas usam exclusivamente `getReceitasContribuiveisPrevisao` → **COMPETENCE_VIEW**. A regra econômica ("contribuição = 10% de tudo que foi lançado/previsto no mês, recebido ou não") **não foi alterada** neste gate, por instrução explícita da seção 14 do gate.
- `getReceitasContribuiveis(mes,ano)` — usa `getReceitasEfetivasForMonth` → **CASH_VIEW**. Corrigida automaticamente pela cascata. É código morto no app (zero callers reais fora de testes) — nenhuma ambiguidade a resolver; nenhum `CONTRIBUTION_TEMPORAL_SEMANTICS_DECISION_REQUIRED` foi necessário, já que a única função de contribuição realmente usada (`calcContribuicao`) é inequivocamente competência por desenho e por instrução do próprio gate.

## 18. Testes novos

**35 testes novos**, em 3 arquivos:

- `gate2-2-cash-view.test.mjs` (18): `CASH_MONTH_01`..`05`, `REV_TIME_01`..`10`, `MONTHLY_CASH_TOTALS_01_ATRASO`, `MONTHLY_CASH_TOTALS_02_ANTECIPACAO`, `BANK_BALANCE_TEMPORAL_CONSISTENCY_01`.
- `gate2-2-salary-ui.test.mjs` (6): `SALARY_RECEIPT_UI_01`..`06`.
- `gate2-2-cycle-adapter.test.mjs` (11): `CYCLE_ADAPTER_01`..`10` + `CYCLE_ADAPTER_INTEGRATED_29` (o cenário obrigatório da seção 29 do gate).

Todos os 35 passam. Nenhum teste foi enfraquecido, removido ou teve sua asserção alterada para forçar PASS.

## 19. Testes anteriores

**227 testes pré-existentes** (Gate 1 até Gate 3.4), executados sem nenhuma modificação de arquivo de teste ou de fixture — todos continuam **PASS**.

## 20. Regressão do backup real

`compare-real-backup.mjs` executado contra a cópia do backup real do usuário (`3ebac49d-finflow_backup_20260903.json`), baseline `569c1cb` (pré-Gate-1), comparando os 14 meses históricos disponíveis (08/2025 a 09/2026):

```
Meses históricos comparados: 14 (de 08/2025 até 09/2026)
Diferenças encontradas: 0
REAL_BACKUP_DIFFERENCES: 0
```

Nenhuma diferença apareceu — logo não há nada a separar entre `LEGACY_DATA_REGRESSION` e `INTENTIONAL_NEW_MODEL_SEMANTIC_CORRECTION` (ambos vazios). O arquivo original do backup foi lido uma única vez (cópia feita pelo próprio script em diretório de scratch) — mtime do original confirmado inalterado antes e depois: `1788450084`.

## 21. Import/export

Não foi necessário criar um teste novo: `gate2-import-export.test.mjs` (já existente, parte da suíte permanente, **inalterado**) já cobre round-trip export→import→export comparando por igualdade estrutural completa (`JSON.stringify`) de uma receita de evento único novo modelo e de um salário recorrente novo modelo com `recebidoPorMes` populado — o que necessariamente inclui `competenciaMes`, `competenciaAno`, `recebidoPorMes`, `estado`, `dataPrevista`, `dataRecebimento`, `recorrencia`, `certeza`. Como nenhuma linha de `migrateAppData`/`buildSaveObject` foi tocada neste gate, esse teste pré-existente permanece prova válida — confirmado passando na execução completa (seção 19).

## 22. Invariantes

Testados e confirmados (arquivo `gate2-2-cash-view.test.mjs`, prefixo `REV_TIME_`):

- **REV-TIME-01** — competência ≠ data de caixa (a mesma ocorrência carrega os dois valores, distintos). ✓
- **REV-TIME-02** — receita recebida só impacta caixa na `dataRecebimento`, nunca em outro mês. ✓
- **REV-TIME-03** — receita prevista nunca impacta caixa real. ✓
- **REV-TIME-04** — `dataPrevista` nunca substitui `dataRecebimento` em caixa realizado. ✓
- **REV-TIME-05** — ocorrência recorrente mantém identidade pela competência. ✓
- **REV-TIME-06** — ocorrência recorrente pode impactar caixa em outro mês. ✓
- **REV-TIME-07** — uma ocorrência impacta caixa no máximo uma vez (testado nos 12 meses de 2026). ✓
- **REV-TIME-08** — consulta por caixa encontra ocorrência de competência diferente. ✓
- **REV-TIME-09** — consulta por competência continua encontrando a ocorrência original. ✓
- **REV-TIME-10** — sem `dataRecebimento` válida = sem impacto de caixa novo-modelo. ✓

## 23. Itens explicitamente não alterados

Confirmado por leitura e/ou `git diff` — zero alteração em: motor de projeções futuras (`calcProjecaoFutura`), previsão histórica de despesas variáveis (`calcPrevisaoMediaHistorica`), cenários Melhor/Pior (`calcVariacaoMesRecorrente`, `saldoPiorCenario`/`saldoMelhorCenario`), lógica de cartões, competência de faturas, Gate 1, Caixa do Escritório (nenhuma linha de `state.office.*`), regras/reservas/repasses/distribuição do escritório, branding, layout geral, arquitetura de perfis, Drive Sync, `calcSaldoConta`, `calcSaldoContaAte` (já corretas desde o Gate 2.1 — confirmadas por leitura, nenhuma regressão que justificasse alterá-las), registros legados (nenhuma migração destrutiva), `getFinancialCycle` (motor puro, só ganhou adapters em volta), `getReceitasForMonth`, `receitaRecebida`, `getReceitasPrevistasForMonth`, `getReceitasContribuiveisPrevisao`, `calcContribuicao`/`calcContribuicaoBase`, `getRevenueCompetence` (dead code, confirmado, não tocado), `openEditReceitaNovoModelo`/`saveEditReceitaNovoModelo` (já tinham edição de data completa para evento único).

## 24. Débitos técnicos restantes

- `getReceitasContribuiveis` continua sendo código morto no app (zero callers fora de teste) — corrigida por consistência de nomenclatura/semântica (seção 31 do gate), mas nunca exercitada em produção; não representa risco, apenas uma função pronta e correta caso um caller futuro precise dela.
- `getRevenueCompetence` continua sendo código morto — não removida (fora de escopo remover código morto não relacionado ao bug).
- O helper `getCurrentFinancialCycle` expõe o ciclo de forma mínima/testável (retorna `{startDate,endDate,startSource,endSource}` ou `{cycleUnavailable:true}`) — não há nenhum painel de UI "quanto posso gastar até o próximo salário"; isso é adiado para o Gate 4 por instrução explícita do próprio gate (seção 22).

## 25. Itens DEFERRED_TO_GATE_4

- Corrigir "Em Caixa Agora" de meses **futuros** usando a visão de caixa real deste gate (atualmente ainda usa a projeção conservadora, `saldoPiorCenario` — comportamento inalterado, correto por instrução explícita).
- Redesenhar a UI do ciclo financeiro num painel de limite de gastos ("quanto posso gastar até o próximo salário").
- Qualquer inconsistência de projeção que viesse a ficar mais visível com a nova visão de caixa — **nenhuma nova inconsistência de projeção foi encontrada** durante este gate (a arquitetura de `calcProjecaoFutura`/`calcVariacaoMesRecorrente` nunca lê `getReceitasEfetivasForMonth`/`getCashRevenuesForMonth`, então está estruturalmente isolada da mudança).

## 26. Resultado final

Todos os 39 critérios de PASS da seção 39 do gate foram satisfeitos (ver bloco terminal, seção 27). Nenhuma das 14 perguntas do checklist de auditoria final (seção 37 do gate) recebeu resposta problemática:

1. Competência e caixa são independentes → sim (REV-TIME-01, testado).
2. Salário atrasado aparece como caixa no mês posterior → sim (`CASH_MONTH_01`).
3. Continua aparecendo como competência no mês original → sim (REV-TIME-05/09).
4. Nunca é contado em dobro entre meses como caixa → sim (REV-TIME-07).
5. Receita prevista não pode entrar em caixa → sim (`CASH_MONTH_04`, REV-TIME-03).
6. Recebida-sem-data não pode entrar em caixa → sim (`CASH_MONTH_05`, REV-TIME-10).
7. `calcSaldoConta`/`Ate` concordam temporalmente com a nova visão de caixa → sim (`BANK_BALANCE_TEMPORAL_CONSISTENCY_01`).
8. Usuário pode informar a data real na confirmação → sim (`SALARY_RECEIPT_UI_02`).
9. `getFinancialCycle` tem um adapter real de estado agora → sim (`getReceivedSalaryEvents`/`getCurrentFinancialCycle`, `CYCLE_ADAPTER_*`).
10. Nenhum caller ainda usa competência como caixa indevidamente → sim (auditoria completa, seção 13).
11. Nenhuma projeção foi alterada fora de escopo → sim (seção 23, confirmado por `git diff`).
12. Nenhum código do escritório foi alterado → sim (seção 23, confirmado por `git diff`).
13. Nenhum dado legado foi reinterpretado destrutivamente → sim (seção 9, 20).
14. (implícita na seção 37, cobertura de import/export) → sim (seção 21).

**Gate 2.2: PASS.**

## 27. Bloco terminal mandatório

```
FINFLOW_IMPLEMENTATION_GATE_2_2: PASS

INITIAL_HEAD: fb748d5
FINAL_HEAD: 386e984

PREVIOUS_TESTS: 227
GATE_2_2_NEW_TESTS: 35
TOTAL_TESTS: 262

COMPETENCE_VIEW: PASS
CASH_VIEW: PASS
CROSS_MONTH_LATE_RECEIPT: PASS
CROSS_MONTH_EARLY_RECEIPT: PASS
SAME_MONTH_RECEIPT: PASS
PREDICTED_IS_NOT_CASH: PASS
RECEIVED_WITHOUT_DATE_IS_NOT_CASH: PASS
MONTHLY_CASH_TOTALS: PASS
BANK_BALANCE_TEMPORAL_CONSISTENCY: PASS
SALARY_REAL_DATE_INPUT: PASS
FINANCIAL_CYCLE_ADAPTER: PASS
CALLER_AUDIT: PASS
CONTRIBUTION_TEMPORAL_SEMANTICS: PASS
LEGACY_COMPATIBILITY: PASS
REAL_BACKUP_DIFFERENCES: 0
IMPORT_EXPORT: PASS
OFFICE_REGRESSION: PASS

PROJECTION_ENGINE_CHANGED: NAO
OFFICE_LOGIC_CHANGED: NAO
LEGACY_SYNTHETIC_DATES_CREATED: NAO
GATE_4_IMPLEMENTADO: NAO

DEFERRED_TO_GATE_4: Em Caixa Agora de meses futuros usando a visão de caixa real; redesign do painel de ciclo financeiro (limite de gastos até o próximo salário)
NEW_CRITICAL_VULNERABILITIES: nenhuma encontrada

REPORT:
FINFLOW_IMPLEMENTATION_GATE_2_2_REPORT.md
```

**STOP.** Gate 2.2 concluído. Não iniciar Gate 4. Aguardando auditoria externa antes de qualquer próximo Gate.
