# PrivacyMyst — Hierarchiczny plan gry zespołu

> Dokument operacyjny na prezentację hackathonową. Prawda ponad hype.
> Każde twierdzenie ma pokrycie w plikach repo. Twierdzenia oznaczone
> `[OVERSTATED]` / `[FALSE]` wolno wypowiadać **tylko** w bezpiecznej formie
> podanej w rejestrze ryzyk (sekcja 5).

---

## 1. Hierarchia zespołu

Cztery równoległe strumienie pracy, cztery liderzy. Każda osoba **POSIADA** jeden
obszar end-to-end. Uchwyty git są zmapowane na ludzi — to NIE są osobni członkowie
zespołu.

```
                          PrivacyMyst
                 (lokalna inteligencja prywatności)
                              │
        ┌─────────────────┬───┴────────┬──────────────────┐
        │                 │            │                  │
   ┌────┴─────┐     ┌──────┴────┐  ┌────┴─────┐      ┌─────┴────┐
   │  HUBERT  │     │  KACPER   │  │ KRYSTIAN │      │ BARTOSZ  │
   │ Architekt│     │ Integrator│  │  Active  │      │  Pitch / │
   │  + AI    │     │ + Wizualny│  │  Defense │      │  Warstwa │
   │ Runtime  │     │  przepływ │  │  + Demo  │      │  obrony  │
   └────┬─────┘     └─────┬─────┘  └────┬─────┘      └────┬─────┘
        │                 │             │                 │
  OWNS: lokalny      OWNS: CyberRadar  OWNS: Honeypot   OWNS: hero/
  runtime AI         (wizualizacja),   Trap (DNR data   pitch decku +
  (offscreen +       Secure Core       poisoning),      strona
  transformers.js),  (AES-GCM/PBKDF2), Virtual Identity prezentacji,
  AI Deep-Dive,      Panic Button,     Studio, DataGhost flow wystąpienia,
  vision ad-blur,    typy/STORAGE_KEYS bias engine,     backup demo.
  Data Vault,        (klej integ.),    Privacy Dashboard Backend modułów
  FileInspect,       alias e-mail      shell (Moduł C), obrony: Targeting
  legal/licenses.    (fundament).      3D persona.      Shield, Cookie
                                                        Shredder, dashboard
                                                        full-screen.
```

### Mapa uchwytów git → ludzie

| Osoba | Uchwyty git | E-mail commitowy | Rola |
|---|---|---|---|
| **Hubert** | `GlazowanyPager` (`glazownaypager` = 0 commitów) | serwis072025@outlook.com | Architektura, AI Deep-Dive, lokalny runtime (offscreen/transformers.js), sygnały dowodowe, wiarygodność techniczna |
| **Kacper** | `Makaren337` | bcieslarek33@gmail.com | Cyber radar, integracja modułów, wizualny przepływ ryzyka, Secure Core, porządki w repo |
| **Krystian** | `Krystian` | nowakkrystian000@gmail.com | Honeypot Trap, declarativeNetRequest / zatruwanie danych, mechanika anty-trackingu, demo na żywo |
| **Bartosz** | `szalik` | kacpermr27@gmail.com | Strona prezentacji, dopracowanie wizualne, flow wystąpienia, eksport/backup demo + backend modułów obrony |

> **UWAGA na pułapki tożsamości:**
> - `glazownaypager` (małe litery) ma **0 commitów** — cała praca Huberta jest pod `GlazowanyPager`. To jeden człowiek.
> - `szalik` to **Bartosz** (e-mail `kacpermr27@gmail.com`), a NIE Krystian. `targetingShield.ts`, `cookieShredder.ts`, dashboard full-screen i rework `emailAlias.ts` należą do Bartosza, mimo że tematycznie to „anty-tracking".
> - `Makaren337` to **Kacper** (e-mail `bcieslarek33@gmail.com`). Pierwotnie scaffoldował CyberRadar i emailAlias; Bartosz później je przerobił — `git blame` na bieżącym drzewie nadal przypisuje bryłę CyberRadar/crypto/storage Kacprowi.
> - `ToBee` / `ToBee21` to konto GitHub org/scalające PR-y (3 commity, wszystkie „Merge pull request", 0 commitów non-merge) — NIE jest osobnym członkiem zespołu.

---

## 2. Sekcje per-osoba

### 2.1 Hubert — Architektura + lokalny runtime AI

**Zakres:** całość warstwy AI/runtime i kręgosłup architektoniczny. ~27 commitów
non-merge (wszystkie 2026-06-13/14). Większościowy autor `background.ts` (13 z 20
commitów dotykających pliku) i jedyny autor runtime offscreen.

**Pliki / moduły (repo):**
- `assets/offscreen/offscreen.js` (1662 linii — jedyny autor, 5 commitów) — runtime transformers.js, wybór WebGPU/WASM, rejestracja modeli, bramka prywatności `env.allowRemoteModels = false` (linie **920–921**, **1077–1078**), handler inferencji i wizji.
- `src/shared/aiDeepDive/*` — rejestr modeli (`models.ts:41–80`, trzy aktywne: `nli-deberta-small`, `gemma-3-1b`, `qwen3-5-08b`), `contextEngineering.ts` (opakowanie niezaufanego tekstu strony), `localNli.ts`, `localLlm.ts`, `score.ts`, `gate.ts`.
- `src/shared/vision/adImageScan.ts` + `src/contents/vision-ad-blur.ts` — wizyjny bloker reklam. Wizja działa lokalnie z wbudowanych wag q4f16 (`assets/models/smolvlm-256m/onnx/`, ~185 MB) w workerze offscreen (`VISION_LOCAL_ID="smolvlm-256m"`, `AutoModelForImageTextToText`, `allowRemoteModels=false`); obrazy renderowane do PNG dataURL — nigdy nie pobierane z sieci, a reklamy dostają odwracalne rozmycie. Jedyny uczciwy caveat: wagi są git-ignored (`.gitignore: /assets/models/*/`), więc są na maszynie demo, ale mogą być nieobecne w udostępnionym/opublikowanym snapshocie — zawsze miej `docs/proof/04-vision-adblock.png` jako backup; druga uwaga to dostępność WebGPU.
- `src/background.ts` — orkiestracja offscreen (`ensureOffscreen` / `inferInOffscreen`, magistrala wiadomości).
- `src/shared/dataExport/buildExport.ts` — Data Vault: lokalny eksport JSON z rekurencyjną redakcją sekretów.
- `src/shared/fileInspect/*` — FileInspect Stage-1 (magic-bytes / PDF / Office-ZIP).
- `src/security/*` — warstwa bezpieczeństwa (jedyny autor): `networkPolicy.ts` (`defaultNetworkSilent: true`), `privacyGuards.ts` (`FORBIDDEN_LOG_FIELDS` — 20 pól), `validateMessage.ts` (allowlista `CND_*` — 12 typów + sender-trust), `limits.ts`, `safeRender.ts`, `storageSchema.ts`.
- `src/shared/blocklist/*` — warstwa blocklisty (jedyny autor): `secureUpdater.ts` (Ed25519 + anti-rollback + size-anomaly), `bundleSchema.ts`, `baselineBundle.ts`, `riskAdaptiveBlocking.ts`, `index.ts`, `allowlist.ts`.
- `THIRD_PARTY_LICENSES.md`, `NOTICE`, `licenses/`, `src/tabs/licenses.tsx`, `src/shared/attributions.ts` — audyt licencji + ekran Licencje.
- `src/components/AiDeepDiveCard.tsx` — UI werdyktu + ekran zgody Gemma.

**Dowody z commitów:**
- `692613c` — local AI stack (Gemma/Qwen/NLI offscreen) + AI vision ad-blocker + full legal/attribution.
- `9c8f109` — Data Vault local export JSON + regression suites.
- `40312d2` — AI Deep-Dive działający lokalny NLI/LLM offscreen floating window.
- `91c2f8b`, `dbf3eb2`, `173a939`, `984f70a`, `c0b5c04`, `3298f75`, `8dd4ce0` — kolejne hardeningi parsowania/runtime/smoke.
- `dbb5d24`, `ca95946` — warstwa Bionic Blur jako sygnał dowodowy.

**Dowód weryfikowalny:** `npx vitest run` (suity data-export/vision/fileInspect + aiDeepDive context/LLM/NLI/score). Zrzuty: `docs/proof/03-ai-deepdive-llm-verdict.png`, `04-vision-adblock.png`. Skrypty: `scripts/verify-vision-e2e.mjs`, `scripts/bench-sensitivity.mjs`.

---

### 2.2 Kacper — Integracja + wizualny przepływ ryzyka

**Zakres:** warstwa wizualizacji ryzyka (CyberRadar), bezpieczny rdzeń szyfrujący
(Moduł D) i klej integracyjny (typy + STORAGE_KEYS), dzięki któremu cztery strumienie
gadają ze sobą. 3 commity non-merge dostarczające dwie rzeczy.

**Pliki / moduły (repo):**
- `src/components/CyberRadar.tsx` — animowany radar Canvas 2D, zero zależności, pętla `requestAnimationFrame`. Na bieżącym drzewie `git blame` przypisuje ~469/512 linii Kacprowi (Bartosz później ewoluował spawn blipów na realne zdarzenia honeypota).
- `src/shared/crypto.ts` — AES-GCM-256 + PBKDF2 (310 000 iteracji, OWASP); ~158/175 linii.
- `src/shared/storage.ts` — `saveEncrypted`/`loadEncrypted` + Panic Button deep-wipe (`chrome.browsingData`); ~243/285 linii.
- `src/shared/emailAlias.ts` — fundament aliasu e-mail (SimpleLogin + fallback offline); później mocno przerobiony przez Bartosza.
- `src/types.ts` — system typów Moduł D + centralna mapa `STORAGE_KEYS` (klej integracyjny).
- `package.json`, `tsconfig.json`, tailwind/postcss — scaffolding build/config.

**Dowody z commitów:**
- `0a20e9a` — Wersja 1.2 Moduł D; `3e3e0d0` — Wersja 1.2.1 Moduł D (Secure Core + Panic Button + alias + typy).
- `cef2e2c` — cyberradar (pierwotny scaffold CyberRadar).

**Dowód weryfikowalny:** zakładka Dashboard z żywym CyberRadarem; Panic Button na żywo (DevTools → Application: cookies/storage przed i po). `npx vitest run` (m.in. redakcja eksportu/szyfrowanie).

---

### 2.3 Krystian — Active Defense + demo na żywo

**Zakres:** warstwa „aktywnej obrony" anty-trackingowej — zatruwanie danych zamiast
samego blokowania. Najwyraźniejsze dopasowanie roli do kodu. Plus shell Privacy
Dashboard (Moduł C) i kreator Wirtualnej Tożsamości.

**Pliki / moduły (repo):**
- `src/shared/honeypot.ts` — flagowy moduł. DNR `redirect` + `queryTransform.addOrReplaceParams` nadpisuje parametry 5 rodzin trackerów (GA, Meta Pixel, TikTok, Hotjar, DoubleClick); generator sprzecznego profilu (linie **169–209**); rotacja co minutę przez `chrome.alarms` (`ROTATE_INTERVAL_MINUTES = 1`, linie **458–474**); most logujący `onRuleMatchedDebug` (linie **363–384**); self-test `TRIGGER_HONEYPOT_TEST`.
- `src/shared/virtualIdentityStudio.ts` — 8 archetypów person → spójny fingerprint sprzętowy + tematy szumu DataGhost (czysta logika).
- `src/shared/dataGhost/keywordBatch.ts` + `keywordPool.ts` — silnik szumu z biasem 70% w stronę wybranych zainteresowań, deduplikacja kategorii/fraz.
- `src/components/StlModelViewer.tsx` — obracający się model 3D „babci" (three.js, lazy-load).
- Privacy Dashboard / popup shell, toggles modułów, logger, wykres score (Moduł C).
- `src/types.ts` — kontrakty wiadomości/typów honeypota.

**Dowody z commitów:**
- `25c1ab5` — implement Honeypot Trap with declarativeNetRequest data poisoning.
- `4e94533` — kreator Wirtualnej Tożsamości + szum DataGhost wg zainteresowań.
- `88fc88d` — Scal Moduł A z Modułem C (DataGhost → Privacy Dashboard).
- `8e505dd` Wersja 1.0 Moduł C; `2529ee0` HoneyPot dodany do menu; `ddfde0c` model 3D babci; `c9a4758` drobne powiadomienie o ryzyku.

**Dowód weryfikowalny:** Dashboard z licznikiem „Trackery zmylone" + Logger; trigger honeypota (realny beacon lub self-test). `npx vitest run tests/virtualIdentityStudio.test.ts tests/dataGhostKeywordBatch.test.ts`.

> Caveat własnościowy: `honeypot.ts` dostał później hardening od `GlazowanyPager`, ale pierwotna implementacja jest Krystiana.

---

### 2.4 Bartosz — Pitch + warstwa obrony + strona

**Zakres:** warstwa user-facing (dashboard, menu, strona prezentacji) ORAZ backendowe
moduły obrony sieciowej. 7 commitów non-merge. Uwaga: to NIE są tylko slajdy — Bartosz
napisał realne moduły DNR.

**Pliki / moduły (repo):**
- `src/shared/targetingShield.ts` (420 linii) — DNR stripping parametrów atrybucji (gclid/fbclid/utm_*) + „total blackout" znanych hostów targetujących per-origin, gdy AI flaguje stronę high/critical (`escalateTargetingForOrigin`, ~linia **223**).
- `src/shared/cookieShredder.ts` (253 linie) — co minutę format-aware zatruwanie ciasteczek trackerów (`_ga`, `_fbp`, `_uetsid`, `MUID`, `_hj*`) — nadpisuje tylko segmenty identyfikujące, login/sesja/consent nietknięte.
- `src/tabs/dashboard.tsx` — pełnoekranowa zakładka Dashboard.
- `src/components/CyberRadar.tsx` — ewolucja spawnu blipów na realne zdarzenia honeypota (brak losowych blipów).
- `src/shared/emailAlias.ts` (rework) — SimpleLogin API + szyfrowane przechowywanie tokenu + fallback offline.
- `src/popup.tsx`, `src/background.ts` — rework menu/nawigacji + wiring Moduł A.
- `site-launch/privacymyst/index.html` (+ `app.js`, `mist.js`, `styles.css`) — landing PrivacyMyst, sekcja Live Demo; prosty wariant `site/index.html`.

**Dowody z commitów:**
- `db1ee8e` — odcinanie trackerów na wrażliwych stronach i id kliknięć (Targeting Shield).
- `9dd84dc` — zatruwanie cookies (Cookie Shredder).
- `a85b4f3` — cyber radar zakładka pełny ekran; `473373d` — poprawiony dashboard.
- `396bbb7` — email alias (rework); `555bc7e` — poprawione menu; `a11bccd` — Wersja 1.1 Moduł A.

**Dowód weryfikowalny:** strona z parametrami trackingu → logi `[TargetingShield]` w konsoli SW + licznik; rotacja Cookie Shredder w DevTools → Application → Cookies. Landing `site-launch/privacymyst/index.html` jako samowystarczalne, animowane demo (z disclaimerem „Illustrative recreation").

---

## 3. Mapowanie osoba → sekcja decku

| Sekcja decku | Owner | Treść | Kluczowy dowód na ekranie |
|---|---|---|---|
| **hero** | Bartosz | Teza „Prywatność liczona lokalnie" + KPI 27× | `training/README.md:47–48`; `src/security/networkPolicy.ts:12` |
| **problem** | Krystian | Dlaczego analiza prywatności w ogóle ma opuszczać urządzenie? | `src/security/networkPolicy.ts:11–16`; `models.ts:41–80` |
| **architecture** | Hubert | Heurystyka → bramka → lokalne modele w workerze offscreen | `gate.ts:9–16`; `offscreen.js:1077`; `models.ts:41–80` |
| **data** | Hubert | Liczby: 27×, 4,4 ms/strona, 3 modele lokalne | `training/README.md:47–48`; `models.ts:41–80` |
| **code** | Hubert | Granica zaufania: strona nigdy nie dotyka modelu | `offscreen.js:1074–1085`; `localNli.ts:96–111` |
| **engine** | Kacper | Silnik jako zintegrowana całość (prezentacja zespołowa) | `gate.ts:9–16`; `models.ts:41–80`; `offscreen.js:1074–1085` |
| **features** | Kacper | Trzy warstwy obrony z perspektywy użytkownika | `models.ts:41–80`; `honeypot.ts:67–94`; `src/security/networkPolicy.ts:12` |
| **pitch** | Bartosz | „Lokalne modele. Realna ochrona. Zero chmury." | `localNli.ts:216`; `src/security/networkPolicy.ts:12` |

> Kluczowe demo rozszerzenia (AI Deep-Dive na żywo) prowadzi **Hubert** — to jego runtime.
> Bartosz domyka pitch i przełącza na landing jako backup, jeśli WebGPU/Edge padnie.

---

## 4. Plan wykonania (timeline T-minus) i zależności

### Strumienie i zależności

```
Hubert (runtime AI) ──────────────► flaguje high/critical ──► Bartosz (Targeting Shield escalation)
        │                                                          │
        ▼                                                          ▼
   werdykt JSON ──► AiDeepDiveCard                          Cookie Shredder (niezależny timer)
                                                                   │
Krystian (Honeypot) ──► zdarzenia HONEYPOT_ATTACK ──► Kacper (CyberRadar wizualizacja) ◄── DataGhost noise (Krystian)
        │                                                   │
        ▼                                                   ▼
   licznik "Trackery zmylone"                        Dashboard full-screen (Bartosz)

Kacper (types.ts + STORAGE_KEYS) ──► KLEJ: wszystkie moduły używają wspólnych kluczy
```

**Twarde zależności (jeśli to padnie, padają downstream):**
1. `src/types.ts` + `STORAGE_KEYS` (Kacper) — wszystkie moduły. **Musi być spójne pierwsze.**
2. Werdykt AI high/critical (Hubert) → eskalacja Targeting Shield (Bartosz). Bez AI shield strippuje tylko parametry, bez blackoutu.
3. Zdarzenia `HONEYPOT_ATTACK` (Krystian) → blipy CyberRadar (Kacper/Bartosz). **Bez realnych zdarzeń radar jest pusty** — użyć self-test honeypota, by zasilić demo.
4. Magistrala wiadomości offscreen (Hubert, `background.ts`) — cała inferencja AI.

### Timeline T-minus

| Czas | Zadanie | Owner | Blokuje |
|---|---|---|---|
| **T-3h** | Pełny build + load w Edge (Chrome 149 blokuje `--load-extension`); smoke wszystkich modułów | wszyscy | całość demo |
| **T-3h** | `npx vitest run` zielony (≈297 testów zielonych, ~10 s wall-clock; 44 pliki) | Hubert | dowód awaryjny |
| **T-2h30** | AI Deep-Dive odpala lokalny NLI na wrażliwej stronie; werdykt JSON w karcie | Hubert | sekcje architecture/data/code |
| **T-2h30** | Smoke-test wizji na żywo (`scripts/verify-vision-e2e.mjs`) — lokalny SmolVLM-256M rozmywa reklamę z wbudowanych wag | Hubert | sekcja vision / features |
| **T-2h30** | Honeypot self-test produkuje wpis logu + inkrement licznika | Krystian | sekcja problem, radar |
| **T-2h** | CyberRadar reaguje na realne zdarzenia honeypota (nie losowe blipy) | Kacper + Krystian | sekcje engine/features |
| **T-2h** | Panic Button czyści cookies/storage na żywo | Kacper | sekcja features |
| **T-1h30** | Targeting Shield: logi strip + blackout na high-risk origin | Bartosz | dowód obrony |
| **T-1h30** | Cookie Shredder: rotacja wartości w DevTools | Bartosz | dowód obrony |
| **T-1h** | Landing `site-launch/privacymyst/index.html` otwarty lokalnie jako backup | Bartosz | fallback demo |
| **T-1h** | Zrzuty `docs/proof/01–06` pod ręką (popup, licenses, AI verdict, vision, dashboard) | Bartosz | fallback wszystkich |
| **T-30min** | Próba generalna pitchu: hero → problem → architecture/data/code → engine/features → pitch | wszyscy | flow wystąpienia |
| **T-15min** | Kluczowy model = NLI DeBERTa na WASM (nie wymaga WebGPU) ustawiony jako domyślny | Hubert | bezpieczeństwo demo na dowolnym sprzęcie |

---

## 5. Rejestr ryzyk

Twierdzenia zweryfikowane przez audyt. Forma „BEZPIECZNIE" jest **jedyną** dozwoloną
na scenie dla pozycji oznaczonych `[OVERSTATED]` / `[FALSE]`.

| # | Twierdzenie | Werdykt | Forma BEZPIECZNA (mów tak) |
|---|---|---|---|
| R1 | „4 modele AI bundlowane" | `[OVERSTATED]` | „**3 modele** aktywnie używane w runtime: NLI DeBERTa, Gemma 3 1B, Qwen3.5 0.8B. SmolVLM-256M i zdestylowany MiniLM są spakowane/skredytowane, ale nie w selektorze runtime." |
| R2 | „100% offline / 0 połączeń sieciowych nigdy" | `[OVERSTATED]` | „Wszystkie trzy zarejestrowane modele (NLI DeBERTa, Gemma 3 1B, Qwen3.5 0.8B) działają z wbudowanych lokalnych wag, `allowRemoteModels=false`; gałąź zdalnego pobierania w `localLlm.ts` dotyczy tylko hipotetycznego modelu bez `localModelId`, którego nie ma w buildzie. Polityka sieci domyślnie cicha; jedyne wyjścia to **podpisany Ed25519** bundle blocklisty (auto na timerze) i SimpleLogin na wyraźną akcję użytkownika." |
| R3 | „CND_* allowlist (13 typów) + sender trust na każdej wiadomości" | `[FALSE]` | „**12** typów CND_*. Sender-trust (`sender.id === chrome.runtime.id`) egzekwowany tylko na **podzbiorze** typów w tle (nie na wszystkich 12 — `CND_VISION_INFER` i typy wyłącznie wychodzące różnią się); offscreen waliduje payload, nie nadawcę. Granica jest **częściowa** — izolacja przez osobny kontekst + walidacja, nie pełna weryfikacja nadawcy." |
| R4 | „Honeypot blokuje trackery / kasuje profil reklamowy" | `[OVERSTATED]` | „Honeypot **zatruwa parametry** profilujące 5 rodzin trackerów, nie blokuje zbierania i nie kasuje profilu po stronie serwera. Bounded noise, nie atak na infrastrukturę." |
| R5 | „SmolVLM wizja działa na żywo" | `real` | „Wizja działa lokalnie z wbudowanych wag q4f16 w workerze offscreen (`VISION_LOCAL_ID="smolvlm-256m"`, `AutoModelForImageTextToText`, `allowRemoteModels=false`), obrazy renderowane do dataURL — nigdy nie pobierane z sieci. Jedyny uczciwy caveat: wagi są git-ignored (`.gitignore: /assets/models/*/`), więc są na maszynie demo, ale mogą być nieobecne w udostępnionym/opublikowanym snapshocie — miej `docs/proof/04-vision-adblock.png` jako backup; druga uwaga to dostępność WebGPU." |
| R6 | „27× szybciej, 4,4 ms/strona" | `real` | Mów śmiało: „zmierzone w transformers.js int8/CPU; 119 ms → 4,4 ms; udokumentowane `training/README.md:47–48`, odtwarzalne `scripts/bench-sensitivity.mjs`." Dodaj: korpus seedowany/szablonowy, nie crawl produkcyjny. |
| R7 | „22,7M param. zdestylowany klasyfikator" | `real` | Mów śmiało. Caveat: **nie jest jeszcze wpięty do rozszerzenia** — to benchmark treningowy, nie ścieżka produkcyjna. |
| R8 | „13 uprawnień manifestu = least-privilege" | `[OVERSTATED]` | „**14 jawnie zadeklarowanych uprawnień** (storage, browsingData, cookies, history, alarms, tabs, debugger, scripting, privacy, declarativeNetRequest, declarativeNetRequestFeedback, sidePanel, contextMenus, offscreen); szerokie `host_permissions` (`http://*/*` + `https://*/*`), `debugger` i `privacy` są mocne, ale wymagane do analizy każdej strony — to nie jest twardy least-privilege." |
| R9 | „23 parametry + 17 hostów blokowanych" | `[OVERSTATED]` | „**35 parametrów** trackingu i **27 hostów** targetujących (gclid, fbclid, utm_*, doubleclick.net, google-analytics.com, facebook.com...)." |
| R10 | „20 zakazanych pól logów" | `real` | „**20 pól** w `FORBIDDEN_LOG_FIELDS` (apiKey, password, token, rawText, prompt, title...) usuwanych przed logiem." |
| R11 | „Panic Button kasuje profil reklamowy" | `[OVERSTATED]` | „Głęboki wipe **lokalnego** stanu (cookies/cache/IndexedDB/localStorage + storage rozszerzenia). NIE kasuje profilu zbudowanego po stronie sieci reklamowych." |
| R12 | „DataGhost wymazuje profil reklamowy" | `[OVERSTATED]` | „Anonimowy ruch wabik (no-cors, bez credentiali) = szum na poziomie sieci/ISP. **Nie** modyfikuje profilu cookie i nie jest gwarancją wyczyszczenia." |
| R13 | „Blocklist: 0 ukrytych endpointów / 0 sieci" | `[OVERSTATED]` | „Brak telemetrii i ukrytych endpointów; jedyne wyjścia to (1) **podpisany bundle blocklisty** (weryfikacja Ed25519, z anti-rollback i detekcją anomalii rozmiaru — auto na timerze) i (2) SimpleLogin tylko na wyraźną akcję użytkownika." |
| R14 | Bionic Blur „chroni przed anti-fraud" | `[OVERSTATED]` | „Wartość-szum jest słaby wobec ML; realna siła to **spójność OS↔GPU↔UA** persony, nie sam szum." |
| R15 | Shadow Audit „N bitów entropii / 1 na N" | `caveat` | „Liczby entropii są **ilustracyjne** (literatura Panopticlick/AmIUnique), nie pomiar populacyjny." |

**Twierdzenia w pełni `real` (mów bez zastrzeżeń strukturalnych):** Honeypot poisons 5 rodzin trackerów + rotacja co 1 min (`honeypot.ts`); Ed25519 signed updater + anti-rollback + size-anomaly (`secureUpdater.ts`); higiena licencji Gemma non-OSS + HaGeZi GPL-3.0 mere-aggregation; 111 plików `.ts/.tsx` w źródłach; redakcja sekretów w Data Vault (`buildExport.ts`).

---

## 6. Checklista przed prezentacją

### Techniczne (T-30min)
- [ ] Build załadowany w **Edge** (Chrome 149 blokuje `--load-extension`).
- [ ] Domyślny model AI = **NLI DeBERTa na WASM** (nie wymaga WebGPU — bezpieczny na każdym sprzęcie).
- [ ] `npx vitest run` zielony — trzymać terminal jako twardy fallback (≈297 testów zielonych, ~10 s wall-clock; 44 pliki).
- [ ] AI Deep-Dive odpala na przygotowanej wrażliwej stronie → werdykt JSON w `AiDeepDiveCard`.
- [ ] Honeypot self-test (`TRIGGER_HONEYPOT_TEST`) działa BEZ realnego endpointu trackera.
- [ ] CyberRadar pokazuje **realne** zdarzenia honeypota (jeśli pusto — odpal self-test).
- [ ] Panic Button: cookies/storage widoczne w DevTools przed i znikają po.
- [ ] Targeting Shield: strona z `?gclid=...&utm_source=...` → logi strip + licznik.
- [ ] Cookie Shredder: wartość `_ga`/`_fbp` zmienia się na ten sam format po rotacji.
- [ ] Ekran **Licencje** w rozszerzeniu renderuje noty Gemma Terms + GPL-3.0.

### Backup demo (jeśli live padnie)
- [ ] Landing `site-launch/privacymyst/index.html` otwarty lokalnie (animowane demo, disclaimer „Illustrative recreation" widoczny — nie ukrywać).
- [ ] Zrzuty pod ręką: `docs/proof/01-popup-privacymyst.png`, `02-licenses-legal.png`, `03-ai-deepdive-llm-verdict.png`, `04-vision-adblock.png`, `05-dashboard-fixed.png`, `06-popup-fixed.png`.
- [ ] Skrypty: `scripts/verify-vision-e2e.mjs`, `scripts/bench-sensitivity.mjs`.

### Higiena narracji (każdy mówca przeczytał sekcję 5)
- [ ] Nikt nie mówi „4 modele AI" → mów „3 aktywne" (R1).
- [ ] Nikt nie mówi „100% offline / zero sieci nigdy" → „domyślny NLI offline, sieć domyślnie cicha" (R2).
- [ ] Nikt nie mówi „blokujemy trackery / kasujemy profil" → „zatruwamy parametry / lokalny wipe" (R4, R11, R12).
- [ ] Liczby 27× i 4,4 ms zawsze z kontekstem „transformers.js int8/CPU, korpus seedowany" (R6).
- [ ] SmolVLM wizja prezentowana jako działająca lokalnie z wbudowanych wag q4f16 (offscreen, `allowRemoteModels=false`, dataURL); jedyny caveat to git-ignored wagi (backup `docs/proof/04-vision-adblock.png`) i dostępność WebGPU (R5).
- [ ] Bartosz domyka pitch („Lokalne modele. Realna ochrona. Zero chmury.") z ciszą po „Zero chmury", potem oddaje demo Hubertowi.

### Spójność zespołowa
- [ ] Każdy zna swój 1 plik flagowy: Hubert→`offscreen.js`, Kacper→`CyberRadar.tsx`/`crypto.ts`, Krystian→`honeypot.ts`, Bartosz→`targetingShield.ts`/`index.html`.
- [ ] Uchwyty git nie są mylone z osobami (`szalik`=Bartosz, `Makaren337`=Kacper, `glazownaypager`=Hubert, 0 commitów).
- [ ] Kacper prezentując „silnik" mówi jasno: CyberRadar **wizualizuje** przechwycenia z warstwy sieciowej (Honeypot/Targeting Shield), nie wykonuje ich.
