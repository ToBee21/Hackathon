# Cloak & Dagger — plan testów

Jak uruchomić i sprawdzić **wszystkie** funkcjonalności wtyczki. Dokument oparty na
aktualnym kodzie (`src/`), nie na założeniach.

Legenda: **SW console** = konsola service workera (background). **Popup DevTools** =
inspekcja okienka wtyczki. **Storage dump** / **DNR dump** = snippety niżej.

---

## 0. Testy automatyczne (uruchom najpierw)

```bash
npm run typecheck        # tsc --noEmit — 0 błędów
npm test                 # vitest — 78 testów jednostkowych (13 plików)
npm run smoke:extension  # playwright — Bionic Blur na stronie-dowodzie (wymaga zbudowanej wtyczki)
npm run build            # plasmo build → build/chrome-mv3-prod (musi przejść bez błędu)
```

Stan referencyjny (sprawdzony): `typecheck` czysty, `vitest` 78/78 PASS.

Co pokrywają testy jednostkowe (czego **nie** trzeba klikać ręcznie):
- `bionicBlurCore` — rdzeń profili fingerprintu
- `dataGhostKeywordBatch` — dobór fraz szumu (w tym tematy z Wirtualnej Tożsamości)
- `virtualIdentity*` — archetypy, mapowanie na profil/tematy szumu
- `aiDeepDive*` — heurystyka score, NLI/LLM view, report policy, tab coverage, ekstrakcja DOM

---

## 1. Przygotowanie środowiska (raz)

1. Zbuduj wtyczkę:
   - **dev (hot-reload, liczniki DNR działają)**: `npm run dev` → `build/chrome-mv3-dev`
   - **prod (do oceny)**: `npm run build` → `build/chrome-mv3-prod`
2. `chrome://extensions` → włącz **Tryb dewelopera** → **Wczytaj rozpakowane** → wskaż katalog `build/chrome-mv3-*`.
3. Wejdź w **Szczegóły → Sprawdź widoki: service worker** — to jest **SW console**.

> ⚠️ Liczniki Honeypota i Targeting Shield rosną przez `onRuleMatchedDebug`, które
> działa **tylko dla rozszerzeń wczytanych jako rozpakowane** (uprawnienie
> `declarativeNetRequestFeedback`). Samo **filtrowanie/zatruwanie działa też w prod** —
> w prod po prostu nie zobaczysz inkrementacji licznika z tego źródła.

### Narzędzia diagnostyczne (wklejaj w SW console)

```js
// Storage dump — cały stan lokalny wtyczki
chrome.storage.local.get(null).then(s => console.log(JSON.stringify(s, null, 2)))

// Współdzielony stan dashboardu (Privacy Score + liczniki)
chrome.storage.local.get("cnd:state").then(console.log)

// DNR dump — wszystkie aktywne reguły dynamiczne (Honeypot 42001+, strip 43001, block 43100+)
chrome.declarativeNetRequest.getDynamicRules().then(r => console.table(r.map(x => ({id:x.id, type:x.action.type}))))

// Ręczne wyzwolenie self-testu Honeypota (przyciski testowe usunięto z UI)
chrome.runtime.sendMessage({ type: "TRIGGER_HONEYPOT_TEST" })

// Ręczny blackout Targeting Shield dla bieżącej aktywnej karty
chrome.runtime.sendMessage({ type: "TRIGGER_TARGETING_TEST" })
```

---

## 2. Testy modułów (manualne / E2E)

### 2.1 DataGhost — silnik szumu (ruch-wabik)
**Cel:** generuje anonimowe zapytania-wabiki utrudniające profilowanie po stronie sieci/ISP.

**Kroki:**
1. Po instalacji odczekaj ~30 s (pierwszy cykl) lub w SW console: `chrome.runtime.sendMessage({type:"TRIGGER_NOISE"})`.
2. Otwórz dashboard (ikona pełnego ekranu w popupie) → **Telemetria na żywo**.

**Oczekiwane:**
- W telemetrii wpisy `GHOST · DataGhost: batch N zapytań (kategorie…)`.
- Licznik **„wstrzyknięć szumu"** (nagłówek) i kafelek **RUCH-WABIK** rosną.
- W SW console (Network) lecą `GET` na `duckduckgo/wikipedia/google` z `credentials: omit`.

**Sprawdź też:** `chrome.storage.local.get("noiseGeneratedCount").then(console.log)` rośnie co cykl (alarm `dataghost-noise-cycle`, co 1 min).

**Uczciwa uwaga:** to ruch-wabik (no-cors, bez ciasteczek) — szum na poziomie sieci, **nie** czyści profilu reklamowego. Profilu dotyka dopiero Cookie Shredder (2.3).

**Wyłączenie:** przełącz **DataGhost** w „Wektory ochrony" → alarm kasowany, batch'e przestają lecieć.

---

### 2.2 Honeypot Trap — zatruwanie profilera (Data Poisoning)
**Cel:** przechwytuje żądania znanych trackerów (GA, Meta Pixel, TikTok, Hotjar, DoubleClick) i nadpisuje parametry profilujące absurdalnym, sprzecznym profilem.

**Kroki (najpewniejszy, deterministyczny):**
1. SW console: `chrome.runtime.sendMessage({ type: "TRIGGER_HONEYPOT_TEST" })`
   (wysyła nieszkodliwe `GET` na `google-analytics.com/g/collect` → reguła DNR 42001+ zatruwa parametry).
2. Alternatywnie wejdź na stronę z realnym Google Analytics / Pixel Facebooka.

**Oczekiwane:**
- Telemetria: wpis `TRAP · Zatruto Google Analytics: Wstrzyknięto profil: <absurdalna persona>…`.
- Kafelek **CIASTECZKA ZROTOWANE**? Nie — Honeypot bije w licznik **„zatrutych trackerów"** (`trackersBlockedCount`) w nagłówku.
- Radar: pojawia się kropka trackera.

**Sprawdź regułę:** DNR dump → reguły `id >= 42001`, `action.type === "redirect"` z `queryTransform.addOrReplaceParams`.
**Sprawdź rotację trucizny:** odczekaj 1 min (alarm `honeypot-rotate-poison`) — opis wstrzykniętego profilu w kolejnym logu jest inny.

**Uwaga:** licznik rośnie z `onRuleMatchedDebug` → tylko w wersji rozpakowanej.

---

### 2.3 Cookie Shredder — rotacja/zatruwanie ciasteczek trackingowych
**Cel:** nadpisuje wartości ciasteczek trackerów (`_ga`, `_fbp`, `_uetsid`, `MUID`, `_hj*`…) losowym ID o tej samej strukturze → przy każdej rotacji wyglądasz jak nowy użytkownik. **Nie rusza** ciasteczek logowania/sesji/zgód.

**Kroki:**
1. Wejdź na stronę z Google Analytics (większość serwisów) — w DevTools strony: `document.cookie` → zanotuj wartość `_ga` (np. `GA1.1.123456789.16xxxxxxxx`).
2. Poczekaj na rotację (alarm `cookie-shredder-rotate`, co 1 min) **lub** przełącz moduł OFF→ON w „Wektorach ochrony" (rotacja odpala się natychmiast po włączeniu).
3. Odśwież `document.cookie`.

**Oczekiwane:**
- Segment-identyfikator w `_ga` **zmieniony** (ta sama długość i klasa znaków, inne cyfry), prefiks `GA1.1.` nietknięty.
- Telemetria: `Zrotowano N ciasteczek trackerów (_ga, _fbp, …)`.
- Kafelek **CIASTECZKA ZROTOWANE** (`cookiesRotatedCount`) rośnie.

**Test bezpieczeństwa (ważny):** zaloguj się gdzieś (np. ciasteczko `SID`, `csrftoken`, `CONSENT`) → po rotacji **musisz pozostać zalogowany**, te ciasteczka bez zmian.

---

### 2.4 Targeting Shield — filtrowanie agresywnego targetowania (#4)
Dwie funkcje: **(A) strip atrybucji** zawsze, **(B) total blackout** na wrażliwych stronach.

#### A) Strip atrybucji (gclid/fbclid/utm_*)
**Kroki:**
1. W pasku adresu wejdź na: `https://example.com/?gclid=TEST123&utm_source=newsletter&utm_medium=email&fbclid=ABC`
2. Obserwuj finalny URL po załadowaniu.

**Oczekiwane:**
- Parametry `gclid/fbclid/utm_*` **zniknęły** z URL (reguła DNR 43001 redirect + `removeParams`).
- (dev) Telemetria: `Targeting Shield: zerwano N atrybucji`; kafelek **ATRYBUCJA ZERWANA** rośnie.

**Sprawdź regułę:** DNR dump → reguła `id === 43001`, redirect z `queryTransform.removeParams`.

#### B) Total blackout per-origin (eskalacja)
**Kroki (ręcznie, bez czekania na AI):**
1. Wejdź na dowolną „wrażliwą" stronę (np. zdrowotną).
2. SW console: `chrome.runtime.sendMessage({ type: "TRIGGER_TARGETING_TEST" })`.
3. Odśwież stronę.

**Oczekiwane:**
- W SW console log `[TargetingShield] BLACKOUT (test) dla originu: <host>`.
- Żądania do `doubleclick.net / facebook.net / criteo / taboola / …` na **tej** stronie są **blokowane** (Network → status `blocked`/`failed`).
- Telemetria: `Total blackout trackerów na wrażliwej stronie: <host>`; kafelek **TARGETING ODCIĘTY** rośnie (dev).
- DNR dump → reguły `id >= 43100`, `action.type === "block"`, w `condition.initiatorDomains` Twój host.
- Persystencja: `chrome.storage.local.get("cnd:targeting:blocked-origins")` zawiera host.

#### B') Eskalacja automatyczna z AI (integracja z 2.6)
- Gdy AI Deep-Dive oznaczy origin jako `high`/`critical`, `escalateTargetingForOrigin()` woła ten sam blackout automatycznie. Test: patrz 2.6.

---

### 2.5 Bionic Blur — maskowanie myszy i klawiatury + fingerprint (MAIN world)
**Cel:** szum Perlina na trajektorii kursora, mikro-opóźnienia rytmu pisania, spójne podmiany `navigator.*` (hardwareConcurrency, userAgent, platform…).

**Najszybszy test:** `npm run smoke:extension` (Playwright, strona-dowód — sprawdza patche i że pisanie nadal działa).

**Manualnie:**
1. Wejdź na dowolną stronę http(s), otwórz DevTools strony (Console).
2. `window.__cloakDaggerBionicBlurInstalled` → `true` (content script wstrzyknięty w MAIN world).
3. Porównaj `navigator.hardwareConcurrency` / `navigator.userAgent` z wartościami w „czystej" karcie incognito bez wtyczki — przy aktywnym profilu Wirtualnej Tożsamości (2.8) powinny się różnić, ale być **wewnętrznie spójne** (UA pasuje do platformy).
4. Wpisz tekst w pole formularza → pisanie działa płynnie (maskowanie nie psuje inputu).

**Wyłączenie:** przełączniki **Bionic Blur · Mysz** / **· Klawiatura** w „Wektorach ochrony".

---

### 2.6 AI Deep-Dive Risk — lokalna detekcja ryzyka strony
**Cel:** lokalnie (bez sieci) ocenia ryzyko profilowania na stronie i przy `high/critical` zazbraja MaxCamo + eskaluje Targeting Shield. **Uwaga:** kartę UI usunięto z dashboardu, ale funkcjonalność (skan w tle, eskalacja, MaxCamo) działa dalej.

**Kroki:**
1. Wejdź na stronę o „wrażliwej" treści (dużo słów-kluczy zdrowotnych/finansowych/politycznych).
2. SW console — obserwuj wynik skanu (heurystyka DOM przez debugger) i:
   `chrome.storage.local.get("cnd:state").then(s => console.log(s["cnd:state"].aiDeepDiveRisk, s["cnd:state"].maxCamoActive))`

**Oczekiwane:**
- `aiDeepDiveRisk` ustawione (level + score), przy wysokim ryzyku `maxCamoActive: true`.
- MaxCamo zazbraja DataGhost/Mouse/Keystroke (STATE_UPDATE → przełączniki ON).
- Przy `high/critical`: automatyczny blackout originu (2.4 B') — sprawdź `cnd:targeting:blocked-origins`.

**Test jednostkowy logiki:** pokryty przez `tests/aiDeepDiveScore.test.ts` i `aiDeepDiveTabCoverage.test.ts`.

**Tryb modelu lokalnego (offscreen LLM/NLI):** ciężki model HF działa w dokumencie offscreen; jego logi: `chrome.storage.local.get("cnd:offscreen-logs").then(console.log)`.

---

### 2.7 Cień cyfrowy — audyt (Shadow Audit) — na realnych danych
**Cel:** pokazuje realny fingerprint + „entropy drop" maski, oraz profil **wywnioskowany z Twojej historii** (zainteresowania + zgadywanka płci/wieku branży reklamowej).

**Kroki:**
1. Dashboard → prawa kolumna → rozwiń **„Cień cyfrowy · audyt"** (chevron) → **skanuj**.

**Oczekiwane:**
- Pasek **Twój ślad (realny)** vs **Maska** (zależny od wybranej Wirtualnej Tożsamości) + różnica w bitach.
- Sekcja **Zainteresowania (z Twojej historii)** — paski kategorii z **dowodami** (konkretne domeny z Twojej historii) i licznikiem dopasowań.
- Sekcja **„Jak zgaduje Cię branża reklamowa"** — płeć/wiek z uczciwie zaniżoną pewnością (zachowawcze, lokalne).

**Walidacja realności danych:** odwiedź kilka stron z jednej kategorii (np. `github.com`, `stackoverflow.com` → technologia), przeskanuj ponownie → udział „Technologia / IT" rośnie, w dowodach pojawiają się te domeny.

**Brak danych:** świeży profil / brak uprawnienia `history` → komunikat „Za mało dopasowanych domen…" zamiast losowych liczb. Wszystko liczone lokalnie (sprawdź: brak żądań sieciowych przy skanie).

---

### 2.8 Wirtualna Tożsamość — kreator profilu widzianego przez trackery
**Cel:** wybór archetypu/parametrów (płeć, wiek, sprzęt, region, zainteresowania) → po **Aktywuj** wymusza spójny profil fingerprintu (Bionic Blur) i tematy szumu (DataGhost).

**Kroki:**
1. Dashboard → prawa krawędź → uchwyt **„Wirtualna Tożsamość"** (panel wysuwa się w lewo).
2. Sprawdź, że jest **tylko jedna lista archetypów** (zakładkę „Specjalne" usunięto — patrz `git log`).
3. Wybierz archetyp lub zmień parametry ręcznie (znacznik przełącza się na „custom") → **Aktywuj**.

**Oczekiwane:**
- Telemetria: `Aktywowano tożsamość: <nazwa> — N rdzeni · <locale> · N tematów szumu`.
- `chrome.storage.local.get(["cnd:virtual-identity:active","cnd:bionic-blur:profile-id","cnd:dataghost:topics"]).then(console.log)` — zapisany profil, `profile-id: "custom"`, tematy szumu.
- Po aktywacji: `navigator.hardwareConcurrency`/UA na stronach zgodne z wybranym sprzętem (2.5), a DataGhost przechyla frazy w stronę wybranych zainteresowań (2.1).
- Panel zamyka się klikiem w tło; uchwyt nie nachodzi na treść (`pr-10`).

**Logika mapowania:** pokryta `tests/virtualIdentityStudio.test.ts` + `virtualIdentity.test.ts`.

---

### 2.9 Panic Button — strefa awaryjna (kill-switch)
**Cel:** głębokie czyszczenie (cookies, cache, IndexedDB, localStorage, service workers) + reset stanu dashboardu; przełączniki ochrony zostają ON.

**Kroki:**
1. Dashboard → środek pod radarem → **Strefa awaryjna** → **przytrzymaj** ~0,85 s do wypełnienia paska.

**Oczekiwane:**
- Komunikat „Sesje śledzące wyczyszczone".
- Liczniki wyzerowane: `cnd:state` → wszystkie counts = 0; **Telemetria na żywo wyczyszczona** (`cnd:logs` = []).
- Realnie skasowane dane przeglądania (sprawdź: wylogowanie z serwisów, pusty `document.cookie` na odwiedzonych stronach).
- Puszczenie przed końcem = **anulowanie** (nic się nie dzieje).

---

### 2.10 Alias e-mail (Identity Masking)
**Cel:** generuje jednorazowy alias (SimpleLogin API; fallback offline gdy brak sieci/tokenu).

**Kroki:**
1. Dashboard → środek pod radarem → **Generuj alias e-mail** (lub w popupie).

**Oczekiwane:**
- Pojawia się alias (`...@...`); link **„nowy"** generuje kolejny.
- Telemetria: `Wygenerowano alias e-mail: <alias>`.
- Online z ważnym tokenem SimpleLogin → realny alias z API; offline/błąd → alias z fallbacku (bez crasha).

---

### 2.11 Privacy Score, liczniki i persystencja telemetrii
**Cel:** spójność między popupem, dashboardem i ikoną wtyczki.

**Kroki/oczekiwane:**
- **Score:** włączanie/wyłączanie modułów + aktywność (szum, zatrucia, rotacje) zmienia Privacy Score w popupie **i** dashboardzie na żywo (przez `STATE_UPDATE`).
- **Synchronizacja popup↔dashboard:** otwórz oba; zmiana w jednym natychmiast widoczna w drugim.
- **Persystencja telemetrii:** wygeneruj kilka logów → zamknij dashboard → otwórz ponownie → **logi nadal są** (`cnd:logs`, do 50 wpisów). Potwierdzenie wymagania „telemetria nie kasuje się po wyjściu z okna".
- **Kolapsowanie logów:** powtarzalne zdarzenia z tego samego źródła w 8 s łączą się w jeden wpis z mnożnikiem `×N`.

---

## 3. Test layoutu dashboardu (ostatnie zmiany)

Otwórz dashboard na pełnym ekranie i potwierdź **nowy układ 3 kolumn**:

- **Lewa:** Privacy Score (ScoreChart) + kafelki metryk (RUCH-WABIK, SYGNAŁY ZAMASKOWANE, CIASTECZKA ZROTOWANE, ATRYBUCJA ZERWANA, TARGETING ODCIĘTY).
- **Środek:** Threat Radar, a **pod nim** wyśrodkowane: **Strefa awaryjna** + **Generuj alias e-mail** + stopka „Privacy-by-Design" (szerokość ograniczona, nie rozjeżdża się).
- **Prawa:** **Wektory ochrony** (przełączniki modułów) → **Telemetria na żywo** → **Cień cyfrowy · audyt**.
- **Karty AI Deep-Dive Risk NIE MA** w żadnej kolumnie (usunięta z widoku), ale jej funkcja działa (2.6).
- Brak nakładania się elementów; uchwyt Wirtualnej Tożsamości na prawej krawędzi nie zasłania treści.

---

## 4. Szybka checklista (smoke)

| # | Funkcja | Akcja | PASS gdy |
|---|---------|-------|----------|
| 1 | DataGhost | `TRIGGER_NOISE` | log GHOST + licznik szumu rośnie |
| 2 | Honeypot | `TRIGGER_HONEYPOT_TEST` | log TRAP + `trackersBlockedCount`↑ |
| 3 | Cookie Shredder | toggle OFF→ON na stronie z `_ga` | wartość `_ga` zmieniona, login ocalał |
| 4 | Targeting strip | wejście z `?gclid&utm_*` | parametry zniknęły z URL |
| 5 | Targeting blackout | `TRIGGER_TARGETING_TEST` + reload | trackery zablokowane, reguła 43100+ |
| 6 | Bionic Blur | `window.__cloakDaggerBionicBlurInstalled` | `true`, pisanie działa |
| 7 | AI Deep-Dive | strona wrażliwa | `aiDeepDiveRisk` set, ew. `maxCamoActive` |
| 8 | Cień cyfrowy | rozwiń + skanuj | realne zainteresowania z dowodami |
| 9 | Wirtualna Tożsamość | Aktywuj archetyp | log aktywacji, `cnd:virtual-identity:active` |
| 10 | Panic | przytrzymaj | „wyczyszczone", liczniki + logi = 0 |
| 11 | Alias | Generuj alias | alias widoczny, log |
| 12 | Persystencja | zamknij/otwórz dashboard | telemetria nie znika |
| 13 | Layout | otwórz pełny ekran | układ wg sekcji 3, brak karty AI |
```
