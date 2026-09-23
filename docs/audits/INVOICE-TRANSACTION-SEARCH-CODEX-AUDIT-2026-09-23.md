# Auditoria Codex — pesquisa de lançamentos na fatura — 23/09/2026

## Resultado

**FAIL — correção Claude necessária.**

Fluxo respeitado: implementação atribuída ao Claude; Codex apenas revisou,
executou verificações e registrou esta auditoria. Nenhum código de produto foi
corrigido nesta etapa.

## Escopo e proveniência

- Branch auditada: `fix/invoice-transaction-search`.
- Base confirmada: `9896327775f11c74aed655259dd9028803f862f2`.
- Commit funcional: `23833c47c6100da578e680e49b3a72a411bb32a2`.
- Commit documental: `1325396466ec384fb20c43cc292827f475657cf3`.
- Antes da auditoria, o merge-base com o HEAD era exatamente a base, havia
  somente esses dois commits posteriores e a working tree estava limpa.
- Arquivos revisados no diff completo: `index.html`,
  `tests/financial-engine/gate5-invoice-transaction-search.test.mjs`,
  `tests/financial-engine/run-all.mjs` e
  `docs/handoffs/HANDOFF-INVOICE-TRANSACTION-SEARCH-2026-09-23.md`.
- Código relacionado revisado: navegação/troca de mês, seleção e renderização
  de faturas, ordenação, renderização/edição/exclusão de despesas, pesquisa
  global, cálculo de total e status de pagamento.

## Achado

### P2 — termo da pesquisa anterior permanece ao trocar o mês da fatura

- Arquivo/linhas: `index.html:2319-2323` e `index.html:6512-6513`.
- Causa: `changeMonth()` altera `currentMonth/currentYear` e chama
  `renderAll()`, mas não limpa `#cartaoFaturaSearchInput`. O render seguinte
  lê novamente o mesmo valor do input e o aplica aos lançamentos do novo mês.
- Reprodução:
  1. Abra Cartões / Faturas em setembro/2026 no cartão Nubank.
  2. Tenha em setembro um lançamento com “Amazon” e, em outubro, um lançamento
     “Netflix Outubro”.
  3. Pesquise `amazon` na fatura de setembro.
  4. Use o controle global para avançar para outubro sem sair da aba.
  5. Observe que o campo ainda contém `amazon` e a fatura de outubro mostra
     “Nenhum lançamento encontrado com esse termo nesta fatura.”, ocultando
     “Netflix Outubro”.
- Evidência automatizada independente:
  `query="amazon"`, `periodo="Outubro 2026"` e lista renderizada igual a
  `Nenhum lançamento encontrado com esse termo nesta fatura.`.
- Impacto: a fatura recém-aberta pode parecer vazia ou incompleta devido a um
  filtro residual invisivelmente herdado de outra competência. Não há mutação
  financeira nem perda de dados, mas o requisito explícito de isolamento entre
  cartão/mês/fatura não é atendido.
- Esperado: trocar mês/ano deve limpar a pesquisa antes de renderizar a nova
  fatura (ou manter estado explicitamente isolado por fatura, sem reutilizar o
  termo anterior). A lista do novo período deve abrir completa.
- Lacuna de teste: os 12 testes específicos cobrem troca de conteúdo, limpeza,
  total, ordenação e imutabilidade, mas não exercitam `changeMonth()` com uma
  pesquisa ativa.

## Verificações executadas

- `node tests/financial-engine/gate5-invoice-transaction-search.test.mjs`:
  **12 PASS, 0 FAIL**.
- `node tests/financial-engine/run-all.mjs`:
  **621 PASS, 0 FAIL**.
- `git diff --check 9896327775f11c74aed655259dd9028803f862f2..HEAD`:
  **PASS**, sem saída.
- Comparação com backup real: **não executada**; busca por arquivos JSON no
  repositório não encontrou backup real. O script
  `tests/financial-engine/compare-real-backup.mjs` está disponível, mas exige
  caminho externo não fornecido.
- Verificação prática em navegador isolado, com fixture sintética:
  pesquisa, limpar, troca de cartão, saída/reabertura, troca de mês, caracteres
  especiais/acentos, digitação rápida e abertura de edição de resultado
  filtrado. Edição abriu o lançamento correto por ID; troca de cartão e
  reabertura limparam o campo; troca de mês reproduziu o achado acima;
  `state.despesas` permaneceu byte a byte idêntico durante as pesquisas; nenhum
  erro de console foi observado.
- Chrome normal: o app local abriu, mas parou na autenticação Google. Nenhuma
  credencial foi inserida e nenhum login foi contornado; a interação completa
  ficou restrita ao harness isolado do projeto.
- Acessibilidade/HTML: o campo aparece como textbox com nome acessível derivado
  do placeholder; nenhum ID duplicado foi encontrado. O termo pesquisado não é
  interpolado em `innerHTML`, e os dados exibidos continuam passando por
  `esc(...)` onde aplicável.
- Revisão independente confirmou que filtro e ordenação atuam em arrays de
  apresentação, ações usam o ID do lançamento, totais/status continuam lendo
  a fatura completa, pesquisa global não foi alterada e o importador de PDF
  continua ausente da interface normal.

## Prompt completo de correção para o Claude

```text
Você é o implementador Claude no fluxo obrigatório “Claude implementa → Codex
audita”. Trabalhe exclusivamente na branch fix/invoice-transaction-search,
partindo do HEAD entregue após a auditoria Codex. Antes de editar, confirme
branch, status e histórico. Não faça checkout/merge/rebase/push, não toque na
main e não publique a branch.

Corrija o achado P2 documentado em
docs/audits/INVOICE-TRANSACTION-SEARCH-CODEX-AUDIT-2026-09-23.md:
quando existe uma pesquisa ativa na aba Cartões / Faturas e o usuário troca o
mês/ano pelo controle global, #cartaoFaturaSearchInput mantém o termo e filtra
indevidamente a nova fatura. A nova competência deve abrir com a lista completa,
sem estado residual da pesquisa anterior. Preserve as limpezas já existentes ao
trocar cartão/fatura e ao sair/reabrir a aba.

Faça a menor alteração de produto possível. Não altere regras financeiras,
competência, total, pagamento, fechamento/vencimento, ordenação, RRT,
distribuição do escritório, contas, transferências, importador de PDF ou a busca
global de Receitas/Despesas. A pesquisa deve continuar somente de apresentação,
sem mutar nem reordenar state.despesas.

Adicione teste de regressão real ao arquivo específico (ou arquivo claramente
relacionado) que:
1. carregue duas competências com lançamentos diferentes;
2. abra setembro na aba Fatura, pesquise por um item existente somente em
   setembro e confirme o filtro;
3. execute a troca real de mês via changeMonth(1);
4. confirme que o campo ficou vazio, que o lançamento de outubro aparece e que
   não há mensagem falsa de “nenhum resultado”;
5. confirme que state.despesas ficou byte a byte inalterado e que total/status
   da nova fatura continuam corretos;
6. cubra também a virada dezembro/janeiro, se o mesmo caminho de troca puder
   regredir nessa fronteira.

Execute os testes específicos, a suíte financeira completa e git diff --check.
Revise o diff, faça commit apenas dos caminhos da correção/testes, e entregue ao
Codex: hash-base recebido, hash do novo commit, diff/stat, resultados completos,
working tree limpa e limitações. Não edite o relatório de auditoria Codex e não
declare PASS; a decisão final cabe à nova auditoria Codex.
```

## Segurança do repositório

Nenhum checkout, merge, rebase, push ou publicação foi executado. A referência
remota `origin/main` observada durante a auditoria permaneceu fora do escopo de
escrita; a auditoria não alterou a `main`.
