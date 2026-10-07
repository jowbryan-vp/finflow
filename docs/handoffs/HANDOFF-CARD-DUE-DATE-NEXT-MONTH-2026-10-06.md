# Handoff — vencimento de cartão que paga no mês seguinte ao fechamento (06/10/2026)

Implementação Claude, aguardando auditoria independente do Codex. Sem push, merge ou publicação.

- Branch: `fix/card-due-date-next-month` (worktree `C:\Dev\FinFlow-card-due-date-2026-10-06`)
- Hash-base: `d19efc0` (ponta de `fix/office-available-realized-repasses`, PASS Codex)
- Commit funcional: `ab642e1`
- Hash-final: commit deste handoff (ver `git log -1`)

## Problema e regra

Cartão com `paga <= fecha` (Amazon: fecha 17, paga 1) tinha a fatura datada no mês da competência: a de set/2026 aparecia com vencimento 01/09 em vez de 01/10, e a fatura paga debitava a conta um mês antes no saldo por data.

Regra: `paga <= fecha` → vence no mês seguinte ao da competência; `paga > fecha` → mesmo mês. Sem dia de fechamento: mesmo mês (comportamento anterior). Sem dia de pagamento: sem data (`null`), e o débito da fatura paga continua no mês da competência.

## Arquivos alterados

- `index.html`
  - novo `getDataVencimentoFatura(card, ano, mes)` (fonte única), `getMesDebitoFatura(cardId, ano, mes)` e `fmtVencimentoFatura(card, ano, mes)`, logo após `getCompetenciaFatura`;
  - `getChronologicalProjection`: evento `invoice` datado pelo helper (alimenta "A pagar" e os alertas de vencido do Dashboard);
  - `calcSaldoContaAte`: corte da fatura paga pelo mês do vencimento, não pela competência;
  - exibição: card de fatura do Dashboard e do Relatório ("Fecha N · Vence DD/MM/AAAA") e tela Cartões/Faturas ("Fechamento / Vencimento", `#cartaoFaturaVencimento`).
- `tests/financial-engine/card-due-date-next-month.test.mjs` (novo, 19 testes)
- `tests/financial-engine/run-all.mjs` (registro do arquivo novo)

Todos os usos de `card.paga` foram levantados antes da alteração. Ficaram como estavam: migração (`paga` indefinido → null), formulário de edição do cartão e a lista de cartões em Configurações ("Fecha dia N · Paga dia N"), que mostram a configuração, não a data de uma fatura.

## Não alterado

`getCompetenciaFatura`, `calcByCardForMonth`, `calcSaldoConta` (sem corte) e as chaves de `faturasPagas` / `faturasContas` / `faturasAjustes`. Nenhuma migração; `state` não é modificado.

## Testes

- `node card-due-date-next-month.test.mjs`: 19 PASS / 0 FAIL — `paga<fecha`, `paga==fecha`, `paga>fecha`, virada de ano (dez/2026 → 01/01/2027), dia 31 em mês curto, cartão sem fechamento / sem pagamento / inexistente, projeção, Dashboard, tela de fatura, saldo por data, competência e chaves intactas, state sem mutação e zero erros de console.
- `node run-all.mjs`: **774 PASS / 7 FAIL** (base 755 / 7; +19 novos). As sete falhas são as mesmas dívidas preexistentes da base: G1-C02, G1-C06, crash de `gate3-1-distribution-validation.test.mjs`, ordenação da fatura, `PCP_EXTRA_OFFICE_GENERATION_NATURE`, `PDV_09` e `UX1R_09`. Nenhuma fixture existente tem cartão com `paga <= fecha` (só 3/10 e 1/7), então as duas comparações com commit-base que já falhavam não escondem diferença nova desta entrega.

## Backup real (cópia, não versionada)

Comparação `d19efc0` × entrega sobre cópia de `finflow_backup_2026-10-06 (1).json` (o arquivo integral, 877 KB), relógio fixo em 06/10/2026, todos os meses de 2024-01 a 2027-12:

- Fatura Amazon de set/2026: R$ 316,11, paga pela conta Mercado Pago; vencimento base 01/09/2026 → entrega **01/10/2026**.
- Mercado Pago, saldo de fim de mês: mai/2026 5.846,61 → **6.005,95** (Δ +159,34); jun/2026 6.454,17 → **6.613,51** (Δ +159,34). Demais meses alterados na mesma conta: abr (+159,48), jul (+235,57), ago (+133,76), set (+316,11) — cada um é a fatura Amazon daquela competência, que passa a debitar no mês seguinte.
- Demais contas (5): zero meses com saldo de fim de mês diferente.
- Saldo atual (`calcSaldoConta`) de todas as contas: igual.
- Totais de fatura: 0 diferenças em 192 combinações cartão × mês.
- Chaves de `faturasPagas` / `faturasContas` / `faturasAjustes`: iguais; `state` intacto; zero erros de página.
- Projeção 06/10 → 31/12: as faturas Amazon de out e nov passam de 01/10 e 01/11 para 01/11 e 01/12; a de dez (vence 01/01/2027) sai do período.

O extrato do Mercado Pago não está disponível para o Claude: a conferência é que a diferença de −159,34 informada no escopo é exatamente compensada em mai e jun. A cópia usada foi apagada ao final.

## Limitações / EXTERNAL_REVIEW_REQUIRED

1. **Visões mensais por competência não foram alteradas.** `getPersonalMonthFlows`, o "Em caixa" de `getTotalsForMonth` e as projeções mensais acumuladas continuam lançando a fatura no mês da competência. O escopo listou projeção cronológica, Dashboard, tela de faturas e saldo por data; mudar essas visões alteraria números mensais além do pedido.
2. **Não existe data real de pagamento da fatura** (`faturasPagas[k]` é booleano). O saldo por data debita no mês do vencimento; uma fatura Amazon paga adiantada, ainda no mês da competência, só entra no saldo histórico no mês seguinte.
3. O saldo de fim de set/2026 do Mercado Pago sobe 316,11 pela mesma regra (fatura de set vence 01/10).
4. Base é `d19efc0`, ainda não integrada à `main`: o merge desta branch leva junto a entrega de repasses aprovada.
5. `docs/PROGRESS.md` não foi editado: a versão atualizada está não commitada no checkout `C:\Dev\FinFlow`.
6. Drive/OAuth e inspeção visual manual não exercitados.
