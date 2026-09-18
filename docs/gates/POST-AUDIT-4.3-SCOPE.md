# Patch pós-auditoria independente — preparação para teste do usuário

Origem: relatório independente 2f89004, aceito pelo coordenador nesta tarefa. Implementação exclusiva Claude Code; auditoria posterior Codex. Sem Gate 5.

## Escopo

1. Em getVariableExpenseEstimate, um mês contendo somente despesas fixas/parceladas não comprova histórico de variáveis. Exigir ao menos um lançamento variável elegível em cada um dos três meses para fornecer estimativa. Não preencher zeros silenciosamente por falta de histórico. Manter média simples/ponderada e reconciliação quando o histórico for suficiente. Se não houver variáveis, retornar insufficient_history e deixar o aviso existente visível.
2. Adicionar testes específicos: mês somente fixas; mês somente parcelas; mistura fixas/parcelas sem variáveis. Demonstrar pelo menos um teste falhando antes da correção. Preservar demais asserções.
3. Adicionar testes do ciclo com salário principal e secundário, verificando startDate, endDate e endSource. O secundário não pode antecipar fim real nem previsto do ciclo principal. Testar próximo recebimento real do principal e fallback previsto.
4. Ajustar texto da especificação 4.2 para declarar inequivocamente a regra de suficiência de histórico variável.

## Execução e entrega

Partir de 2f89004, status limpo, criar branch fix/post-audit-4.3. Não editar regras de projeção fora dos achados, dados reais, Office, sincronização, histórico ou tags. Não publicar nem iniciar Gate 5. Rodar a suíte completa e registrar resultados reais.

Criar docs/gates/POST-AUDIT-4.3-IMPLEMENTATION.md com hashes inicial/final, arquivos, reprodução antes/depois, testes e limitações. Commitar somente mudanças próprias revisadas e entregar ao Codex. Depois encerrar edições e aguardar auditoria.
