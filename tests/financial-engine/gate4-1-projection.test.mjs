import {openHarness,makeRunner,baseSyntheticState} from './harness.mjs';
const {page,loadState,close}=await openHarness();
const {check,results}=makeRunner('gate4-1-projection');
async function run(fn){await loadState(baseSyntheticState());return page.evaluate(fn);}
try {
await check('P41_REAL_VS_PLANNED',()=>run(()=>{
  state.receitas=[{id:'r',tipo:'projeto',nome:'Projeto',valor:400,conta:'c1',certeza:'contratado',estado:'previsto',dataPrevista:'2026-09-22',tributavel:false}];
  state.despesas=[{id:'d',desc:'Conta',valor:200,cartao:'dinheiro',conta:'c1',mesInicio:9,anoInicio:2026,diaVencimento:20,fixa:true,pagoMeses:{}}];
  const before=JSON.stringify(state),p=getChronologicalProjection('2026-09-17','2026-09-30');
  return p.available===1000&&p.committed===800&&p.projected===1200&&p.timeline[0].balance===800&&JSON.stringify(state)===before;
}),'disponível, comprometido e projetado separados; projeção sem mutação');
await check('P41_POTENTIAL_SEPARATE',()=>run(()=>{
  state.receitas=[{id:'r',tipo:'projeto',valor:9000,conta:'c1',certeza:'potencial',estado:'previsto',dataPrevista:'2026-09-22',tributavel:false}];
  const p=getChronologicalProjection('2026-09-17','2026-09-30');return p.potentials===9000&&p.projected===1000&&p.timeline[0].balance===1000;
}),'potencial não aumenta saldo nem linha do tempo');
await check('P41_CARD_ONCE',()=>run(()=>{
  state.cards.find(c=>c.id==='nu').paga=10;
  state.despesas=[{id:'d',valor:300,cartao:'nu',mesInicio:8,anoInicio:2026,dataCompra:'2026-08-20',parcelas:1,pagoMeses:{}}];
  const p=getChronologicalProjection('2026-09-01','2026-09-30');return p.obligations===300&&p.events.length===1&&p.events[0].date==='2026-09-10';
}),'compra de crédito debitada apenas via fatura');
await check('P41_PAID_EXCLUDED',()=>run(()=>{
  state.receitas=[{id:'r',tipo:'projeto',valor:400,conta:'c1',certeza:'contratado',estado:'recebido',dataRecebimento:'2026-09-12',tributavel:false}];
  state.despesas=[{id:'d',valor:200,cartao:'dinheiro',conta:'c1',mesInicio:9,anoInicio:2026,pagoMeses:{'2026-09':true}}];
  const p=getChronologicalProjection('2026-09-17','2026-09-30');return p.available===1200&&p.projected===1200&&p.events.length===0;
}),'recebido e pago não são contados de novo');
await check('P41_UNDATED',()=>run(()=>{
  state.despesas=[{id:'d',valor:200,cartao:'dinheiro',mesInicio:9,anoInicio:2026,pagoMeses:{}}];
  const p=getChronologicalProjection('2026-09-17','2026-09-30');return p.projected===800&&p.undated.length===1&&p.events.length===0&&p.incomplete;
}),'sem dia: reduz total, não inventa data');
await check('P41_OVERDUE',()=>run(()=>{
  state.despesas=[{id:'d',valor:200,cartao:'dinheiro',mesInicio:8,anoInicio:2026,diaVencimento:20,pagoMeses:{}}];
  const p=getChronologicalProjection('2026-09-17','2026-09-30');return p.events[0].overdue&&p.events[0].originalDate==='2026-08-20'&&p.events[0].date==='2026-09-17';
}),'dívida atrasada preserva data original');
await check('P41_SAME_DAY_NET',()=>run(()=>{
  state.receitas=[{id:'r',valor:500,conta:'c1',certeza:'contratado',estado:'previsto',dataPrevista:'2026-09-20',tributavel:false}];
  state.despesas=[{id:'d',valor:1200,cartao:'dinheiro',mesInicio:9,anoInicio:2026,diaVencimento:20,pagoMeses:{}}];
  const p=getChronologicalProjection('2026-09-17','2026-09-30');return p.timeline.length===1&&p.minimum===300&&p.firstShortfall===null;
}),'risco diário não inventa sequência intradiária');
await check('P41_PRINCIPAL_SELECTION',()=>run(()=>{
  const salary=(id,day)=>({id,tipo:'salario',certeza:'recorrente',valor:100,mes:8,ano:2026,recorrencia:{type:'last_weekday_of_month',weekday:5},recebidoPorMes:{'2026-08':{estado:'recebido',dataRecebimento:day}}});
  state.receitas=[salary('a','2026-08-28'),salary('b','2026-09-10')];
  if(!getCurrentFinancialCycle('2026-09-17').selectionRequired)return false;
  state.financialPreferences={primarySalaryId:'a'};
  return getCurrentFinancialCycle('2026-09-17').startDate==='2026-08-28';
}),'vários salários exigem escolha; secundário não reinicia ciclo');
await check('P41_ISOLATION',()=>run(()=>{
  state.office.contas=[{id:'pj',saldoInicial:90000}];state.cofrinhos=[{id:'reserva',saldoInicial:90000}];
  const p=getChronologicalProjection('2026-09-17','2026-09-30');return p.available===1000&&p.projected===1000;
}),'reservas e caixa PJ não entram no disponível pessoal');
await check('P41_MISSING_ACCOUNT',()=>run(()=>{
  state.receitas=[{id:'r',valor:500,certeza:'contratado',estado:'previsto',dataPrevista:'2026-09-20',tributavel:false}];
  const p=getChronologicalProjection('2026-09-17','2026-09-30');return p.projected===1000&&p.incomplete&&p.issues.some(x=>x.reason==='missing_personal_account');
}),'receita sem conta pessoal não aumenta projeção');
await check('P41_LIMITS',()=>run(()=>getChronologicalProjection('2026-09-17','2027-09-30').unavailable&&getChronologicalProjection('2026-09-17','2026-02-31').unavailable),'limites e calendário inválido');
await check('P41_MONTH_END',()=>run(()=>projectionDate(2028,2,31)==='2028-02-29'&&projectionDate(2026,2,31)==='2026-02-28'),'vencimento mensal limitado ao último dia existente');
}finally{await close();}
const fail=results.filter(r=>r.status==='FAIL').length;
console.log(`gate4-1-projection: TOTAL=${results.length} PASS=${results.length-fail} FAIL=${fail}`);process.exitCode=fail?1:0;
