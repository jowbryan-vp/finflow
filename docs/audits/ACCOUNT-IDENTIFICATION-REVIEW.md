# Auditoria Codex — identificação bancária e consulta unificada

Branch `gate/5-account-identification`, base `61dd401`, implementação Claude Code `5785a05`.

Resultado: **FAIL corretivo**. O modelo, cadastro, edição, backup, consulta conjunta e separação patrimonial estão corretos, mas duas áreas pessoais ainda não usam a identificação criada justamente para distinguir contas homônimas.

## Evidências aprovadas

- `5785a05` é filho direto de `61dd401`.
- `git diff --check 61dd401..5785a05`: sem erros.
- Agência e número são textos opcionais, preservam zeros/hífens e permanecem fora de IDs e cálculos.
- Cadastro e edição pessoal/empresarial preservam vínculos, saldos e isolamento patrimonial.
- Backup novo preserva os campos por perfil; backup antigo não recebe valores inventados.
- “Todas as contas” é leitura derivada, mostra badges e saldos dos motores corretos e mantém os totais pessoal e empresarial separados.
- O Codex executou a suíte completa: **491 PASS / 0 FAIL**, exit code 0.

## Achado

### [P2] Transferências ainda não distinguem contas homônimas

`openTransferenciaModal()` continua montando origem e destino com `esc(x.name)` em vez de `contaLabelHTML(x)`. `renderTransferencias()` também exibe somente `esc(origem.name)` e `esc(destino.name)`.

Reprodução independente com duas contas pessoais chamadas `Sicoob`:

```json
{
  "origem": ["Sicoob (R$ 50,00)", "Sicoob (R$ 250,00)"],
  "historico": "Sicoob → Sicoob"
}
```

Mesmo com agências `0001` e `0007` e contas distintas, o usuário não consegue identificar com segurança a origem/destino no fluxo de transferência nem consultar depois qual conta participou. Isso contraria a seção 2 da especificação, que exige a identificação nas listas e seletores em que uma conta é escolhida.

## Correção esperada

- Usar `contaLabelHTML` nas duas opções do modal de transferência, preservando a exibição do saldo.
- Usar `contaLabelHTML` para origem e destino no histórico de transferências.
- Adicionar teste permanente com duas contas `Sicoob` de agências/números diferentes cobrindo ambos os seletores e o histórico.
- Confirmar que a correção é somente de apresentação: nenhum ID, movimento, valor ou saldo muda.
- Manter os 491 testes existentes e executar a suíte completa.

Sem push/merge pelo implementador. `baseline-home.log` e `debug1.mjs` permanecem fora do versionamento.
