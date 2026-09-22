# Gate 6.1 — decisão explícita de exigência de RRT por projeto

Branch `feat/project-rrt-requirement`, a partir do commit publicado e
aprovado `71edc74867d89d73832875c4ab456491f207c189`.

## Problema resolvido

No Gate 6 original, um projeto v2 sem NENHUMA RRT cadastrada ficava
bloqueado indefinidamente ("RRT não configurada"), e o único jeito de
destravar a distribuição era cadastrar uma RRT — inclusive, na prática,
uma RRT artificial de R$ 0,00 pra projetos que legitimamente não exigem
RRT nenhuma. Essa entrega substitui esse comportamento por uma decisão
empresarial explícita, nunca inferida por ausência de dado.

## Modelo de dados

Novo campo em `projeto` (só projetos na regra v2 — `regraDistribuicao==='v2'`):

```js
rrtRequirement: 'pending' | 'none' | 'one' | 'two'
rrtRequirementConfirmedAt: string (ISO 8601) | null
rrtRequirementConfirmedBy: string | null   // nome do perfil ativo, quando existir — nunca inventado
```

- `'pending'` — ainda não definido. Padrão de todo projeto v2 novo.
  `confirmedAt`/`confirmedBy` ficam `null` enquanto pending (nunca é
  gravado como se fosse uma confirmação).
- `'none'` — decisão explícita: o projeto não exige RRT nenhuma. Exige
  confirmação adicional na interface (checkbox "Confirmo que este projeto
  não exige RRT") antes de ser aceita.
- `'one'` — exige exatamente 1 RRT, Projeto OU Execução (o usuário
  escolhe o tipo).
- `'two'` — exige exatamente 2 RRTs, uma de cada tipo (Projeto + Execução).

Projetos `legacy` (`regraDistribuicao==='legacy'`) NUNCA ganham esse
campo — permanecem integralmente no motor antigo.

## Regras dos quatro estados

A distribuição (repasse pessoal + as 4 reservas empresariais) só
materializa quando a decisão está **satisfeita**
(`projetoRrtRequirementSatisfeita`):

| Estado | Satisfeita quando... | RRT provisionada |
|---|---|---|
| `pending` | nunca | — (bloqueado) |
| `none` | zero RRTs cadastradas | R$ 0,00 sempre |
| `one` | exatamente 1 RRT válida | a RRT cadastrada |
| `two` | exatamente 2 RRTs, uma Projeto + uma Execução | soma das duas |

Enquanto não satisfeita, `projetoNecessitaConfiguracaoRRT` continua
verdadeiro (mesmo nome de função do Gate 6 original, lógica interna
trocada) — nenhum repasse é criado, nenhuma reserva é movimentada, nenhum
congelamento de provisão ocorre (`syncDerivedPersonalTransferV2`). O
recebimento real continua entrando normalmente na conta empresarial
(`calcSaldoOfficeConta` lê `recebivel.estado` diretamente, sem depender
disso). A interface mostra a mensagem exata correspondente
(`getProjetoRrtBlockMessage`):

- `pending`: **"Distribuição bloqueada: informe se o projeto exige RRT."**
- `one` incompleto: **"Distribuição bloqueada: cadastre a RRT exigida
  pelo projeto."**
- `two` incompleto: **"Distribuição bloqueada: cadastre a RRT de Projeto
  e/ou a RRT de Execução — o projeto exige as duas."**

`addProjetoRRT`/`confirmarAddProjetoRRT` usam a decisão pra decidir o teto
de RRTs aceitas (1 pra `one`, 2 pra `two`) — nunca aceitam RRT nenhuma
enquanto `pending` ou `none`. Valor R$ 0,00 continua só sendo aceito
quando digitado e confirmado explicitamente pelo usuário no modal (regra
já existente do Gate 6, preservada).

## Alteração da decisão

`setProjetoRrtRequirement(projetoId, novoRequirement)` é a única função
que grava a decisão — chamada tanto pelo cadastro quanto pela edição.
Valida via `podeAlterarRrtRequirement` **antes** de tocar em qualquer
coisa (zero mutation numa tentativa rejeitada):

1. Projeto já materializado (`projetoV2TemMaterializacao` — qualquer
   recebível com `recebivelV2Materializado`): a decisão fica **imutável
   pra sempre**, mesmo chamando a função diretamente (a proteção está na
   função de gravação, não só na UI que a chama).
2. `'none'` com RRT(s) já cadastrada(s): rejeitado — a mensagem orienta a
   remover o(s) registro(s) primeiro.
3. `'one'` com duas RRTs já cadastradas: rejeitado — orienta a remover
   uma primeiro.
4. Qualquer outra combinação (inclusive mudar livremente entre `pending`/
   `two`/etc. antes de qualquer RRT cadastrada) é permitida.

Nenhuma chamada bem-sucedida cria ou apaga RRT sozinha — só grava a
decisão; `addProjetoRRT`/`delProjetoRRT` continuam os únicos pontos que
tocam o array `rrts`.

## Migração

Idempotente, só roda uma vez por projeto (`if(!p.rrtRequirement)`), só
pra projetos já na regra v2:

- 0 RRTs válidas → `'pending'` (nunca `'none'` — ausência não é decisão).
- 1 RRT válida (inclusive de valor R$ 0,00 — uma RRT de R$0,00 continua
  sendo uma RRT real) → `'one'`.
- 2 RRTs válidas, uma Projeto + uma Execução → `'two'`.
- Qualquer outra combinação inconsistente (ex.: duas RRTs do mesmo tipo,
  que a UI nunca permite criar mas pode existir em dados externos) →
  `'pending'`, nunca inventa.
- `confirmedAt`/`confirmedBy` ficam `null` se ausentes.

Nenhum lançamento financeiro histórico é recalculado pela migração —
projetos com recebível já realizado já estão em `'legacy'` (decisão do
Gate 6 original) e nunca ganham `rrtRequirement`.

## Interface

Radio de 4 opções ("Ainda não definido" / "Não exige RRT" / "Exige 1 RRT"
/ "Exige 2 RRTs") tanto no cadastro (`renderOfficeProjetosTab`, dentro de
"Entrada e parcelamento") quanto na edição (`renderProjetoRrtSection`,
dentro do modal "Editar Projeto"). "Não exige RRT" exige o checkbox de
confirmação adicional. Depois de materializado, a seção vira somente
leitura, com a mensagem explicando o motivo. Nenhum redesign — reutiliza
os mesmos componentes/estilos (`form-group`, `info-box`, `btn-ghost`) já
usados no resto do Caixa do Escritório.

## Cálculo financeiro

Fórmula, rateio Sainte-Laguë, reconciliação cumulativa, provisão
prioritária, imutabilidade de recebível materializado e motor legado —
**intocados**. A decisão de RRT só decide QUANDO a distribuição
materializa, nunca COMO ela é calculada.

## Testes

`tests/financial-engine/gate6-1-project-rrt-requirement.test.mjs` (27
casos, registrado em `run-all.mjs`). Suíte completa: 564 PASS / 0 FAIL.
Comparação com o backup real (`compare-real-backup.mjs`): 0 diferenças em
14 meses históricos.
