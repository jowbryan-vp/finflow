# Gate 4.1 — projeção cronológica

Autorização: usuário solicitou execução sequencial autônoma com auditoria após cada gate. Decisão explícita: salário principal escolhido define ciclo.

## Contrato

Criar motor derivado de leitura, sem movimentar dinheiro. Disponível = soma das contas pessoais registradas (reservas e PJ excluídos). Comprometido = disponível menos obrigações não pagas no horizonte. Projetado = comprometido mais receitas contratadas/recorrentes pendentes; potenciais ficam separados. Gate 4.2 acrescentará estimativa variável.

Ordenar eventos por data e agrupar o mesmo dia antes de calcular risco; não presumir ordem intradiária. Dívidas atrasadas são apresentadas como atrasadas na referência, preservando data original. Faturas são a única saída das compras no crédito; não contar compras e pagamento da fatura duas vezes. Transferências internas e reservas não viram receita/despesa.

Materializar despesas/faturas com helpers existentes. Respeitar recebido/pago, parcelas, ignorarAntes, ajustes de fatura e início da recorrência. Recebimentos sem conta pessoal válida ficam como pendência de cadastro, sem aumentar projeção. Repasse PJ previsto só entra via receita pessoal já criada; nunca somar caixa PJ.

Dados mensais sem dia conhecido ficam numa lista de pendências sem data inventada; obrigações assim identificadas reduzem o saldo final conservadoramente, mas não recebem uma posição falsa na linha do tempo. Valores/ausência de data/cadastro impedem classificar a projeção como completa. Limitar horizonte a 12 meses; pesquisa de atrasados até 240 meses, com aviso quando limitada.

O saldo inicial é o saldo registrado atual, não uma reconstrução diária histórica. O painel deverá explicar esse limite. Ciclo: um único salário pode ser usado por ser inequívoco; vários exigem escolha explícita persistida por perfil, sem escolher o primeiro. Opção inválida/deletada exige nova escolha. Filtrar tanto recebimentos quanto previsão pelo salário principal e respeitar início da recorrência.

## Fora de escopo

Não alterar cálculos de competência de faturas, políticas do escritório, percentuais de contribuição, importar dados reais ou reescrever o motor legado do simulador. Integração visual no Gate 4.3; estimativas no 4.2.

## Aceitação

Testes de pureza, principal com múltiplos salários, antecipação/atraso e virada de mês, fatura sem duplicação, realizado não projetado novamente, potenciais separados, atrasados, dados sem data, limites de horizonte e isolamento PJ/reservas. Suíte histórica obrigatória sem regressões.
