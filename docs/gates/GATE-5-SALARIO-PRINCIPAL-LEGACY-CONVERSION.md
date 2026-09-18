# Gate 5 — Conversão de salário legado para salário principal do ciclo

## Causa
`saveEditReceita` (editor legado) alterava só `r.recorrente`. O seletor "Salário principal do ciclo" e `getCurrentFinancialCycle` exigem `tipo==='salario'`, `certeza!==undefined` e `recorrencia`. Um salário antigo marcado como recorrente continuava inelegível, e o Dashboard seguia dizendo "Nenhum salário recorrente cadastrado".

## Comportamento anterior
A UI mostrava "Receita atualizada!", mas o registro permanecia no modelo legado e fora do seletor.

## Estratégia de conversão
Em `saveEditReceita` ([index.html](../../index.html)), se o registro é legado (`certeza===undefined`), tinha `tipo:'salario'`, continua `salario` e "Recorrente (mensal)" está marcado, o **mesmo objeto** recebe:
`certeza:'recorrente'`, `recorrencia:{type:'last_weekday_of_month',weekday:5}` (a regra salarial já existente), `recebidoPorMes`, `competenciaMes/Ano` (= mes/ano do registro). Nome, valor, conta, `id`, `createdAt` e `recebidaMeses` (auditoria/compatibilidade) são preservados. Depois renderiza Receitas e Dashboard. O modal exibe: "Este salário será atualizado para o modelo recorrente atual no mesmo lançamento, sem criar uma receita duplicada."

Com um único salário elegível o comportamento automático existente o trata como principal; com mais de um, a seleção explícita continua exigida. `setFinancialPreference` já rejeitava IDs inexistentes/inelegíveis (testado).

## Garantias contra duplicidade
Nenhum `push` em `state.receitas`; o `id` é mantido. Após a conversão, edições passam pelo editor do modelo novo (`saveEditReceitaNovoModelo`), que não recria campos. Outros tipos, e salários não editados, não são tocados.

## Datas reais
Nada é inventado: sem hoje, fim de mês, última sexta ou competência como data. Sem competência recebida, `recebidoPorMes` fica vazio, nenhum caixa é gerado e o ciclo segue indisponível até o usuário confirmar o recebimento pelo fluxo existente (modal "Data real de recebimento", validado por `isValidISODateString`).

Caso especial: o modelo antigo pode ter competências em `recebidaMeses` (`true`) sem data. No modelo novo caixa só existe com data real; converter sem data reduziria o saldo silenciosamente. Por isso o modal pede a data real de **cada** competência já recebida, e o salvamento é bloqueado (zero mutação) se faltar ou for inválida. Com as datas, o valor entra exatamente uma vez (o ramo do modelo novo ignora `recebidaMeses`) e o saldo não muda.

Toda validação (valor > 0, competência, datas) ocorre antes de qualquer mutação.

## Testes
[gate5-salario-legacy-conversion.test.mjs](../../tests/financial-engine/gate5-salario-legacy-conversion.test.mjs), registrado em `run-all.mjs`: 10 checks (cobrindo os 15 cenários exigidos), usando os handlers reais (`openEditReceita`, `saveEditReceita`, `toggleReceitaRecebida`, `confirmarReceitaRecebidaComData`, `setFinancialPreference`, `renderDashboard`). Suíte total: 364 → 374 PASS, 0 FAIL.

## Limitações
- O modelo legado tratava salários `recorrente:true` de meses passados como recebidos implicitamente na exibição (`receitaRecebida`), sem entrar no caixa. Após a conversão, esses meses aparecem como previstos até o usuário confirmar com data real (não é inventado histórico).
- A conversão é apenas via edição do próprio lançamento; não há conversão em lote.
- `delivery/index.html` (cópia de entrega) não foi alterado.
- Sem verificação manual no navegador real além dos testes Playwright.
