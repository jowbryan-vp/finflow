# Handoff — correção do desempate assimétrico no rateio Sainte-Laguë (terceira rodada), 22/09/2026

Fluxo: Claude corrige → Codex reaudita. Este documento é só a entrega da
correção; não é auditoria nem aprovação.

## HEAD inicial e final

- Branch: `fix/office-net-distribution-rrt`.
- HEAD inicial (confirmado antes de qualquer edição): `9129efa`
  (`9129efa22a8dd1fe634a534288940e0ae2668692`).
- Commit funcional desta correção: `a61fb9d`.
- HEAD final: ver `git log -1` nesta branch (inclui este handoff).

Todas as correções aprovadas nas rodadas anteriores foram **preservadas
sem alteração**: bloqueio de distribuição sem RRT configurada, exigência
de valor explícito quando `rrtValorPadrao` é `null`, imutabilidade de
recebível v2 materializado, reconciliação cumulativa por destino
(`freezeRecebivelProvisionadoV2`), motor legado, e todos os cenários
numéricos já aprovados. Só a implementação interna de
`distribuirReceitaLiquidaCent` foi tocada.

## Causa-raiz precisa do desempate

A implementação de Sainte-Laguë introduzida na correção anterior (commit
`9f90a88`) calculava uma **estimativa inicial por arredondamento**
(`round(total×percentual/100)`, via `floor((2×total×percentual+100)/200)`)
pra cada destino. Arredondamento pode tanto **sub-estimar** quanto
**sobre-estimar** o total verdadeiro — diferente de `floor`, que só
sub-estima ou acerta. Por isso a implementação precisava de DOIS caminhos
de ajuste de resíduo:

- `prioridadeGanhar()` — concede centavos quando a estimativa ficou abaixo
  do total, desempatando por comparação **estrita** (`>`), mantendo o
  PRIMEIRO destino da ordem fixa em caso de empate.
- `prioridadePerder()` — remove centavos quando a estimativa ficou acima
  do total, desempatando também por comparação **estrita** (`<`), o que
  na prática TAMBÉM mantinha o PRIMEIRO destino da ordem fixa em caso de
  empate — a MESMA direção de `prioridadeGanhar`, não a direção invertida
  que a simetria matemática do método exige.

Essa assimetria quebrava a garantia de monotonicidade em qualquer
transição de total onde a rodada de remoção encontrasse um empate: como a
remoção "poupava" o mesmo destino que a concessão privilegiaria, um
destino podia perder um centavo na transição `N-1→N` mesmo tendo ganho (ou
mantido) prioridade alta.

## Reprodução: transição 49 → 50 (antes e depois)

Pesos 65/15/10/7/3, método da rodada anterior (arredondamento +
`prioridadeGanhar`/`prioridadePerder` com desempates assimétricos):

```
Total 49: estimativa arredondada = 32,7,5,3,1 (soma 48) → residual +1,
          empate a 1,0 entre repasse/operação/capitalGiro/marketing;
          prioridadeGanhar (comparação estrita ">") mantém o primeiro
          candidato encontrado na iteração — repasse — como "melhor"
          → repasse ganha o centavo: 32→33
          resultado: repasse=33 operacao=7 crescimento=5 capitalGiro=3 marketing=1 (soma 49)

Total 50: estimativa arredondada = 33,8,5,4,2 (soma 52) → residual -2,
          precisa remover 2. prioridadePerder (comparação estrita "<")
          também mantém o primeiro candidato encontrado como "pior" — na
          1ª rodada, repasse (prioridade 65/65=1,0) nunca é substituído
          pelos outros candidatos empatados (a comparação estrita falha
          em todo empate), então repasse é quem perde: 33→32. Na 2ª
          rodada, com repasse já reduzido (prioridade sobe pra 65/63≈1,03,
          tirando-o da disputa), o mesmo padrão se repete entre os
          candidatos remanescentes empatados e operação (prioridade
          15/15=1,0) é quem perde: 8→7.
          resultado: repasse=32 operacao=7 crescimento=5 capitalGiro=4 marketing=2 (soma 50)
```

Ou seja: a mesma regra "mantém o primeiro candidato empatado" usada por
`prioridadeGanhar` pra decidir quem GANHA também decidia, em
`prioridadePerder`, quem PERDE — as duas famílias de destinos
com maior prioridade (repasse e operação, ambos exatamente empatados em
1,0 com outros) acabavam sendo justamente os que perdiam centavos ao
crescer o total, em vez de serem protegidos por já estarem "na frente".

Diferença (50−49): repasse **−1**, operação 0, crescimento 0, capitalGiro
+1, marketing +1 — **repasse caiu de 33 pra 32** ao crescer o total,
violando monotonicidade. Confirmado por execução real antes da correção
(reproduzido no protótipo de desenvolvimento, ver seção "Evidência" abaixo).

**Depois da correção** (piso + única função de desempate,
`prioridadeGanhar` apenas):

```
Total 49: floor = 31,7,4,3,1 (soma 46) → +3, sempre por prioridadeGanhar
          → repasse=33 operacao=7 crescimento=5 capitalGiro=3 marketing=1 (soma 49)

Total 50: floor = 32,7,5,3,1 (soma 48) → +2, sempre por prioridadeGanhar
          → repasse=33 operacao=8 crescimento=5 capitalGiro=3 marketing=1 (soma 50)
```

Diferença (50−49): repasse 0, operação **+1**, crescimento 0, capitalGiro
0, marketing 0 — soma do incremento = 1, exatamente um destino cresce,
nenhum diminui. Confirmado pelo teste permanente
`alabama3-49-depois-1-centavo` (branch atual, PASS).

## Explicação da correção

A estimativa inicial passou a ser por **piso** (`floor(total×percentual/100)`,
sem arredondar) em vez de arredondamento. Consequência algébrica pura (não
depende de nenhuma propriedade do método de rateio): como `floor(x) <= x`
para todo `x`, a soma das 5 estimativas de piso **nunca excede** o total
— logo o resíduo (`total − soma`) é **sempre ≥ 0**. Nunca é preciso
remover nada.

Isso elimina `prioridadePerder()` **inteiramente** — não uma correção do
seu desempate, mas a remoção completa dessa função e desse caminho de
código. Sobra uma única função de desempate (`prioridadeGanhar`), usada da
mesma forma do início ao fim da execução: sempre concede o próximo
centavo a quem tem a maior prioridade `percentual/(2×assentos+1)`, com
empate resolvido pela ordem fixa de `OFFICE_DISTRIBUICAO_V2`.

## Regra de desempate escolhida

Quando dois ou mais destinos empatam em prioridade `percentual/(2×assentos+1)`
pro próximo centavo a conceder, o centavo vai para o destino que aparece
**primeiro** na ordem fixa `OFFICE_DISTRIBUICAO_V2` (repasse_pessoal,
operacao, reserva_crescimento, capital_giro, marketing) — implementado por
comparação **estrita** (`>`): o primeiro candidato encontrado só é
substituído por outro com prioridade **estritamente maior**, nunca igual.
Essa é agora a **única** regra de desempate em todo o algoritmo — não há
mais uma segunda regra "inversa" que possa discordar dela.

## Por que isso é a construção correta (não uma aproximação)

A definição literal do método Sainte-Laguë é: conceder N assentos (aqui,
centavos) um de cada vez, cada um sempre para quem tem a maior prioridade
`percentual/(2×assentos_já_dados+1)` no momento. Começar de `floor(total×
percentual/100)` e completar o resíduo (sempre ≥ 0) pela mesma regra de
prioridade é **matematicamente idêntico** a rodar essa construção literal
do zero até N — porque cada centavo do piso é garantidamente um dos
centavos que a construção literal teria dado àquele destino em algum ponto
do caminho (o piso nunca "inventa" um centavo que o destino não mereceria).
Não há aproximação, estimativa heurística ou atalho não verificado: é a
definição do método, calculada de forma eficiente (sem iterar centavo a
centavo, o que seria O(total) e inviável pra contratos grandes).

## Evidência da varredura exaustiva

Antes de integrar em `index.html`, o algoritmo foi prototipado num script
standalone (`tests/financial-engine/_prototype_apportion.mjs`, removido
depois de validado — não faz parte da suíte permanente) e testado com uma
varredura de `n=1` até `n=2.000.000`, verificando a cada transição:

```
soma(alocação(n)) == n
alocação(n)[destino] >= alocação(n-1)[destino] para todo destino
soma(alocação(n) - alocação(n-1)) == 1
quantidade de destinos que cresceram == 1
quantidade de destinos que diminuíram == 0
```

Resultado do protótipo: **monotônico e exato de 1 a 2.000.000**, sem
nenhuma falha. Os mesmos valores de referência (R$3.000, R$0,15, R$0,49/
R$0,50) foram conferidos manualmente e batem exatamente com os já
aprovados.

Essa mesma varredura agora é um **teste permanente** da suíte —
`sainte-lague-monotonico-varredura-exaustiva`
(`gate6-office-net-distribution.test.mjs`) — chamando
`distribuirReceitaLiquidaCent` diretamente dentro do browser (a função de
produção real, não uma cópia), rodando inteiramente num único
`page.evaluate` (sem overhead de IPC por iteração). **PASS** na branch
atual.

## Invariantes verificadas

1. `distribuirReceitaLiquidaCent(n)[destino] >= distribuirReceitaLiquidaCent(n-1)[destino]`
   para todos os destinos e todo `n>0` — verificado pela varredura
   exaustiva (1 a 2.000.000).
2. Soma dos 5 destinos sempre exatamente `n` — mesma varredura.
3. Nenhum destino recebe valor negativo pra entrada não-negativa —
   estrutural: `floor` e `prioridadeGanhar` só produzem incrementos ≥0 a
   partir de uma base ≥0.
4. Incremento total entre `n-1` e `n` é exatamente 1 centavo — mesma
   varredura (`deltaSoma===1`).
5. Exatamente um destino cresce por transição unitária, nenhum diminui —
   mesma varredura (`cresceram===1`, `diminuiram===0`).
6. Desempate determinístico e documentado — comentário de
   `distribuirReceitaLiquidaCent` em `index.html`, e nesta seção.
7. Reconciliação cumulativa nunca produz diferença negativa — testes
   `alabama-*`/`alabama3-*` (`movsNegativas` sempre `false`).
8. Soma efetivamente materializada nunca supera nem fica abaixo do
   distribuível — testes `alabama3-49-depois-1-centavo` e
   `alabama3-1-centavo-depois-49` (`somaTotaisCent===50`,
   `totalDistribuivelCent===50`).
9. Resultado final depende só do total acumulado, não da ordem — teste
   `alabama3-totais-49-independem-da-ordem` (totais idênticos comparando
   R$0,49→R$0,01 vs R$0,01→R$0,49).
10. Cenários financeiros já aprovados permanecem numericamente idênticos
    — todos os 40 testes já existentes (incluindo `CEN01`/`CEN02` do Gate
    6 original e os `alabama-*` da rodada anterior) continuam passando
    sem nenhuma alteração de expectativa.

## Arquivos alterados

- `index.html` — reescreve o corpo de `distribuirReceitaLiquidaCent`
  (estimativa por piso, elimina `prioridadePerder`); atualiza o comentário
  explicando a causa-raiz da terceira rodada e a construção correta.
  Nenhuma outra função tocada.
- `tests/financial-engine/gate6-office-net-distribution.test.mjs` — 5
  testes novos (`alabama3-*` e a varredura exaustiva).
- `docs/gates/GATE-6-OFFICE-NET-DISTRIBUTION.md` — nova seção documentando
  a causa-raiz, a correção e a evidência.

## Testes adicionados

- `alabama3-49-depois-1-centavo` — reprodução mínima exata do achado.
- `alabama3-1-centavo-depois-49` — mesma reprodução, ordem invertida.
- `alabama3-totais-49-independem-da-ordem` — compara diretamente os
  totais finais das duas ordens.
- `alabama3-resync-nao-duplica` — resync repetido (3x) sobre recebíveis já
  materializados não duplica repasse nem reserva.
- `sainte-lague-monotonico-varredura-exaustiva` — varredura de 1 a
  2.000.000 de centavos, chamando a função de produção diretamente.

Regressões anteriores mantidas sem alteração de expectativa: R$0,14+R$0,01
(duas ordens), R$100,14+R$0,01 (duas ordens), 41 parcelas irregulares,
cenários originais de R$3.000, bloqueio sem RRT, imutabilidade do
recebível materializado, projetos legados.

## Comandos e resultados

```
node tests/financial-engine/gate6-office-net-distribution.test.mjs
→ TOTAL=45 PASS=45 FAIL=0

node tests/financial-engine/run-all.mjs
→ FINFLOW FINANCIAL-ENGINE SUITE: TOTAL_PASS=537 TOTAL_FAIL=0

node tests/financial-engine/compare-real-backup.mjs "C:\Users\97992925220\Downloads\finflow_backup_2026-09-22 (1).json" 545fdd4
→ REAL_BACKUP_DIFFERENCES: 0 (14 meses históricos, 08/2025 a 09/2026)

git diff --check
→ limpo (exit 0)
```

O backup real nunca foi aberto para escrita (o script copia pra uma pasta
temporária do sistema antes de ler). Resultado numérico real salvo só em
`%TEMP%`, nunca commitado.

## Verificações finais

- `git status`: working tree limpa antes de iniciar e ao final (só
  commits nesta branch).
- HEAD confirmado exatamente `9129efa` antes de qualquer edição.
- `git diff` revisado: mudança isolada ao corpo de
  `distribuirReceitaLiquidaCent` (mesma assinatura/contrato) e à
  documentação — nenhuma alteração em `freezeRecebivelProvisionadoV2`,
  `getProjetoAlocadoPorDestinoCent`, `getProjetoDistribuivelRealizadoCent`,
  `syncDerivedPersonalTransferV2`, `syncOfficeReserveDistributionV2`, no
  bloqueio de RRT ausente ou na proteção de edição do recebível
  materializado.
- Nenhum checkout, merge, rebase ou push na `main`. `main` permanece
  intocada.

---

CORREÇÃO CLAUDE CONCLUÍDA
REAUDITORIA CODEX PENDENTE
