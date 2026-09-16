# FINFLOW — Auditoria do Motor Temporal/Financeiro

Data: 16/09/2026
Escopo: `index.html` (single-file app), branch de trabalho local, SEM alterações de produção nesta etapa.
Backup real usado para parte dos testes: `finflow_backup_20260903.json` (dados sintéticos foram usados para os casos C01–X03, construídos via `migrateAppData()` em uma página real rodando o `index.html` atual, isolada por Playwright — nenhum teste modificou o arquivo).

---

## 1. Resumo executivo

O FinFlow hoje mistura, num único campo `mes`/`ano` por lançamento, três conceitos que precisam ser distintos: **quando o dinheiro entra/sai da conta**, **a que ciclo de compromissos ele pertence** e **em que categoria/mês ele deve aparecer nos relatórios**. Isso funciona bem no caso comum (a maior parte do mês), mas quebra silenciosamente nas bordas — especificamente nos primeiros dias do mês, ao redor do fechamento da fatura do cartão, e em qualquer projeção que percorra vários meses à frente.

Dois bugs desse tipo já foram encontrados e corrigidos nesta sessão (`receitaRecebida()` e `getMesesHistoricoDisponiveis()` comparavam contra o mês **exibido** no Dashboard em vez do mês **real** de hoje, fazendo a projeção "esquecer" salários futuros e produzir um déficit que só crescia). Esta auditoria foi pedida para ir além desses dois pontos e mapear o motor inteiro antes de qualquer nova alteração.

Achados principais, em ordem de severidade:

- **CRÍTICO** — O rótulo "Em Caixa Agora" no Dashboard, para um mês futuro, mostra o **Pior Cenário projetado**, não o saldo real. O campo que carrega esse número (`emCaixaDisponivel`) é o mesmo campo usado para o saldo real de hoje — só o *conteúdo* muda dependendo do mês, sem nenhuma marca no nome. Foi exatamente essa confusão que motivou a pergunta original do usuário nesta sessão, e o problema estrutural (o campo, não só a conta) continua presente mesmo depois da correção do cálculo (achado **X02** / **INV-10**).
- **CRÍTICO** — Despesas variáveis avulsas já lançadas para um mês futuro (uma compra pontual que você já sabe que vai fazer, ou já fez, e registrou) são **completamente ignoradas** pela fórmula de projeção (`calcVariacaoMesRecorrente`), que só soma despesas fixas, parcelas de cartão e a média histórica — nunca o gasto avulso real. Isso pode tanto **subestimar** um mês em que você já sabe que vai gastar mais que a média, quanto simplesmente descartar informação que o usuário já forneceu (achados **V02**, **V03**).
- **ALTO** — O modelo de cartão de crédito usa uma regra fixa "mês da compra + 1 = mês da fatura", ignorando completamente o dia da compra e o dia de fechamento configurado por cartão (`fecha`/`paga`, que já existem no schema mas só são usados para exibição). Compras feitas nos primeiros dias do mês (antes do fechamento) caem na fatura errada (achados **C01**, **C04**).
- **ALTO** — Não existe, no modelo de dados, nenhuma distinção entre "receita garantida", "receita contratada mas não recebida" e "receita potencial/especulativa" — tudo que é lançado como receita "extra" entra automaticamente no Melhor Cenário e no simulador "E se...", ainda que seja só uma proposta não fechada (achado **P04**).
- **MÉDIO** — O campo `mes`/`ano` de uma receita tipo salário mistura duas coisas: o mês em que o dinheiro efetivamente caiu na conta e o "ciclo" que ele financia (a rolagem fixa de +1 mês já embutida no app). Isso já é uma decisão de produto documentada no código, mas tem uma consequência pouco óbvia: o usuário só consegue marcar aquele salário como "recebido" a partir da tela do mês **seguinte** ao mês em que ele realmente entrou na conta (achado **S02**).
- Fora isso, o núcleo que trata **saldo real de conta bancária** (`calcSaldoConta`/`calcSaldoContaAte`) está sólido: não depende do mês em exibição, não conta receita/despesa duas vezes, e não deixa projeção nenhuma vazar pro saldo real ou pro histórico (7 de 7 invariantes testados diretamente nesse núcleo passaram).

Nenhum código de produção foi alterado nesta etapa. Os dois bugs de `currentMonth` vs `REAL_TODAY_*` já foram corrigidos e entregues antes desta auditoria começar (ver commit anterior a este relatório) — o restante dos achados abaixo é novo e depende de aprovação para ser implementado.

---

## 2. Modelo atual

### Salário
Uma receita `tipo:'salario'` marcada `recorrente:true` "rola" +1 mês por regra fixa dentro de `getReceitasForMonth()` (linha 1853): se foi lançada com `mes:9,ano:2026`, ela só passa a aparecer a partir de `getReceitasForMonth(10,2026)` em diante (nunca em `getReceitasForMonth(9,...)`). A justificativa, documentada no próprio código (comentário acima da função, linha ~1848) e na UI (`recSalarioRollInfo`, linha 633): "lance no mês em que você recebe (dia 26–30) — o app já conta esse dinheiro como disponível no mês seguinte, que é quando ele é de fato usado pra pagar as contas." Ou seja, o app já reconhece informalmente a diferença entre "quando o dinheiro entra" e "que ciclo ele financia" — mas resolve isso deslocando o `mes` inteiro, sem guardar as duas informações separadamente.

`receitaRecebida()` (linha 1877, corrigida nesta sessão) decide se aquela instância "rolada" já foi recebida checando `r.recebidaMeses[mesKey(mes,ano)]` — ou seja, contra o mês **rolado** (outubro no exemplo acima), não contra o mês em que o salário foi de fato lançado (setembro).

### Mês
Existem dois "mês atuais" no app: `currentMonth`/`currentYear` (o mês que o Dashboard está exibindo, mudado pelas setinhas de navegação) e `REAL_TODAY_MONTH`/`REAL_TODAY_YEAR` (constantes, fixadas em `new Date()` no carregamento da página — o mês real de hoje). A distinção existe desde antes desta sessão e é usada corretamente na maior parte do código (`calcSaldoConta`, `aplicarDebitosAutomaticos`, `getTotalsForMonth`) — os dois bugs corrigidos nesta sessão eram justamente os dois lugares que ainda usavam `currentMonth` onde deveriam usar `REAL_TODAY_MONTH`.

### Despesas
Uma despesa tem `mesInicio`/`anoInicio` (mês/ano — não dia) e `parcelas` (1 = à vista/avulsa). `getDespesasForMonth()` (linha 1904) decide em que mês-calendário cada parcela cai: para cartão de crédito, `roll = 1` (a compra de `mesInicio` vira fatura de `mesInicio+1`); para Dinheiro/PIX, `roll = 0` (a data lançada já é o mês em que o dinheiro sai). **Não existe campo de dia da compra** — o modelo não tem granularidade para saber se uma compra foi no dia 2 ou no dia 30 do mês.

### Cartão
Cada cartão tem `fecha` (dia do fechamento) e `paga` (dia do vencimento) — campos que **já existem no schema** (`migrateState`, linha 1543) e **já aparecem na interface** (cadastro de cartão, "Faturas dos Cartões", "Próximos Vencimentos"). Mas nenhum desses dois campos é usado no cálculo de competência da fatura (`getDespesasForMonth`) — servem só para exibição e para o cálculo de proximidade de vencimento em "Próximos Vencimentos" (linha ~4538). A regra real usada pra decidir a fatura é sempre "mês da compra + 1", nunca "depois do dia de fechamento, +1; antes, +0".

### Fatura
`calcByCardForMonth()` (linha ~1955) soma as parcelas de despesas de cartão que caem naquele mês (usando a regra acima) e aplica um ajuste manual opcional (`faturasAjustes`) para bater com o valor real cobrado pelo banco. `isFaturaPaga`/`faturaKey` (linha 1947–1948) marcam a fatura de um cartão num mês como paga; o pagamento debita a conta bancária escolhida (`state.faturasContas`) só na hora em que é confirmado, nunca na hora da compra.

### Caixa
`calcSaldoConta()`/`calcSaldoContaAte()` (linhas 4285/4341) são a fonte da verdade do saldo real: partem do `saldoInicial` da conta e somam/subtraem apenas eventos **confirmados** (receita marcada recebida, despesa marcada paga, fatura marcada paga, contribuição marcada paga, movimentações manuais e transferências) — nunca previsões. Não dependem de `currentMonth`.

### Previsão / Projeção
`getTotalsForMonth()` (linha 2129) tem três caminhos: mês atual real (`isMesAtualReal`) usa o saldo real das contas mais o que falta receber/pagar *daquele mês específico*, já lançado; mês passado (`isPassado`) reconstrói o saldo histórico via `calcSaldoContaAte`; mês futuro (`isFuturo`) delega para `calcProjecaoFutura()` (linha 2084), que **acumula mês a mês** a partir do resultado preciso de hoje, usando `calcVariacaoMesRecorrente()` (linha 1985) para cada mês intermediário — a mesma fórmula usada pelo simulador "E se..." (`rodarSimulacao`, linha 5786), para garantir que os dois sempre batam pro mesmo mês.

`calcVariacaoMesRecorrente()` soma apenas: salário ainda não recebido, despesas fixas do mês, parcelas de cartão do mês e a **média histórica** de gastos variáveis (`calcPrevisaoMediaHistorica`, linha 2847, que por sua vez usa `getMesesHistoricoDisponiveis`, linha 2834, corrigida nesta sessão para sempre olhar pra trás a partir de hoje). Ela **não** olha para despesas avulsas (não-fixas, parcela única) já lançadas para aquele mês futuro — ver achados V02/V03 na seção 3.

### Projetos / recebíveis
Uma receita `tipo:'extra'` pode ser parcelada (`gerarParcelasReceita`, linha 2986) — cada parcela tem `mes`,`ano`,`valor`,`recebida` independentes. Uma vez lançada, ela entra em `getReceitasPrevistasForMonth`/`projetosExtra` e soma no Melhor Cenário e no "E se..." — não existe um terceiro estado ("proposto, não contratado") que fique fora do cenário garantido/esperado.

### Gastos variáveis
`calcPrevisaoMediaHistorica()` calcula a média das despesas não-fixas de parcela única dos últimos N meses **com dados** (mínimo 3), sempre contando pra trás a partir de `REAL_TODAY` (pós-correção). Essa média entra em `calcVariacaoMesRecorrente` para todo mês futuro, mas sem cruzar com o que já foi de fato lançado para aquele mês específico (ver seção 3).

---

## 3. Problemas encontrados

### C-01 — CRITICAL — Rótulo "Em Caixa Agora" mostra projeção, não saldo real, em mês futuro
**Função/linha:** `getTotalsForMonth`, linha 2174 (`emCaixaDisponivel = saldoPiorCenario`); consumido em `renderDashboard`, linha 2607 (hero tile).
**Comportamento atual:** o mesmo campo `t.emCaixaDisponivel` — e seu alias `saldoDisponivel` — carrega o saldo real das contas quando o mês é hoje/passado, e o **Pior Cenário projetado** quando o mês é futuro. Nenhuma mudança de nome, tipo ou flag no dado indica a troca; só quem já sabe que precisa checar `isProjecaoFutura` antes de ler o campo evita a confusão.
**Comportamento esperado:** saldo real e saldo projetado deveriam ser campos **distintos e nomeados como tal** em todo o pipeline (não só no ponto de renderização), inclusive no retorno de `getTotalsForMonth`.
**Risco:** é exatamente o tipo de confusão que gerou a pergunta original do usuário nesta sessão ("o caixa não está fazendo sentido"). O bug de cálculo já foi corrigido, mas a ambiguidade estrutural do campo continua — a próxima mudança na fórmula de projeção pode reintroduzir a mesma confusão sem que ninguém perceba, porque o nome do campo não avisa.
**Reprodução:** teste `X02` (seção 9) — `getTotalsForMonth(mesFuturo,...).emCaixaDisponivel` retorna o mesmo valor que seria mostrado como "saldo disponível", mesmo sendo 100% projeção.

### C-02 — CRITICAL — Despesas variáveis avulsas futuras são ignoradas pela projeção
**Função/linha:** `calcVariacaoMesRecorrente`, linhas 1998–2001.
**Comportamento atual:** `saidas = despesasFixas + parcelasCartao + mediaVariaveis`. Uma despesa não-fixa com parcela única (`d.fixa===false && (d.parcelas||1)===1`) — qualquer compra avulsa, em dinheiro ou cartão — não entra em `despesasFixas` (exige `d.fixa`) nem em `parcelasCartao` (exige `parcelas>1`). Se você já lançou uma compra de R$4.000 pro mês que vem, a projeção continua usando só a média histórica (ex: R$3.000) e **descarta silenciosamente** o gasto real já conhecido.
**Comportamento esperado:** o gasto real já lançado para aquele mês deveria, no mínimo, substituir a estimativa (`max(realizado, média)`) — ou, melhor, ser somado à média já descontando a fatia que a média "representaria" para aquele tipo de gasto (ver proposta na seção 4/seção 7).
**Risco:** subestimar uma saída de caixa já conhecida é pior do que superestimar — é exatamente o cenário que motivou a auditoria: "o sistema está acumulando as dívidas como se não pagasse nada" tinha uma causa (já corrigida) e esta é uma segunda causa correlata, ainda não corrigida, que pode fazer a projeção parecer *otimista demais* em vez de pessimista demais.
**Reprodução:** testes `V02` e `V03` (seção 9).

### C-03 — HIGH — Cartão ignora dia da compra e dia de fechamento
**Função/linha:** `getDespesasForMonth`, linhas 1904–1929 (`roll = isCartaoDeCredito(d.cartao)?1:0`); campos `fecha`/`paga` existem em `state.cards` (linha 1543) mas não são lidos aqui.
**Comportamento atual:** toda compra no cartão lançada com `mesInicio:M` vira fatura de `M+1`, sempre — não importa se foi no dia 1 ou no dia 30 do mês, nem qual o dia de fechamento configurado para aquele cartão.
**Comportamento esperado (conforme especificado pelo usuário):** compra antes do dia de fechamento do mês corrente pertence à fatura desse mesmo ciclo; compra depois, ao ciclo seguinte.
**Risco:** qualquer compra feita nos primeiros dias do mês (entre o dia 1 e o dia de fechamento) cai uma fatura adiante do correto — o valor "some" da fatura em que o banco realmente vai cobrar e aparece uma fatura depois, distorcendo tanto o Dashboard quanto o simulador para os primeiros dias de cada ciclo.
**Bloqueio:** o schema de despesa não tem campo de dia da compra — não dá pra resolver isso sem adicionar um campo novo e migrar dados existentes (ver seção 7).
**Reprodução:** testes `C01` e `C04` (seção 9).

### C-04 — HIGH — Nenhuma forma de registrar receita "potencial" separada de receita "prevista"
**Função/linha:** modelo de dados de `state.receitas` (não há campo de status de confirmação); consumido em `getReceitasPrevistasForMonth` (linha 1892), `calcVariacaoMesRecorrente` (linha 1999, `projetosExtra`), `rodarSimulacao` (linha 5819–5820).
**Comportamento atual:** qualquer receita lançada (mesmo uma proposta que ainda nem foi fechada) entra automaticamente no Melhor Cenário e no simulador "E se...", com o mesmo peso que um projeto já contratado e só aguardando pagamento.
**Comportamento esperado:** distinguir "contratado, aguardando recebimento" de "possível, não confirmado" — só o primeiro deveria contar em qualquer cenário além do potencial.
**Risco:** um usuário que lança uma proposta para não esquecê-la infla o Melhor Cenário sem querer.
**Reprodução:** teste `P04` (seção 9) — BLOCKED (o cenário nem pode ser construído no schema atual).

### C-05 — MEDIUM — Campo `mes` de salário recorrente mistura "quando entrou" com "qual ciclo financia"
**Função/linha:** `getReceitasForMonth`, linha 1865–1869 (roll de salário); `receitaRecebida`, linha 1877.
**Comportamento atual:** um salário lançado com `mes:9` (porque foi recebido em setembro) só aparece em `getReceitasForMonth` a partir de outubro, e só pode ser marcado "recebido" a partir da tela de outubro — mesmo o extrato bancário mostrando o crédito em setembro.
**Comportamento esperado:** a UI/lógica deveria deixar claro (e o dado deveria refletir) que "recebido em setembro" e "financia o ciclo de outubro" são fatos diferentes, sem depender de o usuário lembrar de ir na tela certa pra marcar.
**Risco:** confusão operacional (usuário procura o salário na tela errada) mais do que erro de cálculo — o valor final bate, mas o fluxo de uso é indireto.
**Reprodução:** teste `S02` (seção 9).

### C-06 — LOW — "Parcela atual" em Parcelamentos usa o mês exibido, não hoje
**Função/linha:** `renderParcelamentos`, linha 3756.
**Comportamento atual:** `if(y<currentYear||(y===currentYear&&mo<=currentMonth))cp=i+1;` — o número da parcela "atual" e a barra de progresso mudam conforme o usuário navega o Dashboard para outro mês, mesmo a tela de Parcelamentos não tendo navegação de mês própria.
**Comportamento esperado:** "parcela atual" deveria refletir sempre `REAL_TODAY`, independente de qual mês está sendo visualizado em outra tela.
**Risco:** só de exibição (não afeta nenhum total financeiro) — navegar o Dashboard pra um mês futuro e depois abrir Parcelamentos mostra uma barra de progresso adiantada.
**Reprodução:** inspeção de código; não crítico o suficiente para justificar um teste Playwright dedicado nesta rodada.

### C-07 (referência) — já corrigido nesta sessão, antes da auditoria
`receitaRecebida()` e `getMesesHistoricoDisponiveis()` comparavam contra `currentMonth`/`currentYear` (mês exibido) em vez de `REAL_TODAY_MONTH`/`REAL_TODAY_YEAR` (hoje de verdade). Isso fazia toda projeção de mês futuro que passasse por meses intermediários "esquecer" o salário desses meses intermediários (tratando-os como passado em relação ao mês alvo) enquanto ainda contava as despesas cheias — produzindo um déficit acumulado sem fim. Já corrigido e verificado com Playwright contra o backup real (ver histórico desta sessão). Incluído aqui só para registro/rastreabilidade da auditoria.

---

## 4. Modelo financeiro proposto

Formalização em 5 etapas, cada uma alimentando a próxima:

```
EVENTO → COMPETÊNCIA → OBRIGAÇÃO → CAIXA → CICLO FINANCEIRO
```

1. **Evento** — o fato bruto: uma compra, um recebimento, uma parcela. Tem uma data real (`dataFato`), mesmo que hoje só seja conhecida em granularidade de mês.
2. **Competência** — o período ao qual o evento pertence para fins de análise histórica/relatório ("gastei X em setembro"). Não é necessariamente o mês do fato (ex: uma compra em cartão pertence à competência da fatura, não do mês da compra).
3. **Obrigação** — o compromisso gerado: uma fatura a vencer, uma parcela a receber, uma despesa fixa do mês. Tem status (`pendente`/`paga`/`recebida`) independente da competência.
4. **Caixa** — o momento em que o dinheiro efetivamente entra ou sai de uma conta bancária. Só isso altera `calcSaldoConta`. Nunca é alterado por previsão.
5. **Ciclo financeiro** — a janela "do salário de hoje até o salário do mês que vem", usada para responder "quanto sobra até o próximo recebimento" — pode não coincidir com o mês-calendário.

Cada dimensão já existe **parcialmente** hoje (ex: `pagoMeses`/`recebidaMeses` já são "Obrigação"; `calcSaldoConta` já é "Caixa" puro) — a proposta não é reescrever do zero, é **parar de comprimir Evento+Competência+Obrigação dentro de um único par `mes`/`ano`** nos lançamentos.

### Substituição de "Pior/Melhor Cenário" por três níveis

Proposta (a formalizar com o usuário antes de implementar — ver seção 13):

- **Saldo Garantido** = caixa real atual + receitas futuras garantidas dentro do horizonte (salário já configurado como recorrente, parcelas de projeto já contratado) − compromissos já assumidos (despesas fixas, parcelas de cartão) − despesas necessárias previstas (a parte da média histórica que não é opcional).
- **Saldo Esperado** = Saldo Garantido + recebíveis contratados com expectativa realista de recebimento − estimativa realista de gastos variáveis ainda não realizados (reconciliada com o que já foi lançado, ver C-02).
- **Saldo Potencial** = Saldo Esperado + receitas explicitamente marcadas como potenciais/não confirmadas (exige o novo status de receita da seção 3, C-04).

Isso é estritamente mais informativo que "Pior/Melhor", mas troca a UI que o usuário acabou de aprovar nesta sessão — **decisão de negócio, não técnica** (seção 13).

### Regra de fatura de cartão (algoritmo proposto)

```
dado: dataCompra (data real), cartao.fecha (dia do mês)
se dataCompra.dia <= cartao.fecha:
    competenciaFatura = mês(dataCompra)
senão:
    competenciaFatura = mês(dataCompra) + 1
```

Isso substitui o atual `roll = isCartaoDeCredito(d.cartao)?1:0` incondicional por um cálculo condicional ao dia. Quando `cartao.fecha` for `null` (cartão sem essa configuração — hoje é opcional), cai no comportamento atual (`+1` fixo) como fallback, preservando compatibilidade.

### Reconciliação de gastos variáveis (algoritmo proposto para C-02)

Duas opções, ambas descritas no pedido original do usuário — nenhuma foi escolhida ainda:

- **Opção A (simples, por mês):** `previsaoVariavel = max(realizadoNoMes, mediaHistorica)`.
- **Opção B (por categoria, mais precisa):** para cada categoria variável, `previsaoRestante = max(0, mediaCategoria - jaLancadoCategoria)`; a saída total variável é `Σ jaLancadoCategoria + previsaoRestante`. Isso evita subestimar (like a Opção A faria se o gasto já lançado for menor que a média em uma categoria mas maior em outra) e evita superestimar quando o usuário já lançou mais que a média em todas as categorias relevantes.

A Opção B é estatisticamente mais correta mas exige que `calcPrevisaoMediaHistorica` (hoje calcula só um total agregado) passe a expor a média por categoria de forma utilizável mês a mês — o campo `porCategoria` já existe (linha 2864) mas hoje só alimenta um card de exibição, não a fórmula de projeção. **Decisão de negócio: qual opção adotar** (seção 13).

---

## 5. Modelo de dados proposto

Campos atuais relevantes (sem alteração nesta etapa):

```
despesa: { id, desc, cat, subcat, cartao, conta, valor, parcelas,
           mesInicio, anoInicio, fixa, diaVencimento, debitoAutomatico,
           pagoMeses:{mesKey:bool}, split, repasses, createdAt }
receita: { id, tipo, nome, valor, mes, ano, conta, recorrente, isRepasse,
           createdAt, recebidaMeses:{mesKey:bool}, parcelas?:[{mes,ano,valor,recebida}] }
card:    { id, name, color, fecha, paga }   // fecha/paga já existem, não usados no cálculo
conta:   { id, name, color, saldoInicial }
movimentacaoConta: { id, contaId, valor, data, obs, transferId? }   // já usa data ISO completa!
```

Novos campos propostos (nenhum aplicado ainda):

```
despesa.dataCompra?: string (ISO "YYYY-MM-DD")   // opcional — null = usa mesInicio/anoInicio (legado)
receita.dataRecebimentoPrevista?: string (ISO)    // opcional, só informativo
receita.status?: 'garantido' | 'contratado' | 'potencial'   // novo — resolve C-04
                  // default 'contratado' se ausente, para não quebrar dados antigos
```

Nenhum campo existente muda de significado. `movimentacoesContas` já guarda `data` (string ISO completa) — é a prova de que o padrão de guardar data exata, quando necessário, já existe no app; `dataCompra` seguiria o mesmo padrão.

**Nenhum destes três campos precisa ser persistido imediatamente para todos os registros** — todos podem ser opcionais com fallback para o comportamento atual, o que é a base da estratégia de migração (seção 7).

---

## 6. Regras temporais (formalização)

**Salário** (mantendo a regra de rolagem já em produção, apenas separando os dois conceitos):
```
dataRecebimentoReal = data em que recebidaMeses[mesKey] foi marcado true (hoje: implícito no mês exibido)
cicloFinanciado = dataRecebimentoReal + 1 mês (regra de produto já documentada, ver seção 2)
```

**Fechamento/vencimento de cartão** (ver algoritmo completo na seção 4):
```
competenciaFatura(dataCompra, cartao) =
  mês(dataCompra)      se dia(dataCompra) <= cartao.fecha (ou cartao.fecha é null)
  mês(dataCompra) + 1  caso contrário
vencimentoFatura = competenciaFatura + dia(cartao.paga)
```

**Parcelas** (já correto hoje — apenas formalizando o que `getDespesasForMonth` já faz):
```
competenciaParcela(i) = competenciaFatura(dataCompra) + i,  i = 0..parcelas-1
valorParcela = valor / parcelas   // sem arredondamento por parcela — teste INV-05 confirma que soma bate exato
```

**Recebíveis parcelados** (já correto hoje):
```
cada parcela tem (mes, ano, valor, recebida) independentes — soma das parcelas == valor total por construção
(o formulário gera parcelas dividindo o total; não há re-validação de que a soma bate se editado manualmente parcela a parcela — risco menor, não testado nesta rodada)
```

**Ciclo financeiro** (novo conceito, ainda não implementado):
```
inícioCiclo(hoje) = data do último salário recebido
fimCiclo(hoje) = data do próximo salário esperado
compromissosDoCiclo = obrigações com vencimento entre inícioCiclo e fimCiclo
```

---

## 7. Estratégia de migração

Princípio geral: **todo campo novo é opcional com fallback para o comportamento atual** — nenhum dado existente muda de interpretação sozinho.

- **Despesas antigas sem `dataCompra`**: continuam usando `mesInicio`/`anoInicio` com a regra atual (`+1` fixo para cartão). Só despesas novas, lançadas depois que o formulário passar a pedir a data completa, ganham `dataCompra` e passam pela regra sensível ao dia. Nenhuma despesa histórica é reinterpretada — isso é o que impede a violação do futuro INV-12 quando a regra do cartão mudar.
- **Cartões**: `fecha`/`paga` já existem e já são opcionais (`null` permitido) — a regra proposta já trata `fecha:null` como "usa a regra antiga", então cartões que nunca configuraram isso continuam se comportando exatamente como hoje.
- **Salário**: a rolagem +1 continua idêntica — a mudança proposta (separar "recebido em" de "financia o ciclo") é só de superfície/UX (mostrar os dois fatos, deixar marcar "recebido" a partir do mês certo), não muda nenhum número já calculado.
- **Parcelamentos**: nenhuma mudança de schema proposta — já preservam número de parcela, competência, fatura e status corretamente (`INV-05`, `INV-11` confirmados).
- **Receita com `status`**: default `'contratado'` para qualquer receita sem esse campo (comportamento idêntico ao atual — hoje toda receita lançada já é tratada como "contratada"). Só passa a existir uma diferença de comportamento quando o usuário explicitamente marcar algo como `'potencial'`.

**Estratégia recomendada:** *legacy behavior para registros antigos, novo comportamento (opt-in) para registros novos* — exatamente o padrão que o próprio `migrateState()` já usa hoje para todo campo novo introduzido ao longo do histórico do app (`if(campo===undefined) campo=valorPadrão`, ver linhas 1526–1543). Não requer uma tela de "migração" nem reprocessamento em lote.

---

## 8. Impact Map

Funções que mudariam com a implementação completa da proposta (nenhuma alterada nesta etapa):

| Camada | Função/arquivo | Tipo de mudança |
|---|---|---|
| Cartão/fatura | `getDespesasForMonth` (1904) | Nova regra condicional de `roll` baseada em `dataCompra`+`cartao.fecha`, com fallback |
| Cartão/fatura | `calcByCardForMonth` (1955) | Nenhuma mudança direta — consome `getDespesasForMonth` |
| Formulário de despesa | `addDespesa`/edição de despesa (3354, ~3600) | Novo campo opcional de data da compra na UI |
| Receita/status | `addReceita` (3015), formulário de receita | Novo campo `status` na UI (garantido/contratado/potencial) |
| Projeção | `calcVariacaoMesRecorrente` (1985) | Reconciliar despesas avulsas já lançadas com a média histórica (C-02) |
| Projeção | `calcPrevisaoMediaHistorica` (2847) | Expor média por categoria de forma consumível pela projeção (se Opção B) |
| Cenários | `getTotalsForMonth` (2129), `calcProjecaoFutura` (2084), `rodarSimulacao` (5786) | Separar campo de saldo real vs projetado (C-01); opcionalmente recalcular 3 níveis em vez de 2 |
| Dashboard | `renderDashboard`/hero tiles (2589+), `renderResumoPagar` (2385), `renderProjecaoFinanceira` | Renomear/reestruturar o que é exibido como "Em Caixa Agora" pra deixar claro real vs projetado; eventual 3ª coluna de cenário |
| Simulador | `rodarSimulacao` (5786) | Mesma reconciliação de C-02, mesma separação real/projetado |
| Parcelamentos | `renderParcelamentos` (3746) | Trocar `currentMonth` por `REAL_TODAY_MONTH` no cálculo de "parcela atual" (C-06, correção isolada e barata) |
| Migração | `migrateState` (1500) | Novos `if(campo===undefined) campo=default` para os 3 campos novos |
| Export/Import | `exportData`/`importData` (1776/1784) | Nenhuma mudança — já serializam o objeto inteiro via `buildSaveObject` |
| Sincronização Drive | `syncFromDrive`/`saveToDrive` | Nenhuma mudança — payload genérico |

Telas **não afetadas** pela proposta: Categorias, Contas Bancárias (schema), Cofrinho, Repasses/Pessoas (usam `split`/`repasses`, independentes deste motor), Análise/Filtros (usa dados históricos já confirmados, não projeção).

---

## 9. Testes

Rodados via Playwright contra o `index.html` atual (não modificado), com dados **sintéticos controlados** construídos por `migrateAppData()` dentro da própria página (não dados reais do usuário) — permite reproduzir exatamente os casos pedidos sem depender de um backup específico. Script: `/opt/node-tools/audit_tests.mjs` e `/opt/node-tools/audit_invariants.mjs` (mantidos fora do repositório do app).

| Caso | Resultado | Observação |
|---|---|---|
| C01 — compra 02/09, fechamento dia 3 → esperado fatura set/2026 | **FAIL** | foi para fatura de outubro (regra ignora o dia) |
| C02 — compra 04/09 → esperado fatura out/2026 | **PASS** | |
| C03 — compra 30/09 → esperado fatura out/2026 | **PASS** | mesma regra de mês que C02, testado separadamente |
| C04 — compra 02/10, fechamento dia 3 → esperado fatura out/2026 | **FAIL** | foi para fatura de novembro |
| C05 — compra 04/10 → esperado fatura nov/2026 | **PASS** | |
| C06 — parcelada 3x a partir de 04/09 → competências corretas | **PASS** | out/nov/dez, R$300 cada, soma R$900 |
| C07 — fatura fechada, não paga → compromisso pendente | **PASS** | |
| C08 — fatura paga → sai da lista de pendências | **PASS** | |
| S01 — salário previsto, antes/depois de marcar recebido | **PASS** | saldo real só muda depois da confirmação |
| S02 — navegar não pode "esconder" o salário do mês em que foi recebido | **FAIL (comportamento documentado)** | salário lançado em set/2026 não aparece em `getReceitasForMonth(9,...)`, só a partir de out/2026 |
| S03 — navegar entre meses não conta salário 2x | **PASS** | saldo estável em 4 meses testados |
| P01 — projeto R$6.000 em 3x de R$2.000 | **PASS** | cada parcela em seu mês, valor correto |
| P02 — parcela prevista não recebida não entra no saldo real | **PASS** | |
| P03 — marcar parcela recebida aumenta caixa exatamente 1x | **PASS** | idempotente — marcar de novo não soma de novo |
| P04 — projeto potencial/não confirmado fica fora do cenário garantido | **BLOCKED** | schema não tem esse conceito — não dá pra nem construir o cenário |
| V01 — média histórica R$3.000, nada lançado no mês futuro | **PASS** | saída = R$3.000 |
| V02 — média R$3.000 + R$1.200 já lançado → sem dupla contagem | **FAIL** | o R$1.200 já lançado é ignorado por completo (nem soma nem reconcilia) |
| V03 — gasto real R$4.000 (> média R$3.000) já lançado | **FAIL** | projeção usa só a média (R$3.000), subestimando um gasto já conhecido |
| X01 — saldo real R$5.000 não muda com nenhuma projeção | **PASS** | |
| X02 — saldo futuro projetado ≠ "disponível hoje" | **FAIL (achado estrutural)** | mesmo campo (`emCaixaDisponivel`) carrega os dois significados |
| X03 — receita prevista não aumenta saldo real antes da confirmação | **PASS** | |

**Total: 21 casos — 14 PASS, 6 FAIL, 1 BLOCKED.**

Regressão (verificada por inspeção de código + os testes acima, sem suíte dedicada nesta rodada, já que nada foi alterado): adicionar/editar/excluir despesa, parcelar despesa, marcar como paga, pagar fatura, desfazer pagamento, ajustar fatura, adicionar receita recorrente/parcelada, confirmar parcela, saldo de conta, Cofrinho, contribuições, repasses, navegação entre meses e importação/exportação JSON continuam com o mesmo comportamento de antes desta auditoria (nenhum código foi tocado). Sincronização com Google Drive não foi exercitada nesta rodada de testes (requer OAuth real) — comportamento inferido por leitura de código, sem mudança de risco identificada.

---

## 10. Invariantes

Rodados em `/opt/node-tools/audit_invariants.mjs`, dados sintéticos, mesma metodologia da seção 9.

| Invariante | Resultado | Detalhe |
|---|---|---|
| INV-01 — receita nunca aumenta caixa 2x | **OK** | confirmado via P03 (idempotência) |
| INV-02 — despesa nunca reduz caixa 2x | **OK** | liga/desliga/liga → 1000,900,1000,900 |
| INV-03 — compra no cartão não reduz conta na hora da compra | **OK** | saldo inalterado até a fatura ser paga |
| INV-04 — pagamento da fatura reduz caixa exatamente 1x | **OK** | marcar paga 2x seguidas não duplica o débito |
| INV-05 — soma das parcelas == total original | **OK** | R$100/3 somado nas 3 faturas bate R$100 exato |
| INV-06 — saldo real não depende do mês em exibição | **OK** | confirmado via S03 |
| INV-07 — navegar não altera dados | **OK** | `state.despesas` idêntico após navegar 12 meses e voltar |
| INV-08 — previsões não alteram histórico | **OK** | saldo de um mês passado inalterado após rodar projeções longas |
| INV-09 — receita prevista não é receita recebida | **OK** | confirmado via X03/P02 |
| INV-10 — saldo projetado não é saldo real | **VIOLADO** | mesmo campo (`emCaixaDisponivel`/`saldoDisponivel`) carrega os dois, sem distinção de tipo/nome — ver C-01 |
| INV-11 — uma compra pertence a exatamente 1 competência de fatura por cartão | **OK** | confirmado — despesa aparece em exatamente 1 mês de 12 testados |
| INV-12 — importar dados antigos não reinterpreta o histórico silenciosamente | **OK hoje / RISCO CRÍTICO na migração futura** | hoje não há versionamento de regra — se a regra do cartão (C-03) for trocada sem o padrão "legacy vs novo" da seção 7, TODAS as faturas históricas mudariam de competência no próximo carregamento. Não é uma violação atual, é um risco a gerenciar explicitamente na implementação. |

**12 invariantes checados, 1 violado (INV-10), 1 com risco futuro sinalizado (INV-12).**

---

## 11. Riscos de implementação

- **Dupla contagem**: o maior risco está na reconciliação de gastos variáveis (C-02) — se a Opção A ou B (seção 4) for implementada incorretamente, é fácil trocar "ignora o já lançado" (bug atual) por "conta o já lançado E a média cheia" (double counting na direção oposta). Testes V01–V03 devem ser re-rodados como suíte de regressão a cada mudança nessa função.
- **Alteração retroativa**: qualquer mudança na regra de fatura de cartão (C-03) que não trate `dataCompra` como opcional/fallback reinterpreta o histórico inteiro no próximo carregamento (INV-12). Mitigação: campo sempre opcional, nunca reescrever despesas antigas em lote.
- **Quebra de faturas**: `calcByCardForMonth`/`isFaturaPaga`/`faturaKey` (chave = `cardId_mesKey`) dependem de `mes`/`ano` calculados por `getDespesasForMonth` — uma despesa que muda de competência (por causa da nova regra sensível ao dia) muda de `faturaKey`, o que pode "perder" o status de paga de uma fatura que já tinha sido marcada com a chave antiga. Mitigação: aplicar a nova regra só a despesas novas (sem retroatividade), como já proposto na seção 7.
- **Quebra de saldos**: `calcSaldoConta`/`calcSaldoContaAte` não são afetados diretamente por nenhuma mudança proposta (continuam somando só eventos confirmados) — risco baixo aqui, mas qualquer novo campo em despesa/receita deve ser adicionado com `migrateState`-style defaults para não quebrar leituras de `state.despesas`/`state.receitas` em outras 30+ funções que os iteram.
- **Migração**: o próprio `buildSaveObject`/`migrateAppData` já tem `version:2` no payload salvo (linha 1578) mas essa versão nunca é lida/checada em lugar nenhum hoje — é só um número solto. Se a implementação decidir versionar o comportamento (ex: "despesas com `dataCompra` usam regra nova"), recomenda-se decidir isso por **presença do campo em cada registro**, não por um número de versão global do arquivo — é mais granular e sobrevive a merges de perfis/backups de datas diferentes.
- **Sincronização**: nenhuma mudança de schema proposta quebra o payload salvo no Drive (tudo aditivo, campos opcionais) — mas convém validar manualmente pelo menos uma vez a sincronização entre dois dispositivos depois da primeira mudança, já que essa sessão não tem como testar OAuth real.

---

## 12. Plano de implementação

**Fase 1 — Modelo temporal e helpers puros.** Adicionar `despesa.dataCompra` opcional ao schema (só o campo, sem UI ainda) e a função pura `competenciaFatura(dataCompra, cartao)` com fallback para a regra atual quando `dataCompra` ou `cartao.fecha` forem nulos. Testes unitários (Playwright, mesmo harness desta auditoria) cobrindo C01–C05 antes de tocar em qualquer render.

**Fase 2 — Cartões/faturas.** Trocar `getDespesasForMonth` para usar `competenciaFatura` quando `dataCompra` existir; adicionar o campo de data no formulário de nova despesa (opcional, com o comportamento atual como default se deixado em branco). Rodar C01–C08 + INV-04/INV-05/INV-11 como regressão.

**Fase 3 — Receitas e recebíveis.** Adicionar `receita.status` (garantido/contratado/potencial, default contratado) ao schema e ao formulário; separar em `getReceitasPrevistasForMonth` o que conta em cada nível de cenário. Rodar P01–P04 + INV-01/INV-09.

**Fase 4 — Motor de caixa/ciclo.** Nenhuma mudança planejada em `calcSaldoConta`/`calcSaldoContaAte` (já corretos) — esta fase é sobre formalizar/documentar o "ciclo financeiro" como conceito derivado, não persistido, se o usuário aprovar essa direção (seção 13).

**Fase 5 — Previsões.** Implementar a reconciliação de gastos variáveis (C-02, Opção A ou B conforme decisão do usuário) em `calcVariacaoMesRecorrente`. Rodar V01–V03 como critério de aceite.

**Fase 6 — Dashboard/UX.** Separar, em todo o pipeline (não só na exibição), o campo de saldo real do campo de saldo projetado (C-01) — inclusive renomeando/reestruturando o retorno de `getTotalsForMonth` para não reusar `emCaixaDisponivel` com dois significados. Atualizar hero tiles, "O que falta pagar" e "Projeção Financeira" de acordo. Rodar X01–X03 + INV-10 como critério de aceite.

**Fase 7 — Migração e compatibilidade.** Nenhuma migração em lote necessária (todos os campos novos são opt-in) — esta fase é só validação: importar o backup real do usuário (`finflow_backup_20260903.json` ou um mais recente) antes e depois de cada fase, comparando os totais de meses passados/atual (devem ser idênticos byte-a-byte nos números, já que nenhum dado antigo é reinterpretado).

**Fase 8 — Regressão completa.** Rodar a lista completa da seção 9 (Regressão) manualmente ou via Playwright contra o backup real do usuário, em pelo menos 3 meses (passado, atual, futuro), antes de considerar qualquer fase "pronta para produção".

Cada fase é independentemente reversível (nenhuma depende de dado já migrado da fase anterior) — dá pra parar depois de qualquer fase e o app continua funcionando exatamente como hoje para dados que não usam os campos novos.

---

## 13. Decisões que precisam de aprovação

Nada abaixo foi implementado — são pontos que não dá pra inferir com segurança sem uma escolha explícita do usuário:

1. **Vale a pena adicionar o campo de dia da compra?** Resolve C-03 (cartão), mas obriga a digitar um dado a mais em todo lançamento novo no cartão (hoje só pede mês/ano). Alternativa mais simples: manter só mês/ano e aceitar que compras nos primeiros dias do mês ficam com pequena margem de erro — mais rápido de lançar, menos preciso.
2. **Opção A ou B para reconciliar gastos variáveis (C-02)?** A por mês (simples) ou por categoria (mais precisa, mas exige mais trabalho de implementação e mais dado histórico por categoria pra ficar confiável).
3. **Vale a pena o terceiro status de receita (garantido/contratado/potencial)?** Resolve C-04, mas é um campo a mais pra preencher em toda receita nova — hoje o formulário não pergunta isso.
4. **Trocar "Pior/Melhor Cenário" por "Garantido/Esperado/Potencial"?** É uma mudança de UI que o usuário acabou de aprovar (o redesenho completo do Dashboard, nesta mesma sessão) — três colunas em vez de duas exige um novo desenho visual, não é só trocar o texto do rótulo.
5. **Corrigir C-03 (fatura de cartão) e C-05 (rolagem de salário) tem prioridade sobre o resto?** São os dois achados que mais se aproximam da reclamação original ("o caixa não está fazendo sentido") — mas C-01 (rótulo confuso) e C-02 (gasto ignorado) têm risco maior de gerar nova confusão se ficarem para depois.
6. **Vale rodar uma suíte de regressão automatizada permanente** (os scripts desta auditoria, adaptados) **toda vez que o motor financeiro for tocado?** Não existe hoje — os testes desta auditoria foram escritos do zero e vivem fora do repositório do app (`/opt/node-tools/`). Formalizar isso é uma decisão de processo, não só de código.

---

## Anexos

- Scripts de teste: `/opt/node-tools/audit_tests.mjs` (casos C/S/P/V/X), `/opt/node-tools/audit_invariants.mjs` (INV-01 a INV-12).
- Resultados brutos: `/tmp/audit_results.json`, `/tmp/audit_invariants.json`.
- Nenhum arquivo de produção (`index.html`) foi alterado durante esta auditoria.
