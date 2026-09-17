import {openHarness,makeRunner,baseSyntheticState} from './harness.mjs';
const {page,loadState,close}=await openHarness();const {check,results}=makeRunner('gate4-2-variables');
async function setup(){
  await loadState(baseSyntheticState());
  await page.evaluate(()=>{
    state.despesas=[6,7,8].map((m,i)=>({id:`h${m}`,valor:(i+1)*100,cat:'food',cartao:'dinheiro',conta:'c1',mesInicio:m,anoInicio:2026,pagoMeses:{[`2026-0${m}`]:true}}));
  });
}
try{
await check('P42_WEIGHTED',async()=>{await setup();return page.evaluate(()=>{
  const before=JSON.stringify(state),r=getVariableExpenseEstimate('2026-09-01','2026-09-30');
  return r.total===233.33&&r.history[2].weight===3&&JSON.stringify(state)===before;
});},'média 100/200/300 ponderada 1/2/3 = 233,33; sem mutação');
await check('P42_SIMPLE',async()=>{await setup();return page.evaluate(()=>getVariableExpenseEstimate('2026-09-01','2026-09-30','simple').total===200);},'média simples = 200');
await check('P42_RECONCILE',async()=>{await setup();return page.evaluate(()=>{
  state.despesas.push({id:'current',valor:150,cat:'food',cartao:'dinheiro',mesInicio:9,anoInicio:2026,pagoMeses:{}});
  return getVariableExpenseEstimate('2026-09-01','2026-09-30').total===83.33;
});},'já lançado 150 deixa só 83,33 a estimar');
await check('P42_OVER_BUDGET',async()=>{await setup();return page.evaluate(()=>{
  state.despesas.push({id:'current',valor:350,cat:'food',cartao:'dinheiro',mesInicio:9,anoInicio:2026,pagoMeses:{}});
  return getVariableExpenseEstimate('2026-09-01','2026-09-30').total===0;
});},'acima da média não cria estimativa negativa');
await check('P42_EXCLUSIONS',async()=>{await setup();return page.evaluate(()=>{
  state.despesas.push({id:'fixed',valor:9000,cat:'food',cartao:'dinheiro',mesInicio:6,anoInicio:2026,fixa:true,pagoMeses:{}},
    {id:'installment',valor:9000,cat:'food',cartao:'dinheiro',mesInicio:6,anoInicio:2026,parcelas:6,pagoMeses:{}});
  return getVariableExpenseEstimate('2026-09-01','2026-09-30').total===233.33;
});},'fixas e parcelas não contaminam média variável');
await check('P42_PARTIAL',async()=>{await setup();return page.evaluate(()=>getVariableExpenseEstimate('2026-09-11','2026-09-20','simple').total===100);},'10 dos 20 dias restantes reservam metade da estimativa restante');
await check('P42_NO_HISTORY',async()=>{await loadState(baseSyntheticState());return page.evaluate(()=>{const r=getVariableExpenseEstimate('2026-09-01','2026-09-30');return r.unavailable&&r.total===0;});},'sem histórico não inventa estimativa');
await check('P42_CATEGORY',async()=>{await setup();return page.evaluate(()=>{
  state.despesas.push({id:'transport',valor:999,cat:'transport',cartao:'dinheiro',mesInicio:9,anoInicio:2026,pagoMeses:{}});
  return getVariableExpenseEstimate('2026-09-01','2026-09-30').total===233.33;
});},'gasto em outra categoria não abate alimentação');
await check('P42_CARD_RECONCILE',async()=>{await setup();return page.evaluate(()=>{
  state.despesas.push({id:'card',valor:200,cat:'food',cartao:'nu',dataCompra:'2026-08-20',mesInicio:8,anoInicio:2026,pagoMeses:{}});
  return getVariableExpenseEstimate('2026-09-01','2026-09-30').total===33.33;
});},'compra de cartão já na fatura abate estimativa');
await check('P42_OUTLOOK',async()=>{await setup();return page.evaluate(()=>{
  const p=getFinancialOutlook('2026-09-01','2026-09-30');return p.available===400&&p.committed===400&&p.knownProjected===400&&Math.abs(p.projected-166.67)<0.001;
});},'estimativa só reduz projetado, preserva disponível e comprometido');
}finally{await close();}
const fail=results.filter(r=>r.status==='FAIL').length;console.log(`gate4-2-variables: TOTAL=${results.length} PASS=${results.length-fail} FAIL=${fail}`);process.exitCode=fail?1:0;
