# PrivacyMyst — dokumentacja funkcjonalności (materiał do prezentacji)

> **Aktywny system ochrony prywatności i suwerenności danych w sieci.**
> Rozszerzenie Chrome (Manifest V3, Plasmo + React). Wszystko liczone **lokalnie** —
> żadne dane użytkownika nie opuszczają przeglądarki (poza ruchem-wabikiem, który
> celowo NIE niesie ciasteczek/tożsamości).

Ten dokument: dla każdej funkcji — **co robi**, **dlaczego to ważne**, **jak działa**
i **jak na żywo pokazać, że działa**. Checklista do odhaczania: `PrivacyMyst-Checklista-Testow.xlsx`.
Szczegółowy plan QA: `TESTING.md`.

---

## 1. Filozofia: obrona aktywna, nie tylko blokowanie

Klasyczne blokery (uBlock itd.) **chowają** użytkownika. My idziemy dalej — **aktywnie
psujemy** dane, które trackery zdążą zebrać:

| Podejście klasyczne | PrivacyMyst |
|---|---|
| Blokuj tracker | Blokuj **i zatruwaj** profil sprzecznymi danymi |
| Ukryj fingerprint | Podstaw **spójny, fałszywy** fingerprint (Wirtualna Tożsamość) |
| Usuń ciasteczka | **Rotuj** ID ciasteczek → co cykl jesteś „nowym" użytkownikiem |
| — | Pokaż użytkownikowi **co o nim wiadomo** (audyt cienia cyfrowego) |

---

## 2. Zgodność z 4 wymaganiami konkursowymi

| # | Wymaganie | Realizacja w produkcie |
|---|-----------|------------------------|
| 1 | **Anti-tracking** | Honeypot Trap (zatruwanie), Cookie Shredder (rotacja ID), DataGhost (ruch-wabik), guardy prywatności (WebRTC/DNS prefetch, Accept-Language) |
| 2 | **Anonimizacja danych** | Bionic Blur (mysz, klawiatura, navigator.*), Wirtualna Tożsamość (spójny fałszywy profil), Alias e-mail (SimpleLogin) |
| 3 | **Audyt cieni cyfrowych** | Shadow Audit — realny fingerprint + entropy drop + profil wywnioskowany z **prawdziwej historii** (zainteresowania, zgadywanka płci/wieku branży reklamowej) |
| 4 | **Filtrowanie agresywnego targetowania** | Targeting Shield — strip atrybucji (gclid/fbclid/utm) + total blackout trackerów na wrażliwych stronach (eskalacja z AI Deep-Dive) |

---

## 3. Architektura w pigułce

```
 ┌─ background.ts (service worker, MV3) ───────────────────────────┐
 │  • DataGhost (alarm co 1 min → ruch-wabik)                       │
 │  • initHoneypotTrap()  • initCookieShredder()                    │
 │  • initTargetingShield()                                         │
 │  • AI Deep-Dive: tab coverage → heurystyka DOM (debugger)        │
 │  • Panic wipe, Alias (SimpleLogin), offscreen LLM/NLI            │
 └─────────────────────────────────────────────────────────────────┘
 ┌─ content scripts ──────────────────────────────────────────────┐
 │  • bionic-blur-main.ts (MAIN world: patch navigator/mysz/klaw.)  │
 │  • sensitivePageGuard, AI deep-dive content                      │
 └─────────────────────────────────────────────────────────────────┘
 ┌─ UI (React) ───────────────────────────────────────────────────┐
 │  • popup.tsx — lekki panel                                       │
 │  • tabs/dashboard.tsx — pełny ekran (3 kolumny)                  │
 │  • sidepanel.tsx — kontekstowy panel                             │
 └─────────────────────────────────────────────────────────────────┘
```

**Współdzielony stan:** `chrome.storage.local` klucz `cnd:state` (Privacy Score + liczniki),
broadcastowany komunikatem `STATE_UPDATE` → popup i dashboard są zawsze zsynchronizowane.

**Zakresy reguł DNR:** `41001` Accept-Language · `42001–42005` Honeypot · `43001` strip atrybucji · `43100+` blackout per-origin.

---

## 4. Funkcjonalności — opis i demo

Dla każdej funkcji: **gdzie w UI**, **co pokazać** i **dowód techniczny** (SW console).
SW console = `chrome://extensions` → Szczegóły → *Sprawdź widoki: service worker*.

---

### 4.1 DataGhost — silnik szumu (ruch-wabik)
**Co robi:** w tle generuje anonimowe zapytania wyszukiwania (DuckDuckGo / Wikipedia /
Google) z losowych, szerokopasmowych tematów → zaśmieca obraz Twoich realnych
zainteresowań na poziomie sieci/ISP. Gdy aktywujesz Wirtualną Tożsamość, szum
**przechyla się** w stronę wybranych zainteresowań (budowa fałszywego profilu).

**Dlaczego ważne:** utrudnia korelację ruchu i profilowanie behawioralne.

**Demo:**
1. SW console: `chrome.runtime.sendMessage({type:'TRIGGER_NOISE'})`
2. Dashboard → **Telemetria na żywo**: wpisy `GHOST · DataGhost: batch N zapytań (kategorie)`.
3. Licznik „wstrzyknięć szumu" i kafelek **RUCH-WABIK** rosną.

**Dowód:** `chrome.storage.local.get('noiseGeneratedCount').then(console.log)` rośnie co cykl.

> **Uczciwość (warto powiedzieć jury):** to ruch-wabik bez ciasteczek (`no-cors`,
> `credentials: omit`) — szum sieciowy, *nie* czyści cookie-based profilu. Profilu
> reklamowego dotyka Cookie Shredder (4.3).

---

### 4.2 Honeypot Trap — zatruwanie profilera (data poisoning)
**Co robi:** przechwytuje żądania znanych trackerów (Google Analytics, Meta Pixel,
TikTok, Hotjar, DoubleClick) regułą DNR `redirect` i **nadpisuje parametry profilujące**
(`cid`, `_fbp`, `ttclid`…) absurdalnym, wewnętrznie sprzecznym profilem — np.
*„90-letni gamer kupujący nawóz, jacht i pampersy"*, sprzeczne geo/strefa/język +
gigantyczny losowy identyfikator sesji. Trucizna **rotuje co 1 min**.

**Dlaczego ważne:** profiler dostaje dane, ale **bezwartościowe** — niszczy to jakość
zbudowanego profilu, a nie tylko go ukrywa.

**Demo (deterministyczne):**
1. SW console: `chrome.runtime.sendMessage({type:'TRIGGER_HONEYPOT_TEST'})`
2. Telemetria: `TRAP · Zatruto Google Analytics: Wstrzyknięto profil: <persona>…`
3. Licznik „zatrutych trackerów" rośnie; kropka pojawia się na **Threat Radar**.

**Dowód:** `chrome.declarativeNetRequest.getDynamicRules()` → reguły `id ≥ 42001`,
`action.type: "redirect"` z `queryTransform.addOrReplaceParams`.

> Liczniki rosną z `onRuleMatchedDebug` (tylko wersja **rozpakowana**); samo
> zatruwanie działa również w buildzie produkcyjnym.

---

### 4.3 Cookie Shredder — rotacja/zatruwanie ciasteczek trackingowych
**Co robi:** co cykl enumeruje wszystkie ciasteczka i znanym trackerom (`_ga`, `_fbp`,
`_uetsid`, `MUID`, `_hj*`…) **nadpisuje segment-identyfikator** losowym ciągiem o **tej
samej długości i klasie znaków** (format-aware) — ciasteczko pozostaje strukturalnie
poprawne, ale niesie cudzą tożsamość. **Nie kasuje** ciasteczek (tracker ustawiłby
świeże), tylko mutuje ID.

**Dlaczego ważne:** przy każdej rotacji profiler widzi **nowego** użytkownika → brak
stabilnego profilu między wizytami. To realna ingerencja w cookie-based tracking.

**Demo:**
1. Wejdź na stronę z Google Analytics. DevTools strony: `document.cookie` → zanotuj `_ga`.
2. Przełącz moduł **Cookie Shredder** OFF→ON (rotacja od razu) lub odczekaj 1 min.
3. Odśwież `document.cookie` → wartość `_ga` **zmieniona**, prefiks `GA1.1.` nietknięty.

**Dowód bezpieczeństwa (mocny punkt):** zaloguj się gdzieś → po rotacji **nadal
zalogowany**. Rusza WYŁĄCZNIE ściśle-trackingowe nazwy; nigdy `SID`/`CONSENT`/`csrftoken`.

---

### 4.4 Targeting Shield — filtrowanie agresywnego targetowania (#4)
Dwie warstwy:

**A) Strip atrybucji (zawsze).** Reguła DNR `redirect` + `removeParams` zdejmuje z
nawigacji parametry łączące reklamę z tożsamością: `gclid, gbraid, fbclid, msclkid,
ttclid, utm_*` i kilkadziesiąt innych.
- **Demo:** wejdź na `https://example.com/?gclid=TEST&utm_source=news&fbclid=ABC` →
  parametry **znikają** z URL. Kafelek **ATRYBUCJA ZERWANA** rośnie (dev).

**B) Total blackout per-origin (eskalacja).** Gdy strona jest wrażliwa (oznaczona przez
AI Deep-Dive jako `high/critical`, albo ręcznie), reguły DNR `block` z
`initiatorDomains` **odcinają wszystkie hosty targetujące** (doubleclick, criteo,
taboola, outbrain, adnxs…) — **tylko na tej stronie**.
- **Demo:** na wrażliwej stronie SW console:
  `chrome.runtime.sendMessage({type:'TRIGGER_TARGETING_TEST'})` → odśwież → żądania
  trackerów `blocked` w Network. Log `[TargetingShield] BLACKOUT`. Kafelek **TARGETING ODCIĘTY** rośnie.
- **Dowód:** `chrome.storage.local.get('cnd:targeting:blocked-origins')` zawiera host;
  reguły DNR `id ≥ 43100`, `action.type: "block"`.

---

### 4.5 Bionic Blur — anonimizacja zachowania i fingerprintu
**Co robi (MAIN world):**
- **Mysz** — nakłada szum Perlina na trajektorię kursora (psuje biometrię ruchu).
- **Klawiatura** — mikro-opóźnienia rytmu pisania (psuje keystroke dynamics).
- **navigator.*** — spójne podmiany `hardwareConcurrency`, `userAgent`, `platform`,
  `deviceMemory`, `userAgentData` — UA zawsze zgodny z platformą (brak sprzeczności).

**Dlaczego ważne:** fingerprint behawioralny i sprzętowy to dziś główny wektor
śledzenia bez ciasteczek.

**Demo:**
- Szybko: `npm run smoke:extension` (Playwright na stronie-dowodzie — sprawdza patche i że pisanie działa).
- Ręcznie: na stronie DevTools Console → `window.__cloakDaggerBionicBlurInstalled` → `true`;
  `navigator.hardwareConcurrency` różni się od czystej karty, a UA pozostaje spójny.

---

### 4.6 Wirtualna Tożsamość — kreator profilu widzianego przez trackery
**Co robi:** wybierasz archetyp lub ustawiasz parametry (płeć, wiek, sprzęt, region,
zainteresowania). Po **Aktywuj** profil zasila jednocześnie: Bionic Blur (spójny
fingerprint) **i** DataGhost (tematy szumu) → trackery widzą jedną, spójną, **fałszywą**
osobę zamiast Ciebie.

**Demo:**
1. Dashboard → prawa krawędź → uchwyt **„Wirtualna Tożsamość"** (panel wysuwa się w lewo).
2. Wybierz archetyp → **Aktywuj** → log `Aktywowano tożsamość: <nazwa> — N rdzeni · locale · N tematów szumu`.
3. **Dowód:** `chrome.storage.local.get(['cnd:virtual-identity:active','cnd:bionic-blur:profile-id','cnd:dataghost:topics'])`.

---

### 4.7 Shadow Audit — audyt cienia cyfrowego (na realnych danych)
**Co robi:**
- **Entropy drop:** Twój **realny** ślad fingerprintu (czerwony) vs **maska** wybranej
  tożsamości (zielony) + różnica w bitach (~ile bardziej jesteś rozpoznawalny bez maski).
- **Profil z historii:** czyta Twoją **prawdziwą** historię (`chrome.history`, lokalnie),
  kategoryzuje domeny i pokazuje realne **zainteresowania z dowodami** (konkretne domeny)
  oraz uczciwie oznaczoną **zgadywankę płci/wieku**, jaką robi branża reklamowa.

**Dlaczego ważne:** to moment „aha" — użytkownik **widzi, co o nim wiadomo**.

**Demo:**
1. Dashboard → prawa kolumna → rozwiń **„Cień cyfrowy · audyt"** → **skanuj**.
2. Pokaż paski zainteresowań + dowody (np. „Technologia / IT — github.com, stackoverflow.com").
3. **Walidacja realności:** odwiedź kilka stron jednej kategorii → przeskanuj → udział tej
   kategorii rośnie. Wszystko bez żądań sieciowych (lokalnie).

---

### 4.8 AI Deep-Dive Risk — lokalna ocena ryzyka strony
**Co robi:** lokalnie (heurystyka DOM przez debugger; opcjonalnie model HF/NLI w
dokumencie offscreen) ocenia ryzyko profilowania na bieżącej stronie. Przy wysokim
ryzyku: **MaxCamo** (zazbraja DataGhost/Mysz/Klawiaturę) + **eskalacja Targeting Shield**
(blackout originu). Działa w tle — kartę UI usunięto z dashboardu, ale logika działa.

**Demo/dowód:**
- Wejdź na stronę o wrażliwej treści →
  `chrome.storage.local.get('cnd:state').then(s=>console.log(s['cnd:state'].aiDeepDiveRisk, s['cnd:state'].maxCamoActive))`
- Przy `high/critical` → host w `cnd:targeting:blocked-origins` (auto-blackout).
- Logika pokryta testami: `tests/aiDeepDiveScore.test.ts`, `aiDeepDiveTabCoverage.test.ts`.

---

### 4.9 Panic Button — strefa awaryjna (kill-switch)
**Co robi:** przytrzymanie (~0,85 s) odpala głębokie czyszczenie: cookies, cache,
IndexedDB, localStorage, service workers + reset liczników i telemetrii. Przełączniki
ochrony **zostają włączone**, by obrona działała dalej.

**Demo:** Dashboard → środek pod radarem → **Strefa awaryjna** → przytrzymaj →
„Sesje śledzące wyczyszczone". Liczniki w `cnd:state` = 0, `cnd:logs` puste, wylogowanie z serwisów.

---

### 4.10 Alias e-mail — identity masking
**Co robi:** generuje jednorazowy alias (SimpleLogin API; fallback offline) — podajesz
go zamiast prawdziwego maila przy rejestracjach.

**Demo:** Dashboard/popup → **Generuj alias e-mail** → pojawia się `…@…`, link „nowy"
generuje kolejny; log w telemetrii.

---

### 4.11 Privacy Score + spójność UI
**Co robi:** jeden wynik 0–100 z wagą modułów i aktywności, liczony identycznie w
popupie i dashboardzie, aktualizowany na żywo (`STATE_UPDATE`). Telemetria **przeżywa**
zamknięcie okna (`cnd:logs`, do 50 wpisów; powtórki łączą się w `×N`).

**Demo:** otwórz popup i dashboard jednocześnie; przełącz moduł → Score zmienia się w
obu. Zamknij i otwórz dashboard → telemetria nadal jest.

---

## 5. Scenariusz prezentacji na żywo (~5 min)

1. **Hook (30 s)** — „Blokery Cię chowają. My **psujemy** dane, które i tak zostaną zebrane."
   Otwórz Dashboard (pełny ekran), pokaż Privacy Score i Threat Radar.
2. **Cień cyfrowy (60 s)** — rozwiń audyt → „Oto co przeglądarka o Tobie zdradza" —
   realne zainteresowania z dowodami + zgadywanka płci/wieku. **Moment aha.**
3. **Honeypot na żywo (45 s)** — `TRIGGER_HONEYPOT_TEST` → log TRAP z absurdalną
   personą + kropka na radarze. „Google właśnie zapisał, że jesteś 90-letnim gamerem
   kupującym pampersy i jacht."
4. **Cookie Shredder (45 s)** — pokaż `_ga` przed/po rotacji w `document.cookie` →
   „Co minutę jesteś nowym użytkownikiem" + dowód: nadal zalogowany.
5. **Targeting Shield (45 s)** — URL z `gclid/utm` → parametry znikają; `TRIGGER_TARGETING_TEST`
   → trackery `blocked` w Network.
6. **Wirtualna Tożsamość (45 s)** — aktywuj archetyp → szum i fingerprint przyjmują
   spójny, fałszywy profil.
7. **Panic (20 s)** — przytrzymaj → wszystko czyszczone. „Pełna kontrola w 1 s."

> Tip: miej otwarte SW console i zakładkę Network — to Twój dowód, że to **działa naprawdę**, nie animacja.

---

## 6. Uczciwe ograniczenia (lepiej powiedzieć samemu)

- **DataGhost** = ruch-wabik bez ciasteczek → szum sieciowy, nie „czyszczenie profilu".
- **Liczniki Honeypot/Targeting** rosną z `onRuleMatchedDebug` → tylko wersja
  rozpakowana; samo filtrowanie/zatruwanie działa też w prod.
- **AI Deep-Dive (model HF)** — ciężki model w offscreen; heurystyka DOM działa zawsze,
  pełny model zależnie od zasobów.
- **Zgadywanka płci/wieku** w audycie jest **celowo zachowawcza i często błędna** —
  pokazujemy skalę profilowania branży, nie „fakt o użytkowniku".

---

## 7. Dowód jakości (testy automatyczne)

```bash
npm run typecheck   # tsc — 0 błędów
npm test            # vitest — 78/78 testów PASS (13 plików)
npm run smoke:extension   # Playwright — Bionic Blur E2E
npm run build       # plasmo build → produkcyjny artefakt
```

Pełna checklista manualna: **`PrivacyMyst-Checklista-Testow.xlsx`** (20 testów,
arkusze: Checklista / Snippety SW console / Setup). Plan QA: **`TESTING.md`**.
