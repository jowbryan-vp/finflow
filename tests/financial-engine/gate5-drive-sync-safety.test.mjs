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

// D02/D03: falha no upload mantém finflow_unsynced='1' e o cache local
// reflete o snapshot ATUAL do app (não um cache antigo/obsoleto, nem
// ausente). Reprodução do Codex (docs/audits/DRIVE-LARGE-BACKUP-REVIEW.md,
// achado 2): saveToDrive() precisa persistir o snapshot atual e a pendência
// ANTES de tentar a rede — não só depois do sucesso — pra que uma falha logo
// na primeira tentativa (sem nenhum cache/pendência pré-existente) não deixe
// o cache vazio/desatualizado. Este teste remove qualquer cache/pendência
// prévios (em vez de pré-semear um cache artificial obsoleto, que a correção
// agora sobrescreve de propósito) e confirma que o snapshot REAL corrente é
// persistido mesmo com a rede falhando.
await check('D02_D03', async () => {
  const r = await withFailingFetch(() => page.evaluate(async () => {
    localStorage.removeItem('finflow_local_cache');
    localStorage.removeItem('finflow_unsynced');
    state.despesas.push({ id: 'D02_marker', desc: 'snapshot atual no momento da falha', cat: 'geral', subcat: 'Geral',
      cartao: 'dinheiro', conta: 'c1', valor: 55, parcelas: 1, mesInicio: 9, anoInicio: 2026,
      dataCompra: '2026-09-01', fixa: false, diaVencimento: null, debitoAutomatico: false,
      pagoMeses: {}, split: [], repasses: {}, createdAt: 'D02_marker' });
    try { await saveToDrive(); } catch (e) { /* esperado */ }
    const cache = JSON.parse(localStorage.getItem('finflow_local_cache'));
    return {
      unsynced: localStorage.getItem('finflow_unsynced'),
      cacheExiste: !!cache,
      cacheTemMarcadorAtual: !!cache && cache.perfis[cache.perfilAtivo].data.despesas.some((d) => d.id === 'D02_marker'),
    };
  }));
  const ok = r.unsynced === '1' && r.cacheExiste && r.cacheTemMarcadorAtual;
  return { ok, detail: JSON.stringify(r) };
}, 'falha no upload persiste o snapshot ATUAL (não um cache obsoleto ou ausente) e mantém finflow_unsynced=1 — persistência acontece antes da tentativa de rede');

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

// ── Correções pós-auditoria intermediária Codex (docs/audits/DRIVE-LARGE-BACKUP-REVIEW.md, FAIL em 1f48b19) ──
// Achado 1: uma pendência deixada por flushPendingSave() (corpo grande demais
// pra keepalive) nunca se resolvia sozinha ao voltar pra aba — ficava presa
// até a próxima edição/clique manual/reload. D27 testava a recuperação
// chamando saveDrivePending() diretamente, o que não prova que o evento real
// do navegador (visibilitychange→visible, pageshow) de fato dispara alguma
// coisa. D29-D31 abaixo disparam os eventos REAIS (document.dispatchEvent /
// window.dispatchEvent) e confirmam que os listeners registrados em
// index.html (retryPendingSaveOnResume) reagem a eles.
// Achado 2: saveToDrive() só persistia cache/pendência DEPOIS do sucesso —
// uma falha na primeira tentativa (sem scheduleSave() anterior, ex. clique
// direto em "Forçar salvamento") perdia cache e marcador. D02_D03 (acima) já
// cobre isso na função crua; D28 abaixo reproduz literalmente o cenário do
// Codex usando forceSave(), o botão real.
// Achado adicional: medir/limitar keepalive precisa valer no PONTO do envio
// (dentro de saveToDrive()), não só em quem chama — D32 chama saveToDrive(true)
// diretamente (sem passar por flushPendingSave()) com corpo grande e confirma
// que a checagem ainda vale. D33 prova criação concorrente de verdade (sem
// nenhum driveFileId pré-existente, duas chamadas “simultâneas”), diferente
// de D26 (que usa um ID já existente e por isso nunca testava criação).

function withVisibilityOverride(fn) {
  return (async () => {
    await page.evaluate(() => {
      window.__visibilityValue = 'visible';
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => window.__visibilityValue });
    });
    try { return await fn(); }
    finally {
      await page.evaluate(() => { delete document.visibilityState; delete window.__visibilityValue; });
    }
  })();
}
function dispatchVisibility(value) {
  return page.evaluate((v) => {
    window.__visibilityValue = v;
    document.dispatchEvent(new Event('visibilitychange'));
  }, value);
}

// D28: reprodução literal do achado 2 — cache e pendência removidos, estado
// em memória alterado (sem passar por scheduleSave()), forceSave() (o botão
// real, não saveToDrive() cru) com fetch rejeitando. O snapshot atual e a
// pendência precisam existir depois, mesmo com a rede falhando.
await check('D28', async () => {
  await loadState(baseSyntheticState());
  const r = await withFailingFetch(() => page.evaluate(async () => {
    localStorage.removeItem('finflow_local_cache');
    localStorage.removeItem('finflow_unsynced');
    // Deliberadamente explícito (não depende de estado deixado por um teste
    // anterior no mesmo arquivo/página): caminho de atualização.
    localStorage.setItem('finflow_drive_file_id', 'D28-existing-file-id');
    driveFileId = 'D28-existing-file-id';
    state.despesas.push({ id: 'D28_marker', desc: 'alterado direto no estado, sem scheduleSave', cat: 'geral', subcat: 'Geral',
      cartao: 'dinheiro', conta: 'c1', valor: 77, parcelas: 1, mesInicio: 9, anoInicio: 2026,
      dataCompra: '2026-09-01', fixa: false, diaVencimento: null, debitoAutomatico: false,
      pagoMeses: {}, split: [], repasses: {}, createdAt: 'D28_marker' });
    let threw = null;
    try { await forceSave(); } catch (e) { threw = e.message; }
    const cache = JSON.parse(localStorage.getItem('finflow_local_cache'));
    return {
      threw,
      unsynced: localStorage.getItem('finflow_unsynced'),
      cacheExiste: !!cache,
      cacheTemMarcador: !!cache && cache.perfis[cache.perfilAtivo].data.despesas.some((d) => d.id === 'D28_marker'),
    };
  }));
  const ok = r.threw !== null && r.unsynced === '1' && r.cacheExiste && r.cacheTemMarcador;
  return { ok, detail: JSON.stringify(r) };
}, 'achado 2 (reprodução literal): forceSave() com fetch falhando, sem cache/pendência prévios, ainda persiste o snapshot atual e a pendência antes de tentar a rede');

// D29: evento REAL de visibilitychange→hidden (não chamada direta a
// flushPendingSave()) com payload grande — nenhum fetch é disparado, fica
// pendente. Prova que o listener registrado em index.html realmente reage ao
// evento do navegador, exatamente como a reprodução do Codex (scheduleSave +
// visibilitychange hidden).
await check('D29', async () => {
  await loadState(baseSyntheticState());
  await pushPaddedDespesas(120, 700, 'D29_');
  const r = await withVisibilityOverride(async () => {
    const captured = await withCapturingFetch(async () => {
      await page.evaluate(() => { localStorage.setItem('finflow_drive_file_id', 'existing-file-id'); driveFileId = 'existing-file-id'; scheduleSave(); });
      await dispatchVisibility('hidden');
      return page.evaluate(() => {
        const c = JSON.parse(localStorage.getItem('finflow_local_cache'));
        return {
          calls: window.__fetchCalls,
          unsynced: localStorage.getItem('finflow_unsynced'),
          saveTimerNull: saveTimer === null,
          despesasNoCache: c.perfis[c.perfilAtivo].data.despesas.length,
        };
      });
    });
    return captured;
  });
  const ok = r.calls.length === 0 && r.unsynced === '1' && r.saveTimerNull && r.despesasNoCache === 120;
  return { ok, detail: JSON.stringify(r) };
}, 'achado 1 (evento real): scheduleSave() + visibilitychange→hidden real com payload grande — nenhum fetch, fica pendente (sem perder dado)');

// D30: continuando do mesmo cenário (payload grande, já oculto e pendente),
// um evento REAL de visibilitychange→visible dispara o retry automático
// (retryPendingSaveOnResume, via o listener real) — sem keepalive (sem
// limite de tamanho), sem baixar a versão remota por cima (syncFromDrive()/
// migrateAppData() nunca chamados), e resolve a pendência.
await check('D30', async () => {
  await loadState(baseSyntheticState());
  await pushPaddedDespesas(120, 700, 'D30_');
  await installSpies();
  const r = await withVisibilityOverride(async () => {
    // appHydrated=true simula o que initApp() já teria feito de verdade
    // (hidratar `state` a partir do cache local) — sem isso, retryPendingSaveOnResume()
    // agora se recusa a agir (ver docs/audits/DRIVE-LARGE-BACKUP-REVIEW.md,
    // segunda revisão, e D34/D35 abaixo, que testam exatamente a ausência
    // dessa prontidão).
    await page.evaluate(() => { localStorage.setItem('finflow_drive_file_id', 'existing-file-id'); driveFileId = 'existing-file-id'; appHydrated = true; scheduleSave(); });
    await dispatchVisibility('hidden'); // fica pendente (corpo grande demais pra keepalive)
    const antes = await page.evaluate(() => ({ unsynced: localStorage.getItem('finflow_unsynced') }));
    const depois = await withSucceedingFetch(async () => {
      await dispatchVisibility('visible'); // dispara o listener real — SEM await no lado do teste, é o app que reage
      // dá tempo pro retryPendingSaveOnResume() (disparado pelo listener, não
      // aguardado por este teste) completar o ciclo de envio.
      await page.waitForFunction(() => localStorage.getItem('finflow_unsynced') === null, { timeout: 5000 });
      return page.evaluate(() => ({ unsynced: localStorage.getItem('finflow_unsynced') }));
    });
    return { antes, depois };
  });
  const spy = await readSpy();
  await restoreSpies();
  const ok = r.antes.unsynced === '1' && r.depois.unsynced === null &&
    spy.syncFromDriveCalls === 0 && spy.migrateAppDataCalls === 0;
  return { ok, detail: `${JSON.stringify(r)} syncFromDriveCalls=${spy.syncFromDriveCalls} migrateAppDataCalls=${spy.migrateAppDataCalls}` };
}, 'achado 1 (evento real): visibilitychange→visible real retoma o envio pendente (sem keepalive, sem baixar do Drive) e limpa a pendência');

// D31: mesmo cenário de D29 (payload grande, oculto, pendente), mas a
// retomada vem de 'pageshow' (bfcache) em vez de visibilitychange→visible —
// os dois gatilhos de retomada precisam funcionar independentemente.
await check('D31', async () => {
  await loadState(baseSyntheticState());
  await pushPaddedDespesas(120, 700, 'D31_');
  const r = await withVisibilityOverride(async () => {
    // appHydrated=true simula a hidratação real já concluída (ver comentário em D30).
    await page.evaluate(() => { localStorage.setItem('finflow_drive_file_id', 'existing-file-id'); driveFileId = 'existing-file-id'; appHydrated = true; scheduleSave(); });
    await dispatchVisibility('hidden');
    const antes = await page.evaluate(() => ({ unsynced: localStorage.getItem('finflow_unsynced') }));
    const depois = await withSucceedingFetch(async () => {
      await page.evaluate(() => window.dispatchEvent(new Event('pageshow')));
      await page.waitForFunction(() => localStorage.getItem('finflow_unsynced') === null, { timeout: 5000 });
      return page.evaluate(() => ({ unsynced: localStorage.getItem('finflow_unsynced') }));
    });
    return { antes, depois };
  });
  const ok = r.antes.unsynced === '1' && r.depois.unsynced === null;
  return { ok, detail: JSON.stringify(r) };
}, 'achado 1 (evento real), gatilho alternativo: evento pageshow (retomada do bfcache) também retoma o envio pendente e limpa a pendência');

// D32: chamada DIRETA a saveToDrive(true) com corpo grande — sem passar por
// flushPendingSave() — ainda é recusada (checagem vive no ponto do envio,
// dentro de saveToDrive(), não só em quem chama). Confirma também que o
// rótulo não é "offline" (a rede pode estar disponível — é só o tamanho).
await check('D32', async () => {
  await loadState(baseSyntheticState());
  await pushPaddedDespesas(120, 700, 'D32_');
  const r = await withCapturingFetch(() => page.evaluate(async () => {
    localStorage.setItem('finflow_drive_file_id', 'existing-file-id');
    driveFileId = 'existing-file-id';
    let threw = null, keepaliveTooLarge = false;
    try { await saveToDrive(true); } catch (e) { threw = e.message; keepaliveTooLarge = !!e.finflowKeepaliveTooLarge; }
    return {
      calls: window.__fetchCalls,
      threw, keepaliveTooLarge,
      unsynced: localStorage.getItem('finflow_unsynced'),
    };
  }));
  const semRotuloOffline = !(r.threw || '').toLowerCase().includes('offline');
  const ok = r.calls.length === 0 && r.keepaliveTooLarge && semRotuloOffline && r.unsynced === '1';
  return { ok, detail: JSON.stringify(r) };
}, 'achado adicional: chamada direta a saveToDrive(true) com corpo grande (sem passar por flushPendingSave()) também é recusada, sem tentar a rede e sem rótulo de "offline"');

// D33: criação concorrente DE VERDADE — sem nenhum driveFileId pré-existente
// (diferente de D26, que usa um ID já existente e por isso nunca exercita o
// caminho de criação). Duas chamadas "simultâneas" a saveDrivePending()
// (antes de qualquer uma delas resolver) devem resultar em exatamente 1
// requisição de criação (uploadType=multipart/POST) — a segunda chamada
// reaproveita a mesma promise em voo, nunca abre uma segunda criação.
await check('D33', async () => {
  await loadState(baseSyntheticState());
  const r = await page.evaluate(async () => {
    localStorage.removeItem('finflow_drive_file_id');
    driveFileId = null;
    const calls = [];
    let releaseFirst;
    const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
    let callCount = 0;
    window.__origFetch = window.fetch;
    window.fetch = async (url, opts) => {
      callCount++;
      calls.push({ url: String(url), method: (opts && opts.method) || 'GET' });
      if (callCount === 1) { await firstGate; }
      return { ok: true, status: 200, statusText: 'OK', json: async () => ({ id: 'created-file-id' }), clone() { return this; } };
    };

    scheduleSave();
    const p1 = saveDrivePending(false); // dispara a criação de verdade — fica presa em firstGate
    const p2 = saveDrivePending(false); // "concorrente": chamada antes de p1 resolver
    const samePromise = p1 === p2;

    releaseFirst();
    await p1; await p2;

    window.fetch = window.__origFetch; delete window.__origFetch;
    const createCalls = calls.filter((c) => c.url.includes('uploadType=multipart'));
    return {
      samePromise,
      totalCalls: calls.length,
      createCallsCount: createCalls.length,
      driveFileIdAfter: localStorage.getItem('finflow_drive_file_id'),
      unsynced: localStorage.getItem('finflow_unsynced'),
    };
  });
  const ok = r.samePromise && r.totalCalls === 1 && r.createCallsCount === 1 &&
    r.driveFileIdAfter === 'created-file-id' && r.unsynced === null;
  return { ok, detail: JSON.stringify(r) };
}, 'criação concorrente de verdade (sem ID pré-existente): duas chamadas simultâneas resultam em exatamente 1 criação, nunca duas');

// ── Correções pós-segunda revisão Codex (docs/audits/DRIVE-LARGE-BACKUP-REVIEW.md, FAIL em db261ae) ──
// retryPendingSaveOnResume() (pageshow/visibilitychange->visible) podia
// disparar ANTES de initApp() hidratar `state` a partir do cache local real
// e/ou antes do login — saveToDrive() então construía o corpo a partir do
// estado default/vazio (state inicial declarado no topo do arquivo, ainda
// sem despesas/receitas/etc.) e regravava finflow_local_cache com esse
// snapshot vazio, apagando uma pendência real. A correção exige duas
// condições explícitas (appHydrated===true E accessToken truthy) antes de
// agir — nenhuma delas sozinha basta (accessToken pode ser setado pelo
// callback OAuth antes de initApp() terminar de hidratar).
//
// Os dois testes abaixo desligam appHydrated/accessToken (variáveis reais de
// produção, os mesmos globais que initApp() usa — não um bypass ou atalho
// criado só pro teste) para reproduzir as duas reproduções exatas do Codex.

// D34: reprodução literal — accessToken=null (antes do login), cache real
// com um marcador sintético pendente, finflow_unsynced='1', pageshow
// disparado com fetch rejeitando. Antes da correção: calls=1, cache
// sobrescrito (marcador perdido). Depois: nenhuma tentativa de rede, cache e
// pendência intactos.
await check('D34', async () => {
  await loadState(baseSyntheticState());
  const r = await withVisibilityOverride(() => withCapturingFetch(() => page.evaluate(async () => {
    accessToken = null; // antes da autenticação
    appHydrated = true; // mesmo com a hidratação já concluída, sem token não pode agir
    const cachePendente = { version: 2, perfilAtivo: 'p1', perfis: { p1: { id: 'p1', name: 'Perfil', color: '#000', data: {
      categories: [], cards: [], contas: [], movimentacoesContas: [], receitas: [], pessoas: [], cofrinhos: [], movimentacoesCofrinhos: [],
      excedentes: {}, contribuicaoAjustes: {}, faturasPagas: {}, contribuicaoPaga: {},
      despesas: [{ id: 'D34_marker', desc: 'pending-user-data', cat: 'geral', subcat: 'Geral', cartao: 'dinheiro', conta: 'c1',
        valor: 123, parcelas: 1, mesInicio: 9, anoInicio: 2026, dataCompra: '2026-09-01', fixa: false, diaVencimento: null,
        debitoAutomatico: false, pagoMeses: {}, split: [], repasses: {}, createdAt: 'D34_marker' }],
    } } } };
    localStorage.setItem('finflow_local_cache', JSON.stringify(cachePendente));
    localStorage.setItem('finflow_unsynced', '1');
    window.dispatchEvent(new Event('pageshow'));
    // Dá uma volta de microtask/macrotask pra qualquer reação assíncrona do
    // listener (se o guard falhar) ter chance de rodar antes de checarmos.
    await new Promise((r) => setTimeout(r, 50));
    const cache = JSON.parse(localStorage.getItem('finflow_local_cache'));
    return {
      calls: window.__fetchCalls,
      unsynced: localStorage.getItem('finflow_unsynced'),
      cachePreservado: cache.perfis.p1.data.despesas.some((d) => d.id === 'D34_marker'),
    };
  })));
  const ok = r.calls.length === 0 && r.unsynced === '1' && r.cachePreservado;
  return { ok, detail: JSON.stringify(r) };
}, 'achado da segunda revisão (reprodução literal, sem token): pageshow antes do login não tenta a rede nem sobrescreve o cache pendente');

// D35: token presente, mas appHydrated ainda false (initApp() não terminou
// de hidratar `state`) — mesmo com accessToken válido, pageshow não pode
// agir, porque o `state` em memória ainda não reflete o cache real.
await check('D35', async () => {
  await loadState(baseSyntheticState());
  const r = await withVisibilityOverride(() => withCapturingFetch(() => page.evaluate(async () => {
    accessToken = 'test-token-not-a-real-credential';
    appHydrated = false; // initApp() ainda não hidratou state a partir do cache
    const cachePendente = { version: 2, perfilAtivo: 'p1', perfis: { p1: { id: 'p1', name: 'Perfil', color: '#000', data: {
      categories: [], cards: [], contas: [], movimentacoesContas: [], receitas: [], pessoas: [], cofrinhos: [], movimentacoesCofrinhos: [],
      excedentes: {}, contribuicaoAjustes: {}, faturasPagas: {}, contribuicaoPaga: {},
      despesas: [{ id: 'D35_marker', desc: 'pending-user-data', cat: 'geral', subcat: 'Geral', cartao: 'dinheiro', conta: 'c1',
        valor: 456, parcelas: 1, mesInicio: 9, anoInicio: 2026, dataCompra: '2026-09-01', fixa: false, diaVencimento: null,
        debitoAutomatico: false, pagoMeses: {}, split: [], repasses: {}, createdAt: 'D35_marker' }],
    } } } };
    localStorage.setItem('finflow_local_cache', JSON.stringify(cachePendente));
    localStorage.setItem('finflow_unsynced', '1');
    document.dispatchEvent(new Event('visibilitychange')); // window.__visibilityValue já é 'visible' (withVisibilityOverride)
    await new Promise((r) => setTimeout(r, 50));
    const cache = JSON.parse(localStorage.getItem('finflow_local_cache'));
    return {
      calls: window.__fetchCalls,
      unsynced: localStorage.getItem('finflow_unsynced'),
      cachePreservado: cache.perfis.p1.data.despesas.some((d) => d.id === 'D35_marker'),
    };
  })));
  const ok = r.calls.length === 0 && r.unsynced === '1' && r.cachePreservado;
  return { ok, detail: JSON.stringify(r) };
}, 'achado da segunda revisão: token presente mas ainda não hidratado (appHydrated=false) — pageshow/visible não tenta a rede nem sobrescreve o cache pendente, mesmo com accessToken válido');

// D36: estado pronto (appHydrated=true e accessToken válido) — a recuperação
// via pageshow/visible volta a funcionar normalmente, confirmando que a
// correção do achado acima não regride D30/D31 (que já cobrem esse caminho)
// e comprovando explicitamente as duas condições juntas, com o mesmo
// cenário de cache real (não payload grande) usado em D34/D35.
await check('D36', async () => {
  await loadState(baseSyntheticState());
  await page.evaluate(() => {
    accessToken = 'test-token-not-a-real-credential';
    appHydrated = true;
    state.despesas.push({ id: 'D36_marker', desc: 'pending-user-data', cat: 'geral', subcat: 'Geral', cartao: 'dinheiro', conta: 'c1',
      valor: 789, parcelas: 1, mesInicio: 9, anoInicio: 2026, dataCompra: '2026-09-01', fixa: false, diaVencimento: null,
      debitoAutomatico: false, pagoMeses: {}, split: [], repasses: {}, createdAt: 'D36_marker' });
    localStorage.setItem('finflow_drive_file_id', 'existing-file-id');
    driveFileId = 'existing-file-id';
    localStorage.setItem('finflow_unsynced', '1');
  });
  const r = await withSucceedingFetch(async () => {
    await page.evaluate(() => window.dispatchEvent(new Event('pageshow')));
    await page.waitForFunction(() => localStorage.getItem('finflow_unsynced') === null, { timeout: 5000 });
    return page.evaluate(() => ({ unsynced: localStorage.getItem('finflow_unsynced') }));
  });
  const ok = r.unsynced === null;
  return { ok, detail: JSON.stringify(r) };
}, 'achado da segunda revisão, caso positivo: com appHydrated=true e accessToken válido (estado pronto), pageshow retoma o envio normalmente e limpa a pendência');

// ── Correção pós-terceira revisão Codex (docs/audits/DRIVE-LARGE-BACKUP-REVIEW.md, FAIL em 55b1c24) ──
// D37: reprodução literal — cache pendente sintético, token válido,
// driveFileId=null e nenhum ID local em cache, GET de findDataFile() (dentro
// de initApp()) atrasado de propósito. Enquanto esse GET ainda está em voo
// (appHydrated ainda false — só vira true no FINAL de initApp(), depois de
// TODA a inicialização, não só da hidratação síncrona), dispara um pageshow
// real. Antes da correção isso disparava um envio concorrente que criava
// (POST) um arquivo duplicado antes do GET achar o arquivo já existente.
// Depois: o pageshow não faz nada enquanto initApp() ainda está buscando; ao
// liberar o GET (que encontra o arquivo remoto existente), initApp() segue
// seu próprio fluxo e só atualiza (PATCH) esse arquivo — zero POST em
// qualquer momento.
await check('D37', async () => {
  await loadState(baseSyntheticState());
  const r = await page.evaluate(async () => {
    accessToken = 'test-token-not-a-real-credential';
    appHydrated = false;
    driveFileId = null;
    localStorage.removeItem('finflow_drive_file_id');

    const cachePendente = { version: 2, perfilAtivo: 'p1', perfis: { p1: { id: 'p1', name: 'Perfil', color: '#000', data: {
      categories: [], cards: [], contas: [], movimentacoesContas: [], receitas: [], pessoas: [], cofrinhos: [], movimentacoesCofrinhos: [],
      excedentes: {}, contribuicaoAjustes: {}, faturasPagas: {}, contribuicaoPaga: {},
      despesas: [{ id: 'D37_marker', desc: 'pending-user-data', cat: 'geral', subcat: 'Geral', cartao: 'dinheiro', conta: 'c1',
        valor: 321, parcelas: 1, mesInicio: 9, anoInicio: 2026, dataCompra: '2026-09-01', fixa: false, diaVencimento: null,
        debitoAutomatico: false, pagoMeses: {}, split: [], repasses: {}, createdAt: 'D37_marker' }],
    } } } };
    localStorage.setItem('finflow_local_cache', JSON.stringify(cachePendente));
    localStorage.setItem('finflow_unsynced', '1');

    const calls = [];
    let releaseGate;
    const gate = new Promise((resolve) => { releaseGate = resolve; });
    window.__origFetch = window.fetch;
    window.fetch = async (url, opts) => {
      const method = (opts && opts.method) || 'GET';
      calls.push({ url: String(url), method });
      if (method === 'GET') {
        await gate; // segura a busca até o teste liberar
        return { ok: true, status: 200, statusText: 'OK',
          json: async () => ({ files: [{ id: 'existing-remote-id', name: 'finflow_data.json', modifiedTime: '2026-01-01T00:00:00Z' }] }),
          clone() { return this; } };
      }
      return { ok: true, status: 200, statusText: 'OK', json: async () => ({ id: 'existing-remote-id' }), clone() { return this; } };
    };

    const initPromise = initApp(); // GET dispara e fica preso no gate — não aguardado ainda

    await new Promise((resolve) => setTimeout(resolve, 0)); // deixa o GET disparar de verdade
    const appHydratedDuringGet = appHydrated;

    window.dispatchEvent(new Event('pageshow')); // deve ser ignorado — initApp() ainda em andamento

    await new Promise((resolve) => setTimeout(resolve, 20)); // dá tempo pro pageshow "vazar" se o guard falhar
    const callsBeforeRelease = calls.length;

    releaseGate(); // libera o GET — encontra o arquivo já existente
    await initPromise;

    window.fetch = window.__origFetch; delete window.__origFetch;

    const postCalls = calls.filter((c) => c.url.includes('uploadType=multipart'));
    const patchCalls = calls.filter((c) => c.method === 'PATCH');
    const marker = state.despesas.find((d) => d.id === 'D37_marker');
    return {
      appHydratedDuringGet,
      appHydratedAfter: appHydrated,
      callsBeforeRelease,
      totalCalls: calls.length,
      postCallsCount: postCalls.length,
      patchCallsCount: patchCalls.length,
      patchUrls: patchCalls.map((c) => c.url),
      unsynced: localStorage.getItem('finflow_unsynced'),
      markerPreserved: !!marker && marker.valor === 321,
    };
  });
  const ok = r.appHydratedDuringGet === false && r.appHydratedAfter === true &&
    r.callsBeforeRelease === 1 && r.postCallsCount === 0 && r.patchCallsCount === 1 &&
    r.patchUrls.every((u) => u.includes('existing-remote-id')) &&
    r.unsynced === null && r.markerPreserved;
  return { ok, detail: JSON.stringify(r) };
}, 'achado da terceira revisão (reprodução literal): pageshow durante o GET (ainda em voo) de findDataFile() dentro de initApp() não dispara nada — zero POST em qualquer momento, apenas 1 PATCH no arquivo já encontrado');

await close();

const fails = results.filter((r) => r.status === 'FAIL').length;
console.log(`\ngate5-drive-sync-safety.test.mjs: TOTAL=${results.length} PASS=${results.length - fails} FAIL=${fails}`);
if (fails > 0) process.exitCode = 1;

export { results };
