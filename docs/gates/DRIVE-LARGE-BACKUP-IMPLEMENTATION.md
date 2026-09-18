# Correção — Drive e payload maior que 64 KiB — relatório de implementação

- Branch: `gate/5-uat-corrections`
- HEAD antes desta correção: `56ef03bd1c265afa7faf0b82da64a589e8f13968` (baseline confirmado pelo Codex: `TOTAL_PASS=374 TOTAL_FAIL=0`)
- HEAD final: ver commit informado no handoff ao final da sessão (um único commit sobre este HEAD)
- Escopo autorizado: exclusivamente `docs/gates/DRIVE-LARGE-BACKUP-SCOPE.md` — persistência e envio do backup ao ocultar/fechar/retomar a página. Nenhuma regra financeira, "Guardar em caixa" ou aba de cartões foi tocada.

## Arquivos alterados

- `index.html` — a correção de produto.
- `tests/financial-engine/gate5-drive-sync-safety.test.mjs` — 8 casos novos (D20–D27), acrescentados ao arquivo de testes do achado 4 já existente (já estava listado em `run-all.mjs`, nenhuma mudança necessária lá).
- `docs/gates/DRIVE-LARGE-BACKUP-IMPLEMENTATION.md` (este arquivo).

## O problema, como estava antes desta correção

`flushPendingSave()` (disparada em `visibilitychange`→`hidden` e em `pagehide`) chamava incondicionalmente `saveToDrive(true)`, ou seja, **sempre** com `keepalive:true`, qualquer que fosse o tamanho do backup:

```js
function flushPendingSave() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; saveToDrive(true).catch(()=>{}); }
}
```

O navegador limita o corpo de **qualquer** requisição `fetch` com `keepalive:true` a ~64 KiB (a mesma regra do `navigator.sendBeacon`). O backup do FinFlow inclui o histórico inteiro (despesas, receitas, repasses, todos os perfis) e cresce com o uso — o handoff registra um backup real de ~74.569 bytes compactado, já acima do limite. Nesse cenário, ocultar a aba ou fechá-la tentava enviar um corpo maior que o permitido; o navegador rejeitava a requisição, e o usuário via "Erro ao salvar" mesmo com o salvamento normal e o botão "Sincronizar agora" funcionando (esses dois caminhos nunca usaram `keepalive`).

Isso é verificável diretamente no código anterior (`git show 56ef03b:index.html` mantém essa versão) e é exatamente o que os novos testes D21/D22 exercitam: rodados contra essa versão anterior, `flushPendingSave()` chamaria `fetch` com `keepalive:true` e um corpo grande incondicionalmente — as asserções `calls.length === 0` desses dois testes falhariam, porque o código antigo sempre tenta a rede, não importa o tamanho. Não foi possível re-executar os testes ao vivo contra o HEAD anterior nesta sessão (a operação de reversão temporária do arquivo via `git stash`/`checkout` para esse fim específico foi bloqueada pelo sistema de permissões do ambiente), mas a leitura do diff abaixo mostra exatamente qual linha condicional (ausente antes) elimina a tentativa de rede para corpos grandes.

## Correção

### 1. Medição do corpo efetivamente enviado, em bytes UTF-8, incluindo o envelope multipart na criação

Novo helper `buildMultipartCreateBody(content)` — extraído do corpo de `createDataFile()` (que passou a chamá-lo), para que a mesma montagem de envelope (boundary + `Content-Type` + metadados + payload) usada no envio real seja também usada na medição de tamanho, sem duplicar a lógica.

Novo `estimateSaveBodyBytes(saveObj)`: se já existe `driveFileId` (caminho de atualização, `PATCH`/`uploadType=media`), mede o JSON puro; caso contrário (caminho de criação, `POST`/`uploadType=multipart`), mede o envelope multipart completo — o mesmo que `createDataFile()` de fato manda. A medição usa `new TextEncoder().encode(str).length` (bytes UTF-8), não `.length` de string (que conta unidades UTF-16) — acentos e emoji ocupam mais de 1 byte cada, e o limite do navegador é sobre bytes na rede, não caracteres.

`KEEPALIVE_SAFE_BYTES = 60 * 1024` — margem abaixo do limite de ~64 KiB (65536 bytes).

### 2. `flushPendingSave()` nunca usa `keepalive:true` acima da margem segura

```js
function flushPendingSave() {
  if (!saveTimer) return;
  clearTimeout(saveTimer);
  saveTimer = null;
  const saveObj = buildSaveObject();
  if (estimateSaveBodyBytes(saveObj) > KEEPALIVE_SAFE_BYTES) {
    setDriveStatus('saving', 'Aguardando (offline)…');
    return;
  }
  saveDrivePending(true).catch(()=>{});
}
```

Quando o corpo excede a margem, a função **não tenta a rede**: não chama `fetch` de jeito nenhum. A decisão de não tentar (em vez de tentar sem `keepalive` mesmo assim) é deliberada — sem `keepalive`, o navegador pode simplesmente abortar a requisição no meio do fechamento da aba, deixando o app sem saber se o Drive recebeu ou não (pior que não tentar, porque geraria um estado ambíguo). O cache local (`finflow_local_cache`) e a pendência (`finflow_unsynced`) já foram gravados por `scheduleSave()` antes de qualquer tentativa de rede (ver seção 4) — nenhum dado é perdido; a versão grande fica só local até a página voltar a ficar viva (próximo envio normal, sem `keepalive`, sem limite de tamanho) ou até a recuperação em `initApp()` na próxima abertura.

Envio normal (o `setTimeout` de 2.5s do `scheduleSave()`, o botão "Sincronizar agora" e "Forçar salvamento") nunca usa `keepalive` — não tem limite de 64 KiB e continua tentando a rede normalmente para qualquer tamanho de corpo (testado em D24).

### 3. Persistência do snapshot local e da pendência antes de qualquer tentativa de rede, inclusive envio manual

`scheduleSave()` já gravava `finflow_local_cache` e `finflow_unsynced` antes de agendar o envio (comportamento pré-existente, preservado). Isso cobre tanto o envio automático (debounce de 2.5s) quanto o flush de fechamento — `flushPendingSave()` só cancela o timer e decide se tenta a rede; nunca é ele quem grava o snapshot pela primeira vez.

### 4. Sem limpar pendência nem regravar o snapshot antigo se uma edição nova ocorrer durante o envio; sem envios concorrentes conflitantes; sem duplicar criação

Esta era uma lacuna real do código anterior, não coberta pelos achados 1–3 do gate anterior: `saveToDrive()` sempre limpava `finflow_unsynced` e regravava `finflow_local_cache` com o `saveObj` que ela mesma tinha acabado de construir e enviar — mesmo que uma edição nova tivesse acontecido *durante* o envio (entre o início do `fetch` e sua resposta). Nesse cenário, a pendência era apagada apesar de existir uma versão mais nova ainda não confirmada no Drive, e o cache podia regredir para uma versão mais velha que a que `scheduleSave()` já tinha gravado.

Correção com um contador de geração:

```js
let saveGeneration = 0; // incrementado a cada scheduleSave() (cada edição local)
```

`saveToDrive(useKeepalive)` agora captura `startGeneration = saveGeneration` **antes** de construir/enviar o corpo. Depois do envio confirmado: só limpa `finflow_unsynced` e regrava `finflow_local_cache` se `saveGeneration === startGeneration` (nenhuma edição nova aconteceu durante o envio). Caso contrário, deixa tudo como está — o cache mais novo (gravado por `scheduleSave()` da edição nova) permanece intacto, a pendência permanece marcada.

Novo ponto único de disparo, `saveDrivePending(useKeepalive)`, garante no máximo uma requisição em voo por vez (todo disparo — timer de 2.5s, flush, botão manual, recuperação em `initApp()` — passa por ele) e encadeia automaticamente um reenvio (sem `keepalive`, pois a página está viva) quando a geração mudou durante um envio:

```js
let inFlightSavePromise = null;
function saveDrivePending(useKeepalive) {
  if (inFlightSavePromise) return inFlightSavePromise;
  inFlightSavePromise = runSaveCycle(useKeepalive).finally(() => { inFlightSavePromise = null; });
  return inFlightSavePromise;
}
async function runSaveCycle(useKeepalive) {
  const startGeneration = saveGeneration;
  await saveToDrive(useKeepalive);
  if (saveGeneration !== startGeneration) { await runSaveCycle(false); }
}
```

Como só existe uma requisição em voo por vez e `driveFileId` já foi definido pela primeira criação bem-sucedida antes de qualquer reenvio ocorrer, o reenvio encadeado sempre usa `updateDataFile()` (PATCH) — nunca `createDataFile()` (POST) — mesmo quando uma edição acontece durante a própria criação inicial do arquivo. Isso elimina o risco de duplicar o arquivo `finflow_data.json` no Drive nesse cenário (testado em D26).

`forceSave()` e `sincronizarAgora()` (que antes chamavam `saveToDrive()` diretamente) passaram a chamar `saveDrivePending()`, então também ficam protegidos pelo mesmo lock — um clique no botão manual enquanto um envio automático já está em voo não abre uma segunda requisição concorrente, apenas se junta ao envio (ou ao reenvio encadeado, se uma edição aconteceu nesse meio-tempo) já em andamento. A recuperação em `initApp()` (achado 3 do gate anterior, preservada sem mudança de comportamento) também passou a chamar `saveDrivePending()` em vez de `saveToDrive()` direto, pela mesma razão.

### 5. Ocultar/fechar repetidamente não duplica requisições

`flushPendingSave()` só age quando `saveTimer` não é `null` (existe um envio agendado pendente); ela zera `saveTimer` antes de decidir se tenta a rede. Chamadas repetidas de `flushPendingSave()` sem uma edição nova entre elas encontram `saveTimer === null` e retornam imediatamente, sem novo `fetch` (testado em D25 — três chamadas seguidas, 1 único `fetch`).

### 6. Retomar a página tenta recuperar pendências sem baixar a versão remota por cima delas

Nenhuma mudança na lógica de decisão em `initApp()` (que já checava `finflow_unsynced==='1'` para nunca chamar `syncFromDrive()` quando há pendência local — achados 1/2 do gate anterior). A única mudança ali foi trocar a chamada direta a `saveToDrive()` por `saveDrivePending()`, pela razão de concorrência da seção 4 — o comportamento de recuperação em si (tentar reenviar o local, nunca baixar por cima) é o mesmo, coberto pelos testes D14–D19 já existentes (todos continuam passando).

### 7. Sucesso visual só após confirmação; erro mantém cache e pendência; ausência de token não perde dados

Sem mudança nessa parte — já corrigida no gate anterior (achado 4, riscos 1/2) e coberta pelos testes D01–D19 pré-existentes, todos continuam passando sem alteração.

## Testes

`tests/financial-engine/gate5-drive-sync-safety.test.mjs`, casos novos D20–D27 (8 casos), somados aos D01–D19 pré-existentes (23 casos no arquivo, todos PASS):

- **D20** — payload pequeno: `flushPendingSave()` envia com `keepalive:true` e confirma sucesso.
- **D21** — payload grande (>64 KiB, despesas com descrição longa): `flushPendingSave()` nunca chama `fetch`; pendência e cache local (com os 120 lançamentos) ficam intactos.
- **D22** — texto acentuado: corpo com `.length` (caracteres) abaixo do limite mas bytes UTF-8 acima (`á` = 2 bytes) — confirma que a checagem é byte-accurate, não por tamanho de string; `flushPendingSave()` corretamente não tenta a rede.
- **D23** — na criação (sem `driveFileId`), o tamanho medido inclui o envelope multipart — maior que o JSON puro (`estimateSaveBodyBytes` > `utf8ByteLength(JSON.stringify(saveObj))`).
- **D24** — payload grande, mas envio normal (sem `keepalive`, página viva): a rede É tentada (1 `fetch`), diferente do flush — o limite de 64 KiB só se aplica a `keepalive`.
- **D25** — ocultar/fechar repetidamente sem edição nova entre as chamadas: só 1 `fetch` no total (sem duplicação).
- **D26** — edição durante o envio: uma edição que acontece enquanto um envio mais antigo está em voo não é apagada nem "destrava" a pendência cedo demais (verificado lendo o cache *durante* o envio, antes de liberá-lo); o envio antigo, ao terminar, não limpa `finflow_unsynced` nem regrava o cache; a cadeia reenvia automaticamente a versão nova (2 `fetch` no total) e só esse reenvio confirma sucesso; nenhuma das duas chamadas é `POST`/criação (sem duplicação de arquivo).
- **D27** — recuperação: um payload grande deixado pendente localmente (flush recusou por tamanho) é enviado normalmente (sem `keepalive`) quando a página está viva de novo, limpando a pendência.

Todos os testes usam dados sintéticos (nenhum backup real, nenhuma credencial), com `fetch` mockado em nível de página — sem tocar OAuth real, seguindo o mesmo padrão já usado nos testes D01–D19.

### Resultado das duas execuções completas da suíte

```
cd tests/financial-engine && npm test
```

Executado duas vezes após a implementação completa, ambas: `FINFLOW FINANCIAL-ENGINE SUITE: TOTAL_PASS=382 TOTAL_FAIL=0` (374 pré-existentes + 8 novos). Nenhum `[FAIL]` em nenhuma das duas execuções.

### `git diff --check`

Saída vazia, exit code 0 — sem erros de espaço em branco.

## Limitações conhecidas

- Não foi possível reverter temporariamente `index.html` ao HEAD anterior para rodar os novos testes D21/D22 "ao vivo" contra o código antigo (o comando de reversão foi bloqueado pelo sistema de permissões desta sessão). A demonstração de que o código antigo falharia foi feita por inspeção direta do diff (a checagem de tamanho e o `return` antecipado em `flushPendingSave()` são inteiramente novos — o código anterior chamava `saveToDrive(true)` incondicionalmente) e pela leitura da linha exata removida/adicionada nesta entrega.
- Validado inteiramente com `fetch` mockado em nível de página — nunca contra o Google Drive real. O valor de `KEEPALIVE_SAFE_BYTES` (60 KiB) é uma margem de segurança abaixo do limite documentado de ~64 KiB dos navegadores baseados em Chromium para requisições `keepalive`; o comportamento exato desse limite em produção (rede real, Drive real) não foi e não pode ser confirmado nesta sessão.
- `delivery/index.html` não foi tocado (fora do escopo, conforme instrução vigente do repositório).
- Nenhuma alteração em regras financeiras, "Guardar em caixa" ou abas de cartões — fora do escopo autorizado deste documento (`DRIVE-LARGE-BACKUP-SCOPE.md`); os ajustes correspondentes do handoff (`Guardar em caixa`, aba "Cartões/Faturas") não foram implementados aqui, propositalmente.

## Entrega

Um commit sobre `56ef03bd1c265afa7faf0b82da64a589e8f13968`, branch `gate/5-uat-corrections`. Sem push, sem merge, sem rebase. Edição encerrada nesta entrega — aguardando auditoria independente do Codex.
