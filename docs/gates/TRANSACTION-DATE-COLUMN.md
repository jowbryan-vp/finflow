# Coluna de data nas listas de transações

Solicitação do usuário em 19/10/2026: mostrar, na primeira coluna de todas as
listas de transações, a data da transação (compra, pagamento, recebimento).
Lançamentos antigos sem data registrada ficam com o campo vazio; a data aparece
a partir de quando foi informada.

Branch `feat/transaction-date-column`, base `main` 784725f.

## Regra (somente exibição)

Nenhuma data é inventada nem gravada. Nenhum cálculo, total, competência,
ordenação ou persistência muda.

Despesa pessoal (`getDataExibicaoDespesa(d, mes, ano)`):
- não fixa com `dataCompra` válida: `dataCompra` (todas as parcelas mostram o
  dia da compra);
- não fixa sem `dataCompra`, com `diaVencimento` e mês conhecido: vencimento
  daquele mês (parcelada em Dinheiro/PIX);
- fixa com `diaVencimento` e mês conhecido: vencimento daquele mês;
- fixa sem `diaVencimento`: `dataCompra` apenas no mês de início;
- caso contrário: vazio.

Receita pessoal (`getDataExibicaoReceita(r)`):
- novo modelo, evento único: `dataRecebimento` se recebida, senão
  `dataPrevista`;
- novo modelo, recorrente (ocorrência do mês): data real de recebimento da
  ocorrência, senão a data prevista da ocorrência;
- legado, parcela de projeto extra ou registro bruto recorrente: vazio.

Escritório: data já gravada no registro (`data`, `dataRecebimento`,
`dataPrevista`). Transferência: `data` da movimentação.

Formato `dd/mm/aaaa`; vazio quando não há data válida.

## Telas

Linhas (`item-row`) recebem uma célula de data à esquerda: Despesas (lista e
acordeões), compras da fatura em Cartões, Relatório, Receitas, Pesquisar
lançamento, Transferências, Reembolsos por pessoa, Escritório (despesas,
recebíveis, repasses, retiradas extraordinárias).

Tabelas recebem a coluna "Data" na primeira posição: lançamentos recentes do
Dashboard, Análise, receitas do Relatório, PDFs de caixa mensal e de reembolsos.

Fora do escopo: listas que já começam por data (projeção diária, conferência
de PDF da fatura, cofrinho, eventos de distribuição) e listas agregadas (mês,
categoria, pessoa).
