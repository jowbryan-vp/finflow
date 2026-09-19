# Auditoria Codex — saldo que permanece nas contas

Base `919f198`, entrega Claude Code `248a2ba`, branch `gate/5-uat-corrections`. Resultado: **PASS**.

O Codex revisou o diff completo e os caminhos relacionados de `getTotalsForMonth`, `renderDashboard`, `openExcedenteCaixa`, `confirmarExcedente`, `limparExcedente` e `switchPerfil`. Com contas, o novo bloco apenas mostra `emCaixaDisponivel` já calculado pelo motor existente; não faz soma adicional nem grava em `state.excedentes`. O mês futuro é identificado como projeção. As três funções legadas retornam antes de abrir modal, mutar estado ou agendar salvamento. Sem contas, o ramo anterior permanece.

Os nove testes novos cobrem os dois modos, mês passado/atual/futuro, preservação de excedentes no backup e troca de perfil. O Codex executou a suíte completa após a entrega: **401 PASS / 0 FAIL**. `git diff --check 919f198..248a2ba` sem erros. Somente os quatro arquivos declarados pelo Claude foram alterados; `calcSaldoConta`, `calcSaldoContaAte` e `getTotalsForMonth` permaneceram intactos.

Limite: os testes usam estado sintético e navegador de testes. Não houve validação visual com os dados reais do usuário nem teste de Drive autenticado neste ajuste. A observação do usuário sobre sincronização manual consta da auditoria do Drive e segue como hipótese a verificar na versão corrigida.

Decisão: liberar a base para especificar e implementar Cartões/Faturas em etapa separada. Sem push ou merge nesta auditoria.
