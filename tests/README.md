# Testes locais

A suíte original foi recuperada em financial-engine/. No terminal do VS Code:

```powershell
cd C:\Dev\FinFlow\tests\financial-engine
npm ci --ignore-scripts
npx playwright install chromium
npm test
```

Por padrão usa o Chromium gerenciado pelo Playwright. Para um executável específico, definir FINFLOW_CHROMIUM_PATH no ambiente. A adaptação é restrita ao lançamento do navegador em harness.mjs e compare-real-backup.mjs; asserções e código financeiro foram preservados.

A comparação com backup real é separada e não foi executada nesta recuperação. Não versionar backups pessoais.
