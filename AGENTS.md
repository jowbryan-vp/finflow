# FinFlow — instruções de trabalho

Leia docs/architecture/WORKFLOW.md e docs/audits/LOCAL-RECOVERY.md.

A baseline importada é 33af86b (pós-Gate-2.2), com marco pós-Gate-3.4 em fb748d5. O Gate 2.2 já foi implementado remotamente: não reimplementá-lo. Não iniciar Gate 4 nem alterar lógica financeira sem novo escopo do usuário.

Claude Code implementa um escopo autorizado, executa testes, faz commit e entrega ao Codex. Codex revisa o diff e código relacionado, executa verificações e documenta achados em docs/audits/. Apenas um agente edita o checkout por vez; o revisor não modifica silenciosamente o patch em revisão.

Conferir branch e status antes de editar. Preservar testes e histórico; não usar reset destrutivo, rebase de histórico compartilhado ou force push. Não versionar dados financeiros reais, tokens ou credenciais. Adicionar somente caminhos revisados ao commit. Registrar hashes, verificações e limitações. Publicação e integração em main exigem escopo autorizado; não fazer push automático.
