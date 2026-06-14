# Next 6 Hours Execution Plan  -  Cloak & Dagger

> Cel: zmaksymalizować realną wartość dla jury Kategorii 3, NIE objętość kodu.
> Wejście: [HACKATHON_REPO_TRUTH_AUDIT.md](./HACKATHON_REPO_TRUTH_AUDIT.md) · [SLOP_KILL_LIST.md](./SLOP_KILL_LIST.md).

---

## Strategic Decision

**Wybór: B (utnij fałszywe feature'y i dopnij jeden mocny flow prywatności) + C (przeramuj wokół audytu cienia / odcięcia trackerów).**

**Dlaczego:** rdzeń (Flow 1: wykrycie wrażliwej strony → odcięcie trackerów; Flow 4: strip atrybucji + cookie poison) jest już **REAL i default-on**. Nie trzeba budować nic nowego, żeby mieć uczciwy, mocny produkt Kat. 3  -  trzeba **usunąć/ukryć kłamstwa, które go zatapiają** (Privacy Score, „anonimizacja", keystroke-masking, zepsuty Entropy Drop) i **usunąć ryzyko bezpieczeństwa** (token). Budowanie nowego AI to pułapka czasu (off-by-default, 180 MB+, WebGPU). Najwyższy ROI = wiarygodność, nie nowy kod.

Odrzucone: A (nie ma „MVP do naprawy"  -  MVP działa), D (detekcja już jest end-to-end; brak luki do dobudowania w 6h o wyższym ROI niż czyszczenie).

---

## Priority 0: Do Not Break Demo

Musi pozostać stabilne (NIE dotykać bez testu):
* `targetingShield.ts` (strip + blackout), `cookieShredder.ts`, `handleRiskResult.ts:76` (eskalacja)  -  rdzeń demo.
* `content.ts` ↔ `bionic-blur-main.ts` bridge (injection MAIN world).
* `offscreen.js` + `assets/onnxruntime/*` + `assets/vendor/transformers.web.js`  -  ścieżka NLI.
* `scripts/launch-demo.mjs`, `scripts/verify-deep-scan.mjs`  -  tor demo i dowód.
* `plasmo build` musi dalej dawać exit 0; `vitest run` 60/60.

---

## Priority 1: Make One Real Privacy Flow Work (i wypolerować)

**Flow:** wejście na wrażliwą stronę → lokalna detekcja → **widoczne** odcięcie trackerów + lista „co odcięto".

* **Input:** widoczny tekst strony (już jest).
* **Processing:** `classifyHeuristic` → high/critical → `escalateTargetingForOrigin` (już jest).
* **Output do dopięcia:** w floating panelu/dashboardzie pokaż **listę zablokowanych hostów dla tego origin** (czytaj z `cnd:targeting:blocked-origins` + `TARGETING_HOSTS`) zamiast/obok surowego licznika. To zamienia „liczba" w **dowód**.
* **User value:** jury widzi konkretne „odcięliśmy DoubleClick/GA/Facebook na tej stronie".
* **Pliki:** `src/content/floatingWindow.ts` (nowa karta/sekcja), opcj. nowy `LOG_EVENT` z listą hostów w `targetingShield.ts:blockOriginNow`.
* **Acceptance:** na stronie testowej `verify-deep-scan` panel pokazuje ≥1 host „odcięty", a `verify-floating-window.mjs` dalej przechodzi.

---

## Priority 2: Remove or Hide Slop (przed demem)

* **Privacy Score:** przemianuj etykietę na „Active defenses 6/6" lub ukryj liczbę; min. usuń mówienie o niej jako pomiarze. (`popup.tsx`, `dashboard.tsx`, `ScoreChart.tsx`)
* **Token SimpleLogin:** patrz Priority 0-bis niżej  -  to blokujące.
* **Entropy Drop:** albo napraw mount (`<ShadowAudit profileId={profileId} customBucket={customBucket} />`), albo ukryj „po masce", zostaw tylko realny odczyt. (`dashboard.tsx:344`)
* **Toast „Max Camo aktywny":** zmień copy na „Ryzyko wysokie  -  wzmocniono obronę" (nie twierdź aktywacji). (`pageAlert.ts:83`)
* **Etykiety StatCard / `trackersBlockedCount`:** nie nazywaj „zablokowane"; rozdziel poison vs blok lub etykieta neutralna „zdarzenia obronne". (`StatCards.tsx`)
* **Nie pokazuj** `cloak-and-dagger-preview.html` jako żywego popupu; nie otwieraj `chrome://`/`file://` (debugger banner).
* **(Opcjonalnie, niskie ryzyko) skasuj martwy kod** dla higieny prezentacji: `src/shared/aiDeepDive/{runModel,localLlm,localNli}.ts`, martwe API w `storage.ts`. *Tylko jeśli zostanie czas i po `tsc --noEmit`.*

### Priority 0-bis (BLOKUJĄCE, zrób NAJPIERW): token SimpleLogin
1. **Zrewokuj** token w panelu SimpleLogin (unieważnij `bkfwey…`). To jedyny realny fix.
2. Usuń linię `saveApiToken(...)` z `src/background.ts:1003` (+ import) i dodaj pole na token w UI lub całkiem wyłącz ścieżkę SimpleLogin na demo.
3. Wyczyść artefakty: usuń `build/llm-*-profile/`, dodaj do `.gitignore`, przebuduj.
4. (Po hackathonie) purge z historii git (`git filter-repo`/BFG)  -  token i tak był publiczny, więc rewokacja z p.1 jest właściwą ochroną.

---

## Priority 3: Evidence Layer (wytłumaczalność = punkty Kat. 3)

Dodaj widoczny dowód „dlaczego":
* **Dlaczego flagged:** pokaż konkretny dopasowany term/klaster (nie tylko tag `depression_terms`). Źródło: `score.ts:collectEvidenceTags`/`scoreClusters`  -  przekaż dopasowane terminy do karty.
* **Jaki sygnał:** kategorie już są (`aiProfilingDetector`), dodaj 1 zdanie „ta strona zawiera sygnały: depresja, długi".
* **Co odcięto:** lista hostów (Priority 1).
* **Co z permissions/storage:** w karcie `pageExplainer` już jest „pola logowania/formularze/baner zgody"  -  uwypuklij.
* **Rekomendacja:** zostaw `ACTION` z `aiProfilingDetector` (już sensowne).

---

## Priority 4: Polish Only After Truth

Dopiero gdy rdzeń + czyszczenie gotowe:
* UI: spójność kolorów ryzyka, czytelność floating panelu.
* Copy: ujednolicić „lokalny/heurystyka/NLI".
* Pitch: przećwiczyć 20s/60s z [JURY_SAFE_DEMO_SCRIPT.md](./JURY_SAFE_DEMO_SCRIPT.md).
* Animacje/ikony: bez zmian (CyberRadar/ScoreChart wyglądają dobrze, są tanie).

---

## Timeboxed Plan

| Timebox | Task | Owner Type | Acceptance Criteria |
| ------- | ---- | ---------- | ------------------- |
| 0-30 min | **Rewokuj token SimpleLogin**; usuń linię + import; usuń `build/llm-*-profile`, `.gitignore`; `plasmo build` | Security/Dev | Token martwy w SimpleLogin; `grep bkfwey src/` = 0; build exit 0 |
| 0-30 min | Przygotuj tor demo: Edge unpacked, pre-pobierz NLI (kliknij „Głęboki skan" raz) | Demo/Dev | Model NLI w cache; floating panel działa na stronie testowej |
| 30-90 min | **Priority 1**: lista „odciętych hostów" w panelu + `LOG_EVENT` | Dev (content/bg) | Panel pokazuje ≥1 host na stronie testowej; `verify-floating-window.mjs` OK |
| 30-90 min | **Privacy Score → „Active defenses"**; toast copy fix | Dev (UI) | Brak liczby udającej pomiar; toast nie twierdzi „Max Camo aktywny" |
| 90-180 min | **Entropy Drop**: przekaż propsy do `<ShadowAudit>` (lub ukryj „po masce") | Dev (UI) | Zielony słupek renderuje się dla wybranej persony, albo sekcja ukryta |
| 90-180 min | Evidence layer: dopasowany term + zdanie „sygnały: …" w karcie | Dev (content) | Karta pokazuje konkretny sygnał, nie tylko tag |
| 180-300 min | Generalna próba demo (full run wg skryptu), wyłapać debugger-banner/dev-only pułapki | Cały zespół | Przejście 7 kroków bez fałszywego claimu i bez bannera |
| 180-300 min | (Jeśli czas) skasuj martwy kod (`runModel/localLlm/localNli`, martwe `storage.ts`) | Dev | `tsc --noEmit` = 0, `vitest run` 60/60 |
| 300-360 min | Pitch lockdown (20s/60s), Q&A drill, fallback (nagrany GIF demo) | Cały zespół | Każdy umie 20s + zna „forbidden claims" + jest backup wideo |

---

## Final Ship Checklist

* [ ] `plasmo build` → exit 0; `vitest run` → 60/60; `tsc --noEmit` → 0.
* [ ] **Token SimpleLogin zrewokowany** i usunięty ze źródła; `build/llm-*-profile` usunięte + gitignore.
* [ ] Tor demo przetestowany na Edge unpacked; NLI pre-pobrany; **nie** otwieramy `chrome://`/`file://`.
* [ ] Brak fałszywych claimów na slajdach/UI (Privacy Score nie jako pomiar; brak „anonimizacja"/„keystroke masking").
* [ ] Floating panel pokazuje realne „odcięte hosty" na stronie testowej.
* [ ] Docs gotowe: ten plan + Truth Audit + Slop Kill List + Demo Script + Category Alignment.
* [ ] Pitch 20s/60s przećwiczony; każdy zna „najsłabszą część" i odpowiedź.
* [ ] **Fallback:** nagrany GIF/wideo działającego flow (na wypadek braku łącza / WebGPU / debugger-bannera).
