// Coluna de data nas listas de transações (docs/gates/TRANSACTION-DATE-COLUMN.md,
// branch feat/transaction-date-column, base main 784725f).
//
// Só exibição: a data vem do que já está gravado (dataCompra, diaVencimento,
// dataPrevista/dataRecebimento, data de escritório/transferência). Registro
// antigo sem data → célula vazia. Nenhum cálculo, total ou state muda.
// Fixture sintética, relógio fixo em 15/10/2026.
import { openHarness, makeRunner, baseSyntheticState } from './harness.mjs';

const { page, loadState, close, consoleErrors } = await openHarness();
const { check, results } = makeRunner('transaction-date-column');
await page.clock.setFixedTime(new Date(2026, 9, 15, 12));
await page.reload({ waitUntil: 'domcontentloaded' });

const despesa = (over) => ({
  cat: 'geral', subcat: 'Geral', cartao: 'dinheiro', conta: 'c1', parcelas: 1, dataCompra: null,
  fixa: false, diaVencimento: null, debitoAutomatico: false, ignorarAntes: null, pagoMeses: {},
  split: [], repasses: {}, mesInicio: 10, anoInicio: 2026, ...over, createdAt: over.id,
});
const receitaNova = (over) => ({
  tipo: 'projeto', certeza: 'contratado', valor: 1000, mes: 10, ano: 2026, competenciaMes: 10,
  competenciaAno: 2026, conta: 'c1', recorrencia: null, ...over, createdAt: over.id,
});
const fixture = () => baseSyntheticState({
  despesas: [
    despesa({ id: 'dPix', desc: 'Compra PIX datada', valor: 80, dataCompra: '2026-10-05' }),
    despesa({ id: 'dLegado', desc: 'Compra antiga sem data', valor: 40 }),
    despesa({ id: 'dFixa', desc: 'Aluguel fixo', valor: 1500, fixa: true, diaVencimento: 31, mesInicio: 1 }),
    despesa({ id: 'dParcPix', desc: 'Curso parcelado PIX', valor: 300, parcelas: 3, diaVencimento: 8, mesInicio: 9 }),
    despesa({ id: 'dCartao', desc: 'Compra no cartão', cartao: 'nu', conta: null, valor: 200, parcelas: 2, dataCompra: '2026-09-20', mesInicio: 10 }),
  ],
  receitas: [
    { id: 'rLegado', tipo: 'outro', nome: 'Receita antiga', valor: 100, mes: 10, ano: 2026, recorrente: false, createdAt: 'rLegado' },
    receitaNova({ id: 'rRecebida', nome: 'Projeto recebido', estado: 'recebido', dataPrevista: '2026-10-20', dataRecebimento: '2026-10-12' }),
    receitaNova({ id: 'rPrevista', nome: 'Projeto previsto', estado: 'previsto', dataPrevista: '2026-10-25', dataRecebimento: null }),
  ],
  movimentacoesContas: [
    { id: 'm1', contaId: 'c1', valor: -50, data: '2026-10-03T16:00:00.000Z', transferId: 't1', obs: 'Transferência para Conta 2 — teste' },
    { id: 'm2', contaId: 'c2', valor: 50, data: '2026-10-03T16:00:00.000Z', transferId: 't1', obs: 'Transferência de Conta 1 — teste' },
  ],
  contas: [
    { id: 'c1', name: 'Conta 1', color: '#5b7fff', saldoInicial: 1000 },
    { id: 'c2', name: 'Conta 2', color: '#38e2b4', saldoInicial: 0 },
  ],
});

// Lê [data, nome] de cada .item-row de um container.
const rowsOf = (sel) => page.evaluate((s) => [...document.querySelectorAll(`${s} .item-row`)].map((r) => ({
  first: r.firstElementChild?.className || '',
  date: r.querySelector('.item-row-date')?.textContent ?? null,
  name: (r.querySelector('.item-row-name')?.textContent || '').trim(),
})), sel);
const byName = (rows, part) => rows.find((r) => r.name.includes(part));
const stateSnapshot = () => page.evaluate(() => JSON.stringify(state));

try {
  await loadState(fixture());
  await page.evaluate(() => { currentMonth = 10; currentYear = 2026; });
  const stateAntes = await stateSnapshot();
  const totaisAntes = await page.evaluate(() => JSON.stringify(getTotalsForMonth(10, 2026)));

  await check('TDC_01_DESPESA_RULES', async () => {
    const r = await page.evaluate(() => {
      const d = (id) => state.despesas.find((x) => x.id === id);
      return {
        pix: getDataExibicaoDespesa(d('dPix'), 10, 2026),
        legado: getDataExibicaoDespesa(d('dLegado'), 10, 2026),
        fixaOut: getDataExibicaoDespesa(d('dFixa'), 10, 2026),
        fixaFev: getDataExibicaoDespesa(d('dFixa'), 2, 2027),
        fixaSemMes: getDataExibicaoDespesa(d('dFixa')),
        parcPix: getDataExibicaoDespesa(d('dParcPix'), 10, 2026),
        cartao: getDataExibicaoDespesa(d('dCartao'), 11, 2026),
        fixaCompraInicio: getDataExibicaoDespesa({ fixa: true, dataCompra: '2026-03-04', mesInicio: 3, anoInicio: 2026 }, 3, 2026),
        fixaCompraDepois: getDataExibicaoDespesa({ fixa: true, dataCompra: '2026-03-04', mesInicio: 3, anoInicio: 2026 }, 4, 2026),
        invalida: getDataExibicaoDespesa({ dataCompra: '2026-13-40' }, 10, 2026),
      };
    });
    const esperado = { pix: '2026-10-05', legado: null, fixaOut: '2026-10-31', fixaFev: '2027-02-28', fixaSemMes: null,
      parcPix: '2026-10-08', cartao: '2026-09-20', fixaCompraInicio: '2026-03-04', fixaCompraDepois: null, invalida: null };
    return { ok: JSON.stringify(r) === JSON.stringify(esperado), detail: `obtido=${JSON.stringify(r)}` };
  }, 'despesa: data da compra; vencimento do mês para fixa/PIX sem compra; antiga ou inválida → vazio');

  await check('TDC_02_RECEITA_RULES', async () => {
    const r = await page.evaluate(() => {
      const rec = (id) => getReceitasForMonth(10, 2026).find((x) => x.id === id);
      return {
        legado: getDataExibicaoReceita(rec('rLegado')),
        recebida: getDataExibicaoReceita(rec('rRecebida')),
        prevista: getDataExibicaoReceita(rec('rPrevista')),
        parcelaExtra: getDataExibicaoReceita({ _isParcela: true, certeza: 'contratado', dataPrevista: '2026-10-01' }),
        recorrenteRecebida: getDataExibicaoReceita({ certeza: 'recorrente', recorrencia: {}, _dataRecebimentoOcorrencia: '2026-10-06', _dataPrevistaOcorrencia: '2026-10-05' }),
        recorrentePrevista: getDataExibicaoReceita({ certeza: 'recorrente', recorrencia: {}, _dataRecebimentoOcorrencia: null, _dataPrevistaOcorrencia: '2026-10-05' }),
        recorrenteBruta: getDataExibicaoReceita({ certeza: 'recorrente', recorrencia: {} }),
        fmt: [fmtDataTransacao('2026-10-05'), fmtDataTransacao(null), fmtDataTransacao('x'), fmtDataTransacao('2026-10-03T16:00:00.000Z')],
      };
    });
    const esperado = { legado: null, recebida: '2026-10-12', prevista: '2026-10-25', parcelaExtra: null,
      recorrenteRecebida: '2026-10-06', recorrentePrevista: '2026-10-05', recorrenteBruta: null,
      fmt: ['05/10/2026', '', '', '03/10/2026'] };
    return { ok: JSON.stringify(r) === JSON.stringify(esperado), detail: `obtido=${JSON.stringify(r)}` };
  }, 'receita: recebida mostra o recebimento, prevista a previsão; legado/parcela sem data → vazio; formato dd/mm/aaaa');

  await check('TDC_03_DESPESAS_PAGE', async () => {
    await page.evaluate(() => { window._despFiltro = 'todas'; despCartaoFiltro = null; navigate('despesas'); });
    const rows = await rowsOf('#despesasList');
    const r = {
      pix: byName(rows, 'Compra PIX datada')?.date, legado: byName(rows, 'Compra antiga')?.date,
      fixa: byName(rows, 'Aluguel fixo')?.date, parc: byName(rows, 'Curso parcelado')?.date,
      todasComCelulaPrimeiro: rows.every((x) => x.first === 'item-row-date'),
    };
    const ok = r.pix === '05/10/2026' && r.legado === '' && r.fixa === '31/10/2026' && r.parc === '08/10/2026' && r.todasComCelulaPrimeiro;
    return { ok, detail: `obtido=${JSON.stringify(r)} linhas=${rows.length}` };
  }, 'Despesas: a data é a primeira célula de cada linha (inclusive contribuição/resumo de cartão, vazia); antiga fica vazia');

  await check('TDC_04_FATURA_CARTAO', async () => {
    await page.evaluate(() => { navigate('cartoes'); selecionarFaturaCartao('nu'); });
    const rows = await rowsOf('#cartaoFaturaItens');
    const r = byName(rows, 'Compra no cartão');
    return { ok: r?.date === '20/09/2026' && r.first === 'item-row-date', detail: `obtido=${JSON.stringify(rows)}` };
  }, 'Cartões / Faturas: compra parcelada mostra o dia da compra');

  await check('TDC_05_RECEITAS_PAGE', async () => {
    await page.evaluate(() => { window._recFiltro = 'todas'; navigate('receitas'); });
    const rows = await rowsOf('#receitasList');
    const r = { legado: byName(rows, 'Receita antiga')?.date, recebida: byName(rows, 'Projeto recebido')?.date, prevista: byName(rows, 'Projeto previsto')?.date };
    return { ok: r.legado === '' && r.recebida === '12/10/2026' && r.prevista === '25/10/2026', detail: `obtido=${JSON.stringify(r)}` };
  }, 'Receitas: data de recebimento/previsão; antiga vazia');

  await check('TDC_06_DASHBOARD_RECENTES', async () => {
    await page.evaluate(() => navigate('dashboard'));
    const r = await page.evaluate(() => {
      const t = document.querySelector('#recentList table');
      return { th: t?.querySelector('th')?.textContent, linhas: [...(t?.querySelectorAll('tbody tr') || [])].map((tr) => [tr.cells[0].textContent, tr.cells[1].textContent]) };
    });
    const m = Object.fromEntries(r.linhas.map(([d, n]) => [n, d]));
    const ok = r.th === 'Data' && m['Compra PIX datada'] === '05/10/2026' && m['Compra antiga sem data'] === '' && m['Aluguel fixo'] === '31/10/2026';
    return { ok, detail: `obtido=${JSON.stringify(r)}` };
  }, 'Dashboard: tabela de lançamentos recentes começa pela coluna Data');

  await check('TDC_07_PESQUISA', async () => {
    const r = await page.evaluate(() => {
      abrirPesquisaLancamentos();
      const input = document.getElementById('pesquisaLancamentoInput');
      input.value = 'compra'; renderResultadoPesquisaLancamentos();
      const rows = [...document.querySelectorAll('#resultadoPesquisaLancamentos .item-row')].map((x) => [x.querySelector('.item-row-name').textContent.trim(), x.querySelector('.item-row-date')?.textContent]);
      input.value = 'projeto'; renderResultadoPesquisaLancamentos();
      const recs = [...document.querySelectorAll('#resultadoPesquisaLancamentos .item-row')].map((x) => [x.querySelector('.item-row-name').textContent.trim(), x.querySelector('.item-row-date')?.textContent]);
      closeModal();
      return { rows, recs };
    });
    const d = Object.fromEntries(r.rows), rc = Object.fromEntries(r.recs);
    const ok = d['Compra PIX datada'] === '05/10/2026' && d['Compra antiga sem data'] === '' && d['Compra no cartão 2x'] === '20/09/2026'
      && rc['Projeto recebido'] === '12/10/2026' && rc['Projeto previsto'] === '25/10/2026';
    return { ok, detail: `obtido=${JSON.stringify(r)}` };
  }, 'Pesquisar lançamento: despesas e receitas trazem a data gravada');

  await check('TDC_08_TRANSFERENCIAS', async () => {
    await page.evaluate(() => { navigate('contas'); renderTransferencias(); });
    const rows = await rowsOf('#transferenciasList');
    const meta = await page.evaluate(() => document.querySelector('#transferenciasList .item-row-meta')?.textContent);
    return { ok: rows.length === 1 && rows[0].date === '03/10/2026' && rows[0].first === 'item-row-date' && meta === 'teste', detail: `obtido=${JSON.stringify({ rows, meta })}` };
  }, 'Transferências: a data sai do texto e vai para a primeira coluna');

  await check('TDC_09_ANALISE', async () => {
    const r = await page.evaluate(() => {
      navigate('analise');
      const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = String(v); };
      set('filtMesIni', 10); set('filtAnoIni', 2026); set('filtMesFim', 10); set('filtAnoFim', 2026);
      renderAnalise();
      const t = document.querySelector('#analiseTabela table');
      return { ths: [...(t?.querySelectorAll('th') || [])].slice(0, 2).map((x) => x.textContent), linhas: [...(t?.querySelectorAll('tbody tr') || [])].map((tr) => [tr.cells[0].textContent, tr.cells[2].textContent]) };
    });
    const m = Object.fromEntries(r.linhas.map(([d, n]) => [n.replace('👥', ''), d]));
    const ok = r.ths.join('|') === 'Data|Mês' && m['Compra PIX datada'] === '05/10/2026' && m['Compra antiga sem data'] === '';
    return { ok, detail: `obtido=${JSON.stringify(r)}` };
  }, 'Análise: coluna Data antes de Mês');

  await check('TDC_10_ESCRITORIO_DESPESAS', async () => {
    const r = await page.evaluate(() => {
      state.office.despesas.push({ id: 'od1', descricao: 'Software escritório', categoria: 'Software', valor: 50, data: '2026-10-07', conta: null, projetoId: null, status: 'pago', createdAt: 'od1' });
      navigate('escritorio'); renderOfficeDespesasTab();
      const row = [...document.querySelectorAll('#escritorioSubContent .item-row')].find((x) => x.textContent.includes('Software escritório'));
      const out = { date: row?.querySelector('.item-row-date')?.textContent, first: row?.firstElementChild?.className };
      state.office.despesas = state.office.despesas.filter((d) => d.id !== 'od1');
      return out;
    });
    return { ok: r.date === '07/10/2026' && r.first === 'item-row-date', detail: `obtido=${JSON.stringify(r)}` };
  }, 'Escritório: despesa mostra a data na primeira coluna');

  await check('TDC_10B_ESCRITORIO_ABAS_E_PDFS', async () => {
    const r = await page.evaluate(() => {
      const backup = JSON.stringify({ pessoas: state.pessoas, despesas: state.despesas });
      navigate('escritorio'); renderOfficeRecebiveisTab(); renderOfficeRepassesTab();
      const printOrig = window.print; window.print = () => {};
      exportarRelatorioMensalPDF();
      const area = document.getElementById('printReportArea');
      const tabelas = [...area.querySelectorAll('table')].map((t) => [...t.querySelectorAll('th')].map((x) => x.textContent).join('|'));
      const linhaPix = [...area.querySelectorAll('tr')].find((tr) => tr.textContent.includes('Compra PIX datada'));
      const mensal = { tabelas, pix: linhaPix?.cells[0].textContent };
      state.pessoas = [{ id: 'p1', name: 'Pessoa', color: '#f00' }];
      state.despesas.find((d) => d.id === 'dPix').split = [{ personId: 'p1', percent: 50 }];
      exportarRepassePessoaPDF('p1');
      const reemb = { th: area.querySelector('th')?.textContent, data: area.querySelector('tbody tr')?.cells[0].textContent, colspan: area.querySelector('.print-total-row td')?.colSpan };
      window.print = printOrig;
      document.body.classList.remove('printing-report'); area.innerHTML = '';
      const b = JSON.parse(backup); state.pessoas = b.pessoas; state.despesas = b.despesas;
      return { mensal, reemb };
    });
    const ok = r.mensal.tabelas.includes('Data|Tipo|Nome|Valor') && r.mensal.tabelas.includes('Data|Descrição|Categoria|Cartão|Valor')
      && r.mensal.pix === '05/10/2026' && r.reemb.th === 'Data' && r.reemb.data === '05/10/2026' && r.reemb.colspan === 6;
    return { ok, detail: `obtido=${JSON.stringify(r)}` };
  }, 'Escritório (recebíveis/repasses) renderiza sem erro; PDFs de caixa e de reembolso têm a coluna Data');

  await check('TDC_11_SEM_MUDANCA_DE_STATE_E_TOTAIS', async () => {
    await page.evaluate(() => { currentMonth = 10; currentYear = 2026; navigate('dashboard'); });
    const igual = (await stateSnapshot()) === stateAntes;
    const totais = (await page.evaluate(() => JSON.stringify(getTotalsForMonth(10, 2026)))) === totaisAntes;
    return { ok: igual && totais, detail: `state igual=${igual}, totais iguais=${totais}` };
  }, 'renderizar as telas não altera state nem totais do mês');

  await check('TDC_12_SEM_ERROS', async () => ({ ok: consoleErrors.length === 0, detail: JSON.stringify(consoleErrors) }),
    'nenhum erro de console');
} finally {
  await close();
}

const fails = results.filter((r) => r.status === 'FAIL').length;
console.log(`transaction-date-column: TOTAL=${results.length} PASS=${results.length - fails} FAIL=${fails}`);
if (fails > 0) process.exitCode = 1;

export { results };
