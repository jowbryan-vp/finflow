# Reauditoria independente Codex — coluna de data

Data: 19/10/2026. Resultado: **PASS no escopo auditado**.

Correção Claude Code: `0a35656`; handoff: `63799d6`.
Branch: `feat/transaction-date-column`; base da funcionalidade: `784725f`.
Entrega anterior: `17472a8`, implementação `ad072fe`.
O relatório FAIL anterior permanece intacto como histórico.

## P2 resolvido

A correção CSS quebra linhas com data em duas faixas até 600 px:
data e descrição acima; valor e ações abaixo. A reprodução original Codex,
executada sem alteração, retorna `defects: []`, saída 0, state preservado e
nenhum erro de console.

| Viewport | Descrição em Receitas | Descrição em Despesas |
|---|---:|---:|
| 1440 px | 150,88 px | 138,34 px |
| 430 px | 276 px | 250 px |
| 390 px | 236 px | 210 px |
| 360 px | 206 px | 180 px |

Nas linhas sintéticas medidas, os filhos permanecem dentro das bordas.
Capturas de Receitas a 390 px e Despesas a 360 px foram inspecionadas:
descrições legíveis, data à esquerda e valores/ações sem a sobreposição
anterior.

Contraprova independente: o mesmo cenário foi executado com o HTML de
`17472a8`, servido por interceptação local do harness, sem substituir arquivos
do checkout. Voltaram os dois defeitos (descrição com largura zero a 390 px
em Receitas e Despesas), saída 1.

## Verificações

- Branch e HEAD conferidos. Apenas o relatório e o script originais Codex
  estavam não versionados; nenhum arquivo de produto tinha alteração local.
- Diff completo `17472a8..63799d6`: CSS responsivo, teste e handoff.
  Os três blocos `<script>` do HTML são byte a byte iguais entre as entregas.
  Nenhuma correção de cálculo ou persistência foi introduzida neste delta.
- `node run-all.mjs`, em `tests/financial-engine`: **807 PASS / 7 FAIL**.
- `transaction-date-column`: **14/14**, incluindo o teste novo de geometria:
  **48 linhas / 4 telas / nenhum problema**, em 1440/430/390/360 px.
  Inclui registros com e sem data, previstos, pagos e recebidos.
- Mesmas sete falhas já verificadas na base durante a auditoria anterior:
  G1-C02, G1-C06, crash de `gate3-1-distribution-validation.test.mjs`,
  `INVOICE_PURCHASES_ORDERED_DESC_LEGACY_STABLE_FALLBACK_NO_STATE_CHANGE`,
  `PCP_EXTRA_OFFICE_GENERATION_NATURE`, `PDV_09_IDENTICAL_TO_BASE` e
  `UX1R_09_ENGINE_AND_ROWS_IDENTICAL_TO_BASE`.
  A suíte da base não foi repetida nesta rodada; a comparação independente
  anterior permanece válida para identificar essas falhas.
- `git diff --check`: sem problemas.

Reprodução reutilizável:

```powershell
node docs/audits/verify-transaction-date-column-2026-10-19.mjs
```

Evidências locais:

- `C:/Dev/FinFlow-datas-reaudit-suite.log`
- `C:/Dev/FinFlow-date-reaudit-layout.json`
- `C:/Dev/FinFlow-date-reaudit-counterproof.mjs`
- `C:/Dev/FinFlow-date-reaudit-counterproof.json`

## Limites e próximo passo

PASS da funcionalidade e correção no escopo testado, não uma declaração de
suíte integralmente verde. Mantidas as dívidas anteriores.

A solução depende de `:has()`. Navegadores sem suporte não recebem a quebra
responsiva e continuam sujeitos ao defeito; não houve validação nesses
navegadores. Inspeção feita em Chromium automatizado com dados sintéticos,
sem aparelho físico, backup real, OAuth/Drive ou revisão visual integral dos
PDFs e demais telas.

Codex não alterou produto nem testes de implementação. Relatório anterior e
script preservados. Este relatório fica sem commit, como os artefatos da
primeira auditoria. Sem merge, push ou publicação. O bloqueio P2 está
resolvido; publicação continua dependendo de autorização do usuário.
