# Auditoria Codex — corte de histórico, PDF e ordem da fatura

Branch `gate/5-history-cutoff-order`, documentação vigente `ca9bb4d`, implementação Claude Code `62dcbef`.

Resultado: **FAIL corretivo**. As seções 1–3 estão majoritariamente corretas e a suíte completa passou com **471 PASS / 0 FAIL**, mas a entrega não cobre a seção 4 vigente e dois critérios das seções implementadas permanecem incompletos.

## Evidências aprovadas

- `62dcbef` é filho direto de `ca9bb4d`; o relatório informou base `7ccbf3c`, mas o pai Git real preserva corretamente os dois commits de especificação.
- `git diff --check ca9bb4d..62dcbef`: sem erros.
- O bloco visível do importador PDF foi removido; parser, funções e formato legado permanecem no código.
- `historyStartMonth` é persistido por perfil, valida `AAAA-MM`, pode ser limpo e limita as duas médias e a busca mensal da projeção sem alterar saldos ou registros.
- A lista da fatura usa cópia ordenada e não altera total ou `state.despesas`.
- Execução independente da suíte: **471 PASS / 0 FAIL**.

## Achados

### 1. [P1] Seção 4 vigente não implementada

O commit pai `ca9bb4d` já contém a seção “Descoberta do parcelamento no Caixa do Escritório”. `62dcbef` não implementa nem testa os critérios 11–12. O formulário continua ocultando completamente `#newProjContratadoFields` em `Potencial`, reproduzindo a dificuldade relatada pelo usuário.

Correção: seção “Entrada e parcelamento” sempre visível; controles desabilitados fora de `Contratado`, mensagem direta e habilitação imediata ao selecionar `Contratado`. Sair desse status antes do cadastro não pode persistir os valores digitados nem gerar recebíveis. Preservar integralmente as regras financeiras e todos os testes anteriores do escritório.

### 2. [P2] Receita única anterior ao corte ainda gera aviso

Reprodução independente: `historyStartMonth='2026-07'`; receita única contratada de competência maio/2026, prevista, sem `dataPrevista`; projeção de 17/09/2026 a 15/10/2026. Embora maio esteja antes do corte, `getChronologicalProjection()` retorna:

```json
[{"id":"r-old","reason":"missing_revenue_date"}]
```

O scan mensal respeita o corte, mas o laço global posterior sobre `state.receitas` não o aplica. Isso contraria a regra de que item único com competência conhecida anterior ao corte não participa da projeção nem de seus avisos.

Correção: aplicar o mesmo corte aos avisos globais quando a competência do item único for comprovadamente anterior. Não ocultar item sem competência determinável nem ocorrência a partir do corte. Adicionar teste que falhe em `62dcbef` e passe após o patch.

### 3. [P2] Empate da ordenação não usa ID

Reprodução independente com duas compras de mesma `dataCompra='2026-09-02'` e mesmo `createdAt='same'`:

```json
{"first":["b","a"],"second":["a","b"]}
```

O resultado muda quando a entrada é invertida. O contrato exige desempate determinístico por ID. A estabilidade nativa de `Array.sort` apenas preserva a ordem incidental de `state.despesas`.

Correção: depois de `dataCompra` e `createdAt`, comparar um identificador estável (`id`) sem mutar o estado. Testar entradas invertidas produzindo a mesma ordem.

## Próxima entrega esperada

Claude Code deve corrigir somente os três achados, manter os 471 testes existentes, adicionar cobertura permanente dos critérios 11–12 e das duas reproduções, executar a suíte completa e entregar novo commit. Sem push, merge, alteração de regras financeiras ou implementação do futuro cadastro de agência/conta bancária nesta correção.

`baseline-home.log` e `debug1.mjs` permanecem fora do versionamento.
