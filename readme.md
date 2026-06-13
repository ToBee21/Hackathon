cloak-and-dagger/
├── .gitignore                  <-- [Osoba D] Konfiguracja gita (ignorowanie node_modules itp.)
├── package.json                <-- [Osoba D] Zależności (Plasmo, React, Tailwind)
├── tsconfig.json               <-- [Osoba D] Konfiguracja kompilatora TypeScript
├── tailwind.config.js          <-- [Osoba C] Konfiguracja stylów i motywu graficznego UI
├── SPECS.md                    <-- [CAŁY ZESPÓŁ] Pełna specyfikacja techniczna projektu
└── src/
    ├── types.ts                <-- [CAŁY ZESPÓŁ] Interfejsy i typy danych (Wspólny kontrakt)
    ├── background.ts           <-- [Osoba A] Główny proces w tle (Silnik szumu DataGhost)
    ├── content.ts              <-- [Osoba B] Skrypt wstrzykiwany na strony WWW (Bionic Blur)
    ├── popup.tsx               <-- [Osoba C] Punkt wejścia dla interfejsu (React Popup)
    ├── components/             <-- [Osoba C] Komponenty wizualne interfejsu
    │   ├── ScoreChart.tsx      <-- [Osoba C] Animowany wykres Privacy Score
    │   ├── ModuleToggles.tsx   <-- [Osoba C] Przełączniki funkcji ON/OFF
    │   └── LoggerView.tsx      <-- [Osoba C] Konsola pokazująca akcje w czasie rzeczywistym
    └── shared/                 <-- [Osoba D] Wspólna logika backendowa i bezpieczeństwo
        ├── crypto.ts           <-- [Osoba D] Szyfrowanie lokalne (Web Crypto API)
        ├── emailAlias.ts       <-- [Osoba D] Integracja z API generatora maili (np. Relay/SimpleLogin)
        └── storage.ts          <-- [Osoba D] Zarządzanie pamięcią i funkcja Panic Button








        🗡️ Cloak & Dagger
Aktywny system ochrony prywatności i suwerenności danych użytkownika w sieci.
Projekt stworzony w ramach hackathonu Signal:Noise dla Kategorii 3: Prywatność i Suwerenność Danych (na podstawie wytycznych z pliku image.png).
📌 O Projekcie
Współczesny internet opiera się na agresywnym targetowaniu i masowej inwigilacji. Zwykłe wtyczki blokujące reklamy (adblockery) to za mało – skrypty śledzące potrafią identyfikować użytkowników na podstawie ich sprzętu oraz biometrii behawioralnej (sposobu poruszania myszką, tempa pisania), tworząc tzw. Shadow Profiles (cienie cyfrowe).
Cloak & Dagger łączy obronę z transparentnością. Rozszerzenie stosuje trzy uzupełniające się warstwy:
Audytuje Twój „cień cyfrowy" — pasywnie mierzy i pokazuje, jak unikalny jest Twój fingerprint przeglądarki.
Maskuje fingerprint w sposób WEWNĘTRZNIE SPÓJNY (User-Agent zgodny z podstawianą platformą i GPU), aby samo maskowanie nie stało się sygnałem rozpoznawczym.
Daje kontrolę nad danymi: lokalne szyfrowanie (klucz wyłącznie w pamięci sesji, nigdy na dysku) oraz Panic Button czyszczący ciasteczka, cache i storage. Dodatkowo generuje anonimowy ruch-wabik jako warstwę pomocniczą.
🚀 Główne Funkcje (Moduły)
Projekt został zaprojektowany w architekturze modułowej, gwarantując pełną izolację kodu i niezależną pracę zespołu:
👻 1. DataGhost (Silnik Szumu)
Status: Aktywny proces w tle (background.ts)
Działanie: Automatycznie generuje ANONIMOWY ruch sieciowy — zapytania (fetch) bez ciasteczek/credentials do zróżnicowanych, neutralnych kategorii. To warstwa ruchu-wabika utrudniająca profilowanie na poziomie sieci. WAŻNE (uczciwie): ponieważ nie wysyła Twoich ciasteczek, NIE modyfikuje profilu reklamowego opartego o ciasteczka ani profili po stronie serwera/zalogowanego konta i nie jest gwarantowanym „wyczyszczeniem" profilu. Badania nad obfuskacją (TrackMeNot/AdNauseam) wskazują jej ograniczenia — dlatego traktujemy ją jako warstwę pomocniczą, nie główną.
🌀 2. Bionic Blur (Zniekształcanie Biometrii)
Status: Skrypt wstrzykiwany do stron WWW (content.ts)
Działanie: Maskuje fingerprint sprzętowy i behawioralny. Spójnie podmienia atrybuty (canvas, WebGL, navigator, ekran, strefa czasowa) — z User-Agentem zgodnym z podstawianą platformą i GPU, więc maskowanie nie tworzy „niemożliwej" kombinacji, którą fingerprinterzy wykrywają i odwracają. Do ruchu myszy dodaje szum (Perlin/value noise), a do znaczników czasu zdarzeń mikro-jitter (~10-40ms). Uwaga (uczciwie): jitter rzędu kilkunastu ms ogranicza, lecz nie eliminuje biometrii behawioralnej — patrz „Ograniczenia".
📊 3. Privacy Dashboard (Centrum Dowodzenia)
Status: Interfejs użytkownika (popup.tsx + React)
Działanie: Nowoczesny, responsywny panel dający wgląd w działanie systemu. Wyświetla dynamiczny wskaźnik Privacy Score, pokazuje strumień zdarzeń w czasie rzeczywistym (co system aktualnie maskuje) oraz zawiera Panic Button – natychmiastowe czyszczenie pamięci podręcznej i ciasteczek jednym kliknięciem.
🔒 4. Identity Masking & Core (Bezpieczeństwo)
Status: Wspólna logika i narzędzia (src/shared/*)
Działanie: Obsługa lokalnego szyfrowania za pomocą wbudowanego Web Crypto API (AES-GCM-256, PBKDF2). Klucz żyje WYŁĄCZNIE w chrome.storage.session (pamięć), nigdy nie jest zapisywany na dysk obok szyfrogramu. Moduł generuje też jednorazowe aliasy e-mail (tryb offline bez API; opcjonalnie SimpleLogin po podaniu tokenu).
🔎 5. Digital Shadow Audit (Transparentność)
Status: Pasywny pomiar w interfejsie (popup.tsx + shared/shadowAudit.ts)
Działanie: Skanuje realny fingerprint Twojej przeglądarki (User-Agent, platforma, ekran, strefa czasowa, canvas, WebGL, rdzenie CPU, pamięć) i szacuje, jak bardzo Cię on wyróżnia. Pomaga zrozumieć własny „cień cyfrowy". Szacunek entropii oparty jest o typowe wartości literaturowe (Panopticlick/AmIUnique) i jest poglądowy — nie jest pomiarem względem realnej, bieżącej populacji.
🛠️ Stack Technologiczny
Technologia	Rola w projekcie
Plasmo Framework	Architektura Manifest V3, automatyzacja budowania rozszerzenia
TypeScript	Ścisłe typowanie, eliminacja błędów w czasie rzeczywistym
React 18	Reaktywny i dynamiczny interfejs Dashboardu
Tailwind CSS	Błyskawiczne i nowoczesne stylowanie UI
Web Crypto API	Bezpieczne, lokalne szyfrowanie danych po stronie klienta

⚖️ Ograniczenia (uczciwie)
Skuteczność prywatnościowa zależy od kontekstu — podajemy wprost granice rozwiązania:
- Maskowanie fingerprintu pomaga tylko gdy jest WEWNĘTRZNIE SPÓJNE; niespójne podstawianie atrybutów potrafi zwiększyć rozpoznawalność. Podejście „uniformity" (jak w Tor Browser) bywa skuteczniejsze niż randomizacja per-witryna.
- Ruch-wabik (DataGhost) jest anonimowy: nie czyści profilu opartego o ciasteczka ani profili po stronie serwera/zalogowanego konta; to warstwa zaciemniająca na poziomie sieci.
- Mikro-jitter klawiatury (~kilkanaście ms) ogranicza, ale nie eliminuje biometrii behawioralnej (dedykowane narzędzia, np. kloak, stosują znacznie większe opóźnienia rzędu 100 ms).
- Lokalne szyfrowanie chroni dane w spoczynku w obrębie sesji przeglądarki (klucz w pamięci, nie na dysku); trwałe szyfrowanie między sesjami wymagałoby hasła głównego użytkownika.