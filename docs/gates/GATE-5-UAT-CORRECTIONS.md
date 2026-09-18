# Gate 5 — Correções de validação do usuário (UAT)

Branch: `gate/5-uat-corrections`, a partir de `release/uat-2026-09-18` (HEAD `1d8e4577763447393d4a3e4ea5a612b3955805a9`, baseline `TOTAL_PASS=305 TOTAL_FAIL=0`).

Escopo autorizado: quatro achados da validação do usuário, especificados no handoff. Este documento registra a especificação técnica antes da implementação, conforme AGENTS.md/WORKFLOW.md.

## 1. Parcelamentos ativos no mês selecionado

**Problema:** `renderParcelamentos()` (index.html) filtra somente `d.parcelas > 1`, sem checar se `currentMonth`/`currentYear` está dentro do intervalo do parcelamento. Parcelamentos concluídos continuam aparecendo (inclusive a 100%) em todos os meses futuros.

**Correção:** calcular, para cada despesa parcelada, o mês/ano de início (`mIni`/`yIni`, já calculado hoje via `getCompetenciaFatura` para cartão de crédito e `mesInicio`/`anoInicio` para dinheiro/PIX) e o mês/ano de término (início + `parcelas - 1`, usando a mesma função `addMonths`). Só exibir a linha quando `currentMonth`/`currentYear` estiver entre início e término, inclusive. Nenhuma outra lógica (cálculo de progresso, dados armazenados) muda — é filtragem/apresentação pura.

Título do card: "Todos os Parcelamentos Ativos" → "Parcelamentos Ativos no Período". Estado vazio: mensagem específica ("Nenhum parcelamento ativo neste período" em vez do genérico "Nenhum parcelamento cadastrado").

## 2. Nomenclatura de reembolso (fluxo pessoal)

**Escopo:** renomear apenas textos visíveis do fluxo PESSOAL de "Presente/Repasse" (terceiros reembolsando compras no cartão do usuário) para "Reembolso de compra no cartão" e variantes, conforme lista literal do handoff (linhas mapeadas por exploração: option value="repasse" label, info-box, nav "Repasses/Pessoas", título de card, PAGE_TITLES, mapas `tipos` — só a chave `repasse`, nunca `repasse_escritorio`/`retirada_escritorio` —, nome automático "Repasse: ...", toasts, modal, PDFs).

**Não tocar:** `tipo:'repasse'`, `isRepasse`, `repasses` (campo/função), nada em `state.office.*`, `repasse_escritorio`, `retirada_escritorio`, `renderOfficeRepassesTab`, `realizeOfficeTransfer`, rótulo "Repasse ao Jow", ou qualquer string do Caixa do Escritório.

## 3. Contrato do escritório com entrada e parcelamento

**Modelo:** estender o formulário "Novo Projeto" (`renderOfficeProjetosTab`/`addOfficeProjeto`) com campos financeiros que só se aplicam quando `status==='contratado'`: valor da entrada, data prevista da entrada, "entrada já recebida" + data real, quantidade de parcelas do saldo (aceita 0), data prevista da 1ª parcela, conta empresarial de destino.

**Geração:** ação explícita (dentro de `addOfficeProjeto`, só quando `status==='contratado'` e os campos financeiros estiverem preenchidos) que empurra recebíveis para `state.office.recebiveis` usando a estrutura existente (`{id,projetoId,descricao,valor,estado,dataPrevista,dataRecebimento,contaDestino,createdAt}`), e chama `syncDerivedPersonalTransfer(id)` para cada um, exatamente como `addOfficeRecebivel()` já faz. Nenhum motor financeiro paralelo.

**Arredondamento:** todos os valores de formulário convertidos para centavos inteiros (`Math.round(valor*100)`) antes de dividir; parcela = `Math.floor(saldoCentavos/n)`; resto (`saldoCentavos - parcela*n`) somado à última parcela. Conversão de volta para reais (`/100`) só ao gravar `valor` no recebível.

**Validações (bloqueiam o cadastro, sem mutação):** contrato <= 0; entrada < 0; entrada > contrato; parcelas negativas/fracionárias; saldo > 0 com parcelas === 0; saldo parcelado sem data da 1ª parcela; geração sem conta de destino.

**Datas mensais:** usar o dia da data da 1ª parcela; se o mês de destino não tiver esse dia, usar o último dia válido (reaproveitar o padrão `Math.min(dia, new Date(ano,mes,0).getDate())`, já usado em `projectionDate`).

**Proteção histórica:** geração só ocorre no cadastro (não em edição, não em render, não em import). Edição de projeto não regenera nem apaga recebíveis; recebíveis com `estado==='recebido'` nunca são tocados por este gate.

**Apresentação:** listagem do projeto passa a mostrar valor do contrato, entrada, saldo parcelado, nº de parcelas, total previsto, total recebido, saldo a receber — todos derivados dos recebíveis existentes (soma de `valor` por estado), sem novo campo de estado agregado.

## 4. Sincronização segura com o Google Drive

**Risco 1:** `syncFromDrive()` engolia o erro internamente (`catch` só chama `setDriveStatus`) — o chamador não conseguia saber se falhou. Correção: propagar (re-throw) para quem chama, preservando o `catch` que atualiza o indicador.

**Risco 2:** o botão manual (`sincronizarAgora` → `syncFromDrive(true)`) podia baixar dados remotos por cima de alterações locais não sincronizadas. Correção: `sincronizarAgora()` passa a checar `localStorage.getItem('finflow_unsynced')==='1'` primeiro; se houver, tenta `saveToDrive()` (enviar local) e NUNCA chama `syncFromDrive()` nesse caminho; só baixa do Drive quando não há pendência local, replicando a lógica já existente em `initApp()`.

**Mensagem amigável:** ao capturar `TypeError` com mensagem `Failed to fetch` (falha de transporte do `fetch`, sem resposta HTTP), mostrar texto amigável fixo (ambiente, não credencial) mantendo o detalhe técnico original no `title` do indicador. Não reclassificar automaticamente como 401/403/token/permissão.

**Limites:** nenhuma mudança de Client ID/escopo/credenciais; `finflow_unsynced` continua existindo e sendo respeitado; nenhuma tentativa automática infinita (o usuário aciona manualmente).

## Testes

Novos arquivos em `tests/financial-engine`, adicionados a `run-all.mjs`:
- `gate5-parcelamentos-periodo.test.mjs`
- `gate5-reembolso-nomenclatura.test.mjs`
- `gate5-office-contrato.test.mjs`
- `gate5-drive-sync-safety.test.mjs`

Cobertura conforme listas obrigatórias do handoff (ver relatório de implementação para detalhes por caso).

## Limites gerais

Sem alteração de `delivery/index.html`, sem refatoração fora do escopo, sem novo gate, sem dados reais, sem push/merge.
