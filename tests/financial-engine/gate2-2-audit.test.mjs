import { openHarness, makeRunner, baseSyntheticState } from './harness.mjs';
const { page, loadState, close } = await openHarness();
const { check, results } = makeRunner('gate2-2-audit');
try {
  for (const invalidDate of ['2026-09-31', 'not-a-date', 20260925]) {
    await check(`AUDIT_INVALID_RECURRING_${invalidDate}`, async () => {
      await loadState(baseSyntheticState());
      return page.evaluate((date) => {
        state.receitas = [{ id:'sal', tipo:'salario', valor:5000, conta:'c1', certeza:'recorrente',
          competenciaMes:9, competenciaAno:2026, mes:9, ano:2026,
          recorrencia:{type:'last_weekday_of_month',weekday:5},
          recebidoPorMes:{'2026-09':{estado:'recebido',dataRecebimento:date}} }];
        const before = JSON.stringify(state);
        return getCashRevenuesForMonth(9,2026).length===0 && getReceivedSalaryEvents().length===0 &&
          calcSaldoConta('c1')===1000 && calcSaldoContaAte('c1',9,2026)===1000 && JSON.stringify(state)===before;
      }, invalidDate);
    }, 'data inválida não gera caixa/ciclo nem mutação, inclusive após importação');
  }
  await check('AUDIT_SINGLE_RECEIVED_WITHOUT_DATE', async () => {
    await loadState(baseSyntheticState());
    return page.evaluate(() => {
      state.receitas=[{id:'one',tipo:'extra',valor:300,conta:'c1',certeza:'contratado',estado:'recebido',dataPrevista:'2026-09-20',dataRecebimento:null}];
      return getCashRevenuesForMonth(9,2026).length===0 && calcSaldoConta('c1')===1000 && calcSaldoContaAte('c1',9,2026)===1000;
    });
  }, 'evento único sem data real não diverge entre caixa mensal e saldo bancário');
  await check('AUDIT_EDIT_WITHOUT_DATE_ZERO_MUTATION', async () => {
    await loadState(baseSyntheticState());
    return page.evaluate(() => {
      state.receitas=[{id:'one',tipo:'projeto',nome:'Projeto',valor:300,conta:'c1',certeza:'contratado',estado:'previsto',dataPrevista:'2026-09-20',mes:9,ano:2026}];
      openEditReceitaNovoModelo('one');
      const before=JSON.stringify(state);
      document.getElementById('eRecNome2').value='não salvar';
      document.getElementById('eRecEstado2').value='recebido';
      document.getElementById('eRecDataRecebimento2').value='';
      saveEditReceitaNovoModelo('one');
      return JSON.stringify(state)===before;
    });
  }, 'edição sem data real é bloqueada antes de qualquer mutação');
} finally { await close(); }
console.log(`gate2-2-audit: TOTAL=${results.length} PASS=${results.filter(r=>r.status==='PASS').length} FAIL=${results.filter(r=>r.status==='FAIL').length}`);
process.exitCode=results.some(r=>r.status==='FAIL')?1:0;
