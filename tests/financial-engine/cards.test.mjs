// G1-P01..G1-P03 — installments (parcelamentos) derive every parcela's
// competência from the FIRST invoice's competência (i.e. from dataCompra +
// cartao.fecha on the purchase itself), not from a flat "mesInicio+1" applied
// per-parcela independently. Also re-checks INV-05 (sum of parcelas == total)
// under the new day-aware rule, since P01-P03 change which invoice each
// parcela lands in.
import { openHarness, makeRunner, baseSyntheticState } from './harness.mjs';

const { page, loadState, close } = await openHarness();
const { check, results } = makeRunner('cards');

await loadState(baseSyntheticState());

async function competenciasDaDespesa(despesaId, anos) {
  // Walks a window of months and records every (mes,ano) where the despesa
  // shows up, in the order the calendar visits them — this both proves each
  // parcela lands in the right invoice AND (implicitly, like INV-11) that it
  // lands in exactly one invoice per parcela.
  return page.evaluate(
    ([despesaId, anos]) => {
      const hits = [];
      for (const ano of anos) {
        for (let mes = 1; mes <= 12; mes++) {
          const found = getDespesasForMonth(mes, ano).find((d) => d.id === despesaId);
          if (found) hits.push({ mes, ano, parcel: found._parcel, total: found._total, valorParcela: found._valorParcela });
        }
      }
      return hits;
    },
    [despesaId, anos]
  );
}

function fmt(hits) {
  return hits.map((h) => `${String(h.mes).padStart(2, '0')}/${h.ano}(#${h.parcel})`).join(', ');
}

// G1-P01: compra 02/09/2026 (antes do fechamento, fecha=03), 3x → set/out/nov 2026
await check('G1-P01', async () => {
  await page.evaluate(() => {
    state.despesas.push({ id: 'p01', desc: 'parcelada p01', cat: 'geral', subcat: 'Geral', cartao: 'nu', conta: null,
      valor: 300, parcelas: 3, mesInicio: 9, anoInicio: 2026, dataCompra: '2026-09-02',
      fixa: false, diaVencimento: null, debitoAutomatico: false, pagoMeses: {}, split: [], repasses: {}, createdAt: 'p01' });
  });
  const hits = await competenciasDaDespesa('p01', [2026]);
  const expected = [{ mes: 9, ano: 2026 }, { mes: 10, ano: 2026 }, { mes: 11, ano: 2026 }];
  const ok = hits.length === 3 && expected.every((e, i) => hits[i].mes === e.mes && hits[i].ano === e.ano && hits[i].parcel === i + 1);
  return { ok, detail: fmt(hits) };
}, 'compra 02/09/2026, fecha 03, 3x → esperado set/2026, out/2026, nov/2026');

// G1-P02: compra 04/09/2026 (depois do fechamento) 3x → out/nov/dez 2026
await check('G1-P02', async () => {
  await page.evaluate(() => {
    state.despesas.push({ id: 'p02', desc: 'parcelada p02', cat: 'geral', subcat: 'Geral', cartao: 'nu', conta: null,
      valor: 300, parcelas: 3, mesInicio: 9, anoInicio: 2026, dataCompra: '2026-09-04',
      fixa: false, diaVencimento: null, debitoAutomatico: false, pagoMeses: {}, split: [], repasses: {}, createdAt: 'p02' });
  });
  const hits = await competenciasDaDespesa('p02', [2026]);
  const expected = [{ mes: 10, ano: 2026 }, { mes: 11, ano: 2026 }, { mes: 12, ano: 2026 }];
  const ok = hits.length === 3 && expected.every((e, i) => hits[i].mes === e.mes && hits[i].ano === e.ano && hits[i].parcel === i + 1);
  return { ok, detail: fmt(hits) };
}, 'compra 04/09/2026, fecha 03, 3x → esperado out/2026, nov/2026, dez/2026');

// G1-P03: virada de ano — compra 20/12/2026, 3x → jan/fev/mar 2027
await check('G1-P03', async () => {
  await page.evaluate(() => {
    state.despesas.push({ id: 'p03', desc: 'parcelada p03', cat: 'geral', subcat: 'Geral', cartao: 'nu', conta: null,
      valor: 300, parcelas: 3, mesInicio: 12, anoInicio: 2026, dataCompra: '2026-12-20',
      fixa: false, diaVencimento: null, debitoAutomatico: false, pagoMeses: {}, split: [], repasses: {}, createdAt: 'p03' });
  });
  const hits = await competenciasDaDespesa('p03', [2026, 2027]);
  const expected = [{ mes: 1, ano: 2027 }, { mes: 2, ano: 2027 }, { mes: 3, ano: 2027 }];
  const ok = hits.length === 3 && expected.every((e, i) => hits[i].mes === e.mes && hits[i].ano === e.ano && hits[i].parcel === i + 1);
  return { ok, detail: fmt(hits) };
}, 'compra 20/12/2026, fecha 03, 3x → esperado jan/2027, fev/2027, mar/2027 (virada de ano)');

// INV-05 re-check under the new rule: sum of one despesa's own parcelas
// across whichever months they land in must equal the original total exactly
// (monetary rounding policy unchanged — valor/parcelas, no per-parcela
// rounding). Summed per-despesa (not via calcByCardForMonth, which would sum
// EVERY despesa on that card/month — P01/P02/P03 share the 'nu' card and
// overlap in out/nov 2026, so a per-card total isn't this despesa's total).
async function somaParcelasDaDespesa(despesaId, anos) {
  const hits = await competenciasDaDespesa(despesaId, anos);
  return hits.reduce((s, h) => s + h.valorParcela, 0);
}

await check('INV-05 (re-check, P01)', async () => {
  const soma = await somaParcelasDaDespesa('p01', [2026]);
  return Math.abs(soma - 300) < 0.01;
}, 'soma das 3 parcelas de R$300 (P01, set/out/nov 2026) == 300 exato');

await check('INV-05 (re-check, P03 virada de ano)', async () => {
  const soma = await somaParcelasDaDespesa('p03', [2026, 2027]);
  return Math.abs(soma - 300) < 0.01;
}, 'soma das 3 parcelas de R$300 (P03, jan/fev/mar 2027) == 300 exato, mesmo atravessando o ano');

await close();

const fails = results.filter((r) => r.status === 'FAIL').length;
console.log(`\ncards.test.mjs: TOTAL=${results.length} PASS=${results.length - fails} FAIL=${fails}`);
if (fails > 0) process.exitCode = 1;

export { results };
