# Handoff — decisão explícita de exigência de RRT por projeto, 22/09/2026

Fluxo: Claude Code implementa → Codex audita. Este documento é só a
entrega da implementação; não é auditoria nem aprovação.

## Branch e HEAD

- Branch: `feat/project-rrt-requirement`.
- Commit-base (publicado e aprovado, confirmado idêntico a `origin/main`
  antes de qualquer edição): `71edc74867d89d73832875c4ab456491f207c189`.
- Commit funcional: `939294c`.
- Commit documental: este handoff (ver `git log -1` nesta branch).

## Modelo de dados

Novo campo em `projeto` (só na regra v2, `regraDistribuicao==='v2'`):

```js
rrtRequirement: 'pending' | 'none' | 'one' | 'two'
rrtRequirementConfirmedAt: string ISO 8601 | null
rrtRequirementConfirmedBy: string | null   // nome do perfil ativo, nunca inventado
```

Projetos `legacy` nunca ganham esse campo.

## Regras dos quatro estados

Ver `docs/gates/GATE-6-1-PROJECT-RRT-REQUIREMENT.md` para o detalhamento
completo. Resumo:

- **`pending`** (padrão de todo projeto novo) — bloqueia toda
  materialização (repasse, reservas, congelamento de provisão); o
  recebimento real continua entrando no caixa operacional normalmente;
  UI mostra "Distribuição bloqueada: informe se o projeto exige RRT."
- **`none`** — exige confirmação explícita (checkbox) antes de aceitar;
  nunca aceita se já existir RRT cadastrada; deduz zero de RRT, imposto
  continua provisionado normalmente.
- **`one`** — exige exatamente 1 RRT (Projeto ou Execução, à escolha);
  rejeita uma segunda.
- **`two`** — exige exatamente 2 RRTs, uma de cada tipo; rejeita tipos
  duplicados e uma terceira RRT.

## Estratégia de migração

Idempotente (`if(!p.rrtRequirement)`), só para projetos v2, infere a
partir das RRTs já cadastradas: 0→`pending`, 1 (inclusive valor R$0,00)→
`one`, Projeto+Execução→`two`, qualquer combinação inconsistente→
`pending` (nunca inventa `none` nem RRT). Nenhum lançamento histórico é
recalculado.

## Proteções contra alteração retroativa

`setProjetoRrtRequirement` é a única função de gravação da decisão —
valida via `podeAlterarRrtRequirement` **antes** de qualquer mutação:

1. Projeto com qualquer recebível materializado
   (`projetoV2TemMaterializacao`/`recebivelV2Materializado`, mecanismo já
   existente do Gate 6): decisão imutável pra sempre, mesmo chamando a
   função diretamente (testado contornando a UI).
2. `none` com RRT(s) já cadastrada(s): rejeitado, zero mutation.
3. `one` com duas RRTs já cadastradas: rejeitado, zero mutation, nenhum
   registro apagado.

`addProjetoRRT`/`confirmarAddProjetoRRT` (a função de gravação real, não
só a que abre o modal) usam a decisão vigente para o teto de RRTs — nunca
aceitam RRT enquanto `pending`/`none`.

## Arquivos alterados

- `index.html` — modelo de dados, migração, funções puras
  (`getProjetoRrtRequirement`, `projetoRrtRequirementSatisfeita`,
  `getProjetoRrtBlockMessage`, `projetoV2TemMaterializacao`,
  `podeAlterarRrtRequirement`), função de gravação
  (`setProjetoRrtRequirement`), UI de cadastro e edição
  (`renderProjetoRrtSection` substitui `renderProjetoRrtRows`),
  `addProjetoRRT`/`confirmarAddProjetoRRT` atualizadas.
- `tests/financial-engine/gate6-1-project-rrt-requirement.test.mjs` —
  novo, 27 casos.
- `tests/financial-engine/gate6-office-net-distribution.test.mjs` —
  fixtures existentes atualizadas com `rrtRequirement` explícito (a
  materialização agora depende da decisão, não só da presença de RRT);
  nenhuma expectativa numérica alterada.
- `tests/financial-engine/run-all.mjs` — registra o novo arquivo.
- `docs/gates/GATE-6-1-PROJECT-RRT-REQUIREMENT.md` — regra documentada.

## Testes adicionados

27 casos cobrindo os 30 itens pedidos (o item 30, backup real, é validado
separadamente por `compare-real-backup.mjs`, não como teste unitário):
estado pendente (bloqueio total + caixa entra + mensagem exata), `none`
(confirmação, dedução zero, rejeição com RRT existente), `one`/`two`
(bloqueio parcial, liberação, rejeição de excesso/duplicata/terceira
RRT), valor R$0,00 só com confirmação explícita, alteração da decisão
(antes e depois da materialização, redução rejeitada sem apagar
registros), migração (pending/one/two/legacy intocado), export/import
idempotente com a decisão preservada, e confirmação de que o motor de
cálculo (rateio 49→50, cenários R$3.000, sincronizações repetidas)
permanece intocado.

## Comandos e resultados

```
node tests/financial-engine/gate6-office-net-distribution.test.mjs
→ TOTAL=45 PASS=45 FAIL=0

node tests/financial-engine/gate6-1-project-rrt-requirement.test.mjs
→ TOTAL=27 PASS=27 FAIL=0

node tests/financial-engine/run-all.mjs
→ FINFLOW FINANCIAL-ENGINE SUITE: TOTAL_PASS=564 TOTAL_FAIL=0

node tests/financial-engine/compare-real-backup.mjs "C:\Users\97992925220\Downloads\finflow_backup_2026-09-22 (1).json" 545fdd4
→ REAL_BACKUP_DIFFERENCES: 0 (14 meses históricos, 08/2025 a 09/2026)

git diff --check
→ limpo (exit 0)
```

O backup real nunca foi aberto para escrita (o script copia pra uma
pasta temporária do sistema antes de ler). Resultado numérico real salvo
só em `%TEMP%`, nunca commitado.

## Verificações finais

- `git status`: working tree limpa antes de iniciar (branch criada a
  partir do commit exato confirmado igual a `origin/main`) e ao final (só
  commits nesta branch).
- `git diff` revisado: mudança isolada ao ciclo de vida da decisão de
  RRT — fórmula financeira, rateio Sainte-Laguë, reconciliação
  cumulativa, provisão prioritária, imutabilidade de recebível
  materializado e motor legado não foram tocados (confirmado pelos
  testes que reexecutam os cenários originais do Gate 6 e pela
  comparação com o backup real).
- Nenhum checkout, merge, rebase ou push na `main`. `main` permanece
  intocada.

## Riscos / decisões ainda abertas

1. Não foi implementado um motor de estorno explícito — um projeto
   materializado por engano com uma decisão de RRT incorreta permanece
   assim até uma funcionalidade futura de estorno (mesma limitação já
   registrada nos handoffs anteriores do Gate 6, não resolvida por
   escopo explícito desta entrega também).
2. A migração de um estado antigo inconsistente (ex.: duas RRTs do mesmo
   tipo, algo que a UI nunca permite criar mas que poderia existir em
   dados editados externamente) cai em `pending` — bloqueia novas
   materializações até uma decisão segura, mas não tenta "corrigir" o
   registro de RRTs em si. Comportamento conservador, condizente com a
   filosofia de nunca inventar dado, mas vale confirmar que é o desejado.
3. `rrtRequirementConfirmedBy` usa o nome do perfil ativo (mecanismo já
   existente do app pra distinguir múltiplos perfis financeiros) — não é
   uma autenticação de usuário individual dentro de um mesmo perfil;
   reflete a mesma granularidade de identidade que o resto do FinFlow já
   usa, nada mais forte foi inventado.

---

IMPLEMENTAÇÃO CLAUDE CONCLUÍDA
AUDITORIA CODEX PENDENTE
