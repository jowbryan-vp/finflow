import assert from 'node:assert/strict';
import { openHarness, baseSyntheticState } from '../../tests/financial-engine/harness.mjs';
const h = await openHarness();
const fixture = (date) => baseSyntheticState({
  cards: [{id:'bank_x', name:'Synthetic', fecha:17, paga:1, color:'#444444'}],
  despesas: [{id:'d', desc:'Synthetic', cat:'geral', subcat:'Geral', cartao:'bank_x', valor:250,
    parcelas:1, mesInicio:9, anoInicio:2026, dataCompra:'2026-09-05', fixa:false,
    pagoMeses:{}, split:[], repasses:{}}],
  faturasPagas:{'bank_x_2026-09':true}, faturasContas:{'bank_x_2026-09':'c1'},
  ...(date ? {faturasPagasData:{'bank_x_2026-09':date}} : {}),
});
try {
  await h.page.clock.setFixedTime(new Date(2026,9,6,12));
  await h.page.reload({waitUntil:'domcontentloaded'});
  await h.loadState({version:2,perfilAtivo:'a',perfis:{
    a:{id:'a',name:'A',color:'#444444',data:fixture()},
    b:{id:'b',name:'B',color:'#555555',data:fixture('2026-10-02')},
  }});
  await h.page.evaluate(()=>{currentMonth=9;currentYear=2026;navigate('dashboard');});
  const before = await h.page.evaluate(()=>JSON.parse(JSON.stringify(state)));
  await h.page.locator('#billCards button[title="Data do pagamento"]').click();
  await h.page.locator('#editarFaturaData').fill('2026-09-30');
  await h.page.getByRole('button',{name:'✓ Salvar data',exact:true}).click();
  const after = await h.page.evaluate(()=>JSON.parse(JSON.stringify(state)));
  assert.equal(after.faturasPagasData['bank_x_2026-09'],'2026-09-30');
  delete before.faturasPagasData; delete after.faturasPagasData;
  assert.deepEqual(after,before); // Editing the date changes only its map.
  const profiles = await h.page.evaluate(()=>{
    const read=()=>({date:getDataPagamentoFatura('bank_x',2026,9),sep:calcSaldoContaAte('c1',9,2026),
      oct:calcSaldoContaAte('c1',10,2026),current:calcSaldoConta('c1')});
    const a=read(); switchPerfil('b'); const b=read(); switchPerfil('a');
    const saved=JSON.parse(JSON.stringify(buildSaveObject()));
    migrateAppData(saved);
    return {a,b,reloaded:read(),saved};
  });
  assert.deepEqual(profiles.a,{date:'2026-09-30',sep:750,oct:750,current:750});
  assert.deepEqual(profiles.b,{date:'2026-10-02',sep:1000,oct:750,current:750});
  assert.deepEqual(profiles.reloaded,profiles.a);
  assert.equal(profiles.saved.perfis.b.data.faturasPagasData['bank_x_2026-09'],'2026-10-02');
  const guards=await h.page.evaluate(()=>{
    const snap=JSON.stringify(state);
    const invalid=['2026-02-29','2026-04-31','2026-10-07','2026-09-00',''].map(s=>validarDataPagamentoFatura(s));
    return {invalid,unchanged:snap===JSON.stringify(state)};
  });
  assert.deepEqual(guards,{invalid:[null,null,null,null,null],unchanged:true});
  // Unmark and pay again: the previous date must not leak into the new payment.
  await h.page.evaluate(()=>{currentMonth=9;currentYear=2026;toggleFaturaPaga('bank_x',9,2026);openPagarFaturaModal('bank_x',9,2026);});
  assert.equal(await h.page.locator('#pagarFaturaData').inputValue(),'2026-10-06');
  await h.page.locator('#pagarFaturaConta').selectOption('c1');
  await h.page.getByRole('button',{name:'✓ Confirmar pagamento',exact:true}).click();
  const repaid=await h.page.evaluate(()=>({date:getDataPagamentoFatura('bank_x',2026,9),
    sep:calcSaldoContaAte('c1',9,2026),oct:calcSaldoContaAte('c1',10,2026),current:calcSaldoConta('c1')}));
  assert.deepEqual(repaid,{date:'2026-10-06',sep:1000,oct:750,current:750});
  assert.deepEqual(h.consoleErrors,[]);
  console.log(JSON.stringify({result:'PASS',profiles:{a:profiles.a,b:profiles.b,reloaded:profiles.reloaded},guards,repaid,consoleErrors:h.consoleErrors},null,2));
} finally {await h.close();}
