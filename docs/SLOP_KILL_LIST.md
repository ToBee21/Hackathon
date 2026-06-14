# Slop Kill List  -  PrivacyMyst

> Ten dokument istnieje, żeby zespół nie polerował śmieci. Każda pozycja oparta na
> kodzie (plik:linia). Powiązane: [HACKATHON_REPO_TRUTH_AUDIT.md](./HACKATHON_REPO_TRUTH_AUDIT.md).

---

## Slop Criteria

Coś jest slopem, jeśli:
* wygląda imponująco, ale nie chroni prywatności,
* nie ma end-to-end przepływu danych,
* to UI bez logiki,
* używa fałszywych wyników (score bez dowodu),
* używa zahardkodowanego tekstu/liczb demo,
* deklaruje „AI" bez zweryfikowanego modelu/algorytmu,
* dodaje złożoność bez wartości dla jury,
* tworzy ryzyko prywatności, udając, że je rozwiązuje,
* nie da się go wyjaśnić jury w 20 sekund.

---

## Kill / Keep / Repair Table

| Item | Lokalizacja | Klasyfikacja | Powód | Akcja |
| ---- | -------- | -------------- | ------ | ------ |
| Zahardkodowany token SimpleLogin | `src/background.ts:1003` (HEAD) + historia `396bbb7` + `build/llm-*-profile/.../ScriptCache` | **KILL** | Żywy sekret w źródle, historii i artefakcie buildu | **Rewokuj w SimpleLogin → purge historii → wyczyść `build/`** |
| Privacy Score | `popup.tsx:72-92`, `dashboard.tsx:68-83` (duplikat) | **DO NOT MENTION TO JURY** | Wymyślona suma punktów; +50 startowe za same toggle; demo-button podbija | **RENAME** na „Active defenses X/6" lub realny licznik beaconów |
| DataGhost jako „anonimizacja" | `background.ts:404-463` | **RENAME / DEMO ONLY** | Anonimowy wabik, zero wpływu na profil (`:421-430`) | Opis „network decoy (auxiliary)"; nie mów „anonimizujemy/zatruwamy profil" |
| Maskowanie biometrii behawioralnej | `bionicBlurCore.ts:351-362` (`getCoarseTimestamp`) | **REPAIR / DO NOT MENTION** | `floor(t/32)` → delty międzyzdarzeniowe zachowane → keystroke biometric nietknięta | Albo realny per-event jitter, albo nie obiecuj „keystroke masking" |
| Canvas masking „defeated" | `bionic-blur-main.ts:683-718` | **REPAIR** | Patchuje `getImageData`, ale NIE `toDataURL/toBlob` (główny wektor canvas-FP) | Spatchować `toDataURL/toBlob`; mówić „częściowe" |
| Audio masking | `bionic-blur-main.ts:788-810` | **REPAIR** | Tylko `getChannelData`; `OfflineAudioContext`/`AnalyserNode` niespatchowane | Dopiąć lub nie obiecywać |
| Entropy Drop (zielony słupek) | `ShadowAudit.tsx`; mount `dashboard.tsx:344` bez propsów | **REPAIR** | Komponent persona-aware montowany bez `profileId` → zawsze „auto" → drop nigdy nie renderuje | Przekaż `profileId`/`customBucket` albo zamontuj w popupie |
| Bity entropii (uniqueness) | `shadowAudit.ts:104-140` | **KEEP (DEMO honest)** | Stałe literaturowe, nie pomiar; ale uczciwie oznaczone „poglądowy" | Zostaw + zawsze mów „poglądowy (Panopticlick/AmIUnique)" |
| Honeypot persony / 768-znakowy poison-id | `honeypot.ts:48,120-210` | **DEMO ONLY** | Teatr; trackery ignorują nieznane query-params; realne ID w body/cookie i tak leci | Zostaw jako „flavour" demo, nie jako twardy mechanizm |
| `trackersBlockedCount` (konflacja) | `honeypot.ts:345`, `content.ts:210-213,302-312` | **RENAME** | Miesza „poisoned" (żądanie wysłane) + „masked mousemove" pod etykietą „blocked" | Rozdziel liczniki; nie nazywaj „zablokowane" |
| Liczniki DNR (dev-only) | `honeypot.ts:363-385`, `targetingShield.ts:328-359` | **REPAIR / DEMO ONLY** | `onRuleMatchedDebug` tylko w unpacked/dev; w prod = 0 | Demo z unpacked; ujawnij ograniczenie |
| Email alias offline | `emailAlias.ts:96-113` | **DEMO ONLY** | Niedostarczalne TLD `@dagger.privacy` itd. | Oznacz „decoy/form-noise" lub podłącz realne SimpleLogin z polem na token |
| `src/shared/aiDeepDive/runModel.ts` + `localLlm.ts` + `localNli.ts` | tamże | **KILL** | Martwy duplikat `offscreen.js`; sugeruje inferencję w content-script | Skasuj (zostaw tylko `gate.ts`) |
| `storage.ts` panic/settings/state/log API | `storage.ts:109-285` | **KILL** | Zero importów; żywa apka używa raw `chrome.storage.local`; `panicButton()` to nie ten, który działa | Skasuj lub podłącz |
| `reportPolicy.shouldSendAiDeepDiveReport` | `reportPolicy.ts:3` | **REPAIR** | Zawsze `true`, ignoruje argument; udaje politykę | Usuń lub zaimplementuj realną politykę |
| `manipulationRisk` w LLM insight | `llmView.ts:100-104` | **REPAIR** | Magic-number `score*conf*0.35` pokazany jako wniosek modelu | Pokaż tylko gdy model realnie zwróci, albo usuń wiersz |
| Toast „Max Camo aktywny" | `pageAlert.ts:83` | **REPAIR** | Twierdzi aktywację, którą decyduje dopiero background | Pokazuj po potwierdzeniu z backgroundu |
| `privacymyst-preview.html` | `demo/...:800-819` | **DEMO ONLY / DO NOT MENTION** | Statyczny mock, `NOISE=128/TRACKERS=37` zahardkodowane; nie shipowany | Nigdy nie pokazuj jako „żywy popup" |
| `build/llm-*-profile/**` | repo | **KILL** | Profile przeglądarki = bloat + nośnik tokenu | `.gitignore` + usuń z historii |
| Model picker w dashboardzie | `AiDeepDiveCard.tsx:142-162` @ `dashboard.tsx:287` | **REPAIR** | `disabled` na zawsze (brak `onSelectModel`) | Przekaż handler albo ukryj |
| `debugger` permission | `package.json` | **DEMO ONLY** | Żółty banner; maksymalny trust; wartość Kat. 3 znikoma | Rozważ usunięcie na demo |
| Strip atrybucji `gclid/fbclid/utm` | `targetingShield.ts:102-117` | **KEEP** | Realne, default-on, produkcyjne | Uwypuklić w demo |
| Cookie Shredder | `cookieShredder.ts:99-202` | **KEEP** | Realne `chrome.cookies.set` poison, default-on | Uwypuklić w demo |
| Per-origin blackout (DNR block) | `targetingShield.ts:119-130` | **KEEP** | Realny `action:"block"` eskalowany z detekcji | Uwypuklić; dodać de-eskalację |
| Heurystyka + lokalny NLI | `score.ts`, `offscreen.js:565` | **KEEP** | Realny, lokalny, wytłumaczalny | Uwypuklić; nazwać kategorię w UI |
| Panic Button | `background.ts:251` | **KEEP** | Realny `browsingData.remove` | Uwypuklić |
| Verify scripts (Playwright/CDP) | `scripts/verify-*.mjs` | **KEEP** | Realne asercje flip `heuristic→nli` | Użyj jako dowód „nie ściemniamy" |

---

## Fake Feature Exposures

### Privacy Score
* **Claimed:** „Wskaźnik poziomu ochrony prywatności użytkownika."
* **Actual:** `+9` za każdy z 4 modułów, `+7` za 2 behawioralne (wszystkie domyślnie ON → start ~50), plus `min(50, noise*2 + trackers*3 + cookies*2 + targeting*1)`. `trackersBlockedCount` podbija m.in. **kliknięcie demo-buttona** „Testuj Honeypot".
* **Dowód:** `popup.tsx:72-92`; `honeypot.ts:396`; `popup.tsx:182-186`.
* **Why bad:** jury spyta „co to znaczy 78?" → nie ma odpowiedzi opartej na pomiarze.
* **Fix/kill:** zamień na „Active defenses: 6/6 ON" + realny licznik „beaconów odciętych na tej stronie".

### DataGhost („zatruwanie profilu / anonimizacja")
* **Claimed:** „Uniemożliwia zbudowanie profilu zainteresowań; anonimizuje."
* **Actual:** `fetch(..., {mode:"no-cors", credentials:"omit"})`  -  bez ciasteczek → nie dotyka profilu ad/cookie ani server-side. Własny komentarz to przyznaje.
* **Dowód:** `background.ts:421-430`.
* **Why bad:** to obfuskacja sieciowa o znanych ograniczeniach (TrackMeNot/AdNauseam); twierdzenie „anonimizuje" jest nieprawdziwe.
* **Fix/kill:** „auxiliary network decoy"; nie używać słów „anonimizacja/zatruwanie profilu".

### Keystroke / mouse behavioral masking
* **Claimed:** „Niszczymy biometrię behawioralną (keystroke dynamics, ruch myszy)."
* **Actual:** `getCoarseTimestamp` losuje offset stały dla całego okna `floor(t/32)` → **delta między dwoma zdarzeniami w tym samym oknie = niezmieniona**. Mysz: statyczny przestrzenny szum ±3px, nie zmienia kształtu/prędkości gestu.
* **Dowód:** `bionicBlurCore.ts:351-362, 320-349`.
* **Why bad:** test keystroke-dynamics u jury pokaże niezmienioną sygnaturę.
* **Fix/kill:** realny per-event jitter (≥100 ms, jak kloak) lub nie obiecywać.

### Email aliasing („działające zamaskowane adresy")
* **Claimed:** „One-click działające aliasy e-mail."
* **Actual:** bez tokenu SimpleLogin `generateAlias` zawsze schodzi do `generateOfflineAlias` → `cloak-xxxx@dagger.privacy` (nieistniejący TLD). UI nie ma pola na token; w HEAD token był zahardkodowany (osobny problem bezpieczeństwa).
* **Dowód:** `emailAlias.ts:96-113,141-161`; `content.ts:404-420`.
* **Why bad:** wpisanie tego w realny formularz = martwa skrzynka.
* **Fix/kill:** realne pole na token SimpleLogin + ścieżka API, albo szczery opis „decoy/form-noise".

### Entropy Drop (przed/po masce)
* **Claimed:** „Pokazujemy spadek unikalności po włączeniu maski."
* **Actual:** `<ShadowAudit />` montowany bez `profileId` → `estimateMaskedShadow("auto")` → `totalBits=null` → renderuje się dashed box „Rotacja per-site", **nigdy** zielony „−X bit".
* **Dowód:** `dashboard.tsx:344`; `shadowAudit.ts:213-220`; `ShadowAudit.tsx:163-173`.
* **Why bad:** flagowa wizualizacja nie istnieje w działającej apce, choć testy są zielone (testują tylko czystą funkcję).
* **Fix/kill:** przekaż `profileId`/`customBucket` z zapisanego wyboru persony.

---

## Forbidden Pitch Claims (NIE mówić jury)

* „Blokujemy **wszystkie** trackery / AI profiling"  -  blokujemy listę ~27 hostów na high/critical.
* „**Anonimizujemy** użytkownika"  -  nie; DataGhost to anonimowy wabik.
* „**Zatruwamy** Twój profil reklamowy"  -  nie dotykamy profilu cookie/server.
* „Model **wykrywa intencję/manipulację**"  -  `manipulationRisk` to magic-number, nie sygnał.
* „**Maskujemy biometrię behawioralną / keystroke dynamics**"  -  jitter bezskuteczny.
* „**Privacy Score** pokazuje Twój poziom ochrony"  -  to gamifikowana suma.
* „Działa **w pełni offline / lokalnie**" bez gwiazdki  -  wagi modelu z HuggingFace przy 1. użyciu.
* „**Działające** aliasy e-mail"  -  domyślnie niedostarczalne placeholdery.
* „**Skończony produkt**"  -  to dev/unpacked POC.
* „Audytujemy cień cyfrowy **mierząc Twoją unikalność**"  -  bity są poglądowe/stałe.

---

## Clean Pitch Claims (prawda poparta kodem)

* „Strippujemy parametry atrybucji `gclid/fbclid/utm` z nawigacji  -  deklaratywnie, domyślnie." (`targetingShield.ts:102-117`)
* „Rotujemy/zatruwamy ciasteczka znanych trackerów (`_ga/_fbp/_uetsid/...`) co minutę, nie ruszając ciasteczek logowania/zgód." (`cookieShredder.ts:34-202`)
* „Gdy lokalna heurystyka oceni stronę jako wysoce wrażliwą, automatycznie blokujemy hosty reklamowe/analityczne dla tego origin (DNR `block`)." (`targetingShield.ts:119-130`, `handleRiskResult.ts:76`)
* „Klasyfikacja ryzyka dzieje się on-device; treść strony nie opuszcza przeglądarki  -  zapisujemy hash ścieżki, nie surowy URL, i nie trzymamy treści (`rawTextRetained:false`)." (`score.ts:51-53`, `normalize.ts:20`)
* „Opcjonalnie potwierdzamy ryzyko lokalnym modelem (NLI DeBERTa / LLM) na Transformers.js w dokumencie offscreen; jedyny ruch sieciowy to jednorazowe wagi z HuggingFace." (`offscreen.js:565,691`)
* „Maskujemy fingerprint JS spójną personą (UA = platforma = GPU), żeby maska sama nie była sygnałem." (`bionic-blur-main.ts:505`, `bionicBlurCore.ts:18-91`)
* „Panic Button czyści cookies/cache/IndexedDB/localStorage dla wszystkich witryn." (`background.ts:251-321`)
* „Pokazujemy realny fingerprint przeglądarki (poglądowy szacunek entropii wg literatury)." (`shadowAudit.ts:98-152`)
* „Inferencję udowadniamy realnymi testami Playwright/CDP, które czekają na flip źródła `heurystyka→NLI`." (`scripts/verify-deep-scan.mjs`)
