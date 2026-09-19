# Correção dos 4 achados da auditoria Codex — Cartões / Faturas

Escopo: os 4 achados reproduzidos em `docs/audits/CARDS-INVOICES-UI-REVIEW.md` (auditoria Codex sobre a
implementação `d87a925`, base `cbb6e55`). Papel: implementador (Claude Code). Auditoria posterior: Codex.
Sem push, sem merge, sem Caixa do Escritório, sem dados reais.

## Hashes

- Base (HEAD ao iniciar, limpo): `2e405314e95141030698b455be3066f61681dfbe` (curto: `2e40531`)
- Branch: `gate/5-uat-corrections`
- Commit final: ver hash no fechamento do handoff

## Arquivos alterados

- `index.html` — os 4 achados corrigidos (detalhe por achado abaixo).
- `tests/financial-engine/gate5-cards-invoices-audit-fixes.test.mjs` — novo, 14 casos permanentes.
- `tests/financial-engine/run-all.mjs` — registro do novo arquivo de teste.
- `docs/gates/CARDS-INVOICES-UI-AUDIT-FIXES.md` — este relatório.

Não tocado: Caixa do Escritório, sincronização com Drive, motor de saldos/projeção, regras de competência
de fatura (`getCompetenciaFatura`), parcelamento, `ignorarAntes`. Nenhum backup real foi usado.

## Achado 1 — separação incompleta das áreas

### Reprodução (antes da correção)

`tests/financial-engine/gate5-cards-invoices-audit-fixes.test.mjs`, caso `AUDIT1_DESPESAS_NO_ITEM_NO_PAY_BUTTON`,
rodado contra o `index.html` de `2e40531` (antes de qualquer alteração desta entrega): com uma compra no
cartão `nu` na fatura de setembro, `navigate('despesas')` ainda renderizava a compra em `#despesasList`
**e** um botão "Pagar fatura" — `htmlIncludesCredit=true`, `htmlIncludesPayInvoice=true`, exatamente como
a auditoria descreveu.

### Correção

- `renderDespesasAgrupadas` (view padrão de Despesas, sem filtro): grupos de cartão de crédito não viram
  mais um accordion com os itens e os botões "Pagar fatura"/"Ajustar Fatura" — viram uma linha de resumo
  (nome do cartão, status pago/pendente, **total continua visível**, nota "gerenciado em Cartões /
  Faturas") com um botão "Ver fatura →" que chama `navigateToDespesasCartao(cardId)` (mesma função já
  corrigida na entrega anterior, leva a Cartões / Faturas com o cartão certo selecionado). Pagamento direto
  (Dinheiro/PIX) continua exatamente como antes — accordion completo, item a item, editar/excluir/pago.
- `renderDespesasDetalhadas` (filtros de status "pagas"/"pendentes", que misturam cartão e dinheiro):
  itens de cartão de crédito não aparecem mais como linha individual com editar/excluir — são agrupados
  num resumo por cartão (mesmo padrão acima), enquanto itens de pagamento direto continuam item a item.
- Nada foi escondido: o total por cartão continua exatamente o mesmo (`calcByCardForMonth`), só a forma de
  apresentação mudou — de "item a item com ações duplicadas" para "resumo com link pra onde as ações
  realmente vivem agora".
- Dashboard, busca, "E se..." e Parcelamentos não precisaram de mudança adicional — já haviam sido
  corrigidos na entrega anterior (`d87a925`) para levar a Cartões / Faturas quando aplicável; confirmado
  que continuam funcionando (`AUDIT1_DASHBOARD_LINK_STILL_REACHES_CARTOES`).

## Achado 2 — combinação inválida de recorrência e parcelas

### Reprodução

`AUDIT2_FIXA_AND_INSTALLMENTS_REJECTED`: marcar `fixa=true` e `parcelas=3` no formulário antigo (antes da
correção) e chamar `salvarNovaCompraCartao()` gravava a despesa com `fixa=true,parcelas=3` —
`getDespesasForMonth` só estende uma despesa fixa quando `parcelas===1`, então o lançamento aparecia em 3
meses e depois sumia, contrariando o rótulo de recorrência.

### Correção

- `nOnFixaChange()` (novo, ligado ao `onchange` do checkbox `nDespFixa`): força `parcelas=1` e desabilita o
  campo quando fixa é marcada — mesma UX do formulário legado de Despesas (`onDespFixaChange`).
- `salvarNovaCompraCartao()`: validação explícita `if(fixa&&parcelas>1)` antes de qualquer mutação, mesmo
  que a função seja chamada diretamente contornando o `onchange` da UI (testado propositalmente assim em
  `AUDIT2_FIXA_AND_INSTALLMENTS_REJECTED`, que desmarca o handler e ainda assim confirma bloqueio).
- Caso válido preservado: despesa fixa no cartão com 1 parcela (ex: assinatura) continua sendo aceita
  normalmente (`AUDIT2_FIXED_CARD_PURCHASE_STILL_ALLOWED`).

## Achado 3 — data apagada muda a fatura sem aviso

### Reprodução

`AUDIT3_MISSING_DATE_REJECTED_NO_MUTATION`/`AUDIT3_VALID_DATE_ACCEPTED`: antes da correção, apagar
"Data da compra" e salvar gravava `dataCompra=null` com `mesInicio` = mês atual — `getCompetenciaFatura`
caía no fallback legado "mês + 1" e a compra aparecia na fatura de outubro sem nenhum aviso.

### Correção

`salvarNovaCompraCartao()` agora exige `isValidISODateString(dataCompraRaw)` antes de gravar qualquer
coisa — data vazia ou inválida (ex: `2026-02-31`) é rejeitada com toast, **sem mutação e sem fechar o
modal**, dando ao usuário a chance de corrigir. O fallback legado (`getCompetenciaFatura` sem
`dataCompra`) continua existindo e funcionando normalmente para registros antigos e para a importação de
PDF (que não foi alterada, `confirmarLancamentosFatura` continua com seu próprio comportamento
documentado na entrega anterior) — só o cadastro NOVO pela área Cartões / Faturas passou a exigir data.

## Achado 4 — fatura vazia pode ser paga

### Reprodução

`AUDIT4_EMPTY_INVOICE_CANNOT_BE_PAID`/`AUDIT4_ADDING_CHARGE_AFTER_BLOCKED_PAY_NEVER_DEBITS`: antes da
correção, uma fatura sem nenhuma compra (total R$0) exibia "Marcar como Paga"; marcá-la deixava
`isFaturaPaga=true`, e uma compra de R$200 lançada depois no mesmo mês/cartão reduzia o saldo da conta de
1000 para 800 sozinha, sem um novo ato de pagamento — porque `byCard` é recalculado a cada render, nunca
congelado no momento do pagamento.

### Correção

- `openPagarFaturaModal(cardId,...)`: bloqueia e mostra toast quando `valor<=0`, sem abrir o modal — ponto
  único de entrada para TODO botão "Marcar como Paga" do app (Dashboard, Despesas — antes desta entrega — e
  a nova área), então a correção se propaga sozinha.
- `confirmarPagamentoFatura(cardId,...)`: guard de defesa equivalente, para o caso (improvável pela UI, mas
  possível programaticamente) de ser chamada sem passar pelo modal.
- `renderFaturaCartoes()`: quando o total é zero e a fatura ainda não está paga, o botão "Marcar como Paga"
  não aparece (mostra "Sem valor a pagar"); "Ajustar Fatura" continua disponível (é o caminho pra corrigir
  um total que o app ainda não calculou, antes de decidir pagar).
- **Preservado**: um estado legado (fatura vazia já marcada como paga antes desta correção, por exemplo
  vinda de um backup antigo) continua podendo ser **desmarcada** normalmente — `toggleFaturaPaga` já
  desmarca sem passar pelo guard de valor, e isso não foi alterado (`AUDIT4_UNMARK_LEGACY_PAID_EMPTY_STILL_WORKS`).

### Limite investigado, registrado e não expandido (conforme instrução)

A auditoria pediu para investigar "se alguma outra ação da nova tela altera uma fatura já marcada paga sem
confirmação". Verificado: nenhuma ação nova faz isso — "Ajustar Fatura" some quando a fatura já está paga
(só aparece quando pendente, em ambas as telas), e "Desmarcar" é a única ação sobre uma fatura já paga,
comportamento anterior a este gate, não introduzido agora.

Existe, porém, um limite mais amplo que **não foi corrigido**, por estar fora do escopo dos 4 achados e
para não expandir o motor financeiro: se uma fatura **não vazia** já estiver marcada como paga e o usuário
lançar uma NOVA compra nesse mesmo mês/cartão (pela área Cartões / Faturas, por importação de PDF, ou
editando uma despesa existente para aquele mês/cartão), o total "pago" cresce silenciosamente da mesma
forma que o achado 4 descrevia para fatura vazia — porque `state.despesas` e `state.faturasPagas` são
independentes, e nenhuma trava impede editar despesas de um mês cuja fatura já foi paga. Corrigir isso de
forma completa exigiria travar edição/criação de despesas contra faturas já pagas (ou re-tornar o
pagamento numa transação com valor congelado), o que é uma mudança de regra financeira maior do que os 4
achados autorizados nesta entrega — registrado aqui como limite, não implementado.

## Testes novos (`gate5-cards-invoices-audit-fixes.test.mjs`, 14 casos)

Executado ANTES da correção (via `git stash` do `index.html`, restaurado com `git stash pop` depois):
**10 de 14 falharam**, reproduzindo os 4 achados exatamente como descritos na auditoria (os 4 que já
passavam eram os controles negativos — desmarcar legado, ajustar fatura vazia, link do Dashboard, sem
erros de console). Depois da correção: **14/14 PASS**.

## Testes executados (suíte completa)

```
cd tests/financial-engine
npm test
```

Resultado real desta sessão (Node v24.20.0, Windows, Chromium gerenciado): **429 PASS / 0 FAIL**
(415 pré-existentes, intactos e sem nenhuma asserção enfraquecida, + 14 novos deste escopo).

## Limitações

- Ver "Limite investigado, registrado e não expandido" acima — fatura já paga (não vazia) ainda pode ter
  seu total crescido por uma edição/criação posterior de despesa, sem novo ato de pagamento. Fora do
  escopo dos 4 achados autorizados.
- Não usei backup real, credenciais ou sincronização com Drive.
- Não fiz validação manual em navegador além do que a suíte Playwright cobre.
- Não toquei no Caixa do Escritório nem em nenhuma regra de competência/parcelamento/vencimento.

## Estado final

Sem push, sem merge, sem novo gate. Encerrando edições e aguardando nova auditoria do Codex.
