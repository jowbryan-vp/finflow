# Auditoria Gate 2.2

Base examinada: fb748d5..33af86b, checkout local inicial 49fb56d. Revisão do diff e callers de caixa, competência, ciclo, edição, saldos e contribuição. Auditoria por Codex; correções e revisão das próprias correções realizadas sequencialmente.

## Resultado inicial: FAIL

1. O helper de recebimentos recorrentes aceitava qualquer valor não vazio como data. Setembro/31 entrava no caixa; uma data numérica derrubava a visão mensal com TypeError. Reprodução nos três testes AUDIT_INVALID_RECURRING.
2. Evento único recebido sem data real era excluído da nova visão mensal, mas somado no banco; saldo histórico usava indevidamente dataPrevista. AUDIT_SINGLE_RECEIVED_WITHOUT_DATE reproduziu a divergência introduzida entre visões. Esta evidência justifica o ajuste restrito em calcSaldoConta/calcSaldoContaAte.
3. A edição permitia transicionar para recebido sem data. Bloqueada antes de qualquer mutação; teste específico de estado intacto.

## Correções

Validação de calendário no helper recorrente; evento único exige data real válida nos saldos. Nenhum registro legado migrado ou excluído, nenhuma data sintetizada. Edição exige data real. Asserções antigas preservadas, cinco regressões adicionadas.

## Ciclo e decisão de produto

O adapter misturava salários e usava a primeira regra de previsão. Usuário determinou nesta tarefa que um salário principal deve definir o ciclo. A seleção explícita e integração serão tratadas no Gate 4.1 antes da exposição do ciclo no novo painel; não adotar seleção automática arbitrária com múltiplos salários.

## Limites

Comparação com backup real não executada; não alegar zero diferenças no backup com base nesta revisão. Contribuição continua seguindo a política existente (base prevista), sem redefinição. Gate 4 não faz parte deste diff de correção.

## Resultado após correção: PASS no escopo temporal auditado
267/267 testes aprovados, incluindo os cinco casos novos. A política de salário principal já foi decidida pelo usuário e sua implementação integra o Gate 4.1.
