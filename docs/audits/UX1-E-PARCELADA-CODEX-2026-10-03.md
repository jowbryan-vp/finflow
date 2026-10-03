# Auditoria independente Codex — UX-1 e vencimento de parceladas

Data: 03/10/2026. Autor da implementação: Claude Code, conforme handoffs.
Auditor: Codex. Nenhum código de produto foi alterado nesta auditoria.

## Escopo e resultado

| Entrega | Base → commit funcional → handoff | Resultado |
|---|---|---|
| UX-1 — Dashboard de caixa | a90547f → b617393 → a475634 | **FAIL**, achado P2 abaixo |
| Dia de vencimento em parceladas Dinheiro/PIX | a475634 → d049a23 → 87f068e | **PASS técnico do delta**, integração bloqueada pelo FAIL do UX-1 |

Checkout auditado: `fix/parcelada-dia-vencimento`, HEAD `87f068e`.
Na entrada havia somente dois relatórios antigos não rastreados
(`PERSONAL-CASH-PROJECTION-SCENARIOS-REAUDIT-2026-09-23.md` e
`PERSONAL-CASH-PROJECTION-SCENARIOS-REAUDIT-2-2026-09-23.md`); preservados.
Leitura de AGENTS.md, WORKFLOW.md, PROGRESS.md, especificações e handoffs das
duas entregas. Revisão do diff e dos consumidores relacionados: projeção,
renderização de Dashboard/Análise, preferências, ações de pagamento e
formulários de criação/edição.

## P2 — soma da lista diverge do card A pagar

Introduzido em `b617393`; continua presente em `d049a23`.
Local no HEAD: `index.html:7729` (`getCashObligationItems`), com soma em
`index.html:7762` e card em `index.html:4722`.

O card arredonda a obrigação agregada do motor, enquanto cada linha da lista
é arredondada separadamente antes da soma. Não são operações equivalentes
quando as parcelas possuem frações de centavo. O item 4 das regras do UX-1
exige conciliação centavo a centavo; a ressalva do handoff não satisfaz esse
critério.

Reprodução independente, com dados sintéticos:

1. Hoje fixado em 03/10/2026; Planejar até 31/10/2026; sem receitas nem contribuição.
2. Duas compras de R$ 100 em três parcelas, iniciadas em setembro/2026,
   uma em cada cartão, usando competência legada (sem dataCompra).
3. Em outubro, cada fatura tem valor bruto de 100/3.
4. Dashboard mostra duas linhas de **R$ 33,33**, total da lista **R$ 66,66**,
   mas card A pagar **R$ 66,67**.

Comandos executados da raiz, ambos terminam com código 1 e o achado acima:

```powershell
node docs/audits/repro-ux1-rounding-2026-10-03.mjs b617393
node docs/audits/repro-ux1-rounding-2026-10-03.mjs d049a23
```

O script carrega o HTML de cada commit diretamente do Git, sem checkout,
altera somente o estado sintético do navegador e fecha o harness ao terminar.
O defeito é de conciliação da apresentação; esta auditoria não encontrou
alteração nova dos totais do motor nessas entregas.

### Devolução para Claude

Corrigir a reconciliação da apresentação sem mudar silenciosamente o motor,
os valores persistidos ou as regras de pagamento. Tornar explícito qualquer
ajuste de arredondamento necessário para reconciliar linhas, total e card.
Cobrir múltiplas faturas fracionárias, mistura com despesas/contribuição e
conciliação após pagamento, mantendo a comparação do motor com a base.
Não basta substituir o total da lista pelo card e deixar as linhas divergentes.
Entregar novo commit, diff, suíte e limitações para reauditoria Codex.
Nenhuma correção de produto foi executada ou delegada nesta rodada de auditoria.

## Patch de vencimento — análise do delta

Não encontrei defeito novo no delta `a475634..d049a23`. A regra central permite
dia para Dinheiro/PIX fixa ou parcelada (2+), e é reutilizada nos formulários
e na gravação. O débito automático permanece restrito à fixa. O rótulo de
parcela reutiliza `_parcel/_total` do helper existente. O diff não altera as
fórmulas do motor.

Os 13 casos próprios passaram, incluindo criar/editar, preservar dia ao salvar,
limpar dia ao trocar para à vista/cartão, parcelas pagas, ignorarAntes,
vencidas, encerramento e equivalência com a base em sete fixtures.

Resolução técnica dos pontos EXTERNAL_REVIEW_REQUIRED do handoff:

- Parcelada sem dia permanece na lista como sem data, conforme a regra 4 do
  UX-1; removê-la quebraria a composição do total. É comportamento herdado,
  não regressão introduzida pelo patch. A frase do pedido anterior reproduzida
  no handoff (ficar fora do card) não foi implementada; este PASS técnico se
  refere à especificação versionada e não declara aceite dessa divergência
  de produto pelo usuário.
- Parcela após o fim do ciclo fica fora deste Dashboard, conforme o horizonte
  do UX-1; o motor a inclui quando o horizonte é ampliado. Sem defeito novo.

O PASS do delta não autoriza integração da pilha: o UX-1 continua reprovado.

## Verificações executadas

- `node tests/financial-engine/run-all.mjs`: **TOTAL_PASS=746 TOTAL_FAIL=0**,
  processo encerrado com código 0. Inclui UX-1 17/17 e parceladas 13/13.
- Comparações do motor com `a90547f` e do patch com `a475634`, executadas pelos
  testes existentes: passaram. A única mudança do motor no UX-1 é o metadado
  `amount` em issues de receita sem conta pessoal.
- Testes existentes de navegação, preferências, ações de pagamento,
  imutabilidade de state e largura 390 px: passaram.
- `git diff --check a90547f..HEAD`: sem erros.
- Investigação adicional de conciliação: **FAIL reproduzido nos dois commits**.

Limitações: somente dados sintéticos; sem nova validação de backup real,
OAuth/Drive autenticado ou inspeção visual manual. Testes automatizados de
interface usam o harness e seus stubs existentes. Os 746 testes verdes não
cobriam a conciliação de múltiplas faturas com frações de centavo.

Sem commit, push, merge, novo gate ou alteração do produto. Foram criados
somente este relatório e o script de investigação ao lado dele.
