# Handoff — dia de vencimento em parceladas em Dinheiro/PIX, 01/10/2026

Fluxo: Claude implementa → Codex audita. Este documento é a entrega da
implementação, não uma auditoria nem uma aprovação. Especificação:
`docs/gates/PARCELADA-DIA-VENCIMENTO.md`.

## Proveniência

- **Branch:** `fix/parcelada-dia-vencimento`.
- **Hash-base:** `a47563467be442116de94093dd22cdc06eb6cf99`, ponta de
  `fix/dashboard-cash-highlight` (Gate UX-1). **O UX-1 ainda não tem auditoria
  Codex registrada**, então este patch fica empilhado sobre ele e depende do
  PASS do UX-1.
- **Commit funcional:** `d049a235399339e250a4eff893e899fc3ccda245`.
- **Hash-final:** commit documental com este handoff e `docs/PROGRESS.md`
  (ver `git log -1`).
- Os relatórios do Codex `docs/audits/PERSONAL-CASH-PROJECTION-SCENARIOS-REAUDIT*.md`
  já estavam fora do controle de versão e assim continuam, sem alteração.
- Sem push, merge, rebase ou alteração de `main`.

## Divergência entre o pedido e o código atual

O pedido descreve `calcProximosVencimentos()` com o filtro
`if(!d.fixa || d.cartao!=='dinheiro' || !d.diaVencimento) return;`. Essa
função **não existe mais**: foi removida no UX-1 (`b617393`), e esse filtro
existia até `a90547f` e em `release/uat-2026-09-18`. Hoje,
`#dashProximosVencimentos` mostra o card "A pagar até DD/MM", que lista
`getFinancialOutlook(hoje, fim do ciclo)`. Esse motor **já** incluía as
parceladas em Dinheiro/PIX, datadas por `diaVencimento`, respeitando
`ignorarAntes`/`pagoMeses`/período, com vencidas como "Vencido desde". Por
isso a parte 1 do pedido ficou reduzida a exibir "Parcela x/N". O motor não
foi alterado.

## Mapa — `diaVencimento` (index.html, após o patch)

| Linha | Função | Leitura/escrita | Mudou? |
|---|---|---|---|
| 1853, 1859 | `aplicarDebitosAutomaticos` | lê (só fixa + débito automático) | não |
| 1910 | `migrateState` | escreve `null` se undefined | só o comentário |
| 2899 | `getChronologicalProjection` | lê: data do evento (fixa e parcelada) | não |
| 5958–5972 | `despesaAceitaDiaVencimento`, `syncDespVencimentoGroup` | nova regra de visibilidade/gravação | **novo** |
| 5943 → `syncDespVencimentoGroup()` | `onCartaoChange` (criar) | visibilidade do campo | **sim** |
| 5974 | `calcParcel` (oninput de Nº parcelas) | visibilidade do campo | **sim** |
| 6076 | `addDespesa` | escreve | **sim** |
| 6100–6103 | `addDespesa` (reset) | limpa o input e ressincroniza | **sim** |
| 6437–6439 | `openEditDespesa` | lê (valor e visibilidade) | **sim** (visibilidade) |
| 6513, 6523–6525 | `eOnParcelasChange`, `eOnCartaoChange` | visibilidade | **sim** |
| 6609 | `saveEditDespesa` | escreve | **sim** |
| 7146 | nova compra no cartão | escreve `null` | não |
| 7292 | importação de fatura PDF (cartão) | escreve `null` | não |
| HTML 782–784 | `#despVencimentoGroup` | campo | não |

## Mapa — consumidores de "próximos vencimentos"

- `calcProximosVencimentos`: **removida no UX-1**, sem consumidores.
- `renderProximosVencimentos(view)` (7757): só é chamada por
  `renderDashboard` (4716). Ela lê `getCashObligationItems(p)`, que filtra
  `p.events` e `p.undated` de `getFinancialOutlook`. O total exibido é igual
  ao card `#cashObligations` ("A pagar até") do UX-1, e a mesma `p` alimenta
  "Necessidade/Folga de caixa".
- Não há outro card "O que falta pagar", alerta ou contador que dependa dessa
  lista. Alertas, contadores e cards do Dashboard leem `p` diretamente, e o
  patch não altera `p`.

## Alterações

- `index.html`:
  - nova `despesaAceitaDiaVencimento(isDinheiro,fixa,parcelas)`: Dinheiro/PIX
    e (fixa ou parcelas > 1);
  - nova `syncDespVencimentoGroup()`;
  - mudam `onCartaoChange`, `calcParcel`, `addDespesa`, `openEditDespesa`,
    `eOnParcelasChange`, `eOnCartaoChange` e `saveEditDespesa`;
  - nova `cashObligationInstallment(e)`, que usa
    `getDespesasForMonth(mes,ano)` para achar `_parcel/_total`;
  - em `renderProximosVencimentos`, o prefixo "Parcela x/N · " entra no meta
    da linha.
  - `debitoAutomatico` não muda: continua `isDinheiro&&fixa`.
- `tests/financial-engine/parcelada-dia-vencimento.test.mjs`: arquivo novo,
  com 13 casos.
- `tests/financial-engine/run-all.mjs`: registra o arquivo novo.
- `docs/gates/PARCELADA-DIA-VENCIMENTO.md`, este handoff e
  `docs/PROGRESS.md`.

## Testes

`node tests/financial-engine/run-all.mjs` → **746/746 PASS**. Eram 733 na
base e há 13 novos; nenhum teste existente foi alterado.

| ID | Caso |
|---|---|
| PDV_01 | IPOG (6860, 14x, início 07/2026, ignorarAntes 08/2026, dia 8, pagos 08 e 09), hoje 01/10/2026 → 08/10, "Parcela 4/14", R$ 490,00, não vencida |
| PDV_02 | pula parcelas pagas; com outubro pago, a próxima no motor é 08/11 (5/14) |
| PDV_03 | `ignorarAntes` esconde a 1/14 não marcada; sem ele, ela aparece vencida (contraprova) |
| PDV_04 | setembro não pago → "Parcela 3/14 · Vencido desde 08/09" |
| PDV_05 | após a última parcela (3/3 e 14/14 pagas) → nenhum vencimento |
| PDV_06 | 1000 em 3x → "Parcela 2/3", R$ 333,33, igual a `getDespesasForMonth` |
| PDV_07 | parcelada sem dia → nenhuma data inventada; continua "sem data" (ver limitações) |
| PDV_08 | parcelada no cartão (mesmo com dia no JSON) → só na Fatura NU (+R$ 300) |
| PDV_09 | 7 fixtures (incluindo fixas e débito automático): motor, projeção pessoal, cards, linhas, ações, total e `state` idênticos a `a475634`; só o prefixo "Parcela x/N" é novo; fixas sem rótulo |
| PDV_10 | criar: campo visível com 2+ parcelas e gravado; à vista → null; débito só na fixa; fixa inalterada |
| PDV_11 | editar IPOG: abre com 8 e salvar sem mudança não altera nada; troca de dia salva; 1 parcela → null; cartão → null |
| PDV_12 | fixa com débito automático: editar e salvar preserva dia e débito |
| PDV_13 | renderizar não altera o `state`; sem erros de console |

## Validação contra backup real

Original só lido, nada versionado, nenhuma descrição impressa.

1. `node tests/financial-engine/compare-real-backup.mjs "C:\Users\jowbr\Downloads\finflow_backup_2026-10-01.json" a475634`
   → 15 meses (08/2025–10/2026), **`REAL_BACKUP_DIFFERENCES: 0`**.
2. Script de rascunho (não versionado), base × patch, hoje fixo em
   01/10/2026. `getFinancialOutlook` em quatro horizontes e
   `getPersonalMonthProjection` em 26 meses (08/2025–09/2027) ficaram
   idênticos. Também ficaram idênticos os três cards, o total e as 8 linhas
   do Dashboard.
3. **Limitação:** o backup de 01/10 disponível nesta máquina (e os de 24/09)
   **não contém a IPOG parcelada**. Nele há 0 despesas em dinheiro não fixas
   com 2+ parcelas, e a IPOG está como **fixa** de R$ 490, dia 8, início
   08/2026. A versão ajustada à mão descrita no pedido não estava disponível.
   Como substituto, uma cópia no scratchpad converteu essa fixa na forma
   descrita (6860, 14x, 07/2026, ignorarAntes 08/2026, pagos 08 e 09). Nela,
   `compare-real-backup` deu 0 diferenças, e motor, projeção, cards e total
   ficaram idênticos base × patch. A **única** diferença foi a linha 08/10
   passar a mostrar "Parcela 4/14 · Em 7 dias" (R$ 490,00).

## Limitações e pontos para revisão

- **EXTERNAL_REVIEW_REQUIRED, conflito com o UX-1:** o pedido diz "parcelada
  SEM diaVencimento continua fora do card". Pela regra do UX-1, toda parcela
  em aberto entra em "A pagar"; sem data, aparece como "sem data", por
  precaução, para que a lista some o card. Isso já acontecia em `a475634` e
  não foi alterado (PDV_07 documenta). Tirar essa parcela do card mudaria o
  total e a Necessidade de caixa.
- **EXTERNAL_REVIEW_REQUIRED, horizonte:** desde o UX-1, o card só lista
  itens até o fim do ciclo (aqui, 29/10). Se a próxima parcela não paga cair
  depois disso, ela não aparece no card, embora exista no motor (PDV_02).
  `calcProximosVencimentos` antiga olhava até 12 meses à frente. Não alterado.
- O patch depende do PASS do UX-1 e não deve ser integrado antes dele.
- Ao editar, mudar uma parcelada para 1 parcela ou para cartão zera o dia.
  Isso segue a regra pedida.
