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
