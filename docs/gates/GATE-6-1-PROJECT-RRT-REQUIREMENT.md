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

## Correção pós-auditoria (achados P1/P2 sobre `939294c`)

A primeira reauditoria (implementação `939294c`) encontrou três caminhos
de gravação não protegidos:

**P1a — confirmação de `none` só era exigida pra status `contratado`.**
Em `addOfficeProjeto`, a checagem do checkbox "Confirmo que este projeto
não exige RRT" estava dentro de `if(status==='contratado')` — um projeto
Potencial/Concluído/Cancelado podia nascer com `rrtRequirement:'none'` e
um `rrtRequirementConfirmedAt` **falso** (sem confirmação real), e se
depois virasse Contratado a distribuição saía liberada sem que o usuário
jamais tivesse confirmado a ausência de RRT. **Correção:** a checagem
roda agora ANTES de criar o objeto `projeto` ou tocar em `state`, pra
QUALQUER status.

**P1b — a confirmação só existia na UI, não na função de gravação.**
`setProjetoRrtRequirement(id, 'none')` aceitava a decisão sem receber
nenhuma prova de confirmação — uma chamada direta (contornando a UI)
sempre passava. **Correção:** nova assinatura
`setProjetoRrtRequirement(projetoId, novoRequirement, {confirmNone})`.
`podeAlterarRrtRequirement` exige `opts.confirmNone===true` pra aceitar
`'none'` — a mera chamada da função nunca é tratada como confirmação
implícita. `pending`/`one`/`two` não exigem `confirmNone`. Uma tentativa
rejeitada nunca atualiza timestamps, nunca chama `resyncProjectV2`, nunca
chama `scheduleSave`.

**P1c — registros de RRT inválidos eram ignorados nas checagens de
satisfação e na migração.** `getProjetoRrtsValidas` FILTRA registros
inválidos — usar só essa contagem deixava um registro corrompido
(valor não numérico, negativo, NaN, ou tipo desconhecido) simplesmente
ignorado: um projeto com uma RRT inválida podia passar por `'none'`
(contagem de válidas = 0) e liberar a distribuição com dedução zero,
mesmo com um registro real ainda em `projeto.rrts`. **Correção:**
`projetoRrtRequirementSatisfeita`, `podeAlterarRrtRequirement` e a
migração agora SEMPRE comparam também a contagem BRUTA
(`projeto.rrts.length`, sem filtro) contra a contagem de válidas:

```
none: zero registros BRUTOS (nenhuma RRT, nem inválida, sobrando)
one:  exatamente um registro bruto E esse registro é válido
two:  exatamente dois registros brutos, os dois válidos, um de cada tipo
pending: nunca satisfeita
```

`getProjetoRrtsValidas` também passou a exigir um `tipo` reconhecido
(`'projeto'` ou `'execucao'`) — um registro de tipo desconhecido nunca
conta como válido, nem pra satisfazer a decisão nem para a soma
provisionada (`calcRrtProvisionadaCent`). A migração deixou de duplicar
essa regra inline e passou a chamar `getProjetoRrtsValidas` diretamente,
eliminando o risco de as duas lógicas divergirem. Nenhum registro é
apagado ou corrigido automaticamente — a distribuição só fica bloqueada
até uma decisão segura.

**P2 — `setProjetoRrtRequirement`/`podeAlterarRrtRequirement` não
verificavam se o projeto usa a regra v2.** Uma chamada direta sobre um
projeto `legacy` retornava sucesso e adicionava o campo novo, contrariando
a garantia de que projetos legados nunca recebem `rrtRequirement`.
**Correção:** `podeAlterarRrtRequirement` rejeita com `motivo:'nao_v2'`
ANTES de qualquer outra checagem quando `!projetoUsaRegraV2(projeto)` —
projeto legado nunca ganha `rrtRequirement`/`confirmedAt`/`confirmedBy`,
nunca sincroniza, nunca salva, pra nenhum dos 4 estados.

22 testes novos (49 no total). Suíte completa: 586 PASS / 0 FAIL.
Comparação com o backup real: 0 diferenças em 14 meses históricos.
