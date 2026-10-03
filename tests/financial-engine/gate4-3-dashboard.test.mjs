import {openHarness,makeRunner,baseSyntheticState} from './harness.mjs';
const {page,loadState,close,consoleErrors}=await openHarness();const {check,results}=makeRunner('gate4-3-dashboard');
await page.clock.setFixedTime(new Date(2026,8,17,12));
async function setup(){
  await loadState(baseSyntheticState());
  await page.evaluate(()=>{
    const salary=(id,name,date,weekday)=>({id,nome:name,tipo:'salario',valor:2000,conta:'c1',certeza:'recorrente',mes:8,ano:2026,recorrencia:{type:'last_weekday_of_month',weekday},tributavel:false,recebidoPorMes:{'2026-08':{estado:'recebido',dataRecebimento:date}}});
    state.receitas=[salary('principal','Salário principal','2026-08-28',5),salary('second','Salário secundário','2026-09-10',1),
      {id:'potential',nome:'Projeto potencial',tipo:'projeto',valor:9000,certeza:'potencial',estado:'previsto',dataPrevista:'2026-09-23',conta:'c1',tributavel:false}];
    state.despesas=[6,7,8].map((m,i)=>({id:`h${m}`,desc:'Mercado',valor:100*(i+1),cat:'geral',cartao:'dinheiro',conta:'c1',mesInicio:m,anoInicio:2026,pagoMeses:{[`2026-0${m}`]:true},createdAt:`h${m}`}));
    currentMonth=9;currentYear=2026;renderDashboard();
  });
}
try{
// Gate UX-1: o destaque de caixa (Dashboard) traz disponível / a pagar /
// necessidade-ou-folga; saldo projetado, potenciais e preferências ficam na
// Análise.
await check('P43_LABELS',async()=>{await setup();const text=(await page.locator('#dashHero').innerText()).toLowerCase();
  await page.evaluate(()=>navigate('analise'));const an=(await page.locator('#page-analise').innerText()).toLowerCase();
  return text.includes('disponível agora')&&text.includes('a pagar até')&&(text.includes('necessidade de caixa')||text.includes('folga de caixa'))&&!text.includes('saldo projetado')&&!text.includes('melhor cenário')
    &&an.includes('saldo projetado')&&an.includes('receitas potenciais');},'conceitos separados: caixa no Dashboard, projeção na Análise');
await check('P43_PRIMARY',async()=>{
  await page.locator('#primarySalarySelect').selectOption('principal');
  return (await page.locator('#financialCycleLabel').innerText()).includes('28/08/2026')&&await page.evaluate(()=>state.financialPreferences.primarySalaryId==='principal');
},'seleção principal muda ciclo e persiste no estado');
await check('P43_PERSIST',async()=>page.evaluate(()=>{
  const saved=buildSaveObject();migrateAppData(saved);renderFinancialOutlook();
  return state.financialPreferences.primarySalaryId==='principal'&&document.getElementById('primarySalarySelect').value==='principal';
}),'escolha sobrevive a exportação/importação do estado');
await check('P43_METHOD',async()=>{
  await page.locator('#variableMethodSelect').selectOption('simple');return page.evaluate(()=>state.financialPreferences.variableMethod==='simple'&&getVariableExpenseEstimate('2026-09-17','2026-09-30',state.financialPreferences.variableMethod).total===200);
},'método de estimativa configurável');
await check('P43_INVALID_END',async()=>page.evaluate(()=>{
  const before=JSON.stringify(state.financialPreferences);setFinancialPreference('projectionEndDate','2026-02-31');return before===JSON.stringify(state.financialPreferences);
}),'data inválida não salva preferência');
await check('P43_FUTURE_REAL',async()=>{
  const before=await page.locator('#cashAvailable').innerText();
  await page.evaluate(()=>{currentMonth=11;currentYear=2026;renderDashboard();});
  return (await page.locator('#cashAvailable').innerText())===before;
},'navegar mês futuro não transforma projeção em caixa real');
await check('P43_POTENTIAL',async()=>{
  const potential=await page.locator('#outlookPotentials').innerText();
  return potential.includes('9.000')&&await page.evaluate(()=>{const p=getFinancialOutlook('2026-09-17','2026-09-30');return p.projected<9000;});
},'potenciais visíveis sem aumentar projetado');
await check('P43_MOBILE',async()=>{
  await page.setViewportSize({width:390,height:844});
  return page.evaluate(()=>{const fits=id=>{const panel=document.getElementById(id);return panel.clientWidth>0&&panel.scrollWidth<=panel.clientWidth+2;};
    navigate('dashboard');const dash=fits('dashHero')&&fits('dashProximosVencimentos');navigate('analise');return dash&&fits('anConfigPlanejamento')&&fits('anProjecaoCaixa');});
},'painel cabe em tela de celular');
await check('P43_NO_HISTORY',async()=>{await loadState(baseSyntheticState());await page.evaluate(()=>renderFinancialOutlook());return (await page.locator('#anPrevisaoMedia').innerText()).includes('Histórico insuficiente')&&(await page.locator('#outlookQuality').innerText()).includes('incompleta');},'ausência de histórico explícita');
await check('P43_NEGATIVE_START',async()=>page.evaluate(()=>{state.contas[0].saldoInicial=-100;return getChronologicalProjection('2026-09-17','2026-09-30').firstShortfall==='2026-09-17';}),'saldo inicial negativo sinaliza risco imediatamente');
await check('P43_NO_SCRIPT_ERRORS',async()=>consoleErrors.length===0,'sem erros de execução no fluxo visual');
if(process.env.FINFLOW_SCREENSHOT_DIR){
  await setup();await page.evaluate(()=>navigate('analise'));await page.locator('#primarySalarySelect').selectOption('principal');await page.evaluate(()=>navigate('dashboard'));
  await page.setViewportSize({width:1440,height:1100});
  await page.waitForFunction(()=>!document.getElementById('toast').classList.contains('show'));
  await page.screenshot({path:`${process.env.FINFLOW_SCREENSHOT_DIR}/finflow-dashboard-desktop.png`,fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.waitForFunction(()=>document.getElementById('sidebar').getBoundingClientRect().right<=1);
  await page.screenshot({path:`${process.env.FINFLOW_SCREENSHOT_DIR}/finflow-dashboard-mobile.png`,fullPage:true});
}
}finally{await close();}
const fail=results.filter(r=>r.status==='FAIL').length;console.log(`gate4-3-dashboard: TOTAL=${results.length} PASS=${results.length-fail} FAIL=${fail}`);process.exitCode=fail?1:0;
