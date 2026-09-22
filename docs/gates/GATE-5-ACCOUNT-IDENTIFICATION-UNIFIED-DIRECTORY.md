# Gate 5 — identificação bancária e consulta unificada de contas

Origem: validação do usuário após a aprovação de `bba11f8`/`3f3f722`. O usuário possui mais de uma conta na mesma instituição, inclusive uma conta Sicoob destinada exclusivamente ao escritório, e precisa distingui-las por agência e número sem perder a separação patrimonial.

Fluxo: Codex especifica e audita; Claude Code implementa, testa e entrega commit. Base desta branch: `3f3f722`.

## Objetivo

Acrescentar identificação opcional de agência e número da conta aos cadastros pessoal e empresarial e oferecer uma consulta conjunta, sem unificar os modelos financeiros nem somar o Caixa do Escritório ao caixa pessoal.

## 1. Modelo compatível

- Acrescentar a cada item de `state.contas` e `state.office.contas` os campos opcionais `agencia` e `numeroConta`.
- Ambos são textos, nunca números: preservar zeros à esquerda, hífen, dígito verificador, letras e demais caracteres digitados. Aplicar apenas `trim` nas extremidades.
- O campo `name` existente continua sendo o nome/apelido da conta e não muda de significado. A interface pode rotulá-lo como “Nome / banco” para facilitar o uso (`Sicoob pessoal`, `Sicoob escritório`, por exemplo).
- Agência e conta não formam chave, não substituem `id`, não precisam ser únicas e nunca são usadas em cálculo, vínculo ou exclusão.
- Backup antigo sem os campos continua funcionando sem inventar valores. Backup novo preserva os textos em round-trip e mantém o isolamento por perfil.

## 2. Cadastro e edição

- Adicionar “Agência” e “Conta” ao formulário e ao modal de edição das contas pessoais.
- Adicionar os mesmos campos ao formulário e ao modal de edição das contas empresariais.
- Os campos são opcionais. Nome continua obrigatório; saldo inicial e cor seguem as regras existentes.
- Exibir agência e conta nas listas e nos seletores em que o usuário escolhe uma conta, para distinguir homônimas. Montar o texto por helper único e escapar todo conteúdo ao inseri-lo no HTML.
- Quando ambos estiverem vazios, preservar a apresentação compacta anterior, sem separadores soltos.
- Editar somente agência/conta não altera `id`, saldo, lançamentos, referências, movimentos, recebíveis, pagamentos, regras de exclusão ou `saveGeneration` além do único salvamento esperado.

## 3. Consulta conjunta

- Na página pessoal **Contas**, adicionar um card de consulta “Todas as contas”.
- Listar contas pessoais e empresariais na mesma consulta, cada linha com nome, agência/conta quando informadas, contexto visível (`Pessoal` ou `Escritório`) e seu saldo efetivo calculado pelo motor correspondente.
- Mostrar **Total pessoal** e **Total do escritório** separadamente. Não apresentar total geral somando os dois patrimônios.
- A consulta conjunta é derivada e não duplica, move ou copia contas entre `state.contas` e `state.office.contas`.
- Contas pessoais continuam administradas na página Contas; contas empresariais continuam administradas em Caixa do Escritório → Contas & Regras. A consulta conjunta pode oferecer navegação para o local correto, mas não cria um terceiro cadastro.
- Uma conta empresarial não pode aparecer nos seletores de pagamento pessoal ou transferência entre contas pessoais. Uma conta pessoal não pode aparecer como origem/destino empresarial fora dos fluxos explícitos de repasse e retirada já existentes.

## 4. Invariantes financeiras

- Não alterar `calcSaldoConta`, `calcSaldoContaAte`, `calcSaldoOfficeConta`, `calcSaldoOfficeContaAte`, totais, projeções, competência, transferências, recebíveis, reservas, repasses ou regras de distribuição.
- Alterar agência/conta não agenda movimentação financeira e não muda nenhum saldo.
- A conta Sicoob destinada ao escritório deve ser cadastrada uma única vez em `state.office.contas`; a consulta conjunta a mostra ao lado das pessoais sem duplicá-la no patrimônio pessoal.
- Preservar todas as proteções de exclusão por histórico e saldo existentes.

## Testes obrigatórios

Adicionar testes permanentes e registrá-los em `tests/financial-engine/run-all.mjs`:

1. Criar conta pessoal com agência `0001` e conta `001234-5`; textos e zeros são preservados.
2. Criar conta empresarial com identificação e comprovar que ela não aparece em `state.contas` nem altera o saldo pessoal.
3. Editar identificação pessoal e empresarial sem mudar IDs, saldos ou vínculos.
4. Campos vazios preservam o comportamento e a apresentação legados.
5. Backup/importação preserva os campos e perfis independentes; backup antigo permanece compatível sem valores inventados.
6. Duas contas com o mesmo nome de banco ficam distinguíveis nas listas e seletores pelos metadados.
7. “Todas as contas” contém pessoal e escritório com badges corretos e saldos dos respectivos motores.
8. Totais pessoal e empresarial aparecem separados e não existe total consolidado misturando os patrimônios.
9. Conta empresarial permanece ausente dos seletores pessoais; conta pessoal permanece ausente dos seletores exclusivamente empresariais.
10. Alterar identificação não modifica saldos antes/depois e não cria movimentação.
11. Strings são escapadas na exibição; usar apenas fixtures sintéticas, nunca agência ou conta reais.
12. Suíte completa permanece aprovada.

## Fora do escopo

- Mover ou converter uma conta pessoal em empresarial, ou o inverso.
- Detectar automaticamente que dois cadastros representam a mesma conta física.
- Open Finance, consulta bancária, PIX, credenciais, senhas ou integração com banco.
- Somar patrimônio pessoal e empresarial.
- Alterar cartão, fatura, histórico, sincronização ou `delivery/index.html`.
