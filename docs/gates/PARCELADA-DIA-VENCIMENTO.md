# Patch — dia de vencimento em despesas parceladas em Dinheiro/PIX

Pedido do usuário em 01/10/2026. Branch `fix/parcelada-dia-vencimento`, base
`a475634` (ponta do Gate UX-1, ainda sem auditoria Codex registrada).

## Problema relatado

Boletos parcelados pagos via PIX/boleto (ex.: pós-graduação, 14 parcelas)
não têm suporte adequado: os formulários de criar/editar despesa só exibem e
salvam `diaVencimento` quando "Fixa" está marcada. Ao salvar uma parcelada em
Dinheiro/PIX, o dia vira `null`. Editar uma parcelada cujo dia foi ajustado à
mão no JSON apaga esse dia.

## Premissa do pedido × código atual

O pedido descreve `calcProximosVencimentos()`, com o filtro
`if(!d.fixa || d.cartao!=='dinheiro' || !d.diaVencimento) return;`. Essa
função existia até `a90547f`, mas **foi removida no Gate UX-1 (`b617393`)**.
Desde então, `#dashProximosVencimentos` ("A pagar até DD/MM") lista
exatamente os itens de `getFinancialOutlook(hoje, fim do ciclo)`, ou seja,
`p.events` mais `p.undated` dos tipos fatura, despesa e contribuição. Esse
motor já gera um evento por parcela não paga de despesa em Dinheiro/PIX, via
`getDespesasForMonth`, que respeita período, `ignorarAntes` e `pagoMeses`. O
evento é datado por `diaVencimento`, e as parcelas vencidas aparecem como
"Vencido desde".

## Escopo implementado

1. **Card**: a linha de despesa parcelada (não fixa, 2+ parcelas) mostra
   "Parcela x/N" antes do status. O número vem do mesmo `getDespesasForMonth`
   (`_parcel`/`_total`), sem fórmula nova. O valor da linha já é
   `_valorParcela`. Motor, datas, valores e total permanecem intactos.
2. **Formulários**: o campo "Dia de vencimento" aparece e é salvo para
   despesa em Dinheiro/PIX que seja fixa **ou** parcelada (2+ parcelas).
   Continua `null` para cartão e para despesa à vista. `debitoAutomatico`
   continua restrito a fixa.

## Fora do escopo

Motor de projeção, comportamento de fixas e débito automático, schema,
migração, `state.office` e regras do UX-1 (limite pelo fim do ciclo; itens
sem data entram no total).
