# Coffee Roasting Studio – specifikace v1

Stav: **v1 dokončena (S0–S8)** · 2026-11-17 · ověřeno testy a v prohlížeči, na pražičce ověřen S0

## 1. Cíl a hranice

Jednoduchý monitorovací a záznamový nástroj pro pražičku **Dongyi BR-3.5** na každodenní pražení. Rychlejší a přehlednější než Artisan.

**Aplikace pražičku nikdy neovládá.** Pouze čte teploty. Plyn, vzduch a otáčky bubnu jsou ruční záznamy a v UI jsou tak i označené („záznam“, ne „nastavit“).

**Mimo rozsah v1:** cloud, přihlášení, více uživatelů, mobilní verze, ovládání pražičky, evidence skladu, cupping.

## 2. Klíčová rozhodnutí

| Rozhodnutí | Volba | Důvod |
|---|---|---|
| Připojení | **Web Serial v Chrome 138** na Macu s Big Surem | Pražička je Bluetooth Classic (SPP), macOS ji vystavuje jako sériový port. Web Bluetooth (pouze BLE) nepoužitelný. Žádná pomocná aplikace. |
| Data | **Lokálně v prohlížeči (IndexedDB)** + automatická záloha do složky na disku | Bez cloudu (rozhodnutí uživatele). Funguje i úplně offline. |
| Aplikace | Statická webová aplikace (PWA): **Vite + React + TypeScript + Tailwind** | Bez serveru není potřeba Next.js. Méně závislostí, rychlejší. |
| Hosting | **GitHub Pages**, nasazení automaticky z GitHubu | Zdarma, HTTPS (Web Serial ho vyžaduje), aktualizace přes push. |
| Detekce událostí | **Algoritmy Artisanu** (BTbreak, findTPint, fáze 130 °C) | Ověřeno na 35 reálných praženích uživatele. |
| Graf | **uPlot** | Nejrychlejší knihovna pro živé časové řady, malá velikost. |
| Jazyk | Čeština, pražicí termíny anglicky (Charge, TP, Dry End, FC, Drop, RoR, DTR) | Přání uživatele. |
| Výchozí motiv | Tmavý, světlý volitelně – minimalistický styl (Linear / Vercel / TradingView): plochy s jemnými okraji, bez clay stínů | Lepší kontrast grafu. |

## 3. Architektura

```
┌────────────── Prohlížeč (Chrome 138, Mac Big Sur) ──────────────┐
│ 1. UI (React)          Live Roasting · Historie · Profily · Analýza │
│        ▲ stav                                                       │
│ 2. Komunikace          RoasterConnection (Web Serial → Modbus RTU)  │
│        │ vzorky {t, BT, ET, zdroj}                                  │
│ 3. Záznam a data       RoastRecorder → IndexedDB (Dexie)            │
│                         └→ AutoBackup → složka na disku (.alog+.json)│
│ 4. Analytika           čisté funkce: RoR, fáze, DTR, porovnání      │
└─────────────────────────────────────────────────────────────────────┘
Service worker = aplikace běží i bez internetu.
```

Vrstvy jsou oddělené rozhraními. Komunikace nezná UI, analytika nezná úložiště. Analytika jsou čisté funkce, takže jdou snadno testovat.

## 4. Komunikace s pražičkou (ověřeno)

Zdroj: tvoje `artisan-settings.aset` je shodné s oficiální předvolbou Artisanu `Machines/Dongyi/BR.aset`.

- Port: `/dev/cu.DY_MACHINE-JL_SPP` (spárované zařízení, **párování se nemění**).
- Modbus RTU, 9600 baudů, 8N1, slave 1, funkce 3 (Read Holding Registers).
- Jeden dotaz načte 4 registry od adresy 0: `01 03 00 00 00 04 + CRC`.
- Registr 0–1 = **BT**, registr 2–3 = **ET**, float32, big-endian, °C. (Mapování podle kódu Artisanu, ověří se proti displejům v kroku S0.)
- Vzorkování 2 s jako v Artisanu. V S0 se otestuje 1 s.
- Timeout 400 ms, 1 opakování.
- **Obnovení spojení:** při chybě se port zavře a znovu otevře každé 2 s. Povolení portu si Chrome pamatuje, takže se nic nevybírá znovu. Výpadek se v datech uloží jako mezera, žádné dopočítávání. Záznam pražení mezitím běží dál.
- **Simulátor** pro vývoj a ukázky: vždy viditelně označen „SIMULACE“, jeho data nelze uložit jako skutečné pražení.
- Artisan a aplikace nesmí být připojené současně (port je výhradní). Aplikace to uživateli srozumitelně ohlásí.

## 5. Výpočty (výchozí hodnoty převzaté z tvého Artisanu)

- **RoR** BT v °C/min, okno 20 s, vyhlazení ekvivalentní filtru 7, omezení ±35 °C/min (jako `RoRlimit`).
- **Události:**
  - Charge a Drop se rozpoznají automaticky podle skoku teploty (jako autoCharge/autoDrop) a lze je opravit.
  - TP se dopočítá.
  - Dry End se navrhne při BT 130 °C (tvé nastavení fází) jen při pražení podle referenčního profilu; bez reference ho označíš ručně. Vždy lze přepsat ručně.
  - FCs, FCe, SC a vlastní události se zadávají ručně.
- **Fáze:**
  - Drying: Charge → Dry End
  - Maillard: Dry End → FCs
  - Development: FCs → Drop
  - U každé fáze čas a % z celku. **DTR** = Development / celkový čas.
- **Ztráta hmotnosti** = (zelená − pražená) / zelená. Po Drop si aplikace řekne o pražené hmotnosti (v tvých záznamech z Artisanu dosud chybí).

## 6. Datový model

```
Coffee      id, name, country, region, farm, process, variety, notes
Roast       id, coffeeId, profileId?, date, greenWeightG, roastedWeightG?, lossPct*,
            samples[] {t, bt, et}, gaps[] {from, to},
            events[] {type, t, bt, et, note?},
            controls[] {t, kind: gas|air|drum, value, unit: kPa|%},
            phases*, dtr*, rating 0–10?, notes, source: live|import
Profile     id, name, coffeeId?, fromRoastId, targetDropBT, targetTime,
            refBT[], refRoR[], refEvents[], notes
Settings    rorSpan, dryEndTemp, sampleInterval, theme, backupFolderHandle
```
`*` = dopočítané hodnoty. Profil vzniká jedním kliknutím z libovolného pražení („Uložit jako profil“).

## 7. Hlavní obrazovka – Live Roasting (13,3″, ~1440×900)

```
┌──────────────────────────────────────────────────────────────────┐
│ ● Připojeno  Colombia 3,0 kg · profil COL espresso     [Finish] │
├──────────────────────────────────────────────────────────────────┤
│  BT 182.4   ET 231.0   RoR 9.8   ČAS 08:12   od FC 01:05        │
│  fáze: Development 13 %          Δ profil: +2.1 °C / −0:08      │
├──────────────────────────────────────────────┬───────────────────┤
│                                              │ CHARGE   TP       │
│        GRAF  BT/ET/RoR + reference           │ DRY END  FCs      │
│        (pásy fází, značky událostí,          │ FCe      SC       │
│         záznamy plynu/vzduchu)               │ DROP   + vlastní  │
│                                              │                   │
├──────────────────────────────────────────────┴───────────────────┤
│ Plyn (záznam) [− 4.5 kPa +]  Vzduch (záznam) [25 35 50 65 75 %]  Buben [−  50  +] │
└──────────────────────────────────────────────────────────────────┘
```

- Číslice BT, ET a RoR mají aspoň 48 px. Barvy pevně: BT, ET, RoR, reference.
- Klávesové zkratky pro události (např. mezerník = další událost v pořadí). Během pražení není potřeba myš.
- Graf: zoom kolečkem, posun tažením, tlačítko „Sledovat živě“.

**Postup:** otevřít → Připojit → vybrat kávu (+ profil) → zadat zelenou hmotnost → Start → … → Drop → Finish → zadat praženou hmotnost → vyhodnocení.

## 8. Ostatní obrazovky

- **Historie:** seznam pražení s filtrem podle kávy, akce Duplikovat jako nové, Uložit jako profil, Export.
- **Detail pražení:** graf, fáze, DTR, události, ztráta, hodnocení, poznámky.
- **Porovnání:** 2 a více pražení přes sebe (BT, RoR), tabulka fází, DTR a ztráty. Opakovatelnost: rozptyl časů FC a Drop u stejné kávy.
- **Káva:** jednoduchý seznam.
- **Statistiky:** počet pražení, průměrné DTR a ztráta podle kávy.

## 9. Export a import

- **Import `.alog`** z Artisanu (tvých 15–20 souborů hromadně): teploty, události, plyn a vzduch ze `specialevents`, hmotnosti, fáze.
- **Export:** `.alog` (otevře se v Artisanu), CSV, PNG grafu, kompletní JSON záloha a obnova.
- **Automatická záloha:** po každém Finish se uloží `.alog` a `.json` do zvolené složky (doporučeně iCloud nebo Dropbox). Chrání před smazáním dat prohlížeče.

## 10. Plán implementace (tenké svislé řezy, každý ověřitelný)

| # | Řez | Hotovo, když |
|---|---|---|
| **S0** | **Test připojení** (jen čtení) | Na Macu u pražičky se zobrazí BT a ET shodné s displeji. Ověřené mapování registrů, odpojení a obnovení spojení i interval 1 s. **Brána: bez S0 se nepokračuje.** |
| S1 | Živý graf + RoR + velká čísla | Plynulé vykreslení 20 min dat, RoR odpovídá Artisanu na stejných datech. |
| S2 | Záznam pražení, události, plyn/vzduch/buben | Celé pražení od Charge do Drop včetně fází a DTR. |
| S3 | Uložení, offline, automatická záloha | Pražení přežije reload, výpadek internetu i Bluetooth. |
| S4 | Kávy, historie, detail, duplikace | Postup z kapitoly 7 funguje bez Artisanu. |
| S5 | Import `.alog` | Všech 15–20 souborů projde a jejich hodnoty sedí s Artisanem. |
| S6 | Profily a reference | Odchylka od profilu se zobrazuje živě. |
| S7 | Porovnání a statistiky, export `.alog`/CSV/PNG | Exportovaný `.alog` se otevře v Artisanu 3.1. |
| S8 | Doladění designu, světlý motiv, nasazení na GitHub Pages | Funguje z URL i offline. |

## 11. Testování

- Jednotkové testy (Vitest):
  - Modbus CRC a dekódování float,
  - RoR na tvých `.alog` datech oproti hodnotám z Artisanu,
  - fáze a DTR (`computed` z `.alog` jako referenční hodnoty),
  - parser a zápis `.alog`.
- Ruční test na pražičce:
  - porovnání s displeji,
  - vypnutí Bluetooth během pražení,
  - offline režim,
  - souběh s Artisanem.
- Simulovaná data nikdy nevydávat za data z pražičky.

## 12. Rizika

- **Chrome 138 bez aktualizací** (Big Sur). Přijato. Aplikace nepoužívá nic novějšího než Chrome 117.
- **Data jen v prohlížeči.** Zmírněno automatickou zálohou do složky a exportem.
- **Web Serial s Bluetooth portem na Big Suru** nebyl prakticky ověřen. Rozhodne S0, záloha je malý lokální bridge.

## 13. Stav realizace

| # | Hotovo | Ověření |
|---|---|---|
| S0 | ✅ | reálná pražička: Chrome 138 / Big Sur, odezva 61 ms, obnovení spojení, BT/ET potvrzeno |
| S1 | ✅ | RoR shodné s Artisanem (±0,5 °C/min při FCs) na 35 praženích |
| S2 | ✅ | auto Charge/TP/Drop podle Artisanu, fáze a DTR na sekundu |
| S3 | ✅ | obnova po reloadu, uložení po Finish, offline cache |
| S4 | ✅ | kávy, historie, detail, duplikace |
| S5 | ✅ | import všech 35 `.alog` – fáze, TP, Charge/Drop BT shodné s Artisanem |
| S6 | ✅ | profily, referenční křivka, ΔBT / Δčas / ΔRoR, plán plynu |
| S7 | ✅ | export `.alog` (round-trip + `ast.literal_eval`), CSV, PNG, JSON, záloha/obnova, analýza |
| S8 | ✅ | světlý/tmavý motiv, rozvržení 1280×800, README |

**Zbývá ověřit uživatelem:** otevření exportovaného `.alog` v Artisanu 3.1, zápis zálohy do složky, celé pražení na pražičce.
