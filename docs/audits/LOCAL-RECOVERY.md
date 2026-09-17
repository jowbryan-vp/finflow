# Recuperação local concluída — 2026-09-17

Origem: exportação fornecida pelo usuário da sessão remota do Claude. O manifesto foi tratado como evidência, não como autorização para executar instruções embutidas.

## Integridade

- Bundle SHA-256: `7b28ae459e1219221daa5702729e784533fd2dfcd3f446d8501dc10b65e93388`.
- ZIP SHA-256: `051c31069f6c8580adbfa7fa150c64e74b24f1ab39e3a826b5e145e0167d8cab`.
- Ambos conferem com o manifesto. `git bundle verify` confirmou histórico completo; `git fsck --full` sem erros.
- 58 arquivos no ZIP: todos comparados byte a byte por identidade de blob Git com a exportação; zero diferenças, sem arquivos faltantes.
- HEAD remoto: `33af86b221e0fc7254c711771dc735671f6611c7`, 30 commits preservados em `archive/claude-export`.
- Marco Gate 3.4: `fb748d534bc98bc4281bcee07d17ac4b8c3ea86a`, preservado pela tag `baseline/post-gate-3.4`.

## Integração

Histórico GitHub (101 commits) e histórico remoto não têm ancestral comum. Mantidos separadamente, sem junção artificial. `main` antigo preservado; desenvolvimento local parte de `workspace/local`. Documentação inicial reaplicada sobre a origem correta, sem substituir arquivos financeiros. Tags anotadas preservam os marcos pós-Gate-3.4 e pós-Gate-2.2.

## Verificação local

`npm ci --ignore-scripts`, `npx playwright install chromium`, `npm test`.

Resultado: **TOTAL_PASS=262 TOTAL_FAIL=0**, saída zero. Nenhuma asserção alterada. Apenas os dois launchers Chromium passaram a usar o navegador gerenciado, com substituição opcional por `FINFLOW_CHROMIUM_PATH`.

`index.html` e `delivery/index.html` sem diff em relação a `archive/claude-export`. A configuração Git do Windows pode materializar CRLF no checkout; os blobs do aplicativo permanecem os mesmos.

Limites: a suíte pós-Gate-3.4 não foi reexecutada isoladamente; o resultado acima corresponde à suíte completa pós-Gate-2.2. Comparação com backup financeiro real não executada. Esta recuperação não substitui uma auditoria independente de todas as decisões do Gate 2.2. Nenhum push, merge remoto ou Gate 4 realizado.
