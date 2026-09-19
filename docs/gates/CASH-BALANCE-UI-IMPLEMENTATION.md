# Implementação — "Saldo que permanece nas contas"

Escopo: `docs/gates/CASH-BALANCE-UI.md`. Papel: implementador (Claude Code). Auditoria posterior: Codex.
Não iniciou Cartões/Faturas. Nenhum push, merge ou Gate 5 novo nesta entrega.

## Hashes

- Base (HEAD ao iniciar, limpo): `919f1983513da8214c531969e5f3e6211d1acbff` (curto: `919f198`)
- Branch: `gate/5-uat-corrections` (mesma branch do escopo; nenhuma branch nova foi solicitada desta vez)
- Commit final: ver hash no fechamento do handoff (registrado após `git commit`)

## Arquivos alterados

- `index.html` — bloco "Guardar em Caixa" do Dashboard tornado condicional a `state.contas.length>0`; guards em `openExcedenteCaixa`, `confirmarExcedente` e `limparExcedente`.
- `tests/financial-engine/gate5-cash-balance-ui.test.mjs` — novo, 9 casos permanentes.
- `tests/financial-engine/run-all.mjs` — registro do novo arquivo de teste.
- `docs/gates/CASH-BALANCE-UI-IMPLEMENTATION.md` — este relatório.

Não tocado: motor de saldos (`calcSaldoConta`, `calcSaldoContaAte`, `getTotalsForMonth`), regras de projeção, contribuição, cofrinho, PJ, sincronização, aba Cartões/Faturas. `baseline-home.log` e `debug1.mjs` (arquivos locais de depuração, fora do escopo) não foram adicionados ao commit.

## Problema (antes da correção)

Com contas cadastradas, `getTotalsForMonth()` já usa `calcSaldoConta()`/`calcSaldoContaAte()` como fonte
de verdade de `emCaixaDisponivel` — `state.excedentes` não influencia esse cálculo nesse caso. Mesmo
assim, `renderDashboard()` sempre desenhava o mini-tile "Guardar em Caixa" com o valor de
`state.excedentes` e um botão "+ Guardar" que abria um modal capaz de gravar em `state.excedentes`,
sugerindo ao usuário que precisava declarar manualmente dinheiro que já estava nas contas.

## Correção

### 1. Dashboard (`renderDashboard`, `index.html`)

O mini-tile passou a ser condicional a `state.contas && state.contas.length>0`:

- **Com contas:** mostra "Saldo que permanece nas contas", com o mesmo `emCaixaDisponivel` retornado por
  `getTotalsForMonth` para o mês navegado (que já usa `calcSaldoConta` no mês atual e
  `calcSaldoContaAte` no passado). Em mês futuro, a nota do tile diz explicitamente "Projeção a partir
  do saldo atual das contas" — nunca chama o número de saldo real. Sem botão de guardar.
- **Sem contas:** bloco legado inalterado (rótulo "Guardar em Caixa", valor de `state.excedentes` do mês,
  botão "+ Guardar").

### 2. Guards no modal/confirmador legado (`openExcedenteCaixa`, `confirmarExcedente`, `limparExcedente`)

Cada uma das três funções agora retorna imediatamente, sem efeito, quando `state.contas.length>0` —
mesmo se chamada diretamente (sem passar pelo botão, que já não é renderizado nesse caso). Isso cobre a
exigência de que "chamadas programáticas ao modal/confirmador legado também não podem gravar
`state.excedentes` enquanto houver contas".

### 3. Registros antigos preservados

Nenhuma migração, remoção ou soma foi feita em `state.excedentes`. `calcExcedenteAcumulado` e o painel
"Saldo Anterior disponível" (`openDetalheExcedente`) continuam lendo os mesmos registros — eles só
deixam de ser a fonte do saldo quando há contas, porque essa branch de `getTotalsForMonth` já não os lê
(comportamento anterior a este patch, não alterado agora).

### 4. Troca de perfil

Não foi necessária nenhuma mudança de código: `switchPerfil()` já substitui `state` inteiro pelo `data`
do perfil selecionado e chama `renderDashboard()` via `navigate('dashboard')`; como o bloco agora lê
`state.contas` a cada render, a reavaliação acontece automaticamente. Confirmado pelo teste
`CASH_UI_09_PROFILE_SWITCH_NO_LEAK` com dois perfis reais (`perfis`/`switchPerfil`), não apenas dois
`loadState` sucessivos.

## Demonstração da regressão (antes de tocar em `index.html`)

Os 9 casos novos foram escritos e confirmados falhando contra o `index.html` original (git stash da
alteração, suíte nova executada, depois `git stash pop` para restaurar a correção):

```
[FAIL] CASH_UI_01_LABEL_WITH_ACCOUNTS
[FAIL] CASH_UI_02_VALUE_MATCHES_REAL_SOURCE_CURRENT
[FAIL] CASH_UI_03_VALUE_MATCHES_PAST_CUTOFF
[FAIL] CASH_UI_04_FUTURE_LABELED_AS_PROJECTION
[PASS] CASH_UI_05_LEGACY_RECORDS_PRESERVED
[FAIL] CASH_UI_06_LEGACY_MODAL_BLOCKED_WITH_ACCOUNTS
[PASS] CASH_UI_07_WITHOUT_ACCOUNTS_LEGACY_INTACT
[PASS] CASH_UI_08_NEXT_MONTH_REFLECTS_LEGACY_EXCEDENTE
[FAIL] CASH_UI_09_PROFILE_SWITCH_NO_LEAK
gate5-cash-balance-ui: TOTAL=9 PASS=3 FAIL=6
```

Os 3 casos que já passavam antes (`05`, `07`, `08`) cobrem comportamento que não deveria mudar
(preservação de registros antigos e o mecanismo legado sem contas) — servem de controle negativo. Os 6
que falhavam demonstram exatamente o problema do escopo: rótulo/botão legados presentes com contas, e o
modal legado ainda abria e gravava `state.excedentes`/agendava salvamento.

## Testes executados (depois da correção)

```
cd tests/financial-engine
npm test
```

Resultado real desta sessão (Node v24.20.0, Windows, Chromium gerenciado): **401 PASS / 0 FAIL**
(392 históricos + 9 novos de `gate5-cash-balance-ui.test.mjs`). Nenhuma asserção existente foi
enfraquecida, removida ou alterada.

## Limitações

- Não foi usado backup real, credenciais ou sincronização com o Drive.
- Não foi iniciada a aba Cartões/Faturas nem qualquer outro escopo além deste ajuste.
- O teste de troca de perfil (`CASH_UI_09`) cobre o caminho de `switchPerfil()`; não cobre a UI do modal
  de perfis (`openPerfilModal`/`renderPerfilModalBody`) em si, que não foi alterada por este patch.
- Dois arquivos locais de depuração fora do escopo (`tests/financial-engine/baseline-home.log`,
  `tests/financial-engine/debug1.mjs`) permanecem no checkout, não versionados, conforme instrução.

## Estado final

Sem push, sem merge, sem Gate 5/Cartões-Faturas. Encerrando edições e aguardando auditoria do Codex.
