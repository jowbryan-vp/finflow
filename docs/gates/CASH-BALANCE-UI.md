# Ajuste de caixa — contas bancárias como fonte do saldo

Autorização: pedido do usuário após o handoff da Prefeitura, 19/09/2026. Base: `gate/5-uat-corrections` em `f542067`, mais esta especificação e a auditoria do Drive. Implementação: Claude Code. Auditoria posterior: Codex. Ajuste de cartões/faturas será etapa separada, somente depois de PASS deste ajuste.

## Problema e comportamento esperado

Com pelo menos uma conta pessoal cadastrada, `getTotalsForMonth()` já usa `calcSaldoConta()` no mês real atual e `calcSaldoContaAte()` no passado. `state.excedentes` não é a fonte do saldo nessa situação. Mesmo assim o Dashboard oferece “Guardar em Caixa”, mostra o total manual e promete que aparecerá nos meses seguintes. O usuário pode acreditar que precisa registrar de novo dinheiro que já está nas contas.

Quando houver contas, substituir esse bloco por **“Saldo que permanece nas contas”**, apenas informativo, calculado a partir da mesma fonte que alimenta o saldo real. Na visualização de mês passado usar o corte histórico existente; em mês futuro, rotular explicitamente como projeção, sem chamar de saldo real. O valor informativo não cria lançamento, receita, transferência, reserva, despesa ou `excedente` e não soma de novo no disponível ou nos cenários. O botão “Guardar” não aparece; chamadas programáticas ao modal/confirmador legado também não podem gravar `state.excedentes` enquanto houver contas.

Registros históricos de `state.excedentes` devem permanecer íntegros no estado e no backup. Não migrar, apagar nem somar esses registros aos saldos das contas. Quando não houver contas, conservar o mecanismo anterior e o rótulo/ação legados. Mudança de perfil deve reavaliar se há contas. Não alterar motor de saldos, regras de projeção, contribuição, cofrinho, PJ ou sincronização.

## Aceitação

- Com contas: cálculo e rótulo coerentes para mês atual, passado e futuro; nenhum botão de guardar, nenhum efeito de `excedentes` nos totais, inclusive valores históricos já importados.
- Sem contas: cadastro/remoção de excedente e seu reflexo no mês seguinte continuam funcionando.
- Tentar abrir ou confirmar o modal antigo com contas não altera `state.excedentes` nem chama `scheduleSave()`.
- Mudar entre perfis com/sem contas ajusta a interface sem vazar saldo entre perfis.
- Testes sintéticos permanentes para esses casos, suíte completa e relatório de implementação com hashes e limitações. Não usar backup real. Não iniciar Cartões/Faturas antes do PASS do Codex.
