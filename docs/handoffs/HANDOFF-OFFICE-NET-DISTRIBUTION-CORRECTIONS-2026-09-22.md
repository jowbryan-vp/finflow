# Handoff — correção pós-auditoria (achados P1/P2/P3) da distribuição líquida do Caixa do Escritório, 22/09/2026

Fluxo: Claude corrige → Codex reaudita. Este documento é só a entrega da
correção; não é auditoria nem aprovação.

## Branch e commits

- Branch: `fix/office-net-distribution-rrt`.
- Commit-base desta correção (HEAD real da entrega auditada): `9983605`
  (`998360582b89fa0f139247d02166124a3e15da65`) — o handoff da entrega
  anterior citava `c22fcf1` incorretamente como final; `9983605` é o commit
  correto que a auditoria Codex efetivamente revisou.
- Commit da implementação original v2 auditada (FAIL): `c22fcf1` (motor de
  cálculo/UI/migração da regra líquida — o que a auditoria encontrou os 3
  achados).
- Commit funcional desta correção: `8716995` — corrige os achados P1/P2/P3.
- Commit documental final: será o próximo commit desta branch, que também
  inclui este handoff (não é possível um commit se autorreferenciar pelo
  próprio hash antes de existir — este arquivo cita `8716995` como o commit
  funcional que o precede; o hash do commit documental em si fica
  disponível só depois de criado, via `git log -1` nesta branch).
- HEAD entregue ao final desta correção: ver `git log -1` nesta branch
  (inclui este handoff).

## Achados corrigidos

### P1 — distribuição sem RRT configurada

Antes: um projeto v2 contratado sem nenhuma RRT era só sinalizado na UI,
mas `syncDerivedPersonalTransferV2` já materializava repasse pessoal e as
4 reservas normalmente a partir do valor bruto menos imposto (tratando RRT
ausente como R$0 implícito).

Correção:
- `syncDerivedPersonalTransferV2` (index.html) agora checa
  `projetoNecessitaConfiguracaoRRT(projeto)` logo depois de confirmar que o
  repasse ainda não foi efetivamente realizado, e ANTES de chamar
  `freezeRecebivelProvisionadoV2` — enquanto verdadeiro, nenhuma provisão é
  congelada, nenhum repasse é criado, nenhuma reserva é aplicada. O
  recebível pode continuar `'recebido'` normalmente (o dinheiro entra no
  caixa operacional via `calcSaldoOfficeConta`, que lê `recebivel.estado`
  diretamente e não depende disso).
- `renderOfficeProjetosTab` deixa de mostrar os números de repasse/reservas
  enquanto bloqueado — mostra só valor do projeto + RRTs configuradas (ou
  "—") + a mensagem exata **"Distribuição bloqueada: configure a RRT do
  projeto."**
- `addProjetoRRT` deixou de criar a RRT imediatamente com `valor:0` quando
  `off.rrtValorPadrao` é `null` — agora abre um modal (`confirmarAddProjetoRRT`)
  pedindo o valor; campo em branco é rejeitado com toast; um valor `0`
  digitado e confirmado explicitamente é aceito normalmente.
- Configurar a RRT depois (via `confirmarAddProjetoRRT`/`saveProjetoRRT`)
  chama `resyncProjectV2`, que roda `syncDerivedPersonalTransfer` de novo
  para todos os recebíveis do projeto — o(s) já `'recebido'`(s) então
  congelam, provisionam e materializam a distribuição corretamente,
  idempotente (recálculos seguintes não duplicam nada).

### P2 — reversão de recebível materializado deixava reservas fantasmas

Antes: nada impedia editar um recebível v2 já `'recebido'` (com repasse e
reservas já criados) de volta para `'previsto'`/`'cancelado'` — o repasse
era cancelado, mas as movimentações de reserva já aplicadas permaneciam,
quebrando a invariante caixa+reservas = patrimônio.

Correção:
- Nova função pura `recebivelV2Materializado(recebivel)` — verdadeiro se o
  recebível já tem `provisionadoRealizadoCent`/`distribuivelRealizadoCent`
  congelados, OU já existe movimentação de reserva
  (`movimentacoesReservas.origemRecebivelId`), OU já existe repasse
  (`office.repasses.officeTransferId`), OU já existe receita pessoal
  vinculada (`state.receitas.officeTransferId`).
- `openEditOfficeRecebivel` desabilita `estado`/`valor`/`contaDestino`/
  `dataRecebimento` na UI quando materializado, e mostra a mensagem de
  aviso.
- `saveEditOfficeRecebivel` — a proteção **decisiva** fica aqui, não só na
  UI: se o recebível é v2 e está materializado, qualquer tentativa de mudar
  `estado`, `valor`, `contaDestino` ou `dataRecebimento` é rejeitada com a
  mensagem exata **"Este recebimento já gerou distribuição financeira e não
  pode voltar para previsto ou cancelado. Registre um estorno financeiro
  explícito."**, mesmo chamando a função diretamente com o `disabled`
  contornado. `descricao` e `dataPrevista` continuam editáveis (não afetam
  nenhum cálculo nem movimentação já materializada).
- Não foi implementado um motor de estorno — fora de escopo desta correção,
  por instrução explícita.

### P3 — arredondamento por recebível divergia da divisão do projeto inteiro

Antes: `distribuirReceitaLiquidaCent` (maior resto) era aplicado
isoladamente sobre o distribuível de CADA recebível — cada um fechava
exatamente consigo mesmo, mas a soma de vários recebíveis do mesmo projeto
podia divergir por 1 centavo do que a divisão do projeto inteiro daria
(ex.: 3 parcelas de R$333,33/333,33/333,34 resultavam em repasse R$650,01 e
capital de giro R$69,99, em vez de R$650,00/R$70,00).

Correção — reconciliação cumulativa em `freezeRecebivelProvisionadoV2`:
- Duas novas funções puras: `getProjetoDistribuivelRealizadoCent` (soma o
  distribuível já congelado dos OUTROS recebíveis do projeto) e
  `getProjetoAlocadoPorDestinoCent` (soma, por destino, o que já foi
  EFETIVAMENTE alocado — repasse já criado + reserva já aplicada — pelos
  outros recebíveis).
- Ao congelar um recebível: calcula `distribuirReceitaLiquidaCent` sobre o
  distribuível ACUMULADO do projeto (já congelado + este), e atribui a este
  recebível só a diferença em relação ao que já foi alocado de fato. O
  resultado (`porDestinoRealizadoCent`) é congelado junto com
  `provisionadoRealizadoCent`/`distribuivelRealizadoCent` — nunca
  recalculado depois (protegido pela mesma imutabilidade do achado P2).
- `syncDerivedPersonalTransferV2` passou a ler `porDestinoRealizadoCent`
  (congelado) em vez de recalcular o maior resto a cada sincronização —
  evita que um resync (disparado por RRT/imposto mudando em OUTRO
  recebível do mesmo projeto) produza um split diferente do que já foi
  materializado nas reservas (que são imutáveis desde a criação).
- Matematicamente: como o cumulativo final (depois de todos os recebíveis
  do projeto realizados) é sempre igual ao distribuível total do projeto,
  independente da ordem em que cada recebível foi processado, os TOTAIS
  finais por destino nunca dependem da ordem de realização — só valores
  intermediários (por recebível individual) podem variar conforme a ordem,
  nunca o total agregado do projeto.

## Testes

16 casos novos em `gate6-office-net-distribution.test.mjs` (34 no total),
cobrindo os 18 itens pedidos:

```
node tests/financial-engine/gate6-office-net-distribution.test.mjs
→ TOTAL=34 PASS=34 FAIL=0

node tests/financial-engine/run-all.mjs
→ FINFLOW FINANCIAL-ENGINE SUITE: TOTAL_PASS=526 TOTAL_FAIL=0

node tests/financial-engine/compare-real-backup.mjs "<backup real>" 545fdd4
→ REAL_BACKUP_DIFFERENCES: 0 (14 meses históricos, 08/2025 a 09/2026)
```

O backup real usado (`finflow_backup_2026-09-22 (1).json`, do ambiente do
usuário) nunca foi aberto para escrita — o script copia pra uma pasta
temporária do sistema antes de ler, como sempre. Resultado numérico real
salvo só em `%TEMP%`, nunca commitado.

## Verificações finais

- `git status` limpo antes de iniciar; HEAD confirmado exatamente
  `998360582b89fa0f139247d02166124a3e15da65` antes de qualquer edição.
- `git diff` revisado manualmente após a correção: os 3 achados foram
  endereçados especificamente (nenhum redesign, nenhuma alteração de
  percentual, nenhuma alteração de projeto legado — `projeto-legado-motor-antigo-intocado`
  confirma que `regraDistribuicao==='legacy'` continua usando
  `calculateOfficeDistribution` sobre o valor bruto, sem nenhuma dedução de
  imposto/RRT, exatamente como antes desta entrega e da anterior).
- Nenhum checkout, merge, rebase ou push na `main`.
- Working tree limpa ao final (só commits nesta branch).

## Riscos / pontos pendentes

1. A reconciliação cumulativa (P3) depende de reconstruir "o que já foi
   alocado" a partir dos registros já criados (`repasses`/
   `movimentacoesReservas`) — isso é robusto e testado (inclusive com
   realização fora de ordem e 37 recebíveis pequenos), mas pressupõe que
   nenhum outro código do app crie/edite `movimentacoesReservas` com
   `origemRecebivelId` fora do fluxo `syncOfficeReserveDistributionV2`
   (não há tal código hoje).
2. `recebivelV2Materializado` não cobre o caso (já apontado como ponto de
   atenção na entrega anterior, não resolvido nesta correção porque é
   diferente do achado P2 pedido) de um recebível que nunca chegou a gerar
   repasse/reserva porque a RRT não estava configurada, mas já tinha
   `estado==='recebido'` — esse caso continua livre pra reverter (não há
   nada "materializado" ainda), o que é o comportamento correto:
   reverter um recebível cuja distribuição está bloqueada por falta de RRT
   não desfaz nenhuma movimentação real, porque nenhuma foi criada.
3. Não foi implementado um motor de estorno explícito — por instrução
   deliberada desta correção. Um recebível materializado por engano
   permanece assim até uma funcionalidade futura de estorno.

## Instruções de reprodução

```bash
cd tests/financial-engine
node gate6-office-net-distribution.test.mjs
node run-all.mjs
node compare-real-backup.mjs "C:\Users\97992925220\Downloads\finflow_backup_2026-09-22 (1).json" 545fdd4
```

Nenhum dado financeiro real foi versionado — toda a fixação de teste
permanente é sintética; a comparação com o backup real roda à parte e seu
resultado numérico fica só em arquivo temporário local.

---

CORREÇÕES CLAUDE CONCLUÍDAS
REAUDITORIA CODEX PENDENTE
