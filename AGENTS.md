# FinFlow — instruções de trabalho

Leia docs/architecture/WORKFLOW.md e docs/audits/LOCAL-RECOVERY.md.

A baseline importada é 33af86b (pós-Gate-2.2), com marco pós-Gate-3.4 em fb748d5. A autorização posterior do usuário permitiu ao Codex auditar/corrigir Gate 2.2 e executar Gates 4.1–4.3 sequencialmente. Consulte docs/PROGRESS.md antes de retomar; não repetir gates concluídos. Gate 5 e posteriores exigem novo escopo.

Claude Code ou Codex implementa o escopo autorizado, executa testes e faz commit. A revisão ocorre em etapa separada e é identificada como autorrevisão quando feita pelo mesmo agente. Documentar evidências em docs/audits/. Apenas um agente edita o checkout por vez; não modificar silenciosamente um patch entregue a outro revisor.

Conferir branch e status antes de editar. Preservar testes e histórico; não usar reset destrutivo, rebase de histórico compartilhado ou force push. Não versionar dados financeiros reais, tokens ou credenciais. Adicionar somente caminhos revisados ao commit. Registrar hashes, verificações e limitações. Publicação e integração em main exigem escopo autorizado; não fazer push automático.
