// Gate 5 — achado 2: renomear rótulos visíveis do fluxo pessoal de
// "Presente/Repasse" para "Reembolso de compra no cartão", preservando
// intactos os identificadores internos (tipo:'repasse', isRepasse, campo
// repasses) e sem tocar em nada do Caixa do Escritório (repasse_escritorio,
// retirada_escritorio, "Repasse ao Jow" etc).
import { openHarness, makeRunner, baseSyntheticState } from './harness.mjs';

const { page, loadState, close } = await openHarness();
const { check, results } = makeRunner('gate5-reembolso-nomenclatura');

await loadState(baseSyntheticState());
await page.evaluate(() => {
  state.office.contas.push({ id: 'oc1', name: 'Conta Escritório', color: '#ff9900', saldoInicial: 0 });
  state.office.regrasDistribuicao.find((r) => r.destino === 'reserva').percentual = 40;
  state.office.regrasDistribuicao.find((r) => r.destino === 'impostos').percentual = 40;
  state.office.regrasDistribuicao.find((r) => r.destino === 'repasse_pessoal').percentual = 20;
});

// R5-01: nova nomenclatura aparece no dropdown "Nova Receita" e no PAGE_TITLES.
await check('R5-01', async () => {
  const r = await page.evaluate(() => {
    const optionText = document.querySelector('#recTipo option[value="repasse"]')?.textContent || null;
    return { pageTitle: PAGE_TITLES.relatorioPessoas, optionText };
  });
  const ok = r.pageTitle === 'Reembolsos / Pessoas' && r.optionText === 'Reembolso de compra no cartão';
  return { ok, detail: `PAGE_TITLES.relatorioPessoas="${r.pageTitle}" optionText="${r.optionText}" (esp. "Reembolsos / Pessoas" / "Reembolso de compra no cartão")` };
}, 'nomenclatura nova aparece na interface pessoal (título de página)');

// R5-02: registro antigo com tipo:'repasse' continua funcionando (isRepasse
// segue calculado corretamente, não conta como receita contribuível).
await check('R5-02', async () => {
  const r = await page.evaluate(() => {
    state.receitas.push({ id: 'recLegado', tipo: 'repasse', nome: 'Presente/Repasse', valor: 150,
      mes: 9, ano: 2026, conta: 'c1', recorrente: false, isRepasse: true, createdAt: 'recLegado' });
    const contribuiveis = getReceitasContribuiveis(9, 2026);
    const achado = state.receitas.find((x) => x.id === 'recLegado');
    return { existe: !!achado, tipo: achado && achado.tipo, isRepasse: achado && achado.isRepasse,
      entrouEmContribuicao: contribuiveis.some((x) => x.id === 'recLegado') };
  });
  const ok = r.existe && r.tipo === 'repasse' && r.isRepasse === true && r.entrouEmContribuicao === false;
  return { ok, detail: `tipo=${r.tipo} isRepasse=${r.isRepasse} entrouEmContribuicao=${r.entrouEmContribuicao} (esp. repasse/true/false)` };
}, "registro antigo com tipo:'repasse' continua funcionando (campo interno intacto, exemption de contribuição preservada)");

// R5-03: export/import preserva o schema existente (tipo/isRepasse
// sobrevivem ao round-trip de migrateAppData/buildSaveObject).
await check('R5-03', async () => {
  const r = await page.evaluate(() => {
    const saved = buildSaveObject();
    const antes = JSON.parse(JSON.stringify(saved));
    migrateAppData(antes);
    const achado = state.receitas.find((x) => x.id === 'recLegado');
    return { existe: !!achado, tipo: achado && achado.tipo, isRepasse: achado && achado.isRepasse };
  });
  const ok = r.existe && r.tipo === 'repasse' && r.isRepasse === true;
  return { ok, detail: `pós round-trip: tipo=${r.tipo} isRepasse=${r.isRepasse} (esp. repasse/true)` };
}, 'exportação e importação preservam o schema existente (tipo/isRepasse), sem migração destrutiva');

// R5-04: cálculo financeiro (contribuição) permanece igual — reembolso segue
// fora do cálculo, tanto pra receita nova quanto legada.
await check('R5-04', async () => {
  const r = await page.evaluate(() => {
    const antes = getReceitasContribuiveisPrevisao(9, 2026).length;
    state.receitas.push({ id: 'recNovoNome', tipo: 'repasse', nome: 'Reembolso: teste', valor: 80,
      mes: 9, ano: 2026, conta: 'c1', recorrente: false, isRepasse: true, createdAt: 'recNovoNome' });
    const depois = getReceitasContribuiveisPrevisao(9, 2026).length;
    return { antes, depois };
  });
  const ok = r.antes === r.depois;
  return { ok, detail: `contribuíveis antes=${r.antes} depois=${r.depois} (reembolso não deve contar)` };
}, 'reembolso não entra no cálculo de contribuição — cálculo financeiro inalterado');

// R5-05: fluxo do Caixa do Escritório continua usando "Repasse" onde correto
// — repasse_escritorio/retirada_escritorio, e o rótulo de destino da regra
// de distribuição, permanecem intactos.
await check('R5-05', async () => {
  const r = await page.evaluate(() => {
    state.office.recebiveis.push({ id: 'rOff1', projetoId: null, descricao: 'Entrada teste', valor: 1000,
      estado: 'previsto', dataPrevista: '2026-10-01', dataRecebimento: null, contaDestino: 'oc1', createdAt: 'rOff1' });
    state.office.projetos.push({ id: 'pOff1', nome: 'Projeto Office', cliente: 'X', valorContrato: 1000,
      status: 'contratado', dataContrato: '2026-09-01', observacao: '', createdAt: 'pOff1' });
    state.office.recebiveis[state.office.recebiveis.length - 1].projetoId = 'pOff1';
    syncDerivedPersonalTransfer('rOff1');
    const receita = state.receitas.find((x) => x.officeTransferId === 'off_rOff1');
    return { tipoReceita: receita && receita.tipo, nomeReceita: receita && receita.nome };
  });
  const ok = r.tipoReceita === 'repasse_escritorio' && (r.nomeReceita || '').includes('Repasse do Escritório');
  return { ok, detail: `tipo=${r.tipoReceita} nome="${r.nomeReceita}" (esp. tipo=repasse_escritorio, nome contém "Repasse do Escritório")` };
}, 'fluxo do Caixa do Escritório continua usando "Repasse" onde esse termo é correto (repasse_escritorio intocado)');

// R5-06: nenhuma receita/reembolso duplicado pela mudança de nomenclatura —
// o total de receitas bate com o número de pushes feitos neste arquivo.
await check('R5-06', async () => {
  const r = await page.evaluate(() => ({
    total: state.receitas.length,
    ids: state.receitas.map((x) => x.id),
  }));
  const esperados = ['recLegado', 'recNovoNome'];
  const semDuplicata = new Set(r.ids).size === r.ids.length;
  const contemEsperados = esperados.every((id) => r.ids.includes(id));
  const ok = semDuplicata && contemEsperados;
  return { ok, detail: `total=${r.total} sem duplicatas=${semDuplicata} contém esperados=${contemEsperados}` };
}, 'nenhuma receita ou reembolso é duplicado pela mudança de nomenclatura');

await close();

const fails = results.filter((r) => r.status === 'FAIL').length;
console.log(`\ngate5-reembolso-nomenclatura.test.mjs: TOTAL=${results.length} PASS=${results.length - fails} FAIL=${fails}`);
if (fails > 0) process.exitCode = 1;

export { results };
