# FinFlow — Implementation Gate 2 Report

**Revenue Semantics, Cash Cycle & Reserved Assets**

Autorização base: `FINFLOW_IMPLEMENTATION_GATE_1_REPORT.md`, aprovado externamente. Este relatório documenta exatamente — e apenas — o escopo autorizado pela mensagem "FINFLOW — IMPLEMENTATION GATE 2".

## 1. Resultado

```
FINFLOW_IMPLEMENTATION_GATE_2: PASS
```

Todos os 89 testes da suíte permanente passaram (35 do Gate 1, sem nenhuma regressão, + 54 novos do Gate 2), a suíte original da auditoria reproduziu exatamente o mesmo resultado de antes (20 casos: 13 PASS/6 FAIL/1 BLOCKED; 7 invariantes: 7 OK), e a comparação com uma cópia do backup real não encontrou nenhuma diferença em nenhum dos 14 meses históricos, usando o fim do Gate 1 (`86c6018`) como baseline.

## 2. Initial Head

`86c6018` — `docs(finance): clarify FINAL_HEAD vs. the report's own commit in Gate 1 report` (o HEAD final do Gate 1, já aprovado externamente).

## 3. Final Code Head

`7249c34` — `test(finance): add Gate 2 regression tests` (o relatório em si, comitado depois, não altera código nem testes — ver seção 12).

## 4. Commits

```
2d6b589 feat(finance): add Gate 2 revenue/salary/reserved-assets temporal semantics
7249c34 test(finance): add Gate 2 regression tests
```

Nota sobre granularidade: as mudanças de motor (helpers puros, `getReceitasForMonth`, `receitaRecebida`, `calcSaldoConta`/`calcSaldoContaAte`) e de UI (formulário de receita, modal de edição, resgate de cofrinho) foram feitas num único commit funcional em vez de divididas em 4-5 commits temáticos menores como o enunciado sugere como exemplo — todas essas mudanças são interdependentes (a UI só existe pra alimentar o modelo que o motor consome) e este ambiente não tinha uma forma confiável de separar um arquivo único (`index.html`) em hunks parciais sem risco de quebrar a aplicação no meio do caminho. A mensagem do commit único é deliberadamente detalhada, listando cada função tocada, exatamente pra compensar isso. Registrado aqui como dívida de processo, não de código — ver seção 18.

## 5. Arquivos Alterados

- `index.html` (414 inserções, 20 remoções)
- `tests/financial-engine/*.test.mjs` (8 arquivos novos) + `run-all.mjs` atualizado
- `FINFLOW_IMPLEMENTATION_GATE_2_REPORT.md` (este arquivo, commit separado)

## 6. Funções Alteradas

- `getReceitasForMonth(mes,ano)` — ramos novos para `r.certeza!==undefined` (recorrente/salário via `recebidoPorMes`; evento único via `getRevenueCashDate`), guardados de forma que nunca são alcançados por receitas legadas.
- `receitaRecebida(r,mes,ano)` — idem, ramo novo antes do comportamento legado (que fica intocado).
- `calcSaldoConta(contaId)` / `calcSaldoContaAte(contaId,mes,ano)` — ramo novo dentro do `state.receitas.forEach`, mesma guarda `r.certeza!==undefined`. Único ponto do Gate 2 que toca essas duas funções — nenhuma outra linha delas foi alterada, conforme exigido pela seção 30.
- `toggleReceitaRecebida(recId)` — ramo novo pra alternar `estado`/`recebidoPorMes` com a data real de hoje, preservando o comportamento antigo (`recebidaMeses`) inalterado no `else`.
- `openEditReceita(id)` / `saveEditReceita(id)` — cada uma ganhou um `if(r.certeza!==undefined) return ...NovoModelo(id)` no topo; o corpo legado original não foi tocado em nenhuma linha.
- `addReceita()` — passou a ramificar em três casos (salário recorrente novo modelo / evento único novo modelo / legado), preservando o `else` final byte-a-byte igual ao código anterior ao Gate 2.
- `onRecTipoChange()` / `onRecFixoChange()` — estendidas para mostrar/esconder os novos campos; comportamento anterior (tipos legados) preservado.
- `openResgatarCofrinho(cofrinhoId)` / `confirmarResgateCofrinho(cofrinhoId)` — reescritas pra não gerar mais receita em resgates novos (ver seção 11); `delMovimentacaoCofrinho` não precisou de nenhuma alteração (já limpava tanto `movimentacoesContas` por id compartilhado quanto `receitas` por `cofrinhoMovId`, cobrindo os dois formatos).
- `migrateState()` — uma linha nova: default explícito `motivoResgate=null` (nunca inferido) pra resgates antigos.

## 7. Funções Criadas

Todas puras, sem leitura/escrita de `state`, localizadas em `index.html` num bloco dedicado logo após `valorReceita`:

- `addDaysISO(iso, n)`
- `getExpectedSalaryDate(year, month, recurrenceRule)`
- `getRevenueCashDate(receita)`
- `getRevenueCompetence(receita)`
- `isRevenueRealized(receita, mes, ano)`
- `isInternalTransfer(mov)`
- `isReservedAssetMovement(mov)`
- `getFinancialCycle(referenceDate, salaryEvents, expectedNextDate)`

Mais duas funções de UI para o modal de edição do novo modelo: `openEditReceitaNovoModelo(id)`, `saveEditReceitaNovoModelo(id)`, `onERecEstado2Change()`, e um handler de formulário: `onRecCertezaOuEstadoChange()`, `onRecSalarioJaRecebidoChange()`.

## 8. Modelo de Receita Implementado

Uma receita é "novo modelo" se e somente se tiver o campo `certeza` definido (`'recorrente'|'contratado'|'potencial'`) — esse é o único marcador, exatamente como `dataCompra` foi o marcador do Gate 1 para despesas. Registros antigos nunca têm esse campo.

**Evento único** (tipos `projeto`, `rendimento`, `outro`):
```
{ certeza, estado: 'previsto'|'recebido'|'cancelado',
  dataPrevista, dataRecebimento,
  competenciaMes, competenciaAno, conta, mes, ano, valor, tipo, nome }
```
`getRevenueCashDate` resolve o mês de caixa: `dataRecebimento` se existir, senão `dataPrevista` — nunca `competenciaMes/Ano`. `mes`/`ano` são mantidos em sincronia com `competenciaMes/Ano` (mesmo princípio do Gate 1 pra `mesInicio`/`anoInicio`).

**Recorrente** (salário, `certeza:'recorrente'`):
```
{ certeza:'recorrente', recorrencia:{type:'last_weekday_of_month', weekday:5},
  recebidoPorMes: { 'YYYY-MM': {estado:'recebido', dataRecebimento} },
  competenciaMes, competenciaAno, conta, valor, tipo:'salario', nome }
```
Uma ocorrência é materializada por `getReceitasForMonth` em todo mês a partir da competência de criação (sem limite superior) — nunca duplicada, nunca deslocada. O estado de cada mês vive isoladamente em `recebidoPorMes`; marcar um mês como recebido nunca afeta outro.

## 9. Regra Salarial Implementada

`getExpectedSalaryDate(year, month, {type:'last_weekday_of_month', weekday})` calcula a última ocorrência de um dia da semana num mês (convenção: `Date.getDay()` nativo, `5`=sexta). É usada só como **previsão** (`_dataPrevistaOcorrencia` em cada ocorrência de `getReceitasForMonth`) — nunca decide caixa real. Caixa real só existe quando o usuário marca a competência como recebida (`recebidoPorMes[mesKey]={estado:'recebido', dataRecebimento}`), com a **data real** informada (default hoje, editável) — nunca a data prevista. Salário recebido em julho é caixa de julho; a competência de agosto é um evento independente, ainda previsto até ser marcado.

## 10. Semântica de Transferências

Inalterada em comportamento — já era modelada corretamente antes do Gate 2 (`movimentacoesContas` com `transferId` ligando duas pernas opostas, nunca uma receita/despesa). O Gate 2 adiciona `isInternalTransfer(mov)` como reconhecimento nomeado e testável desse padrão, e trava esse comportamento com testes T01-T03 e INV-06/INV-10 permanentes.

## 11. Semântica de Cofrinhos

**Depósito**: já debitava a conta diretamente via `movimentacoesContas` (nunca despesa) — inalterado.

**Resgate — mudança real deste gate**: antes, todo resgate criava uma `receita` (`tipo:'resgate', isResgate:true, tributavel:false`) já marcada recebida. Agora, resgates **novos** creditam a conta diretamente via `movimentacoesContas` (mesmo padrão simétrico do depósito) e nunca tocam `state.receitas`. Um campo opcional `motivoResgate` (`planejado|cobertura_caixa|outro`) fica registrado em `movimentacoesCofrinhos`, nunca inferido para registros antigos (`null` quando ausente).

Resgates **antigos** (já existentes em `state.receitas` antes deste gate) não foram migrados nem reinterpretados — continuam exatamente como estão, e `delMovimentacaoCofrinho` (que já limpava os dois formatos por design) não precisou de nenhuma mudança.

## 12. Regra de Ciclo Financeiro

`getFinancialCycle(referenceDate, salaryEvents, expectedNextDate)` — pura, derivada, nunca persistida em nenhuma transação. `salaryEvents` deve conter **somente** salários efetivamente recebidos (com `dataRecebimento`); um evento sem essa data é ignorado — nunca finge um recebimento que não aconteceu. Sem nenhum salário recebido conhecido, ou quando `referenceDate` é anterior ao primeiro salário recebido, retorna `{cycleUnavailable:true}` em vez de inventar um ciclo. `expectedNextDate` só é usado como **limite projetado** quando ainda não existe um próximo recebimento real (`endSource:'expected_salary'`, nunca confundido com `'received_salary'`). Não há UI nem dashboard consumindo essa função neste gate — só a fundação pura, testável isoladamente (FC01-FC05).

## 13. Estratégia Legacy

Mesmo princípio do Gate 1, replicado em cada nova dimensão:

- **Receitas**: `certeza!==undefined` é o único marcador de "novo modelo" — nunca adicionado por `migrateState`, nunca adicionado ao editar um campo não-relacionado de uma receita antiga (editar uma receita legada continua chamando o modal/salvamento legado original, byte a byte).
- **Salário**: o roll `+1` antigo (`recorrente && tipo==='salario' → addMonths(...,1)`) continua exatamente igual para receitas sem `certeza`. Só receitas novas, com `certeza:'recorrente'`, usam a regra sem deslocamento.
- **Resgates de cofrinho**: registros antigos em `state.receitas` nunca são tocados; `motivoResgate` em `movimentacoesCofrinhos` antigos vira explicitamente `null` (nunca um valor adivinhado).
- **Nenhuma data é inventada em nenhum caso**: nem `dataRecebimento`, nem `dataPrevista`, nem `certeza`, nem `motivoResgate` — confirmado pelo teste `INV-14`, que verifica as três coleções (despesas, receitas, cofrinhos) de uma vez.

## 14. Testes

```
G2_TESTS_TOTAL: 89   (35 Gate 1 + 54 Gate 2)
G2_TESTS_PASS: 89
G2_TESTS_FAIL: 0
```

Por arquivo (Gate 2):

| Arquivo | Testes | Resultado |
|---|---|---|
| `gate2-salary.test.mjs` (S01-S11) | 11 | 11 PASS |
| `gate2-revenue.test.mjs` (R01-R07) | 7 | 7 PASS |
| `gate2-transfers.test.mjs` (T01-T03) | 3 | 3 PASS |
| `gate2-cofrinhos.test.mjs` (C01-C06) | 6 | 6 PASS |
| `gate2-cycle.test.mjs` (FC01-FC05) | 5 | 5 PASS |
| `gate2-invariants.test.mjs` (INV-01..15) | 15 | 15 PASS |
| `gate2-import-export.test.mjs` (seção 40) | 5 | 5 PASS |
| `gate2-real-patterns.test.mjs` (seção 39) | 2 | 2 PASS |

Comando: `cd tests/financial-engine && npm install && npm test` (executa Gate 1 + Gate 2 juntos via `run-all.mjs`).

## 15. Regressão Gate 1

```
INVARIANT_REGRESSIONS: 0
```

- Suíte permanente do Gate 1 (`temporal.test.mjs`, `cards.test.mjs`, `legacy.test.mjs`, `cash-invariants.test.mjs`): 35/35 PASS, nenhuma mudança de resultado.
- Suíte original da auditoria (`/opt/node-tools/audit_tests.mjs`, `audit_invariants.mjs`), reexecutada fora do repo como regressão adicional: `TOTAL=20 PASS=13 FAIL=6 BLOCKED=1` e `TOTAL=7 OK=7 VIOLADO=0` — idêntico ao resultado registrado no relatório do Gate 1.
- Smoke test com o backup real (`/opt/node-tools/test_smoke.mjs`), varrendo de 6 meses no passado a 12 no futuro: 0 erros de console/página, números idênticos aos do Gate 1.

## 16. Comparação com Backup Real

Script: `tests/financial-engine/compare-real-backup.mjs`, baseline `86c6018` (fim do Gate 1) vs. código atual.

- Backup: cópia do arquivo real do usuário — 171 despesas, 15 receitas, 4 cartões, 4 contas, **nenhuma receita usa o novo modelo** (100% legado), o cenário mais exigente pra este gate.
- Original nunca aberto para escrita (hash/mtime confirmados inalterados após a execução).
- 14 meses históricos comparados (08/2025 a 09/2026), 7 métricas por mês + saldo de cada conta.

```
REAL_BACKUP_DIFFERENCES: 0
```

## 17. Import/Export

`gate2-import-export.test.mjs` confirma que `buildSaveObject()` → `JSON.parse/stringify` (simulando arquivo em disco) → `migrateAppData()` → `buildSaveObject()` de novo preserva **idênticos**: uma receita de projeto (evento único), um salário recorrente com `recebidoPorMes` preenchido, o `motivoResgate` de um resgate novo, e as transferências (`transferId`). Nenhum campo novo é perdido; nenhuma data é inventada na importação.

## 18. Dívidas Técnicas

- **Granularidade de commit** (ver seção 4): as mudanças funcionais do Gate 2 foram feitas em um commit único em vez de vários temáticos menores, por interdependência entre motor e UI e pela dificuldade de dividir um único arquivo grande em hunks parciais com segurança neste ambiente.
- **Edição de parcelas de receita** (`tipo:'extra'`, seção 25): não foi tocada — continua com o mesmo mecanismo de parcelas independente de estado/certeza. Uma futura unificação com o novo modelo (pra que cada parcela tenha `estado`/datas próprios) fica para um gate posterior, se necessário.
- **Recorrência salarial fixa**: só a regra `last_weekday_of_month` está exposta na UI (o modelo de dados já suporta outras regras via `recurrenceRule.type`, mas nenhuma outra foi implementada nem testada).
- **`getRevenueCompetence`**: criada (seção 31 do Gate 2 a lista como opcional) mas não consumida por nenhuma tela ainda — só testável isoladamente. Nenhum teste dedicado foi escrito pra ela especificamente (é trivial e usada implicitamente nos testes de `competenciaMes/Ano` via `getReceitasForMonth`).

## 19. Itens Explicitamente NÃO Implementados

Confirmado — nenhum dos itens abaixo foi tocado neste gate:

```
Caixa do Escritório — distribuição empresarial — repasse automático escritório → pessoal — retirada extraordinária do escritório
saldo comprometido — saldo projetado — projeção variável por categoria — cenários
redesign do Dashboard — motor comportamental de compras
```

Nenhuma alteração de `calcVariacaoMesRecorrente`, `calcProjecaoFutura`, `getTotalsForMonth` (motor de projeções), nenhuma mudança visual/CSS, nenhuma renomeação em massa de funções, nenhuma reorganização do `index.html`.

## 20. Riscos para Gate 3

- **Caixa do Escritório**: a arquitetura de receita nova (certeza/estado/datas separadas de competência) já é genérica o suficiente pra representar "Projeto → Caixa do Escritório → distribuição → repasse previsto ao Jonathan → recebimento no caixa pessoal" como uma cadeia de eventos (um repasse previsto é só outro evento único com `certeza`/`estado` — o mesmo modelo de `projeto`). Nenhum hack específico foi introduzido que bloquearia isso.
- **Ciclo financeiro**: `getFinancialCycle` ainda não é alimentado por nenhuma fonte real de `salaryEvents` dentro do app (nenhuma função hoje coleta "todos os salários recebidos" automaticamente a partir de `state.receitas` — isso precisará de um pequeno adaptador quando o Gate 3 ou um gate de Dashboard quiser exibir o ciclo).
- **Parcelas de receita (`tipo:'extra'`)** continuam fora do novo modelo — se um gate futuro precisar de parcelas com certeza/estado próprios, vai exigir decidir se estende o formato `parcelas:[{mes,ano,valor,recebida}]` ou se migra pro padrão `recebidoPorMes`. Nenhuma decisão foi tomada aqui — registrado só como ponto de atenção.
- **Múltiplos salários/rendas recorrentes simultâneos**: o modelo suporta várias receitas `certeza:'recorrente'` coexistindo (cada uma com seu próprio `recebidoPorMes`), mas isso nunca foi exercitado num teste com duas rendas recorrentes ao mesmo tempo — vale um teste dedicado se o Gate 3 tocar nisso.

---

```
FINFLOW_IMPLEMENTATION_GATE_2: PASS

INITIAL_HEAD: 86c6018
FINAL_CODE_HEAD: 7249c34
REPORT_HEAD: (commit deste relatório, feito após 7249c34 — ver seção 3)

TESTS: 89/89 PASS
GATE1_REGRESSION: 0 regressions (35/35 suite + 20/27 audit scripts identical to Gate 1 baseline)
REAL_BACKUP_REGRESSION: 0 differences across 14 historical months
```
