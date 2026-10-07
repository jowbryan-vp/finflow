# Auditoria independente Codex — vencimento de fatura — 06/10/2026

## Resultado

**PASS técnico no escopo da entrega.** Nenhum achado impeditivo novo identificado
no delta auditado. Não equivale à conciliação bancária, aceite manual ou autorização
de merge/publicação.

## Proveniência e estado

- Worktree: `C:\Dev\FinFlow-card-due-date-2026-10-06`.
- Branch: `fix/card-due-date-next-month`.
- Base: `d19efc0`; implementação Claude: `ab642e1`; entrega: `273f6c0`.
- HEAD integral: `273f6c08b3334a58d02e1b13e7df3853e4b8f8fe`.
- Checkout limpo no início. Lidos AGENTS.md, WORKFLOW.md, PROGRESS.md e handoff.
- Diff auditado: index.html, teste específico, registro no runner e handoff.
- Codex não alterou produto nem testes da suíte; acrescentou somente este
  relatório e o script de investigação independente em docs/audits/.
- Nenhum commit, push, merge, rebase ou publicação. Outros worktrees preservados.

## Verificações

- `git diff --check d19efc0..273f6c0`: PASS.
- `npm test` em tests/financial-engine: **774 PASS / 7 FAIL**, saída 1.
- Arquivo novo: **19 PASS / 0 FAIL** dentro da suíte completa.
- Repasses: **15 PASS / 0 FAIL**, sem o caso opcional de backup real.
- Comparação com a execução independente da base d19efc0 nesta sessão:
  755 PASS / 7 FAIL; aumento de 19 PASS e mesmas falhas abaixo.

Falhas preexistentes, não regressões desta entrega:

1. G1-C02.
2. G1-C06.
3. Crash de gate3-1-distribution-validation.test.mjs:101,
   `Cannot set properties of null (setting 'value')`.
4. INVOICE_PURCHASES_ORDERED_DESC_LEGACY_STABLE_FALLBACK_NO_STATE_CHANGE.
5. PCP_EXTRA_OFFICE_GENERATION_NATURE.
6. PDV_09_IDENTICAL_TO_BASE.
7. UX1R_09_ENGINE_AND_ROWS_IDENTICAL_TO_BASE.

Log local fora do repositório:
`C:\Users\jowbr\AppData\Local\Temp\finflow-card-due-audit-2026-10-06.log`.

## Investigação independente

Reprodução executável:
`node docs/audits/verify-card-due-date-codex-2026-10-06.mjs` — **PASS**.

Fixture sintética: cartão fecha 17/paga 1, compra de 600 em 05/09/2026,
três parcelas de 200 e conta com saldo inicial 1.000. Relógio 06/10/2026.

- Horizonte até 30/09 não inclui a fatura de setembro.
- Em 01/10 ela aparece uma vez, sem atraso, com competência setembro.
- Em 06/10 aparece vencida desde 01/10; até 01/11 somam-se exatamente
  duas parcelas (400), sem duplicação.
- Em janeiro as três parcelas não pagas permanecem em atraso (600),
  incluindo competências anteriores ao mês de referência.
- Fevereiro bissexto: competência janeiro/2028, fecha/paga 31, vence 29/02.
- Consultas preservam state. Dashboard mostra a linha vencida e valor correto.
- Clique real no botão Pago e confirmação pela UI grava `amz_2026-09`,
  mantém outubro não pago, vincula c1 e remove somente setembro da projeção.
- Após o pagamento, saldo atual 800; saldo histórico de setembro 1.000;
  de outubro 800. Próxima parcela permanece prevista para novembro.
- Zero erros de console/página.

Revisão de código confirmou que o helper não modifica competência, total da
fatura ou chaves persistidas. O botão do Dashboard extrai competência do ID
do evento, não da data deslocada. O scan cronológico inclui competências
anteriores ao período; o corte de histórico continua explicitamente definido
por competência na interface.

## Avaliação das limitações

- Visões mensais por competência e projeção cronológica podem exibir saídas
  em meses diferentes. A entrega não unifica essas visões; o PASS cobre a
  regra de vencimento, a projeção cronológica, os rótulos e o saldo por corte
  mensal descritos no handoff, não uma revisão geral do fluxo mensal.
- Correção à descrição ampla do handoff: getTotalsForMonth usa
  calcSaldoContaAte para meses passados com contas cadastradas; portanto esse
  saldo histórico também muda por consequência do helper. Fluxos mensais e
  projeções futuras restantes conservam as regras anteriores.
- Sem data real de pagamento, vencimento é uma aproximação para o histórico:
  antecipações e atrasos não são reconstruídos fielmente. O saldo atual segue
  o estado pago. Não tratar o saldo histórico como conciliação com extrato.
- Os outros meses do Mercado Pago citados no handoff são efeitos esperados da
  regra aplicada às competências correspondentes; os valores reais não foram
  revalidados pelo Codex nesta rodada.
- O backup real não foi aberto nesta auditoria. A escolha entre arquivos de
  877 KB e 105 KB e os valores de maio/junho continuam dependentes de confirmar
  o backup correto e confrontar o extrato; tamanho sozinho não comprova isso.
- Drive/OAuth e inspeção visual manual não executados. Teste DOM automatizado
  não substitui aceite visual.
- Base d19efc0 inclui repasses ainda fora de main; eventual integração precisa
  considerar ambas as entregas e autorização própria.

PROGRESS.md permaneceu intacto; este relatório registra a auditoria no
worktree da entrega sem copiar a versão suja do checkout original.
