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

await close();

const fails = results.filter((r) => r.status === 'FAIL').length;
console.log(`\ngate5-drive-sync-safety.test.mjs: TOTAL=${results.length} PASS=${results.length - fails} FAIL=${fails}`);
if (fails > 0) process.exitCode = 1;

export { results };
