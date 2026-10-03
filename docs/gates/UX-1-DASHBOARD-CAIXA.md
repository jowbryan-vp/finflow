# Gate UX-1 — Dashboard de caixa (Necessidade / Folga de caixa)

Escopo autorizado pelo usuário em 30/09/2026 (prompt "FinFlow — Correção do
Dashboard: destaque de caixa"). Somente apresentação: sem alterar fórmulas do
motor financeiro, sem gravar/migrar `state.*`, backup ou formato de
exportação, sem iniciar outro gate, sem push/merge em `main`.

## Pergunta que o Dashboard responde

"Consigo pagar tudo até o próximo salário? Se não, quanto falta?"

Período = de hoje até o fim do ciclo do salário principal (ou "Planejar até"),
o mesmo `end` que `renderFinancialOutlook` já usava. Nunca o mês do calendário.

## Regras

1. Três cards, nesta ordem, com os valores de `getFinancialOutlook(hoje, end)`:
   - **Disponível agora** = `p.available`;
   - **A pagar até DD/MM** = `p.obligations`;
   - **Necessidade de caixa** (vermelho) quando `p.committed < 0`, ou
     **Folga de caixa** (verde) quando `p.committed ≥ 0` (zero = Folga
     R$ 0,00); valor sempre em módulo. Sinal decidido em centavos.
2. Linha informativa: "A receber confirmado até DD/MM: R$ X" (`p.contracted`).
   Com necessidade e X > 0: "Se tudo entrar, a necessidade cai para R$ Y"
   (Y = |committed| − X) ou "passa a sobrar R$ Z" quando X ≥ |committed|.
3. "R$ W previstos sem conta de destino": W = soma dos itens que o motor marca
   em `issues` com `missing_personal_account`. Para isso o motor passa a
   anexar o valor do item (`amount`) a esse issue — metadado informativo, fora
   de qualquer total.
4. Lista "A pagar até DD/MM" = `p.events` + `p.undated` dos tipos `invoice`,
   `expense`, `contribution`, por data (sem data no fim). O total bate centavo
   a centavo com o card. Substitui a antiga "Próximos Vencimentos" (que tinha
   cálculo próprio e não fechava com o card), mantendo o "✓ Pago".
   *Correção P2 (03/10/2026, auditoria UX1-E-PARCELADA-CODEX):* cada linha é
   arredondada e o card arredonda o agregado; com frações de centavo, a lista
   mostra a linha explícita "Ajuste de arredondamento" (sem data, sem "✓ Pago",
   não é obrigação pagável) com a diferença: linhas + ajuste = total = card.
5. Vão para a aba Análise, sem mudar cálculo: resumo pessoal por competência
   (título "Orçamento do mês — competência …", aviso "não caixa"), resultado
   completo, saldo acumulado estimado, saldo projetado no fim do período com
   estimativa variável, cenários pior/melhor, receitas potenciais, linha do
   tempo e preferências (salário principal, Planejar até, método, histórico).
   Preferências continuam em `setFinancialPreference` e refletem no Dashboard.
6. O card "Resultado projetado do mês" (`pmResultadoProjetado`) e sua fórmula
   saem de todas as telas. O campo `resultadoProjetadoCents` do motor fica
   (é usado pelo saldo acumulado).

## Aceitação (fixture sintética `tests/financial-engine/fixtures/ux1-cash-dashboard-fixture.mjs`)

Hoje 30/09/2026, fim do ciclo 29/10/2026. Disponível 6.705,89; a pagar
11.978,13; **Necessidade de caixa R$ 5.272,24**; sem conta de destino
R$ 3.120,00; lista soma 11.978,13; disponível > a pagar → Folga de caixa;
motor idêntico ao commit-base a90547f. Testes: `ux1-cash-dashboard.test.mjs`.
