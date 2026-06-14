# Jury-Safe Demo Script  -  Cloak & Dagger

> Sprzedaj projekt bez kłamstwa. Każde zdanie poniżej jest poparte kodem
> (zob. [HACKATHON_REPO_TRUTH_AUDIT.md](./HACKATHON_REPO_TRUTH_AUDIT.md)).
> Pokazuj tylko REAL/KEEP z [SLOP_KILL_LIST.md](./SLOP_KILL_LIST.md). Nie pokazuj Privacy Score jako pomiaru, nie wymawiaj „anonimizacja".

---

## 20-Second Pitch

> „Cloak & Dagger to **lokalna warstwa świadomości prywatności**. Czyta bieżącą stronę na Twoim urządzeniu, rozpoznaje treści podatne na profilowanie  -  zdrowie psychiczne, długi, sprawy medyczne  -  i na takich stronach **realnie odcina agresywny tracking**: zdejmuje parametry atrybucji `gclid/fbclid/utm`, zatruwa ciasteczka śledzące i blokuje hosty reklamowe dla tej strony. Treść strony **nigdy nie opuszcza przeglądarki**."

---

## 60-Second Pitch

* **Problem:** Współczesny tracking nie potrzebuje zgody  -  buduje „cienie cyfrowe" z parametrów linków, ciasteczek i fingerprintu. Najwrażliwsze są strony, które mówią coś o Tobie: zdrowie, długi, prawo. Tam profilowanie boli najbardziej.
* **Rozwiązanie:** Lekkie rozszerzenie (Manifest V3), które **lokalnie** ocenia kontekst strony i na wrażliwych stronach **eskaluje obronę**: strip atrybucji, rotacja/zatrucie ciasteczek trackerów, i blackout hostów ad/analytics dla tego origin.
* **Why now:** Modele językowe da się dziś uruchomić **w przeglądarce** (Transformers.js + WebGPU/WASM), więc „zrozumienie strony" nie wymaga już chmury  -  idealne pod suwerenność danych.
* **Demo:** [poniżej]  -  pokazujemy live odcięcie trackerów na stronie o wrażliwej treści + opcjonalny lokalny model AI potwierdzający ryzyko.
* **Privacy value:** treść strony nie wychodzi (`rawTextRetained:false`, hash ścieżki zamiast URL); jedyny ruch sieciowy AI to jednorazowe wagi modelu z HuggingFace.
* **Technical credibility:** 60/60 testów, build przechodzi, a inferencję udowadniamy **realnym testem Playwright/CDP**, który czeka aż źródło werdyktu zmieni się `heurystyka → NLI`.

---

## Demo Flow

> **Setup (przed jury, NIE na scenie):** załaduj rozszerzenie **unpacked w Edge** (`npm run demo`, `scripts/launch-demo.mjs`)  -  Chrome 149 blokuje `--load-extension`, a liczniki DNR wymagają trybu dev. **Zanim wejdziesz na scenę:** jeśli pokazujesz AI, wcześniej kliknij raz „Głęboki skan" na stronie testowej, żeby model NLI (~180 MB) zdążył się pobrać i zacachować. **Nie** otwieraj `chrome://`/`file://` na scenie (zapali `debugger` banner).

1. **Otwórz popup** → zakładka *Status*.
   * Co kliknąć: ikona rozszerzenia.
   * Co powiedzieć: „6 modułów obronnych, domyślnie włączonych. Wszystko lokalne."
   * Czego NIE mówić: nie wskazuj na liczbę „Privacy Score" jako pomiar. Jeśli ktoś spyta  -  patrz Q&A.

2. **Wejdź na stronę-dowód o wrażliwej treści.**
   * Co kliknąć: zakładka z `scripts/verify-deep-scan.mjs` page-HTML lub realny artykuł o depresji/długach (treść z kategorii `mental_health`/`financial_distress`).
   * Co powinno się pojawić: floating bubble z **liczbą = score ryzyka** (kolor czerwony/pomarańczowy), toast „Ryzyko: wysokie/krytyczne".
   * Co powiedzieć: „Lokalna heurystyka rozpoznała wrażliwy kontekst  -  bez chmury."
   * Czego NIE mówić: „AI to wykryło" (domyślnie to heurystyka; AI jest opcjonalne).

3. **Pokaż odcięcie trackerów (rdzeń).**
   * Co kliknąć: rozwiń floating panel; pokaż kartę *AI Profiling Detector* z kategoriami + `evidenceTags`. W dashboardzie pokaż licznik „Targeting blocked"/log „Total blackout trackerów na wrażliwej stronie: <host>".
   * Co powiedzieć: „Na tej wrażliwej stronie automatycznie odcięliśmy hosty reklamowe (DoubleClick, GA, Facebook…)  -  tylko dla tego origin." (`targetingShield.ts:119-130`)
   * Co powiedzieć dalej: „Niezależnie, zawsze zdejmujemy `gclid/fbclid/utm` z linków i co minutę zatruwamy ciasteczka trackerów." (`cookieShredder.ts`)

4. **Pokaż lokalny audyt cienia cyfrowego.**
   * Co kliknąć: dashboard → panel *Cień cyfrowy* (ShadowAudit).
   * Co powiedzieć: „Pokazujemy Twój realny fingerprint i poglądowy szacunek unikalności (wg literatury Panopticlick/AmIUnique)."
   * Czego NIE mówić: „Mierzymy dokładnie 1-na-N"  -  to szacunek poglądowy. (`ShadowAudit.tsx:196-200`)

5. **(Opcjonalnie, wisienka) Lokalny model AI.**
   * Co kliknąć: dashboard → karta *AI Deep-Dive* → przełącz *AI mode* ON → floating panel → „Głęboki skan".
   * Co powinno się pojawić: status `import Transformers.js → ładowanie modelu → NLI`, karta zmienia źródło na **„lokalny NLI"**.
   * Co powiedzieć: „To **prawdziwy** lokalny model (DeBERTa NLI) na Transformers.js  -  działa w przeglądarce, treść strony nie wychodzi; pobraliśmy tylko wagi z HuggingFace."
   * Czego NIE mówić: „działa w pełni offline" (wagi z HF), „LLM" jeśli pokazujesz NLI.

6. **Pokaż kontrolę: persony + Panic Button.**
   * Co kliknąć: *Wirtualna tożsamość* → wybierz personę (np. „Gaming · Windows"); potem *Panic* (hold).
   * Co powiedzieć: „Spójna persona maskuje fingerprint, a Panic czyści cookies/cache/storage dla wszystkich witryn jednym gestem." (`background.ts:251`)

7. **Domknij: local-first.**
   * Co powiedzieć: „Cały stan w `chrome.storage.local`, zero serwera bazodanowego, treść strony nie opuszcza urządzenia."

---

## Safe Technical Explanation (plain language)

* **Co działa w przeglądarce:** content-script (czyta tekst strony, maskuje fingerprint), service worker (DNR: strip/blackout, rotacja cookies, DataGhost), dokument offscreen (model AI), React UI (popup/dashboard/side panel).
* **Jakie dane są czytane:** widoczny tekst strony (tytuł/nagłówki/treść)  -  **lokalnie**; realny fingerprint przeglądarki w popupie. **Nie** czytamy pól formularzy/haseł (`SKIP_TAGS`, `extractVisibleText.ts:19-33`).
* **Co jest zapisywane:** liczniki, ustawienia, logi i aliasy w `chrome.storage.local` (plaintext); klucz crypto tylko w `chrome.storage.session` (pamięć). Hash ścieżki, nie surowy URL (`normalize.ts:20`).
* **Co opuszcza urządzenie:** treść strony  -  **nie**. Ruch sieciowy: jednorazowe **wagi modelu z HuggingFace** (gdy włączysz AI), DataGhost (anonimowy wabik bez ciasteczek), opcjonalnie SimpleLogin (gdy podasz token).
* **Metoda detekcji:** domyślnie heurystyka słów-kluczy (PL/EN, 8 kategorii, negacja-aware, `evidenceTags`); opcjonalnie lokalny NLI/LLM jako re-rank.
* **Ograniczenia (mów wprost):**
  * Blackout to lista ~27 znanych hostów, nie „wszystkie trackery"; działa na high/critical; brak de-eskalacji.
  * Liczniki „zablokowanych" rosną tylko w trybie dev (`onRuleMatchedDebug`).
  * Maskowanie fingerprintu jest spójne na warstwie JS, ale nagłówki HTTP UA/Sec-CH-UA nie są przepisywane.
  * Maskowanie biometrii behawioralnej (timing) jest **słabe**  -  nie obiecujemy go.
  * `debugger` w manifeście używany tylko na stronach `chrome:/file:/` (nie zwykłych)  -  **UNKNOWN dla jury, dlatego nie pokazujemy go na scenie**.
  * AI domyślnie wyłączone; wymaga toggla, pobrania wag i (dla LLM) WebGPU.

---

## Judge Q&A Prep

* **„Czy realnie blokujecie trackery?"**  -  Tak: deklaratywne reguły DNR. Zawsze strip `gclid/fbclid/utm` i zatruwanie ciasteczek; na stronach high/critical pełny blackout listy ~27 hostów ad/analytics dla tego origin. (`targetingShield.ts`, `cookieShredder.ts`) Uczciwie: to lista znanych hostów, nie każdy tracker.
* **„Czy to tylko ładne UI?"**  -  Nie. UI jest podpięte do realnego message-bus i `chrome.storage`; liczniki idą z realnych zdarzeń modułów. Mamy 60 testów i e2e Playwright/CDP, który czeka na realny flip werdyktu AI.
* **„Jakie dane zbieracie?"**  -  Żadnych do chmury. Tekst strony czytamy lokalnie i nie przechowujemy (`rawTextRetained:false`); zapisujemy hash ścieżki, nie URL. Stan w `chrome.storage.local`.
* **„Czy AI jest lokalne?"**  -  Tak, inferencja on-device (Transformers.js, WASM/WebGPU w dokumencie offscreen). Jedyny ruch to jednorazowe pobranie wag z HuggingFace. Domyślnie wyłączone  -  włącza użytkownik.
* **„Skąd wiecie, że strona profiluje?"**  -  Heurystyka klastrowa PL/EN po 8 wrażliwych kategoriach (z `evidenceTags`); opcjonalnie potwierdzenie lokalnym NLI. To nie jest „magiczne AI" domyślnie  -  to przejrzysta heurystyka, a model jest opcjonalnym wzmocnieniem.
* **„Czym to się różni od adblockera?"**  -  Adblocker blokuje listę wszędzie tak samo. My **kontekstowo** eskalujemy: na neutralnej stronie lekko, na wrażliwej (zdrowie/długi) twardo odcinamy ad/analytics i pokazujemy użytkownikowi jego ślad  -  z lokalnym zrozumieniem treści.
* **„Korzyść dla użytkownika?"**  -  Mniej profilowania tam, gdzie najbardziej boli; świadomość własnego cienia cyfrowego; kontrola (persony, Panic)  -  bez oddawania danych komukolwiek.
* **„Najsłabsza część?"**  -  Uczciwie: (1) maskowanie biometrii behawioralnej jest słabe (timing), nie liczymy na nie; (2) „Privacy Score" to wskaźnik aktywności obron, nie pomiar prywatności; (3) DataGhost to tylko pomocniczy szum sieciowy. Wiemy o tym i nie sprzedajemy tego jako magii.
* **„Co byście zbudowali dalej?"**  -  De-eskalacja blackoutu, spoof nagłówków HTTP UA/Sec-CH-UA dla pełnej spójności maski, realny per-event jitter timingu, oraz wytłumaczalność „dlaczego ta strona" (konkretny term, nie tylko tag).
* **(Jeśli ktoś znajdzie token w kodzie):** „Tak  -  to nasz dług: testowy token SimpleLogin trafił do repo. Rewokujemy go i czyścimy historię; integracja powinna brać token z UI użytkownika, nie z kodu." (Lepiej ubiec pytanie i naprawić przed demem.)
