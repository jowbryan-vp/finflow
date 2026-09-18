# Gate 5 — Correções de validação do usuário (UAT) — Relatório de implementação

- Branch: `gate/5-uat-corrections`
- HEAD inicial: `1d8e4577763447393d4a3e4ea5a612b3955805a9` (`release/uat-2026-09-18`)
- HEAD final: ver commit informado no handoff final (esta entrega gera um único commit sobre este HEAD inicial)
- Baseline confirmado antes de editar: `TOTAL_PASS=305 TOTAL_FAIL=0` (dois de três `npm test` consecutivos; um run isolado mostrou `301/1` de forma não reprodutível nas duas execuções seguintes — registrado como flake transitório do harness/browser, não relacionado ao código, e não investigado further por estar fora do escopo autorizado).

## Arquivos alterados

- `index.html` — as quatro correções de produto.
- `tests/financial-engine/run-all.mjs` — inclusão dos 4 novos arquivos de teste.
- `tests/financial-engine/gate5-parcelamentos-periodo.test.mjs` (novo, 12 casos)
- `tests/financial-engine/gate5-reembolso-nomenclatura.test.mjs` (novo, 6 casos)
- `tests/financial-engine/gate5-office-contrato.test.mjs` (novo, 15 casos)
- `tests/financial-engine/gate5-drive-sync-safety.test.mjs` (novo, 9 casos)
- `docs/gates/GATE-5-UAT-CORRECTIONS.md` (novo, especificação)
- `docs/gates/GATE-5-UAT-CORRECTIONS-IMPLEMENTATION.md` (este arquivo)

`delivery/index.html` não foi tocado, conforme instrução vigente do repositório.

## 1. Parcelamentos ativos no mês selecionado

`renderParcelamentos()` (index.html) passou a calcular, pra cada despesa parcelada, o início (`mIni`/`yIni` — já existia, via `getCompetenciaFatura` pra cartão de crédito ou `mesInicio`/`anoInicio` direto pra dinheiro/PIX) e o fim (`addMonths(mIni,yIni,parcelas-1)`), num novo helper `getParcelamentoPeriodo(d)`. A linha só aparece quando `currentMonth`/`currentYear` está entre início e fim, inclusive. Nenhum dado de `state.despesas` é lido de forma diferente do que já era — é filtragem/apresentação pura, verificado explicitamente no teste P5-12 (a despesa usada nos testes de período segue com os mesmos `parcelas`/`valor`/`mesInicio` depois de toda a navegação).

Título do card: "Todos os Parcelamentos Ativos" → "Parcelamentos Ativos no Período". Estado vazio: "Nenhum parcelamento ativo neste período" (era "Nenhum parcelamento cadastrado", que continua a mensagem certa se a lista bruta estivesse vazia, mas agora o caso comum é "existem parcelamentos, só não neste período").

Testes (`gate5-parcelamentos-periodo.test.mjs`, 12/12 PASS): mês anterior oculto, primeira parcela visível, mês intermediário visível, última parcela visível, mês posterior oculto, cartão com compra antes/depois do fechamento (rolagem de fatura), virada de ano, registro legado sem `dataCompra` (fallback mês+1), dinheiro/PIX sem rolagem, mensagem de período vazio, e confirmação final de que nenhuma despesa foi alterada/excluída.

## 2. Nomenclatura de reembolso

Troca literal e escopada das strings visíveis do fluxo pessoal listadas no handoff (dropdown "Nova Receita", info-box, nav "Reembolsos / Pessoas", título de card, `PAGE_TITLES`, as 3 ocorrências do mapa `tipos` — só a chave `repasse`, preservando `repasse_escritorio`/`retirada_escritorio` no mesmo objeto —, o mapa legado de `openEditReceita`, nomes automáticos `Repasse:` → `Reembolso:`, toasts, título/texto do modal "Marcar reembolso como recebido", e os dois títulos do PDF de reembolsos por pessoa).

Nenhum identificador interno foi tocado: `tipo:'repasse'`, `isRepasse`, o campo/funções `repasses` (`getRepassesForMonth`, `toggleRepasse`, `openRegistrarRepasse`, `confirmarRegistroRepasse`, `openRepasseChoice`, `exportRepassesCSV`, `exportarRepassePessoaPDF`) mantiveram nome e assinatura — só os literais de texto que eles produzem mudaram. O fluxo do Caixa do Escritório (`state.office.repasses`, `repasse_escritorio`, `retirada_escritorio`, `renderOfficeRepassesTab`, `realizeOfficeTransfer`, rótulo "Repasse ao Jow") não foi tocado em nenhuma linha.

Testes (`gate5-reembolso-nomenclatura.test.mjs`, 6/6 PASS): nomenclatura nova na interface (título de página + option do dropdown), registro antigo com `tipo:'repasse'` continua funcionando e isento de contribuição, round-trip de export/import preserva `tipo`/`isRepasse`, cálculo de contribuição inalterado antes/depois de reembolsos, fluxo do Caixa do Escritório intacto (`repasse_escritorio` ainda gerado com esse nome), e ausência de duplicação de receitas.

## 3. Contrato do escritório com entrada e parcelamento

Novo bloco de campos no formulário "Novo Projeto" (`renderOfficeProjetosTab`), visível só quando `status==='contratado'` (toggle via `onNewProjStatusChange()`): valor da entrada, data prevista da entrada, checkbox "Entrada já recebida" com data real condicional (`onNewProjEntradaRecebidaChange()`), quantidade de parcelas do saldo (aceita 0), data prevista da 1ª parcela, conta empresarial de destino.

`addOfficeProjeto()` foi estendida: quando `status==='contratado'`, valida (rejeitando sem nenhuma mutação de estado — testado em OF08) contrato ≤0, entrada negativa, entrada > contrato, quantidade de parcelas inválida, entrada marcada como recebida sem data real, saldo>0 com 0 parcelas, saldo parcelado sem data da 1ª parcela, e ausência de conta de destino. Passando a validação, grava os campos financeiros no projeto (opcionais — `valorEntrada`, `dataEntradaPrevista`, `entradaRecebida`, `dataEntradaReal`, `qtdParcelas`, `dataPrimeiraParcela`, `contaDestino`) e chama o novo `gerarRecebiveisContratoOffice(projeto, opts)`, que empurra pra `state.office.recebiveis` (mesma estrutura já usada por `addOfficeRecebivel()`) um recebível "Entrada" (só se entrada>0) e `N` recebíveis "Parcela i/N", chamando `syncDerivedPersonalTransfer(id)` em cada um — exatamente o padrão já existente, nenhum motor paralelo.

### Regras de arredondamento

Tudo convertido pra centavos inteiros logo na validação (`Math.round(valor*100)`). Parcela base = `Math.floor(saldoCentavos/n)`; o resto da divisão inteira (`saldoCentavos - base*n`) é somado inteiro só na última parcela. A soma de entrada + todas as parcelas bate exatamente com o contrato em centavos — testado com o exemplo obrigatório (7800/3000/6x800 = 7800 exato) e com um caso de resto não-trivial (100/3 → 33.33, 33.33, 33.34 = 100.00 exato).

### Regras de geração dos recebíveis

Datas mensais das parcelas usam o dia da 1ª parcela, com `addMonths` pra avançar mês/ano e `Math.min(dia, new Date(ano,mes,0).getDate())` pra clampar no último dia válido quando o mês de destino não tem esse dia (ex.: dia 31 cai em 28/fev — testado explicitamente em OF06, incluindo a virada de ano). Entrada nasce `previsto` (com `dataPrevista`) ou já `recebido` (com `dataRecebimento` = data real informada) conforme o checkbox; parcelas sempre nascem `previsto`. A geração só roda dentro de `addOfficeProjeto()` — uma ação explícita de cadastro — nunca em `renderOfficeProjetosTab()` (múltiplos re-renders não duplicam nada, testado em OF11), em `saveEditOfficeProjeto()` (edição não tem os campos financeiros no modal, e não chama a função de geração) nem em `migrateAppData()`/import.

### Proteção do histórico realizado

`saveEditOfficeProjeto()` não foi alterada além do necessário pra continuar funcionando — ela nunca tocou em `state.office.recebiveis` e continua não tocando. Testado (OF12): um projeto com entrada já `recebido`, editado via o fluxo real (`openEditOfficeProjeto`+`saveEditOfficeProjeto`, inclusive mudando `valorContrato`), preserva o mesmo `id`, `estado` e `dataRecebimento` do recebível "Entrada" — nenhuma regeneração, nenhuma reescrita.

### Compatibilidade com backups antigos

Os novos campos do projeto são todos opcionais (`undefined` em projetos antigos). A listagem só mostra o detalhamento de entrada/parcelamento quando `p.status==='contratado' && p.valorEntrada!==undefined` — projeto antigo contratado sem esses campos simplesmente não mostra a linha extra, sem inventar valores (testado em OF13, incluindo `renderOfficeProjetosTab()` não lançando erro).

### Apresentação

A listagem de projetos agora mostra, quando aplicável: contrato, entrada, saldo parcelado (`contrato - entrada`), nº de parcelas, total previsto (soma de recebíveis com `estado==='previsto'`) e total recebido (já existia, via `isOfficeRecebivelRealizado`) — "saldo ainda a receber" é o mesmo total previsto (por construção, `previsto + recebido == contrato` pra um projeto sem cancelamentos).

Testes (`gate5-office-contrato.test.mjs`, 15/15 PASS): exemplo obrigatório (Leandro/7800/3000/6x800), entrada zero, contrato pago integralmente na entrada, divisão com centavos, virada de ano, parcela no dia 31 (clamp), projeto potencial sem geração, todas as validações de rejeição sem mutação, entrada prevista vs. recebida, parcela sempre previsto até ação manual, geração exatamente uma vez, proteção do histórico realizado, backup antigo sem campos novos, export/import preservando recebíveis, e isolamento do caixa pessoal (nenhuma receita pessoal nasce com o valor bruto do contrato — só via a regra de distribuição já existente do Gate 3, que neste teste não foi configurada).

## 4. Sincronização segura com o Google Drive

**Risco 1 corrigido**: `syncFromDrive()` e `saveToDrive()` agora re-lançam (`throw e`) o erro depois de atualizar o indicador (`setDriveStatus`), em vez de engolir. `initApp()` (único caminho que rodava essas funções sem tratar a falha antes) passou a ter `try/catch` explícito ao redor das duas chamadas — o app continua renderizando com o que já está em memória/cache mesmo se o Drive falhar no carregamento; a diferença é que agora essa decisão é visível no código, não um efeito colateral de engolir a exceção dentro da própria função de sync. Os disparos "fire-and-forget" (`scheduleSave()`'s `setTimeout` e `flushPendingSave()`) ganharam `.catch(()=>{})` pra não gerar unhandled rejection no console, já que `saveToDrive()` cuida sozinha do indicador/toast/`finflow_unsynced` nesses casos. `forceSave()` deixou de mostrar "Salvo no Google Drive!" quando a chamada falha — antes disso, como `saveToDrive()` engolia o erro, esse toast de sucesso aparecia mesmo depois de uma falha real de rede (bug do mesmo tipo do Risco 1, latente em `forceSave()`, corrigido pelo mesmo fix).

**Risco 2 corrigido**: `sincronizarAgora()` agora checa `localStorage.getItem('finflow_unsynced')==='1'` primeiro. Se houver pendência local, chama só `saveToDrive()` (nunca `syncFromDrive()`) — replicando a mesma regra que `initApp()` já aplicava no carregamento. Só quando não há pendência é que o caminho de download (`syncFromDrive(true)` + re-render) roda. Sem repetição automática: uma tentativa por clique, sem retry.

### Tratamento de "Failed to fetch"

Novo helper `friendlyDriveErrorMessage(e)`: se `e.name==='TypeError' && e.message==='Failed to fetch'`, retorna a mensagem amigável fixa pedida no handoff (ambiente/rede, sem credencial); qualquer outro erro mantém o comportamento anterior (mensagem com `e.message` cru). Não há nenhuma lógica nova de reclassificação — o código nunca infere token expirado/permissão/401/403 a partir de uma falha de transporte; essas categorias só existiam (e continuam existindo, inalteradas) dentro de `driveRequest()`, que já lança erros específicos quando a Google efetivamente responde com esses códigos HTTP. O detalhe técnico original (`e.message`, ex. "Failed to fetch") continua indo pro `title` do indicador via `setDriveStatus(status,label,detail)`, inalterado.

### Diferença entre correção de código e bloqueio ambiental

Este gate corrigiu: (a) o app nunca mais afirma sucesso falso depois de uma falha real de rede/Drive; (b) o app nunca mais arrisca substituir uma edição local não sincronizada por uma versão remota desatualizada; (c) a mensagem mostrada ao usuário para "Failed to fetch" agora orienta a investigar causa ambiental, em vez de ficar genérica. Este gate **não corrigiu, nem afirma ter corrigido**, nenhuma causa ambiental real (bloqueio de rede, proxy da Prefeitura, origem do Live Server não autorizada no cliente OAuth, ou o app sendo aberto via `file://`) — essas só podem ser confirmadas testando de verdade nesta máquina e nesta rede, o que está fora do alcance desta sessão (sem acesso à rede da Prefeitura nem a credenciais OAuth reais).

Documentado aqui, como pedido no handoff: (1) a origem de onde o Live Server serve o app precisa estar cadastrada como origem autorizada no cliente OAuth do Google Cloud Console; (2) o app precisa ser servido por HTTP/HTTPS (ex. Live Server, `localhost`) — aberto via `file://`, o fluxo OAuth/Drive não funciona, independente de qualquer correção de código.

Testes (`gate5-drive-sync-safety.test.mjs`, 9/9 PASS, usando `fetch` mockado em nível de página — sem tocar OAuth real): rejeição com `TypeError('Failed to fetch')` propaga através de `saveToDrive()`; falha no upload mantém `finflow_unsynced` e o cache local intactos; falha no upload nunca chama `syncFromDrive()` nem `migrateAppData()` com dados remotos; falha não produz toast de sucesso; sucesso remove `finflow_unsynced`; sincronização remota funciona normalmente depois de um upload bem-sucedido; erro de download é propagado por `syncFromDrive()` e nunca produz status `'synced'`; estado em memória preservado após falha; mensagem amigável exibida sem token/Client ID em toast ou indicador.

## Resultado da suíte completa

```
cd tests/financial-engine && npm test
```

Executado duas vezes após a implementação completa, ambas: `FINFLOW FINANCIAL-ENGINE SUITE: TOTAL_PASS=347 TOTAL_FAIL=0` (305 pré-existentes + 42 novos: 12+6+15+9). Nenhum `[FAIL]` em nenhuma das duas execuções.

## `git diff --check`

Saída vazia, exit code 0 — sem erros de espaço em branco.

## Limitações conhecidas

- O flake `301/1` visto numa única execução do baseline (antes de qualquer edição) não foi investigado a fundo por estar fora do escopo autorizado; não se repetiu nas duas execuções seguintes do baseline nem em nenhuma das execuções pós-implementação. Recomenda-se ao Codex rodar a suíte mais de uma vez durante a auditoria, como praxe já registrada em `docs/PROGRESS.md`.
- A correção do Drive (achado 4) foi validada com `fetch` mockado em nível de página, nunca contra o Google real — não há e não pode haver, nesta sessão, confirmação de que a rede da Prefeitura, o proxy/firewall local ou a configuração de origem do cliente OAuth estão de fato liberados. Teste manual nesta máquina e nesta rede, com login real, é necessário antes de considerar o sintoma original do usuário (`Failed to fetch` / "Erro ao salvar") resolvido na prática — o que este gate garante é que, *quando* essa falha ocorrer, o app nunca mais mente sobre sucesso nem arrisca perder uma edição local.
- `delivery/index.html` não foi tocado (fora do escopo, conforme instrução vigente do repositório) — ele não recebeu nenhuma das quatro correções.
- Achados fora do escopo autorizado não foram corrigidos nem procurados ativamente; nenhum foi encontrado incidentalmente durante esta implementação além dos dois já descritos acima como parte do achado 4 (o toast de falso sucesso em `forceSave()` é uma consequência direta e no mesmo arquivo/função da correção pedida pro Risco 1, não uma correção oportunista fora de escopo).

## Correções após auditoria Codex

Auditoria: `docs/audits/GATE-5-UAT-CORRECTIONS-CODEX.md`, commit `c4f8d39` — resultado **FAIL corretivo**, três achados [P2], nenhum aprovado sem correção. Patch restrito exatamente a esses três achados, sem refatoração oportunista, sobre a implementação auditada `4ae015ee5a3cce94c1e79cb3a27084111fa9a683`.

- Hash inicial deste patch (HEAD no momento em que a correção começou): `c4f8d39fcf8fe9ae7a7c6768f0d091f30ab3ef47`
- Hash final: o commit desta entrega (informado no handoff ao final da sessão) — descendente direto de `c4f8d39`, sem alterar nem fazer squash de `4ae015e` ou `c4f8d39`.

### Achado 1 — entrada prevista sem data

**Reprodução do Codex** (formulário real): entrada de R$500 num contrato de R$500 marcada como não recebida, sem data prevista, era aceita — `{"created":true,"dataPrevista":null}`. `getOfficeReceivables()` exclui qualquer recebível sem data de referência (`dataPrevista`/`dataRecebimento`), então essa entrada nunca aparecia em `getOfficeReceivablesPrevistoTotal(mes,ano)` — o contrato existia, o dinheiro previsto não aparecia em planejamento nenhum.

**Correção**: em `addOfficeProjeto()`, nova validação logo após a checagem de entrada recebida: quando `entradaCent>0 && !entradaRecebida`, exige `dataEntradaPrevista` truthy **e** válida via `isValidISODateString()` (helper já existente no projeto, usado sem duplicar lógica de validação de data). Falha bloqueia o cadastro com toast claro, antes de qualquer `push` em `state.office.projetos`/`state.office.recebiveis` — a ordem de validações no código já garante isso (todas as validações, incluindo a nova, ficam antes do primeiro `state.office.projetos.push(projeto)` do branch `contratado`). Não há fallback silencioso para a data do contrato em nenhum ponto do código — a variável `dataEntradaPrevista` só é lida do campo do formulário. Entrada já recebida continua exigindo `dataEntradaReal` (validação pré-existente, inalterada); quando a entrada recebida também tem `dataEntradaPrevista` preenchida, os dois valores continuam persistidos separadamente no recebível (`dataPrevista` e `dataRecebimento`). Entrada zero (`entradaCent===0`) não passa pela nova condição — continua sem exigir data.

**Reprodução depois da correção**: o mesmo cenário do Codex (entrada 500, contrato 500, sem data, não recebida) agora é rejeitado antes de qualquer `push` — testado em OF16.

**Testes adicionados** (`gate5-office-contrato.test.mjs`, OF16-OF21, 6 casos): entrada prevista sem data bloqueia (OF16); data prevista textualmente inválida (`2026-13-40`) bloqueia (OF17); rejeição não cria receita pessoal nem repasse, reforçando ausência total de mutação (OF18); entrada prevista válida aparece exatamente no mês certo em `getOfficeReceivablesPrevistoTotal()` e não no mês anterior (OF19); entrada prevista não conta em `getOfficeReceivedCash()`, entrada recebida conta exatamente uma vez no mês da data real (OF20); entrada zero continua sem exigir data (OF21).

### Achado 2 — valores com mais de duas casas

**Reprodução do Codex**: contrato digitado como `100.005`, entrada zero, três parcelas — `projeto.valorContrato` ficava com o valor bruto (`100.005`), enquanto a soma dos recebíveis (gerados a partir de `contratoCent/100`) dava `100.00999999999999`. `storedContract !== receivablesSum` exatamente.

**Correção**: depois de todas as validações passarem (nenhuma validação nova aqui, só persistência), `addOfficeProjeto()` passou a gravar `projeto.valorContrato = contratoCent/100` e `projeto.valorEntrada = entradaCent/100` — os mesmos centavos inteiros (`Math.round(valor*100)`) já usados para gerar os recebíveis em `gerarRecebiveisContratoOffice()`, nunca mais os valores brutos de `parseFloat`. Isso vale tanto para valores digitados com mais de duas casas quanto para valores "colados" que ignoram o `step="0.01"` do campo HTML (o `step` é só uma dica de UI, nunca validação) — a normalização acontece no handler, não depende do navegador. Sem comparação direta de float em nenhuma invariante: a igualdade contrato==soma-dos-recebíveis é garantida por construção (mesma fonte `contratoCent`/`entradaCent` para ambos), não checada com `===`. Projetos antigos (campo `valorContrato`/`valorEntrada` já gravado antes desta correção, possivelmente com mais de duas casas) não são tocados — a normalização só roda na validação de um cadastro novo, nunca varre nem reescreve `state.office.projetos` existente.

**Reprodução depois da correção**: contrato `100.005` → `Math.round(100.005*100)` = `10001` centavos (`100.005*100` vale `10000.5` em ponto flutuante; `Math.round` de `.5` arredonda pra cima) → `projeto.valorContrato` gravado como `100.01`, e a soma dos recebíveis bate com esse mesmo valor por construção — testado em OF22.

**Testes adicionados** (`gate5-office-contrato.test.mjs`, OF22-OF26, 5 casos): contrato `100.005` normalizado e igual à soma dos recebíveis (OF22); entrada `50.004` normalizada (OF23); valor "colado" com mais casas que o `step` permitiria (`333.336`) normalizado do mesmo jeito (OF24); round-trip de `buildSaveObject()`/`migrateAppData()` preserva os valores já normalizados sem reintroduzir imprecisão (OF25); projeto antigo criado com valores não normalizados (`100.00999999999999`) permanece bit-a-bit inalterado depois de um `renderOfficeProjetosTab()` (OF26) — prova que a correção não reescreve histórico.

### Achado 3 — `initApp()` ainda rejeita após falha inicial do Drive

**Reprodução do Codex**: com `finflow_unsynced==='1'` e sem `finflow_drive_file_id` em cache, `initApp()` chamava `await findDataFile()` **fora** de qualquer `try/catch`. `findDataFile()` só evita rede quando o ID já está em cache — sem cache, ela precisa consultar a API de busca do Drive, e essa chamada usa o `fetch()` global normalmente. Com o `fetch` rejeitando (`TypeError: Failed to fetch`), a exceção subia direto, `initApp()` nunca chegava em `saveToDrive()` nem no `renderAll()` final — a inicialização inteira travava.

**Decisão sobre manter ou remover a pré-busca**: mantida. `findDataFile()` existe justamente para achar um arquivo remoto já existente antes de decidir entre `updateDataFile()` (PATCH) e `createDataFile()` (POST, cria um arquivo novo) dentro de `saveToDrive()` — removê-la reabriria o risco de duplicar o arquivo `finflow_data.json` no Drive sempre que o ID ainda não estivesse em cache local (primeira tentativa de salvar depois de qualquer falha, dispositivo novo, cache limpo etc.). Em vez de remover, sua falha passou a ser tratada explicitamente.

**Correção**: `findDataFile()` e `saveToDrive()` passaram a rodar dentro do mesmo bloco protegido, cada uma com seu próprio `try/catch`:

```js
try { await findDataFile(); } catch(e) {}
try { await saveToDrive(); } catch(e) {}
```

Se `findDataFile()` falhar, o erro é engolido silenciosamente (ela não atualiza o indicador nem mostra toast — nunca atualizou, antes ou depois desta correção) e o código segue para `saveToDrive()` de qualquer forma; como a mesma falha de rede tende a afetar as duas chamadas, é `saveToDrive()` quem acaba assumindo a comunicação com o usuário — ela já propaga a falha (correção do achado 4/Risco 1 do patch anterior) e, no seu próprio `catch`, chama `setDriveStatus('error',...)` e `toast(friendlyDriveErrorMessage(e))` antes de relançar. O `try/catch` externo ao redor de `saveToDrive()` garante que essa relançada não derruba `initApp()` — a função sempre chega ao `renderAll()` final, usando o que já está em memória (carregado do cache local no início da própria `initApp()`, antes de qualquer tentativa de rede). `finflow_drive_file_id` não é apagado por esse caminho: a única linha que o remove fica depois do `await driveRequest(...)` dentro de `findDataFile()`, nunca alcançada quando o `fetch` rejeita antes de qualquer resposta.

**Reprodução depois da correção**: o mesmo cenário do Codex (`finflow_unsynced='1'`, sem `finflow_drive_file_id`, `fetch` rejeitando com `TypeError('Failed to fetch')`) — `initApp()` completa sem rejeitar, `finflow_unsynced` permanece `'1'`, nenhum dado local é substituído, `renderAll()` é alcançado, o indicador mostra erro com a mensagem amigável, nenhum toast de sucesso aparece — testado em D14/D15.

**Testes adicionados** (`gate5-drive-sync-safety.test.mjs`, D14-D19, 6 casos): fluxo completo e real de `initApp()` (não só as funções isoladas) cobrindo os 7 primeiros itens exigidos — não rejeita, cache local carregado (um marcador exclusivo em `state.despesas` sobrevive ao ciclo completo), `finflow_unsynced` continua `'1'`, nenhum `syncFromDrive()`/download, nenhum dado substituído, `renderAll()` alcançado, `appShell` continua visível (D14); ausência de toast de sucesso, presença da mensagem amigável, ausência de token/Client ID/dado financeiro em qualquer toast ou chamada de `setDriveStatus` (D15); ID de arquivo já em cache faz `findDataFile()` pular a rede — só 1 chamada de `fetch` no total, mesmo assim sem rejeitar (D16); recuperação: depois de uma falha que mantém `finflow_unsynced`, uma nova tentativa com rede disponível limpa a pendência (D17); `initApp()` completo com rede disponível conclui o upload e remove `finflow_unsynced` (D18); com ID já conhecido, `saveToDrive()` sempre atualiza (PATCH) o arquivo existente e nunca dispara uma chamada de criação (`uploadType=multipart`) — ausência de duplicação comprovada dentro do que os mocks permitem, já que não há Drive real nesta suíte (D19).

### Resultado das duas execuções completas pós-patch

```
cd tests/financial-engine && npm test
```

Executado duas vezes: ambas `FINFLOW FINANCIAL-ENGINE SUITE: TOTAL_PASS=364 TOTAL_FAIL=0` (347 anteriores + 17 novos: 11 em `gate5-office-contrato.test.mjs` [OF16-OF26] + 6 em `gate5-drive-sync-safety.test.mjs` [D14-D19]). Nenhum `[FAIL]` em nenhuma das duas execuções, sem reprodução de nenhum flake.

### `git diff --check`

Saída vazia (só avisos padrão de normalização de fim de linha LF→CRLF do Git no Windows, não erros), exit code 0.

### Limitações ambientais do Drive (reafirmadas)

Assim como no relatório original: os três achados corrigidos aqui são comportamento de código, verificado com `fetch` mockado em nível de página — nunca contra o Google real. Nenhuma correção deste patch resolve nem afirma resolver um bloqueio ambiental real (rede da Prefeitura, proxy/firewall, origem do Live Server não autorizada no cliente OAuth, ou o app aberto via `file://`). O que este patch garante é que, mesmo sob essas condições, `initApp()` nunca mais trava a inicialização, o app permanece utilizável com o cache local, e a comunicação de erro ao usuário é honesta e específica.

## Entrega

Dois commits sobre `1d8e4577763447393d4a3e4ea5a612b3955805a9`, branch `gate/5-uat-corrections`: `4ae015e` (implementação original) e o commit desta entrega (patch corretivo restrito aos três achados da auditoria Codex `c4f8d39`, sem alterar nem fazer squash de nenhum commit anterior). Sem push, sem merge, sem rebase. Edição encerrada nesta entrega — aguardando nova auditoria independente do Codex.
