# Gate 5 — corte do histórico, importador de PDF e ordem da fatura

Origem: validação do usuário em 21/09/2026, após a integração auditada em `main` (`e25646a`).

Fluxo obrigatório: Codex especifica e audita; Claude Code implementa, testa e entrega commit. Nenhuma mudança de regra financeira fora deste documento.

## 1. Importação de fatura em PDF

### Problema confirmado

O bloco visível "Importar Fatura em PDF" não representa uma funcionalidade nova ou corrigida. O parser existente é legado e reconhece apenas linhas de texto no formato rígido `dd/mm descrição 1.234,56`. PDFs escaneados, protegidos ou com outro layout não são suportados. A reorganização de Cartões/Faturas apenas manteve o bloco antigo visível; não houve melhoria material do reconhecimento.

### Correção

- Remover o bloco de importação da interface normal de Cartões/Faturas, inclusive botão, seletor e promessa de extração automática.
- Preservar o código legado e o formato de dados para uma futura especificação própria; não apagar histórico nem realizar migração.
- Não criar OCR, integração externa, parser específico do Nubank ou nova biblioteca neste patch.
- Nenhum caminho normal da interface deve apresentar o importador como recurso funcional.

## 2. Início confiável do histórico por perfil

### Regra de produto

Adicionar às preferências financeiras de cada perfil o campo opcional `historyStartMonth`, no formato `AAAA-MM`, com rótulo claro como "Considerar histórico a partir de". O usuário poderá escolher `2026-07` para indicar que os dados anteriores a julho de 2026 não representam seu histórico no FinFlow.

Valor ausente mantém o comportamento atual para instalações existentes. Valor inválido é rejeitado sem mutação e sem salvamento. A preferência deve persistir no backup e permanecer isolada por perfil pelo mecanismo existente.

### Efeito permitido

- A projeção cronológica não procura nem exibe despesa, fatura ou receita vencida em competências anteriores ao corte.
- Itens recorrentes iniciados antes do corte continuam sendo considerados nas competências a partir do corte; o cadastro não é alterado.
- Itens únicos cuja competência conhecida seja anterior ao corte não participam da projeção nem de seus avisos de pendência.
- Registros sem data continuam visíveis quando não for possível demonstrar que pertencem a uma competência anterior ao corte. O sistema não inventa datas para ocultá-los.
- A estimativa moderna de gastos variáveis e a previsão histórica legada nunca usam mês anterior ao corte. Se os três meses completos necessários não existirem depois do corte, o resultado deve ser "histórico insuficiente", sem preencher meses ausentes com zero.
- O corte é uma regra de leitura para planejamento e histórico estatístico. Não apaga, migra ou reescreve despesas, receitas, faturas, contas, transferências, cofrinhos, escritório ou backups.
- O corte não muda `calcSaldoConta`, `calcSaldoContaAte`, saldos iniciais, pagamentos já realizados ou o saldo real atual. O disponível continua vindo das contas registradas.
- O limite técnico de 240 meses permanece como proteção quando não houver corte explícito. Um corte intencional não deve gerar o aviso "Histórico de atrasos limitado a 240 meses".

### Interface

- Colocar a preferência junto das demais configurações do planejamento financeiro.
- Explicar em texto curto que ela ignora competências anteriores apenas nas projeções e médias, sem excluir lançamentos.
- Permitir limpar o campo para restaurar o comportamento compatível anterior.
- Ao alterar o valor, atualizar todas as áreas derivadas afetadas, não apenas um fragmento do Dashboard.

## 3. Ordem das compras na fatura

- Em Cartões/Faturas, ordenar `Compras e parcelas desta fatura` da mais recente para a mais antiga.
- Chave principal: `dataCompra` ISO válida, em ordem decrescente.
- Fallback para registro legado sem data válida: `createdAt` decrescente; manter ordenação determinística em empates, sem gravar data inventada.
- A ordenação é apenas de apresentação. Não mudar cálculo, competência, parcela, total, pagamento ou posição no estado.
- Preservar a linha do tempo da projeção em ordem crescente por data, pois ela calcula o saldo progressivamente.
- Históricos de transferências e cofrinho já são apresentados do mais recente para o mais antigo e não devem regredir.

## Testes obrigatórios

Adicionar testes permanentes e registrá-los em `tests/financial-engine/run-all.mjs`:

1. O importador de PDF não aparece nem pode ser acionado pelo fluxo normal de Cartões/Faturas; as funções legadas e dados existentes não são apagados.
2. Preferência vazia preserva o comportamento anterior.
3. `2026-07` elimina da projeção atrasados de maio/junho, mas mantém ocorrências recorrentes de julho em diante.
4. Saldo real atual e dados armazenados são idênticos antes/depois de configurar ou limpar o corte.
5. Troca de perfil mantém cortes independentes; backup/importação preserva a preferência.
6. Valor inválido é rejeitado sem mutação nem `saveGeneration`.
7. Meses anteriores ao corte não entram nas duas médias históricas; falta de três meses completos retorna histórico insuficiente.
8. Pendência sem data e sem competência comprovadamente anterior não é ocultada.
9. Compras com datas diferentes aparecem em ordem decrescente; registros legados usam fallback estável; o total e `state.despesas` não mudam.
10. A linha do tempo da projeção continua em ordem crescente e os históricos de transferências/cofrinho continuam decrescentes.

Executar primeiro um teste que reproduza os comportamentos atuais, depois a suíte completa. Entregar base/final, arquivos alterados, resultado, limitações e commit. Parar para auditoria Codex; sem push, merge ou novo gate.

## Fora do escopo

- OCR ou suporte a layouts de bancos específicos.
- Exclusão ou correção retroativa dos dados do usuário.
- Mudança em competência, fechamento/vencimento, parcelamento, pagamento, saldos ou Caixa do Escritório.
- Atualização de `delivery/index.html`, que permanece snapshot histórico.
