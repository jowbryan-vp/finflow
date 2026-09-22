# Handoff — distribuição líquida do Caixa do Escritório (imposto + RRT), 22/09/2026

Fluxo: Claude Code implementa → Codex audita. Este documento é só a entrega
da implementação; não é auditoria nem aprovação.

## Branch e commits

- Branch: `fix/office-net-distribution-rrt`.
- Commit-base: `545fdd440596820b76676ccc0cb4dca4871683cf` (entrega aprovada
  `gate/5-account-identification`, auditoria Codex PASS em
  `docs/audits/ACCOUNT-IDENTIFICATION-FINAL-REVIEW.md`).
- Commit-final: `c22fcf1` (inclui este handoff).

## Arquivos alterados

- `index.html` — motor de cálculo v2, CRUD de RRT, distribuição/repasse por
  recebível, reservas de sistema, UI do projeto e da configuração,
  migração de estado.
- `tests/financial-engine/gate6-office-net-distribution.test.mjs` — novo,
  18 casos.
- `tests/financial-engine/run-all.mjs` — registra o novo arquivo.
- `docs/gates/GATE-6-OFFICE-NET-DISTRIBUTION.md` — regra financeira
  documentada.

Nenhum outro arquivo foi tocado. Nenhum push, merge ou alteração em `main`.

## Regra implementada

Ver `docs/gates/GATE-6-OFFICE-NET-DISTRIBUTION.md` para o detalhamento
completo. Resumo:

- `receitaLiquidaDistribuivel = receitaBruta − impostoProvisionado − ΣRRT`,
  dividida só depois em 65/15/10/7/3% (repasse pessoal / operação / reserva
  de crescimento / capital de giro / marketing), com soma sempre exata
  (método do maior resto, centavos inteiros).
- RRT com identidade própria (`tipo`/`valor`/`status`/`numero`/datas), até 2
  por projeto, nunca duplicada, nunca automática.
- Recebimentos parciais: provisão de imposto+RRT é prioritária sobre
  entradas realizadas (regime "waterfall", congelado por recebível
  realizado, nunca recalculado retroativamente).
- Operação/crescimento/capital de giro/marketing viram 4 reservas
  empresariais de sistema, compartilhadas entre projetos, aplicadas só
  quando o recebível é caixa real — nunca despesa, nunca receita pessoal.
- Repasse pessoal continua com o mesmo mecanismo previsto→recebido já
  existente (idempotente por `officeTransferId`).

## Decisões de migração

- `projeto.regraDistribuicao` decide o motor: `'legacy'` (regra antiga,
  intocada) para todo projeto com pelo menos um recebível já `'recebido'`
  antes desta entrega; `'v2'` (regra nova) para todo projeto novo e para
  projeto antigo ainda inteiramente `'previsto'`.
- Projeto `'v2'` sem RRT registrada é sinalizado como "RRT não configurada"
  na UI — nunca um valor inventado.
- `off.impostoPercentual` (padrão 5%) e `off.rrtValorPadrao` (padrão `null`,
  nunca inventado) são novos campos de `state.office`, adicionados de forma
  idempotente em `migrateState()`.
- Nenhum projeto, recebível, repasse, despesa, conta ou reserva existente
  foi apagado, reescrito ou reinterpretado.

## Decisão de design que merece revisão adicional (não é um FAIL, é um ponto de atenção)

O regime de provisão prioritária ("waterfall") é implementado de forma
**append-only por ordem de realização** (a ordem em que o usuário realmente
marca cada recebível como recebido), não por reordenação de
`dataRecebimento`. Isso é intencional (evita reescrever histórico já
congelado se um recebível "atrasado" for realizado fora de ordem depois de
outro já processado), mas significa que, num cenário artificial em que o
usuário marca um recebível como recebido, depois reverte para `'previsto'`
manualmente e depois realiza outros — o valor congelado do primeiro
continua contando para o total já provisionado (não há um caminho de
"desfazer provisão" no app hoje, o mesmo vale pra outros fluxos de
realização já existentes no Gate 3). Não coberto por teste específico; é um
caso extremo de uso indevido, não um fluxo normal.

A soma dos 5 destinos por recebível individual sempre bate exatamente com o
`distribuível` daquele recebível (garantido). A soma agregada de vários
recebíveis do mesmo projeto, cada um arredondado independentemente,
**tende** a bater com o cálculo de projeto inteiro (confirmado nos dois
cenários obrigatórios do escopo e no teste de recebimento parcial), mas não
há uma prova geral de que nunca diverge por 1 centavo em casos com muitos
recebíveis pequenos — apontado para revisão, não é um requisito testado
como falho.

## Testes executados

```
node tests/financial-engine/gate6-office-net-distribution.test.mjs
→ TOTAL=18 PASS=18 FAIL=0

node tests/financial-engine/run-all.mjs
→ FINFLOW FINANCIAL-ENGINE SUITE: TOTAL_PASS=510 TOTAL_FAIL=0
```

Cobertura dos 20 itens obrigatórios do escopo (RRT única de Projeto/
Execução, duas RRTs, valores diferentes, edição sem duplicação, valor
padrão não retroativo, imposto antes da divisão, soma exata, arredondamento,
previsto sem impacto no caixa, recebimento parcial, provisão prioritária,
repasse previsto sem entrada pessoal real, repasse realizado com vínculo,
reservas separadas, backup antigo, export/import, migração idempotente,
ausência de duplicação, preservação de histórico) no novo arquivo de teste;
os dois cenários numéricos exatos do escopo (`CEN01`, `CEN02`) batem
centavo a centavo com os valores fornecidos.

## Verificações adicionais

- `git status` limpo antes de iniciar; branch criada a partir de `545fdd4`
  (mesmo HEAD verificado como limpo/aprovado nesta sessão).
- `git diff` revisado manualmente: sem duplicação de valores, sem mistura
  entre previsto/realizado (repasse e reserva só existem depois de
  `estado==='recebido'`), sem alteração retroativa (freeze +
  `officeTransferId` + imutabilidade de movimentação já criada), cálculo
  sempre sobre a receita líquida (nunca o valor bruto do recebível/projeto),
  RRT nunca duplicada (limite de 2, nunca dois do mesmo tipo), soma exata
  garantida por construção (método do maior resto), entrada pessoal nunca
  duplicada (mesmo `officeTransferId` idempotente da regra legada), reservas
  nunca tratadas como despesa (mecanismo de aplicação em reserva, não
  `state.office.despesas`).
- `compare-real-backup.mjs` (comparação com backup real do usuário) **não
  foi executado** — não há backup real disponível neste ambiente; nenhuma
  mudança nesta entrega altera a estrutura de dados de projetos/recebíveis
  já existentes (só adiciona campos novos opcionais), então o risco de
  regressão nesse script é baixo, mas fica como pendência de verificação
  para quando houver acesso ao backup real.

## Riscos / pontos pendentes

1. Ver seção "Decisão de design que merece revisão adicional" acima
   (ordem de realização vs. `dataRecebimento`, soma agregada de muitos
   recebíveis pequenos).
2. `off.rrtValorPadrao` fica `null` até o usuário configurar — um projeto
   novo sem essa configuração nasce com RRT valor `0` editável (não
   bloqueia o cadastro), que é diferente de "RRT não configurada" (nenhuma
   RRT registrada). Isso é intencional (RRT é opcional no cadastro), mas
   vale confirmar que a UI deixa claro que `0` é um valor real digitado,
   não um placeholder.
3. Não há caminho de upgrade manual de um projeto `'legacy'` para `'v2'`
   nesta entrega — só a migração automática no carregamento, restrita a
   projetos ainda inteiramente previstos. Fora de escopo por decisão
   deliberada (evitar reinterpretar histórico), mas mencionado caso o
   usuário queira esse caminho no futuro.

## Instruções de reprodução

```bash
cd tests/financial-engine
node gate6-office-net-distribution.test.mjs
node run-all.mjs
```

Nenhum dado financeiro real, agência real, número real, token ou credencial
foi usado ou versionado — toda a fixação de teste é sintética.

---

IMPLEMENTAÇÃO CLAUDE CONCLUÍDA
AUDITORIA CODEX PENDENTE
