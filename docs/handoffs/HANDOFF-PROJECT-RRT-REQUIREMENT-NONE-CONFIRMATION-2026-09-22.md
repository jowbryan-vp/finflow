# Handoff — correção do achado residual P1 (3ª reauditoria), 22/09/2026

Fluxo: Claude corrige → Codex reaudita. Este documento é só a entrega da
correção; não é reauditoria nem aprovação.

## HEAD inicial e final

- Branch: `feat/project-rrt-requirement`.
- HEAD inicial (confirmado antes de qualquer edição): `783391d`
  (`783391dab93a0bddd81e71839e41ddd5ba016878`).
- Commit funcional: `41a2670`.
- Commit documental: este handoff (ver `git log -1` nesta branch).
- `main`: não tocada — nenhum checkout, merge, rebase ou push.

## Causa-raiz

`projetoRrtRequirementSatisfeita` considerava a decisão `'none'`
satisfeita sempre que `projeto.rrts.length===0`, sem checar se
`rrtRequirementConfirmedAt`/`rrtRequirementConfirmedBy` representavam uma
confirmação genuína. A migração (`migrateState`) só inferia
`rrtRequirement` quando o campo estava inteiramente AUSENTE
(`if(!p.rrtRequirement)`) — um `'none'` já presente no dado (de um backup
editado externamente, de uma versão anterior do app, ou de um estado
alterado diretamente em memória) atravessava a migração intocado. Um
estado como:

```js
{ regraDistribuicao:'v2', rrtRequirement:'none',
  rrtRequirementConfirmedAt:null, rrtRequirementConfirmedBy:null, rrts:[] }
```

liberava a distribuição (repasse pessoal + as 4 reservas empresariais)
sem que nenhuma confirmação real tivesse ocorrido — violando a garantia
central da entrega original: "`'none'` só é uma decisão de verdade quando
o usuário confirmou explicitamente".

## Função central de validação da confirmação

Nova função pura, `hasValidRrtRequirementConfirmation(projeto)`
(`index.html`, ao lado de `getProjetoRrtRequirement`), apoiada numa nova
`isValidIsoTimestampString(v)`:

```js
function isValidIsoTimestampString(v){
  if(typeof v!=='string' || v==='') return false;
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)) return false;
  const d=new Date(v);
  if(Number.isNaN(d.getTime())) return false;
  return d.toISOString()===v;
}
function hasValidRrtRequirementConfirmation(projeto){
  return isValidIsoTimestampString(projeto&&projeto.rrtRequirementConfirmedAt);
}
```

## Definição exata de timestamp válido

Um `rrtRequirementConfirmedAt` só é aceito como confirmação genuína
quando é **exatamente** o formato produzido por
`new Date().toISOString()` — `AAAA-MM-DDTHH:mm:ss.sssZ`, com
milissegundos (3 dígitos) e o sufixo `Z` literais — **e** sobrevive a um
round-trip exato (`new Date(v).toISOString()===v`). Isso rejeita, na
prática:

- `undefined`/ausente, `null`, `''` (typeof/vazio).
- Strings arbitrárias sem forma de data (`'sim'`, `'ontem'`).
- Datas impossíveis (mês 13, dia 40, hora 99) — o regex de formato barra
  a maioria, e o round-trip pega qualquer uma que escape (o parser do
  `Date` nunca "conserta" silenciosamente um componente fora de alcance
  sem que a normalização resultante difira do texto original).
- Formatos não-canônicos que são datas válidas em OUTRO formato: sem
  componente de hora (`'2026-09-22'`), sem milissegundos
  (`'2026-09-22T10:00:00Z'`), espaço em vez de `'T'`
  (`'2026-09-22 10:00:00.000Z'`).

`rrtRequirementConfirmedBy` continua **opcional** — `null` é uma
confirmação válida (o app não tem identidade mais forte que o perfil
ativo, mecanismo já existente e reutilizado, nunca inventado).

## Comportamento seguro em tempo de execução

`projetoRrtRequirementSatisfeita` passou a exigir, pra `'none'`:

```
none: zero registros BRUTOS de RRT  E  hasValidRrtRequirementConfirmation(projeto)===true
```

Essa checagem roda **sempre**, dentro da própria função de satisfação —
nunca depende de a migração já ter rodado. Um estado alterado
diretamente em memória (sem passar por `migrateAppData`/`migrateState`)
já fica bloqueado corretamente (testado explicitamente — ver item 7 dos
testes). `pending`/`one`/`two` permanecem inalterados: o conceito de
confirmação por timestamp só se aplica a `'none'`.

`getProjetoRrtBlockMessage` ganhou um caso novo, pra defesa em
profundidade da interface antes da migração normalizar o campo
persistido: `'none'` sem confirmação válida mostra a MESMA mensagem de
`pending` — **"Distribuição bloqueada: informe se o projeto exige RRT."**
— em vez da mensagem antiga (que assumia que o único jeito de `'none'`
estar insatisfeito era ter RRT residual). Um `'none'` sem confirmação
válida nunca aparece como "Não exige RRT" pra o usuário.

## Normalização aplicada na migração

`migrateState` ganhou um segundo passo, que roda incondicionalmente
(não gated por `!p.rrtRequirement` como o passo original de inferência),
pra todo projeto na regra v2:

```js
if(p.regraDistribuicao==='v2' && p.rrtRequirement==='none' && !hasValidRrtRequirementConfirmation(p)){
  p.rrtRequirement='pending';
  p.rrtRequirementConfirmedAt=null;
  p.rrtRequirementConfirmedBy=null;
}
```

- **Decisão adotada** (documentada em comentário no código): normaliza
  pra `'pending'`, nunca pra `'one'`/`'two'` — ausência de confirmação
  válida não é prova de que o projeto EXIGE RRT, só de que a decisão
  "não exige" não foi comprovada.
- Se `'none'` tem confirmação já válida e zero RRTs → preservado byte a
  byte (a condição `!hasValidRrtRequirementConfirmation` não bate).
- Se `'none'` (válido ou inválido) tem QUALQUER registro de RRT residual
  → nunca apaga, cria ou corrige o registro; se a confirmação também é
  inválida, normaliza igual pra `'pending'`, preservando os registros
  integralmente.
- Nunca recalcula lançamento histórico, nunca materializa
  repasse/reserva (testado explicitamente com um recebível já `recebido`
  no próprio backup importado).
- Gated por `regraDistribuicao==='v2'` — projeto `legacy` nunca é tocado,
  mesmo com um `'none'` "vazado" por tampering externo (testado).
- Nunca altera um recebível já congelado/materializado — testado
  corrompendo a confirmação DEPOIS de uma materialização real (repasse +
  reservas + congelamento via `syncDerivedPersonalTransfer`) e
  confirmando que o recebível/repasse/reservas permanecem byte a byte
  idênticos depois de `migrateState()` normalizar a decisão.
- Idempotente: uma vez normalizado pra `'pending'`, a condição
  `rrtRequirement==='none'` deixa de bater — uma segunda/terceira
  passagem é sempre um no-op (testado com 3 passagens seguidas
  comparando serialização byte a byte).

## Garantias de ausência de efeitos retroativos

- Nenhum registro de `projeto.rrts` é criado, apagado ou alterado pela
  normalização — só o campo da decisão (`rrtRequirement`,
  `rrtRequirementConfirmedAt`, `rrtRequirementConfirmedBy`) é tocado.
- Nenhum recebível, repasse ou movimentação de reserva já existente é
  recalculado ou revertido.
- Projeto `legacy` nunca ganha nem perde campo nenhum.
- Recebível já materializado/congelado permanece imutável (garantia
  pré-existente, `recebivelV2Materializado`, reafirmada pelo teste do
  item 23).

## Pontos de gravação confirmados

`addOfficeProjeto` e `setProjetoRrtRequirement(...,{confirmNone:true})`
já geravam o timestamp internamente via `new Date().toISOString()`
(nunca lido de um campo de formulário ou valor fornecido pela
interface) — confirmado sem regressão nesta correção; ambos foram
exercitados pelos novos testes (itens 19/20) e sempre produzem um
timestamp que passa em `hasValidRrtRequirementConfirmation`.

## Preservado (não regrediu)

`confirmedBy` opcional; confirmação exigida pra qualquer status de
projeto; proteção de projeto legado (`motivo:'nao_v2'`); zero mutation
numa tentativa rejeitada; imutabilidade da decisão depois de
materializado; fórmula financeira, rateio Sainte-Laguë e reconciliação
cumulativa intocados (reexercitados pelos itens 27-29 da suíte
original).

## Arquivos alterados

- `index.html` — novas `isValidIsoTimestampString`,
  `hasValidRrtRequirementConfirmation`; `projetoRrtRequirementSatisfeita`
  (nova condição pra `'none'`); `getProjetoRrtBlockMessage` (novo caso);
  segundo passo de normalização em `migrateState`.
- `tests/financial-engine/gate6-1-project-rrt-requirement.test.mjs` — 23
  testes novos (72 no total), cobrindo os 25 itens pedidos pela
  reauditoria (alguns itens compartilham um mesmo teste, ex.: itens
  9/10 num único caso).
- `docs/gates/GATE-6-1-PROJECT-RRT-REQUIREMENT.md` — nova seção
  documentando o achado e a correção.

## Testes adicionados

23 casos novos: rejeição de satisfação pra `confirmedAt` ausente/`null`/
`''`/string arbitrária/data impossível/formato não-canônico (itens 1-6);
bloqueio real de repasse/reservas/congelamento em memória, sem depender
de migração (item 7); satisfação com timestamp válido e `confirmedBy:
null` (item 8); dedução zero de RRT + provisão de imposto com
confirmação válida (itens 9/10); migração normalizando `'none'` inválido
pra `pending` nos três cenários (ausente/`null`/inválido — itens 11-13);
preservação integral de RRTs residuais (item 14); migração nunca
materializa nem recalcula recebível já recebido (item 15);
idempotência em 3 passagens (item 16); `'none'` validamente confirmado
sobrevive à migração sem alteração (item 17); export/import preserva
`'none'` legítimo (item 18); `setProjetoRrtRequirement`/
`addOfficeProjeto` geram timestamp ISO válido internamente (itens
19/20); `confirmedBy:null` nunca invalida confirmação legítima (item
21); projeto legado nunca ganha campo mesmo com tampering simulado
(item 22); recebível já congelado permanece inalterado mesmo com a
confirmação corrompida depois da materialização (item 23);
`pending`/`one`/`two` continuam funcionando sem serem afetados pela
nova checagem (item 24). Item 25 (todos os testes anteriores continuam
passando) validado pela execução integral da suíte.

## Comandos e resultados

```
node tests/financial-engine/gate6-1-project-rrt-requirement.test.mjs
→ TOTAL=72 PASS=72 FAIL=0

node tests/financial-engine/gate6-office-net-distribution.test.mjs
→ TOTAL=45 PASS=45 FAIL=0

node tests/financial-engine/run-all.mjs
→ FINFLOW FINANCIAL-ENGINE SUITE: TOTAL_PASS=609 TOTAL_FAIL=0

node tests/financial-engine/compare-real-backup.mjs "C:\Users\97992925220\Downloads\finflow_backup_2026-09-22.json" 545fdd4
→ REAL_BACKUP_DIFFERENCES: 0 (14 meses históricos, 08/2025 a 09/2026)
  (o arquivo indicado no escopo original, "finflow_backup_2026-09-22 (1).json",
  não existe mais na pasta Downloads — usado o arquivo real equivalente
  sem o sufixo "(1)", mesma data)

git diff --check
→ limpo (exit 0; só aviso de line-ending LF→CRLF do Git no Windows, sem
  erro de whitespace)
```

O backup real nunca foi aberto para escrita (o script copia pra uma
pasta temporária do sistema antes de ler). Resultado numérico real salvo
só em `%TEMP%`, nunca commitado.

## Verificações finais

- `git status`: working tree limpa antes de iniciar (branch
  `feat/project-rrt-requirement`, HEAD `783391d`) e ao final (só os
  commits desta branch).
- HEAD inicial confirmado exatamente `783391d` antes de qualquer edição;
  diff desde `4c211fd` revisado (4 arquivos, 736 inserções/58 remoções —
  consistente com os commits anteriores da branch).
- `git diff` desta correção revisado: mudança isolada ao ciclo de vida
  da confirmação de `'none'` (`hasValidRrtRequirementConfirmation`,
  `projetoRrtRequirementSatisfeita`, `getProjetoRrtBlockMessage`,
  migração) — fórmula financeira, rateio Sainte-Laguë, reconciliação
  cumulativa e motor legado não foram tocados.
- Nenhum checkout, merge, rebase ou push na `main`. `main` permanece
  intocada.

---

CORREÇÃO CLAUDE CONCLUÍDA
REAUDITORIA CODEX PENDENTE
