# Gate 4.3 — painel de planejamento

Substituir os três indicadores antigos do topo do Dashboard pelo planejamento derivado dos Gates 4.1/4.2: disponível registrado, saldo após obrigações, saldo projetado com estimativa e potenciais separados. Exibir decomposição e limite temporal; nunca rotular projeção futura como dinheiro em caixa.

Permitir escolher salário principal por perfil e método de média, persistindo pelo mecanismo existente; ciclo considera apenas o principal. Horizonte padrão é o fim do ciclo quando conhecido, senão fim do mês atual. Permitir data final explícita até 12 meses. Navegação mensal controla relatórios abaixo, não transforma disponível de hoje em projeção.

Linha do tempo lista lançamentos conhecidos, risco de saldo negativo, dívidas atrasadas e datas originais. Pendências sem data e inconsistências ficam visíveis; avisar que elas e estimativas não têm posição diária conhecida. Sem afirmação de suficiência quando os dados estão incompletos. Reservas e PJ excluídos do disponível, sem resgate automático.

Substituir a apresentação antiga de projeção/média no Dashboard para não apresentar duas previsões contraditórias; conservar funções antigas usadas pelo simulador mensal, deixando explícito que essa tela é uma simulação mensal separada.

Aceitação: testes de DOM, escolha persistida e recarga/importação, ciclo por principal, troca de método, data inválida não salva, navegação futura conserva disponível real, entradas potenciais separadas, aviso de histórico insuficiente, tela estreita sem transbordamento no painel e suíte completa.
