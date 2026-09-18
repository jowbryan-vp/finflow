// Gate 5 — achado 3: contrato do Caixa do Escritório com entrada e saldo
// parcelado, gerando recebíveis em state.office.recebiveis via a estrutura
// existente (mesmo motor do Gate 3, nenhum paralelo). Tudo em centavos
// inteiros; resto da divisão vai pra última parcela; proteção do histórico
// realizado; geração só ocorre no cadastro (ação explícita), nunca em
// edição/render/import.
import { openHarness, makeRunner, baseSyntheticState } from './harness.mjs';

const { page, loadState, close } = await openHarness();
const { check, results } = makeRunner('gate5-office-contrato');

await loadState(baseSyntheticState());
await page.evaluate(() => {
  state.office.contas.push({ id: 'oc1', name: 'Conta Escritório', color: '#ff9900', saldoInicial: 0 });
});

function fillAndSubmit(fields) {
  return page.evaluate((fields) => {
    renderOfficeProjetosTab(); // garante que o formulário exista no DOM
    document.getElementById('newProjNome').value = fields.nome || '';
    document.getElementById('newProjCliente').value = fields.cliente || '';
    document.getElementById('newProjValor').value = fields.valorContrato ?? '';
    document.getElementById('newProjStatus').value = fields.status || 'potencial';
    document.getElementById('newProjData').value = fields.dataContrato || '';
    document.getElementById('newProjObs').value = '';
    if (fields.status === 'contratado') {
      document.getElementById('newProjEntradaValor').value = fields.valorEntrada ?? '';
      document.getElementById('newProjEntradaData').value = fields.dataEntradaPrevista || '';
      document.getElementById('newProjEntradaRecebida').checked = !!fields.entradaRecebida;
      document.getElementById('newProjEntradaDataReal').value = fields.dataEntradaReal || '';
      document.getElementById('newProjParcelasQtd').value = fields.qtdParcelas ?? '0';
      document.getElementById('newProjParcelaData').value = fields.dataPrimeiraParcela || '';
      document.getElementById('newProjConta').value = fields.contaDestino || '';
    }
    const antesQtdProjetos = state.office.projetos.length;
    const antesQtdRecebiveis = state.office.recebiveis.length;
    addOfficeProjeto();
    const projeto = state.office.projetos[state.office.projetos.length - 1];
    const criouProjeto = state.office.projetos.length > antesQtdProjetos;
    const recebiveis = criouProjeto ? state.office.recebiveis.filter((r) => r.projetoId === projeto.id) : [];
    return {
      criouProjeto,
      recebiveisCriados: state.office.recebiveis.length - antesQtdRecebiveis,
      recebiveis: recebiveis.map((r) => ({ descricao: r.descricao, valor: r.valor, estado: r.estado, dataPrevista: r.dataPrevista, dataRecebimento: r.dataRecebimento })),
      projetoId: criouProjeto ? projeto.id : null,
    };
  }, fields);
}

// OF01: exemplo obrigatório do handoff — contrato R$7.800, entrada R$3.000,
// 6 parcelas de R$800, soma final exata de R$7.800.
await check('OF01', async () => {
  const r = await fillAndSubmit({
    nome: 'Projeto Leandro', cliente: 'Leandro', valorContrato: 7800, status: 'contratado',
    dataContrato: '2026-09-01', valorEntrada: 3000, dataEntradaPrevista: '2026-09-05',
    entradaRecebida: false, qtdParcelas: 6, dataPrimeiraParcela: '2026-10-05', contaDestino: 'oc1',
  });
  const entrada = r.recebiveis.find((x) => x.descricao === 'Entrada');
  const parcelas = r.recebiveis.filter((x) => x.descricao.startsWith('Parcela'));
  const soma = (entrada ? entrada.valor : 0) + parcelas.reduce((s, p) => s + p.valor, 0);
  const todasParcelas800 = parcelas.length === 6 && parcelas.every((p) => Math.abs(p.valor - 800) < 0.001);
  const ok = r.criouProjeto && entrada && entrada.valor === 3000 && entrada.estado === 'previsto' &&
    todasParcelas800 && Math.abs(soma - 7800) < 0.001;
  return { ok, detail: `entrada=${entrada && entrada.valor} parcelas=${parcelas.map((p) => p.valor).join(',')} soma=${soma} (esp. entrada 3000, 6x800, soma 7800)` };
}, 'exemplo obrigatório: contrato 7800, entrada 3000, 6 parcelas de 800, soma exata 7800');

// OF02: entrada zero — todo o valor vira parcelas.
await check('OF02', async () => {
  const r = await fillAndSubmit({
    nome: 'Projeto Sem Entrada', cliente: 'B', valorContrato: 1000, status: 'contratado',
    valorEntrada: 0, qtdParcelas: 2, dataPrimeiraParcela: '2026-11-10', contaDestino: 'oc1',
  });
  const temEntrada = r.recebiveis.some((x) => x.descricao === 'Entrada');
  const parcelas = r.recebiveis.filter((x) => x.descricao.startsWith('Parcela'));
  const soma = parcelas.reduce((s, p) => s + p.valor, 0);
  const ok = r.criouProjeto && !temEntrada && parcelas.length === 2 && Math.abs(soma - 1000) < 0.001;
  return { ok, detail: `temEntrada=${temEntrada} parcelas=${parcelas.map((p) => p.valor).join(',')} soma=${soma} (esp. sem Entrada, 2 parcelas somando 1000)` };
}, 'entrada zero: nenhum recebível "Entrada" é criado, saldo integral vira parcelas');

// OF03: contrato pago integralmente na entrada — zero parcelas permitido.
await check('OF03', async () => {
  const r = await fillAndSubmit({
    nome: 'Projeto Pago na Entrada', cliente: 'C', valorContrato: 500, status: 'contratado',
    valorEntrada: 500, dataEntradaPrevista: '2026-09-15', qtdParcelas: 0, contaDestino: 'oc1',
  });
  const entrada = r.recebiveis.find((x) => x.descricao === 'Entrada');
  const parcelas = r.recebiveis.filter((x) => x.descricao.startsWith('Parcela'));
  const ok = r.criouProjeto && entrada && entrada.valor === 500 && parcelas.length === 0;
  return { ok, detail: `entrada=${entrada && entrada.valor} nParcelas=${parcelas.length} (esp. 500 / 0 parcelas, cadastro aceito)` };
}, 'entrada igual ao valor total: zero parcelas é permitido e o cadastro é aceito');

// OF04: divisão com centavos — resto vai só pra última parcela.
await check('OF04', async () => {
  const r = await fillAndSubmit({
    nome: 'Projeto Centavos', cliente: 'D', valorContrato: 100, status: 'contratado',
    valorEntrada: 0, qtdParcelas: 3, dataPrimeiraParcela: '2026-09-10', contaDestino: 'oc1',
  });
  const parcelas = r.recebiveis.filter((x) => x.descricao.startsWith('Parcela')).sort((a, b) => a.descricao.localeCompare(b.descricao));
  const soma = parcelas.reduce((s, p) => s + p.valor, 0);
  // 100/3 = 33.33 (base), resto 0.01 vai pra última: 33.33, 33.33, 33.34
  const ok = parcelas.length === 3 && Math.abs(parcelas[0].valor - 33.33) < 0.001 &&
    Math.abs(parcelas[1].valor - 33.33) < 0.001 && Math.abs(parcelas[2].valor - 33.34) < 0.001 &&
    Math.abs(soma - 100) < 0.001;
  return { ok, detail: `parcelas=${parcelas.map((p) => p.valor).join(',')} soma=${soma} (esp. 33.33,33.33,33.34 somando 100.00 exato, sem erro de ponto flutuante)` };
}, 'divisão com centavos: resto da divisão inteira ajusta somente a última parcela, soma exata em centavos');

// OF05: virada de ano nas datas das parcelas.
await check('OF05', async () => {
  const r = await fillAndSubmit({
    nome: 'Projeto Virada', cliente: 'E', valorContrato: 300, status: 'contratado',
    valorEntrada: 0, qtdParcelas: 3, dataPrimeiraParcela: '2026-11-15', contaDestino: 'oc1',
  });
  const parcelas = r.recebiveis.filter((x) => x.descricao.startsWith('Parcela')).sort((a, b) => a.descricao.localeCompare(b.descricao));
  const datas = parcelas.map((p) => p.dataPrevista);
  const ok = datas.length === 3 && datas[0] === '2026-11-15' && datas[1] === '2026-12-15' && datas[2] === '2027-01-15';
  return { ok, detail: `datas=${datas.join(',')} (esp. 2026-11-15, 2026-12-15, 2027-01-15)` };
}, 'primeira parcela em novembro, virada de ano nas parcelas seguintes calculada corretamente');

// OF06: primeira parcela com vencimento nos dias 29/30/31 — clampa pro
// último dia válido do mês de destino (ex.: fevereiro).
await check('OF06', async () => {
  const r = await fillAndSubmit({
    nome: 'Projeto Dia 31', cliente: 'F', valorContrato: 400, status: 'contratado',
    valorEntrada: 0, qtdParcelas: 4, dataPrimeiraParcela: '2026-12-31', contaDestino: 'oc1',
  });
  const parcelas = r.recebiveis.filter((x) => x.descricao.startsWith('Parcela')).sort((a, b) => a.descricao.localeCompare(b.descricao));
  const datas = parcelas.map((p) => p.dataPrevista);
  // dez/31, jan/31, fev/28 (2027 não é bissexto), mar/31
  const ok = datas.length === 4 && datas[0] === '2026-12-31' && datas[1] === '2027-01-31' &&
    datas[2] === '2027-02-28' && datas[3] === '2027-03-31';
  return { ok, detail: `datas=${datas.join(',')} (esp. 2026-12-31, 2027-01-31, 2027-02-28 [clamp], 2027-03-31)` };
}, 'primeira parcela no dia 31: meses sem esse dia (fevereiro) usam o último dia válido');

// OF07: projeto potencial não gera recebível nenhum, mesmo com campos
// financeiros preenchidos (não devem sequer ser lidos/persistidos).
await check('OF07', async () => {
  const r = await page.evaluate(() => {
    renderOfficeProjetosTab();
    document.getElementById('newProjNome').value = 'Projeto Potencial Com Campos';
    document.getElementById('newProjCliente').value = 'G';
    document.getElementById('newProjValor').value = '5000';
    document.getElementById('newProjStatus').value = 'potencial';
    document.getElementById('newProjData').value = '';
    document.getElementById('newProjObs').value = '';
    const antesRecebiveis = state.office.recebiveis.length;
    addOfficeProjeto();
    const projeto = state.office.projetos[state.office.projetos.length - 1];
    const operacional = getOfficeOperationalBalance();
    return { statusSalvo: projeto.status, temValorEntrada: projeto.valorEntrada !== undefined,
      recebiveisNovos: state.office.recebiveis.length - antesRecebiveis, operacional };
  });
  const ok = r.statusSalvo === 'potencial' && !r.temValorEntrada && r.recebiveisNovos === 0 && r.operacional === 0;
  return { ok, detail: `status=${r.statusSalvo} temValorEntrada=${r.temValorEntrada} recebiveisNovos=${r.recebiveisNovos} operacional=${r.operacional} (esp. potencial/false/0/0)` };
}, 'projeto potencial nunca gera recebíveis, mesmo com valor de contrato preenchido');

// OF08: validações — rejeita contrato <=0, entrada negativa, entrada >
// contrato, parcelas negativas/fracionárias, saldo>0 com 0 parcelas, saldo
// parcelado sem data da 1ª parcela, e ausência de conta de destino — tudo
// sem mutação (nenhum projeto/recebível criado).
await check('OF08', async () => {
  const antes = await page.evaluate(() => ({ p: state.office.projetos.length, r: state.office.recebiveis.length }));
  const casos = [
    { nome: 'contrato zero', valorContrato: 0, status: 'contratado', qtdParcelas: 0, contaDestino: 'oc1' },
    { nome: 'contrato negativo', valorContrato: -100, status: 'contratado', qtdParcelas: 0, contaDestino: 'oc1' },
    { nome: 'entrada negativa', valorContrato: 1000, status: 'contratado', valorEntrada: -1, qtdParcelas: 0, contaDestino: 'oc1' },
    { nome: 'entrada maior que contrato', valorContrato: 1000, status: 'contratado', valorEntrada: 1500, qtdParcelas: 0, contaDestino: 'oc1' },
    { nome: 'saldo positivo sem parcelas', valorContrato: 1000, status: 'contratado', valorEntrada: 200, qtdParcelas: 0, contaDestino: 'oc1' },
    { nome: 'saldo parcelado sem data da 1a parcela', valorContrato: 1000, status: 'contratado', valorEntrada: 0, qtdParcelas: 2, contaDestino: 'oc1' },
    { nome: 'sem conta de destino', valorContrato: 1000, status: 'contratado', valorEntrada: 0, qtdParcelas: 2, dataPrimeiraParcela: '2026-10-01', contaDestino: '' },
  ];
  const resultados = [];
  for (const c of casos) {
    const r = await fillAndSubmit({ nome: c.nome, cliente: 'H', ...c });
    resultados.push({ nome: c.nome, criouProjeto: r.criouProjeto });
  }
  const depois = await page.evaluate(() => ({ p: state.office.projetos.length, r: state.office.recebiveis.length }));
  const nenhumCriado = resultados.every((x) => x.criouProjeto === false);
  const semMutacao = antes.p === depois.p && antes.r === depois.r;
  const ok = nenhumCriado && semMutacao;
  return { ok, detail: `${resultados.map((x) => `${x.nome}=${x.criouProjeto}`).join('; ')} — projetos antes/depois=${antes.p}/${depois.p}, recebíveis antes/depois=${antes.r}/${depois.r}` };
}, 'validações rejeitam todos os casos inválidos sem nenhuma mutação de estado (zero projetos/recebíveis criados)');

// OF09: entrada prevista vs. recebida — entrada prevista não entra no caixa
// real; entrada marcada como recebida entra exatamente uma vez, pela data real.
await check('OF09', async () => {
  const previstaR = await fillAndSubmit({
    nome: 'Projeto Entrada Prevista', cliente: 'I', valorContrato: 400, status: 'contratado',
    valorEntrada: 400, dataEntradaPrevista: '2026-12-01', entradaRecebida: false,
    qtdParcelas: 0, contaDestino: 'oc1',
  });
  const recebidaR = await fillAndSubmit({
    nome: 'Projeto Entrada Recebida', cliente: 'J', valorContrato: 400, status: 'contratado',
    valorEntrada: 400, dataEntradaPrevista: '2026-12-01', entradaRecebida: true, dataEntradaReal: '2026-11-20',
    qtdParcelas: 0, contaDestino: 'oc1',
  });
  const entradaPrevista = previstaR.recebiveis.find((x) => x.descricao === 'Entrada');
  const entradaRecebida = recebidaR.recebiveis.find((x) => x.descricao === 'Entrada');
  const ok = entradaPrevista && entradaPrevista.estado === 'previsto' && entradaPrevista.dataRecebimento === null &&
    entradaRecebida && entradaRecebida.estado === 'recebido' && entradaRecebida.dataRecebimento === '2026-11-20';
  return { ok, detail: `previsto: estado=${entradaPrevista && entradaPrevista.estado} dataReceb=${entradaPrevista && entradaPrevista.dataRecebimento} | recebido: estado=${entradaRecebida && entradaRecebida.estado} dataReceb=${entradaRecebida && entradaRecebida.dataRecebimento} (esp. previsto/null e recebido/2026-11-20)` };
}, 'entrada prevista fica previsto/sem data real; entrada recebida entra pela data real, uma única vez');

// OF10: parcela prevista vs. recebida — parcelas sempre nascem previstas
// (nunca entram automaticamente no caixa até serem marcadas manualmente).
await check('OF10', async () => {
  const r = await fillAndSubmit({
    nome: 'Projeto Parcela Previsto', cliente: 'K', valorContrato: 600, status: 'contratado',
    valorEntrada: 0, qtdParcelas: 3, dataPrimeiraParcela: '2026-09-05', contaDestino: 'oc1',
  });
  const todasPrevistas = r.recebiveis.every((x) => x.estado === 'previsto' && x.dataRecebimento === null);
  return { ok: todasPrevistas, detail: `estados=${r.recebiveis.map((x) => x.estado).join(',')} (esp. todas 'previsto', sem dataRecebimento)` };
}, 'parcelas nascem previstas — nenhuma entra no caixa automaticamente até ser marcada como recebida');

// OF11: ausência de dupla contagem / geração exatamente uma vez — chamar
// renderOfficeProjetosTab() (re-render) várias vezes não duplica nada.
await check('OF11', async () => {
  const r = await page.evaluate(() => {
    const antes = state.office.recebiveis.length;
    renderOfficeProjetosTab();
    renderOfficeProjetosTab();
    renderOfficeProjetosTab();
    return { antes, depois: state.office.recebiveis.length };
  });
  const ok = r.antes === r.depois;
  return { ok, detail: `recebíveis antes=${r.antes} depois de 3 re-renders=${r.depois} (esp. iguais — render nunca gera)` };
}, 'geração acontece exatamente uma vez, por ação explícita — múltiplos renders não duplicam recebíveis');

// OF12: proteção do histórico realizado — editar o projeto (nome/valor/
// status) depois de um recebível já 'recebido' não apaga nem reescreve esse
// recebível, e não regenera a programação de recebíveis.
await check('OF12', async () => {
  const r = await fillAndSubmit({
    nome: 'Projeto Histórico', cliente: 'L', valorContrato: 900, status: 'contratado',
    valorEntrada: 300, dataEntradaPrevista: '2026-09-01', entradaRecebida: true, dataEntradaReal: '2026-09-01',
    qtdParcelas: 3, dataPrimeiraParcela: '2026-10-01', contaDestino: 'oc1',
  });
  const projetoId = r.projetoId;
  const antes = await page.evaluate((projetoId) => {
    const recebiveis = state.office.recebiveis.filter((x) => x.projetoId === projetoId);
    return { qtd: recebiveis.length, entradaEstado: recebiveis.find((x) => x.descricao === 'Entrada').estado,
      entradaId: recebiveis.find((x) => x.descricao === 'Entrada').id };
  }, projetoId);
  // Simula a edição real via saveEditOfficeProjeto, preenchendo o modal.
  await page.evaluate((projetoId) => {
    openEditOfficeProjeto(projetoId);
    document.getElementById('eProjValor').value = '999999';
    saveEditOfficeProjeto(projetoId);
  }, projetoId);
  const depois = await page.evaluate((projetoId) => {
    const recebiveis = state.office.recebiveis.filter((x) => x.projetoId === projetoId);
    return { qtd: recebiveis.length, entradaEstado: recebiveis.find((x) => x.descricao === 'Entrada').estado,
      entradaId: recebiveis.find((x) => x.descricao === 'Entrada').id,
      entradaDataRecebimento: recebiveis.find((x) => x.descricao === 'Entrada').dataRecebimento };
  }, projetoId);
  const ok = antes.qtd === depois.qtd && antes.entradaId === depois.entradaId &&
    depois.entradaEstado === 'recebido' && depois.entradaDataRecebimento === '2026-09-01';
  return { ok, detail: `qtd antes/depois=${antes.qtd}/${depois.qtd}, entrada id preservado=${antes.entradaId === depois.entradaId}, estado pós-edição=${depois.entradaEstado} (esp. iguais, recebido preservado)` };
}, 'edição do projeto (após entrada já recebida) não apaga, reescreve nem regenera recebíveis — histórico protegido');

// OF13: importação de backup antigo sem os campos novos continua funcionando
// (projeto antigo sem valorEntrada/qtdParcelas etc. não quebra a listagem).
await check('OF13', async () => {
  const r = await page.evaluate(() => {
    const antigo = { id: 'pAntigo', nome: 'Projeto Antigo', cliente: 'M', valorContrato: 2000,
      status: 'contratado', dataContrato: '2025-01-01', observacao: '', createdAt: 'pAntigo' };
    state.office.projetos.push(antigo);
    let erro = null;
    try { renderOfficeProjetosTab(); } catch (e) { erro = e.message; }
    const aindaExiste = state.office.projetos.find((x) => x.id === 'pAntigo');
    return { erro, aindaExiste: !!aindaExiste, temCamposNovos: aindaExiste && aindaExiste.valorEntrada !== undefined };
  });
  const ok = r.erro === null && r.aindaExiste && !r.temCamposNovos;
  return { ok, detail: `erro=${r.erro} existe=${r.aindaExiste} temCamposNovosInventados=${r.temCamposNovos} (esp. sem erro, existe, sem campos inventados)` };
}, 'projeto antigo sem os novos campos continua funcionando, sem inventar entrada/parcelamento/datas');

// OF14: exportação/importação preserva os recebíveis gerados neste gate
// (round-trip completo via buildSaveObject/migrateAppData).
await check('OF14', async () => {
  const r = await page.evaluate(() => {
    const antesQtd = state.office.recebiveis.length;
    const saved = buildSaveObject();
    const copia = JSON.parse(JSON.stringify(saved));
    migrateAppData(copia);
    return { antesQtd, depoisQtd: state.office.recebiveis.length };
  });
  const ok = r.antesQtd === r.depoisQtd && r.antesQtd > 0;
  return { ok, detail: `recebíveis antes=${r.antesQtd} depois do round-trip=${r.depoisQtd} (esp. iguais, >0)` };
}, 'exportação/importação preserva todos os recebíveis gerados (nenhum perdido ou duplicado)');

// OF15: isolamento entre caixa empresarial e pessoal — os recebíveis do
// Caixa do Escritório nunca contaminam contas/receitas pessoais além do
// repasse já regido pela regra de distribuição existente (não criam receita
// direta com o valor cheio do contrato).
await check('OF15', async () => {
  const r = await page.evaluate(() => {
    const receitasPessoaisComOfficeTransferId = state.receitas.filter((x) => x.officeTransferId);
    // Sem regra de repasse_pessoal configurada neste teste (regrasDistribuicao
    // não preenchida), nenhuma receita pessoal deve ter sido criada a partir
    // dos recebíveis do escritório cadastrados aqui.
    const algumaComValorCheio = receitasPessoaisComOfficeTransferId.some((x) => x.valor === 7800 || x.valor === 900 || x.valor === 1000);
    return { qtdReceitasDerivadas: receitasPessoaisComOfficeTransferId.length, algumaComValorCheio };
  });
  const ok = !r.algumaComValorCheio;
  return { ok, detail: `receitas pessoais derivadas do escritório=${r.qtdReceitasDerivadas}, alguma com valor cheio do contrato=${r.algumaComValorCheio} (esp. false — nunca contamina com o valor bruto)` };
}, 'Caixa do Escritório nunca contamina o caixa pessoal com o valor bruto do contrato');

// ── Correções pós-auditoria Codex (docs/audits/GATE-5-UAT-CORRECTIONS-CODEX.md) ──

// OF16 (achado 1, caso 1): entrada prevista > 0, não recebida, sem data
// prevista bloqueia o cadastro antes de qualquer mutação.
await check('OF16', async () => {
  const antes = await page.evaluate(() => ({ p: state.office.projetos.length, r: state.office.recebiveis.length }));
  const r = await fillAndSubmit({
    nome: 'Projeto Entrada Sem Data', cliente: 'N', valorContrato: 500, status: 'contratado',
    valorEntrada: 500, dataEntradaPrevista: '', entradaRecebida: false, qtdParcelas: 0, contaDestino: 'oc1',
  });
  const depois = await page.evaluate(() => ({ p: state.office.projetos.length, r: state.office.recebiveis.length }));
  const ok = !r.criouProjeto && antes.p === depois.p && antes.r === depois.r;
  return { ok, detail: `criouProjeto=${r.criouProjeto} projetos antes/depois=${antes.p}/${depois.p} recebíveis antes/depois=${antes.r}/${depois.r} (esp. false, sem mutação)` };
}, 'achado 1: entrada prevista >0 sem data prevista bloqueia o cadastro, sem mutação');

// OF17 (achado 1, caso 2): data prevista inválida também bloqueia.
await check('OF17', async () => {
  const antes = await page.evaluate(() => ({ p: state.office.projetos.length, r: state.office.recebiveis.length }));
  const r = await fillAndSubmit({
    nome: 'Projeto Entrada Data Invalida', cliente: 'O', valorContrato: 500, status: 'contratado',
    valorEntrada: 500, dataEntradaPrevista: '2026-13-40', entradaRecebida: false, qtdParcelas: 0, contaDestino: 'oc1',
  });
  const depois = await page.evaluate(() => ({ p: state.office.projetos.length, r: state.office.recebiveis.length }));
  const ok = !r.criouProjeto && antes.p === depois.p && antes.r === depois.r;
  return { ok, detail: `criouProjeto=${r.criouProjeto} projetos antes/depois=${antes.p}/${depois.p} recebíveis antes/depois=${antes.r}/${depois.r} (esp. false, sem mutação)` };
}, 'achado 1: data prevista inválida (2026-13-40) bloqueia o cadastro, sem mutação');

// OF18 (achado 1, caso 3, reforço explícito): a rejeição não cria projeto,
// recebível, receita pessoal nem repasse.
await check('OF18', async () => {
  const r = await page.evaluate(() => {
    const antesReceitas = state.receitas.length;
    const antesRepasses = (state.office.repasses || []).length;
    return { antesReceitas, antesRepasses };
  });
  await fillAndSubmit({
    nome: 'Projeto Rejeitado Sem Efeitos', cliente: 'P', valorContrato: 300, status: 'contratado',
    valorEntrada: 300, dataEntradaPrevista: '', entradaRecebida: false, qtdParcelas: 0, contaDestino: 'oc1',
  });
  const depois = await page.evaluate(() => ({
    receitas: state.receitas.length, repasses: (state.office.repasses || []).length,
  }));
  const ok = r.antesReceitas === depois.receitas && r.antesRepasses === depois.repasses;
  return { ok, detail: `receitas antes/depois=${r.antesReceitas}/${depois.receitas} repasses antes/depois=${r.antesRepasses}/${depois.repasses} (esp. iguais)` };
}, 'achado 1: rejeição por falta de data não cria receita pessoal nem repasse');

// OF19 (achado 1, caso 4): entrada prevista válida aparece no mês correto
// em getOfficeReceivablesPrevistoTotal().
await check('OF19', async () => {
  const r = await fillAndSubmit({
    nome: 'Projeto Entrada Prevista Mes Certo', cliente: 'Q', valorContrato: 700, status: 'contratado',
    valorEntrada: 700, dataEntradaPrevista: '2027-05-10', entradaRecebida: false, qtdParcelas: 0, contaDestino: 'oc1',
  });
  const totais = await page.evaluate(() => ({
    mesCerto: getOfficeReceivablesPrevistoTotal(5, 2027),
    mesErrado: getOfficeReceivablesPrevistoTotal(4, 2027),
  }));
  const ok = r.criouProjeto && totais.mesCerto >= 700 && totais.mesErrado === 0;
  return { ok, detail: `criouProjeto=${r.criouProjeto} previstoMaio2027=${totais.mesCerto} previstoAbril2027=${totais.mesErrado} (esp. true, >=700, 0)` };
}, 'achado 1: entrada prevista válida aparece em getOfficeReceivablesPrevistoTotal() no mês certo, e só nele');

// OF20 (achado 1, casos 5/6): entrada prevista não entra no caixa real;
// entrada recebida entra só pela data real, exatamente uma vez.
await check('OF20', async () => {
  const r = await page.evaluate(() => ({
    caixaMesPrevisto: getOfficeReceivedCash(5, 2027), // mesmo mês da OF19: só previsto, não deve contar como recebido
  }));
  const recebidaR = await fillAndSubmit({
    nome: 'Projeto Entrada Recebida Caixa Unico', cliente: 'R', valorContrato: 250, status: 'contratado',
    valorEntrada: 250, dataEntradaPrevista: '2027-06-01', entradaRecebida: true, dataEntradaReal: '2027-06-05',
    qtdParcelas: 0, contaDestino: 'oc1',
  });
  const caixaR = await page.evaluate(() => ({
    junho2027: getOfficeReceivedCash(6, 2027),
    maio2027: getOfficeReceivedCash(5, 2027),
  }));
  const ok = r.caixaMesPrevisto === 0 && recebidaR.criouProjeto && caixaR.junho2027 === 250 && caixaR.maio2027 === 0;
  return { ok, detail: `caixaPrevistoMaio=${r.caixaMesPrevisto} caixaJunhoPosRecebido=${caixaR.junho2027} caixaMaioPosRecebido=${caixaR.maio2027} (esp. 0, 250, 0)` };
}, 'achado 1: entrada prevista não entra no caixa real; entrada recebida entra uma única vez, pela data real');

// OF21 (achado 1, caso 7): entrada zero continua não exigindo data.
await check('OF21', async () => {
  const r = await fillAndSubmit({
    nome: 'Projeto Entrada Zero Sem Data', cliente: 'S', valorContrato: 600, status: 'contratado',
    valorEntrada: 0, dataEntradaPrevista: '', qtdParcelas: 2, dataPrimeiraParcela: '2027-07-01', contaDestino: 'oc1',
  });
  const ok = r.criouProjeto && !r.recebiveis.some((x) => x.descricao === 'Entrada');
  return { ok, detail: `criouProjeto=${r.criouProjeto} temEntrada=${r.recebiveis.some((x) => x.descricao === 'Entrada')} (esp. true, false)` };
}, 'achado 1: entrada zero continua sem exigir data prevista');

// OF22 (achado 2): contrato com mais de duas casas (100.005) é normalizado
// para centavos inteiros — o projeto armazena o valor arredondado (a mesma
// fonte de verdade usada pra gerar os recebíveis), não o bruto de parseFloat.
await check('OF22', async () => {
  const r = await fillAndSubmit({
    nome: 'Projeto Subcentavo', cliente: 'T', valorContrato: 100.005, status: 'contratado',
    valorEntrada: 0, qtdParcelas: 3, dataPrimeiraParcela: '2027-08-01', contaDestino: 'oc1',
  });
  const soma = r.recebiveis.reduce((s, x) => s + x.valor, 0);
  const projetoSalvo = await page.evaluate((id) => {
    const p = state.office.projetos.find((x) => x.id === id);
    return { valorContrato: p.valorContrato };
  }, r.projetoId);
  // 100.005*100 = 10000.5 em ponto flutuante — Math.round arredonda pra
  // cima (10001 centavos = 100.01), igual ao arredondamento padrão "meio
  // pra cima". O que importa pra invariante financeira não é qual direção o
  // arredondamento escolhe, e sim que o valor gravado seja o MESMO usado
  // pra gerar os recebíveis — nunca o bruto 100.005 preservado à parte.
  const ok = r.criouProjeto && Math.abs(projetoSalvo.valorContrato - 100.01) < 0.001 &&
    Math.abs(soma - projetoSalvo.valorContrato) < 0.001;
  return { ok, detail: `valorContrato salvo=${projetoSalvo.valorContrato} somaRecebiveis=${soma} (esp. 100.01 — arredondado de 100.005 — soma exatamente igual, nunca preservando o bruto)` };
}, 'achado 2: contrato digitado como 100.005 é persistido normalizado em centavos, igual à soma dos recebíveis (nunca o valor bruto)');

// OF23 (achado 2): entrada com mais de duas casas também é normalizada.
await check('OF23', async () => {
  const r = await fillAndSubmit({
    nome: 'Projeto Entrada Subcentavo', cliente: 'U', valorContrato: 200, status: 'contratado',
    valorEntrada: 50.004, dataEntradaPrevista: '2027-09-01', entradaRecebida: false,
    qtdParcelas: 3, dataPrimeiraParcela: '2027-09-10', contaDestino: 'oc1',
  });
  const projetoSalvo = await page.evaluate((id) => {
    const p = state.office.projetos.find((x) => x.id === id);
    return { valorEntrada: p.valorEntrada };
  }, r.projetoId);
  const entrada = r.recebiveis.find((x) => x.descricao === 'Entrada');
  const ok = r.criouProjeto && Math.abs(projetoSalvo.valorEntrada - 50) < 0.001 &&
    Math.abs(entrada.valor - projetoSalvo.valorEntrada) < 0.001;
  return { ok, detail: `valorEntrada salvo=${projetoSalvo.valorEntrada} recebívelEntrada=${entrada.valor} (esp. ambos 50.00)` };
}, 'achado 2: entrada digitada como 50.004 é persistida normalizada (50.00 = 5000 centavos)');

// OF24 (achado 2): valor "colado" fora do passo do campo HTML (mais casas
// decimais que step="0.01" permitiria digitando) é normalizado do mesmo jeito.
await check('OF24', async () => {
  const r = await fillAndSubmit({
    nome: 'Projeto Valor Colado', cliente: 'V', valorContrato: 333.336, status: 'contratado',
    valorEntrada: 0, qtdParcelas: 3, dataPrimeiraParcela: '2027-10-01', contaDestino: 'oc1',
  });
  const soma = r.recebiveis.reduce((s, x) => s + x.valor, 0);
  const projetoSalvo = await page.evaluate((id) => state.office.projetos.find((x) => x.id === id).valorContrato, r.projetoId);
  const ok = r.criouProjeto && Math.abs(projetoSalvo - 333.34) < 0.001 && Math.abs(soma - projetoSalvo) < 0.001;
  return { ok, detail: `valorContrato salvo=${projetoSalvo} somaRecebiveis=${soma} (esp. 333.34, soma exata)` };
}, 'achado 2: valor com precisão além do step do campo HTML (333.336) é normalizado do mesmo jeito, nunca depende só do step');

// OF25 (achado 2): round-trip de exportação/importação preserva os valores
// normalizados (não reintroduz nem acumula erro de ponto flutuante).
await check('OF25', async () => {
  const r = await page.evaluate((id) => {
    const antes = state.office.projetos.find((x) => x.id === id);
    const antesValores = { valorContrato: antes.valorContrato, valorEntrada: antes.valorEntrada };
    const saved = buildSaveObject();
    const copia = JSON.parse(JSON.stringify(saved));
    migrateAppData(copia);
    const depois = state.office.projetos.find((x) => x.id === id);
    return { antesValores, depoisValores: { valorContrato: depois.valorContrato, valorEntrada: depois.valorEntrada } };
  }, (await page.evaluate(() => state.office.projetos.find((p) => p.nome === 'Projeto Subcentavo').id)));
  const ok = r.antesValores.valorContrato === r.depoisValores.valorContrato &&
    r.antesValores.valorEntrada === r.depoisValores.valorEntrada;
  return { ok, detail: `antes=${JSON.stringify(r.antesValores)} depois=${JSON.stringify(r.depoisValores)} (esp. idênticos)` };
}, 'achado 2: round-trip de export/import preserva os valores normalizados, sem reintroduzir imprecisão');

// OF26 (achado 2): projetos antigos (criados antes desta correção, com
// valores possivelmente não normalizados) permanecem inalterados — a
// normalização só se aplica no cadastro, nunca reescreve histórico.
await check('OF26', async () => {
  const r = await page.evaluate(() => {
    const antigo = { id: 'pAntigoValorBruto', nome: 'Projeto Antigo Valor Bruto', cliente: 'W',
      valorContrato: 100.00999999999999, valorEntrada: 33.336, status: 'contratado',
      dataContrato: '2025-02-01', observacao: '', createdAt: 'pAntigoValorBruto' };
    state.office.projetos.push(antigo);
    renderOfficeProjetosTab();
    const aindaExiste = state.office.projetos.find((x) => x.id === 'pAntigoValorBruto');
    return { valorContrato: aindaExiste.valorContrato, valorEntrada: aindaExiste.valorEntrada };
  });
  const ok = r.valorContrato === 100.00999999999999 && r.valorEntrada === 33.336;
  return { ok, detail: `valorContrato=${r.valorContrato} valorEntrada=${r.valorEntrada} (esp. inalterados — nada reescreve histórico antigo)` };
}, 'achado 2: projeto antigo com valores não normalizados permanece inalterado (correção só se aplica no cadastro)');

await close();

const fails = results.filter((r) => r.status === 'FAIL').length;
console.log(`\ngate5-office-contrato.test.mjs: TOTAL=${results.length} PASS=${results.length - fails} FAIL=${fails}`);
if (fails > 0) process.exitCode = 1;

export { results };
