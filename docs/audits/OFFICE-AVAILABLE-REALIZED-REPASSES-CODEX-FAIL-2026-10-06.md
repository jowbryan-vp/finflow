# Auditoria Codex — disponível e baixa de repasses do escritório — 06/10/2026

## Resultado

**FAIL.** A regra principal e o aceite com o backup real passaram, mas foram
encontrados dois defeitos reproduzíveis na nova baixa sem transferência. A
publicação fica bloqueada até correção pelo Claude Code e nova auditoria.

## Proveniência

- Branch: `fix/office-available-realized-repasses`.
- Base conferida: `68ea5df` (`origin/main` no início da auditoria).
- Implementação Claude Code: `fb8e3e6`.
- O checkout estava limpo; o diff contém somente `index.html`,
  `tests/financial-engine/office-repasses-transition.test.mjs` e o registro em
  `tests/financial-engine/run-all.mjs`.
- `git diff --check 68ea5df..fb8e3e6`: PASS.

## Achados

### P1 — repasse baixado ainda pode ser realizado pela função de domínio

`realizeOfficeTransfer` rejeita somente `estado === 'recebido'`. Depois de
`baixarOfficeRepasseSemTransferencia`, o estado é `cancelado`, portanto uma
chamada direta ainda cria a movimentação, credita a receita pessoal e converte
o repasse para `recebido`, mantendo contraditoriamente `motivoBaixa`,
`dataBaixa`, `retiradasVinculadas` e `obs`.

Reprodução sintética executada no navegador:

1. criar recebível realizado de R$ 300, repasse/receita previstos vinculados e
   contas empresarial/pessoal;
2. chamar `baixarOfficeRepasseSemTransferencia('rp1', '2026-10-06', 'teste', [])`;
3. chamar `realizeOfficeTransfer('rp1', '2026-10-06', 'oc1', 'c1')`.

Resultado observado: ambas as chamadas retornaram `true`; foi criada uma
movimentação; a conta pessoal recebeu R$ 300; repasse e receita passaram a
`recebido`; os campos da baixa permaneceram no repasse. A operação de domínio
precisa aceitar somente repasse `previsto` (e o teste deve provar zero mutation
para baixado/cancelado), não depender apenas do botão oculto na interface.

### P2 — baixa reescreve retroativamente a posição anterior à sua data

`officeFiltrarAteV3(D)` preserva todo repasse baixado sem comparar
`dataBaixa` com `D`. Assim, um repasse baixado em 06/10 deixa de aparecer como
pendente até numa consulta da posição em 30/09, quando a baixa ainda não
existia.

Na mesma fixture sintética:

- antes da baixa,
  `getOfficeCashPositionAtDateV3('2026-09-30').repassesPendentesCent` retornou
  `30000`;
- após registrar a baixa com `dataBaixa: '2026-10-06'`, a mesma consulta
  retornou `0`.

A filtragem temporal precisa desfazer a baixa apenas na cópia usada para datas
anteriores a `dataBaixa`, restaurando coerentemente o repasse/receita naquele
corte, sem ressuscitar o estado real nem alterar o checkout persistido. Cobrir
o dia anterior e o próprio dia da baixa em teste permanente.

## Verificações executadas

- Suíte completa no HEAD: **751 PASS / 7 FAIL**, exit code 1. As falhas
  observadas são as sete dívidas declaradas no handoff: `G1-C02`, `G1-C06`,
  crash de `gate3-1-distribution-validation.test.mjs`, ordenação da fatura,
  `PCP_EXTRA_OFFICE_GENERATION_NATURE`, `PDV_09` e `UX1R_09`.
- Teste novo sem backup: **11 PASS / 0 FAIL**, mais um `[SKIP]` explícito.
- Teste novo com
  `FINFLOW_REAL_BACKUP=C:\Users\97992925220\Downloads\finflow_backup_2026-10-06.json`:
  **12 PASS / 0 FAIL**. O aceite confirmou 13 repasses previstos, 3 a
  transferir, 10 futuros fora do Disponível, zero a transferir após as baixas
  e zero violações em `verificarInvariantesEscritorioV3()`.
- As duas reproduções independentes acima falharam no HEAD recebido.

## Limites

- O backup real foi apenas lido pelo teste; não foi versionado nem teve valores
  financeiros expostos neste relatório.
- Nenhum código de produto ou teste recebido foi alterado pelo Codex.
- Nenhum push, merge ou publicação foi executado devido ao FAIL.

**AUDITORIA CODEX: FAIL**
