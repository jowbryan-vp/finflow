// Minimal stand-in for Chart.js, used ONLY by the financial-engine test suite.
//
// Why this exists: the app loads Chart.js from a CDN (cdn.jsdelivr.net) purely
// to draw dashboard charts. None of the financial-engine logic these tests
// exercise (getCompetenciaFatura, getDespesasForMonth, calcSaldoConta,
// calcByCardForMonth, receitaRecebida, etc.) depends on Chart.js at all — but
// renderAll()/renderDashboard() DO call `new Chart(ctx, config)` and later
// `chartX.destroy()` a few lines down, so loading the page without something
// named `Chart` throws a ReferenceError the moment those render functions run.
//
// A code-inspection pass (grep across index.html) found exactly two shapes of
// Chart.js usage anywhere in the app: `new Chart(ctx, config)` (7 call sites)
// and `.destroy()` on the resulting instance. Nothing touches Chart.register,
// Chart.defaults, plugins, or reads back chart.data/chart.config. So a stub
// that accepts any constructor arguments and no-ops destroy() is sufficient —
// this is intentionally NOT a Chart.js reimplementation, just enough surface
// to keep the app's own render calls from throwing while these tests run.
//
// pdf.js needs no equivalent stub: `pdfjsLib` is referenced in exactly two
// places in index.html, one already guarded by
// `typeof pdfjsLib !== 'undefined'`, the other inside the PDF-invoice-import
// feature, which this suite never exercises. The harness simply aborts the
// pdf.js CDN request instead of fulfilling it.
window.Chart = class ChartStub {
  constructor(ctx, config) {
    this.ctx = ctx;
    this.config = config;
  }
  destroy() {}
  update() {}
};
