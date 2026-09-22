// Runs every file in this permanent regression suite in sequence and prints
// a combined summary. See README.md for what each file covers and for the
// real-backup comparison (a separate script — it takes a path to a backup
// file as an argument, so it isn't part of this default run).
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILES = [
  // Gate 1 — fundação temporal de despesas/cartões (must keep passing forever)
  'temporal.test.mjs', 'cards.test.mjs', 'legacy.test.mjs', 'cash-invariants.test.mjs',
  // Gate 2 — receitas, salário, transferências, patrimônio reservado, ciclo
  'gate2-salary.test.mjs', 'gate2-revenue.test.mjs', 'gate2-transfers.test.mjs',
  'gate2-cofrinhos.test.mjs', 'gate2-cycle.test.mjs', 'gate2-invariants.test.mjs',
  'gate2-import-export.test.mjs', 'gate2-real-patterns.test.mjs',
  // Gate 2.1 — patch: caixa de salário recorrente usa a data real de
  // recebimento, nunca a chave de competência (correção pós-auditoria)
  'gate2-1-salary-cash.test.mjs',
  // Gate 3 — caixa do escritório, projetos, recebíveis e repasse ao
  // financeiro pessoal (separação patrimonial total, distribuição
  // configurável, retirada extraordinária, proveniência e idempotência)
  'gate3-separation.test.mjs', 'gate3-reserves.test.mjs', 'gate3-projects.test.mjs',
  'gate3-distribution.test.mjs', 'gate3-extraordinary.test.mjs', 'gate3-invariants.test.mjs',
  'gate3-import-export.test.mjs', 'gate3-real-patterns.test.mjs',
  // Gate 3.1 — patch: reserva empresarial nova nunca nasce com saldo != 0
  // (evita criar patrimônio do nada), e a soma das regras de distribuição
  // precisa ser exatamente 100% quando totalmente preenchida (nunca
  // normalizada, nunca inventada)
  'gate3-1-reserve-integrity.test.mjs', 'gate3-1-distribution-validation.test.mjs',
  // Gate 3.2 — patch: uma reserva/conta empresarial com histórico financeiro
  // realizado (movimentação/recebível/despesa vinculada) nunca pode ser
  // excluída destrutivamente — bloqueio com zero mutation, nunca uma
  // "exclusão inteligente" que compensa ou apaga o passado
  'gate3-2-delete-integrity.test.mjs',
  // Gate 3.3 — patch: "sem movimentações/referências" não é o mesmo que
  // "financeiramente vazio" — uma reserva/conta com saldo efetivo != 0 (via
  // tolerância monetária, nunca === 0 direto) também não pode ser excluída,
  // mesmo sem nenhum histórico/referência; histórico/referência continuam
  // tendo precedência sobre a checagem de saldo; ID inexistente nunca é
  // allowed:true
  'gate3-3-balance-protection.test.mjs',
  // Gate 3.4 — patch decorrente da auditoria patrimonial final do Gate 3.3:
  // toda despesa empresarial cadastrada é financeiramente realizada no
  // modelo atual (sem estado "previsto") — canDeleteOfficeExpense/
  // delOfficeDespesa bloqueiam qualquer exclusão destrutiva, zero mutation;
  // consolida também a matriz final de exclusões de todas as entidades do
  // Office (conta/reserva/recebível/despesa/projeto)
  'gate3-4-expense-delete-integrity.test.mjs',
  // Gate 2.2 — patch de consolidação temporal decorrente de auditoria
  // externa dos Gates 2/2.1/3.x: getReceitasEfetivasForMonth confundia
  // COMPETÊNCIA (o mês a que uma ocorrência recorrente "pertence",
  // recebidoPorMes) com CAIXA (o mês em que o dinheiro realmente entrou,
  // dataRecebimento) — uma competência atrasada/antecipada aparecia como
  // "entrada real" no mês errado, ou nunca aparecia no mês certo.
  // getCashRevenuesForMonth é a nova visão de caixa canônica (varre TODAS as
  // competências via getRecurringRevenueCashDate, motor do Gate 2.1, nunca
  // duplicado); getReceitasEfetivasForMonth passa a ser um wrapper fino
  // sobre ela (seus dois únicos callers eram perguntas de caixa). A UI de
  // confirmação de salário (toggleReceitaRecebida) deixa de forçar a data de
  // hoje e agora abre um modal com a data real editável. getReceivedSalaryEvents
  // + getCurrentFinancialCycle são os adapters novos entre state.receitas e
  // getFinancialCycle (motor puro do Gate 2, nunca reescrito) — o ciclo
  // continua uma visão derivada, sem persistir cycleId em nada.
  'gate2-2-cash-view.test.mjs', 'gate2-2-salary-ui.test.mjs', 'gate2-2-cycle-adapter.test.mjs',
  'gate2-2-audit.test.mjs',
  'gate4-1-projection.test.mjs',
  'gate4-2-variables.test.mjs',
  'gate4-3-dashboard.test.mjs',
  // Gate 5 — correções de validação do usuário (UAT): parcelamentos
  // restritos ao período ativo, nomenclatura de reembolso no fluxo pessoal,
  // contrato do Caixa do Escritório com entrada e saldo parcelado, e
  // sincronização segura com o Google Drive diante de falha de transporte.
  'gate5-parcelamentos-periodo.test.mjs',
  'gate5-reembolso-nomenclatura.test.mjs',
  'gate5-office-contrato.test.mjs',
  'gate5-drive-sync-safety.test.mjs',
  // Gate 5 (UAT) — salário legado editado como recorrente é convertido no
  // mesmo registro (sem duplicar, sem inventar datas) e vira elegível ao
  // seletor de salário principal.
  'gate5-salario-legacy-conversion.test.mjs',
  // Gate 5 (UAT) — patch "Saldo que permanece nas contas" (docs/gates/
  // CASH-BALANCE-UI.md): com contas cadastradas, o Dashboard substitui o
  // bloco "Guardar em Caixa" por um informativo somando a mesma fonte que
  // já alimenta o saldo real; sem contas, o mecanismo legado continua
  // intacto; o modal/confirmador legado nunca grava state.excedentes com
  // contas presentes, mesmo chamado diretamente.
  'gate5-cash-balance-ui.test.mjs',
  // Gate 5 (UAT) — ajuste de interface "Cartões / Faturas" (docs/gates/
  // CARDS-INVOICES-UI.md): concentra registro/edição/fatura de compras no
  // crédito numa única área nova, reusando state.despesas/state.cards/
  // state.faturasPagas e os cálculos existentes (getDespesasForMonth,
  // getCompetenciaFatura, calcByCardForMonth, toggleFaturaPaga); Despesas
  // volta a focar pagamento direto; navegação do Dashboard/busca/PDF/E-se
  // corrigida para não levar compra no crédito pra Despesas.
  'gate5-cards-invoices-ui.test.mjs',
  // Gate 5 (UAT) — correção dos 4 achados da auditoria Codex sobre Cartões /
  // Faturas (docs/audits/CARDS-INVOICES-UI-REVIEW.md): Despesas resume (não
  // lista) compra no crédito, sem esconder o total; nova compra no cartão
  // não pode ser fixa+parcelada nem sem data de compra válida; fatura sem
  // valor não pode ser marcada como paga, mas desmarcar um estado legado
  // continua possível.
  'gate5-cards-invoices-audit-fixes.test.mjs',
  // Gate 5 (UAT) — correção do achado impeditivo da segunda rodada de
  // auditoria (docs/audits/CARDS-INVOICES-UI-AUDIT-FIXES-REVIEW.md, base
  // 2074d42): o resumo de cartão em Despesas mostrava a soma bruta das
  // compras (_valorParcela) em vez do total efetivo pós-ajuste manual de
  // fatura que Cartões / Faturas e o pagamento usam (calcByCardForMonth).
  // Cobre as visões agrupada e filtrada, e o caso de fatura com ajuste
  // positivo e nenhuma compra lançada.
  'gate5-cards-invoices-adjusted-total.test.mjs',
  // Gate 5 (UAT) — correção da regressão da terceira rodada de auditoria
  // (docs/audits/CARDS-INVOICES-ADJUSTED-TOTAL-REVIEW.md, base 2074d42): o
  // grupo "Outros" (compras de um cartão personalizado excluído, preservadas
  // por delCartao) passou a mostrar R$ 0,00 na visão agrupada porque seu id
  // interno `_outros` não existe em calcByCardForMonth. Volta a usar g.total
  // como fallback só para esse caso, sem mexer no total ajustado dos cartões
  // reais nem na política de exclusão de cartões.
  'gate5-cards-orphan-total.test.mjs',
  // Gate 5 (UAT) — correção do risco crítico encontrado pela auditoria Codex
  // ao revisar o fallback do grupo Outros (docs/audits/
  // CARDS-INVOICES-ORPHAN-TOTAL-FINAL-REVIEW.md, base c4f33df): delCartao só
  // bloqueava cartões padrão. Excluir um cartão personalizado com histórico
  // (despesa, fatura paga, conta de pagamento ou ajuste vinculado) fazia esse
  // histórico "sumir" do saldo (calcSaldoConta/calcByCardForMonth percorrem
  // state.cards), mesmo com state.despesas/faturasPagas/faturasContas ainda
  // gravados. Agora delCartao bloqueia a exclusão de cartão personalizado com
  // qualquer vínculo em state.despesas/faturasPagas/faturasContas/
  // faturasAjustes; só cartão vazio e sem histórico continua excluível.
  'gate5-cards-delete-integrity.test.mjs',
  // Gate 5 (UAT) — imutabilidade de fatura paga (docs/audits/
  // CARDS-DELETE-INTEGRITY-REVIEW.md, "Limite ainda pendente"): uma fatura
  // marcada como paga continuava ligada ao total dinâmico das compras — criar,
  // editar, excluir ou importar uma compra pra essa fatura mudava o valor
  // debitado sem novo pagamento. despesaTocaFaturaPaga (helper central e puro
  // em index.html) agora é checado antes de qualquer mutação em
  // salvarNovaCompraCartao, addDespesa, saveEditDespesa, delDespesa,
  // confirmarLancamentosFatura (PDF, tudo ou nada), eseConverterParaReal
  // ("E se...", tudo ou nada), confirmarAjusteFatura e removerAjusteFatura.
  // Desmarcar a fatura continua sempre permitido e libera as operações de
  // novo; dinheiro/PIX nunca é afetado.
  'gate5-paid-invoice-immutability.test.mjs',
  // Gate 5 — corte do histórico, importador de PDF e ordem da fatura
  // (docs/gates/GATE-5-HISTORY-CUTOFF-PDF-AND-INVOICE-ORDER.md, base
  // 7ccbf3c): (1) o bloco "Importar Fatura em PDF" sai da interface normal
  // de Cartões/Faturas (parser legado, formato rígido, nunca foi uma
  // funcionalidade nova/corrigida) — código e dados legados preservados;
  // (2) preferência opcional por perfil financialPreferences.historyStartMonth
  // ("AAAA-MM") corta competências anteriores só nas projeções
  // (getChronologicalProjection) e nas duas médias históricas
  // (getVariableExpenseEstimate "moderna" e calcPrevisaoMediaHistorica
  // "legada"), sem apagar/migrar nenhum dado nem mudar saldo real; (3)
  // ordenarItensFaturaDesc ordena "Compras e parcelas desta fatura" da mais
  // recente pra mais antiga (dataCompra válida desc, fallback createdAt desc
  // pra legado), só apresentação; a linha do tempo da projeção continua
  // crescente e os históricos de transferências/cofrinho continuam
  // decrescentes.
  'gate5-history-cutoff-pdf-invoice-order.test.mjs',
  // Gate 5 — correção dos três achados da auditoria Codex (docs/audits/
  // HISTORY-CUTOFF-PDF-INVOICE-ORDER-REVIEW.md, documentação vigente
  // ca9bb4d, entrega anterior 62dcbef): (1) seção 4 do gate (Descoberta do
  // parcelamento no Caixa do Escritório) não estava implementada — "Entrada
  // e parcelamento" agora fica sempre visível, desabilitada fora de
  // Contratado, habilita imediatamente ao selecionar Contratado, e sair de
  // Contratado antes do cadastro não persiste valores nem gera recebível;
  // (2) o laço global de avisos sobre state.receitas (missing_revenue_date/
  // invalid_received_date) agora também respeita historyStartMonth pra
  // itens únicos com competência (mes/ano) comprovadamente anterior ao
  // corte; (3) ordenarItensFaturaDesc ganhou desempate final por `id` depois
  // de dataCompra/createdAt, garantindo o mesmo resultado com a entrada
  // invertida.
  'gate5-audit-fixes-office-cutoff-order.test.mjs',
];

let totalPass = 0, totalFail = 0, anyFail = false;
for (const file of FILES) {
  console.log(`\n=== ${file} ===`);
  try {
    const out = execFileSync(process.execPath, [path.join(__dirname, file)], { encoding: 'utf8' });
    process.stdout.write(out);
    const m = out.match(/TOTAL=(\d+) PASS=(\d+) FAIL=(\d+)/);
    if (m) { totalPass += Number(m[2]); totalFail += Number(m[3]); }
  } catch (e) {
    anyFail = true;
    process.stdout.write(e.stdout || '');
    process.stderr.write(e.stderr || String(e.message));
    const m = (e.stdout || '').match(/TOTAL=(\d+) PASS=(\d+) FAIL=(\d+)/);
    if (m) { totalPass += Number(m[2]); totalFail += Number(m[3]); }
    else { totalFail += 1; } // the file itself crashed before printing a summary
  }
}

console.log(`\n===================================`);
console.log(`FINFLOW FINANCIAL-ENGINE SUITE: TOTAL_PASS=${totalPass} TOTAL_FAIL=${totalFail}`);
console.log(`===================================`);
process.exitCode = (totalFail > 0 || anyFail) ? 1 : 0;
