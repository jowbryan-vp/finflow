# FinFlow — transição Prefeitura → casa — SEC-2B2

Data: 21/10/2026

## Estado entregue

- Repositório: `https://github.com/jowbryan-vp/finflow`
- Branch de retomada: `sec/2-office-id-hardening`
- Base SEC-2B1: `71185fae8f817ccc69ba2579ecb566924032f3ce`
- Implementação SEC-2B2: `c36bc6dd29cde7bb1f19f438cdb1760096185f52`
- Auditoria independente Codex: `e8ef8a30e9c41917e0f3250555f32ec191acd8a8`
- Resultado: `FINFLOW_GATE_SEC2B2_INDEPENDENT_AUDIT: PASS_WITH_CONDITIONS`

A branch contém o SEC-1, SEC-2B1 e SEC-2B2 em sequência. Não houve merge na
`main`; a retomada deve ocorrer nesta branch, sem voltar para `main` como base.

## Resultado técnico

- 129 sinks de identificadores do domínio escritório corrigidos;
- lint SEC-2: 4 PASS / 0 FAIL;
- navegador SEC-2B2: 13 PASS / 0 FAIL;
- navegador SEC-2B1: 15 PASS / 0 FAIL;
- suíte completa: 857 PASS / 7 FAIL;
- as sete falhas são dívidas históricas, sem falha nova;
- working tree limpa no encerramento;
- nenhum dado real, token ou credencial versionado.

Relatórios principais:

- `docs/gates/SEC-2B2-OFFICE-ID-HARDENING.md`;
- `docs/audits/SEC-2B2-OFFICE-ID-HARDENING-CODEX-2026-10-21.md`.

## Retomada na máquina de casa

Em um clone existente:

```powershell
git switch sec/2-office-id-hardening
git fetch origin sec/2-office-id-hardening
git merge --ff-only FETCH_HEAD
git status --short --branch
git log --oneline -4
```

Se a branch ainda não existir localmente:

```powershell
git fetch origin sec/2-office-id-hardening
git switch -c sec/2-office-id-hardening FETCH_HEAD
git status --short --branch
git log --oneline -4
```

O `fetch` acima e o uso de `FETCH_HEAD` são intencionais: o clone da Prefeitura
possui um `remote.origin.fetch` restrito a poucas branches. Assim, um `git fetch
origin` genérico pode não criar `origin/sec/2-office-id-hardening`, e até uma
referência criada manualmente pode não ser reconhecida como upstream. Esses
comandos funcionam sem depender dessa configuração e nunca criam merge commit,
porque exigem avanço estritamente fast-forward.

Antes de trabalhar, confirmar que aparecem na história, nesta ordem:

1. `71185fa` — SEC-2B1;
2. `c36bc6d` — implementação SEC-2B2;
3. `e8ef8a3` — auditoria independente SEC-2B2;
4. o commit documental deste handoff.

O `git status` deve estar limpo. Não usar `git reset --hard`, não fazer rebase
da branch compartilhada e não fazer force push.

## Verificação opcional na chegada

```powershell
node tests/financial-engine/sec2-id-lint.mjs
node tests/financial-engine/sec2-id-render-office.test.mjs
node tests/financial-engine/sec2-id-render.test.mjs
node tests/financial-engine/run-all.mjs
```

Resultados esperados: 4/4, 13/13, 15/15 e 857 PASS / 7 FAIL,
respectivamente.

## Backup exato do `index.html`

O backup solicitado do SEC-2B1 corresponde ao commit `71185fa`:

- SHA-256: `dbcd54f98ae3d14619a3830ad66400ef1b989f0f10d1f58399d0d45d5801b42e`;
- blob Git: `6aca55db589b368e1b348b97f80cfcd0291bc5ce`;
- tamanho: 997.012 bytes.

Ele pode ser recriado em casa sem trocar de branch:

```powershell
git show 71185fae8f817ccc69ba2579ecb566924032f3ce:index.html > FinFlow-index-SEC-2B1-71185fa.html
```

Em PowerShell, para preservar os bytes exatamente, prefira executar esse
redirecionamento por `cmd.exe /c` ou conferir o SHA-256 depois da extração.

## Limitações registradas

- Aceite restrito à renderização segura de IDs textuais.
- IDs vazios, duplicados, numéricos, nulos, objetos e referências órfãs não
  foram saneados.
- O lint é heurístico e tem uma lacuna conhecida quando uma tag aparece colada
  após `}`; revisão manual origem → sink continua obrigatória.
- Permanecem 94 `ATTR_RAW_NONID` no escritório, reservados ao SEC-2B3.
- OAuth/Drive reais e dados reais não foram exercitados.

## Próximo trabalho recomendado

Abrir um escopo novo para o SEC-2B3, exclusivamente para valores não-ID crus
em atributos. Manter a separação obrigatória: Claude implementa e commita;
Codex audita independentemente. Não iniciar publicação ou merge na `main` sem
uma nova autorização explícita.
