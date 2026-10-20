# FinFlow — Gate W2-P: preservação para continuidade em casa

Data: 2026-10-20
Estado: preparado localmente; publicação pendente de autorização específica

## Baseline e isolamento

- Baseline verificada: `main` em `2f63632fe39fe98118332efcda79597e58bb7d3d`.
- Na consulta remota, `refs/heads/main` também apontava para `2f63632fe39fe98118332efcda79597e58bb7d3d`.
- Branch documental: `preservation/gate-w2-p-2026-10-20`.
- Worktree isolado; nenhum checkout, merge ou commit foi feito na `main`.
- Commit dos relatórios sanitizados: `fe58d4af2e8f180b80780c32a2b6cd11a7365cff`.

## Arquivos preservados

### Diagnóstico W1

- Caminho: `docs/audits/FINFLOW-WORKFLOW-GATE-W1-DIAGNOSTIC-2026-10-20.md`.
- Blob Git: `65a1c0e7f6ff9bfbb2f90f8f04583ab6e2883b0d`.
- SHA-256 da cópia sanitizada: `a2866a555287eacf93cd892d2645c716df9d2e365af6e81f1cec1c063c76ada3`.
- SHA-256 do anexo recebido: `e4419c78ec1daad675aa5ac5469b928045cc853c1d1824fd28448738e9acafea`.

### Auditoria independente W1

- Caminho: `docs/audits/FINFLOW-WORKFLOW-GATE-W1-INDEPENDENT-AUDIT-2026-10-20.md`.
- Blob Git: `079205e4af383420a9ba55196a120300e8fc177d`.
- SHA-256 da cópia sanitizada: `4f3ab5fb19b04f4933f54f311337f2b0f00bab9d026fcc0e09717894199b3ffc`.
- SHA-256 do anexo recebido: `c57ff28ef3c68f836cff85d7ca3f289c21bf72b0cfb25b48001edf72a2355783`.

## Sanitização

Foram substituídos por marcadores neutros:

- usuário e diretório local da Prefeitura;
- nome do computador da Prefeitura;
- usuário e diretório local do computador de casa;
- caminhos absolutos dos checkouts e worktrees;
- referências locais em links, convertidas para caminhos relativos do repositório.

A varredura não encontrou token, chave, senha, segredo atribuído, e-mail, CPF ou CNPJ nos arquivos sanitizados. Referências textuais a backups descrevem evidência ausente ou proibida; nenhum backup, extrato ou dado financeiro real foi incorporado.

## Gate 0A

O commit-base não contém Gate 0, Gate 0A, C1 ou S1. Nesta sessão, somente a decisão 10 está disponível em texto exato:

> classificação assistida e revisável das categorias essenciais, com cálculo automático do piso de segurança.

As decisões 1–9 aparecem apenas como temas ou perguntas no parecer do Gate 0; as opções aprovadas não estão disponíveis em texto exato. Para evitar reconstrução por inferência, `docs/gates/GATE-0A-DECISOES-FINANCEIRAS.md` não foi criado e não integra a lista de publicação.

## Ref histórica separada

- Ref local: `refs/heads/archive/invoice-due-date-next-month-2026-10-06`.
- Ponta: `e59834576790c73fe5747b96df043ea5df1fa3b3`.
- Implementação preservada: `30e02e1b9e5e3b59e7e0972a9d111205b976ef80`.
- Base comum com `main`: `f4682955f1aa3ba92ea16bec83d9221b739b9682`.
- Divergência observada: `main` com 30 commits exclusivos; linha histórica com 2 commits exclusivos.
- A ref é somente histórica e não deve ser mesclada na `main`.

A inspeção do delta `f468295..e598345` encontrou quatro arquivos, 273 inserções e 3 remoções. Não foram encontrados tokens, segredos atribuídos, CPF, CNPJ ou e-mail. Duas ocorrências são somente nomes de um backup real opcional e ausente; nenhum conteúdo de backup está no histórico.

## Objetos não publicados fora do escopo

O `git fsck --no-reflogs --unreachable` encontrou seis commits inalcançáveis, ainda não classificados: `cd514e0`, `63728b5`, `98b28d6`, `5fe7ca6`, `2f883ee` e `f09f940`. Eles não fazem parte desta preservação e não devem ser publicados sem auditoria própria.

## Allowlist para publicação, ainda não executada

Branch documental:

- `refs/heads/preservation/gate-w2-p-2026-10-20`.

Arquivos permitidos:

- `docs/audits/FINFLOW-WORKFLOW-GATE-W1-DIAGNOSTIC-2026-10-20.md`;
- `docs/audits/FINFLOW-WORKFLOW-GATE-W1-INDEPENDENT-AUDIT-2026-10-20.md`;
- `docs/handoffs/GATE-W2-P-PRESERVATION-2026-10-20.md`.

Ref histórica permitida separadamente, se confirmada:

- `refs/heads/archive/invoice-due-date-next-month-2026-10-06` → `e59834576790c73fe5747b96df043ea5df1fa3b3`.

Não publicar: código adicional, `main`, backups, extratos, capturas, dados financeiros, configurações OAuth, tokens, credenciais, decisões Gate 0A incompletas ou objetos inalcançáveis.

## Retomada em casa após publicação autorizada

1. Confirmar árvore limpa no computador de casa; se houver alterações, parar e inventariar.
2. Consultar os heads remotos antes de qualquer pull ou checkout.
3. Criar um checkout separado de `preservation/gate-w2-p-2026-10-20`.
4. Confirmar que o head remoto é igual ao hash de publicação informado pelo Codex.
5. Ler os dois relatórios W1 e este handoff.
6. Recuperar o texto exato das decisões Gate 0A-1 a Gate 0A-9.
7. Criar o registro Gate 0A em commit documental separado e repetir a varredura de sensibilidade.
8. Tratar `archive/invoice-due-date-next-month-2026-10-06` apenas como evidência histórica.
9. Não iniciar C1 ou S1 enquanto o Gate 0A não estiver completo e autorizado.

Nenhum push ou merge foi executado durante o Gate W2-P.
