# FinFlow — divisão de trabalho obrigatória

Leia docs/architecture/WORKFLOW.md e docs/PROGRESS.md antes de trabalhar.

## Fluxo solicitado pelo usuário

1. Claude Code implementa e corrige código e testes dentro do gate autorizado.
2. Claude executa a suíte, faz commit e entrega hashes, diff, resultados e limitações.
3. Codex audita o commit e código relacionado, executa verificações e registra PASS/FAIL em docs/audits/.
4. Se FAIL, Codex devolve achados reproduzíveis ao Claude; Claude corrige e entrega novo commit; Codex repete a auditoria.
5. Só avançar após PASS e dentro do escopo autorizado.

Codex coordena, especifica, documenta e audita; não assume a implementação ou correção financeira no lugar do Claude. Se Claude estiver indisponível, registrar o bloqueio e pedir intervenção, sem trocar os papéis silenciosamente. Para reproduções de auditoria, Codex pode criar testes de investigação; mudanças de produto devem ser entregues pelo Claude.

Apenas um agente edita o checkout por vez. Revisor não altera silenciosamente o commit recebido. Não chamar autorrevisão de auditoria independente.

## Estado e limites

Baseline remota 33af86b; marco pós-Gate-3.4 fb748d5. Gates 4.1–4.3 existentes foram implementados e autorrevisados pelo Codex antes da restauração deste fluxo; preservar essa atribuição. Não reimplementar nem declarar revisão independente retroativa. Gate 5 e posteriores precisam de novo escopo.

Conferir branch/status antes de editar. Preservar históricos e tags; sem reset destrutivo, rebase compartilhado ou force push. Não versionar dados reais, tokens ou credenciais. Adicionar somente caminhos revisados. Publicação e merge em main exigem autorização; não fazer push automático.
