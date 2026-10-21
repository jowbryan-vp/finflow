# SEC-2B2 — segurança de renderização dos IDs do domínio escritório

Branch `sec/2-office-id-hardening`, a partir do commit aprovado
`71185fae8f817ccc69ba2579ecb566924032f3ce` (SEC-2B1 — domínio pessoal).

## Problema resolvido

O mesmo problema do SEC-2B1 (identificadores textuais interpolados crus em
handlers inline `onclick="fn('${id}')"` e em atributos HTML `attr="${id}"`),
agora no domínio escritório: navegação/abas, projetos e contratos V3,
recebimentos, custos/despesas, RRTs, tributação, reservas, repasses e contas
empresariais. Um ID textual (importado de um backup/JSON, nunca gerado pela
UI) contendo aspas, `&`, `<tag>`, ou um fechamento de atributo seguido de um
novo atributo (`" autofocus onfocus="...`) podia:

- quebrar o atributo `onclick="..."` e injetar JavaScript arbitrário
  (`HANDLER_QUOTED_RAW`/`HANDLER_ESC` — `esc()` escapa para contexto HTML,
  não para string JavaScript dentro do handler);
- quebrar um atributo comum (`id`, `data-*`, `value`, `for`, `aria-*`) e
  injetar um atributo/elemento novo (`ATTR_RAW_ID`).

## Escopo

Exclusivamente a segurança de renderização dos IDs do domínio escritório em
`index.html` (handlers inline e atributos HTML). Fora de escopo, preservado
integralmente:

- SEC-1 (nomes/cores) e SEC-2B1 (domínio pessoal);
- normalização, remapeamento, deduplicação ou migração de IDs existentes;
- motor financeiro, schema, competência, cartões, OAuth, Drive, cache,
  sincronização ou qualquer regra de negócio;
- `ATTR_RAW_NONID` (valores não-ID crus em atributo) — reservado ao SEC-2B3,
  registrado mas não corrigido aqui, salvo quando inseparável do mesmo sink
  de um achado de ID (nenhum caso assim neste gate).

## Inventário (antes do gate)

Obtido por `node tests/financial-engine/sec2-id-lint.mjs index.html --list escritorio`,
129 achados de segurança do escritório:

| Regra | Quantidade |
|---|---|
| `HANDLER_QUOTED_RAW` | 70 |
| `HANDLER_ESC` | 31 |
| `ATTR_RAW_ID` | 26 |
| `HANDLER_INDIRECT` | 1 |
| `HANDLER_BARE_OTHER` | 1 |
| **Total** | **129** |

Funções afetadas (não exaustivo): `officeAtualizarNav`, `officeProjetoLinhaHTML`,
`renderProjetoAnterior`, `planoLinhaHTML`/`planoEditorHTML`/`planoAtualizar`,
`renderNovoContratoV3Form`, `officeAbaResumo`, `officeAbaRecebimentos`,
`officeCoberturaBox`, `officeCompromissoHTML`, `officeAbaCustos`, `officeAbaRrts`,
`officeAbaTributacao`, `officeAbaHistorico`, `renderContratoV3Detalhe`,
`abrirRecebimentoV3`, `abrirPagamentoV3`/`verificarPagamentoV3`/
`executarPagamentoV3`/`abrirQuitacaoV3`, `abrirEstornoV3`, `abrirNovaRrtV3`,
`abrirNovoCustoV3`, `abrirRrtRequirementV3`, `abrirPagamentoTributoV3`,
`abrirAliquotaContratoV3`, `abrirLiberacaoV3`, `abrirAditivoV3`,
`abrirConversaoV3`, `renderProjetoRrtSection` (modelo anterior/v2),
`openEditOfficeProjeto`, `addProjetoRRT`, `renderOfficeRecebiveisTab`,
`openEditOfficeRecebivel`, `renderOfficeDespesasTab`, `renderOfficeReservasTab`,
`openAplicarOfficeReserva`, `openResgatarOfficeReserva`,
`renderOfficeRepassesTab`, `openRealizarOfficeRepasse`,
`openBaixarOfficeRepasse`, `renderOfficeConfigTab`, `openEditOfficeConta`.

## Regras de correção (idênticas ao SEC-2B1)

- Argumento de handler inline: `fn(${jsArg(id)})` — sem aspas externas. `jsArg`
  (`esc(JSON.stringify(String(v)))`) já definida desde o SEC-1/SEC-2B1.
- Valor de atributo HTML: `attr="${esc(id)}"`.
- Nunca `esc()` como proteção de argumento JavaScript (`esc()` protege
  contexto HTML; o navegador decodifica entidades HTML antes de executar o
  texto do handler como JavaScript — por isso `HANDLER_ESC` é tão inseguro
  quanto `HANDLER_QUOTED_RAW`).
- Variável pré-calculada reutilizada em handler E atributo (ex.:
  `const pid=esc(D.projetoId)` usado depois em `onclick="fn('${pid}')"`) foi
  eliminada; cada sink usa a função certa no ponto exato, com o campo bruto
  original (`D.projetoId`, não a variável pré-escapada) — evita a
  dupla-interpretação (HTML-decode seguido de execução JS) do SEC-2B1.
- Argumentos não-ID que também entram em handlers (`tipo`, `aba`, `prefix` do
  editor de parcelas, `k` da aba do contrato) revisados na origem e
  codificados com `jsArg(...)` quando dinâmicos — mesmo sendo, na prática,
  sempre literais internas (closed), `jsArg` nelas é inofensivo e evita
  qualquer necessidade de whitelist para esses casos.

## Whitelist (2 entradas novas no escritório; 6 preexistentes do SEC-2B1)

| Função\|expressão | Motivo |
|---|---|
| `renderNovoContratoV3Form\|i+1` | Índice (1..5) do loop sobre `OFFICE_NOVO_ETAPAS`, array literal fechado do próprio código — nunca dado externo. Precisa continuar **numérico**: é comparado com `Number(dataset.etapa)` em `officeNovoMostrarEtapa`; `jsArg` o transformaria em string e quebraria essa comparação de tipo estrito. |
| `officeAbaResumo\|acao` | `HANDLER_INDIRECT`: a variável `acao` só é montada a partir de literais do próprio código — `aba('recebimentos'\|'rrts'\|'tributacao'\|'distribuicao'\|'custos')` (que produz `"abrirAbaContratoV3('x')"` com `x` sempre literal) ou o literal `"switchOfficeTab('config')"`. Nunca recebe dado de `D`/`state`. |

Whitelist conferida exata: toda entrada corresponde a um ponto real do código
(teste `SEC2_LINT_WHITELIST_EXACT`, autoteste do lint).

## Lacuna heurística do lint encontrada e tratada

Durante a correção, uma varredura manual (grep por todo `${...}` contendo um
nome parecido com ID no domínio escritório, não só a lista do lint) achou 1
ocorrência real que o lint **não** lista: em `officeAbaRrts`, o botão
"Situação da RRT" (`abrirRrtRequirementV3('${pid}')`), colado sem espaço logo
depois do fechamento de um ternário (`...}<button ...abrirRrtRequirementV3...`).
O heurístico de `contextAt` do lint (`tests/financial-engine/sec2-id-lint.mjs`)
só reconhece o início de uma tag quando o caractere anterior ao `<` é
`` ` ``, `>`, espaço ou aspas — um `}` colado direto na tag seguinte não entra
nesse conjunto, e o rastreamento retrocede além da tag real, perdendo essa
interpolação. **Corrigida mesmo sem estar na lista do lint** (mesmo padrão
`abrirNovaRrtV3`/`abrirRrtRequirementV3`, mesma variável `pid`, mesma
correção). O heurístico do lint em si não foi alterado neste gate — alterar
`contextAt` afetaria o domínio pessoal (SEC-2B1, já aprovado e fora de
escopo) e poderia reabrir achados lá, o que exigiria autorização fora deste
escopo. Risco registrado como dívida (ver seção de dívidas).

## Inventário (depois do gate)

`node tests/financial-engine/sec2-id-lint.mjs index.html --list escritorio`:
**zero** achados de `HANDLER_QUOTED_RAW`/`HANDLER_ESC`/`ATTR_RAW_ID`/
`HANDLER_INDIRECT`/`HANDLER_BARE_OTHER` fora da whitelist. `ATTR_RAW_NONID`
(94 no escritório, fora de escopo deste gate) inalterado — reservado ao
SEC-2B3.

## Lint evoluído a condição de gate

`tests/financial-engine/sec2-id-lint.mjs` ganhou `SEC2_LINT_OFFICE_NO_RAW_IDS`,
nos mesmos termos de `SEC2_LINT_PERSONAL_NO_RAW_IDS`: zero achados de
segurança de ID no domínio escritório fora da whitelist explícita e exata.
A mensagem informativa de achados pendentes (antes "escritório (SEC-2B2)=N")
foi reduzida a só "SEC-2B3" (único domínio ainda não gateado).

## Teste de navegador dedicado

`tests/financial-engine/sec2-id-render-office.test.mjs` (13 verificações),
estado 100% sintético, nenhuma conta/Drive/OAuth real. Os registros v3
(projeto/parcela/RRT/custo/repasse) nascem pelo próprio motor aprovado
(`criarContratoV3`, `registrarRecebimentoV3`, `pagarCompromissoV3`,
`confirmarConfigTributaria`, `salvarDistribuicaoBaseSegura`) para garantir um
estado financeiro internamente consistente (parcelas, provisão, cobertura e
repasse corretos); só os IDs resultantes são trocados por uma string
adversarial sintética depois de criados, cascateando toda referência cruzada
(projetoId em recebíveis/despesas, recebivelId do repasse, refId da despesa
de pagamento) — o motor nunca aceita um ID externo na criação (sempre gera
com `uid()`), então essa é a única forma de testar um ID adversarial num
registro v3 estruturalmente válido, e é também o modelo de ameaça real: um
import malicioso troca o ID de um registro por outro lado válido, nunca
inventa uma forma de dado nova.

ID sintético único, reutilizado em todas as entidades:
```
id ' " & <tag> &#39; Ünicode 😀 com espaços \ linha
" data-sec2-injected autofocus onfocus="window.__sec2Executed=(window.__sec2Executed||0)+1
```
(aspas simples/duplas, `&`, `<tag>`, entidade `&#39;`, Unicode, emoji,
espaços, barra invertida, quebra de linha, e uma tentativa de fechar o
atributo/handler atual e abrir um atributo/elemento novo.)

Grupos cobertos, com o argumento exato entregue ao handler e o valor exato em
selects/atributos verificados via `window.name = (...args)=>{ captured=args }`
(substituição temporária da function global, nunca a execução real) e
`element.options.map(o=>o.value)`:

- **Navegação/projetos V3**: lista de projetos (`data-projeto`, `abrirProjeto`),
  detalhe do contrato (`data-projeto`), aditivo.
- **Recebimentos**: `abrirRecebimentoV3` (parcela V3); recebível do modelo
  anterior (`openEditOfficeRecebivel`, `delOfficeRecebivel`,
  `saveEditOfficeRecebivel`, select de conta).
- **Custos e RRTs V3**: `abrirNovoCustoV3`, `data-id` do compromisso,
  `abrirEstornoV3` (despesa de pagamento gerada por `pagarCompromissoV3`),
  `abrirNovaRrtV3`, `abrirRrtRequirementV3`, `abrirPagamentoV3` (3 argumentos:
  tipo, projeto, item).
- **Tributação**: `abrirAliquotaContratoV3`, `abrirPagamentoTributoV3`.
- **Modelo anterior/legado (v2)**: editor (`renderProjetoRrtSection`) — `id`
  dos campos de uma RRT (`eRrtValor_`, `eRrtStatus_`, `eRrtNumero_`,
  `eRrtDataEmissao_`, `eRrtDataPagamento_`), `saveProjetoRRT`,
  `delProjetoRRT`, `salvarDecisaoRrtRequirement`, `saveEditOfficeProjeto`; e a
  tela do projeto do modelo anterior (`renderProjetoAnterior`) — `data-projeto`,
  `openEditOfficeProjeto`, `delOfficeProjeto` (incondicionais nessa tela).
- **Reservas**: `openAplicarOfficeReserva`/`openResgatarOfficeReserva`
  (handler e select de conta, chamando a function real para abrir o modal),
  `delOfficeReserva`.
- **Repasses**: `openRealizarOfficeRepasse` (handler e select de conta),
  `openBaixarOfficeRepasse`.
- **Despesas**: `delOfficeDespesa`, select de conta.
- **Contas empresariais**: `openEditOfficeConta`, `saveEditOfficeConta`,
  `delOfficeConta`.

Verificações transversais:
- **Sem execução/diálogo/requisição externa**: `window.__sec2Executed`
  continua 0 em todas as abas e etapas percorridas; nenhum `dialog` disparado
  (interceptado e descartado); toda rede para `**/sec2.invalid/**`
  interceptada e abortada (nenhuma chamada observada); nenhum
  `[data-sec2-injected]`/`[autofocus]`/`[onfocus]`/`<script>`/`<iframe>`
  inesperado no DOM (`__sec2Scan`), inclusive varrendo todas as abas da Visão
  Geral/Projetos/Recebíveis/Despesas/Reservas/Repasses/Config e todas as abas
  do detalhe do contrato (resumo/recebimentos/custos/rrts/tributação/
  distribuição/histórico).
- **Sem mutação causada só por renderização**: `buildSaveObject()` antes e
  depois de navegar e operar todos os controles capturados é byte-a-byte
  idêntico.
- **Persistência e reload**: `migrateAppData` aplicado de novo sobre o
  próprio `buildSaveObject()` não altera nada (ponto fixo) e os IDs do
  projeto/conta continuam exatos.
- **Sem erro de script**: nenhum erro de console/página durante toda a
  suíte.

## Controles negativos (sensibilidade)

Mutação temporária e isolada em memória de trabalho (não commitada; aplicada,
testada e revertida a partir de uma cópia de `index.html`, nunca deixada no
repositório): `officeProjetoLinhaHTML` revertida para a forma insegura
original (`data-projeto="${l.id}"` sem `esc()`; `onclick="abrirProjeto('${l.id}')"`
sem `jsArg`). Detectado por:

- `sec2-id-lint.mjs`: `SEC2_LINT_OFFICE_NO_RAW_IDS` falha, listando
  exatamente os 2 achados reintroduzidos (`ATTR_RAW_ID` e
  `HANDLER_QUOTED_RAW` em `officeProjetoLinhaHTML`, expressão `l.id`).
- `sec2-id-render-office.test.mjs`: `SEC2B2_OFFICE_PROJECT_LIST_AND_DETAIL_EXACT_ARGS`
  falha — o atributo `data-projeto` é observado truncado no primeiro `'` do ID
  sintético (`"projeto:id '"`, quebra real do atributo HTML); e
  `SEC2B2_NO_SCRIPT_ERRORS` falha com um erro de execução real do navegador
  (`Failed to execute 'click' on 'HTMLElement': missing ) after argument
  list`) — o `onclick` gerado ficou sintaticamente inválido por causa do `'`
  não escapado no meio do ID, confirmando que o handler quebrado chega a ser
  parseado/executado pelo navegador, não é só uma discrepância de string.

Depois do controle, `index.html` restaurado ao estado corrigido (verificado:
`sec2-id-lint.mjs` 4/4 e `sec2-id-render-office.test.mjs` 13/13 voltam a
passar).

## Testes legados afetados

Nenhum. A suíte completa (ver seção seguinte) não teve nenhuma falha nova nem
exigiu ajuste de asserção em teste preexistente — as mudanças de serialização
de handler neste gate não colidiram com nenhuma asserção de texto literal de
handler em teste legado (diferente do SEC-2B1, que precisou adaptar 4 testes
do domínio pessoal).

## Suíte completa

`node tests/financial-engine/run-all.mjs`: **857 PASS / 7 FAIL**
(base SEC-2B1: 843 PASS / 7 FAIL; +1 de `SEC2_LINT_OFFICE_NO_RAW_IDS` no
`sec2-id-lint.mjs`; +13 de `sec2-id-render-office.test.mjs`).

As 7 falhas são exatamente as mesmas históricas, nominalmente idênticas ao
SEC-2B1: `G1-C02`, `G1-C06`, o crash de
`gate3-1-distribution-validation.test.mjs` (`TypeError: Cannot set
properties of null`), `INVOICE_PURCHASES_ORDERED_DESC_LEGACY_STABLE_FALLBACK_NO_STATE_CHANGE`
(ordenação da fatura), `PCP_EXTRA_OFFICE_GENERATION_NATURE`, `PDV_09_IDENTICAL_TO_BASE`
e `UX1R_09_ENGINE_AND_ROWS_IDENTICAL_TO_BASE`.

`git diff --check`: sem erros (um aviso benigno de normalização
LF→CRLF do Git no arquivo do lint, sem conteúdo afetado).

## Dívidas e limitações

- Lacuna heurística do `contextAt` do lint (ver seção acima): um `}` colado
  sem espaço diretamente antes de uma tag seguinte pode esconder uma
  interpolação real daquela tag da listagem do lint. Tratada manualmente
  neste gate (grep comprehensive + correção), mas o heurístico do lint em si
  não foi corrigido — qualquer novo código futuro com esse padrão exato
  (ternário terminando colado numa tag seguinte, sem espaço) deveria ser
  revisado manualmente além do `--list` do lint, até uma correção dedicada
  (fora de escopo: tocaria o heurístico compartilhado com SEC-2B1).
- Mesma dívida do SEC-2B1 quanto a IDs vazios/duplicados/numéricos/nulos/de
  tipos inesperados/referências inexistentes/colisões: este gate não garante
  nem testa compatibilidade para esses casos no domínio escritório (não
  fazia parte do escopo; o SEC-2B1 já registra essa dívida para o domínio
  pessoal, e não há motivo para supor que o comportamento do escritório
  seria diferente, mas não foi caracterizado aqui).
- `ATTR_RAW_NONID` (valores não-ID em atributo, 94 no escritório) permanece
  fora de escopo, reservado ao SEC-2B3.
