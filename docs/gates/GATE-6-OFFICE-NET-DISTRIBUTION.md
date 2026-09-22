# Gate 6 — distribuição líquida do Caixa do Escritório (imposto + RRT antes da divisão)

Branch `fix/office-net-distribution-rrt`, base `545fdd4` (entrega aprovada
`gate/5-account-identification`, auditoria Codex PASS em
`docs/audits/ACCOUNT-IDENTIFICATION-FINAL-REVIEW.md`).

## Regra financeira

A regra anterior (`state.office.regrasDistribuicao`, destinos `reserva`/
`impostos`/`repasse_pessoal`) dividia o valor **bruto** de um recebível
diretamente pelos percentuais configurados pelo usuário — imposto e reserva
eram só mais dois destinos dos 100%, nunca deduções anteriores.

A regra nova (v2) é:

```
receitaBruta = projeto.valorContrato
impostoProvisionado = receitaBruta × impostoPercentual (padrão 5%, configurável)
rrtProvisionada = soma das RRTs registradas no projeto
receitaLiquidaDistribuivel = receitaBruta − impostoProvisionado − rrtProvisionada
```

Só a receita líquida distribuível é dividida, em percentuais **fixos** (não
configuráveis pela UI, por decisão explícita de escopo):

```
Repasse pessoal ....... 65%
Operação ............... 15%
Reserva de crescimento . 10%
Capital de giro ......... 7%
Marketing ............... 3%
```

A soma dos 5 destinos bate **exatamente** com a receita líquida sempre —
método do maior resto (largest remainder / Hamilton) em centavos inteiros,
com desempate determinístico pela ordem fixa acima
(`distribuirReceitaLiquidaCent`, `index.html`). Nunca há erro de ponto
flutuante nem centavo perdido/sobrando.

## Convivência com a regra legada

`projeto.regraDistribuicao` decide qual motor se aplica:

- `'legacy'` — projeto antigo com pelo menos um recebível/repasse já
  efetivamente realizado antes desta entrega. Continua usando
  `calculateOfficeDistribution`/`regrasDistribuicao` exatamente como antes;
  nenhum código, valor ou movimento já materializado é tocado.
- `'v2'` — todo projeto novo, e todo projeto antigo que ainda estava
  inteiramente `previsto` (nada realizado) no momento da migração.

Um projeto `'v2'` sem nenhuma RRT registrada é sinalizado explicitamente como
**"RRT não configurada"** — nunca um valor inventado.

## RRT (Registro de Responsabilidade Técnica)

Cada RRT tem identidade própria, nunca só quantidade × valor:

```js
{ id, tipo: 'projeto' | 'execucao', valor, status: 'prevista' | 'emitida' | 'paga', numero, dataEmissao, dataPagamento }
```

- Um projeto tem no máximo 2 RRTs, nunca duas do mesmo tipo.
- `off.rrtValorPadrao` é o valor vigente do escritório (nunca inventado —
  fica `null` até o usuário configurar); só preenche o valor inicial de uma
  RRT nova, nunca altera retroativamente uma já registrada.
- `off.impostoPercentual` é configurável, padrão 5%.
- Editar/adicionar RRT recalcula a distribuição dos recebíveis **ainda não
  realizados** (`resyncProjectV2`); nunca reescreve um recebível já
  congelado (ver abaixo).
- RRT com `status==='paga'` não pode ser excluída (histórico financeiro).

## Recebimentos parciais e provisão prioritária

`recebível previsto ≠ dinheiro em caixa` continua valendo: um recebível
`'previsto'` nunca gera repasse, reserva nem qualquer disponibilidade real
sob a regra v2.

Quando um recebível é marcado `'recebido'`, o valor é dividido em
`provisionado` (vai para imposto+RRT) e `distribuível` (vai para os 5
destinos) por um regime de **prioridade** (`freezeRecebivelProvisionadoV2`):
enquanto a soma acumulada de caixa já realizado no projeto não cobrir
`impostoProvisionado + rrtProvisionada`, 100% de cada entrada realizada fica
provisionado — só o excedente, depois de cobrir integralmente o total a
provisionar, vira distribuível. Esse cálculo é **congelado** na primeira vez
(`recebivel.provisionadoRealizadoCent`/`distribuivelRealizadoCent`) e nunca
recalculado retroativamente, mesmo que o imposto/RRT do projeto mudem depois
— um recebível novo, ainda não realizado, usa a configuração vigente no
momento em que for realizado (não é retroatividade).

A RRT nunca é marcada como paga automaticamente — `status` é sempre uma
decisão manual do usuário.

## Reservas empresariais

Operação, Reserva de Crescimento, Capital de Giro e Marketing são 4
**reservas de sistema** (`OFFICE_RESERVA_SISTEMA_ID`, ids fixos,
`sistema:true`), criadas sob demanda e compartilhadas entre todos os
projetos v2 — nunca uma reserva nova por projeto, nunca uma reserva genérica
de 30%. A aplicação usa exatamente o mesmo mecanismo pareado de
`confirmarAplicarOfficeReserva` (mesmo id em `movimentacoesReservas` e
`movimentacoesContas`, débito real da conta de destino do recebível) — só
roda quando o recebível já é caixa real, e o par de movimentações é
imutável depois de criado.

Esses valores pertencem ao escritório, nunca à receita pessoal, nunca são
despesa operacional no momento da separação, e nunca entram no saldo
pessoal disponível. O repasse pessoal (65%) continua a única parcela que
gera previsão de entrada no financeiro pessoal, pelo mecanismo já existente
(`state.office.repasses` + `state.receitas` com `officeTransferId`
determinístico) — idêntico ao da regra legada em forma, só a base do cálculo
muda.

## Migração

`migrateState()` (idempotente, mesmo padrão de todo o resto do app):

- Todo `projeto` ganha `rrts:[]` se não existir.
- Todo `projeto` sem `regraDistribuicao` recebe `'legacy'` se tiver algum
  recebível já `'recebido'`, senão `'v2'` — nunca reescreve um projeto que
  já tinha `regraDistribuicao` definida.
- `off.impostoPercentual` (padrão 5) e `off.rrtValorPadrao` (padrão `null`)
  são adicionados se ausentes.

Nenhum dado existente é apagado, reescrito ou reinterpretado.
Export/import (`buildSaveObject`/`migrateAppData`) preserva todos os campos
novos automaticamente — a serialização já era genérica antes desta entrega.

## Fora de escopo desta entrega

Custos diretos do projeto na fórmula, folha de pagamento, contabilidade
fiscal completa, alteração dos percentuais fixos, e qualquer edição
simultânea de `regraDistribuicao` para um projeto já `'legacy'` (não há
caminho de upgrade legacy→v2 nesta entrega — só migração automática no
carregamento, restrita a projetos ainda inteiramente previstos).

## Correção pós-auditoria (achados P1/P2/P3 sobre `9983605`)

A auditoria Codex da implementação `9983605` encontrou três achados,
corrigidos nesta mesma branch:

**P1 — distribuição sem RRT configurada.** `syncDerivedPersonalTransferV2`
agora verifica `projetoNecessitaConfiguracaoRRT(projeto)` ANTES de congelar
qualquer provisão — enquanto verdadeiro, nenhum repasse nem reserva é
criado, mesmo com o recebível já `'recebido'` (o dinheiro continua entrando
no caixa operacional normalmente, só a distribuição fica bloqueada). A UI
mostra "Distribuição bloqueada: configure a RRT do projeto." em vez de
números de repasse/reserva como se já estivessem calculados. `addProjetoRRT`
deixou de criar a RRT direto com `valor:0` quando `rrtValorPadrao` é `null`
— agora abre um modal pedindo o valor explicitamente; um campo em branco é
rejeitado, e `0` só é aceito se digitado e confirmado de propósito
(`confirmarAddProjetoRRT`).

**P2 — reversão de recebível materializado.** `recebivelV2Materializado(r)`
detecta se um recebível já congelou provisão/distribuição ou já gerou
repasse/reserva/receita vinculada. A partir daí, `estado`, `valor`,
`contaDestino` e `dataRecebimento` ficam imutáveis — bloqueado tanto na UI
(`openEditOfficeRecebivel` desabilita os campos) quanto, de forma
decisiva, na função de gravação (`saveEditOfficeRecebivel`, que rejeita a
mudança mesmo contornando o `disabled`). `descricao`/`dataPrevista`
continuam editáveis (não afetam nenhum cálculo). Um motor de estorno
explícito fica fora de escopo desta correção.

**P3 — arredondamento por recebível divergindo do projeto inteiro.** O
maior resto deixou de ser aplicado isoladamente sobre o distribuível de
cada recebível. `freezeRecebivelProvisionadoV2` agora aplica uma
**reconciliação cumulativa por destino**: recalcula `distribuirReceitaLiquidaCent`
sobre o distribuível ACUMULADO do projeto (já congelado + este recebível) e
atribui a este recebível só a diferença em relação ao que os outros já
materializaram de fato (repasse criado + reserva aplicada,
`getProjetoAlocadoPorDestinoCent`). O resultado (`porDestinoRealizadoCent`)
é congelado junto com `provisionadoRealizadoCent`/`distribuivelRealizadoCent`
— nunca recalculado depois. Isso garante que a soma final por destino de
todos os recebíveis de um projeto bate exatamente com a divisão do projeto
inteiro, sempre, independente da ordem de realização.

Testes: 16 casos novos em `gate6-office-net-distribution.test.mjs`
(34 no total). Suíte completa: 526 PASS / 0 FAIL. Comparação com o backup
real (`compare-real-backup.mjs`): 0 diferenças em 14 meses históricos.

## Correção da segunda rodada de auditoria (achado P1 sobre `9983605`→`d2018ce`)

A reconciliação cumulativa acima (P3) recalculava `distribuirReceitaLiquidaCent`
com o método do **maior resto** a cada recebível. O maior resto **não é
monotônico**: ao crescer o total, a alocação de um destino específico pode
*diminuir* (paradoxo de Alabama). Como um recebível anterior já tinha
materializado sua reserva (imutável), um ajuste negativo pra esse destino
não podia ser aplicado — e era descartado silenciosamente
(`if(valor<=0) return` em `syncOfficeReserveDistributionV2`), criando
dinheiro fantasma: a soma efetivamente distribuída passava a superar o
dinheiro realmente recebido (reprodução mínima: R$0,14 + R$0,01 = R$0,15,
correto é 10/2/2/1/0 centavos, o bug materializava 10/2/1/1/**1** = 16
centavos).

**Correção:** `distribuirReceitaLiquidaCent` passou a usar o método de
divisor **Sainte-Laguë (Webster, "maiores médias")** em vez do maior resto
— matematicamente comprovado monotônico em população (nunca sofre do
paradoxo de Alabama), porque cada centavo adicional é sempre um a mais
sobre o estado anterior, nunca uma redistribuição do zero. Sainte-Laguë foi
escolhido entre os métodos de divisor por reproduzir exatamente os mesmos
valores que o maior resto já produzia nos cenários de referência do Gate 6
(R$3.000 com RRT de R$130,64/R$261,28) e no caso de referência desta
correção (R$0,15 → 10/2/2/1/0) — Jefferson/D'Hondt não bateria (favorece
desproporcionalmente o maior peso). Implementado inteiramente em BigInt
(nunca ponto flutuante como fonte de verdade): estimativa inicial por
arredondamento simples (sempre soma a no máximo ±2 do total, já que os 5
percentuais somam exatamente 100) mais um ajuste do resíduo por prioridade
de maiores médias, O(quantidade de destinos) — nunca itera centavo a
centavo, escala pra contratos de qualquer tamanho.

Nenhuma outra parte do motor (bloqueio de distribuição sem RRT, imutabilidade
do recebível materializado, motor legado) foi alterada. Testes: 6 casos
novos (40 no total). Suíte completa: 532 PASS / 0 FAIL. Comparação com o
backup real: 0 diferenças em 14 meses históricos.

## Correção da terceira rodada de auditoria (achado P1 sobre `d2018ce`→`9129efa`)

A primeira implementação de Sainte-Laguë (rodada anterior) usava uma
estimativa inicial por **arredondamento** (`round`), que pode tanto
sub-estimar quanto sobre-estimar o total — exigindo DOIS caminhos de
ajuste de resíduo (`prioridadeGanhar` pra somar, `prioridadePerder` pra
remover), cada um com seu próprio desempate. Verificação exaustiva
encontrou que os dois desempates não eram simetricamente consistentes: nos
empates, ambos mantinham o **mesmo** primeiro destino da ordem fixa (em
vez de direções invertidas), o que ainda permitia que a alocação de um
destino diminuísse ao crescer o total — reproduzido em 49→50 centavos
(pesos 65/15/10/7/3): repasse caía de 33 pra 32.

**Correção:** a estimativa inicial passou a ser por **piso** (`floor`, não
arredondamento). Como `floor(x) <= x` sempre, a soma das 5 estimativas
NUNCA excede o total — o resíduo é sempre ≥ 0, nunca é preciso remover.
`prioridadePerder` foi eliminada inteiramente; existe uma única função de
desempate (`prioridadeGanhar`), usada da mesma forma em toda a execução.
Isso é a construção **literal** do método Sainte-Laguë (um centavo de cada
vez, sempre pro maior merecedor) — não uma aproximação por estimativa.

Verificado por varredura exaustiva de monotonicidade de 1 a 2.000.000 de
centavos (teste permanente `sainte-lague-monotonico-varredura-exaustiva`),
checando a cada transição `n-1→n` que a soma bate, exatamente um destino
cresce, nenhum diminui e o incremento total é exatamente 1 centavo — e
contra todos os cenários de referência já aprovados (R$3.000 do Gate 6
original, R$0,15 e R$0,50 das correções anteriores), todos idênticos.

Nenhuma outra parte do motor foi alterada. Testes: 5 casos novos (45 no
total, incluindo a varredura exaustiva). Suíte completa: 537 PASS / 0
FAIL. Comparação com o backup real: 0 diferenças em 14 meses históricos.
