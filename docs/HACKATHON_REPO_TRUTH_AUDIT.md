# Hackathon Repo Truth Audit  -  Cloak & Dagger

> Autopsja repozytorium przed demem dla jury. Tylko kod, runtime, build, testy.
> Data: 2026-06-14 · Branch: `feat/ai-deep-dive-risk` · HEAD: `21fc3c5`
> Metoda: ręczny odczyt każdego kluczowego pliku + równoległy audyt subagentów
> + adwersaryjna weryfikacja 12 „crown claims". Bez ufania README/komentarzom/UI.

---

## Executive Summary

1. To jest **rozszerzenie przeglądarki (Plasmo / Manifest V3)**, nie „platforma AI". Buduje się (`plasmo build` → exit 0), ma **60/60 zielonych testów** (vitest) i **czysty typecheck** (`tsc --noEmit` → 0).
2. Wbrew nazwie i marketingowi, **najmocniejsza i najprawdziwsza część to klasyczny anti-tracking**: realne reguły `declarativeNetRequest` (strip `gclid/fbclid/utm_*`, blackout ~27 hostów reklamowych per-origin) i realna rotacja/zatruwanie ciasteczek trackerów przez `chrome.cookies.set`  -  **wszystko domyślnie włączone**.
3. „AI Deep-Dive" jest **prawdziwe, ale opcjonalne**: lokalny model (NLI DeBERTa / LLM Granite/Gemma) na Transformers.js w dokumencie offscreen (WASM/WebGPU). **Domyślnie WYŁĄCZONE** (`aiModeEnabled:false`); wagi modelu **ściągają się z HuggingFace przy pierwszym użyciu**. Domyślnie na każdej stronie działa tylko heurystyka słów-kluczy.
4. Co jest słabe/fałszywe: **Privacy Score** (gamifikowana suma punktów, nie pomiar), **DataGhost** (anonimowy ruch-wabik bez wpływu na profil), **maskowanie biometrii behawioralnej** (jitter zbucketowany `floor(t/32)` → delty międzyzdarzeniowe zachowane = praktycznie bezskuteczne), **aliasy e-mail offline** (niedostarczalne placeholdery `@dagger.privacy`), **Entropy Drop** (komponent zamontowany bez propsów → nigdy się nie renderuje).
5. **KRYTYCZNE bezpieczeństwo:** w `src/background.ts:1003` (HEAD, commit historii `396bbb7`, oraz w cache build/) jest **zahardkodowany żywy token API SimpleLogin**  -  sprzeczne z całą narracją „privacy-by-design".
6. **Privacy paradox:** narzędzie prywatnościowe prosi o `<all_urls>` + `debugger` + content-script `document_start`, a auto-skaner czyta tekst KAŻDEJ strony (lokalnie). To obronne, ale fatalne optycznie dla jury.
7. Czy może uczciwie startować w Kategorii 3? **TAK**  -  ale tylko jeśli przeramujemy pitch wokół realnego rdzenia (lokalny audyt + odcięcie trackerów), a nie wokół „AI/anonimizacji/zatruwania profilu".
8. Co naprawić najpierw: (a) **zrewokować i wyczyścić token SimpleLogin**, (b) podpiąć sensitive-page guard pod auto-skaner, (c) ukryć/zrenamować fałszywe metryki, (d) naprawić Entropy Drop albo go nie pokazywać.

---

## Repository Snapshot

| Pole | Wartość | Dowód |
| ---- | ------- | ----- |
| Branch | `feat/ai-deep-dive-risk` | `git branch --show-current` |
| HEAD | `21fc3c5` (merge feat/ai-deep-dive-risk) | `git log -1` |
| Typ | Browser extension, Manifest V3 | `.plasmo/chrome-mv3.plasmo.manifest.json` |
| Framework | Plasmo `^0.90.5` | `package.json:30` |
| UI | React 18 + Tailwind 3 | `package.json:18-19,32` |
| Język | TypeScript 5.9 (strict typecheck OK) | `package.json:33`, `tsc --noEmit`=0 |
| ML runtime | `@huggingface/transformers ^4.2.0` (vendored `assets/vendor/transformers.web.js`, 1.1 MB) + ONNX Runtime WASM (`assets/onnxruntime/*`, 74 MB) | `package.json:17`, `assets/offscreen/offscreen.js:1` |
| Package manager | npm (`package-lock.json`, 500 KB) | root |
| Build | `npm run build` = `plasmo build` → **exit 0** | wykonano |
| Test | `npm test` = `vitest run` → **60/60 pass** (11 plików) | wykonano |
| Typecheck | `npm run typecheck` = `tsc --noEmit` → **0** | wykonano |
| E2E | Playwright/CDP: `tests/bionicBlurExtension.spec.ts`, `scripts/verify-*.mjs` | realne asercje (nie screenshoty) |
| Główne foldery | `src/{background,content,contents,shared,components,tabs}`, `assets/{offscreen,onnxruntime,vendor}`, `scripts/`, `demo/`, `tests/`, `docs/` | `find src` |

**Permissions (z `package.json:40-57` i zbudowanego manifestu):** `storage, browsingData, cookies, alarms, tabs, debugger, scripting, privacy, declarativeNetRequest, declarativeNetRequestFeedback, sidePanel, contextMenus, offscreen` + `host_permissions: <all_urls>` + content-script `matches: <all_urls>, run_at: document_start, all_frames: true`.

---

## Current Product Reality

| Obszar | Co istnieje | Dowód (plik:linia, symbol) | Real / Mocked / Broken / Slop | Notatki |
| ---- | ----------- | -------- | ---- | ----- |
| Strip parametrów atrybucji | DNR redirect + `queryTransform.removeParams` na `gclid/fbclid/utm_*` (40+ paramów) | `src/shared/targetingShield.ts:35-43,102-117` `buildParamStripRule`; init `background.ts:34` | **REAL** (default-on) | Działa deklaratywnie też w produkcji; licznik zależny od dev-only listenera |
| Blackout trackerów per-origin | DNR `action:"block"` na ~27 hostów ad/analytics, scope `initiatorDomains:[origin]` | `targetingShield.ts:58-67,119-130`; eskalacja `handleRiskResult.ts:76` | **REAL / PARTIAL** | Tylko lista znanych hostów; tylko high/critical; **brak de-eskalacji** (origin zostaje na zawsze, FIFO>30) |
| Cookie Shredder | `chrome.cookies.getAll` → format-aware poison `chrome.cookies.set` co 1 min | `src/shared/cookieShredder.ts:99-124,162-202` | **REAL** (default-on) | Ścisła whitelist (nie rusza SID/CONSENT/csrf); efekt przejściowy (tracker resetuje) |
| Honeypot (zatruwanie) | DNR redirect + `addOrReplaceParams` nadpisuje `cid/_fbp/ttclid` szumem + absurd persony | `src/shared/honeypot.ts:223-253` `buildRules` | **PARTIAL / SLOP** | Tylko query-params; GA4/Meta-CAPI/TikTok wysyłają ID w body/cookie → realne ID dalej leci; persony = teatr |
| Liczniki trackerów/logi DNR | Inkrement z `onRuleMatchedDebug` | `honeypot.ts:363-385`, `targetingShield.ts:328-359` | **PARTIAL** | **Dev-only** (`declarativeNetRequestFeedback`): w buildzie spakowanym liczniki = 0, mimo że filtrowanie działa |
| Heurystyka wrażliwych stron | Klastrowy scorer PL/EN, negacja-aware, 8 kategorii | `src/shared/aiDeepDive/score.ts:27`, `dictionaries.ts:10-282` | **REAL** (default-on) | To realny „AI signal", nie random; ograniczony pokryciem słownika |
| Lokalny model AI (NLI/LLM) | Transformers.js w offscreen: NLI DeBERTa (WASM) / LLM Granite/Gemma (WebGPU) | `assets/offscreen/offscreen.js:340,466,479,565,691` | **REAL** (off-by-default) | `aiModeEnabled:false`; wagi z HF (`env.allowRemoteModels=true`); LLM wymaga WebGPU |
| Floating window | Open Shadow DOM, karty z registry, uczciwe etykiety źródła | `src/content/floatingWindow.ts:107,141,359,614` | **REAL** | Pokazuje realne `model.mode`, nie canned text; „Głęboki skan" gated `aiModeEnabled` |
| Side panel | Renderuje per-tab `PageAnalysis` z message-bus | `src/sidepanel.tsx:37-141`; `background.ts:968-981` | **REAL** | Live update na `storage.onChanged` |
| Bionic Blur (fingerprint) | MAIN-world patch: navigator/UA/UA-CH/WebGL/canvas/audio/screen/timezone | `src/contents/bionic-blur-main.ts:505,537,683,720,788` | **REAL / PARTIAL** (default-on) | Spójność persony OK na warstwie JS; **luki**: `architecture:"x86"` też dla macOS, brak spoofu nagłówków HTTP UA/Sec-CH-UA |
| Bionic Blur (behawioralna) | Jitter myszy ±3px + jitter timestampów | `src/shared/bionicBlurCore.ts:320-362` | **SLOP** | `getCoarseTimestamp` bucketuje `floor(t/32)` → delty międzyzdarzeniowe zachowane → biometria klawiatury NIE maskowana |
| Digital Shadow Audit | Realny odczyt fingerprintu + szacunek entropii | `src/shared/shadowAudit.ts:98-152` | **REAL (odczyt) / HARDCODED (bity)** | Bity entropii to stałe literaturowe; uczciwie oznaczone „poglądowy" |
| Entropy Drop (przed/po) | Komponent persona-aware (czerwony vs zielony) | `src/components/ShadowAudit.tsx`; mount `dashboard.tsx:344` | **BROKEN** | `<ShadowAudit />` montowany **bez propsów** → zawsze tryb „auto" → zielony słupek/„−X bit" **nigdy się nie renderuje** |
| Virtual Identity (persony) | Selektor person → spoof fingerprintu na stronach | `src/components/VirtualIdentity.tsx`; `bionicBlurCore.ts:156-194` | **REAL** | Wybór persony realnie zmienia spoofowany profil (live, bez reloadu) |
| DataGhost (szum) | `fetch` no-cors/credentials:omit do DDG/Wiki/Google co 1 min | `src/background.ts:404-463` | **REAL mechanizm / OVERCLAIMED efekt** | Anonimowy wabik; NIE dotyka profilu cookie/server; README uczciwy |
| Privacy Score | Suma punktów za toggle + capped activity | `src/popup.tsx:72-92`; duplikat `dashboard.tsx:68-83` | **SLOP / FAKE-metric** | Nie mierzy prywatności; rośnie po włączeniu modułów i po kliknięciu „Testuj Honeypot" |
| Panic Button | `chrome.browsingData.remove({since:0})` wszystkie strony + reset stanu | `src/background.ts:251-321` `performPanicWipe` | **REAL** | Hold-to-fire; NIE czyści `storage.local` (zostają ustawienia/aliasy) |
| Crypto (AES-GCM/PBKDF2) | Poprawny WebCrypto AES-256-GCM, PBKDF2 310k, klucz w `storage.session` | `src/shared/crypto.ts:62-166`; `storage.ts:30-54` | **REAL ale niedoużyty** | Jedyny konsument = token API SimpleLogin; reszta danych = plaintext |
| Email alias (offline) | `cloak-<uuid8>@dagger.privacy` itd. | `src/shared/emailAlias.ts:96-113` | **PARTIAL / placeholder** | Niedostarczalne, zmyślone TLD; komentarz przyznaje „nie jest to prawdziwy adres" |
| Email alias (SimpleLogin) | Realny POST do `app.simplelogin.io` | `emailAlias.ts:47-85` | **PARTIAL** | Działa tylko gdy ustawiono token; w HEAD token zahardkodowany (patrz niżej) |
| CyberRadar | Canvas radar; bąble z realnych `HONEYPOT_ATTACK` | `src/components/CyberRadar.tsx:118-152` | **REAL (dane) / DEMO (animacja)** | `Math.random` tylko do pozycji bąbla, nie do istnienia |
| Logger / StatCards | Karmione realnymi `LOG_EVENT`/`STATE_UPDATE` | `dashboard.tsx:133-164`; `StatCards.tsx:47-87` | **REAL** | Etykiety StatCard mylą mechanizmy (poison vs blok) |
| Storage „secure core" | `panicButton/getModuleSettings/getPrivacyState/addLogEntry` | `src/shared/storage.ts:109-285` | **DEAD_CODE** | Zero importów; żywa apka używa raw `chrome.storage.local` |
| Duplikat silnika AI | `runModel/localLlm/localNli` w `src/shared/aiDeepDive/` | nieimportowane | **DEAD_CODE** | Duplikat `offscreen.js`; sugeruje (błędnie) inferencję w content-script |
| Build system | `plasmo build` → `build/chrome-mv3-prod` | exit 0 | **REAL** | `build/llm-*-profile` = śmieci (profile przeglądarki + token w cache) |
| Testy | 60/60 vitest; Playwright specs | wykonano | **REAL** | Testy nie pokrywają montażu ShadowAudit (fałszywie zielone) |
| Demo HTML | `cloak-and-dagger-preview.html` (mock), `bionic-blur-proof.html` (realny) | `demo/*` | **MOCKED / REAL** | Preview: `NOISE=128, TRACKERS=37` zahardkodowane; nie shipowany |
| Token API (leak) | `saveApiToken("simplelogin","bkfwey…")` | `src/background.ts:1003` (HEAD) | **BROKEN / LEAK** | Patrz „Technical Risk" |

---

## End-to-End Flows

### Flow 1  -  Wykrycie wrażliwej strony → odcięcie trackerów (RDZEŃ)
* **User action:** wejście na stronę o treści wrażliwej (np. depresja + długi). Bez żadnego toggla.
* **Code path:** `content.ts:109` → `contentEntry.ts:28` scheduler → `runAiDeepDiveScan` → `extractVisibleTextFromPage` → `classifyHeuristic` (`score.ts:27`) → `sendRuntimeMessage(result)` → `background.ts:627` `AI_DEEP_DIVE_RESULT` → `handleAiDeepDiveRiskResult` (`handleRiskResult.ts:76`) → `escalateTargetingForOrigin(level)` → `targetingShield.ts:218-266` DNR `block`.
* **Data input:** widoczny tekst strony (lokalnie, in-memory).
* **Processing:** heurystyka klastrowa PL/EN; high/critical (≥55) eskaluje.
* **Output:** reguły `block` na ~27 hostów ad/analytics dla tego origin; toast na stronie; karta w dashboardzie.
* **Dowód:** `score.ts:129-134` (poziomy), `targetingShield.ts:119-130` (`buildBlockRules`).
* **Works?** **TAK (default-on).** Heurystyka NIE jest gated `aiModeEnabled`.
* **Privacy value:** realne odcięcie sieci reklamowych na stronie o wrażliwym kontekście. Najmocniejszy, uczciwy element Kategorii 3.
* **Caveat:** lista hostów (nie „wszystkie trackery"); brak de-eskalacji; licznik dev-only.

### Flow 2  -  Lokalny Deep Scan AI (OPCJONALNY)
* **User action:** włącz „AI Deep-Dive" w dashboardzie → otwórz floating panel → „Głęboki skan".
* **Code path:** `floatingWindow.ts:694` `deepScan` → `deepScanClient.ts:16` `requestDeepScan` → `background.ts:918` `CND_DEEP_SCAN` → `ensureOffscreen` → `offscreen.js:340` → Transformers.js pipeline → fuzja → powrót do panelu.
* **Data input:** snippet tekstu strony (IPC, nie sieć).
* **Processing:** NLI zero-shot (WASM) lub LLM-JSON (WebGPU), on-device.
* **Output:** werdykt z etykietą źródła `lokalny NLI`/`lokalny LLM`, streaming.
* **Dowód:** `offscreen.js:565,691`; `verify-deep-scan.mjs:90-111` (asercja flip `heuristic→nli`).
* **Works?** **TAK, ale off-by-default + 180 MB-2.58 GB pobrania z HF + WebGPU dla LLM.**
* **Privacy value:** treść strony NIE opuszcza urządzenia (tylko wagi z HF). Dobre.

### Flow 3  -  Maskowanie fingerprintu (default-on)
* **Code path:** `content.ts:83` inject MAIN script → `bionic-blur-main.ts` patche → `bionicBlurCore.buildPrivacyProfile`.
* **Works?** **TAK na warstwie JS, spójnie (persona).** Behawioralna część (jitter timingów) praktycznie bezskuteczna (`floor(t/32)`).
* **Privacy value:** realne obniżenie linkowalności fingerprintu JS; **ale** nagłówki HTTP UA/Sec-CH-UA niespoofowane → mismatch server-side.

### Flow 4  -  Strip atrybucji + zatrucie ciasteczek (default-on)
* **Works?** **TAK.** `targetingShield` (param strip) + `cookieShredder` (rotacja) działają od instalacji. Realna Kategoria 3.

### Flow 5  -  Panic wipe
* **Works?** **TAK.** `performPanicWipe` → `browsingData.remove` wszystkie strony.

### Flow 6  -  Privacy Score
* **Works?** Liczy się, **ale nie mierzy prywatności**  -  gamifikowana suma. Patrz Claims Audit.

### Flow 7  -  Email alias
* **Works?** Domyślnie zwraca **niedostarczalny placeholder**. „Działający alias" wymaga tokenu SimpleLogin (którego UI nie pozwala wpisać; w HEAD zahardkodowany).

> **Wniosek:** istnieje **prawdziwy, działający end-to-end flow prywatnościowy** (Flow 1 + 3 + 4), domyślnie włączony, bez wysyłania treści poza urządzenie. To jest realny produkt ukryty pod warstwą marketingu.

---

## Claims Audit

| Claim | Safe? | Dowód | Problem |
| ----- | :----: | -------- | ------- |
| „Lokalny model AI klasyfikuje ryzyko prywatności strony" | **PARTIAL** | `offscreen.js:565,691`; `config.ts:17` | Off-by-default; wagi z HF; tylko re-rank po heurystyce |
| „Treść strony nie opuszcza urządzenia" | **SAFE** | grep fetch w `src`: tylko wabik/Wiki/GA/SimpleLogin, brak treści strony; `offscreen.js` IPC | Tylko wagi modelu z HF (nie treść) |
| „Blokujemy trackery na wrażliwych stronach (DNR)" | **PARTIAL** | `targetingShield.ts:119-130`; `handleRiskResult.ts:76` | Lista ~27 hostów, nie „wszystkie"; tylko high/critical; brak de-eskalacji |
| „Strip gclid/fbclid/utm + rotacja/zatrucie ciasteczek" | **SAFE** | `targetingShield.ts:102-117`; `cookieShredder.ts:99-202` | Default-on, realne; cookie poison łamie tylko korelację cookie |
| „Wykrywamy wrażliwe/profilujące strony i ostrzegamy" | **PARTIAL** | `score.ts:27`; `pageAlert.ts:5` | Default = keyword heuristic (nie AI); toast nie nazywa kategorii |
| „Audyt cienia cyfrowego  -  pomiar unikalności fingerprintu" | **PARTIAL** | `shadowAudit.ts:98-152` | Odczyt realny; bity entropii **zahardkodowane** (uczciwie oznaczone) |
| „Maskowanie spójne (UA = platforma + GPU)" | **PARTIAL** | `bionic-blur-main.ts:505,720`; `bionicBlurCore.ts:18-91` | Spójne na JS; `architecture:"x86"` dla macOS; brak spoofu nagłówków HTTP |
| „Anonimizujemy / zapobiegamy profilowaniu (DataGhost)" | **UNSAFE** | `background.ts:421-430` (własny komentarz) | Anonimowy wabik; nie dotyka profilu; README przyznaje |
| „Lokalne szyfrowanie chroni dane użytkownika at rest" | **UNSAFE** | `crypto.ts` + `emailAlias.ts:23` | Szyfruje **tylko** token API; reszta plaintext |
| „One-click działające aliasy e-mail" | **UNSAFE** | `emailAlias.ts:96-161` | Offline = niedostarczalny placeholder; brak UI na token |
| „Privacy Score = poziom ochrony prywatności" | **BULLSHIT** | `popup.tsx:72-92` | Wymyślona suma punktów + demo-button podbija licznik |
| „Maskujemy biometrię behawioralną (keystroke/mysz)" | **BULLSHIT** | `bionicBlurCore.ts:351-362` | Jitter `floor(t/32)` → delty zachowane → biometria nie ruszona |
| „Skończony produkt prywatnościowy end-to-end" | **UNSAFE** | dev-only DNR feedback + `debugger` + README limits | To działający POC dev/unpacked, nie produkt |
| „Entropy Drop pokazuje spadek unikalności po masce" | **UNSAFE** | `dashboard.tsx:344` mount bez propsów | Renderuje się tylko „auto" → zielony słupek nigdy nie pokazany |

---

## Technical Risk

* **🔴 LEAKED SECRET (krytyczne):** `src/background.ts:1003` w HEAD zawiera `saveApiToken("simplelogin","[redacted-simplelogin-token]")`. Potwierdzone: `git grep bkfwey HEAD:src/background.ts` = 1; commit `396bbb7` w historii; token obecny w `build/llm-demo-profile/.../ScriptCache` i `build/llm-verify-profile/.../ScriptCache`. **Usunięcie linii ze źródła NIE wystarczy**  -  token zostaje w historii git i artefaktach. Wymaga: **rewokacja w SimpleLogin** + purge historii + czyszczenie `build/`.
  > Uwaga proceduralna: podczas tego audytu subagent samodzielnie usunął token z working tree; **przywrócono `src/background.ts` do stanu z HEAD**, by audyt opisywał rzeczywisty (zacommitowany) stan i by zespół świadomie przeprowadził pełną rewokację.
* **🟠 Privacy paradox (optyka jury):** `<all_urls>` + content-script `document_start` + auto-skaner czyta tekst KAŻDEJ strony (lokalnie, `rawTextRetained:false`). Sensitive-page guard **nie chroni** auto-skanera (tylko floating window). Banking/medyczne strony-artykuły są skanowane heurystyką mimo deklaracji.
* **🟠 `debugger` permission:** maksymalne uprawnienie; używane tylko na `chrome:/edge:/about:/file:/data:/view-source:` (`debuggerTextExtraction.ts:37`), ale przy nawigacji na takie strony zaświeci żółty pasek „rozpoczęto debugowanie tej przeglądarki"  -  **psuje demo na żywo**.
* **🟠 Build/runtime AI:** LLM wymaga WebGPU; wagi 180 MB (NLI) / 250 MB (Granite) / 2.58 GB (Gemma) z HuggingFace przy 1. użyciu. Demo na żywo na słabym łączu = ryzyko. Bezpieczny tor demo: NLI.
* **🟡 Dev-only liczniki:** honeypot/targeting counters z `onRuleMatchedDebug` (`declarativeNetRequestFeedback`)  -  w buildzie spakowanym pokażą **0**, mimo działającego filtrowania. Demo musi być z unpacked/dev.
* **🟡 Performance:** auto-skan do 24×/stronę (`scanScheduler.ts`) + DataGhost co 1 min + cookieShredder co 1 min + rotacja honeypota co 1 min = sporo alarmów/CPU, ale ograniczone.
* **🟡 Bloat/hygiene:** `build/llm-*-profile/**` (pełne profile Edge/Chrome) w repo  -  śmieci + nośnik tokenu.
* **🟡 Dead code maskujący zakres:** `src/shared/aiDeepDive/{runModel,localLlm,localNli}.ts` (duplikat offscreen, sugeruje inferencję w content-script), `storage.ts` (panic/settings/state/log  -  0 importów), `reportPolicy.shouldSendAiDeepDiveReport` (zawsze `true`).

---

## Final Diagnosis

* **The real project is:** lokalna warstwa świadomości prywatności + realne odcinanie trackerów  -  czyta bieżącą stronę on-device, rozpoznaje kontekst podatny na profilowanie i na wrażliwych stronach **strippuje parametry atrybucji, zatruwa ciasteczka trackerów i blokuje hosty reklamowe per-origin**, z opcjonalnym lokalnym re-rankiem AI. Wszystko bez wysyłania treści strony poza przeglądarkę.
* **The fake project is:** „AI-powered system anonimizacji, który zatruwa Twój profil reklamowy, maskuje biometrię behawioralną i mierzy Twoją prywatność wynikiem"  -  Privacy Score, DataGhost-jako-anonimizacja, keystroke-masking i działające aliasy e-mail to teatr lub półprawdy.
* **The highest-value salvage path:** wyciąć/ukryć fałszywe metryki, podpiąć guard pod auto-skaner, naprawić token, i postawić demo na Flow 1 (wykrycie → odcięcie trackerów) + Flow 4 (strip/cookie) + opcjonalnie Flow 2 (lokalny NLI) jako „wisienka".
* **The one sentence pitch:** *„Cloak & Dagger to lokalna warstwa świadomości prywatności: czyta bieżącą stronę na urządzeniu, rozpoznaje treści podatne na profilowanie i na wrażliwych stronach realnie odcina trackery  -  strip parametrów atrybucji, zatrucie ciasteczek śledzących i blackout hostów reklamowych  -  bez wysyłania treści strony poza przeglądarkę."*
