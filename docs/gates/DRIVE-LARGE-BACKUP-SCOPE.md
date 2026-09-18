# Correção prioritária — Drive e payload maior que 64 KiB

Autorização: retomada do handoff da Prefeitura em 18/09/2026. Base remota/local 0395d0a, branch gate/5-uat-corrections. Baseline verificado pelo Codex: 374 PASS / 0 FAIL em npm test, após npm ci --ignore-scripts e instalação/verificação do Chromium.

Claude implementa; Codex audita após handoff. Escopo exclusivo: persistência e envio do backup ao ocultar/fechar/retomar a página. Não alterar regras financeiras, Guardar em caixa ou abas de cartões. Sem push/merge.

Critérios:
- Persistir snapshot local e pendência antes de tentar rede, inclusive envio manual.
- Medir bytes UTF-8 do corpo efetivamente enviado, incluindo envelope multipart na criação. Nunca usar keepalive para corpo que excede margem segura abaixo de 64 KiB. Payload grande fica pendente localmente se a página encerrar; envio normal pode ocorrer enquanto viva.
- Não limpar pendência nem regravar snapshot antigo se nova edição ocorrer durante envio. Evitar envios concorrentes conflitantes e duplicação de criação.
- Ocultar/fechar repetidamente não duplica requisições. Retomar página tenta recuperar pendências sem baixar versão remota por cima delas; manter recuperação já existente no initApp.
- Sucesso visual somente após confirmação correspondente; erro mantém cache e pendência. Ausência de token não perde dados.
- Testes permanentes sintéticos para pequeno/grande/Unicode, criação e atualização, falha de rede, eventos de ciclo de vida, edição durante envio e recuperação posterior. Demonstrar falha antes da correção quando possível e rodar suíte completa.

Entregar commits explícitos, relatório docs/gates/DRIVE-LARGE-BACKUP-IMPLEMENTATION.md com testes, limitações e hashes. Não usar dados reais ou credenciais. Parar após entrega para auditoria.
