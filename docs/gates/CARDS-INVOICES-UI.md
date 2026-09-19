# Ajuste de interface — Cartões / Faturas

Autorização: usuário solicitou seguir com os ajustes de caixa e cartões/faturas. O ajuste de caixa foi entregue por Claude em `248a2ba` e aprovado por Codex em `docs/audits/CASH-BALANCE-UI-REVIEW.md`. Este é um ajuste de organização da experiência pessoal, **sem mudar as regras financeiras**. Claude implementa; Codex audita antes de qualquer próximo escopo. Branch `gate/5-uat-corrections`, a partir do commit que adiciona este documento. Sem push/merge.

## Resultado de uso

Uma área **“Cartões / Faturas”** deve concentrar o fluxo de cartão de crédito: registrar e editar compras, acompanhar parcelas, ver fatura por cartão/mês, fechamento e vencimento, conferir detalhes/ajustes, marcar fatura como paga ou desmarcar, cadastrar/configurar cartões e importar PDF. A tela **“Despesas”** deve focar pagamentos diretos (PIX, dinheiro e débito). As compras no crédito continuam sendo despesas nos relatórios, categorias, busca e projeção; a fatura paga é movimento de caixa, não uma segunda despesa. Os nomes e o fluxo devem ser claros para quem usa o sistema, em desktop e celular.

## Fonte única e compatibilidade

Reutilizar `state.despesas`, `state.cards`, `state.faturasPagas` e os cálculos atuais (`getDespesasForMonth`, `getCompetenciaFatura`, pagamento de fatura e saldos). Não criar um segundo cadastro de compras, copiar lançamentos, migrar ou reclassificar histórico, nem mudar regras de competência, parcelamento, vencimento, ajuste de fatura, pagamento ou Drive. Lançamentos legados sem data de compra preservam o fallback existente. PIX/dinheiro/débito continuam debitando a conta pela regra atual; compras no crédito só afetam a conta pelo pagamento da fatura, uma vez.

## Integração da interface

- O item de navegação atual “Cartões”, hoje em Configuração, pode virar “Cartões / Faturas” em Lançamentos; manter gestão de cartões e importação de PDF acessíveis nessa mesma área. Evitar duas entradas de navegação para a mesma operação.
- O registro de compra no crédito e sua edição devem ter um caminho claro na nova área. Despesas exibe e cadastra pagamentos diretos; formulários compartilhados podem ser reutilizados, sem IDs HTML duplicados, sem duas fontes de verdade e sem quebrar edição/importação de lançamentos antigos.
- A visão de fatura deve permitir escolher mês/cartão, mostrar total, status, fechamento/vencimento e compras/parcelas que compõem o total, usando os cálculos existentes. Deve ser possível pagar/desmarcar pelo fluxo atual com escolha de conta quando aplicável. Parcelamentos de cartão ficam visíveis aqui; a antiga rota de Parcelamentos pode permanecer como acesso compatível, mas não deve deixar de funcionar para outros parcelamentos.
- Cards e ações do Dashboard, próximos vencimentos, pesquisa de lançamentos, importação PDF, simulação “E se...” e ações de editar/excluir devem levar à área correta. Um total que inclui cartão não pode abrir uma lista que omite cartão sem explicar ou oferecer acesso aos detalhes. Preservar links úteis do Dashboard para a fatura específica.
- Relatórios, categorias, repasses e totais continuam considerando as compras no crédito como antes. O pagamento da fatura não vira gasto adicional. Não tocar Caixa do Escritório.

## Critérios de aceitação

Testes sintéticos permanentes devem verificar: compra crédito antes/depois do fechamento e virada de ano; parcela em faturas mensais; compra direta permanece em Despesas; registro/edição/exclusão de compra crédito pela nova área; pagar/desmarcar fatura altera o caixa apenas uma vez; relatório/categoria ainda contém a despesa; busca e links do Dashboard alcançam a compra/fatura; importação PDF continua apontando ao cartão; troca de perfil não mistura faturas; navegação e componentes cabem em tela móvel. Rodar suíte completa, registrar limites e hashes em relatório de implementação, fazer commits explícitos e parar para auditoria Codex. Não usar backups reais como fixtures.
