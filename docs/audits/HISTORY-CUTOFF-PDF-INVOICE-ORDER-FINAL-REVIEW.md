# Auditoria Codex final — corte de histórico, PDF, ordem da fatura e descoberta do parcelamento

Branch `gate/5-history-cutoff-order`, auditoria anterior `6d954f2`, patch Claude Code `bba11f8`.

Resultado: **PASS**. Os três achados de `docs/audits/HISTORY-CUTOFF-PDF-INVOICE-ORDER-REVIEW.md` foram corrigidos sem alteração das regras financeiras já aprovadas.

## Evidências

- `bba11f8` é filho direto de `6d954f2`.
- `git diff --check 6d954f2..bba11f8`: sem erros.
- A seção “Entrada e parcelamento” fica visível e desabilitada fora de `Contratado`, com indicação direta; em `Contratado`, os controles são habilitados. Voltar a outro status antes do cadastro não persiste os valores digitados nem cria recebíveis.
- O fluxo contratado continua gerando entrada e parcelas uma única vez. A suíte histórica `gate5-office-contrato.test.mjs` permaneceu com 26 casos aprovados.
- Receitas únicas de competência comprovadamente anterior a `historyStartMonth` deixam de gerar `missing_revenue_date` e `invalid_received_date`; competências posteriores e registros sem competência determinável continuam sinalizados.
- A ordenação da fatura usa `id` como desempate final depois de `dataCompra` e `createdAt`, produz o mesmo resultado para entradas invertidas e não muta `state.despesas`.
- O Codex executou `node tests/financial-engine/run-all.mjs`: **479 PASS / 0 FAIL**, exit code 0.

## Conclusão

As seções 1–4 do gate estão aprovadas. O importador PDF não é mais prometido pela interface; o corte de histórico permanece isolado por perfil e não altera saldo real; a fatura mostra itens do mais recente para o mais antigo; o parcelamento do escritório agora é descoberto pela interface sem mudar sua geração financeira.

Agência, número de conta e consulta unificada de contas não fazem parte desta entrega e devem seguir em escopo separado. `delivery/index.html` permanece snapshot histórico. `baseline-home.log` e `debug1.mjs` continuam fora do versionamento.
