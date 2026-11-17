# Coffee Roasting Studio

Monitorování a záznam pražení pro **Dongyi BR-3.5**. Aplikace pražičku **pouze čte** (teploty BT a ET přes Bluetooth), nic neovládá – plyn, vzduch a buben se jen ručně zapisují.

**Aplikace:** https://mystif.github.io/coffee-roasting-studio/ (Google Chrome)

## Každodenní postup

1. Zavři Artisan (port pražičky může mít otevřený jen jeden program).
2. Otevři aplikaci v Chrome → **Připojit pražičku** → vyber `DY_MACHINE…` (jen poprvé; příště si ji Chrome pamatuje).
3. Vyber kávu, referenční profil, zadej zelenou hmotnost → **Start Roasting**.
4. Události: tlačítka vpravo nebo **mezerník** (Charge → Dry End → FC start → FC end → Drop). Charge, TP, Dry End (130 °C) a Drop se navrhnou i automaticky.
5. Ruční záznam: **↑ ↓** plyn (kPa), **1–5** vzduch 25/35/50/65/75 %, **[ ]** buben, **⌘Z** zpět.
6. **Finish** → zadej praženou hmotnost → pražení se uloží do Historie (a do složky zálohy).

## Kde co je

| Záložka | Co tam najdeš |
|---|---|
| Pražení | živý graf, velká čísla, fáze, DTR, odchylka od reference a další krok plánu |
| Historie | všechna pražení, detail, úpravy, hodnocení, export (.alog / CSV / PNG / JSON), import z Artisanu, záloha všeho |
| Analýza | porovnání 2–8 pražení, statistiky a opakovatelnost podle kávy |
| Profily | referenční profily (z libovolného pražení jedním kliknutím) |
| Kávy | seznam káv (země, region, farma, zpracování, odrůda) |

Menu **⋯** na obrazovce pražení: přehrání záznamu `.alog` (jen pro vyzkoušení, vždy označené) a diagnostika připojení. Přepínač ☀/☾ mění světlý a tmavý režim.

## Data a bezpečnost

- Data jsou **jen v tomto prohlížeči** (IndexedDB) – žádný cloud, žádné přihlášení.
- **Nastavit zálohu** → vyber složku (ideálně iCloud Drive). Každé pražení se tam uloží jako soubor.
- Historie → **Stáhnout zálohu všeho** / **Obnovit ze zálohy**.
- Rozpracované pražení se ukládá každých 5 s; po pádu nebo obnovení stránky se samo vrátí.
- Aplikace funguje i **bez internetu**; nová verze se nabídne tlačítkem, nikdy ne během pražení.

## Technické

Pražička: Modbus RTU (funkce 3) přes Bluetooth Classic SPP, 9600 8N1, slave 1, BT = registr 0, ET = registr 2 (float32). Ověřeno proti oficiální předvolbě Artisanu `Machines/Dongyi/BR.aset` a na reálné pražičce.

Vite + React + TypeScript + Tailwind, uPlot, Dexie (IndexedDB), PWA. Bez serveru.

```bash
npm install
npm run dev     # http://localhost:5173
npm test        # včetně porovnání s Artisanem na lokálních .alog (_data/, test/Roast_profil/ – nejsou v gitu)
npm run build
```

Push do `main` → GitHub Actions (testy + build) → GitHub Pages. Specifikace: [SPEC.md](SPEC.md).
