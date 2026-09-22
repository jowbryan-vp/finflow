# Handoff — correção dos 3 achados sobre a decisão de RRT, 22/09/2026

Fluxo: Claude corrige → Codex reaudita. Este documento é só a entrega da
correção; não é reauditoria nem aprovação.

## HEAD inicial e final

- Branch: `feat/project-rrt-requirement`.
- HEAD inicial (confirmado antes de qualquer edição): `4c211fd`
  (`4c211fd096d93902f9bf93669ad6ac5f76ab18af`).
- Commit funcional: `b7d04f6`.
- HEAD final: ver `git log -1` nesta branch (inclui este handoff).

Preservados sem alteração: estados `pending`/`none`/`one`/`two` em si
(só a validação de satisfação ficou mais rigorosa, nunca mais permissiva),
fórmula financeira, rateio Sainte-Laguë, reconciliação cumulativa,
imutabilidade financeira, projetos e dados legados, migração idempotente,
importação/exportação, e os 27 testes já aprovados na entrega anterior.

## Achados corrigidos

### P1a — confirmação de "none" não exigida pra todos os status

**Causa-raiz:** em `addOfficeProjeto`, a checagem do checkbox de
confirmação estava dentro de `if(status==='contratado'){...}`. Um projeto
cadastrado com status Potencial, Concluído ou Cancelado passava direto
por essa checagem (nunca era avaliada), então `rrtRequirement:'none'`
era gravado com `rrtRequirementConfirmedAt` preenchido — um registro de
confirmação **falso**, já que o usuário nunca marcou o checkbox.

**Correção aplicada:** a checagem foi movida pra ANTES de criar o objeto
`projeto` ou tocar em `state`, e passou a rodar incondicionalmente
(qualquer status). Uma rejeição aqui é zero mutation completo: nenhum
`projeto` é criado, nenhum recebível é gerado, `scheduleSave` nunca é
chamado.

### P1b — confirmação só existia na UI, não na função de gravação

**Causa-raiz:** `setProjetoRrtRequirement(projetoId, 'none')` aceitava a
decisão sem receber nenhuma prova de que o usuário confirmou — a
confirmação só era checada em `salvarDecisaoRrtRequirement` (a função de
UI que abre o modal), então uma chamada direta (console, teste, ou
qualquer código que chamasse a função sem passar pela tela) sempre
passava.

**Correção aplicada — nova assinatura e contrato da função de gravação:**

```js
setProjetoRrtRequirement(projetoId, novoRequirement, opts)
// opts = { confirmNone: boolean }
```

`podeAlterarRrtRequirement(projeto, novoRequirement, opts)` (a função de
validação central, chamada por `setProjetoRrtRequirement` antes de
qualquer mutação) agora exige `opts.confirmNone===true` pra aceitar
`novoRequirement==='none'`. A mera chamada da função **nunca** é tratada
como confirmação implícita — sem `{confirmNone:true}` explícito, `'none'`
é sempre rejeitado, mesmo chamando diretamente. `pending`/`one`/`two`
continuam sem exigir `confirmNone` (não fazem sentido pra esse conceito).
Uma tentativa rejeitada nunca atualiza `rrtRequirementConfirmedAt`/
`confirmedBy`, nunca chama `resyncProjectV2`, nunca chama `scheduleSave`.

`salvarDecisaoRrtRequirement` (a função de UI) foi simplificada pra só
traduzir o estado do checkbox em `{confirmNone: checkbox.checked}` e
repassar pra `setProjetoRrtRequirement` — a decisão real agora mora
inteiramente na função de gravação.

### P1c — registros de RRT inválidos eram ignorados

**Causa-raiz:** `projetoRrtRequirementSatisfeita`,
`podeAlterarRrtRequirement` e a migração usavam só
`getProjetoRrtsValidas(projeto)` — uma função que **filtra** registros
inválidos (valor não numérico, negativo, NaN) antes de contar. Isso
deixava um registro corrompido/incompleto simplesmente ignorado: um
projeto com uma RRT inválida (por exemplo, `valor:'nao-é-número'`) tinha
`getProjetoRrtsValidas().length===0`, então passava pela checagem de
`'none'` (zero RRTs válidas) e liberava a distribuição com dedução zero
— mesmo com um registro de RRT real ainda sentado em `projeto.rrts`.

**Correção aplicada — regra pra registros brutos versus RRTs válidas:**
toda checagem de satisfação agora compara SEMPRE duas contagens:

```
todosOsRegistros = projeto.rrts || []          // contagem BRUTA, sem filtro
rrtsValidas      = getProjetoRrtsValidas(projeto)  // só os numericamente válidos E de tipo reconhecido

none:    todosOsRegistros.length === 0
one:     todosOsRegistros.length === 1  &&  rrtsValidas.length === 1
two:     todosOsRegistros.length === 2  &&  rrtsValidas.length === 2  &&  um 'projeto' + um 'execucao'
pending: nunca satisfeita
```

Isso significa que QUALQUER registro excedente, inválido, incompleto ou
de tipo desconhecido mantém a distribuição bloqueada — nunca é
silenciosamente ignorado pra liberar dinheiro. Uma tentativa de mudar
pra `'none'` é rejeitada se `projeto.rrts.length > 0`, mesmo que todos os
registros sejam inválidos. Uma tentativa de mudar pra `'one'` é rejeitada
se houver mais de um registro bruto, mesmo que só um seja válido.

Além disso, `getProjetoRrtsValidas` passou a exigir também um `tipo`
reconhecido (`'projeto'` ou `'execucao'`) — um registro com tipo
desconhecido nunca conta como válido, nem pra satisfazer a decisão nem
pra entrar na soma provisionada (`calcRrtProvisionadaCent`).

A migração deixou de duplicar a regra de validade inline e passou a
chamar `getProjetoRrtsValidas(p)` diretamente — elimina o risco de as
duas lógicas divergirem no futuro. A inferência na migração usa a mesma
comparação bruta-vs-válida:

```
pending: zero registros brutos
one:     exatamente um registro bruto, e esse registro é integralmente válido
two:     exatamente dois registros brutos, ambos válidos, um Projeto e um Execução
qualquer outra combinação: pending
```

Nenhum registro é apagado ou corrigido automaticamente pela migração —
só a decisão fica marcada como pendente até uma escolha segura.

### P2 — função permitia alterar projeto legado

**Causa-raiz:** nem `setProjetoRrtRequirement` nem
`podeAlterarRrtRequirement` verificavam `projetoUsaRegraV2(projeto)`. Uma
chamada direta sobre um projeto `legacy` retornava `true` e adicionava
`rrtRequirement`/`rrtRequirementConfirmedAt`/`rrtRequirementConfirmedBy`
ao objeto, contrariando a garantia de que projetos legados nunca ganham
esses campos.

**Correção aplicada:**

```js
if(!projeto || !projetoUsaRegraV2(projeto)) return {ok:false, motivo:'nao_v2'};
```

como a **primeira** checagem de `podeAlterarRrtRequirement`, antes de
qualquer outra validação. Projeto legado é rejeitado pra qualquer um dos
4 estados (`pending`/`none`/`one`/`two`), mesmo com `confirmNone:true` —
nunca ganha o campo novo, nunca sincroniza, nunca chama `scheduleSave`,
nunca toca em RRTs ou em qualquer outro dado financeiro.

## Arquivos alterados

- `index.html` — `getProjetoRrtsValidas` (exige tipo reconhecido),
  `projetoRrtRequirementSatisfeita` (compara bruto vs. válidas),
  `getProjetoRrtBlockMessage` (novo caso `'none'` com registro residual),
  `podeAlterarRrtRequirement` (guarda de regra v2, `opts.confirmNone`,
  contagem bruta), `setProjetoRrtRequirement` (nova assinatura),
  `salvarDecisaoRrtRequirement` (repassa `confirmNone` em vez de checar
  sozinha), `addOfficeProjeto` (confirmação de `'none'` movida pra fora
  do `if(status==='contratado')`), migração em `migrateState` (usa
  `getProjetoRrtsValidas` em vez de duplicar a regra, compara contagem
  bruta).
- `tests/financial-engine/gate6-1-project-rrt-requirement.test.mjs` — 22
  testes novos; 3 chamadas existentes de `setProjetoRrtRequirement(id,
  'none')` que esperavam sucesso atualizadas pra `{confirmNone:true}`; um
  teste que criava RRTs sem `tipo` corrigido (a tightening de
  `getProjetoRrtsValidas` expôs esse gap no próprio fixture de teste, não
  no código de produção).
- `docs/gates/GATE-6-1-PROJECT-RRT-REQUIREMENT.md` — nova seção
  documentando os 3 achados e as correções.

## Testes adicionados

22 casos novos cobrindo os 30 itens pedidos pela auditoria: confirmação
de `'none'` obrigatória para os 4 status (`potencial`/`contratado`/
`concluido`/`cancelado`) com zero mutation comprovado (contagem de
projetos/recebíveis/`saveGeneration` inalterada), criação bem-sucedida
com confirmação marcada, `setProjetoRrtRequirement` rejeitando `'none'`
sem `confirmNone` (com e sem `opts` explícito) e aceitando com
`{confirmNone:true}`, `'none'` rejeitado com RRT inválida OU válida já
existente, `'one'`/`'two'` nunca satisfeitos com registro inválido
misturado (valor não numérico, NaN, negativo) nem com tipos duplicados,
registro de tipo desconhecido mantendo bloqueio e dedução zero, migração
com cada combinação inconsistente (uma inválida, válida+inválida, tipos
duplicados, mais de duas) resultando em `pending`, migração com
combinações válidas continuando `one`/`two` normalmente, e chamada direta
sobre projeto legado rejeitada para os 4 estados com o projeto
permanecendo byte a byte inalterado.

## Comandos e resultados

```
node tests/financial-engine/gate6-1-project-rrt-requirement.test.mjs
→ TOTAL=49 PASS=49 FAIL=0

node tests/financial-engine/gate6-office-net-distribution.test.mjs
→ TOTAL=45 PASS=45 FAIL=0

node tests/financial-engine/run-all.mjs
→ FINFLOW FINANCIAL-ENGINE SUITE: TOTAL_PASS=586 TOTAL_FAIL=0

node tests/financial-engine/compare-real-backup.mjs "C:\Users\97992925220\Downloads\finflow_backup_2026-09-22 (1).json" 545fdd4
→ REAL_BACKUP_DIFFERENCES: 0 (14 meses históricos, 08/2025 a 09/2026)

git diff --check
→ limpo (exit 0)
```

O backup real nunca foi aberto para escrita (o script copia pra uma
pasta temporária do sistema antes de ler). Resultado numérico real salvo
só em `%TEMP%`, nunca commitado.

## Verificações finais

- `git status`: working tree limpa antes de iniciar e ao final (só
  commits nesta branch).
- HEAD confirmado exatamente `4c211fd` antes de qualquer edição.
- `git diff` revisado: a mudança é isolada ao ciclo de vida da decisão de
  RRT (`getProjetoRrtsValidas`, `projetoRrtRequirementSatisfeita`,
  `podeAlterarRrtRequirement`, `setProjetoRrtRequirement`,
  `salvarDecisaoRrtRequirement`, `addOfficeProjeto`, migração) — fórmula
  financeira, rateio Sainte-Laguë, reconciliação cumulativa e motor
  legado não foram tocados (confirmado pelos testes que reexecutam os
  cenários originais do Gate 6 e pela comparação com o backup real).
- Nenhum checkout, merge, rebase ou push na `main`. `main` permanece
  intocada.

---

CORREÇÕES CLAUDE CONCLUÍDAS
REAUDITORIA CODEX PENDENTE
