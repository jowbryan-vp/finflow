# Auditoria independente — Gates 2.2 a 4.3 (Claude Code)

Papel nesta tarefa: auditor independente, por autorização explícita do usuário. Nenhuma correção, novo gate ou push foi feito.

## 1. Branch e HEAD auditados

- Branch observada: `gate/4.3`
- HEAD no início da auditoria: `b72011d`
- `git status --short`: limpo, nenhuma alteração pendente preservada ou influenciando o resultado.

## 2. Escopo e commits examinados

Existência e ancestralidade confirmadas com `git cat-file -t` e `git merge-base --is-ancestor <commit> HEAD` — todos os sete commits abaixo são ancestrais de `b72011d`, na ordem esperada:

| Commit | Descrição | Status |
|---|---|---|
| `fb748d5` | marco pós-Gate-3.4 | ancestral confirmado |
| `33af86b` | Gate 2.2 original (relatório) | ancestral confirmado, posterior a `fb748d5` |
| `764636a` | correções da auditoria do Gate 2.2 | ancestral confirmado |
| `e140588` | Gate 4.1 (projeção cronológica + ciclo) | ancestral confirmado |
| `9de6454` | Gate 4.1 (ajuste de fixture de teste) | ancestral confirmado |
| `ae2139e` | Gate 4.2 (estimativa de variáveis) | ancestral confirmado |
| `c190d9d` | Gate 4.3 (integração do dashboard) | ancestral confirmado |

Arquivos examinados: `AGENTS.md`, `CLAUDE.md`, `docs/architecture/WORKFLOW.md`, `docs/PROGRESS.md`, `docs/gates/GATE-4.1.md`, `GATE-4.2.md`, `GATE-4.3.md`, `docs/audits/GATE-2.2-REVIEW.md`, `GATE-4.1-REVIEW.md` a `GATE-4.3-REVIEW.md`, o diff completo de `index.html` em cada um dos sete commits, e todos os arquivos em `tests/financial-engine/`.

## 3. Resultado geral

**PASS COM RESSALVAS.**

A implementação está coerente com as especificações na maior parte dos pontos críticos (sem dupla contagem de fatura/cartão, separação disponível/comprometido/projetado/potenciais, isolamento PJ/reservas, ciclo por salário principal, datas de recebimento validadas). Foram encontradas duas lacunas que não invalidam o trabalho, mas exigem decisão antes de avançar para o Gate 5 (ver seção 4).

## 4. Achados, por gravidade

### 4.1 (Médio) Gate 4.2 — "histórico insuficiente" não cobre mês só com despesas fixas/parceladas

- Arquivo: `index.html`, função `getVariableExpenseEstimate` (adicionada em `ae2139e`).
- Trecho: `const {mes,ano}=addMonths(rm,ry,offset),items=getDespesasForMonth(mes,ano); if(!items.length) return {unavailable:true,...,reason:'insufficient_history'};`
- Reprodução: um dos três meses anteriores tem lançamentos, mas **todos** são fixos (`d.fixa`) ou parcelados (`(d.parcelas||1)!==1`) — por exemplo, apenas aluguel fixo e uma parcela de cartão. `items.length` é maior que zero, então a checagem de histórico insuficiente não dispara. O laço seguinte (`for(const d of items) if(!d.fixa&&(d.parcelas||1)===1)`) não adiciona nada a `categories` para esse mês, então esse mês entra na média ponderada contribuindo **zero** para toda categoria variável, sem aviso.
- Esperado (spec Gate 4.2, linha 5): "se qualquer um dos três meses não tiver lançamentos **materializados** [no sentido de gasto variável], sinalizar histórico insuficiente e não inventar estimativa."
- Observado: a checagem usa "há algum lançamento no mês" (qualquer tipo) em vez de "há algum lançamento variável no mês", então um mês genuinamente sem gasto variável registrado (mas com despesas fixas) é tratado como histórico válido com contribuição zero.
- Impacto: subestima silenciosamente a média de categorias variáveis nesse cenário específico — exatamente o risco de "falsa confiança" que a pergunta 3 da tarefa pede para verificar. Nenhum teste em `gate4-2-variables.test.mjs` cobre um mês "só com fixas/parceladas" (`P42_NO_HISTORY` testa ausência total de lançamentos, `P42_EXCLUSIONS` testa exclusão dentro de um mês com dados suficientes, não a insuficiência causada só por fixas).
- Classificação: falha de cobertura de caso de borda introduzida pela nova função, não regressão de gate anterior.

### 4.2 (Baixo/observação) CYCLE_ADAPTER_INTEGRATED_29 — adaptação legítima, mas reduz cobertura de isolamento entre salários

- Arquivo: `tests/financial-engine/gate2-2-cycle-adapter.test.mjs`, alterado em `9de6454`.
- Antes: dois registros de receita **separados** (`sal_ago`, `sal_set`), cada um com uma única competência e um recebimento real, simulando agregação de eventos entre registros distintos.
- Depois: um único registro (`sal_ago`) com duas chaves em `recebidoPorMes`, mais `state.financialPreferences={primarySalaryId:'sal_ago'}`.
- Avaliação: a adaptação em si é legítima — sob a política "um salário principal define o ciclo", dois registros de receita tipo salário recorrente passam a exigir seleção explícita (comportamento novo, coberto por `P41_PRINCIPAL_SELECTION` em `gate4-1-projection.test.mjs`). Não há enfraquecimento de asserção nem exclusão de caso: as mesmas datas (`2026-08-28`/`2026-10-01`) continuam verificadas.
- Ressalva: a reescrita elimina o único teste que exercitava a agregação de eventos vindos de **dois registros distintos** e depois validava o resultado fim-a-fim. O teste que a substituiu (`P41_PRINCIPAL_SELECTION`) cobre dois registros distintos, mas verifica apenas `startDate` após escolher o principal ("secundário não reinicia ciclo") — **não há teste que verifique o `endDate`** quando existe um segundo registro de salário com uma data de recebimento real que cairia dentro do ciclo do principal (isto é, que o filtro `if(salaryId&&r.id!==salaryId) return;` em `getReceivedSalaryEvents` realmente impede que a data do secundário feche o ciclo do principal).
- Leitura de código: o filtro por `salaryId` em `getReceivedSalaryEvents` (introduzido em `e140588`) é aplicado antes de qualquer ordenação, então a implementação parece correta por inspeção — mas o comportamento não está coberto por um teste que combine "dois registros" + "principal selecionado" + "verificação do fim do ciclo". Recomendo fechar essa lacuna antes do Gate 5, para não depender só de leitura de código nesse ponto sensível (múltiplos salários é exatamente a área que motivou a decisão de produto sobre ciclo).

### 4.3 (Informativo) Correções do Gate 2.2 (`764636a`) — verificadas, sem novos problemas encontrados

- `getRecurringRevenueCashDate`, `calcSaldoConta` e `calcSaldoContaAte` passaram a validar `isValidISODateString` antes de aceitar `dataRecebimento`, fechando o caso de datas como `"2026-09-31"` ou `"not-a-date"` sendo aceitas como recebimento real. Confirmado pelos testes `AUDIT_INVALID_RECURRING_*` (5/5 PASS) e por leitura direta do diff — consistente com a pergunta da tarefa sobre datas inválidas/ausentes.

## 5. Verificação (execução real)

```
cd tests/financial-engine
npm test
```

Resultado obtido nesta auditoria (Node v24.20.0, Windows, Chromium gerenciado já instalado): **300 PASS / 0 FAIL**, idêntico ao número relatado anteriormente. Não foram criados testes de investigação adicionais além da leitura de código, porque as duas ressalvas acima (4.1 e 4.2) são lacunas de cobertura/comportamento identificadas por inspeção de código e de especificação, não falhas reproduzíveis na suíte atual — registrá-las como recomendação é mais honesto do que forçar um teste synthetic sob pressão de tempo desta rodada.

## 6. Suficiência dos testes anteriores

A suíte de 300 casos cobre bem os invariantes centrais (pureza/não-mutação, separação disponível/comprometido/projetado, isolamento PJ/reservas, não dupla contagem de fatura, atrasados, potenciais, persistência de preferências, DOM/mobile do Gate 4.3). Ela **não** cobre:
- Mês de histórico com lançamentos só fixos/parcelados na estimativa de variáveis (achado 4.1).
- Isolamento do `endDate` do ciclo quando há dois registros de salário e um principal selecionado (achado 4.2).

Fora isso, os relatórios "300 PASS / 0 FAIL" anteriores se confirmaram por execução real nesta auditoria, não apenas por leitura dos relatórios.

## 7. Limitações e pontos não verificados

- Não validei visualmente o Dashboard no navegador fora do que a suíte Playwright já cobre (`P43_MOBILE`, `P43_NO_SCRIPT_ERRORS`); não há avaliação manual adicional de desktop/celular além dos testes automatizados existentes.
- Não usei backup financeiro real, credenciais ou sincronização com Drive — `compare-real-backup.mjs` não foi executado, conforme instrução.
- Não reexaminei linha a linha as funções auxiliares herdadas de gates anteriores (`getDespesasForMonth`, `calcByCardForMonth`, `isFaturaPaga`, `calcContribuicao`, `getFinancialCycle`) além do necessário para validar as chamadas feitas pelo código novo — isso está fora do escopo declarado do Gate 4.1 ("não alterar cálculos de competência de faturas... nem reescrever o motor legado").
- Não escrevi testes sintéticos adicionais nesta rodada (ver seção 5); os dois achados ficam registrados como recomendação, não como teste que falha intencionalmente.

## 8. Recomendação

Não há bloqueio crítico para revisão do Codex quanto à integridade financeira observada (sem evidência de dupla contagem, sem invenção de datas, sem regressão detectada na suíte histórica). Recomendo fechar os achados 4.1 e 4.2 — ambos de baixo esforço — antes de autorizar o Gate 5, para não carregar uma lacuna de cobertura justamente na área mais sensível a decisão de produto (variáveis e ciclo por salário principal).

## 9. Correções propostas, em ordem de prioridade (não implementadas)

1. Em `getVariableExpenseEstimate`, trocar a checagem de histórico insuficiente de "existe algum lançamento no mês" para "existe algum lançamento variável (não fixo, não parcelado) no mês", e adicionar um caso de teste com um mês contendo só despesas fixas/parceladas.
2. Adicionar um teste que combine dois registros de salário recorrente com recebimentos reais em datas diferentes, `primarySalaryId` explícito, e verifique que o `endDate` do ciclo do principal não é afetado pela data de recebimento do secundário.

---
Branch/HEAD auditados: `gate/4.3` @ `b72011d`.
