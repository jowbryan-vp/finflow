# Auditoria intermediária — Drive grande

Resultado: FAIL em 1f48b19. Codex executou reproduções sintéticas via harness em 18/09/2026.

1. Payload >64 KiB: scheduleSave, visibilitychange hidden, visibilitychange visible e pageshow; esperar 3 segundos. Resultado: zero fetch, finflow_unsynced=1, saveTimer=null. A versão fica pendente indefinidamente ao voltar à mesma aba, até nova edição/clique/reload. Necessário retry controlado em visible/pageshow, sem download remoto e sem concorrência. Testar eventos reais, não chamar helper diretamente como D27.
2. Remover cache e marcador, alterar estado em memória, fazer forceSave com fetch rejeitando. Resultado: cache ausente, marcador ausente. Salvamento manual não preserva local antes de rede. Necessário persistir snapshot e pendência antes do envio manual/automático, mantendo geração e cache novos em caso de edição durante envio. Adaptar D02_D03 somente para exigir snapshot atual preservado, em vez de marcador artificial obsoleto; não enfraquecer garantia.

Outros critérios para fechar: medir/limitar keepalive no ponto de envio, inclusive chamada direta saveToDrive(true) grande; não apenas no flush. Verificar teste de criação concorrente de verdade (D26 atual usa ID existente, então não demonstra criação). Não rotular ausência de rede como offline quando apenas o tamanho impediu envio. Rodar suíte completa e entregar novo commit e relatório honesto.

## Segunda revisão — db261ae

FAIL: pageshow/visibilitychange visible disparam retryPendingSaveOnResume antes do login e antes de hidratar cache. Reprodução Codex: accessToken=null, cache com marcador synthetic pending-user-data, unsynced=1, disparar pageshow com fetch rejeitado. Observado calls=1, cachePreserved=false, pending=1. O helper chama saveToDrive, que regrava o cache usando estado inicial. Bloqueante por risco de perda de dados locais.

Correção requerida: impedir retomada automática sem token e sem estado local devidamente hidratado. Guardar prontidão explícita na inicialização; não confiar apenas no token (callback pode definir token antes de initApp terminar). pageshow inicial deve deixar recuperação para initApp; visibilidade/bfcache só após hidratação segura. Testar cache real sintético preservado antes da autenticação e antes da hidratação mesmo com token; depois testar recuperação com estado pronto. Não criar bypass de proteção apenas para testes. Executar uma vez suíte completa após alteração final; não é necessário repetir sem mudança.
