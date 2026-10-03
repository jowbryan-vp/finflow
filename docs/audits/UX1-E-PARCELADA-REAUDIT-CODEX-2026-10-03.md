# Reauditoria independente Codex — PASS

Data: 03/10/2026. Implementação: Claude Code. Auditoria: Codex.

- Branch: `fix/parcelada-dia-vencimento`.
- Base reprovada: `87f068e83e0e783d8309cf96ebcb205fa778a72a`.
- Correção: `8909c98b4b5376d943a0b3c87a59773fd2042fb3`.
- Entrega auditada / HEAD: `80164a647fa49f45c9f1f81f8fe2d207175328d2`.
- Relatório anterior: `UX1-E-PARCELADA-CODEX-2026-10-03.md` (preservado).

## Resultado

**PASS** para a correção P2 de conciliação do UX-1. O FAIL anterior está
resolvido nesta entrega. Mantido o PASS técnico do patch de dia de vencimento
em parceladas; removido o bloqueio técnico que dependia do UX-1.
Isso não autoriza publicação, merge ou novo gate.

O diff foi revisado: o ajuste é calculado em centavos somente na apresentação,
sem modificar eventos do motor, valores das obrigações ou state. O renderer
separa `kind:'rounding'` das linhas pagáveis e exibe o sinal, a explicação e
o aviso de que não é uma conta a pagar. Não há ação de pagamento no ajuste.
O único consumidor do helper no produto é esse renderer; a investigação
original também usa o helper. O contrato ampliado não deixou consumidor de
produto sem tratamento nesta revisão.

## Evidências executadas pelo Codex

1. `node tests/financial-engine/run-all.mjs`: **757 PASS, 0 FAIL**.
   Inclui UX-1 17/17, parceladas 13/13 e conciliação 11/11. Log local em
   `%TEMP%/finflow-reaudit-2026-10-03.log`.
2. `node docs/audits/repro-ux1-rounding-2026-10-03.mjs`: card e lista
   **R$ 66,67**, reprodução corrigida.
3. O mesmo script com argumento `87f068e`: **FAIL esperado**, card
   R$ 66,67 contra lista R$ 66,66. Contraprova preservada.
4. Verificação independente adicional no harness, lendo os textos do DOM
   (sem usar `getCashObligationItems` para calcular a soma):

   | Duas compras em 3 parcelas | Ajuste exibido | Soma exibida / total / card |
   |---|---|---|
   | R$ 100 cada | + R$ 0,01 | R$ 66,67 |
   | R$ 200 cada | − R$ 0,01 | R$ 133,33 |
   | R$ 90 cada | Ausente | R$ 60,00 |

   Assertivas confirmaram conciliação, ausência de ações no ajuste e texto
   “Não é uma conta a pagar”. A primeira execução dessa investigação falhou
   por codificação do pipe PowerShell (acentos do regex viraram `?`); foi
   reexecutada com escapes Unicode, passando. Não era defeito do produto.
5. Revisão das novas assertivas: cobrem valores visíveis, ajuste negativo,
   mistura de obrigações, pagamentos de faturas via modal, pagamento PIX,
   render sem mutação, comparação contra a base e largura 390 px.
6. Comparações existentes de motor passaram contra `a90547f`, `a475634` e
   `87f068e`; o diff desta correção não altera fórmulas do motor.
7. `git diff --check 87f068e..80164a6`: sem erros.

## Precisão das evidências e limites

O teste UX1R_07 altera diretamente `state.contribuicaoPaga`; não percorre a
ação real de pagamento da contribuição. Ele verifica conciliação após essa
marcação. A folga fica inalterada após pagar o PIX, mas passa de R$ 860,00 a
R$ 866,67 após a marcação direta da contribuição. Portanto, a descrição de
“folga inalterada” não deve ser estendida a essa segunda operação. Essa
imprecisão de relato não invalida a conciliação nem indica regressão do delta.

Mantidos os limites da auditoria anterior: dados sintéticos, sem backup real,
Drive/OAuth autenticado ou inspeção visual manual. O eventual arredondamento
entre Disponível e Necessidade/Folga permanece fora desta correção, que
preserva o motor. As ressalvas de produto sobre parceladas sem data e o
horizonte do Dashboard continuam documentadas no relatório anterior.

Os quatro arquivos não rastreados já presentes foram preservados. Codex não
alterou produto ou testes entregues pelo Claude; adicionou este relatório e
uma atualização documental de progresso. Sem commit, push ou merge.
