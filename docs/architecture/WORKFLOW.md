# Fluxo local

Workspace: C:\Dev\FinFlow\FinFlow.code-workspace.

## Histórico preservado

- main e origin/main: histórico GitHub antigo, e94ab49 (101 commits).
- chore/local-workspace: preparação inicial sobre o GitHub.
- archive/claude-export: exportação imutável recebida, 33af86b (30 commits).
- workspace/local: base atual para desenvolvimento, exportação mais documentação e adaptação do navegador de testes.
- baseline/post-gate-3.4: fb748d5, código e relatório antes do Gate 2.2.
- baseline/post-gate-2.2: 33af86b, exportação recebida.

Os dois históricos não têm ancestral comum. Foram preservados por branches separadas, sem merge artificial, reset ou push. Não usar main como base de um novo gate por enquanto. Uma publicação futura deve definir explicitamente como apresentar o histórico recuperado no GitHub.

## Trabalho sequencial

1. Partir de workspace/local com status limpo e criar gate/<numero> apenas para um escopo solicitado.
2. Registrar especificação em docs/gates/. Claude implementa e executa a suíte.
3. Claude faz commit e entrega hashes inicial/final, alterações e testes; encerra sua edição.
4. Codex revisa diff e código relacionado, testa e registra PASS/FAIL em docs/audits/.
5. Se FAIL, devolver ao Claude; após correção, revisar novamente. Um agente por vez no checkout.
6. Integração/publicação somente no escopo autorizado. Não fazer push automático ou sobrescrever main remoto.

Relatórios originais permanecem na raiz para preservar referências. Novos documentos ficam em docs/. Extensões Claude Code e Codex já instaladas; autenticação, se necessária, é feita pelo usuário no editor.
