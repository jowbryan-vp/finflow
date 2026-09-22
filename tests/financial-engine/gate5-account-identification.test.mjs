// Gate 5 — identificação bancária e consulta unificada de contas
// (docs/gates/GATE-5-ACCOUNT-IDENTIFICATION-UNIFIED-DIRECTORY.md). Base
// 61dd401.
//
// Campos opcionais `agencia`/`numeroConta` (texto, nunca number) em
// state.contas e state.office.contas; helper único `contaLabelHTML` pra
// montar o rótulo escapado em listas/seletores; card "Todas as contas" na
// página Contas com badges Pessoal/Escritório e totais SEPARADOS; nenhuma
// mistura entre os motores financeiros pessoal e empresarial. Dados 100%
// sintéticos.
import { openHarness, makeRunner, baseSyntheticState } from './harness.mjs';

const { page, loadState, close, consoleErrors } = await openHarness();
const { check, results } = makeRunner('gate5-account-identification');

await page.clock.setFixedTime(new Date(2026, 8, 17, 12)); // 17/09/2026

try {

// ── 1. Criar conta pessoal com agência/conta; zeros e hífen preservados ──
await check('PERSONAL_ACCOUNT_PRESERVES_LEADING_ZEROS_AND_HYPHEN', async () => {
  await loadState(baseSyntheticState({ contas: [] }));
  const r = await page.evaluate(() => {
    navigate('contas');
    document.getElementById('newContaName').value = 'Sicoob pessoal';
    document.getElementById('newContaAgencia').value = '0001';
    document.getElementById('newContaNumero').value = '001234-5';
    document.getElementById('newContaSaldoInicial').value = '100';
    addConta();
    const c = state.contas.find(x => x.name === 'Sicoob pessoal');
    return {
      criada: !!c,
      agenciaPreservada: c?.agencia === '0001',
      numeroPreservado: c?.numeroConta === '001234-5',
      tiposTexto: typeof c?.agencia === 'string' && typeof c?.numeroConta === 'string',
    };
  });
  const ok = r.criada && r.agenciaPreservada && r.numeroPreservado && r.tiposTexto;
  return { ok, detail: `conta pessoal criada com agência "0001" e conta "001234-5" precisa preservar exatamente esses textos (zero à esquerda e hífen), nunca convertidos pra número — obtido=${JSON.stringify(r)}` };
}, 'criar conta pessoal com agência e conta preserva zeros à esquerda e hífen como texto');

// ── 2. Conta empresarial não aparece em state.contas nem altera saldo pessoal
await check('OFFICE_ACCOUNT_NEVER_IN_PERSONAL_CONTAS_NO_BALANCE_LEAK', async () => {
  const r = await page.evaluate(() => {
    const saldoPessoalAntes = state.contas.reduce((s, c) => s + calcSaldoConta(c.id), 0);
    navigate('escritorio'); officeSubTab = 'config'; renderEscritorio();
    document.getElementById('newOContaName').value = 'Sicoob escritório';
    document.getElementById('newOContaAgencia').value = '0002';
    document.getElementById('newOContaNumero').value = '009876-1';
    document.getElementById('newOContaSaldoInicial').value = '500';
    addOfficeConta();
    const oc = state.office.contas.find(x => x.name === 'Sicoob escritório');
    const saldoPessoalDepois = state.contas.reduce((s, c) => s + calcSaldoConta(c.id), 0);
    return {
      criada: !!oc,
      agenciaOk: oc?.agencia === '0002',
      numeroOk: oc?.numeroConta === '009876-1',
      ausenteDeContasPessoais: !state.contas.find(x => x.name === 'Sicoob escritório'),
      saldoPessoalInalterado: saldoPessoalAntes === saldoPessoalDepois,
    };
  });
  const ok = r.criada && r.agenciaOk && r.numeroOk && r.ausenteDeContasPessoais && r.saldoPessoalInalterado;
  return { ok, detail: `conta empresarial "Sicoob escritório" com identificação precisa existir só em state.office.contas, nunca aparecer em state.contas, e o saldo pessoal total não pode mudar — obtido=${JSON.stringify(r)}` };
}, 'conta empresarial com identificação não aparece em state.contas nem altera o saldo pessoal');

// ── 3. Editar identificação pessoal e empresarial sem mudar IDs/saldos/vínculos
await check('EDITING_IDENTIFICATION_DOES_NOT_CHANGE_ID_BALANCE_OR_LINKS', async () => {
  await loadState(baseSyntheticState({
    despesas: [{ id: 'dLigada', desc: 'Despesa vinculada', cat: 'geral', subcat: '', cartao: 'dinheiro',
      conta: 'c1', valor: 50, parcelas: 1, mesInicio: 9, anoInicio: 2026, dataCompra: '2026-09-02',
      fixa: false, pagoMeses: {}, split: [], repasses: {}, createdAt: 'dLigada' }],
  }));
  await page.evaluate(() => {
    state.office.contas.push({ id: 'oc1', name: 'Conta Escritório', color: '#ff9900', saldoInicial: 200 });
  });
  const r = await page.evaluate(() => {
    const idPessoalAntes = state.contas[0].id;
    const saldoPessoalAntes = calcSaldoConta('c1');
    const genAntesPessoal = saveGeneration;

    navigate('contas');
    openEditConta('c1');
    document.getElementById('eContaAgencia').value = '0001';
    document.getElementById('eContaNumero').value = '001234-5';
    saveEditConta('c1');

    const idPessoalDepois = state.contas[0].id;
    const saldoPessoalDepois = calcSaldoConta('c1');
    const genDepoisPessoal = saveGeneration;
    const despesaAindaVinculada = state.despesas.find(d => d.id === 'dLigada')?.conta === 'c1';

    const idOfficeAntes = state.office.contas[0].id;
    const saldoOfficeAntes = calcSaldoOfficeConta('oc1');
    const genAntesOffice = saveGeneration;

    openEditOfficeConta('oc1');
    document.getElementById('eOContaAgencia').value = '0003';
    document.getElementById('eOContaNumero').value = '111222-3';
    saveEditOfficeConta('oc1');

    const idOfficeDepois = state.office.contas[0].id;
    const saldoOfficeDepois = calcSaldoOfficeConta('oc1');
    const genDepoisOffice = saveGeneration;

    return {
      idPessoalIgual: idPessoalAntes === idPessoalDepois,
      saldoPessoalIgual: saldoPessoalAntes === saldoPessoalDepois,
      genPessoalIncrementouUmaVez: genDepoisPessoal === genAntesPessoal + 1,
      despesaAindaVinculada,
      agenciaPessoalSalva: state.contas[0].agencia === '0001',
      idOfficeIgual: idOfficeAntes === idOfficeDepois,
      saldoOfficeIgual: saldoOfficeAntes === saldoOfficeDepois,
      genOfficeIncrementouUmaVez: genDepoisOffice === genAntesOffice + 1,
      agenciaOfficeSalva: state.office.contas[0].agencia === '0003',
    };
  });
  const ok = r.idPessoalIgual && r.saldoPessoalIgual && r.genPessoalIncrementouUmaVez && r.despesaAindaVinculada && r.agenciaPessoalSalva
    && r.idOfficeIgual && r.saldoOfficeIgual && r.genOfficeIncrementouUmaVez && r.agenciaOfficeSalva;
  return { ok, detail: `editar só agência/conta (pessoal e empresarial) não pode mudar id, saldo ou vínculo de despesa, e cada edição agenda exatamente um salvamento — obtido=${JSON.stringify(r)}` };
}, 'editar identificação pessoal e empresarial não muda IDs, saldos ou vínculos, com um único salvamento por edição');

// ── 4. Campos vazios preservam apresentação compacta anterior ───────────
await check('EMPTY_FIELDS_PRESERVE_LEGACY_COMPACT_PRESENTATION', async () => {
  const r = await page.evaluate(() => {
    const semIdentificacao = contaLabelHTML({ name: 'Banco Simples' });
    const comAgenciaSo = contaLabelHTML({ name: 'Banco Ag', agencia: '0001' });
    const comContaSo = contaLabelHTML({ name: 'Banco Conta', numeroConta: '001234-5' });
    const comOsDois = contaLabelHTML({ name: 'Banco Completo', agencia: '0001', numeroConta: '001234-5' });
    return { semIdentificacao, comAgenciaSo, comContaSo, comOsDois };
  });
  const ok = r.semIdentificacao === 'Banco Simples'
    && !r.semIdentificacao.includes('·')
    && r.comAgenciaSo === 'Banco Ag · Ag 0001'
    && r.comContaSo === 'Banco Conta · Conta 001234-5'
    && r.comOsDois === 'Banco Completo · Ag 0001 · Conta 001234-5';
  return { ok, detail: `sem agência nem conta, o rótulo precisa ser só o nome, sem separador solto; com um ou ambos os campos, o texto monta com "·" de forma previsível — obtido=${JSON.stringify(r)}` };
}, 'campos de identificação vazios preservam a apresentação compacta anterior (sem separador solto)');

// ── 5. Backup/importação preserva os campos; backup antigo continua compatível
await check('BACKUP_ROUNDTRIP_PRESERVES_FIELDS_LEGACY_BACKUP_STAYS_COMPATIBLE', async () => {
  const raw = {
    version: 2, perfilAtivo: 'perfilA',
    perfis: {
      perfilA: {
        id: 'perfilA', name: 'Perfil A', color: '#5b7fff',
        data: baseSyntheticState({
          contas: [{ id: 'ca', name: 'Conta A', color: '#5b7fff', saldoInicial: 10, agencia: '0001', numeroConta: '001234-5' }],
        }),
      },
      perfilB: {
        id: 'perfilB', name: 'Perfil B (backup antigo)', color: '#38e2b4',
        // Perfil legado: conta pessoal SEM os campos novos — nunca inventar valor.
        data: baseSyntheticState({
          contas: [{ id: 'cb', name: 'Conta B legada', color: '#38e2b4', saldoInicial: 20 }],
        }),
      },
    },
  };
  await loadState(raw);
  const r = await page.evaluate(() => {
    const rotuloLegado = contaLabelHTML(state.contas[0]); // perfilA ativo
    switchPerfil('perfilB');
    const semErroNoLegado = document.getElementById ? true : true; // sanity: nenhuma exceção até aqui
    const rotuloContaSemCampos = contaLabelHTML(state.contas[0]);
    const nenhumValorInventado = state.contas[0].agencia === undefined && state.contas[0].numeroConta === undefined;

    // Roundtrip completo de backup preservando os dois perfis.
    switchPerfil('perfilA');
    const saved = buildSaveObject();
    migrateAppData(JSON.parse(JSON.stringify(saved)));
    const agenciaPosRoundtrip = state.contas[0].agencia;
    const numeroPosRoundtrip = state.contas[0].numeroConta;
    switchPerfil('perfilB');
    const perfilBAindaSemCampos = state.contas[0].agencia === undefined;

    return { rotuloLegado, semErroNoLegado, rotuloContaSemCampos, nenhumValorInventado, agenciaPosRoundtrip, numeroPosRoundtrip, perfilBAindaSemCampos };
  });
  const ok = r.rotuloLegado === 'Conta A · Ag 0001 · Conta 001234-5'
    && r.semErroNoLegado && r.rotuloContaSemCampos === 'Conta B legada'
    && r.nenhumValorInventado && r.agenciaPosRoundtrip === '0001' && r.numeroPosRoundtrip === '001234-5'
    && r.perfilBAindaSemCampos;
  return { ok, detail: `um roundtrip de backup (buildSaveObject -> migrateAppData) precisa preservar agência/conta de cada perfil isoladamente; um perfil sem esses campos (backup antigo) continua funcionando sem inventar valores — obtido=${JSON.stringify(r)}` };
}, 'backup/importação preserva os campos por perfil; backup antigo sem os campos continua compatível sem inventar valores');

// ── 6. Duas contas do mesmo banco ficam distinguíveis ────────────────────
await check('TWO_SAME_BANK_ACCOUNTS_DISTINGUISHABLE_IN_LISTS_AND_SELECTORS', async () => {
  await loadState(baseSyntheticState({
    contas: [
      { id: 'sicoob1', name: 'Sicoob', color: '#5b7fff', saldoInicial: 100, agencia: '0001', numeroConta: '001234-5' },
      { id: 'sicoob2', name: 'Sicoob', color: '#38e2b4', saldoInicial: 200, agencia: '0007', numeroConta: '007654-3' },
    ],
  }));
  const r = await page.evaluate(() => {
    navigate('contas');
    const htmlLista = document.getElementById('contasList').innerHTML;
    navigate('despesas');
    const htmlSeletor = document.getElementById('despConta').innerHTML;
    return {
      listaDistingue: htmlLista.includes('Ag 0001') && htmlLista.includes('Ag 0007'),
      seletorDistingue: htmlSeletor.includes('Ag 0001') && htmlSeletor.includes('Ag 0007'),
    };
  });
  const ok = r.listaDistingue && r.seletorDistingue;
  return { ok, detail: `duas contas chamadas "Sicoob" precisam ficar distinguíveis pela agência tanto na lista de Contas Cadastradas quanto no seletor de pagamento de Despesas — obtido=${JSON.stringify(r)}` };
}, 'duas contas com o mesmo nome de banco ficam distinguíveis nas listas e seletores pelos metadados');

// ── 7. "Todas as contas" mostra pessoal + escritório com badges e saldos ─
await check('UNIFIED_QUERY_SHOWS_PERSONAL_AND_OFFICE_WITH_BADGES_AND_ENGINE_BALANCES', async () => {
  await loadState(baseSyntheticState({
    contas: [{ id: 'cp1', name: 'Conta Pessoal', color: '#5b7fff', saldoInicial: 1000, agencia: '0001', numeroConta: '001234-5' }],
  }));
  await page.evaluate(() => {
    state.office.contas.push({ id: 'oc1', name: 'Conta Escritório', color: '#ff9900', saldoInicial: 300, agencia: '0002', numeroConta: '009876-1' });
  });
  const r = await page.evaluate(() => {
    navigate('contas');
    const html = document.getElementById('todasContasList').innerHTML;
    return {
      temPessoal: html.includes('Conta Pessoal') && html.includes('Pessoal'),
      temEscritorio: html.includes('Conta Escritório') && html.includes('Escritório'),
      saldoPessoalCorreto: html.includes(fmtBRL(calcSaldoConta('cp1'))),
      saldoOfficeCorreto: html.includes(fmtBRL(calcSaldoOfficeConta('oc1'))),
    };
  });
  const ok = r.temPessoal && r.temEscritorio && r.saldoPessoalCorreto && r.saldoOfficeCorreto;
  return { ok, detail: `"Todas as contas" precisa listar a conta pessoal com badge Pessoal e saldo de calcSaldoConta, e a conta empresarial com badge Escritório e saldo de calcSaldoOfficeConta — obtido=${JSON.stringify(r)}` };
}, '"Todas as contas" contém pessoal e escritório com badges corretos e saldos dos respectivos motores');

// ── 8. Totais separados, sem total consolidado ───────────────────────────
await check('SEPARATE_TOTALS_NO_CONSOLIDATED_TOTAL', async () => {
  const r = await page.evaluate(() => {
    navigate('contas');
    const totalPessoalTxt = document.getElementById('todasContasTotalPessoal').textContent;
    const totalEscritorioTxt = document.getElementById('todasContasTotalEscritorio').textContent;
    const totalPessoalEsperado = state.contas.reduce((s, c) => s + calcSaldoConta(c.id), 0);
    const totalOfficeEsperado = (state.office.contas || []).reduce((s, c) => s + calcSaldoOfficeConta(c.id), 0);
    const nenhumElementoDeTotalGeral = !document.getElementById('todasContasTotalGeral') && !document.getElementById('todasContasTotalConsolidado');
    return {
      totalPessoalBate: totalPessoalTxt === fmtBRL(totalPessoalEsperado),
      totalOfficeBate: totalEscritorioTxt === fmtBRL(totalOfficeEsperado),
      totaisDiferentesQuandoPatrimoniosDiferem: totalPessoalEsperado !== totalOfficeEsperado,
      nenhumElementoDeTotalGeral,
    };
  });
  const ok = r.totalPessoalBate && r.totalOfficeBate && r.totaisDiferentesQuandoPatrimoniosDiferem && r.nenhumElementoDeTotalGeral;
  return { ok, detail: `Total pessoal e Total do escritório precisam bater exatamente com a soma dos respectivos motores, cada um em seu próprio elemento — sem nenhum elemento de total geral somando os dois — obtido=${JSON.stringify(r)}` };
}, 'totais pessoal e empresarial aparecem separados e não existe total consolidado misturando os patrimônios');

// ── 9. Conta empresarial ausente de seletores pessoais e vice-versa ─────
await check('OFFICE_ACCOUNT_ABSENT_FROM_PERSONAL_SELECTOR_AND_VICE_VERSA', async () => {
  const r = await page.evaluate(() => {
    navigate('despesas');
    const htmlDespConta = document.getElementById('despConta').innerHTML;
    const officeContaVazaParaPessoal = htmlDespConta.includes('Conta Escritório') || htmlDespConta.includes('oc1');

    navigate('escritorio'); officeSubTab = 'projetos'; renderEscritorio();
    document.getElementById('newProjStatus').value = 'contratado';
    onNewProjStatusChange();
    const htmlNewProjConta = document.getElementById('newProjConta').innerHTML;
    const contaPessoalVazaParaOffice = htmlNewProjConta.includes('Conta Pessoal') || htmlNewProjConta.includes('cp1');

    return { officeContaVazaParaPessoal, contaPessoalVazaParaOffice };
  });
  const ok = !r.officeContaVazaParaPessoal && !r.contaPessoalVazaParaOffice;
  return { ok, detail: `a conta empresarial nunca pode aparecer no seletor de pagamento pessoal (Despesas), e a conta pessoal nunca pode aparecer no seletor exclusivamente empresarial (conta de destino de projeto) — obtido=${JSON.stringify(r)}` };
}, 'conta empresarial permanece ausente dos seletores pessoais; conta pessoal permanece ausente dos seletores exclusivamente empresariais');

// ── 10. Alterar identificação não modifica saldos nem cria movimentação ──
await check('CHANGING_IDENTIFICATION_DOES_NOT_CHANGE_BALANCE_OR_CREATE_MOVEMENT', async () => {
  const r = await page.evaluate(() => {
    const saldoPessoalAntes = calcSaldoConta('cp1');
    const saldoOfficeAntes = calcSaldoOfficeConta('oc1');
    const movsPessoalAntes = state.movimentacoesContas.length;
    const movsOfficeAntes = (state.office.movimentacoesContas || []).length;

    openEditConta('cp1');
    document.getElementById('eContaAgencia').value = '9999';
    document.getElementById('eContaNumero').value = '999999-9';
    saveEditConta('cp1');

    openEditOfficeConta('oc1');
    document.getElementById('eOContaAgencia').value = '8888';
    document.getElementById('eOContaNumero').value = '888888-8';
    saveEditOfficeConta('oc1');

    return {
      saldoPessoalIgual: saldoPessoalAntes === calcSaldoConta('cp1'),
      saldoOfficeIgual: saldoOfficeAntes === calcSaldoOfficeConta('oc1'),
      semNovaMovimentacaoPessoal: movsPessoalAntes === state.movimentacoesContas.length,
      semNovaMovimentacaoOffice: movsOfficeAntes === (state.office.movimentacoesContas || []).length,
    };
  });
  const ok = r.saldoPessoalIgual && r.saldoOfficeIgual && r.semNovaMovimentacaoPessoal && r.semNovaMovimentacaoOffice;
  return { ok, detail: `alterar agência/conta (pessoal ou empresarial) não pode mudar o saldo calculado antes/depois nem criar nenhuma movimentação nova — obtido=${JSON.stringify(r)}` };
}, 'alterar identificação não modifica saldos antes/depois e não cria movimentação');

// ── 11. Strings são escapadas na exibição ────────────────────────────────
await check('STRINGS_ARE_ESCAPED_ON_DISPLAY', async () => {
  await loadState(baseSyntheticState({
    contas: [{ id: 'cx', name: 'Banco "Teste" <b>X</b>', color: '#5b7fff', saldoInicial: 0, agencia: '<script>alert(1)</script>', numeroConta: '"0&1"' }],
  }));
  const r = await page.evaluate(() => {
    navigate('contas');
    const html = document.getElementById('contasList').innerHTML;
    return {
      semScriptCru: !html.includes('<script>alert(1)</script>'),
      semTagBCrua: !html.includes('<b>X</b>'),
      contemEscapadoNome: html.includes('&lt;b&gt;X&lt;/b&gt;'),
      contemEscapadoAgencia: html.includes('&lt;script&gt;'),
    };
  });
  const ok = r.semScriptCru && r.semTagBCrua && r.contemEscapadoNome && r.contemEscapadoAgencia;
  return { ok, detail: `nome, agência e conta com caracteres HTML/aspas (dados sintéticos, nunca reais) precisam sair escapados na lista de contas, nunca como marcação crua — obtido=${JSON.stringify(r)}` };
}, 'strings de identificação (nome, agência, conta) são escapadas na exibição, usando só fixtures sintéticas');

await check('NO_SCRIPT_ERRORS', async () => ({ ok: consoleErrors.length === 0, detail: `erros de console acumulados: ${JSON.stringify(consoleErrors)}` }), 'nenhum erro de execução ao longo do fluxo de identificação bancária e consulta unificada');

} finally {
  await close();
}

const fails = results.filter((r) => r.status === 'FAIL').length;
console.log(`gate5-account-identification: TOTAL=${results.length} PASS=${results.length - fails} FAIL=${fails}`);
if (fails > 0) process.exitCode = 1;

export { results };
