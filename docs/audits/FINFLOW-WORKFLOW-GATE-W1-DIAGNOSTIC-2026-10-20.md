# FINFLOW — Gate W1: diagnóstico do fluxo de trabalho

**Comandos usados (todos só de leitura):** `git --no-optional-locks` (status, log, branch, config, rev-list, merge-base, cat-file, show, reflog), `git ls-remote origin`, `ls`, `cat`, `grep`.

- O `ls-remote` consultou o GitHub sem alterar nenhuma referência local.
- Não rodei testes nem fiz fetch, pull ou push. Não li credenciais.
- O `.claude/settings.local.json` foi aberto só para ver as chaves de primeiro nível.

## A. Inventário do ambiente

| Item                       | Valor                                                                                                                                              |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Computador                 | **Prefeitura**: usuário `<PREFEITURA_USER>`, host `<PREFEITURA_HOST>`. O de casa é `<HOME_USER_HOME>`, com checkout em `<HOME_CHECKOUT>`, conforme citado nos docs. |
| Checkout                   | `<PREFEITURA_CHECKOUT>` (há também um `finflowV2` ao lado, que é outro projeto)                                            |
| Remote                     | `origin` → `https://github.com/jowbryan-vp/finflow.git`                                                                                            |
| Branch / HEAD              | `main` @ `2f63632`                                                                                                                                 |
| GitHub agora (`ls-remote`) | `main` = `2f63632`, idêntico. Último fast-forward feito hoje, 20/10, às 11:00.                                                                     |
| Working tree               | Limpo. Sem stash e sem worktrees extras.                                                                                                           |
| Ignorados presentes        | `.claude/` e `tests/financial-engine/node_modules/`                                                                                                |
| `remote.origin.fetch`      | **Restrito a 3 branches:** `main`, `release/uat-2026-09-18` e `fix/personal-cash-projection-scenarios`                                             |
| Pull/merge                 | `pull.rebase=false` e `core.autocrlf=true`, ambos de sistema. Não existe `.gitattributes`.                                                         |
| Workspace                  | FinFlow\.code-workspace com `git.autofetch: false`. Não existe pasta `.vscode/`.                                                                   |

**Branches locais em relação ao GitHub:**

| Branch                                   | Situação                                                                                                                                                                             |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `main`                                   | Sincronizada                                                                                                                                                                         |
| `fix/personal-cash-projection-scenarios` | 1 commit à frente do remoto (`f468295`), mas já incluído na `main`. Sem perda.                                                                                                       |
| `gate/5-account-identification`          | 2 à frente do remoto, já na `main`                                                                                                                                                   |
| `gate/5-uat-corrections`                 | 23 atrás do remoto. Só ficou desatualizada.                                                                                                                                          |
| `fix/invoice-due-date-next-month`        | **Só existe neste PC e não está na `main`:** `30e02e1` (código + teste) e `e598345` (auditoria). Parece substituída por `fix/card-due-date-next-month`, mas isso precisa de decisão. |
| Branches só no GitHub                    | `archive/claude-export`, `fix/card-due-date-next-month` (já na `main`)                                                                                                               |

**Conclusão:** este PC pode retomar com segurança a partir da `main` `2f63632` quanto ao código. Não dá para garantir o mesmo quanto à documentação, porque parte dela está só em casa (risco R1).

## B. Mapa documental

| Arquivo                        | Função real                         | Situação                                                                                                                                                  |
| ------------------------------ | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| docs/PROGRESS.md               | Estado oficial, na prática          | É um log que só cresce. Não tem bloco de "estado atual" nem de "próximo trabalho autorizado", e o título ainda diz "Execução autônoma — etapa concluída". |
| AGENTS.md                      | Papéis e limites (Codex e geral)    | Correto nos papéis. Desatualizado em "Baseline remota 33af86b" e "Gate 5 precisa de novo escopo".                                                         |
| CLAUDE.md                      | Papel do Claude                     | Correto nos papéis. "Não iniciar Gate 5" está desatualizado: Gates 5, 6 e UX-1 já foram feitos.                                                           |
| docs/architecture/WORKFLOW\.md | Fluxo                               | **Contradiz a realidade:** workspace `<HOME_CHECKOUT>`, base `gate/4.3`, "não usar main". Hoje a `main` é a linha integrada.                               |
| docs/architecture/README.md    | Arquitetura                         | Ainda válido em essência (`index.html` único, suíte Playwright).                                                                                          |
| docs/RETOMADA-2026-09-18.md    | Guia de retomada                    | Desatualizado: manda usar `release/uat-2026-09-18` e não usar a `main`.                                                                                   |
| docs/gates/README.md           | Índice de gates                     | Desatualizado: diz "Gate 4 não iniciado".                                                                                                                 |
| `docs/gates/*`                 | Especificações                      | Coerentes, padrão por gate                                                                                                                                |
| `docs/audits/*`                | Resultados PASS/FAIL do Codex       | Coerentes. Os FAILs são mantidos como histórico (bom).                                                                                                    |
| `docs/handoffs/*`              | Handoffs do Claude                  | Bom padrão: base, hash, arquivos, testes e limitações                                                                                                     |
| `FINFLOW_*_REPORT.md` (raiz)   | Relatórios históricos dos Gates 1–3 | Preservados de propósito                                                                                                                                  |
| `README.md` na raiz            | —                                   | **Não existe.** Também não há índice documental.                                                                                                          |

Respostas às perguntas da seção 4:

1. **Estado oficial:** é o `PROGRESS.md`, por uso, mas não diz isso explicitamente.
2. **Decisões de produto:** espalhadas pelo `PROGRESS.md` e pelas especificações dos gates. Não há registro dedicado.
3. **Instruções para os agentes:** `AGENTS.md`, `CLAUDE.md` e `WORKFLOW.md`.
4. **Resultados dos gates:** `docs/audits/` mais uma seção no `PROGRESS.md`.
5. **Handoffs:** o Claude grava em `docs/handoffs/` e o Codex consome pelo hash. Funciona.
6. **Contradições:** a regra "não usar main" (`WORKFLOW` e `RETOMADA`) choca com a `main` integrada e publicada. "Gate 4 não iniciado" e "não iniciar Gate 5" chocam com o histórico.
7. **Obsoletos, comparando com o código e o Git:** `RETOMADA-2026-09-18.md`, as seções "Histórico preservado" e "Trabalho sequencial" do `WORKFLOW.md`, e o `gates/README.md`.
8. **Informação que existe só fora do repositório:**
   - Gates 0, 0A, C1 e S1 e as 10 decisões: zero ocorrências no repositório.
   - A documentação de 03–04/10 que ficou em `<HOME_CHECKOUT>` (R1).
   - Logs e scripts de auditoria do Codex em `<HOME_WORKTREE_ROOT>/...`.
9. **Índice confiável:** não existe.
10. **Próximo trabalho autorizado:** não dá para identificar. O C1 não aparece em lugar nenhum.

## C. Mapa dos agentes

| Pergunta                                                | Claude                                                                  | Codex                                      | Evidência                                                      |
| ------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------- |
| Conhece o papel                                         | Sim                                                                     | Sim                                        | `AGENTS.md` e `CLAUDE.md`                                      |
| Implementação separada da auditoria                     | Sim                                                                     | Sim (pode criar testes só para investigar) | `AGENTS.md`                                                    |
| Sabe identificar o gate autorizado                      | **Não**                                                                 | **Não**                                    | Não há campo "gate autorizado"                                 |
| Limite de escopo                                        | Por instrução                                                           | Por instrução                              | "Adicionar somente caminhos revisados"                         |
| Preservar dados financeiros                             | Parcial                                                                 | Parcial                                    | `.gitignore` cobre backups; os docs proíbem dados reais no Git |
| Evidência de testes obrigatória                         | Sim (handoff)                                                           | Sim (relatório)                            | `CLAUDE.md`                                                    |
| Proibição de reinterpretar histórico financeiro         | **Não existe regra geral**                                              | **Não**                                    | Só aparece caso a caso (ex.: OF26 no Gate 5)                   |
| Encerrar sessão                                         | **Não definido**                                                        | **Não definido**                           | —                                                              |
| Retomar de outro PC                                     | Só pelos handoffs avulsos da Prefeitura                                 | Idem                                       | Não há protocolo                                               |
| Conflito entre instruções do workspace e do repositório | Sim: o `CLAUDE.md` manda seguir o `WORKFLOW.md`, que está desatualizado | Idem                                       | Seção B                                                        |

O que foi relatado só no prompt, sem registro no repositório: o papel "Usuário + ChatGPT = arquitetura" (os docs falam em "coordenador") e os Gates 0, 0A, C1 e S1.

## D. Fluxo atual (como acontece na prática, pelo histórico)

1. O usuário pede, e às vezes há uma especificação em `docs/gates/`.
2. O Claude cria uma branch `fix/*` ou `feat/*`, muitas vezes em worktree `<HOME_WORKTREE_ROOT>/FinFlow-*`, implementa, testa, commita e escreve o handoff.
3. O Codex audita o hash e grava PASS/FAIL em `docs/audits/`. Em caso de FAIL, volta para o Claude.
4. Com o PASS e a autorização do usuário (registrada só como texto no `PROGRESS.md`), alguém faz o merge na `main` e o usuário faz o push.
5. As branches de trabalho muitas vezes **nunca vão para o GitHub**, por exemplo `feat/transaction-date-column` e `release/main-merge-2026-10-06`. Só a `main` resultante é publicada.

## E. Matriz de riscos

| #   | Risco                                                                        | Evidência                                                                                                                                                                                                                        | Sev.        | Consequência                                                                        | Mitigação                                                                                 |
| --- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| R1  | Documentação de auditoria só em casa, sem commit                             | `PROGRESS.md` linhas 106–108: "seguem não commitados no checkout `<HOME_CHECKOUT>`". Os commits `fd309fc` e `68ea5df` publicam na `main` um `index.html` "auditado" (Office-Cash e fronteira de fechamento) sem auditoria no Git. | **Crítica** | Código em produção sem evidência versionada. Perda total se o disco de casa falhar. | Gate W2: inventariar e commitar em casa                                                   |
| R2  | Gate 0, 0A e as 10 decisões fora do repositório                              | `grep` sem nenhuma ocorrência                                                                                                                                                                                                    | **Alta**    | O C1 pode ser implementado com regras perdidas ou reinterpretadas                   | Versionar antes do C1 (W4)                                                                |
| R3  | Suíte "verde com 7 falhas aceitas", sendo 2 delas testes desatualizados      | O código implementa a Decisão 1 ("compra no dia do fechamento vai para a próxima fatura", index.html:6189, `68ea5df`), mas temporal.test.mjs:33 (G1-C02) e G1-C06 ainda esperam a regra antiga                                   | **Alta**    | Uma regressão nova se esconde entre as falhas "conhecidas"                          | Decidir a regra oficialmente e atualizar os testes num gate auditado                      |
| R4  | Instruções contraditórias e desatualizadas                                   | Seção B, item 6                                                                                                                                                                                                                  | **Alta**    | O agente pode recusar a `main`, partir de `gate/4.3` ou bloquear um gate legítimo   | W3                                                                                        |
| R5  | Nenhum campo de "gate autorizado" ou "próximo passo"                         | `PROGRESS.md`                                                                                                                                                                                                                    | Média       | Gate iniciado sem autorização, ou trabalho repetido                                 | Bloco de estado no topo do `PROGRESS.md`                                                  |
| R6  | `fetch` limitado a 3 branches e `git.autofetch=false`                        | `git config` e o arquivo de workspace                                                                                                                                                                                            | Média       | Branches de outro PC ficam invisíveis; o VS Code não avisa que está atrás           | Restaurar o refspec padrão (exige autorização) e rodar fetch no início da sessão          |
| R7  | Branch só neste PC, sem integração                                           | `fix/invoice-due-date-next-month`                                                                                                                                                                                                | Média       | Perda se alguém limpar branches; confusão com `fix/card-due-date-*`                 | Decisão: arquivar no GitHub ou declarar substituída. Nunca apagar sem decisão.            |
| R8  | Branches e worktrees de trabalho não publicados; evidência em `<HOME_WORKTREE_ROOT>/*.log` | Handoffs e auditorias de 06/10 e 19/10                                                                                                                                                                                           | Média       | O outro PC não consegue reproduzir nem retomar; auditoria não verificável           | Política: branch do gate sempre publicada no GitHub; evidência mínima dentro do relatório |
| R9  | Auditar um commit diferente do implementado                                  | O handoff traz o hash, mas o relatório nem sempre registra o hash auditado comparado com `rev-parse`                                                                                                                             | Média       | PASS aplicado ao hash errado                                                        | Campo obrigatório "HEAD auditado" que precisa ser igual ao "hash-final" do handoff        |
| R10 | Autorização de merge/publicação registrada só como prosa                     | `PROGRESS.md` 06/10 e 19/10                                                                                                                                                                                                      | Média       | Não fica claro quem aprovou o quê                                                   | Linha "Autorizado por/data/escopo" no bloco de estado                                     |
| R11 | Edição simultânea pelos dois agentes                                         | "Um agente por vez" depende só de disciplina                                                                                                                                                                                     | Baixa       | Conflito no checkout                                                                | Worktree separado para o auditor (já é praxe)                                             |
| R12 | CRLF sem `.gitattributes`                                                    | `autocrlf=true` vindo do sistema                                                                                                                                                                                                 | Baixa       | Ruído de diff entre PCs se a configuração de casa for diferente                     | Verificar em casa; `.gitattributes` só se houver divergência                              |
| R13 | Arquivos locais soltos entrando no Git                                       | Handoff de 22/09 cita `baseline-home.log` e `debug1.mjs`; o `.gitignore` não cobre `*.log`                                                                                                                                       | Baixa       | Commit acidental                                                                    | Ignorar `*.log` ou revisar o `git status` no fim da sessão                                |
| R14 | Confundir sincronização do código com a dos dados                            | Os docs já separam bem (Drive/OAuth fora do Git)                                                                                                                                                                                 | Baixa       | —                                                                                   | Manter. O S1 trata isso separadamente.                                                    |

## F. Arquitetura mínima recomendada

**Manter:** `AGENTS.md`, `CLAUDE.md`, `docs/gates/`, `docs/audits/`, `docs/handoffs/` e os relatórios da raiz.

**Atualizar (sem criar arquivos novos):**

- `docs/PROGRESS.md`: bloco **"Estado atual"** no topo, sempre sobrescrito. Campos: branch base, HEAD aprovado, gate autorizado (escopo e quem autorizou), gate em andamento (branch e hash), próximo passo, pendências entre PCs, falhas conhecidas da suíte com justificativa. O log continua abaixo.
- `docs/architecture/WORKFLOW.md`:
  - mover "Histórico preservado" para uma seção histórica;
  - incluir a política de branches, o protocolo de sessão (G) e os modelos curtos de handoff e de auditoria, como seções do próprio arquivo, sem arquivos de template.
- `AGENTS.md` e `CLAUDE.md`: trocar as frases fixas de gate ("não iniciar Gate 5") por "só o gate marcado como autorizado no `PROGRESS.md`". Acrescentar a regra: nenhuma mudança em cálculo que altere valores históricos sem decisão registrada.
- `docs/gates/README.md`: virar o índice (lista de gates → especificação, auditoria, handoff, status).
- `docs/RETOMADA-2026-09-18.md`: marcar como substituído por `WORKFLOW.md`.

**Novos, estritamente necessários:**

- `docs/gates/GATE-0A-DECISOES-FINANCEIRAS.md`: as 10 decisões, com data e aprovador. Segue o padrão existente de um documento por gate em `docs/gates/`.
- O relatório do Gate 0 em `docs/audits/`, **se** existir em algum lugar (não encontrei neste PC).
- Opcional: um script de verificação de sessão somente leitura (ex.: `tools/session-check.ps1`), apenas se o protocolo manual se mostrar insuficiente.

## G. Protocolo operacional

**Início da sessão (qualquer PC):**

1. `git status --short --branch`. Se não estiver limpo, **parar**: são alterações de uma sessão anterior.
2. `git fetch origin` (é seguro: só atualiza referências remotas), depois `git status` e `git log --oneline -1 origin/<branch>`.
3. Ler o bloco "Estado atual" do `PROGRESS.md`: branch, hash esperado e gate autorizado.
4. Conferir se o HEAD local é igual ao hash esperado. Se divergir, parar e perguntar.
5. Se for trabalho de gate: estar na branch `gate/<id>` (nunca na `main`).

**Interromper ou encerrar:**

1. Nada fica sem commit. Trabalho incompleto vira commit `wip:` na branch do gate (nunca na `main`).
2. Publicar a branch do gate no GitHub (precisa de autorização permanente para as branches `gate/*`; ver I).
3. Atualizar o "Estado atual" do `PROGRESS.md` (próximo passo e hash).
4. Conferir: `git status` limpo e `git log origin/<branch>..HEAD` vazio.

**Retomar no outro PC:** fazer o "Início". Se o hash bater, continuar.

**Auditoria:** o Codex registra "HEAD auditado = hash-final do handoff" e grava o relatório na mesma branch.

**Aprovação:** só o usuário move o gate para "aprovado/integrar" no `PROGRESS.md`. O merge na `main` e o push exigem autorização explícita.

## H. Plano incremental

| Gate              | Escopo                                                                                                                                             | Onde     | Reversível   |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------ |
| **W2**            | Inventariar `<HOME_CHECKOUT>` e os worktrees `<HOME_WORKTREE_ROOT>/FinFlow-*` em casa, só leitura, e depois commitar a documentação pendente numa branch `docs/*` | **Casa** | Sim          |
| **W3**            | Bloco de estado no `PROGRESS.md`; desatualizações do `WORKFLOW`, `AGENTS`, `CLAUDE`, `RETOMADA` e `gates/README`; protocolo e modelos              | Qualquer | Sim, só docs |
| **W4**            | Versionar Gate 0 e 0A (decisões)                                                                                                                   | Qualquer | Sim          |
| **W5**            | Higiene do Git: refspec padrão, destino da `fix/invoice-due-date-next-month`, `*.log` no `.gitignore`, verificar CRLF em casa                      | Os dois  | Sim          |
| **W6 (opcional)** | Script de checagem de sessão, somente leitura                                                                                                      | Qualquer | Sim          |
| Depois            | Testes G1-C02/G1-C06 alinhados à Decisão 1 (gate do Claude com auditoria), e então C1 e S1                                                         | —        | —            |

## I. Pendências e decisões que dependem de você

1. **Autorizar o W2 em casa.** O primeiro passo é ver o que existe sem commit em `<HOME_CHECKOUT>`.
2. Confirmar se o relatório do Gate 0 (PASS_WITH_CONDITIONS) está em algum arquivo ou só na conversa.
3. Local das decisões: `docs/gates/GATE-0A-DECISOES-FINANCEIRAS.md` (minha recomendação) ou `docs/architecture/`.
4. Autorização permanente para publicar branches `gate/*` e `docs/*` no GitHub, mantendo a `main` sob autorização caso a caso.
5. Destino da `fix/invoice-due-date-next-month`: arquivar no GitHub ou declarar substituída.
6. Restaurar o `remote.origin.fetch` padrão (é mudança de configuração local).
7. Confirmar que a Decisão 1 é a regra oficial. Ela já está no código desde `68ea5df`, e então G1-C02 e G1-C06 devem ser corrigidos, não tolerados.
8. Decidir se o `CLAUDE.md` deve citar o ChatGPT como arquiteto (hoje fala em "coordenador").

**Limitações:**

- O computador de casa não foi inspecionado.
- Não li o conteúdo dos 7 testes que falham além de G1-C02 e G1-C06.
- Não executei a suíte.

## J. Resultado

`FINFLOW_WORKFLOW_GATE_W1_DIAGNOSTIC: COMPLETE`

Nenhum arquivo, branch ou configuração foi alterado. Aguardo aprovação antes de qualquer mudança.
