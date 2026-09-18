# Gate 4.2 — variáveis sem dupla contagem

Motor derivado por categoria, com os três meses completos imediatamente anteriores à referência. Média ponderada 1/2/3 (mais recente pesa 3) ou simples, configurável; preferência solicitada ao usuário, implementação suporta ambas.

Usar a mesma competência de despesas materializada pelo motor existente, inclusive crédito. Excluir fixas e parceladas. Mês sem lançamento não comprova gasto zero: se qualquer um dos três meses não tiver **pelo menos um lançamento variável elegível** (não fixo, não parcelado — a mesma exclusão usada no cálculo), sinalizar histórico insuficiente e não inventar estimativa. Um mês que só contém despesas fixas e/ou parceladas não conta como histórico de variáveis, mesmo que a lista de lançamentos do mês não esteja vazia; nesse caso a estimativa fica indisponível (`insufficient_history`), nunca zero.

Para cada mês e categoria: restante = max(0, média histórica - total já lançado no mês, pago ou pendente). Compras já lançadas no cartão também reduzem a estimativa, pois sua fatura já entra no Gate 4.1. Estimativa nunca movimenta conta ou vira obrigação confirmada.

Horizonte parcial: distribuir o restante proporcionalmente aos dias do horizonte entre a referência e fim do mês. Essa hipótese deve ser visível na interface e no retorno; não inventar dia de pagamento ou cartão para gastos ainda desconhecidos. Estimativa é margem de planejamento, separada da linha do tempo de lançamentos conhecidos.

Aceitação: pesos e média simples, reconciliação abaixo/acima da média por categoria, exclusão de fixas/parceladas, ausência de histórico, horizonte parcial, não mutação, integração com saldo projetado e suíte histórica.
