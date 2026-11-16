# Coffee Roasting Studio

Monitorování a záznam pražení pro Dongyi BR-3.5. Pražičku pouze čte (Modbus RTU přes Bluetooth SPP, Web Serial v Chrome), nic neovládá.

Specifikace: [SPEC.md](SPEC.md)

```bash
npm install
npm run dev     # http://localhost:5173
npm test
npm run build
```

Push do `main` → GitHub Actions → GitHub Pages.
