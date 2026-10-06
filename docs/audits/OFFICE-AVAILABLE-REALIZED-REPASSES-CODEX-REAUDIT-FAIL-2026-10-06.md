# Reauditoria Codex — disponível e baixa de repasses — 06/10/2026

## Resultado

**FAIL.** O commit corretivo `42c9691` fecha as duas reproduções originais,
mas a correção temporal ainda cria uma pendência retroativa no modelo v3
quando a própria origem do repasse é posterior ao corte.

## Proveniência

- Implementação original: `fb8e3e6`.
- FAIL anterior: `29d548f`.
- Correção Claude Code reavaliada: `42c9691`.
- O diff corretivo altera somente `index.html` e
  `tests/financial-engine/office-repasses-transition.test.mjs`.
- `git diff --check 29d548f..42c9691`: PASS.

## Itens corrigidos

- `realizeOfficeTransfer` agora aceita somente repasse `previsto`; a tentativa
  de realizar um repasse baixado retorna `false` com zero mutation.
- Para origem que já existia antes do corte, a baixa posterior é desfeita só
  na cópia temporal: o dia anterior volta a mostrar o repasse como previsto e
  o próprio dia preserva a baixa.

## Achado P1 — origem v3 futura vira pendência antes de existir

`officeFiltrarAteV3(D)` primeiro marca em `removidos` os recebimentos/liberações
v3 posteriores a `D`. Porém, o filtro de repasses preserva incondicionalmente
todo item baixado. Em seguida, se `dataBaixa > D`, ele restaura esse item como
`previsto` sem remover `recebimentoId`. `isOfficeRepasseATransferir` considera
qualquer `recebimentoId` suficiente para tratar a origem como recebida.

Reprodução independente no commit `42c9691`:

1. parcela v3 com recebimento `rcb1` em 05/10/2026;
2. repasse de R$ 300 derivado de `rcb1`, baixado em 06/10/2026;
3. executar, numa cópia, `officeFiltrarAteV3('2026-10-01')` e então
   `getOfficeCashPositionV3('2026-10-01')`.

Resultado observado:

- o recebimento foi corretamente removido da cópia (`recebimentos.length=0`);
- o repasse permaneceu, voltou a `previsto` e conservou
  `recebimentoId='rcb1'`;
- a receita pessoal também voltou a `previsto`;
- `repassesPendentesCent` retornou `30000`, embora em 01/10 a entrada de 05/10
  e o repasse derivado ainda não existissem;
- o state real permaneceu intacto.

A correção deve distinguir “baixa posterior de repasse cuja origem já existia
no corte” de “repasse criado por recebimento/liberação posterior ao corte”. No
segundo caso, o repasse não pode ser restaurado como pendência. Cobrir ao menos
um recebimento v3 futuro e, idealmente, uma liberação v3 futura, preservando os
limites do dia anterior/próprio dia já testados.

## Decisão

A publicação continua bloqueada. O achado afeta a posição histórica e pode
fazer a projeção afirmar que havia valor a transferir antes da entrada que
originou o repasse.

**REAUDITORIA CODEX: FAIL**
