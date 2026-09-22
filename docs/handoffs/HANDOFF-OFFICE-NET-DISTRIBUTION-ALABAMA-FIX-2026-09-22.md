# Handoff — correção do paradoxo de Alabama no rateio cumulativo do Gate 6, 22/09/2026

Fluxo: Claude corrige → Codex reaudita. Este documento é só a entrega da
correção; não é auditoria nem aprovação.

## HEAD inicial e final

- Branch: `fix/office-net-distribution-rrt`.
- HEAD inicial (confirmado antes de qualquer edição): `d2018ce`
  (`d2018ce5ad9f2fb74027a91aa04b3e71ed451d0a`).
- Commit funcional desta correção: `9f90a88`.
- HEAD final: ver `git log -1` nesta branch (inclui este handoff).

As correções aprovadas na reauditoria anterior (bloqueio de distribuição
sem RRT configurada, e imutabilidade de recebível v2 materializado) foram
**preservadas sem alteração** — só o algoritmo de reconciliação cumulativa
foi trocado.

## Causa-raiz

A reconciliação cumulativa por destino (introduzida na correção anterior,
commit `8716995`, pra resolver o achado "arredondamento por parcela desvia
da divisão do projeto") recalculava `distribuirReceitaLiquidaCent` — que
usava o método do **maior resto** (largest remainder / Hamilton) — sobre o
distribuível ACUMULADO do projeto a cada novo recebível, e atribuía a esse
recebível a diferença entre o novo total e o que os recebíveis anteriores
já tinham materializado de fato (repasse criado + reserva aplicada).

O problema: **o maior resto não é monotônico**. Ao crescer o total a
distribuir, a alocação de um destino específico pode *diminuir* — esse
fenômeno é conhecido na teoria de rateio proporcional como **paradoxo de
Alabama** (o mesmo problema que apareceu historicamente na apuração de
cadeiras do Congresso americano em 1880, quando aumentar o tamanho da
Câmara fazia o Alabama perder uma cadeira). Quando isso acontecia aqui, o
recebível seguinte calculava um ajuste NEGATIVO pra aquele destino — mas o
recebível anterior já tinha materializado sua reserva (imutável, por
desenho, pra proteger contra a reversão do achado P2). O ajuste negativo
era então descartado silenciosamente por
`syncOfficeReserveDistributionV2`:

```js
if(valor<=0) return;
```

Isso fazia a soma efetivamente distribuída (repasse + 4 reservas)
**superar** o dinheiro realmente recebido — dinheiro fantasma.

## Explicação matemática do problema (reprodução mínima)

Projeto com imposto 0%, RRT explicitamente R$0,00, pesos fixos 65/15/10/7/3%.

Maior resto pra total=14 centavos: floor(14×65/100)=9, floor(14×15/100)=2,
floor(14×10/100)=1, floor(14×7/100)=0, floor(14×3/100)=0 → soma=12,
residual=2 centavos, atribuídos por maior resto fracionário a **capital de
giro** (resto 0,98) e **marketing** (resto 0,42) → resultado congelado:
repasse=9, operação=2, crescimento=1, capital de giro=1, **marketing=1**.

Maior resto pra total=15 centavos: floor=9,2,1,1,0 (soma=13, residual=2),
atribuídos a **repasse** (resto 0,75) e **crescimento** (resto 0,5) →
resultado="correto" pra R$0,15: repasse=10, operação=2, crescimento=2,
capital de giro=1, **marketing=0**.

Diferença (15−14) por destino: repasse+1, operação+0, crescimento+1,
capital de giro+0, **marketing−1**. O ajuste de marketing é **negativo**:
o segundo recebível "deveria" tirar 1 centavo de marketing, mas esse
centavo já tinha virado uma movimentação de reserva imutável no primeiro
recebível. O código antigo simplesmente não aplicava esse ajuste (`valor<=0
→ return`), então marketing ficou com 1 centavo que, pela divisão correta
do total (R$0,15), não deveria existir — soma materializada:
9+2+1+1+**1**(marketing nunca corrigido)+1(repasse)+0+1+0 = **16
centavos**, 1 a mais que o dinheiro realmente recebido.

## Algoritmo escolhido: Sainte-Laguë (Webster, "maiores médias")

Métodos de **divisor** (Jefferson/D'Hondt, Sainte-Laguë/Webster,
Huntington-Hill, Adams) são uma família de métodos de rateio proporcional
estruturalmente diferente do maior resto: em vez de arredondar e distribuir
sobras, eles constroem a alocação **assento a assento** (aqui, centavo a
centavo), sempre dando o próximo centavo a quem "mais merece" segundo uma
prioridade — nunca recalculando do zero e subtraindo. Essa construção
garante, por definição, a propriedade de **monotonicidade populacional**:
aumentar o total nunca reduz a alocação de nenhum destino, porque nenhum
centavo já dado é tirado de volta pra dar a outro.

Dentro da família de divisores, `distribuirReceitaLiquidaCent` passou a
usar especificamente **Sainte-Laguë** (não Jefferson/D'Hondt) porque, ao
testar manualmente contra os valores de referência já aprovados neste
gate, Sainte-Laguë reproduz **exatamente** os mesmos números que o maior
resto já produzia:

- Cenário 1 do Gate 6 original (R$3.000, imposto 5%, RRT R$130,64):
  repasse R$1.767,58 / operação R$407,90 / crescimento R$271,94 / capital
  de giro R$190,36 / marketing R$81,58 — idêntico.
- Cenário 2 (duas RRTs de R$130,64): idêntico.
- Caso de referência desta correção (R$0,15): repasse 10 / operação 2 /
  crescimento 2 / capital de giro 1 / marketing 0 centavos — idêntico ao
  que o achado descreveu como "correto".

Jefferson/D'Hondt foi descartado por favorecer desproporcionalmente o
maior peso (repasse 65%) — não bateria com essas referências (testado
manualmente: daria repasse=11 em vez de 10 pro caso de R$0,15).

## Invariantes garantidas

1. **Nenhuma alocação negativa** — Sainte-Laguë só adiciona centavos,
   nunca subtrai de um destino já alocado; a diferença cumulativa (novo
   total menos já materializado) é sempre ≥ 0 em cada destino. Testado
   diretamente (`movsNegativas` em todos os novos testes).
2. **Soma do recebível == seu distribuível** — cada recebível recebe
   exatamente a diferença entre a alocação acumulada nova e a antiga, que
   por construção soma ao seu próprio distribuível (verificado em todos os
   testes novos e nos já existentes).
3. **Soma acumulada materializada == distribuível acumulado do projeto** —
   consequência direta de (2) aplicado recebível a recebível.
4. **Coerência com os percentuais 65/15/10/7/3** — a estimativa inicial
   (`round(total×percentual/100)`) já é proporcional; o ajuste do resíduo
   (no máximo ±2 centavos pra 5 destinos) segue a mesma prioridade de
   maiores médias, documentada no código.
5. **Total final independe da ordem de realização** — propriedade
   estrutural do método de divisor: o estado final depois de N centavos
   alocados só depende de N, nunca de como os centavos foram agrupados em
   lotes (recebíveis) ao longo do caminho. Testado explicitamente com as
   quatro ordens pedidas (R$0,14→R$0,01, R$0,01→R$0,14, R$100,14→R$0,01,
   R$0,01→R$100,14) e uma comparação direta dos totais finais dos dois
   últimos casos.
6. **Recebíveis já materializados permanecem imutáveis** — nenhuma mudança
   nesta correção toca `freezeRecebivelProvisionadoV2`'s guarda de
   idempotência (`if(recebivel.provisionadoRealizadoCent!==undefined...)
   return`) nem `recebivelV2Materializado`/a proteção de gravação do
   achado P2 (`saveEditOfficeRecebivel`).
7. **Sem lançamentos negativos, estornos silenciosos ou centavos
   descartados** — não há mais nenhum caminho no código em que um ajuste
   computado seja negativo (matematicamente impossível dado o método), e
   `if(valor<=0) return` em `syncOfficeReserveDistributionV2` volta a ser
   só uma guarda normal de "nada a aplicar neste destino desta vez" (0 é
   legítimo), nunca mais uma correção perdida.
8. Nenhum recurso a "limitar em zero" — o método é matematicamente
   incapaz de gerar negativo, não há `Math.max(0, ...)` escondendo nada.
9. **IDs, contas, saldos e dados legados intocados** — o motor legado
   (`calculateOfficeDistribution`/`regrasDistribuicao`) não foi tocado;
   verificado pelo teste `projeto-legado-motor-antigo-intocado` (já
   existente, ainda passa) e pela comparação com o backup real (0
   diferenças).
10. **Bloqueio de distribuição sem RRT e proteção de edição do recebível
    materializado preservados integralmente** — nenhuma linha de
    `projetoNecessitaConfiguracaoRRT`, `recebivelV2Materializado`,
    `openEditOfficeRecebivel` ou `saveEditOfficeRecebivel` foi alterada
    nesta correção; todos os testes desses achados (já existentes)
    continuam passando sem modificação.

## Arquivos alterados

- `index.html` — reescreve o corpo de `distribuirReceitaLiquidaCent`
  (método de divisor Sainte-Laguë em BigInt, substituindo o maior resto);
  atualiza os comentários de `freezeRecebivelProvisionadoV2` explicando
  por que a reconciliação cumulativa agora é segura. Nenhuma outra função
  foi tocada — mesma assinatura, mesmo contrato (`{destino: centavos}`
  somando exatamente à entrada), então nenhum call site precisou mudar.
- `tests/financial-engine/gate6-office-net-distribution.test.mjs` — 6
  testes novos (`alabama-*`), cobrindo a reprodução mínima nas duas
  ordens, o caso realista R$100,14/R$0,01 nas duas ordens, independência
  da ordem, e 41 parcelas irregulares.
- `docs/gates/GATE-6-OFFICE-NET-DISTRIBUTION.md` — nova seção documentando
  a causa-raiz, o algoritmo escolhido e por quê.

## Testes adicionados

`materializarSequencial` (helper no próprio arquivo de teste) materializa
uma sequência de recebíveis de um projeto v2 com imposto 0%/RRT R$0,00
(garante distribuível == soma dos recebíveis) e devolve, por recebível,
sua fatia por destino e a confirmação de que nada é negativo.

- `alabama-14-depois-1-centavo` — reprodução mínima exata do achado.
- `alabama-1-centavo-depois-14` — mesma reprodução, ordem invertida.
- `alabama-100-14-depois-1-centavo` — caso realista pedido.
- `alabama-1-centavo-depois-100-14` — mesmo caso, ordem invertida.
- `alabama-totais-100-14-independem-da-ordem` — compara diretamente os
  totais finais dos dois testes acima.
- `alabama-muitas-parcelas-pequenas-irregulares` — 41 parcelas de valor
  não-redondo, cenário mais propenso ao paradoxo de Alabama.

## Comandos e resultados

```
node tests/financial-engine/gate6-office-net-distribution.test.mjs
→ TOTAL=40 PASS=40 FAIL=0

node tests/financial-engine/run-all.mjs
→ FINFLOW FINANCIAL-ENGINE SUITE: TOTAL_PASS=532 TOTAL_FAIL=0

node tests/financial-engine/compare-real-backup.mjs "C:\Users\97992925220\Downloads\finflow_backup_2026-09-22 (1).json" 545fdd4
→ REAL_BACKUP_DIFFERENCES: 0 (14 meses históricos, 08/2025 a 09/2026)
```

O backup real nunca foi aberto para escrita (o script copia pra uma pasta
temporária do sistema antes de ler). Resultado numérico real salvo só em
`%TEMP%`, nunca commitado.

## Verificações finais

- `git status`: working tree limpa antes de iniciar e ao final (só
  commits nesta branch).
- HEAD confirmado exatamente `d2018ce` antes de qualquer edição.
- `git diff` revisado: a mudança é isolada ao corpo de
  `distribuirReceitaLiquidaCent` (mesma assinatura/contrato) e a
  documentação em comentário de `freezeRecebivelProvisionadoV2` — nenhum
  outro call site, nenhuma alteração em `getProjetoAlocadoPorDestinoCent`,
  `getProjetoDistribuivelRealizadoCent`, `syncDerivedPersonalTransferV2`,
  `syncOfficeReserveDistributionV2`, no bloqueio de RRT ausente ou na
  proteção de edição do recebível materializado.
- Nenhum checkout, merge, rebase ou push na `main`. `main` permanece
  intocada (confirmado por `git log`/`git branch` — nenhuma referência a
  `main` foi tocada nesta sessão).

---

CORREÇÃO CLAUDE CONCLUÍDA
REAUDITORIA CODEX PENDENTE
