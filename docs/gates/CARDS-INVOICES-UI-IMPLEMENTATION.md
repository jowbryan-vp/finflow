# Implementação — ajuste de interface "Cartões / Faturas"

Escopo: `docs/gates/CARDS-INVOICES-UI.md`. Papel: implementador (Claude Code). Auditoria posterior:
Codex. Sem push, sem merge, sem alterar sincronização, Caixa do Escritório ou regras financeiras.

## Hashes

- Base (HEAD ao iniciar, limpo): `cbb6e55df82f838cdbeb42305ed18bf21e6e0929` (curto: `cbb6e55`)
- Branch: `gate/5-uat-corrections` (mesma branch do escopo)
- Commit final: ver hash no fechamento do handoff

## Arquivos alterados

- `index.html` — nova área "Cartões / Faturas", formulário de Despesas restrito a pagamento direto,
  correção das rotas de navegação.
- `tests/financial-engine/gate5-cards-invoices-ui.test.mjs` — novo, 14 casos permanentes.
- `tests/financial-engine/gate5-parcelamentos-periodo.test.mjs` — um assert ajustado (ver seção
  "Ajuste de teste existente" abaixo); nenhuma regra de período enfraquecida.
- `tests/financial-engine/run-all.mjs` — registro do novo arquivo de teste.
- `docs/gates/CARDS-INVOICES-UI-IMPLEMENTATION.md` — este relatório.

Não tocado: `getDespesasForMonth`, `getCompetenciaFatura`, `calcByCardForMonth`, `isFaturaPaga`,
`toggleFaturaPaga`/`confirmarPagamentoFatura`, `openAjustarFaturaModal`, regras de parcelamento,
`ignorarAntes`, sincronização com Drive, Caixa do Escritório. Nenhum segundo array/cadastro de compras
foi criado — tudo continua em `state.despesas`/`state.cards`/`state.faturasPagas`.

## O que foi feito

### 1. Navegação

Item "Cartões" (antes em Configuração) virou **"Cartões / Faturas"**, movido para a seção Lançamentos,
ao lado de Despesas/Parcelamentos — uma única entrada de navegação, sem duplicidade.

### 2. Nova área "Cartões / Faturas" (`renderFaturaCartoes()`)

Uma seção "Fatura" no topo de `#page-cartoes` (antes do cadastro de cartões e do importador de PDF, que
continuam lá) mostra, para o cartão e o período navegado (reaproveita `currentMonth`/`currentYear`
globais, já existentes):
- Total da fatura (`calcByCardForMonth`), status pago/pendente (`isFaturaPaga`), fechamento/vencimento
  (`card.fecha`/`card.paga`).
- Lista de compras/parcelas que compõem o total (`getDespesasForMonth` filtrado pelo cartão + o mesmo
  `despItemHTML()` já usado em Despesas — mesma renderização, uma função só).
- Botões "Marcar como Paga"/"Desmarcar" (`toggleFaturaPaga`) e "Ajustar Fatura" (`openAjustarFaturaModal`)
  — as mesmas funções de sempre, chamadas do novo lugar.
- Botão **"Nova compra no cartão"** (`openNovaCompraCartao`/`salvarNovaCompraCartao`): modal dedicado,
  restrito a cartão de crédito (nunca "dinheiro"), que grava em `state.despesas` no mesmo formato que
  `addDespesa()` sempre usou. Campos exclusivos de pagamento direto (conta, vencimento, débito
  automático, status pago/previsto) não aparecem aqui porque nunca se aplicam a compra no crédito — a
  mesma regra que já existia em `onCartaoChange()`.
  **Limitação deliberada**: este modal não inclui "despesa compartilhada com pessoas" (split), pra não
  criar uma TERCEIRA implementação da UI de split (já existem duas: o formulário de Despesas e o modal de
  edição). Compras que precisam de split são criadas aqui e depois divididas via "Editar" — que já
  suporta split integralmente.

### 3. Despesas foca pagamento direto

`populateDespForma()` agora só lista cartões com `!isCartaoDeCredito(id)` no select `despCartao` do
formulário de "Adicionar Despesa" — na prática, só "Dinheiro/PIX" (não existe cartão de débito separado
no modelo; PIX/dinheiro/débito são todos representados por esse cartão especial, como já era antes). A
listagem de despesas do mês (`renderDespesas`/`renderDespesasAgrupadas`/`renderDespesasDetalhadas`)
**continua mostrando compras no crédito junto com pagamento direto**, sem esconder nada — só o cadastro
de compra NOVA no crédito saiu de lá. O modal de **edição** (`openEditDespesa`) continua mostrando todos
os cartões, porque precisa continuar editando despesas antigas de qualquer tipo, de qualquer origem.

### 4. Navegação corrigida (a compra no crédito não cai mais em Despesas)

- `navigateToDespesasCartao(cartaoId)`: cartão de crédito agora leva a `cartoes` com o cartão certo já
  selecionado; "Dinheiro/PIX" continua indo a `despesas`, como sempre.
- Nova função `abrirEdicaoDespesaNaAreaCerta(id)`: decide a área (Cartões/Faturas vs. Despesas) olhando
  `d.cartao`, e só então chama `openEditDespesa(id)` — usada pelo botão de editar da busca de lançamentos,
  pelo item de despesa compartilhado (`despItemHTML`, usado tanto em Despesas quanto na nova Fatura) e por
  Parcelamentos. Evita navegar de novo quando já está na página certa.
- Busca de lançamento (`abrirPesquisaLancamentos`): o botão de editar de uma despesa agora usa
  `abrirEdicaoDespesaNaAreaCerta`.
- `eseConverterParaReal()` (simulador "E se..."): quando **todos** os itens convertidos são no crédito,
  navega para `cartoes` com o cartão certo; caso contrário (algum item em dinheiro, ou lote misto)
  continua indo para `despesas`, que já mostra os dois tipos juntos.
- Importação de PDF (`confirmarLancamentosFatura`): ao terminar, se a página ativa for `cartoes`, atualiza
  a fatura já com o cartão importado selecionado (antes só atualizava `despesas`, se fosse a página ativa).
- `toggleFaturaPaga`, `confirmarPagamentoFatura`, `confirmarAjusteFatura`, `removerAjusteFatura`,
  `saveEditDespesa`, `delDespesa`: passaram a também re-renderizar `cartoes` quando essa for a página
  ativa (antes só reagiam a `despesas`), pra fatura/lista ficarem em sincronia com a ação feita.
- Parcelamentos (`renderParcelamentos`): botão de editar também usa `abrirEdicaoDespesaNaAreaCerta` — a
  rota antiga continua funcionando para parcelamentos em dinheiro; parcelamentos no crédito agora abrem a
  edição em Cartões / Faturas.

### O que não precisou mudar

- `renderDespesasAgrupadas` (accordion por cartão dentro de Despesas) continua existindo e funcionando —
  é uma visão consolidada que já mostrava cartão e dinheiro juntos, sem omitir nada; a spec só pede pra
  não deixar a criação/edição de compra no crédito presa a Despesas, não pra remover essa visão.
  `navigateDespesasFiltro('todas'/'pagas')` (tiles do Dashboard) continuam indo para Despesas de propósito
  — são totais que já misturam cartão e dinheiro, e a lista de destino não omite nada.
- `renderResumoPagar` é código morto (nunca chamado — confirmado por grep, comentário no próprio
  `renderDashboard` diz "Replaced by one consistent planning summary"); não foi tocado, mas já herda a
  correção de `navigateToDespesasCartao` automaticamente se um dia for reativado.

## Ajuste de teste existente

`tests/financial-engine/gate5-parcelamentos-periodo.test.mjs` tinha um helper `visivel()` que verificava
a presença literal de `openEditDespesa('${id}')` no HTML renderizado por Parcelamentos, pra confirmar que
um item aparecia na lista. Como o botão de editar de Parcelamentos passou a chamar
`abrirEdicaoDespesaNaAreaCerta('${id}')` (que decide a área e só então chama `openEditDespesa`), o helper
foi atualizado para checar essa nova string. **Nenhuma asserção de período foi enfraquecida ou removida**
— é a mesma regra de "primeira parcela visível, mês anterior oculto, mês seguinte ao fim oculto, virada de
ano, fallback legado, dinheiro sem rolagem" de sempre; só o alvo do clique de editar mudou, de propósito,
como parte deste escopo. Confirmado rodando a suíte antes e depois: só esse arquivo regrediu com a
mudança de `despItemHTML`, e o ajuste resolveu sem tocar em nenhuma outra asserção.

## Testes novos (`gate5-cards-invoices-ui.test.mjs`, 14 casos)

Cobrem todos os critérios de aceitação do escopo: fechamento antes/depois, virada de ano, parcela em
faturas mensais consecutivas, compra direta permanece em Despesas (com o dropdown restrito), registro +
edição + exclusão de compra no crédito inteiramente pela nova área, pagar/desmarcar fatura altera o caixa
uma única vez (`calcSaldoConta` antes/depois), categoria/relatório (`byCat`/`calcByCardForMonth`) continuam
contando a despesa, busca de lançamento leva à área certa com o cartão certo selecionado e o modal aberto,
link de fatura do Dashboard distingue cartão de crédito (→ Cartões/Faturas) de Dinheiro/PIX (→ Despesas),
importação de PDF aponta ao cartão certo (respeitando o modo legado de competência "mês da compra + 1",
já que a importação não grava `dataCompra` — comportamento herdado, não alterado), troca de perfil não
mistura faturas entre perfis (dois perfis reais via `switchPerfil`, não só dois `loadState`), layout sem
transbordo em 390px, e ausência de erros de console ao longo de todo o fluxo.

## Testes executados

```
cd tests/financial-engine
npm test
```

Resultado real desta sessão (Node v24.20.0, Windows, Chromium gerenciado): **415 PASS / 0 FAIL**
(392 históricos + 9 do ajuste de caixa anterior já presentes na branch + 14 novos deste escopo).

## Limitações

- O modal "Nova compra no cartão" não suporta despesa compartilhada (split) — ver limitação deliberada na
  seção 2. Split continua disponível via "Editar" depois de criar a compra.
- Não foi feita validação manual em navegador além do que a suíte Playwright cobre (inclusive o teste de
  layout móvel em 390px); não há captura de tela adicional.
- Não usei backup real, credenciais ou sincronização com Drive.
- `renderResumoPagar` (código morto) não foi exercitado nem alterado — permanece fora de uso.
- A regra "mês da compra + 1" para itens importados via PDF (sem `dataCompra`) é comportamento herdado,
  não alterado por este ajuste — documentado no teste `CARD_UI_11` para não ser confundido com um bug novo.

## Estado final

Sem push, sem merge, sem Gate 5 além deste escopo autorizado. Encerrando edições e aguardando auditoria
do Codex.
