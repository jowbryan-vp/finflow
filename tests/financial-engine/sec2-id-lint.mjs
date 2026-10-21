// SEC-2 — verificador estático de IDs em handlers inline e atributos HTML.
//
// Percorre o index.html inteiro (inclusive templates de várias linhas e
// templates aninhados dentro de atributos), encontra cada interpolação ${...}
// e descobre o contexto real em que ela cai: valor de atributo on* (handler),
// outro atributo, ou texto. Depois classifica a expressão:
//
//   HANDLER_QUOTED_RAW  '${expr}' dentro de on*="..." sem jsArg  (injeção JS)
//   HANDLER_ESC         ${esc(expr)} dentro de on*="..."         (esc não protege JS)
//   HANDLER_BARE_ID     ${idExpr} sem aspas em on*="..."           (injeção JS)
//   HANDLER_INDIRECT    on*="${expr}" — o código inteiro vem de uma variável
//   ATTR_RAW_ID         ${idExpr} cru em outro atributo           (quebra de atributo)
//   ATTR_RAW_NONID      valor não-ID cru em atributo              (só relatório: SEC-2B3)
//
// Limitações (registradas): é heurístico. "Parece ID" é decidido pelo nome da
// expressão (id, xxxId, ref, accId...). Constantes seguras são aceitas só por
// uma lista explícita (função + expressão + motivo). Não acompanha o valor
// pelo fluxo de dados; não vê HTML montado por concatenação com '+' fora de
// template literal. Não substitui os testes no navegador nem a revisão
// origem → sink.
import fs from 'node:fs';

const ID_RE = /(^|[.?])(id|[A-Za-z]*Id)$/;
const ID_NAMES = new Set(['id', 'pid', 'ref', 'accId', 'editId', 'cardId', 'cartaoId', 'catId', 'recId', 'personId', 'despesaId', 'transferId', 'projetoId', 'reservaId', 'repasseId', 'itemId', 'parcelaId', 'rrtId', 'contaId']);
const isIdExpr = (e) => ID_RE.test(e) || ID_NAMES.has(e);
const SAFE_WRAP = /^(esc|jsArg|safeCssColor|safeColorInput|contaLabelHTML|Number|parseInt|encodeURIComponent)\(/;

// Números/booleanos internos aceitos sem aspas em handlers (origem verificada no SEC-2A).
const HANDLER_BARE_OK = new Set(['mes', 'ano', 'i', 'idx', 'n', 'currentMonth', 'currentYear', 'r.mes', 'r.ano', 'r._parcelaIdx', 'r.comoReceita', 'precisaPlano']);
// Constantes/derivados seguros, por função. Motivo ao lado.
const WHITELIST = new Map([
  ['renderPersonalMonthSummary|id', 'ids de tiles: literais passados pelo próprio código (pm...)'],
  ['renderPersonalMonthSummary|prefix', 'prefixo literal do próprio código'],
  ['renderPersonalMonthSummary|k', 'chave de natureza/tipo: literal do próprio código'],
  ['renderTodasAsContas|irPara', 'HANDLER_INDIRECT: só "navigate(\'contas\')" ou "irParaContasEscritorio()", literais'],
  ['renderResumoPagar|it.acao', 'HANDLER_INDIRECT: montado com jsArg (SEC-2B1) ou literal; função sem chamador na UI'],
  ['renderResumoPagar|it.verLink', 'HANDLER_INDIRECT: montado com jsArg (SEC-2B1); função sem chamador na UI'],
  ['renderNovoContratoV3Form|i+1', 'índice (1..5) do loop sobre OFFICE_NOVO_ETAPAS, array literal fechado do próprio código — nunca dado externo; precisa continuar numérico (comparado com Number(dataset.etapa) em officeNovoMostrarEtapa)'],
  ['officeAbaResumo|acao', 'HANDLER_INDIRECT: montado só com literais do próprio código (aba(\'recebimentos\'|\'rrts\'|\'tributacao\'|\'distribuicao\'|\'custos\') ou "switchOfficeTab(\'config\')"), nunca dado externo'],
]);

function lineStarts(src) { const a = [0]; for (let i = 0; i < src.length; i++) if (src[i] === '\n') a.push(i + 1); return a; }
function lineOf(starts, pos) { let lo = 0, hi = starts.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= pos) lo = mid; else hi = mid - 1; } return lo + 1; }

// Pula uma interpolação ${...} começando em src[i]==='$' && src[i+1]==='{'. Devolve o índice depois do '}'.
function skipInterp(src, i) {
  let depth = 0; let j = i + 1;
  for (; j < src.length; j++) {
    const c = src[j];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return j + 1; }
    else if (c === '`') j = skipTemplate(src, j) - 1;
    else if (c === "'" || c === '"') j = skipString(src, j, c) - 1;
  }
  return j;
}
function skipString(src, i, q) { let j = i + 1; for (; j < src.length; j++) { if (src[j] === '\\') { j++; continue; } if (src[j] === q || src[j] === '\n') return j + 1; } return j; }
function skipTemplate(src, i) {
  let j = i + 1;
  for (; j < src.length; j++) {
    if (src[j] === '\\') { j++; continue; }
    if (src[j] === '`') return j + 1;
    if (src[j] === '$' && src[j + 1] === '{') j = skipInterp(src, j) - 1;
  }
  return j;
}

// Contexto HTML da posição p (início de "${"): procura a tag aberta mais próxima
// ('<' + letra, precedido de início de template, '>' ou espaço) e anda pelos
// atributos até p.
function contextAt(src, p) {
  let k = p;
  for (let tries = 0; tries < 60; tries++) {
    k = src.lastIndexOf('<', k - 1);
    if (k < 0 || p - k > 4000) return { kind: 'text' };
    if (!/[a-zA-Z]/.test(src[k + 1] || '')) continue;
    if (!/[`>\s"']/.test(src[k - 1] || '')) continue;
    const r = walkTag(src, k, p);
    if (r) return r;
    return { kind: 'text' };
  }
  return { kind: 'text' };
}
function walkTag(src, start, p) {
  let i = start + 1;
  while (i < p && /[\w-]/.test(src[i])) i++;
  return walkAttrs(src, i, p);
}
// Anda por uma lista de atributos a partir de i até p. Se p estiver dentro de
// uma interpolação em posição de atributo (ex.: ${c?`onclick="..."`:''}),
// desce no template literal mais interno que contém p e continua a análise lá.
function walkAttrs(src, i, p) {
  while (i < src.length) {
    if (i >= p) return { kind: 'tag' };
    const c = src[i];
    if (c === '>') return null; // tag fechou antes de p
    if (c === '$' && src[i + 1] === '{') {
      const e = skipInterp(src, i);
      if (p < e) {
        const inner = src.lastIndexOf('`', p);
        if (inner > i) return walkAttrs(src, inner + 1, p) || { kind: 'tag', nested: true };
        return { kind: 'tag', nested: true };
      }
      i = e; continue;
    }
    if (/\s|\//.test(c)) { i++; continue; }
    let n = i; while (n < src.length && !/[\s=>]/.test(src[n])) n++;
    const name = src.slice(i, n);
    i = n;
    if (src[i] !== '=') continue;
    i++;
    const q = src[i];
    if (q === '"' || q === "'") {
      const vStart = i + 1; let j = vStart;
      while (j < src.length && src[j] !== q) {
        if (src[j] === '$' && src[j + 1] === '{') { const e = skipInterp(src, j); if (p >= j && p < e) return { kind: 'attr', name: name.toLowerCase(), quote: q, vStart, nested: p !== j }; j = e; continue; }
        j++;
      }
      if (p >= vStart && p < j) return { kind: 'attr', name: name.toLowerCase(), quote: q, vStart };
      i = j + 1; continue;
    }
    let j = i; while (j < src.length && !/[\s>]/.test(src[j])) j++;
    if (p >= i && p < j) return { kind: 'attr', name: name.toLowerCase(), quote: '', vStart: i };
    i = j;
  }
  return null;
}

export function lintIds(src, { personalEndLine } = {}) {
  const starts = lineStarts(src);
  const fnAt = []; // função corrente por linha
  const lines = src.split('\n'); let cur = '';
  lines.forEach((l, idx) => { const m = l.match(/^(?:async )?function ([A-Za-z0-9_]+)\(/); if (m) cur = m[1]; fnAt[idx + 1] = cur; });
  const endPersonal = personalEndLine ?? (lines.findIndex((l) => /^function syncDerivedPersonalTransfer\(/.test(l)) + 1);
  const findings = [];
  let pos = 0;
  while ((pos = src.indexOf('${', pos)) >= 0) {
    const end = skipInterp(src, pos);
    const expr = src.slice(pos + 2, end - 1).trim();
    const line = lineOf(starts, pos);
    const ctx = contextAt(src, pos);
    pos += 2;
    if (ctx.kind !== 'attr') continue;
    const fn = fnAt[line] || '';
    const domain = line < endPersonal ? 'pessoal' : 'escritorio';
    const wl = WHITELIST.get(`${fn}|${expr}`);
    const prev = src[pos - 3];
    const add = (rule) => findings.push({ rule, line, fn, domain, attr: ctx.name, expr: expr.slice(0, 80), whitelisted: wl || null });
    if (/[`]/.test(expr)) continue; // expressão com template aninhado: as interpolações internas são verificadas uma a uma
    if (ctx.name.startsWith('on')) {
      const indirect = pos - 2 === ctx.vStart && !ctx.nested; // on*="${expr}": o código inteiro vem da variável
      if (/^esc\(/.test(expr)) add('HANDLER_ESC');
      else if (/^jsArg\(/.test(expr) || /^\w+\?jsArg\(\w+\):'null'$/.test(expr)) continue;
      else if (indirect) add('HANDLER_INDIRECT');
      else if (prev === "'" || (prev === '"' && ctx.quote === "'")) add('HANDLER_QUOTED_RAW');
      else if (isIdExpr(expr)) add('HANDLER_BARE_ID');
      else if (!HANDLER_BARE_OK.has(expr) && !/^[\w.]+\.toFixed\(\d\)$/.test(expr) && !SAFE_WRAP.test(expr)) add('HANDLER_BARE_OTHER');
    } else if (!SAFE_WRAP.test(expr)) {
      if (isIdExpr(expr)) add('ATTR_RAW_ID');
      else add('ATTR_RAW_NONID');
    }
  }
  return findings;
}

// Modo teste (sem argumentos, usado pelo run-all.mjs): lint do index.html do
// repositório + autoteste das regras com trechos sintéticos.
async function runAsTest() {
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const src = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const results = [];
  const check = (id, ok, detail) => { results.push(ok); console.log(`[${ok ? 'PASS' : 'FAIL'}] ${id}: ${detail}`); };
  const f = lintIds(src);
  const pessoaisId = f.filter((x) => x.domain === 'pessoal' && !x.whitelisted && x.rule !== 'ATTR_RAW_NONID');
  check('SEC2_LINT_PERSONAL_NO_RAW_IDS', pessoaisId.length === 0,
    `domínio pessoal sem ID cru em handler/atributo, sem esc() em handler e sem handler indireto fora da whitelist — encontrados: ${JSON.stringify(pessoaisId.map((x) => `L${x.line} ${x.rule} ${x.fn} ${x.expr}`))}`);
  // SEC-2B2: o escritório agora é condição de gate nos mesmos termos do
  // domínio pessoal (SEC-2B1) — zero achados de segurança de ID fora da
  // whitelist explícita. ATTR_RAW_NONID (valores não-ID em atributo) fica
  // reservado ao SEC-2B3 e não entra nesta condição.
  const escritorioId = f.filter((x) => x.domain === 'escritorio' && !x.whitelisted && x.rule !== 'ATTR_RAW_NONID');
  check('SEC2_LINT_OFFICE_NO_RAW_IDS', escritorioId.length === 0,
    `domínio escritório sem ID cru em handler/atributo, sem esc() em handler e sem handler indireto fora da whitelist — encontrados: ${JSON.stringify(escritorioId.map((x) => `L${x.line} ${x.rule} ${x.fn} ${x.expr}`))}`);
  // Toda exceção da whitelist precisa continuar existindo no código; uma
  // entrada órfã indicaria que o código mudou e a exceção deve ser revista.
  const usados = new Set(f.filter((x) => x.whitelisted).map((x) => `${x.fn}|${x.expr}`));
  const orfas = [...WHITELIST.keys()].filter((k) => !usados.has(k));
  check('SEC2_LINT_WHITELIST_EXACT', orfas.length === 0, `todas as ${WHITELIST.size} exceções correspondem a pontos reais do código (função + expressão) — órfãs: ${JSON.stringify(orfas)}`);
  // Autoteste: cada regra precisa disparar em um trecho mínimo, inclusive em
  // template de várias linhas e em template aninhado dentro de atributo.
  const amostras = [
    ['HANDLER_QUOTED_RAW', "function a(){ return `<b onclick=\"f('${x.id}')\">`; }"],
    ['HANDLER_ESC', "function a(){ return `<b onclick=\"f('${esc(x.id)}')\">`; }"],
    ['HANDLER_BARE_ID', "function a(){ return `<b onclick=\"f(${x.id})\">`; }"],
    ['HANDLER_INDIRECT', "function a(){ return `<b onclick=\"${acaoX}\">`; }"],
    ['ATTR_RAW_ID', "function a(){ return `<option value=\"${c.id}\">`; }"],
    ['HANDLER_QUOTED_RAW', "function a(){ return `<div class=\"x\"\n   onclick=\"f('${x.id}')\"\n   >`; }"],
    ['HANDLER_QUOTED_RAW', "function a(){ return `<div>${ok?`<b onclick=\"f('${x.id}')\">`:''}</div>`; }"],
    // atributo inteiro gerado por template aninhado em posição de atributo
    ['HANDLER_QUOTED_RAW', "function a(){ return `<div class=\"x\" ${ok?`onclick=\"f('${x.id}')\"`:''}>`; }"],
    ['ATTR_RAW_ID', "function a(){ return `<option ${ok?`value=\"${c.id}\"`:''}>`; }"],
  ];
  const falhas = amostras.filter(([regra, trecho]) => !lintIds(trecho, { personalEndLine: 99 }).some((x) => x.rule === regra));
  const limpos = ["function a(){ return `<b onclick=\"f(${jsArg(x.id)})\">`; }", "function a(){ return `<option value=\"${esc(c.id)}\">`; }"]
    .filter((t) => lintIds(t, { personalEndLine: 99 }).length);
  check('SEC2_LINT_SELF_TEST', !falhas.length && !limpos.length, `${amostras.length} trechos inseguros detectados pela regra certa (inclui multilinha e aninhado) e 2 trechos corretos sem alerta — falhas: ${JSON.stringify(falhas.map((a) => a[0]))} falsos alertas: ${limpos.length}`);
  const nonid = f.filter((x) => x.rule === 'ATTR_RAW_NONID').length;
  console.log(`[INFO] pendência fora do SEC-2B1/SEC-2B2: valores não-ID em atributos (SEC-2B3)=${nonid}`);
  const fails = results.filter((ok) => !ok).length;
  console.log(`sec2-id-lint: TOTAL=${results.length} PASS=${results.length - fails} FAIL=${fails}`);
  if (fails) process.exitCode = 1;
}

// CLI: node sec2-id-lint.mjs <index.html> [--list [domínio]] → resumo por regra e domínio
// Sem argumentos: modo teste (run-all.mjs).
if (process.argv[1] && process.argv[1].endsWith('sec2-id-lint.mjs') && !process.argv[2]) {
  await runAsTest();
} else if (process.argv[1] && process.argv[1].endsWith('sec2-id-lint.mjs')) {
  const f = lintIds(fs.readFileSync(process.argv[2], 'utf8'));
  const by = {};
  f.forEach((x) => { const k = `${x.domain}\t${x.rule}${x.whitelisted ? ' (whitelist)' : ''}`; by[k] = (by[k] || 0) + 1; });
  Object.entries(by).sort().forEach(([k, v]) => console.log(String(v).padStart(4), k));
  if (process.argv[3] === '--list') f.filter((x) => !x.whitelisted && (process.argv[4] ? x.domain === process.argv[4] : true) && x.rule !== 'ATTR_RAW_NONID').forEach((x) => console.log(`L${x.line}\t${x.domain}\t${x.rule}\t${x.fn}\t${x.attr}\t${x.expr}`));
}
