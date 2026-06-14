# Specyfikacja Techniczna: Projekt "PrivacyMyst"

## 1. O Projekcie
Projekt powstaje w ramach Hackathonu Signal:Noise dla **Kategorii 3: Prywatność i Suwerenność Danych** (zgodnie z wytycznymi w image.png). 

**PrivacyMyst** to zaawansowane rozszerzenie do przeglądarki, które odwraca paradygmat ochrony prywatności. Zamiast pasywnego blokowania elementów śledzących, narzędzie stosuje **aktywny kontratak techniczny**: zatruwa profile reklamowe fałszywym szumem informacyjnym, maskuje unikalną biometrię behawioralną użytkownika oraz zabezpiecza jego tożsamość e-mailową i lokalne dane.

---

## 2. Stack Technologiczny
Projekt opiera się wyłącznie na technologiach zapewniających maksymalną szybkość działania, stabilność oraz architekturę *Privacy-by-Design* (brak zewnętrznego serwera bazodanowego).

*   **Framework Bazowy:** `Plasmo Framework` (Manifest V3) - automatyzacja budowania rozszerzenia, hot-reloading.
*   **Język Programowania:** `TypeScript` (ścisłe typowanie w celu eliminacji błędów w run-time).
*   **Interfejs Użytkownika:** `React 18` + `Tailwind CSS` (błyskawiczne stylowanie komponentów utility-first).
*   **Bezpieczeństwo i Kryptografia:** `Web Crypto API` (wbudowane, natywne szyfrowanie po stronie klienta).
*   **Zarządzanie Stanem:** `Natywne WebExtensions Storage API` (`chrome.storage.local`).

---

## 3. Architektura Modułowa

### Moduł A: DataGhost (Silnik Szumu)
*   **Odpowiedzialny:** Osoba A
*   **Plik:** `src/background.ts`
*   **Opis:** Proces działający asynchronicznie w tle przeglądarki. Jego zadaniem jest generowanie fałszywego ruchu sieciowego (Noise Injection). Pobiera on cyklicznie listę losowych haseł z neutralnych kategorii (np. za pomocą zewnętrznych RSS/Google Trends) i w ukryty sposób symuluje zapytania do wyszukiwarek oraz wczytywanie stron w tle. Cel: uniemożliwienie skryptom marketingowym zbudowania poprawnego profilu zainteresowań użytkownika.

### Moduł B: Bionic Blur (Biometria Behawioralna)
*   **Odpowiedzialny:** Osoba B
*   **Plik:** `src/content.ts`
*   **Opis:** Skrypt wstrzykiwany bezpośrednio do drzewa DOM każdej odwiedzanej strony internetowej. Przechwytuje i modyfikuje zdarzenia wejścia użytkownika:
    *   **Mysz (`mousemove`):** Dodaje algorytmiczny "jitter" (szum matematyczny np. Perlin Noise) do trajektorii kursora, niszcząc powtarzalność ruchu.
    *   **Klawiatura (`keydown`/`keyup`):** Wprowadza mikro-opóźnienia o zmiennej latencji (10-40ms) pomiędzy naciśnięciami klawiszy, fałszując unikalne tempo pisania (Keystroke Dynamics).

### Moduł C: Privacy Dashboard (Interfejs i Grywalizacja)
*   **Odpowiedzialny:** Osoba C
*   **Pliki:** `src/popup.tsx`, `src/components/*`
*   **Opis:** Okno popup rozszerzenia wywoływane kliknięciem w ikonę paska zadań. Budowane w React i Tailwind. Zawiera:
    *   **Privacy Score:** Algorytm dynamicznie obliczający poziom bezpieczeństwa na podstawie aktywności Modułu A i B.
    *   **Real-time Logger:** Wizualny strumień pokazujący użytkownikowi zdarzenia (np. "Wstrzyknięto fałszywy ruch: Gotowanie", "Zniekształcono sygnaturę myszy").
    *   **Panic Button:** Przycisk natychmiastowego czyszczenia wywołujący funkcję z Modułu D.

### Moduł D: Secure Core & Identity Masking (Integracja i Bezpieczeństwo)
*   **Odpowiedzialny:** Osoba D
*   **Pliki:** `src/shared/*`, `src/types.ts`, konfiguracja projektu
*   **Opis:** Rdzeń spajający aplikację i dbający o bezpieczeństwo:
    *   **Panic Button Logika:** Funkcja głębokiego czyszczenia pamięci podręcznej przeglądarki (IndexedDB, LocalStorage, Cookies, SessionStorage) jednym kliknięciem w celu zerwania sesji śledzących.
    *   **Email Masking:** Integracja z otwartymi API (np. Firefox Relay/SimpleLogin) pozwalająca na generowanie losowych aliasów e-mail jednym kliknięciem bezpośrednio w formularzach na stronach internetowych.
    *   **Crypto Utils:** Implementacja Web Crypto API do lokalnego szyfrowania konfiguracji i tokenów API użytkownika przed zapisem do `chrome.storage`.

---

## 4. Protokół Komunikacji (Data Flow)
Wszystkie moduły wymieniają informacje asynchronicznie za pomocą natywnej magistrali wiadomości przeglądarki. 

1. `content.ts` (Moduł B) oraz `background.ts` (Moduł A) wysyłają zdarzenia o zablokowaniu/sfałszowaniu aktywności za pomocą `chrome.runtime.sendMessage`.
2. `popup.tsx` (Moduł C) nasłuchuje tych wiadomości poprzez `chrome.runtime.onMessage`, aktualizuje stan komponentów Reacta i zapisuje historyczne dane do zaszyfrowanego kontenera `storage.ts` (Moduł D).