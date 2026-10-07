# Auditoria independente Codex — data real de pagamento — 06/10/2026

## Resultado e proveniência

**PASS técnico no escopo.** Nenhum achado impeditivo novo no delta examinado.

- Branch: fix/card-due-date-next-month.
- Worktree: C:\Dev\FinFlow-card-due-date-2026-10-06.
- Base: 7f7aa36; implementação Claude: 919dcc2; handoff auditado: 96728cf.
- Checkout limpo ao iniciar; instruções e handoff lidos.
- Codex revisou o diff e as funções relacionadas de migração, persistência,
  perfis, pagamento, exibição e reconstrução dos saldos.
- Produto e testes de implementação não foram alterados pelo auditor.

## Execução independente

- `git diff --check 7f7aa36..96728cf`: PASS.
- `npm test`: **793 PASS / 7 FAIL** (exit 1); antes: 774 / 7.
- Novo arquivo card-invoice-payment-date: **19 PASS / 0 FAIL**.
- Script Codex anterior verify-card-due-date-codex-2026-10-06.mjs: PASS,
  executado sem alterações.
- Novo script `node docs/audits/verify-card-payment-date-codex-2026-10-06.mjs`:
  PASS, fixture sintética, zero erros de console/página.
- Log completo local: C:\Users\jowbr\AppData\Local\Temp\finflow-payment-date-audit-2026-10-06.log.

Mesmas sete falhas preexistentes:

1. G1-C02.
2. G1-C06.
3. Crash gate3-1-distribution-validation.test.mjs:101 (value de elemento null).
4. INVOICE_PURCHASES_ORDERED_DESC_LEGACY_STABLE_FALLBACK_NO_STATE_CHANGE.
5. PCP_EXTRA_OFFICE_GENERATION_NATURE.
6. PDV_09_IDENTICAL_TO_BASE.
7. UX1R_09_ENGINE_AND_ROWS_IDENTICAL_TO_BASE.

PDV_09 e UX1R_09 continuam sendo comparações contra estados antigos; o mapa novo
é diferença de schema esperada. Não se deduziu ausência de regressão só pela
contagem de falhas: o diff, a suíte específica e a investigação adicional
foram examinados separadamente.

## Investigação adicional

Fixture com dois perfis, mesma chave bank_x_2026-09, conta de 1.000 e fatura de
250. Perfil A inicialmente sem data; perfil B pago em 02/10/2026.

- Botão de edição no card do Dashboard grava 30/09 no perfil A; comparação
  integral do state comprova que somente faturasPagasData mudou.
- A: setembro/outubro/atual = 750/750/750. B: 1.000/750/750.
- Troca de perfil, buildSaveObject, serialização e migrateAppData preservam
  datas e saldos separados; IDs de cartão com underscore são respeitados.
- 29/02/2026, 31/04/2026, dia zero, vazio e amanhã são rejeitados sem mutação.
- Desmarcar e pagar novamente inicia com hoje (06/10); não reutiliza 30/09.
  Saldo histórico de setembro retorna a 1.000, outubro/atual ficam em 750.
- A revisão confirmou precedência: data real válida da fatura paga, senão
  vencimento, senão competência. O débito continua num único loop por chave.
- Vencimento exibido continua independente da data do pagamento.

## Limites e decisões de escopo

- Rejeitar data futura na UI é coerente com registrar pagamento realizado e
  não foi identificado como defeito. Importações não saneiam datas futuras
  já existentes; não há migração destrutiva desses registros.
- Faturas antigas sem data usam vencimento até a data ser informada.
- O corte de saldo é mensal. Fluxos por competência e projeções mensais
  restantes não foram unificados com o caixa cronológico nesta entrega.
- Não foi aberto backup real nem consultado extrato pelo Codex nesta rodada.
  A associação abr→27/04, mai→01/06, jun→03/07, jul→23/07, ago→21/08,
  set→30/09 foi inferida pelo implementador e permanece pendente de confirmação
  pelo usuário. Nenhuma dessas datas foi gravada pelo auditor no app ou backup.
- Drive/OAuth e aceite visual manual não executados. As verificações de UI
  foram automatizadas por DOM.
- PROGRESS.md e os outros worktrees foram preservados.

## Encaminhamento

PASS permite prosseguir com o push da branch indicado pelo usuário, incluindo
o registro desta auditoria. Não autoriza merge em main. Antes do push, remoto
conferido: branch em 7f7aa36; main em 68ea5df. Resultado efetivo do push deve
ser conferido nas referências remotas e comunicado na entrega.
