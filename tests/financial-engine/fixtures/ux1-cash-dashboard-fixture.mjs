// Fixture SINTÉTICA do Gate UX-1 (Dashboard de caixa). Reproduz apenas a
// FORMA do caso relatado em 30/09/2026 — nenhum dado real do usuário.
//   contas pessoais: 6.705,89
//   a pagar até 29/10: faturas MP 4.976,28 (07/10) e NU 4.157,59 (10/10),
//   IPOG 490 (08/10), Unimed 480 (10/10), FIES 438 (10/10), Claro 44,90
//   (20/10), Ricardo 710 (sem data), contribuição 681,36 (sem data)
//   = 11.978,13
//   repasses do escritório previstos sem conta de destino: 3.120,00
import { baseSyntheticState } from '../harness.mjs';

export const CASH_TODAY = '2026-09-30';
export const CASH_END = '2026-10-29';

const fixa = (id, desc, valor, dia) => ({
  id, desc, cat: 'geral', subcat: 'Geral', cartao: 'dinheiro', conta: 'c1', valor, parcelas: 1,
  mesInicio: 10, anoInicio: 2026, dataCompra: null, fixa: true, diaVencimento: dia, debitoAutomatico: false,
  pagoMeses: {}, split: [], repasses: {}, createdAt: id,
});
const compra = (id, desc, valor, cartao, dataCompra) => ({
  id, desc, cat: 'geral', subcat: 'Geral', cartao, conta: null, valor, parcelas: 1,
  mesInicio: 10, anoInicio: 2026, dataCompra, fixa: false, diaVencimento: null, debitoAutomatico: false,
  pagoMeses: {}, split: [], repasses: {}, createdAt: id,
});
const officeRec = (id, valor, data) => {
  const [a, m] = data.split('-').map(Number);
  return {
    id, tipo: 'repasse_escritorio', nome: 'Repasse do Escritório — Projeto', valor, certeza: 'contratado', estado: 'previsto',
    dataPrevista: data, dataRecebimento: null, competenciaMes: m, competenciaAno: a, mes: m, ano: a, conta: null,
    origem: 'office_distribution', officeTransferId: 'off_' + id, tributavel: false, createdAt: id,
  };
};

// saldo1 + saldo2 = 6.705,89 (o salário de outubro, recebido em 28/09, já
// está dentro desse saldo: os saldos iniciais compensam o crédito).
export function cashFixture({ saldo1 = 1405.89, saldo2 = 1300 } = {}) {
  const s = baseSyntheticState({
    cards: [
      { id: 'dinheiro', name: 'Dinheiro/PIX', color: '#38e2b4', fecha: null, paga: null },
      { id: 'nu', name: 'NU', color: '#820ad1', fecha: 3, paga: 10 },
      { id: 'mp', name: 'MP', color: '#00b1ea', fecha: 1, paga: 7 },
    ],
    contas: [
      { id: 'c1', name: 'Conta salário', color: '#5b7fff', saldoInicial: saldo1 },
      { id: 'c2', name: 'Conta 2', color: '#38e2b4', saldoInicial: saldo2 },
    ],
    receitas: [
      {
        id: 'sal', nome: 'Salário', tipo: 'salario', valor: 4000, conta: 'c1', certeza: 'recorrente',
        mes: 10, ano: 2026, competenciaMes: 10, competenciaAno: 2026,
        recorrencia: { type: 'last_weekday_of_month', weekday: 5 },
        recebidoPorMes: { '2026-10': { estado: 'recebido', dataRecebimento: '2026-09-28' } },
        tributavel: false, incomeNature: 'salary', createdAt: 'sal',
      },
      officeRec('rep1', 1560, '2026-10-15'),
      officeRec('rep2', 1560, '2026-10-25'),
    ],
    despesas: [
      compra('mp1', 'Compras MP', 4976.28, 'mp', '2026-09-15'),
      compra('nu1', 'Compras NU', 4157.59, 'nu', '2026-09-15'),
      fixa('ipog', 'IPOG', 490, 8),
      fixa('unimed', 'Unimed', 480, 10),
      fixa('fies', 'FIES', 438, 10),
      fixa('claro', 'Claro', 44.9, 20),
      { ...fixa('ricardo', 'Ricardo', 710, null), fixa: false },
    ],
    contribuicaoAjustes: { '2026-10': 681.36 },
    financialPreferences: { primarySalaryId: 'sal' },
  });
  // Como na geração real do escritório: repasse pessoal coerente tem o
  // repasse correspondente em state.office.repasses.
  s.office = { repasses: s.receitas.filter((r) => r.origem === 'office_distribution').map((r) => ({
    id: 'rp_' + r.id, tipo: 'planejado', valor: r.valor, estado: 'previsto', dataPrevista: r.dataPrevista,
    dataRecebimento: null, officeTransferId: r.officeTransferId })) };
  return s;
}
