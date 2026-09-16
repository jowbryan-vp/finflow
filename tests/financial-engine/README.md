# FinFlow — Suíte de Regressão do Motor Financeiro

Suíte permanente e versionada, criada no **Gate 1** (Fundação Temporal +
Cartões) para substituir os scripts avulsos usados durante a auditoria
(`/opt/node-tools/audit_tests.mjs`, `/opt/node-tools/audit_invariants.mjs`),
que viviam fora do repositório e não eram uma solução reproduzível.

Requisitos que esta suíte cumpre (seção 16 do Gate 1):
determinística, reproduzível, isolada, executável por um comando documentado,
sem depender de dados pessoais reais, sem depender de OAuth, sem tocar em
produção.

## O que cada arquivo cobre

- **`temporal.test.mjs`** — `G1-C01`–`G1-C09`: a regra dia-a-dia de
  `getCompetenciaFatura` (compra antes/depois do fechamento do cartão,
  virada de ano), mais os dois caminhos de modo legado (sem `dataCompra`, e
  com `dataCompra` mas sem `cartao.fecha` configurado).
- **`cards.test.mjs`** — `G1-P01`–`G1-P03`: parcelamentos — todas as
  parcelas derivam da competência da PRIMEIRA fatura, não de uma regra fixa
  por parcela. Reexecuta `INV-05` (soma das parcelas == total) sob a nova
  regra.
- **`legacy.test.mjs`** — `G1-L01`–`G1-L04`: compatibilidade com dados
  legados — despesa antiga sem `dataCompra` continua exatamente como antes;
  reimportar um backup antigo não muda competências; abrir/salvar sem editar
  não inventa `dataCompra`; editar um campo não-temporal (descrição) de uma
  despesa legada, pelo modal real de edição, mantém o registro legado.
- **`cash-invariants.test.mjs`** — `CASH-01`–`CASH-03` (nomeados
  explicitamente no Gate 1) e a reexecução de `INV-01` a `INV-09`, `INV-11` e
  `INV-12` da auditoria original (`INV-10` fica de fora — está marcado como
  violado na auditoria e sua correção é escopo de um gate futuro sobre
  saldo real vs. projetado).
- **`compare-real-backup.mjs`** — compara, mês a mês, os números da versão
  baseline (pré-Gate-1) contra a versão atual, usando uma CÓPIA do backup
  real do usuário. Não é parte do `npm test` — recebe o caminho do backup
  como argumento (ver abaixo) porque o arquivo real não faz parte do
  repositório.

## Como rodar

```bash
cd tests/financial-engine
npm install          # instala o playwright (única dependência)
npm test             # roda os quatro arquivos .test.mjs e imprime o resumo
```

Cada arquivo também roda isoladamente, por exemplo `node temporal.test.mjs`.

Pré-requisito de ambiente: um Chromium acessível ao Playwright. Se
`chromium.launch()` falhar por não achar o executável, ajuste o
`executablePath` no topo de `harness.mjs` (ou rode `npx playwright install
chromium` e remova o `executablePath` para usar o Chromium baixado pelo
Playwright).

### Comparação com o backup real

```bash
cd tests/financial-engine
node compare-real-backup.mjs /caminho/para/seu-backup.json [commit-baseline]
```

- O arquivo original NUNCA é aberto para escrita — o script copia para uma
  pasta temporária do sistema antes de ler.
- `commit-baseline` é o commit git que representa o estado ANTES do Gate 1
  (default: `569c1cb`, o baseline registrado no relatório do Gate 1).
- Saída: quantos meses históricos foram comparados e quantas diferenças
  foram encontradas. Qualquer diferença = Gate 1 FAIL, por definição da
  seção 22 do Gate 1. O resultado detalhado (que contém números financeiros
  reais) é salvo só na pasta temporária do sistema — nunca commitado.

## Como a suíte evita dependências externas ao repositório

- **Chart.js**: a app só usa `new Chart(ctx, config)` e `.destroy()` em
  todo o código (confirmado por inspeção — nenhum outro uso da API estática
  do Chart.js). `fixtures/chart-stub.js`, dentro deste diretório, cobre
  exatamente essa superfície — não é uma cópia do bundle real.
- **pdf.js**: não precisa de stub nenhum. `pdfjsLib` só aparece em dois
  lugares no `index.html` — um já protegido por
  `typeof pdfjsLib !== 'undefined'`, o outro dentro da função de importar
  fatura em PDF, que nenhum teste desta suíte exercita. O harness só
  bloqueia (`route.abort()`) a requisição do CDN para o pdf.js.
- **Fontes do Google**: bloqueadas do mesmo jeito — produzem um
  `ERR_FAILED` inofensivo no console, já esperado e filtrado pelo harness.
- **Servidor HTTP**: o próprio `harness.mjs` sobe um servidor estático
  (módulo `http` do Node) numa porta livre e derruba no final de cada
  arquivo de teste — não depende de nenhum servidor já estar rodando.
- **OAuth do Google**: nunca é exercitado. Todo teste carrega estado
  chamando `migrateAppData(...)` diretamente via `page.evaluate`, com dados
  sintéticos (`baseSyntheticState` em `harness.mjs`) ou, no caso do
  `compare-real-backup.mjs`, uma cópia do backup real — nunca a tela de
  login.
