# Handoff — Prefeitura (22/09/2026)

Branch de continuidade: `gate/5-account-identification`.

Não usar `main` e não fazer merge antes de nova aprovação Codex. Os arquivos locais `tests/financial-engine/baseline-home.log` e `tests/financial-engine/debug1.mjs` não pertencem ao Git.

## Estado aprovado anterior

- Corte do histórico por perfil, retirada do importador PDF da interface, fatura em ordem decrescente e descoberta visual do parcelamento do escritório: PASS em `3f3f722`.
- Suíte naquele ponto: 479 PASS / 0 FAIL.

## Entrega atual

- Especificação: `61dd401`.
- Implementação Claude Code: `5785a05`.
- Auditoria Codex: `e381433`, resultado **FAIL corretivo** por um único achado de apresentação.
- Suíte executada pelo Codex: **491 PASS / 0 FAIL**.

Agência/conta, cadastro pessoal/empresarial, backup, consulta “Todas as contas”, totais separados e isolamento patrimonial foram aprovados. A correção pendente é restrita ao modal e ao histórico de transferências pessoais.

## Prompt para Claude Code

Abra o repositório FinFlow na branch `gate/5-account-identification` e confirme que o HEAD remoto contém `docs/audits/ACCOUNT-IDENTIFICATION-REVIEW.md`. Leia `AGENTS.md`, `CLAUDE.md`, `docs/architecture/WORKFLOW.md`, `docs/gates/GATE-5-ACCOUNT-IDENTIFICATION-UNIFIED-DIRECTORY.md` e o relatório de auditoria.

Corrija somente o achado [P2]:

1. Em `openTransferenciaModal()`, usar `contaLabelHTML(x)` nas opções de origem e destino, preservando o saldo exibido.
2. Em `renderTransferencias()`, usar `contaLabelHTML` para origem e destino.
3. Adicionar teste permanente com duas contas pessoais chamadas `Sicoob`, mas com agências e números diferentes, comprovando que os dois seletores e o histórico ficam distinguíveis.
4. Confirmar que nenhum ID, movimento, valor, saldo ou regra financeira muda.
5. Preservar os 491 testes e executar a suíte completa.

Faça um novo commit e entregue base/final, arquivos, reprodução anterior, resultado da suíte e limitações. Não faça push, merge, alteração em `main` ou trabalho fora desse achado. Pare para auditoria Codex.

## Depois da correção

Codex deve revisar o diff, reproduzir o cenário das duas contas homônimas, executar a suíte e registrar PASS/FAIL. Somente após PASS decidir integração/publicação. Nenhum dado financeiro real, agência real, número real, token ou credencial foi versionado.
