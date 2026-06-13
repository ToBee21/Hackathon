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
Cloak & Dagger wywraca ten paradygmat. Zamiast pasywnej obrony, rozszerzenie stosuje aktywny kontratak techniczny:
Zatruwa algorytmy reklamowe generując w tle fałszywy szum informacyjny o zainteresowaniach użytkownika.
Maskuje unikalną tożsamość behawioralną, modyfikując w czasie rzeczywistym interakcję człowieka z przeglądarką.
Daje pełną kontrolę i suwerenność nad danymi dzięki lokalnemu szyfrowaniu i natychmiastowemu usuwaniu śladów.
🚀 Główne Funkcje (Moduły)
Projekt został zaprojektowany w architekturze modułowej, gwarantując pełną izolację kodu i niezależną pracę zespołu:
👻 1. DataGhost (Silnik Szumu)
Status: Aktywny proces w tle (background.ts)
Działanie: Automatycznie i w niewidoczny dla użytkownika sposób generuje ruch sieciowy. Odpytuje losowe strony z neutralnych i zróżnicowanych kategorii (np. Google Trends, bazy RSS), wstrzykując "szum" do ciasteczek marketingowych. Profil budowany przez korporacje staje się bezużyteczny.
🌀 2. Bionic Blur (Zniekształcanie Biometrii)
Status: Skrypt wstrzykiwany do stron WWW (content.ts)
Działanie: Neutralizuje systemy analizujące unikalny styl korzystania z komputera. Do ruchu myszy (mousemove) dodaje matematyczny szum (Perlin Noise), niszcząc powtarzalność ścieżki kursora. W pola tekstowe (keydown/keyup) wstrzykuje mikro-opóźnienia (10-40ms), całkowicie fałszując rytm pisania na klawiaturze.
📊 3. Privacy Dashboard (Centrum Dowodzenia)
Status: Interfejs użytkownika (popup.tsx + React)
Działanie: Nowoczesny, responsywny panel dający wgląd w działanie systemu. Wyświetla dynamiczny wskaźnik Privacy Score, pokazuje strumień zdarzeń w czasie rzeczywistym (co system aktualnie maskuje) oraz zawiera Panic Button – natychmiastowe czyszczenie pamięci podręcznej i ciasteczek jednym kliknięciem.
🔒 4. Identity Masking & Core (Bezpieczeństwo)
Status: Wspólna logika i narzędzia (src/shared/*)
Działanie: Obsługa lokalnego szyfrowania za pomocą wbudowanego Web Crypto API (architektura Privacy-by-Design – brak zewnętrznych serwerów bazy danych). Ponadto moduł integruje się z otwartymi API e-mailowych aliasów, umożliwiając generowanie bezpiecznych, tymczasowych adresów e-mail w locie.
🛠️ Stack Technologiczny
Technologia	Rola w projekcie
Plasmo Framework	Architektura Manifest V3, automatyzacja budowania rozszerzenia
TypeScript	Ścisłe typowanie, eliminacja błędów w czasie rzeczywistym
React 18	Reaktywny i dynamiczny interfejs Dashboardu
Tailwind CSS	Błyskawiczne i nowoczesne stylowanie UI
Web Crypto API	Bezpieczne, lokalne szyfrowanie danych po stronie klienta