# Handoff — continuidade em casa (2026-09-18)

Branch: `gate/5-uat-corrections` · HEAD antes deste documento: `617cf17` · último patch funcional: `3fb48c1` · auditoria Codex: `617cf17`.
Nenhum valor financeiro pessoal, backup, token ou credencial consta neste documento. O backup do usuário fica apenas no armazenamento pessoal dele.

## Estado aprovado
- Gate 5 e conversão de salário legado aprovados.
- Sincronização real com o Google Drive funcionou na rede da Prefeitura.
- Suíte aprovada: `TOTAL_PASS=374 TOTAL_FAIL=0` (`npm test` em `tests/financial-engine`).
- Um salário antigo pode ser convertido no mesmo registro, sem duplicação.

## Próximo problema corretivo prioritário — Drive com `keepalive`
O backup atual é um JSON estruturalmente válido, sem token, Client ID ou credencial, com cerca de 74.569 bytes compactado. Isso já ultrapassa o limite aproximado de 64 KiB de `fetch` com `keepalive:true`.

`flushPendingSave()` chama `saveToDrive(true)` em `visibilitychange` e `pagehide`. Ao ocultar, alternar ou fechar a aba, o envio pode falhar com "Erro ao salvar", mesmo com o salvamento normal e o botão Sincronizar funcionando.

A correção deve:
- preservar primeiro o cache local e `finflow_unsynced`;
- não usar `keepalive:true` quando o corpo ultrapassar o limite seguro;
- não baixar dados remotos por cima de alterações locais;
- não indicar sucesso antes da confirmação do Drive;
- tratar troca de janela, aba oculta, fechamento e recuperação posterior;
- incluir testes permanentes para payload maior que 64 KiB, sem usar backup real.

## Segundo ajuste corretivo — "Guardar em caixa"
Com contas bancárias cadastradas, o saldo real das contas é a fonte da verdade e o motor não usa `state.excedentes` no cálculo principal. A interface ainda oferece "Guardar em caixa" e diz que o valor aparecerá nos meses seguintes.

A correção deve:
- esconder ou tornar apenas informativo "Guardar em caixa" quando existirem contas bancárias;
- mostrar "Saldo que permanece nas contas", calculado automaticamente;
- preservar registros antigos de `state.excedentes`, sem apagá-los;
- manter compatibilidade para instalações antigas sem contas;
- incluir testes de não duplicação do saldo.

## Melhoria futura separada — aba "Cartões / Faturas"
Avaliar uma aba dedicada:
- compras no crédito, parcelamentos, fechamento, vencimento e pagamento ficam nela;
- PIX, dinheiro e débito permanecem em Despesas;
- compras no crédito continuam sendo despesas para relatórios e categorias;
- o pagamento da fatura continua sendo movimento de caixa, nunca uma segunda despesa;
- não implementar junto com a correção urgente do Drive.

## Observação sobre histórico
O histórico retroativo não será corrigido manualmente. As estimativas ficarão mais confiáveis conforme os próximos meses receberem lançamentos com datas reais.

## Regras de fluxo
Seguir `AGENTS.md` e `docs/architecture/WORKFLOW.md`: Claude Code implementa, Codex audita. Sem merge em `main`, sem push além da branch de trabalho sem autorização.
