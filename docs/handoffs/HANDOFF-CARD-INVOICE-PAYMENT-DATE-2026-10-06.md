# Handoff — data real de pagamento da fatura (06/10/2026)

Ajuste do gate de vencimento de fatura, implementado pelo Claude e aguardando auditoria independente do Codex. Sem push deste commit, merge ou publicação.

- Branch: `fix/card-due-date-next-month` (worktree `C:\Dev\FinFlow-card-due-date-2026-10-06`)
- Hash-base deste ajuste: `7f7aa36` (entrega anterior `273f6c0` + relatório PASS do Codex, já em `origin`)
- Commit funcional: `919dcc2`
- Hash-final: commit deste handoff (ver `git log -1`)

## Problema

No aceite contra o extrato, debitar a fatura paga sempre no mês do vencimento piorou o saldo histórico: a fatura Amazon costuma ser paga antes do vencimento, logo após o fechamento. Com o backup integral, a conta Mercado Pago divergiu em abr, jul, ago e set/2026.

## Solução

1. **`state.faturasPagasData`**: `{"<cardId>_<AAAA-MM>": "AAAA-MM-DD"}`, mesma chave de `faturasPagas`. Migração: ausente vira `{}`; nenhum backup antigo é alterado além disso.
2. **Pagar pede a data**: o modal de pagamento (o mesmo para Cartões/Faturas, cards do Dashboard e "A pagar → ✓ Pago") ganhou o campo "Data do pagamento", padrão hoje. Data vazia ou futura não grava o pagamento.
3. **Editar depois**: fatura paga ganhou o botão de data (📅) no card do Dashboard e na tela Cartões/Faturas (`openEditarDataPagamentoFaturaModal` / `salvarDataPagamentoFatura`). Serve também para informar a data de faturas pagas antes deste campo existir.
4. **Desmarcar remove a data**, junto com a conta.
5. **Saldo por data**: `getMesDebitoFatura` (usado por `calcSaldoContaAte`) debita no mês da data real quando ela existe e é válida; senão no mês do vencimento (`getDataVencimentoFatura`); sem vencimento, na competência. Uma única vez por fatura.
6. **Exibição**: "Vence dd/mm/aaaa" continua vindo só de `getDataVencimentoFatura`; as telas mostram também "Pago em dd/mm/aaaa" ou "Pago · data não informada".

## Arquivos alterados

- `index.html`: migração; `getDataPagamentoFatura`, `getMesDebitoFatura`, `fmtDataBRFatura`, `validarDataPagamentoFatura`, `fmtPagamentoFatura`; modal de pagamento e de edição da data; `toggleFaturaPaga` (remove a data); `cartaoTemHistorico` (considera o mapa novo); cards do Dashboard e tela Cartões/Faturas.
- `tests/financial-engine/card-invoice-payment-date.test.mjs` (novo, 19 testes)
- `tests/financial-engine/run-all.mjs` (registro)

Não alterados: `getCompetenciaFatura`, `calcByCardForMonth`, `calcSaldoConta` (sem corte), `getDataVencimentoFatura`, projeção cronológica e as chaves de `faturasPagas` / `faturasContas` / `faturasAjustes`.

## Testes

- `node card-invoice-payment-date.test.mjs`: 19 PASS / 0 FAIL — pagamento antecipado no mesmo mês do fechamento, no vencimento, atrasado, sem data (fallback), virada de ano (20/12, 01/01, 03/02 e sem data), débito único, data inválida ou órfã, fluxo de pagamento nas duas telas, validação, edição posterior, desmarcar, serializar/recarregar, state sem mutação e zero erros de console.
- `node run-all.mjs`: **793 PASS / 7 FAIL** (antes 774 / 7; +19 novos). As sete falhas são as mesmas dívidas preexistentes: G1-C02, G1-C06, crash de `gate3-1-distribution-validation.test.mjs`, ordenação da fatura, `PCP_EXTRA_OFFICE_GENERATION_NATURE`, `PDV_09` e `UX1R_09`.
- `node docs/audits/verify-card-due-date-codex-2026-10-06.mjs` (script do Codex, sem alteração): PASS.

## Backup real (cópia, não versionada, apagada ao final)

Cópia de `finflow_backup_2026-10-06 (1).json`, relógio em 06/10/2026, meses de 2024-01 a 2027-12, comparando com a base `d19efc0`. O backup não tem `faturasPagasData`; a migração cria `{}`.

- **Sem datas informadas** (fallback): resultado idêntico ao da entrega anterior — Mercado Pago difere em abr (+159,48), mai (+159,34), jun (+159,34), jul (+235,57), ago (+133,76) e set (+316,11).
- **Com as seis datas reais informadas pelo usuário**, aplicadas em memória às competências Amazon abr→27/04, mai→01/06, jun→03/07, jul→23/07, ago→21/08, set→30/09: Mercado Pago difere da base só em **mai (+159,34 → 6.005,95)** e **jun (+159,34 → 6.613,51)**; abr, jul, ago e set voltam a coincidir com a base.
- Nos dois casos: demais contas sem nenhuma diferença, saldo atual de todas as contas igual, 0 diferenças em totais de fatura, zero erros de página.

A associação data → competência acima é inferência do Claude a partir da ordem das datas; o extrato não está disponível para o Claude. As datas não foram gravadas em nenhum backup: precisam ser informadas no app pelo botão de data de cada fatura.

## Limitações / EXTERNAL_REVIEW_REQUIRED

1. **Faturas já pagas continuam sem data** até o usuário informá-la; enquanto isso vale o mês do vencimento (comportamento da entrega anterior).
2. **Data futura é rejeitada** ao pagar e ao editar. Não estava no pedido; evita que o saldo atual desconte uma fatura que o saldo por data ainda não vê. Uma data futura vinda de backup importado não é corrigida.
3. **Granularidade mensal**: `calcSaldoContaAte` corta por mês; o dia do pagamento só decide em que mês cai.
4. **Visões mensais por competência** (`getPersonalMonthFlows`, "Em caixa" do mês corrente em `getTotalsForMonth`, projeções mensais) seguem sem alteração, como na entrega anterior.
5. `PDV_09` e `UX1R_09` comparam o state com commits antigos e já falhavam; a chave nova `faturasPagasData` é mais uma diferença dentro dessas duas falhas preexistentes.
6. `docs/PROGRESS.md` não foi editado (a versão atual está não commitada em `C:\Dev\FinFlow`). Drive/OAuth e inspeção visual manual não exercitados.
