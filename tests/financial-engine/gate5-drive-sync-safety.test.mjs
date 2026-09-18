// Gate 5 — achado 4: sincronização segura com o Google Drive.
// 'Failed to fetch' é falha de TRANSPORTE do navegador (fetch() rejeitado
// antes de qualquer resposta HTTP do Google) — nunca reclassificada como
// token/permissão/401/403. saveToDrive()/syncFromDrive() agora propagam a
// falha; o botão manual nunca baixa dados remotos por cima de alteração
// local pendente (finflow_unsynced==='1').
import { openHarness, makeRunner, baseSyntheticState } from './harness.mjs';

const { page, loadState, close } = await openHarness();
const { check, results } = makeRunner('gate5-drive-sync-safety');

await loadState(baseSyntheticState());
await page.evaluate(() => { accessToken = 'test-token-not-a-real-credential'; });

// Instrumenta toast/setDriveStatus/syncFromDrive/migrateAppData pra
// observar o que cada fluxo realmente chamou, sem depender de detalhes de
// implementação além dos pontos de extensão já expostos em window (funções
// top-level de um <script> clássico viram propriedades de window).
async function installSpies() {
  await page.evaluate(() => {
    window.__spy = { toasts: [], driveStatusCalls: [], syncFromDriveCalls: 0, migrateAppDataCalls: 0 };
    window.__origToast = window.toast;
    window.toast = (msg, dur) => { window.__spy.toasts.push(msg); return window.__origToast(msg, dur); };
    window.__origSetDriveStatus = window.setDriveStatus;
    window.setDriveStatus = (status, label, detail) => { window.__spy.driveStatusCalls.push({ status, label, detail }); return window.__origSetDriveStatus(status, label, detail); };
    window.__origSyncFromDrive = window.syncFromDrive;
    window.syncFromDrive = (...args) => { window.__spy.syncFromDriveCalls++; return window.__origSyncFromDrive(...args); };
    window.__origMigrateAppData = window.migrateAppData;
    window.migrateAppData = (...args) => { window.__spy.migrateAppDataCalls++; return window.__origMigrateAppData(...args); };
  });
}
async function restoreSpies() {
  await page.evaluate(() => {
    window.toast = window.__origToast;
    window.setDriveStatus = window.__origSetDriveStatus;
    window.syncFromDrive = window.__origSyncFromDrive;
    window.migrateAppData = window.__origMigrateAppData;
    delete window.__origToast; delete window.__origSetDriveStatus; delete window.__origSyncFromDrive; delete window.__origMigrateAppData;
  });
}
async function readSpy() {
  return page.evaluate(() => window.__spy);
}

async function withFailingFetch(fn) {
  await page.evaluate(() => {
    window.__origFetch = window.fetch;
    window.fetch = () => Promise.reject(new TypeError('Failed to fetch'));
  });
  try { return await fn(); }
  finally { await page.evaluate(() => { window.fetch = window.__origFetch; delete window.__origFetch; }); }
}
async function withSucceedingFetch(fn) {
  await page.evaluate(() => {
    window.__origFetch = window.fetch;
    window.fetch = () => Promise.resolve({
      ok: true, status: 200, statusText: 'OK',
      json: async () => ({ id: 'fake-file-id', files: [] }),
      clone() { return this; },
    });
  });
  try { return await fn(); }
  finally { await page.evaluate(() => { window.fetch = window.__origFetch; delete window.__origFetch; }); }
}

// D01: fetch rejeitando com TypeError('Failed to fetch') propaga através de
// saveToDrive() — o chamador consegue distinguir sucesso de falha.
await check('D01', async () => {
  const r = await withFailingFetch(() => page.evaluate(async () => {
    let threw = null;
    try { await saveToDrive(); } catch (e) { threw = { name: e.name, message: e.message }; }
    return threw;
  }));
  const ok = r && r.name === 'TypeError' && r.message === 'Failed to fetch';
  return { ok, detail: JSON.stringify(r) };
}, "fetch rejeitando com TypeError('Failed to fetch') propaga através de saveToDrive()");

// D02/D03: falha no upload mantém finflow_unsynced e o cache local intactos.
await check('D02_D03', async () => {
  const r = await withFailingFetch(() => page.evaluate(async () => {
    localStorage.setItem('finflow_local_cache', JSON.stringify({ marker: 'local-before-failure' }));
    localStorage.setItem('finflow_unsynced', '1');
    try { await saveToDrive(); } catch (e) { /* esperado */ }
    return {
      unsynced: localStorage.getItem('finflow_unsynced'),
      cache: localStorage.getItem('finflow_local_cache'),
    };
  }));
  const ok = r.unsynced === '1' && JSON.parse(r.cache).marker === 'local-before-failure';
  return { ok, detail: `finflow_unsynced=${r.unsynced} cache=${r.cache}` };
}, 'falha no upload mantém finflow_unsynced=1 e não sobrescreve o cache local');

// D04/D06: falha no upload (via sincronizarAgora, com finflow_unsynced='1')
// nunca chama syncFromDrive() nem migrateAppData() com dados remotos.
await check('D04_D06', async () => {
  await installSpies();
  await withFailingFetch(() => page.evaluate(async () => {
    localStorage.setItem('finflow_unsynced', '1');
    await sincronizarAgora();
  }));
  const spy = await readSpy();
  await restoreSpies();
  const ok = spy.syncFromDriveCalls === 0 && spy.migrateAppDataCalls === 0;
  return { ok, detail: `syncFromDriveCalls=${spy.syncFromDriveCalls} migrateAppDataCalls=${spy.migrateAppDataCalls} (esp. 0, 0)` };
}, 'falha no upload impede download: sincronizarAgora() nunca chama syncFromDrive() nem migrateAppData() com dados remotos quando há pendência local');

// D05: falha não produz mensagem de sucesso.
await check('D05', async () => {
  await installSpies();
  await withFailingFetch(() => page.evaluate(async () => {
    localStorage.setItem('finflow_unsynced', '1');
    await sincronizarAgora();
  }));
  const spy = await readSpy();
  await restoreSpies();
  const algumSucesso = spy.toasts.some((t) => t.includes('Dados atualizados a partir do Drive') || t.includes('enviadas ao Google Drive'));
  return { ok: !algumSucesso, detail: JSON.stringify(spy.toasts) };
}, 'falha no upload não gera nenhuma mensagem de sucesso');

// D07: sucesso no upload remove finflow_unsynced.
await check('D07', async () => {
  const r = await withSucceedingFetch(() => page.evaluate(async () => {
    localStorage.setItem('finflow_unsynced', '1');
    localStorage.setItem('finflow_drive_file_id', 'fake-file-id');
    await saveToDrive();
    return { unsynced: localStorage.getItem('finflow_unsynced') };
  }));
  return { ok: r.unsynced === null, detail: `finflow_unsynced=${r.unsynced} (esp. null/removido)` };
}, 'sucesso no upload remove finflow_unsynced');

// D08: depois do upload bem-sucedido, a sincronização remota pode continuar
// (não fica permanentemente bloqueada por nenhum estado residual).
await check('D08', async () => {
  const r = await withSucceedingFetch(() => page.evaluate(async () => {
    localStorage.removeItem('finflow_unsynced');
    localStorage.setItem('finflow_drive_file_id', 'fake-file-id');
    let threw = null;
    try { await syncFromDrive(true); } catch (e) { threw = e.message; }
    return { threw, unsynced: localStorage.getItem('finflow_unsynced') };
  }));
  return { ok: r.threw === null, detail: `threw=${r.threw} unsynced=${r.unsynced} (esp. sem erro — sync remota livre pra continuar)` };
}, 'depois de um upload bem-sucedido, uma sincronização remota subsequente funciona normalmente');

// D09/D10: erro de download é propagado e não produz status de sucesso.
await check('D09_D10', async () => {
  await installSpies();
  const r = await withFailingFetch(() => page.evaluate(async () => {
    localStorage.removeItem('finflow_drive_file_id'); // força ida à rede em findDataFile
    let threw = null;
    try { await syncFromDrive(); } catch (e) { threw = { name: e.name, message: e.message }; }
    return threw;
  }));
  const spy = await readSpy();
  await restoreSpies();
  const propagou = r && r.name === 'TypeError' && r.message === 'Failed to fetch';
  const semStatusSucesso = !spy.driveStatusCalls.some((c) => c.status === 'synced');
  const ok = propagou && semStatusSucesso;
  return { ok, detail: `erro propagado=${JSON.stringify(r)} statusCalls=${JSON.stringify(spy.driveStatusCalls)}` };
}, 'erro de download é propagado por syncFromDrive() e nunca produz status "synced" (sucesso falso)');

// D11: estado local (em memória) não é substituído após falha de upload com
// pendência local — um marcador em state.despesas sobrevive intacto.
await check('D11', async () => {
  const r = await withFailingFetch(() => page.evaluate(async () => {
    state.despesas.push({ id: 'marcadorD11', desc: 'marcador não sincronizado', cat: 'geral', subcat: 'Geral',
      cartao: 'dinheiro', conta: 'c1', valor: 42, parcelas: 1, mesInicio: 9, anoInicio: 2026,
      dataCompra: '2026-09-01', fixa: false, diaVencimento: null, debitoAutomatico: false,
      pagoMeses: {}, split: [], repasses: {}, createdAt: 'marcadorD11' });
    localStorage.setItem('finflow_unsynced', '1');
    await sincronizarAgora();
    const achado = state.despesas.find((d) => d.id === 'marcadorD11');
    return { existe: !!achado, valor: achado && achado.valor };
  }));
  const ok = r.existe && r.valor === 42;
  return { ok, detail: `existe=${r.existe} valor=${r.valor} (esp. true/42 — estado em memória preservado após falha)` };
}, 'estado em memória não é substituído após falha de sincronização com pendência local');

// D12/D13: mensagem amigável e indicador nunca expõem token/Client ID/dado
// financeiro — nem em toast nem no title/detail do indicador.
await check('D12_D13', async () => {
  await installSpies();
  await withFailingFetch(() => page.evaluate(async () => {
    localStorage.setItem('finflow_unsynced', '1');
    await sincronizarAgora();
  }));
  const spy = await readSpy();
  await restoreSpies();
  const token = 'test-token-not-a-real-credential';
  const textoCompleto = JSON.stringify(spy.toasts) + JSON.stringify(spy.driveStatusCalls);
  const semToken = !textoCompleto.includes(token) && !textoCompleto.includes('Bearer');
  const mensagemAmigavelPresente = spy.toasts.some((t) => t.includes('Não foi possível conectar ao Google Drive'));
  const ok = semToken && mensagemAmigavelPresente;
  return { ok, detail: `semToken=${semToken} mensagemAmigavelPresente=${mensagemAmigavelPresente} toasts=${JSON.stringify(spy.toasts)}` };
}, 'mensagem amigável de "Failed to fetch" exibida ao usuário, sem token/Client ID em toast ou indicador');

// ── Correções pós-auditoria Codex, achado 3 (docs/audits/GATE-5-UAT-CORRECTIONS-CODEX.md) ──
// findDataFile() só evita ir à rede quando finflow_drive_file_id já está em
// cache. Sem esse cache (cenário comum na primeira tentativa depois de uma
// falha), ela ia à rede FORA de qualquer try/catch dentro de initApp() — um
// fetch rejeitado ali derrubava a inicialização inteira antes do
// renderAll() final. A correção envolve findDataFile() no mesmo bloco
// protegido que saveToDrive().

// D14: fluxo real de initApp() — cache local existente, finflow_unsynced=1,
// SEM finflow_drive_file_id em cache, fetch rejeitando com 'Failed to
// fetch'. Confirma os itens 1-7 do achado 3 numa única execução real.
await check('D14', async () => {
  await installSpies();
  const r = await withFailingFetch(() => page.evaluate(async () => {
    window.__spy.renderAllCalls = 0;
    window.__origRenderAll = window.renderAll;
    window.renderAll = (...args) => { window.__spy.renderAllCalls++; return window.__origRenderAll(...args); };

    // Cache local "real": o estado atual (com um marcador exclusivo desta
    // checagem) serializado como se fosse a última sessão salva.
    state.despesas.push({ id: 'marcadorD14', desc: 'marcador cache local D14', cat: 'geral', subcat: 'Geral',
      cartao: 'dinheiro', conta: 'c1', valor: 77, parcelas: 1, mesInicio: 9, anoInicio: 2026,
      dataCompra: '2026-09-01', fixa: false, diaVencimento: null, debitoAutomatico: false,
      pagoMeses: {}, split: [], repasses: {}, createdAt: 'marcadorD14' });
    localStorage.setItem('finflow_local_cache', JSON.stringify(buildSaveObject()));
    localStorage.removeItem('finflow_drive_file_id');
    localStorage.setItem('finflow_unsynced', '1');

    let rejected = false, rejMsg = null;
    try { await initApp(); } catch (e) { rejected = true; rejMsg = e && e.message; }

    const marcador = state.despesas.find((d) => d.id === 'marcadorD14');
    const out = {
      rejected, rejMsg,
      unsynced: localStorage.getItem('finflow_unsynced'),
      renderAllCalls: window.__spy.renderAllCalls,
      syncFromDriveCalls: window.__spy.syncFromDriveCalls,
      migrateAppDataCalls: window.__spy.migrateAppDataCalls,
      marcadorPreservado: !!marcador && marcador.valor === 77,
      appShellVisivel: document.getElementById('appShell').style.display === 'flex',
    };
    window.renderAll = window.__origRenderAll; delete window.__origRenderAll;
    return out;
  }));
  await restoreSpies();
  // 1) não rejeita; 2) cache local carregado (o próprio marcador prova isso,
  // já que initApp() recarrega o estado a partir do cache no início);
  // 3) unsynced continua '1'; 4) nenhum download (syncFromDriveCalls=0);
  // 5) nada foi substituído (marcador sobrevive); 6) renderAll() alcançado;
  // migrateAppDataCalls===1 é só a carga do cache LOCAL, nunca dados remotos.
  const ok = !r.rejected && r.unsynced === '1' && r.syncFromDriveCalls === 0 &&
    r.marcadorPreservado && r.renderAllCalls >= 1 && r.migrateAppDataCalls === 1 && r.appShellVisivel;
  return { ok, detail: JSON.stringify(r) };
}, 'achado 3: initApp() com pendência local, sem ID de arquivo em cache e fetch falhando não rejeita, preserva tudo e alcança renderAll()');

// D15: dentro do mesmo cenário do D14, nenhum toast de sucesso aparece, a
// mensagem amigável de "Failed to fetch" aparece, e nenhum toast/indicador
// contém token, Client ID ou dado financeiro.
await check('D15', async () => {
  await installSpies();
  await withFailingFetch(() => page.evaluate(async () => {
    localStorage.setItem('finflow_unsynced', '1');
    localStorage.removeItem('finflow_drive_file_id');
    try { await initApp(); } catch (e) {}
  }));
  const spy = await readSpy();
  await restoreSpies();
  const token = 'test-token-not-a-real-credential';
  const semSucesso = !spy.toasts.some((t) => t.includes('Dados atualizados a partir do Drive') || t.includes('Salvo no Google Drive') || t.includes('enviadas ao Google Drive'));
  const mensagemAmigavelPresente = spy.toasts.some((t) => t.includes('Não foi possível conectar ao Google Drive'));
  const textoCompleto = JSON.stringify(spy.toasts) + JSON.stringify(spy.driveStatusCalls);
  const semDadoSensivel = !textoCompleto.includes(token) && !textoCompleto.includes('Bearer') &&
    !textoCompleto.includes('marcadorD14') && !textoCompleto.includes('77');
  const ok = semSucesso && mensagemAmigavelPresente && semDadoSensivel;
  return { ok, detail: `semSucesso=${semSucesso} mensagemAmigavelPresente=${mensagemAmigavelPresente} semDadoSensivel=${semDadoSensivel} toasts=${JSON.stringify(spy.toasts)}` };
}, 'achado 3: nenhum toast de sucesso, mensagem amigável presente, sem token/Client ID/dado financeiro em toast ou indicador');

// D16: caso adicional — com finflow_drive_file_id JÁ em cache, findDataFile()
// não vai à rede (fast path); só a tentativa de upload gera 1 chamada de
// fetch, e initApp() ainda assim não rejeita quando essa chamada falha.
await check('D16', async () => {
  const r = await withFailingFetch(() => page.evaluate(async () => {
    let fetchCalls = 0;
    const wrapped = window.fetch;
    window.fetch = (...args) => { fetchCalls++; return wrapped(...args); };
    localStorage.setItem('finflow_drive_file_id', 'cached-file-id');
    localStorage.setItem('finflow_unsynced', '1');
    let rejected = false;
    try { await initApp(); } catch (e) { rejected = true; }
    return { rejected, fetchCalls, unsynced: localStorage.getItem('finflow_unsynced'), fileId: localStorage.getItem('finflow_drive_file_id') };
  }));
  const ok = !r.rejected && r.fetchCalls === 1 && r.unsynced === '1' && r.fileId === 'cached-file-id';
  return { ok, detail: JSON.stringify(r) };
}, 'achado 3, caso adicional: com ID de arquivo já em cache, findDataFile() não vai à rede — só o upload (1 fetch) roda, e initApp() não rejeita mesmo assim');

// D17: recuperação posterior quando a rede volta — depois de uma falha que
// mantém finflow_unsynced=1, uma nova tentativa com fetch funcionando limpa
// a pendência local.
await check('D17', async () => {
  await withFailingFetch(() => page.evaluate(async () => {
    localStorage.setItem('finflow_unsynced', '1');
    try { await sincronizarAgora(); } catch (e) {}
  }));
  const durante = await page.evaluate(() => localStorage.getItem('finflow_unsynced'));
  const depois = await withSucceedingFetch(() => page.evaluate(async () => {
    await sincronizarAgora();
    return localStorage.getItem('finflow_unsynced');
  }));
  const ok = durante === '1' && depois === null;
  return { ok, detail: `durante a falha=${durante} depois da rede voltar=${depois} (esp. 1, null)` };
}, 'achado 3, caso adicional: recuperação posterior — quando a rede volta, uma nova tentativa limpa finflow_unsynced');

// D18: upload bem-sucedido dentro do próprio fluxo de initApp() (não só
// saveToDrive() isolado) remove finflow_unsynced.
await check('D18', async () => {
  const r = await withSucceedingFetch(() => page.evaluate(async () => {
    localStorage.removeItem('finflow_drive_file_id');
    localStorage.setItem('finflow_unsynced', '1');
    let rejected = false;
    try { await initApp(); } catch (e) { rejected = true; }
    return { rejected, unsynced: localStorage.getItem('finflow_unsynced') };
  }));
  const ok = !r.rejected && r.unsynced === null;
  return { ok, detail: JSON.stringify(r) };
}, 'achado 3, caso adicional: initApp() com rede disponível conclui o upload e remove finflow_unsynced');

// D19: ausência de duplicação do arquivo remoto — com um ID já conhecido,
// saveToDrive() sempre atualiza (PATCH) o arquivo existente, nunca tenta
// criar um segundo (create usa multipart/related), dentro do que os mocks
// desta suíte conseguem comprovar (sem Drive real).
await check('D19', async () => {
  const r = await page.evaluate(async () => {
    const orig = window.fetch;
    const calls = [];
    window.fetch = (url, opts) => {
      calls.push({ url: String(url), method: (opts && opts.method) || 'GET' });
      return Promise.resolve({ ok: true, status: 200, statusText: 'OK', json: async () => ({ id: 'existing-file-id' }), clone() { return this; } });
    };
    localStorage.setItem('finflow_drive_file_id', 'existing-file-id');
    localStorage.setItem('finflow_unsynced', '1');
    await findDataFile(); // fast path: lê do cache local, sem ir à rede
    await saveToDrive();
    window.fetch = orig;
    return { calls, unsynced: localStorage.getItem('finflow_unsynced') };
  });
  const semCriacao = !r.calls.some((c) => c.url.includes('uploadType=multipart'));
  const usouAtualizacao = r.calls.some((c) => c.method === 'PATCH');
  const ok = semCriacao && usouAtualizacao && r.unsynced === null;
  return { ok, detail: `calls=${JSON.stringify(r.calls)} unsynced=${r.unsynced} (esp. sem multipart/create, com PATCH, unsynced=null)` };
}, 'achado 3, caso adicional: com ID conhecido, saveToDrive() sempre atualiza o arquivo existente — nunca cria um segundo');

// ── Correção: limite de ~64 KiB do keepalive e envios seguros/concorrentes
// (docs/gates/DRIVE-LARGE-BACKUP-SCOPE.md, docs/handoffs/HANDOFF-PREFEITURA-2026-09-18.md) ──
// flushPendingSave() (chamada em visibilitychange/pagehide) usava sempre
// keepalive:true, sem checar o tamanho do corpo — o navegador limita o corpo
// de QUALQUER requisição com keepalive a ~64 KiB (mesma regra do
// navigator.sendBeacon); um backup com histórico de vários meses/perfis passa
// fácil desse limite e a requisição falhava silenciosamente. A correção mede
// o corpo efetivamente enviado (bytes UTF-8, incluindo o envelope multipart
// na criação) e nunca usa keepalive acima de uma margem segura abaixo de
// 64 KiB; nesse caso a pendência fica só local, sem tentar a rede. Também
// corrige uma janela de corrida: uma edição durante um envio em voo não pode
// limpar finflow_unsynced nem regravar o cache com o snapshot antigo, e
// vários gatilhos quase simultâneos (timer, flush, botão manual) nunca abrem
// mais de uma requisição concorrente nem criam o arquivo do Drive duas vezes.

// buildSaveObject() envelopa o estado em {version, perfilAtivo, perfis} — o
// cache local salvo em localStorage segue o mesmo formato (não tem
// `.despesas` no nível raiz). Os testes abaixo desembrulham com
// `c.perfis[c.perfilAtivo].data` antes de ler `despesas`.

// Mesmo valor de KEEPALIVE_SAFE_BYTES em index.html — usado aqui só pra
// comparação nas asserções do lado do teste (fora do page.evaluate); o
// comportamento real testado sempre vem da constante de dentro da página.
const KEEPALIVE_SAFE_BYTES_FOR_TEST = 60 * 1024;

async function withCapturingFetch(fn) {
  await page.evaluate(() => {
    window.__fetchCalls = [];
    window.__origFetch = window.fetch;
    window.fetch = (url, opts) => {
      const bodyBytes = opts && opts.body ? new TextEncoder().encode(opts.body).length : 0;
      window.__fetchCalls.push({ url: String(url), method: (opts && opts.method) || 'GET', keepalive: !!(opts && opts.keepalive), bodyBytes });
      return Promise.resolve({ ok: true, status: 200, statusText: 'OK', json: async () => ({ id: 'fake-file-id' }), clone() { return this; } });
    };
  });
  try { return await fn(); }
  finally { await page.evaluate(() => { window.fetch = window.__origFetch; delete window.__origFetch; window.__fetchCalls = undefined; }); }
}
function pushPaddedDespesas(count, padLen, prefix, char) {
  return page.evaluate(({ count, padLen, prefix, char }) => {
    for (let i = 0; i < count; i++) {
      state.despesas.push({
        id: prefix + i, desc: (char || 'x').repeat(padLen), cat: 'geral', subcat: 'Geral',
        cartao: 'dinheiro', conta: 'c1', valor: 1, parcelas: 1, mesInicio: 9, anoInicio: 2026,
        dataCompra: '2026-09-01', fixa: false, diaVencimento: null, debitoAutomatico: false,
        pagoMeses: {}, split: [], repasses: {}, createdAt: prefix + i,
      });
    }
  }, { count, padLen, prefix, char });
}

// D20: payload pequeno — flushPendingSave() envia com keepalive:true e
// confirma sucesso (finflow_unsynced limpo).
await check('D20', async () => {
  await loadState(baseSyntheticState());
  const r = await withCapturingFetch(() => page.evaluate(async () => {
    localStorage.setItem('finflow_drive_file_id', 'existing-file-id');
    scheduleSave();
    flushPendingSave();
    await inFlightSavePromise;
    return { calls: window.__fetchCalls, unsynced: localStorage.getItem('finflow_unsynced') };
  }));
  const ok = r.calls.length === 1 && r.calls[0].keepalive === true &&
    r.calls[0].bodyBytes <= KEEPALIVE_SAFE_BYTES_FOR_TEST && r.unsynced === null;
  return { ok, detail: JSON.stringify(r) };
}, 'payload pequeno: flushPendingSave() envia com keepalive:true e confirma sucesso (finflow_unsynced limpo)');

// D21: payload grande (>64 KiB) — flushPendingSave() NUNCA tenta a rede;
// pendência e cache local (com os dados grandes) ficam intactos.
await check('D21', async () => {
  await loadState(baseSyntheticState());
  await pushPaddedDespesas(120, 700, 'D21_');
  const r = await withCapturingFetch(() => page.evaluate(async () => {
    localStorage.setItem('finflow_drive_file_id', 'existing-file-id');
    scheduleSave();
    flushPendingSave();
    const c = JSON.parse(localStorage.getItem('finflow_local_cache'));
    return {
      calls: window.__fetchCalls,
      unsynced: localStorage.getItem('finflow_unsynced'),
      despesasNoCache: c.perfis[c.perfilAtivo].data.despesas.length,
    };
  }));
  const ok = r.calls.length === 0 && r.unsynced === '1' && r.despesasNoCache === 120;
  return { ok, detail: JSON.stringify(r) };
}, 'payload grande (>64 KiB): flushPendingSave() nunca tenta a rede com keepalive — fica pendente localmente, sem perder dado nenhum');

// D22: medição em bytes UTF-8, não em caracteres — texto acentuado (2 bytes
// por caractere) pode ficar sob o limite em tamanho de string e mesmo assim
// estourar o limite em bytes reais na rede. flushPendingSave() precisa
// detectar esse caso corretamente (byte-accurate), não só por .length.
await check('D22', async () => {
  await loadState(baseSyntheticState());
  await pushPaddedDespesas(2, 20000, 'D22_', 'á');
  const r = await withCapturingFetch(() => page.evaluate(async () => {
    localStorage.setItem('finflow_drive_file_id', 'existing-file-id');
    const saveObj = buildSaveObject();
    const charLength = JSON.stringify(saveObj).length;
    const byteLength = estimateSaveBodyBytes(saveObj);
    scheduleSave();
    flushPendingSave();
    return {
      calls: window.__fetchCalls,
      unsynced: localStorage.getItem('finflow_unsynced'),
      charLength, byteLength,
    };
  }));
  const cenarioValido = r.charLength < KEEPALIVE_SAFE_BYTES_FOR_TEST && r.byteLength > KEEPALIVE_SAFE_BYTES_FOR_TEST;
  const ok = cenarioValido && r.calls.length === 0 && r.unsynced === '1';
  return { ok, detail: JSON.stringify(r) };
}, 'texto acentuado: tamanho em bytes UTF-8 (não em caracteres) estoura o limite — flushPendingSave() detecta corretamente e não tenta a rede');

// D23: na criação (sem finflow_drive_file_id em cache), o tamanho medido
// inclui o envelope multipart que createDataFile() de fato envia — maior que
// o JSON puro do backup.
await check('D23', async () => {
  await loadState(baseSyntheticState());
  const r = await page.evaluate(() => {
    localStorage.removeItem('finflow_drive_file_id');
    driveFileId = null;
    const saveObj = buildSaveObject();
    const rawBytes = utf8ByteLength(JSON.stringify(saveObj));
    const measuredBytes = estimateSaveBodyBytes(saveObj);
    return { rawBytes, measuredBytes };
  });
  const ok = r.measuredBytes > r.rawBytes;
  return { ok, detail: `rawBytes(sem envelope)=${r.rawBytes} measuredBytes(com envelope multipart)=${r.measuredBytes}` };
}, 'na criação, o tamanho medido para a decisão de keepalive inclui o envelope multipart — maior que o JSON puro');

// D24: payload grande, mas envio NORMAL (sem keepalive, página viva) —
// diferente do flush, esse caminho não tem limite de 64 KiB e deve tentar a
// rede normalmente (a falha, se houver, é uma falha de rede comum).
await check('D24', async () => {
  await loadState(baseSyntheticState());
  await pushPaddedDespesas(120, 700, 'D24_');
  const r = await page.evaluate(async () => {
    let fetchCalls = 0;
    window.__origFetch = window.fetch;
    window.fetch = () => { fetchCalls++; return Promise.reject(new TypeError('Failed to fetch')); };
    localStorage.setItem('finflow_drive_file_id', 'existing-file-id');
    scheduleSave();
    let threw = null;
    try { await saveDrivePending(false); } catch (e) { threw = e.message; }
    window.fetch = window.__origFetch; delete window.__origFetch;
    return { threw, fetchCalls, unsynced: localStorage.getItem('finflow_unsynced') };
  });
  const ok = r.threw === 'Failed to fetch' && r.fetchCalls === 1 && r.unsynced === '1';
  return { ok, detail: JSON.stringify(r) };
}, 'payload grande com página viva (sem keepalive): a rede é tentada normalmente, sem o bloqueio de tamanho que só vale pro fechamento da aba');

// D25: ocultar/fechar repetidamente, sem edição nova entre uma chamada e
// outra, não duplica requisições — só 1 fetch no total.
await check('D25', async () => {
  await loadState(baseSyntheticState());
  const r = await withCapturingFetch(() => page.evaluate(async () => {
    localStorage.setItem('finflow_drive_file_id', 'existing-file-id');
    scheduleSave();
    flushPendingSave();
    const firstPromise = inFlightSavePromise;
    flushPendingSave();
    flushPendingSave();
    await firstPromise;
    return { calls: window.__fetchCalls, unsynced: localStorage.getItem('finflow_unsynced') };
  }));
  const ok = r.calls.length === 1 && r.unsynced === null;
  return { ok, detail: JSON.stringify(r) };
}, 'ocultar/fechar repetidamente sem edição nova não duplica requisições — apenas 1 fetch');

// D26: edição durante o envio — uma edição que acontece enquanto um envio
// mais antigo ainda está em voo não pode ser apagada nem "destravada" cedo
// demais: o envio antigo, ao terminar, não limpa finflow_unsynced nem
// regrava o cache com o snapshot velho; a cadeia encadeia automaticamente um
// reenvio com a versão mais nova, e só ESSE reenvio confirma sucesso.
// Também comprova ausência de duplicação de criação (2 chamadas, nenhuma
// delas POST/multipart, já que o arquivo já existe).
await check('D26', async () => {
  await loadState(baseSyntheticState());
  const r = await page.evaluate(async () => {
    localStorage.setItem('finflow_drive_file_id', 'existing-file-id');
    const calls = [];
    let releaseFirst;
    const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
    let callCount = 0;
    window.__origFetch = window.fetch;
    window.fetch = async (url, opts) => {
      callCount++;
      calls.push({ method: (opts && opts.method) || 'GET', keepalive: !!(opts && opts.keepalive) });
      if (callCount === 1) { await firstGate; }
      return { ok: true, status: 200, statusText: 'OK', json: async () => ({ id: 'existing-file-id' }), clone() { return this; } };
    };

    scheduleSave(); // edição #1
    const p = saveDrivePending(false); // dispara o 1º envio — fica preso em firstGate

    // Edição nova ENQUANTO o 1º envio está em voo:
    state.despesas.push({
      id: 'D26_marker', desc: 'edição durante envio', cat: 'geral', subcat: 'Geral',
      cartao: 'dinheiro', conta: 'c1', valor: 99, parcelas: 1, mesInicio: 9, anoInicio: 2026,
      dataCompra: '2026-09-01', fixa: false, diaVencimento: null, debitoAutomatico: false,
      pagoMeses: {}, split: [], repasses: {}, createdAt: 'D26_marker',
    });
    scheduleSave(); // edição #2 — grava o snapshot mais novo no cache local

    const cacheDuringFlight = JSON.parse(localStorage.getItem('finflow_local_cache'));
    const unsyncedDuringFlight = localStorage.getItem('finflow_unsynced');

    releaseFirst(); // libera o 1º envio (antigo, sem a edição #2) pra terminar
    await p; // espera a cadeia inteira (1º envio + reenvio encadeado) terminar

    window.fetch = window.__origFetch; delete window.__origFetch;
    const cacheAfter = JSON.parse(localStorage.getItem('finflow_local_cache'));
    return {
      cacheDuringFlightHasMarker: cacheDuringFlight.perfis[cacheDuringFlight.perfilAtivo].data.despesas.some((d) => d.id === 'D26_marker'),
      unsyncedDuringFlight,
      unsyncedAfter: localStorage.getItem('finflow_unsynced'),
      cacheAfterHasMarker: cacheAfter.perfis[cacheAfter.perfilAtivo].data.despesas.some((d) => d.id === 'D26_marker'),
      totalCalls: calls.length,
      anyCreateCall: calls.some((c) => c.method === 'POST'),
    };
  });
  const ok = r.cacheDuringFlightHasMarker && r.unsyncedDuringFlight === '1' &&
    r.unsyncedAfter === null && r.cacheAfterHasMarker && r.totalCalls === 2 && !r.anyCreateCall;
  return { ok, detail: JSON.stringify(r) };
}, 'edição durante envio: cache/pendência da versão mais nova não são apagados pelo envio antigo em voo; a cadeia reenvia e confirma a versão nova, sem duplicar criação');

// D27: recuperação posterior — um payload grande deixado pendente localmente
// (flush recusou enviar por causa do limite de keepalive) é enviado
// normalmente quando a página está viva de novo (ex.: reabertura), sem o
// limite de tamanho que só vale pro fechamento da aba.
await check('D27', async () => {
  await loadState(baseSyntheticState());
  await pushPaddedDespesas(120, 700, 'D27_');
  const during = await page.evaluate(() => {
    localStorage.setItem('finflow_drive_file_id', 'existing-file-id');
    scheduleSave();
    flushPendingSave(); // grande demais — não tenta a rede, fica pendente
    const c = JSON.parse(localStorage.getItem('finflow_local_cache'));
    return {
      unsynced: localStorage.getItem('finflow_unsynced'),
      despesasNoCache: c.perfis[c.perfilAtivo].data.despesas.length,
    };
  });
  const after = await withSucceedingFetch(() => page.evaluate(async () => {
    await saveDrivePending(false); // "página viva" — envio normal, sem keepalive
    return { unsynced: localStorage.getItem('finflow_unsynced') };
  }));
  const ok = during.unsynced === '1' && during.despesasNoCache === 120 && after.unsynced === null;
  return { ok, detail: `durante=${JSON.stringify(during)} depois=${JSON.stringify(after)}` };
}, 'recuperação: payload grande deixado pendente localmente é enviado normalmente (sem keepalive) quando a página está viva de novo, limpando a pendência');

await close();

const fails = results.filter((r) => r.status === 'FAIL').length;
console.log(`\ngate5-drive-sync-safety.test.mjs: TOTAL=${results.length} PASS=${results.length - fails} FAIL=${fails}`);
if (fails > 0) process.exitCode = 1;

export { results };
