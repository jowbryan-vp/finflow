# Auditoria independente Codex — coluna de data

Data: 19/10/2026. Resultado: **FAIL (P2)**.

Implementação: Claude Code, `ad072fe`; handoff: `17472a8`.
Base: `784725f`. Branch auditada: `feat/transaction-date-column`.
Escopo: `docs/gates/TRANSACTION-DATE-COLUMN.md`.

## P2 — coluna fixa elimina a descrição das transações no celular

Local: `index.html:476–477` (`.item-row-date`), aplicada às linhas de
Receitas (`renderReceitas`) e Despesas (`despItemHTML`).

A célula reserva 60 px abaixo de 480 px, mais o gap de 10 px. A linha flex
mantém valor e três botões na mesma linha; `.item-row-info` pode encolher até
zero. Assim, incluir a data retira o espaço que permitia identificar o
lançamento. O problema também ocorre em lançamentos antigos com data vazia,
pois a célula continua reservada.

Reprodução em Chromium/Playwright com dados exclusivamente sintéticos:
receita prevista "Projeto de arquitetura", R$ 1.500,00 em 25/10/2026;
despesa PIX "Compra de material", R$ 250,00 em 05/10/2026. Abrir Receitas e
Despesas (expandir o acordeão Dinheiro/PIX) em viewport de 390 px.

| Tela / viewport | Largura da descrição na base | Largura na entrega |
|---|---:|---:|
| Receitas / 430 px | 75,66 px | 5,66 px |
| Despesas / 430 px | 63,06 px | 0 px |
| Receitas / 390 px | 35,66 px | 0 px |
| Despesas / 390 px | 23,06 px | 0 px |

Em 390 px, o botão final de Despesas termina em x=362,48 enquanto a linha
termina em x=352. Em 360 px, ambas as telas ultrapassam a linha. Capturas
inspecionadas confirmam descrições invisíveis, metadados invadindo valor e
botões fora do cartão. Na base já há pouco espaço, mas a coluna agrava o
problema e introduz o desaparecimento completo nos casos de 390/430 px.

**Devolução ao Claude:** ajustar o layout responsivo mantendo data em primeira
posição, descrição identificável, valor legível e ações acessíveis; validar
linhas com e sem data, previstas e recebidas/pagas, nas listas do escopo.
Não alterar cálculos ou persistência. Adicionar cobertura de geometria/layout
para que a presença da célula no DOM não seja confundida com usabilidade.
Entregar novo commit e handoff para reauditoria; não publicar esta entrega.

## Evidência reproduzível

Script de investigação Codex:
`docs/audits/verify-transaction-date-column-2026-10-19.mjs`.

Na raiz da entrega:

```powershell
node docs/audits/verify-transaction-date-column-2026-10-19.mjs
```

Retorna duas ocorrências em `defects` (Receitas e Despesas a 390 px), saída 1.
Para contraprova, definir `AUDIT_ROOT` com um checkout da base que tenha as
dependências do harness instaladas e executar o mesmo script. Na base,
`defects: []`, saída 0. `AUDIT_SCREENSHOTS` opcional aponta para uma pasta
existente onde gravar capturas sintéticas. Ambos preservam state e não geram
erros de console. Não usar dados reais.

## Verificações executadas

- Leitura do fluxo, progresso, escopo, handoff, diff completo e renderizadores
  relacionados. Checkout entregue inicialmente limpo, HEAD `17472a8`.
- Suíte completa na entrega: **806 PASS / 7 FAIL**; novos casos **13/13**.
- Suíte completa em worktree detached da base `784725f`: **793 PASS / 7 FAIL**.
- Mesmas falhas: G1-C02, G1-C06, crash em
  `gate3-1-distribution-validation.test.mjs` (elemento nulo),
  `INVOICE_PURCHASES_ORDERED_DESC_LEGACY_STABLE_FALLBACK_NO_STATE_CHANGE`,
  `PCP_EXTRA_OFFICE_GENERATION_NATURE`, `PDV_09_IDENTICAL_TO_BASE` e
  `UX1R_09_ENGINE_AND_ROWS_IDENTICAL_TO_BASE`.
- A comparação inicial por arquivo exportado foi descartada porque testes
  históricos precisam de `git show`; os totais acima vêm de worktree Git.
- Diff de produto limitado a helpers de exibição, CSS e inserção de células;
  nenhuma mudança de cálculo/persistência identificada. Testes de renderização
  preservam state/totais. Isso não certifica todos os dados possíveis.
- Inspeção visual das capturas sintéticas de Receitas (base e entrega) e
  Despesas, além das medidas em 1440, 430, 390 e 360 px.

Logs locais: `C:/Dev/FinFlow-datas-audit-suite.log` e
`C:/Dev/FinFlow-datas-audit-base-git-suite.log`.

## Limites e estado final

Sem backup real, OAuth/Drive, aparelho físico ou revisão visual integral dos
PDFs e de todas as telas. Os testes dos PDFs verificam HTML, não paginação.
As sete falhas antigas não causam este FAIL: o bloqueio é a regressão visual
adicional reproduzida independentemente.

Codex não corrigiu produto, não alterou testes de implementação, não fez
commit, merge, push ou publicação. Somente relatório e script de investigação
foram adicionados ao checkout da entrega. Documentação pendente no checkout
`C:/Dev/FinFlow` preservada. Próximo passo: correção Claude e reauditoria.
