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

1. Partir da última branch aprovada com status limpo (atualmente gate/4.3); não voltar à versão antiga workspace/local para novos gates. Criar gate/<numero> apenas para escopo solicitado.
2. Registrar especificação em docs/gates/. Claude implementa e executa a suíte.
3. Claude faz commit e entrega hashes inicial/final, alterações e testes; encerra sua edição.
4. Codex revisa diff e código relacionado, testa e registra PASS/FAIL em docs/audits/.
5. Se FAIL, devolver ao Claude; após correção, revisar novamente. Um agente por vez no checkout.
6. Integração/publicação somente no escopo autorizado. Não fazer push automático ou sobrescrever main remoto.

Relatórios originais permanecem na raiz para preservar referências. Novos documentos ficam em docs/. Extensões Claude Code e Codex já instaladas; autenticação, se necessária, é feita pelo usuário no editor.

## Fluxo original restaurado por solicitação do usuário

Claude Code implementa → commit e handoff → Codex audita → PASS ou devolução ao Claude. Os papéis estão definidos em AGENTS.md e CLAUDE.md. A autorização anterior para execução pelo Codex não deve ser usada como exceção a essa instrução mais recente.

O Claude Code local está instalado e autenticado. Executável verificado: C:\Users\jowbr\.local\bin\claude.exe. Pode ser acionado no terminal do VS Code ou pelo coordenador no mesmo repositório. Uma execução via terminal/processo não implica que a conversa apareça automaticamente no painel da extensão. Não prometer digitação ou acompanhamento visual no painel quando a execução ocorrer em segundo plano.

Para execução coordenada: fornecer o escopo em arquivo, verificar checkout limpo e branch, executar Claude com permissões específicas ao escopo (sem bypass global), guardar identificação da sessão e resultado, aguardar término antes de auditar e conferir o diff real. Se faltar permissão/autenticação/cota, solicitar intervenção em vez de Codex implementar.

A automação anterior permanece pausada. Sua reativação deve obedecer a estes papéis e não iniciar Gate 5 sem escopo novo.

Histórico: Gates 4.1–4.3 foram implementados e autorrevisados pelo Codex. Isso continua registrado; não existe auditoria independente retroativa desses commits.
