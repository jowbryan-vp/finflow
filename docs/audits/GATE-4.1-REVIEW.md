# Gate 4.1 — revisão sequencial

Base: 764636a. Implementação e autorrevisão pelo Codex, em etapas separadas. Não constitui revisão por segundo agente.

Motor de leitura derivado implementado conforme docs/gates/GATE-4.1.md. Verificados: separação real/comprometido/projetado/potencial; nenhuma mutação; faturas sem duplicação; realizado excluído; principal selecionado; dívidas atrasadas; dados sem data; proteção de horizonte; PJ/reservas excluídos.

Durante revisão, a pesquisa de atrasados foi ampliada para considerar dataPrevista de eventos únicos sem mes/ano legados. Adicionados avisos para cartão inexistente e recebimentos marcados como realizados com data inválida. Não inventar posição cronológica para esses casos.

12 testes específicos PASS; suíte completa **279/279 PASS**. Diff sem erros de whitespace. Nenhuma alteração de regras do escritório ou competência de cartão. UI e persistência da escolha de principal seguem no Gate 4.3; o motor já respeita a preferência por perfil.

Resultado: PASS no contrato do motor. Limites explícitos: disponível é o saldo registrado atual, não reconstrução diária; obrigações sem dia afetam saldo final, mas não a data de insuficiência; a contribuição mantém a política existente e aparece sem vencimento; ordem intradiária desconhecida. Um resultado incompleto não deve ser apresentado como garantia de suficiência de caixa.
