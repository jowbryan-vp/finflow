# Fluxo local e estratégia de baseline

## Preparação atual

- Clone completo em `C:\Dev\FinFlow`, remoto `origin`: `https://github.com/jowbryan-vp/finflow.git`.
- `main` permanece em `e94ab4982178666c12559678d43884b13d10e3dd`.
- `snapshot/github-before-workspace-2026-09-17` identifica exclusivamente esse estado GitHub, NÃO o Gate 3.4.
- `chore/local-workspace` contém apenas a preparação documental e do editor.
- Nenhum push ou merge faz parte desta preparação.

## Recuperar a baseline verdadeira

1. Obter o repositório original do Claude com `.git` e `tests/financial-engine/`, ou um bundle Git completo (`git bundle create finflow-history.bundle --all`) acompanhado de eventuais mudanças não commitadas e arquivos não rastreados relevantes.
2. Inspecionar essa origem separadamente: remotos, branches, status, histórico, instruções locais e existência dos commits `12aca12` e `def4831`. Verificar relações de ancestralidade antes de integrar qualquer histórico.
3. Comparar o código com o `index.html` entregue e o relatório Gate 3.4. Preservar mudanças não commitadas separadamente, sem stash/reset automático.
4. Executar a suíte original conforme seu runner e dependências. O relatório afirma 227/227; isso ainda não foi reproduzido localmente.
5. Criar uma tag anotada `baseline/post-gate-3.4` no commit confirmado, incluindo o hash e a evidência de validação na anotação. Nunca mover uma tag existente silenciosamente. Se houver apenas arquivos exportados, registrar explicitamente que a recuperação do histórico está incompleta; não fabricar os commits citados.
6. Levar somente a preparação documental para uma branch baseada no histórico correto, conciliando instruções existentes. Não substituir o código correto pelo HEAD antigo do GitHub.

## Ciclo de trabalho após recuperação

Partir da baseline verificada para uma branch por gate (`gate/<numero>`). Não criar ou implementar `gate/2.2` nesta preparação.

1. Registrar especificação e critérios de aceitação em `docs/gates/`.
2. Claude implementa, executa a suíte e faz commits pequenos do escopo autorizado.
3. Claude entrega branch, hash-base, hash-final, alterações e resultados. Encerra sua edição.
4. Codex revisa o diff entre os hashes, examina código relacionado, executa testes relevantes e registra PASS/FAIL com evidências em `docs/audits/`.
5. Se FAIL, Claude corrige na mesma branch após a passagem de responsabilidade; Codex revisa novamente.
6. Após PASS e autorização aplicável, integrar em `main`, preservando histórico; preferir merge explícito quando houver interesse em manter a delimitação do gate. Publicar apenas quando solicitado.

Não executar Claude e Codex editando simultaneamente a mesma branch/checkout. Usar os painéis já instalados no VS Code, com a pasta do projeto aberta. Autenticação de cada extensão é feita pelo usuário, se solicitada pelo editor.
