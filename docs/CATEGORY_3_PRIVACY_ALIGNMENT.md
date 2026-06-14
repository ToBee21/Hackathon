# Category 3 Privacy Alignment  -  Cloak & Dagger

> Czy ten kod naprawdę pasuje do kategorii hackathonu? Ocena wyłącznie wg kodu.
> Powiązane: [HACKATHON_REPO_TRUTH_AUDIT.md](./HACKATHON_REPO_TRUTH_AUDIT.md), [SLOP_KILL_LIST.md](./SLOP_KILL_LIST.md).

---

## Category Definition

**PRYWATNOŚĆ I SUWERENNOŚĆ DANYCH**

> Anti-tracking, anonimizacja danych, audyt „cieni cyfrowych", filtrowanie agresywnego targetowania.

Kategoria 3 nagradza: realną ochronę prywatności, kontrolę użytkownika nad własnymi danymi, zrozumienie własnego śladu cyfrowego, ograniczanie śledzenia/profilowania, filtrowanie agresywnego targetowania, zapobieganie spamowi informacyjnemu/manipulacji. **Nie** nagradza „ładnego produktu AI".

---

## What Judges Will Probably Reward

| Kryterium (przypuszczalna wartość dla jury) | Czy repo to dowozi? |
| --- | --- |
| Realna ochrona prywatności (a nie atrapa) | **TAK**  -  strip atrybucji + cookie poison + blackout hostów (DNR) działają |
| Architektura local-first | **TAK, mocno**  -  inferencja AI on-device, treść strony nie wychodzi; stan w `chrome.storage.local` |
| Przejrzysta kontrola użytkownika | **CZĘŚCIOWO**  -  toggle modułów, persony, Panic Button są realne; ale część metryk myli |
| Widoczny audyt śladu cyfrowego | **CZĘŚCIOWO**  -  realny odczyt fingerprintu; bity entropii zahardkodowane; Entropy Drop nie renderuje |
| Wytłumaczalna detekcja (explainability) | **TAK**  -  heurystyka z `evidenceTags`/kategoriami; karty uczciwie podają źródło (`heurystyka/NLI/LLM`) |
| Minimalne uprawnienia | **NIE**  -  `<all_urls>` + `debugger` + 12 permissions to przeciwieństwo minimalizmu |
| Brak „magii AI" | **CZĘŚCIOWO**  -  AI jest realne, ale off-by-default; trzeba uczciwie mówić „heurystyka domyślnie, AI opcjonalnie" |
| Natychmiastowa jasność demo | **RYZYKO**  -  `debugger` banner, 180 MB+ pobranie, dev-only liczniki, fałszywy Privacy Score |
| Mierzalna wartość przed/po | **SŁABO**  -  Entropy Drop zepsuty; Privacy Score nie jest pomiarem |

**Wniosek:** repo trafia w 3 z 4 filarów kategorii (anti-tracking, audyt cienia, filtrowanie targetowania), słabo w „anonimizację" (to akurat część fałszywa/przereklamowana). Najmocniejsze, gdy mówimy o **filtrowaniu agresywnego targetowania + lokalnym audycie**, nie o anonimizacji.

---

## Alignment Matrix

| Wymóg kategorii | Wsparcie w repo | Dowód | Score 0-5 | Fix |
| -------------------- | ---- | -------- | --------: | ---------- |
| **Anti-tracking** | Cookie poison + blackout hostów + strip atrybucji, default-on, realny DNR | `cookieShredder.ts:99-202`, `targetingShield.ts:102-130` | **4** | Dodać de-eskalację; uczciwy licznik w prod (nie tylko dev) |
| **Anonimizacja danych** | DataGhost = anonimowy wabik bez wpływu na profil; fingerprint mask spójny ale niepełny (nagłówki HTTP) | `background.ts:421-430`; `bionic-blur-main.ts:505` | **2** | Przestać nazywać to „anonimizacją"; ewentualnie spoofować Sec-CH-UA |
| **Audyt cienia cyfrowego** | Realny odczyt fingerprintu; bity entropii hardcoded; Entropy Drop nie renderuje | `shadowAudit.ts:98-152`; `dashboard.tsx:344` | **2.5** | Naprawić mount ShadowAudit (przekazać `profileId`); etykietować jako „poglądowy" |
| **Filtrowanie agresywnego targetowania** | Strip `gclid/fbclid/utm` + per-origin blackout ad/analytics eskalowany z detekcji | `targetingShield.ts:35-43,218-266`; `handleRiskResult.ts:76` | **4** | Rozszerzyć listę hostów; pokazać „co odcięto" |
| **Kontrola nad danymi** | Toggle modułów (persistowane + działające), persony, Panic Button, model picker | `popup.tsx:216-228`; `performPanicWipe` `background.ts:251` | **3.5** | Naprawić martwy model-picker w dashboardzie; usunąć martwe ścieżki |
| **Local-first processing** | Inferencja on-device (WASM/WebGPU); treść nie wychodzi; stan lokalny | `offscreen.js:565,691`; `deepScanClient.ts:16` | **4.5** | Tylko wagi z HF  -  dopowiedzieć przy demo |
| **Transparentność prywatności** | `rawTextRetained:false`, `urlHash` (FNV, nie raw URL), uczciwe etykiety źródła | `score.ts:51-53`; `normalize.ts:20`; `floatingWindow.ts:614` | **4** | Usunąć przereklamowane stringi (Max Camo w toaście, StatCard labels) |
| **Explainability** | Heurystyka z `evidenceTags`/kategoriami; karta podaje źródło werdyktu | `aiProfilingDetector.ts:39-60`; `score.ts:143` | **3.5** | Pokazać konkretny term/sygnał, nie tylko tag klastra |
| **Niski footprint uprawnień** | `<all_urls>` + `debugger` + 12 permissions | `package.json:40-57` | **1** | Rozważyć usunięcie `debugger`/`privacy` na demo; uzasadnić każde |
| **Demo impact** | Realny rdzeń, ale fałszywy score, dev-only liczniki, debugger banner | wyżej | **3** | Tor demo „bezpieczny" (zob. JURY_SAFE_DEMO_SCRIPT) |

**Średnia ważona: ~3.1/5.** Rdzeń (anti-tracking + filtrowanie targetowania + local-first) jest mocny (4-4.5); kotwicą w dół są: anonimizacja (fałszywa), footprint uprawnień, i zepsute/fałszywe metryki.

---

## Core Product Thesis

To **nie** jest adblocker i **nie** jest „AI, które anonimizuje użytkownika".

> **To lokalna warstwa świadomości prywatności i odcinania trackerów.** Czyta bieżącą stronę na urządzeniu, rozpoznaje kontekst podatny na profilowanie (zdrowie psychiczne, długi, sprawy medyczne/prawne, uzależnienia), wyjaśnia jaki „cień cyfrowy" może powstać, i na wrażliwych stronach **realnie odcina agresywny tracking**: zdejmuje parametry atrybucji (`gclid/fbclid/utm`), zatruwa ciasteczka śledzące i blokuje hosty reklamowe dla tego origin  -  a opcjonalnie potwierdza ryzyko lokalnym modelem AI (NLI/LLM bez wysyłania treści poza przeglądarkę).

Ta teza jest w 100% poparta kodem (Flow 1+2+4 z audytu). To uczciwa, mocna wersja  -  w przeciwieństwie do „zatruwamy Twój profil reklamowy i anonimizujemy Cię".

---

## What To Stop Building

| Feature | Dlaczego niska wartość | Dlaczego pachnie AI-slopem | Czym zastąpić |
| --- | --- | --- | --- |
| **Privacy Score jako „poziom ochrony"** | Nie mierzy prywatności; rośnie po toggle i po demo-buttonie (`popup.tsx:72-92`) | Ładny gauge nad wymyśloną liczbą | Etykieta „Active defenses: X/6 ON" lub realny licznik „odciętych beaconów na tej stronie" |
| **DataGhost jako „anonimizacja/zatruwanie profilu"** | Anonimowy wabik, zero wpływu na profil cookie/server (`background.ts:421-430`) | „Generujemy szum, by zmylić AI marketingowe"  -  klasyczny obfuscation-mit (TrackMeNot/AdNauseam) | Zostawić jako „network decoy (auxiliary)" albo wyłączyć w demo |
| **Maskowanie biometrii behawioralnej** | Jitter `floor(t/32)` nie rusza delt → biometria zachowana (`bionicBlurCore.ts:351`) | „Niszczymy keystroke dynamics Perlin-noisem" | Albo naprawić (realny per-event jitter), albo nie obiecywać |
| **Aliasy e-mail (offline)** | Niedostarczalne placeholdery `@dagger.privacy` (`emailAlias.ts:96`) | „One-click anonimowy e-mail" | Albo realna integracja SimpleLogin z polem na token w UI, albo oznaczyć jako „form-noise/decoy" |
| **`debugger` permission** | Skanuje tylko `chrome:/file:/`, ale daje żółty banner i maksymalny trust | „Czytamy każdą stronę" optycznie | Usunąć z demo; pokrycie stron restricted nie jest wartością Kat. 3 |
| **Duplikat silnika AI w `src/`** | `runModel/localLlm/localNli` nieimportowane (`offscreen.js` to robi) | Sztucznie powiększa „AI codebase" | Skasować |

---

## What To Double Down On

1. **Targeting Shield (strip atrybucji + per-origin blackout)**  -  *wartość:* realne filtrowanie agresywnego targetowania, rdzeń Kat. 3. *Stan:* REAL, default-on (`targetingShield.ts`). *Next:* pokazać użytkownikowi listę „co odcięto na tej stronie" + dodać de-eskalację, gdy ryzyko spada.
2. **Cookie Shredder**  -  *wartość:* łamie korelację cookie między wizytami; bezpieczny (whitelist). *Stan:* REAL, default-on (`cookieShredder.ts`). *Next:* licznik „rotacji" widoczny + uczciwy opis (łamie tylko korelację cookie).
3. **Lokalny detektor wrażliwego kontekstu (heurystyka + opcjonalny NLI on-device)**  -  *wartość:* „rozumie" stronę bez chmury, wyjaśnia ryzyko, eskaluje obronę. *Stan:* REAL heurystyka default-on; NLI opcjonalny, local. *Next:* w toaście/karcie nazywać kategorię + konkretny sygnał (explainability).
4. **Local-first / no-egress**  -  *wartość:* twardy argument suwerenności danych. *Stan:* REAL (`rawTextRetained:false`, `urlHash`, IPC). *Next:* dopowiedzieć „jedyny ruch sieciowy AI = jednorazowe wagi z HF", reszta on-device.
5. **Digital Shadow Audit (odczyt fingerprintu)**  -  *wartość:* uświadamia użytkownikowi jego ślad; idealne pod „audyt cieni cyfrowych". *Stan:* odczyt REAL, scoring poglądowy, Entropy Drop zepsuty. *Next:* naprawić mount (`<ShadowAudit profileId=... />`) lub przenieść do popupu, gdzie żyje stan persony.
