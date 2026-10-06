# Auditoria Codex — vencimento de fatura no mês seguinte — 06/10/2026

## Resultado

**PASS.** Nenhum achado reproduzível foi identificado no escopo recebido.

O commit `30e02e1b9e5e3b59e7e0972a9d111205b976ef80` corrige a data de
vencimento derivada da competência sem alterar a competência, o total da
fatura ou os motores de saldo. Cartão cujo dia de pagamento é menor ou igual
ao dia de fechamento vence no mês seguinte; os demais continuam vencendo no
próprio mês. A virada de ano e o limite ao último dia válido do mês também
foram preservados.

## Proveniência e escopo

- Branch auditada: `fix/invoice-due-date-next-month`.
- Base declarada e conferida: `f468295`.
- Implementação Claude Code: `30e02e1`.
- O working tree estava limpo no início da auditoria.
- O diff contém somente `index.html`, o novo teste
  `tests/financial-engine/gate5-invoice-due-date-next-month.test.mjs` e o
  registro em `tests/financial-engine/run-all.mjs`, conforme o handoff.
- `git diff --check f468295..30e02e1`: PASS, sem saída.
- Nenhum código de produto ou teste recebido foi alterado durante a auditoria.

## Revisão do código

- `getDataVencimentoFatura(card, mes, ano)` é puro e centraliza a nova regra.
  Ele valida `paga` em 1–31, só desloca a competência quando `fecha` também é
  válido e `paga <= fecha`, usa `addMonths` para a virada anual e delega a
  limitação de fim de mês a `projectionDate`.
- `getChronologicalProjection` usa a data nova, mas mantém `month` como a chave
  de competência e continua obtendo o valor por `calcByCardForMonth`.
- `calcProximosVencimentos` usa o mesmo helper para calcular data e diferença
  em dias; `fechoMes`/`fechoAno` continuam identificando a competência usada ao
  marcar a fatura paga, enquanto `pagaMes`/`pagaAno` descrevem o vencimento.
- Busca estática confirmou que não resta outro construtor de vencimento em
  `index.html` baseado diretamente em `card.paga`/`c.paga`.
- O diff não toca `getCompetenciaFatura`, `calcByCardForMonth`,
  `faturasPagas`, `faturasContas`, `faturasAjustes`, `calcSaldoConta` ou
  `calcSaldoContaAte`, nem introduz migração ou campo persistido.

## Verificações executadas

- Suíte completa, em `tests/financial-engine`: `npm test` —
  **729 PASS / 0 FAIL**, exit code 0.
- Arquivo novo dentro da suíte: **13 PASS / 0 FAIL**; o caso opcional com
  backup real foi reportado como `[SKIP]` por ausência de
  `FINFLOW_REAL_BACKUP`.
- Controle sintético independente em navegador, fora dos arquivos do
  checkout: competência 12/2026 produziu `2027-01-01` para fechamento 17 /
  pagamento 1, `2026-12-10` para fechamento 3 / pagamento 10,
  `2027-01-10` para igualdade 10/10 e `null` para pagamento 32.
- No mesmo controle, uma compra AMAZON de competência 12/2026 apareceu na
  projeção em `2027-01-01`, preservando `month: "2026-12"`, valor `-281.2` e
  `overdue: false`. Em “Próximos vencimentos” em 20/12/2026, a mesma fatura
  manteve competência 12/2026, vencimento 01/2027 e diferença de 12 dias.
- A comparação sintética permanente de saldos confrontou o commit-base com o
  HEAD em 11 valores e encontrou **0 diferenças**.
- O working tree permaneceu sem alterações após as verificações.

## Limitações

- O arquivo `finflow_backup_2026-10-06_integral.json` não está no repositório
  nem foi localizado em `Documents`; por isso, o Codex não repetiu a comparação
  de 66 saldos nem o 14º teste descrito no handoff. A suíte declarou essa
  ausência explicitamente e executou a comparação sintética equivalente.
- Não houve validação manual com dados reais nem publicação, merge ou push.

## Decisão

O comportamento entregue corresponde ao handoff, os consumidores relevantes
usam a mesma regra, os invariantes financeiros declarados permaneceram fora do
diff e todas as verificações disponíveis passaram.

**AUDITORIA CODEX: PASS**
