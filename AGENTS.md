# FinFlow — instruções de trabalho

Leia `docs/architecture/WORKFLOW.md` e `docs/audits/WORKSPACE-SETUP.md` antes de trabalhar.

## Estado atual

Workspace em preparação. O histórico do GitHub está preservado, mas a origem Git pós-Gate-3.4 e sua suíte de testes ainda precisam ser recuperadas. Não confundir o HEAD importado do GitHub com a baseline pós-Gate-3.4. Não iniciar implementação financeira enquanto essa origem estiver pendente.

## Escopo e preservação

- Não implementar Gate 2.2 nem Gate 4 sem uma nova solicitação explícita.
- Nesta preparação, não alterar `index.html`, lógica financeira, regras de negócio, dados, branding ou sincronização.
- Não reinicializar Git, reescrever histórico, usar reset destrutivo ou sobrescrever trabalho existente.
- Não versionar backups financeiros reais, credenciais, tokens ou arquivos de ambiente privados.
- Preservar os testes existentes; não inventar resultados ou reconstruir testes ausentes como se fossem os originais.

## Trabalho sequencial

Claude Code implementa um escopo autorizado; registra testes e commit; entrega a revisão para Codex. Codex revisa o commit e código relacionado, executa verificações e documenta achados em `docs/audits/`. Apenas um agente altera o checkout por vez. O agente revisor não modifica silenciosamente o patch em revisão.

Antes de qualquer edição, conferir branch, status, instruções e escopo. Não usar `git add .`: adicionar somente os caminhos revisados. Registrar hash inicial/final, comandos executados, resultados e limitações. Merge e publicação seguem a autorização do usuário; não fazer push automático.
