# Handoff — Gate UX-1, Dashboard de caixa (Necessidade / Folga de caixa), 30/09/2026

Fluxo: Claude implementa → Codex audita. Este documento é a entrega da
implementação, não uma auditoria nem uma aprovação. Especificação registrada
em `docs/gates/UX-1-DASHBOARD-CAIXA.md`.

## Proveniência

- **Branch:** `fix/dashboard-cash-highlight`, criada a partir de
  `a90547fe36be18a7658010b8bc89f87a2d52e8ee` (último commit da projeção
  pessoal, com `FINFLOW_PERSONAL_CASH_PROJECTION_REAUDIT_2: PASS`).
- **Hash-base:** `a90547fe36be18a7658010b8bc89f87a2d52e8ee`.
- **Commit funcional:** `b617393bd0df9e4878320cc7369526209e4cb878`.
- **Commit documental (hash-final):** este handoff, capturas e `docs/PROGRESS.md` (ver `git log -1`).
- **Working tree antes de editar:** só os dois relatórios do Codex não
  rastreados (`docs/audits/PERSONAL-CASH-PROJECTION-SCENARIOS-REAUDIT*.md`).
  Continuam não rastreados; não foram adicionados nem alterados.
- Sem push, merge, rebase ou alteração de `main`.

## O que encontrei no código (antes de editar)

- `#page-dashboard` tinha, nesta ordem: `#dashResumoMensal` e
  `#dashDetalhamento` (`renderPersonalMonthSummary`, competência), `#dashHero`
  (`renderFinancialOutlook`: preferências + 3 cards "Disponível agora / Após
  obrigações do período / Saldo projetado em …" + potenciais),
  `#dashResumoPagar` (sempre vazio), `#dashProjecaoFinanceira` (linha do
  tempo), `#dashPrevisaoMedia` (estimativa variável), Contas & Compromissos
  (`#dashSaldoContas` + `#dashProximosVencimentos`), Destinação, Faturas,
  gráficos e últimos lançamentos.
- `renderFinancialOutlook` calculava `end` (preferência "Planejar até" → fim
  do ciclo → fim do mês) e chamava `getFinancialOutlook(hoje, end)`.
- `renderProximosVencimentos` usava `calcProximosVencimentos`, cálculo próprio
  (só fixas em PIX com dia + fatura pendente mais antiga por cartão, top 10,
  sem itens sem data nem contribuição). **Não** fechava com `p.obligations`;
  por isso foi adaptado (não duplicado) para ler `p.events` + `p.undated`.
- `renderAnalise` (aba Análise) só tinha filtros/gráficos de gastos por
  categoria.
- `getChronologicalProjection` registrava receitas sem conta pessoal em
  `issues` apenas como `{id, reason:'missing_personal_account'}`, **sem
  valor**.
- `renderResumoPagar`, `renderProjecaoFinanceira` e
  `renderPrevisaoMediaHistorica` já eram código morto (sem chamadores, com
  `if(!el) return`). Não foram tocados.

## Alterações

### Motor (uma linha, metadado)

`getChronologicalProjection`: o issue `missing_personal_account` passa a
trazer `amount:item.amount`. Nenhum total, evento, filtro ou fórmula muda.
Motivo: a especificação pede que W venha "dos itens que o próprio motor já
marca em issues", e eles não tinham valor; reconstruir o valor pelo id na
interface duplicaria a regra de ocorrência (id de parcela usa índice, não
mês). O teste `UX1_13` prova que é a única diferença em relação à base.

### Dashboard (apresentação)

| Bloco | Situação |
|---|---|
| Destaque "Caixa até o próximo salário" (`#dashHero`): Disponível agora / A pagar até DD/MM / Necessidade ou Folga de caixa + linha informativa | **Novo** (substitui o hero antigo) |
| Lista "A pagar até DD/MM" (`#dashProximosVencimentos`) | **Adaptado** de "Próximos Vencimentos"; mesmo "✓ Pago" (`toggleFaturaPaga`/`togglePago`); débito automático vira etiqueta; contribuição é paga na Destinação |
| Saldo por Conta Bancária | Ficou (agora em largura total) |
| Destinação (contribuição, cofrinho, saldo que permanece) | Ficou (ações operacionais) |
| Faturas dos Cartões | Ficou |
| Gráficos "Gastos por Categoria" e "Entradas vs Saídas" + Últimos lançamentos | Ficaram (não listados no item C; ver limitações) |
| Resumo pessoal — competência (`#dashResumoMensal`, `#dashDetalhamento`) | **Movido** para Análise (`#anResumoMensal`, `#anDetalhamento`) |
| Preferências de planejamento | **Movidas** para Análise (`#anConfigPlanejamento`) |
| Saldo projetado no fim do período + qualidade + receitas potenciais | **Movidos** para Análise (`#anProjecaoCaixa`) |
| Linha do tempo dos lançamentos | **Movida** (`#anProjecaoFinanceira`) |
| Gastos variáveis estimados | **Movido** (`#anPrevisaoMedia`) |
| "Após obrigações do período" (`outlookCommitted`) e "Disponível agora" (`outlookAvailable`) do hero antigo | **Removidos** (viraram os cards do destaque) |
| "Resultado projetado do mês" (`pmResultadoProjetado`, `pmResultadoFormula`, `pmResultadoTexto`) | **Removido** de todas as telas |
| `#dashResumoPagar`, `#dashProjecaoFinanceira`, `#dashPrevisaoMedia` (contêineres) | Removidos do HTML |

Regras do destaque: sinal decidido em centavos (`toCents(p.committed)`);
`< 0` → "Necessidade de caixa", vermelho (`t-danger`/`red`); `≥ 0` → "Folga
de caixa", verde (`t-ok`/`green`); valor em módulo. "A receber confirmado até
DD/MM" = `p.contracted`; com necessidade e X > 0, "Se tudo entrar, a
necessidade cai para R$ Y" ou "passa a sobrar R$ Z". "R$ W previstos sem conta
de destino" = soma de `issues[missing_personal_account].amount`, só se W > 0.

### Análise

Topo da aba, antes dos filtros de gastos: Configurações de planejamento →
"Orçamento do mês — competência <mês>" (aviso "Competência (orçamento do
mês), não caixa") com resumo, composição, cenários e pendências → "Projeção
de caixa até DD/MM" (saldo projetado com a fórmula, potenciais, qualidade) →
linha do tempo → estimativa variável → "Gastos por categoria" (conteúdo
anterior intacto).

### Renderização

- `getCashOutlookView()` concentra a escolha de `today`/`end` (código movido
  de `renderFinancialOutlook`, sem alteração de lógica).
- `renderDashboard` → `renderPlanningAnalysis(renderCashDashboard())`: o
  Dashboard e os blocos da Análise usam a mesma chamada a
  `getFinancialOutlook`, e a Análise nunca fica defasada após uma mutação
  feita em outra tela (custo igual ao anterior).
- `renderAnalise` chama `renderPlanningAnalysis()`.
- `setFinancialPreference`: mesma validação e persistência; após salvar,
  redesenha destaque + lista + Análise (antes só o hero). `historyStartMonth`
  continua redesenhando o Dashboard inteiro.

## Arquivos alterados

- `index.html` — CSS do destaque/lista; HTML do Dashboard e da Análise;
  linha do issue no motor; `getCashOutlookView`, `renderCashDashboard`,
  `renderCashHighlight`, `renderPlanningAnalysis`, `renderFinancialOutlook`,
  `renderPersonalMonthSummary`, `renderDashboard`, `renderAnalise`,
  `setFinancialPreference`; seção "Próximos vencimentos" substituída por
  `getCashObligationItems` / `cashObligationAction` /
  `renderProximosVencimentos(view)` (remove `calcProximosVencimentos`, sem
  outros usos).
- `tests/financial-engine/ux1-cash-dashboard.test.mjs` (novo, 17 testes).
- `tests/financial-engine/fixtures/ux1-cash-dashboard-fixture.mjs` (novo,
  sintético).
- `tests/financial-engine/run-all.mjs` — inclui a suíte nova.
- `tests/financial-engine/gate4-3-dashboard.test.mjs`,
  `gate5-salario-legacy-conversion.test.mjs`,
  `personal-cash-projection-scenarios.test.mjs` — seletores/expectativas dos
  blocos movidos; asserções do card removido trocadas por "ausente" + tom/sinal
  verificados no "Resultado completo do mês". As asserções de motor
  (`resultadoProjetadoCents` etc.) ficaram como estavam.
- `docs/gates/UX-1-DASHBOARD-CAIXA.md`, este handoff,
  `docs/handoffs/assets/ux1/*.png`, `docs/PROGRESS.md`.

## Testes

Comandos (em `tests/financial-engine/`):

```
node run-all.mjs                       # suíte completa
node ux1-cash-dashboard.test.mjs       # só o gate
FINFLOW_SCREENSHOT_DIR=<dir> node ux1-cash-dashboard.test.mjs   # + capturas
```

Resultados:

- Base `a90547f`, antes de editar: `TOTAL_PASS=716 TOTAL_FAIL=0`.
- Depois (`b617393`): `TOTAL_PASS=733 TOTAL_FAIL=0` (716 + 17 novos; nenhum
  teste antigo removido; 89/89 da projeção pessoal, 11/11 Gate 4.3, 10/10
  conversão de salário legado).
- Ajustes posteriores ao run completo ficaram restritos ao bloco de capturas
  de `ux1-cash-dashboard.test.mjs` (só roda com `FINFLOW_SCREENSHOT_DIR`);
  reexecutado: 17/17.

Cenário de aceitação (`UX1_01`–`UX1_04`): Disponível R$ 6.705,89; A pagar até
29/10 R$ 11.978,13; **Necessidade de caixa R$ 5.272,24** (vermelho, sem
sinal); "R$ 3.120,00 previstos sem conta de destino"; lista com 8 itens,
ordenada por data e "sem data" no fim, somando 11.978,13 centavo a centavo.

Demais: linha "a receber confirmado" com 0 / 2.000 (cai para 3.272,24) /
6.000 (passa a sobrar 727,76) (`UX1_05`); Folga verde R$ 727,76 (`UX1_06`);
zero exato = Folga R$ 0,00 (`UX1_07`); um centavo = Necessidade R$ 0,01
(`UX1_08`); card removido em todas as 14 páginas e no código (`UX1_09`);
Dashboard sem blocos analíticos (`UX1_10`); Análise com competência,
cenários, saldo projetado e preferências visíveis (`UX1_11`); "Planejar até"
e método alterados na Análise refletindo no Dashboard e voltando com "Usar
fim do ciclo" (`UX1_12`); **motor idêntico ao commit-base** (`UX1_13`:
carrega `git show a90547f:index.html` numa segunda página e compara
`getFinancialOutlook` em 3 períodos e `getPersonalMonthProjection` em 4
competências, para 4 fixtures, com JSON idêntico; a única diferença é
`amount`, presente só nos issues `missing_personal_account`); render não muta
`state` (`UX1_14`); "✓ Pago" mantém card × lista (`UX1_15`); 390 px sem
rolagem lateral (`UX1_16`); sem erros de console (`UX1_17`).

## Capturas (dados sintéticos)

`docs/handoffs/assets/ux1/`:
`ux1-dashboard-necessidade-desktop.png`, `ux1-dashboard-necessidade-mobile.png`,
`ux1-dashboard-folga-desktop.png`, `ux1-dashboard-folga-mobile.png`,
`ux1-analise-desktop.png`, `ux1-analise-mobile.png` (1440 px e 390 px).
No bloco de capturas o toast e a tela de login do Drive são ocultados por CSS:
o harness não tem OAuth e um temporizador de sincronização os exibia no meio
da captura.

## Limitações e pontos para a auditoria

1. Toque no motor: só o `amount` informativo no issue (acima). Se o auditor
   preferir motor intocado, a alternativa é resolver o valor pelo id na
   interface, com a ressalva da regra duplicada.
2. W soma **todos** os itens que o motor marca como sem conta: inclui
   ocorrências do mês final com data depois do fim do período, ocorrências
   atrasadas não recebidas e receitas potenciais sem conta. Não filtrei para
   não recalcular regra.
3. Cada item da lista é arredondado ao centavo; se um dia uma fatura tiver
   fração de centavo (parcelas como 100/3), a soma visual dos itens pode
   diferir em R$ 0,01 do card. O teste cobre o caso real (sem frações).
4. "Saldo projetado" na Análise mantém o formatador antigo (`fmtBRL`, mostra
   "R$ -5.272,24"), como era no hero anterior.
5. Gráficos "Gastos por Categoria" / "Entradas vs Saídas" continuam no
   Dashboard: o item C não os incluía. Candidatos naturais para a Análise num
   próximo escopo.
6. A contribuição na lista não tem botão "✓ Pago" (`toggleContribuicaoPaga`
   só atua na competência em tela); continua na Destinação.
7. Backup real e Drive autenticado não testados; só fixture sintética.

Parado após a entrega, aguardando auditoria do Codex.
