import { pathToFileURL } from 'node:url';
import path from 'node:path';
const root = process.env.AUDIT_ROOT || path.resolve(import.meta.dirname, '../..');
const {openHarness, baseSyntheticState} = await import(pathToFileURL(path.join(root,'tests/financial-engine/harness.mjs')));
const {page,loadState,close,consoleErrors}=await openHarness();
try {
  await loadState(baseSyntheticState({
    receitas:[{id:'audit-r',nome:'Projeto de arquitetura',tipo:'projeto',certeza:'contratado',estado:'previsto',valor:1500,mes:10,ano:2026,competenciaMes:10,competenciaAno:2026,dataPrevista:'2026-10-25',conta:'c1'}],
    despesas:[{id:'audit-d',desc:'Compra de material',cat:'geral',cartao:'dinheiro',conta:'c1',valor:250,parcelas:1,fixa:false,dataCompra:'2026-10-05',mesInicio:10,anoInicio:2026,pagoMeses:{},split:[],repasses:{}}]
  }));
  await page.evaluate(()=>{currentMonth=10;currentYear=2026;});
  const before=await page.evaluate(()=>JSON.stringify(state));
  const observations=[];
  for(const width of [1440,430,390,360]) {
    await page.setViewportSize({width,height:900});
    for(const [screen,sel] of [['receitas','#receitasList'],['despesas','#despesasList']]) {
      await page.evaluate(s=>{navigate(s); if(s==='despesas') document.querySelectorAll('#despesasList .accordion-body').forEach(x=>x.classList.add('open'));},screen);
      await page.evaluate(()=>document.fonts.ready);
      await page.waitForTimeout(350);
      observations.push(await page.evaluate(({screen,sel,width})=>({screen,width,rows:[...document.querySelectorAll(sel+' .item-row')].filter(r=>r.textContent.includes('arquitetura')||r.textContent.includes('material')).map(r=>{
        const info=r.querySelector('.item-row-info'),date=r.querySelector('.item-row-date');
        return {name:r.querySelector('.item-row-name')?.textContent.trim(),infoWidth:info.getBoundingClientRect().width,date:date?.textContent,rowRight:r.getBoundingClientRect().right,children:[...r.children].map(c=>({class:c.className,width:c.getBoundingClientRect().width,right:c.getBoundingClientRect().right}))};
      })}),{screen,sel,width}));
      if(process.env.AUDIT_SCREENSHOTS) await page.locator(sel).screenshot({path:path.join(process.env.AUDIT_SCREENSHOTS,`${path.basename(root)}-${screen}-${width}.png`)});
    }
  }
  const defects=observations.filter(o=>o.width===390).flatMap(o=>o.rows.filter(r=>r.infoWidth===0).map(r=>({screen:o.screen,width:o.width,name:r.name,reason:'transaction description has zero width'})));
  console.log(JSON.stringify({observations,defects,stateUnchanged:before===await page.evaluate(()=>JSON.stringify(state)),consoleErrors},null,2));
  if(defects.length||consoleErrors.length) process.exitCode=1;
} finally {await close();}
