# Implementação pós-auditoria — achados 4.1 e 4.2 da auditoria independente

Escopo: `docs/gates/POST-AUDIT-4.3-SCOPE.md` (commit `70ebf15`), sobre o relatório
`docs/audits/CLAUDE-INDEPENDENT-AUDIT-GATES-2.2-4.3.md` (commit `2f89004`). Papel: implementador
(Claude Code). Auditoria posterior: Codex. Nenhum Gate 5, push ou merge nesta entrega.

## Hashes

- Base (HEAD ao criar a branch, limpo): `70ebf156ae53c03a69b535c172c90e90791b0770`
- Branch: `fix/post-audit-4.3`
- Commit 1 (testes, demonstra a regressão antes da correção): `0e40dd0`
- Commit 2 (correção + especificação + este relatório): ver hash abaixo, registrado após o commit

## Arquivos alterados

- `tests/financial-engine/gate4-2-variables.test.mjs` — três casos novos (achado 1).
- `tests/financial-engine/gate2-2-cycle-adapter.test.mjs` — dois casos novos (achado 2).
- `index.html` — correção de `getVariableExpenseEstimate` (achado 1 apenas; achado 2 não exigiu mudança de código, ver abaixo).
- `docs/gates/GATE-4.2.md` — texto da regra de suficiência de histórico tornado inequívoco.
- `docs/gates/POST-AUDIT-4.3-IMPLEMENTATION.md` — este relatório.

Nenhuma outra regra de projeção, dado real, código de Office, sincronização ou tag foi tocada.

## Achado 1 — histórico insuficiente em `getVariableExpenseEstimate`

### Reprodução da regressão (antes da correção)

Commit `0e40dd0` adiciona três casos a `gate4-2-variables.test.mjs` e foi executado ANTES de tocar em
`index.html`. Resultado real obtido nesta sessão:

```
[FAIL] P42_HISTORY_ONLY_FIXED: mês só com despesa fixa não comprova histórico variável
[FAIL] P42_HISTORY_ONLY_INSTALLMENT: mês só com parcela não comprova histórico variável
[FAIL] P42_HISTORY_MIXED_NO_VARIABLE: mês com fixa+parcela mas sem variável nenhum não comprova histórico
gate4-2-variables: TOTAL=13 PASS=10 FAIL=3
```

Cada caso monta um dos três meses anteriores só com despesas `fixa:true` e/ou `parcelas>1` (nenhum
lançamento variável elegível) e chama `getVariableExpenseEstimate('2026-09-01','2026-09-30')`. Esperado:
`unavailable:true, reason:'insufficient_history'`. Observado antes da correção: a função aceitava o mês
como histórico válido (porque `getDespesasForMonth` retornava uma lista não vazia) e contribuía
silenciosamente zero para a média de toda categoria variável — exatamente o risco de falsa confiança
apontado na auditoria.

### Correção

Em `getVariableExpenseEstimate` (`index.html`), a checagem de suficiência passou de "a lista de
despesas do mês não está vazia" para "existe pelo menos um lançamento variável elegível (não fixo, não
parcelado) no mês" — a mesma exclusão já usada para montar `categories`. Um mês só com fixas/parceladas
agora retorna `insufficient_history` em vez de contribuir zero.

```diff
   for(let offset=-3;offset<0;offset++){
     const {mes,ano}=addMonths(rm,ry,offset),items=getDespesasForMonth(mes,ano);
-    if(!items.length) return {unavailable:true,total:0,months:[],reason:'insufficient_history'};
     const categories={};
     for(const d of items) if(!d.fixa&&(d.parcelas||1)===1){
       const cat=d.cat||'uncategorized';categories[cat]=(categories[cat]||0)+Math.max(0,d._valorParcela||0);
     }
+    if(!Object.keys(categories).length) return {unavailable:true,total:0,months:[],reason:'insufficient_history'};
     history.push({month:mesKey(mes,ano),categories,weight:weights[offset+3]});
   }
```

`P42_NO_HISTORY` (mês totalmente vazio) continua coberto pelo mesmo `return`, já que um mês sem nenhum
lançamento também não produz `categories`. Média simples/ponderada e reconciliação (`P42_WEIGHTED`,
`P42_SIMPLE`, `P42_RECONCILE`, `P42_CARD_RECONCILE`, `P42_CATEGORY`, `P42_OUTLOOK`) continuam
inalteradas — a mudança só afeta o gate de suficiência, não o cálculo em si.

### Especificação atualizada

`docs/gates/GATE-4.2.md` agora declara explicitamente: um mês só com despesas fixas/parceladas não conta
como histórico de variáveis, mesmo com lançamentos não vazios; a estimativa fica `insufficient_history`,
nunca zero.

## Achado 2 — isolamento do ciclo entre salário principal e secundário

### Investigação

O achado da auditoria era uma lacuna de COBERTURA de teste, não um bug confirmado: a reescrita do teste
`CYCLE_ADAPTER_INTEGRATED_29` (commit `9de6454`, Gate 4.1) parou de exercitar dois registros de salário
distintos, e o teste que cobre múltiplos salários (`P41_PRINCIPAL_SELECTION`) só verifica `startDate`
após a seleção do principal, não `endDate`/`endSource`.

Antes de escrever os testes, executei os dois cenários relevantes manualmente contra o código já em
`70ebf15` (sem nenhuma alteração), para confirmar o comportamento real:

- Principal sem próximo recebimento real, secundário recebido antes do fim previsto do principal →
  `endDate=2026-09-24`, `endSource=expected_salary` (não usa a data do secundário).
- Principal com seu próprio próximo recebimento real (02/10), secundário recebido antes (05/09) →
  `endDate=2026-10-01`, `endSource=received_salary` (usa a data real do PRÓPRIO principal, não a do
  secundário, que teria fechado erradamente em 04/09).

Isso confirma, por execução real (não só leitura de código), que `getReceivedSalaryEvents(salaryId)`
já filtra corretamente por `salaryId` antes de chegar em `getFinancialCycle`, e que `expectedNextDate` já
é calculado a partir da recorrência do próprio salário selecionado. **Não havia bug de produto** — só
ausência de teste de regressão para esse caminho.

### Correção

Nenhuma mudança em `index.html` para este achado. Adicionados `CYCLE_ADAPTER_ISOLATION_01` e
`CYCLE_ADAPTER_ISOLATION_02` em `gate2-2-cycle-adapter.test.mjs` (commit `0e40dd0`), cobrindo exatamente
os dois cenários acima com asserções em `startDate`, `endDate` e `endSource`. Ambos já passavam na
primeira execução (nenhuma regressão a demonstrar aqui, ao contrário do achado 1) — o commit de testes
registra isso explicitamente para não confundir com uma correção de bug.

## Testes executados

```
cd tests/financial-engine
npm test
```

Resultado final, nesta sessão, após a correção do achado 1 (Node v24.20.0, Windows, Chromium
gerenciado): **305 PASS / 0 FAIL** (300 históricos + 5 novos: 3 de `gate4-2-variables.test.mjs`, 2 de
`gate2-2-cycle-adapter.test.mjs`). Nenhuma asserção existente foi enfraquecida ou removida.

## Limitações

- Não foram testados backups reais, credenciais ou sincronização com Drive.
- Não foi alterado nem revisado nenhum outro comportamento de projeção além dos dois achados do escopo.
- A validação do achado 2 é uma prova de ausência de regressão no comportamento atual, não uma mudança
  de comportamento — se o coordenador quiser tratar isso como "correção" formal, não há diff de produto
  a apontar além dos dois testes novos.

## Estado final

Branch `fix/post-audit-4.3` pronta para auditoria do Codex. Sem push, sem merge, sem Gate 5. Encerrando
edições e aguardando revisão.
