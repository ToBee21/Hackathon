# PrivacyMyst — kinowy silnik prezentacji

Sterowana danymi (`deck.story.json`) prezentacja techniczna projektu **PrivacyMyst**
(rozszerzenie do przeglądarki, lokalna ochrona prywatności). Nie jest to PowerPoint —
to interaktywna strona z kamerą filmową, diagramami-jako-kod i wizualizacją danych.

Cała treść jest po polsku i żyje w `src/story/deck.story.json`. Komponenty nie zawierają
treści — czytają ją z pliku storyboardu. Każdy element ma stabilne `id`, a każdy ruch
kamery jest odtwarzalny z danych.

## Stack

| Warstwa | Technologia |
|---|---|
| Bundler / dev | Vite 6 + React 18 + TypeScript |
| Ruch / scroll | GSAP ScrollTrigger (scrub kamery), CSS scroll-driven reveals |
| Diagramy | Mermaid 11 (flowchart, addresowalne węzły) |
| Graf interaktywny | React Flow (`@xyflow/react`) — animowana ścieżka „trasuj skan" |
| Wizualizacja danych | Observable Plot + D3 (słupki ze stopniowym wejściem) |
| Kamera | własny `CameraDirector` (translate3d + scale, fit-to-bbox) |
| Eksport / QA | Playwright (screenshoty per-sekcja + regresja wizualna) |

## Uruchomienie

```bash
npm install
npm run dev        # serwer deweloperski (http://localhost:4316)
npm run build      # tsc --noEmit + vite build -> dist/  (gotowe do file://)
npm run preview    # serwuje dist/ na :4317
npm run capture    # Playwright: shots/ (per sekcja, wariant full + reduced)
npm run test:visual  # Playwright: smoke + regresja wizualna
```

Tryby URL: `?debug=1` (overlay kamery: zoom, target, keyframe, fps),
`?reduced=1` (wymusza tryb ograniczonego ruchu).

## Architektura

```
deck.story.json ──> validateDeck() ──> App
                                         ├─ SectionRenderer (per sekcja)
                                         │   ├─ ArchitectureStage  (sticky + ScrollTrigger + kamera)
                                         │   │     └─ CameraViewport ──> CameraDirector
                                         │   │           └─ MermaidRenderer (węzły data-cam-id)
                                         │   ├─ GraphScene   (React Flow + animacja ścieżki)
                                         │   ├─ ChartScene   (Observable Plot + reveal)
                                         │   ├─ CodeBlock    (tokenizer + aktywne linie)
                                         │   └─ ContentLayer (eyebrow/display/lead/kpis/features/list/callout)
                                         └─ DebugOverlay
```

- **Kamera** (`src/engine/CameraDirector.ts`): utrzymuje `{tx,ty,z}`, liczy ujęcie
  dopasowane do bounding-boxa dowolnego elementu (DOM/SVG), odwraca bieżącą
  transformację, by ujęcia były niezależne od stanu. Scroll-scrub interpoluje między
  klatkami kluczowymi z `deck.story.json`.
- **Sekcja architektury** jest „sticky" na 280vh; ScrollTrigger mapuje postęp na
  klatki kamery, które najeżdżają na kolejne węzły Mermaid (content → background →
  offscreen → modele) i podświetlają je na czerwono.
- **Tryb ograniczonego ruchu**: sekcja kamery kolapsuje do jednego statycznego ujęcia
  (pełny diagram), wszystkie animacje wejścia są pomijane (CSS `prefers-reduced-motion`).

## Struktura plików

```
src/
  story/    deck.story.json, types.ts (schemat + validateDeck)
  engine/   CameraDirector.ts, hooks.ts, debugStore.ts
  components/ App? (w src/App.tsx)  SectionRenderer, ArchitectureStage, CameraViewport,
            MermaidRenderer, GraphScene, ChartScene, CodeBlock, LayerView, Reveal, DebugOverlay
  styles/   tokens.css (design tokens), app.css
scripts/    capture-sections.mjs, diag-cam.mjs
tests/      visual.spec.ts
```

## Checklista QA (odpowiedzi)

| # | Kryterium | Status |
|---|---|---|
| 1 | Jedna jasna teza | ✅ „Prywatność liczona lokalnie" — wszystko na urządzeniu |
| 2 | Każda scena ma powód istnienia | ✅ problem → architektura → dowód → silnik → kod → zakres → zespół → teza |
| 3 | Animacje prowadzą uwagę, nie popisują się | ✅ kamera prowadzi przez granice runtime; reveals subtelne |
| 4 | Każdy ruch kamery odtwarzalny z danych | ✅ klatki w `section.camera[]` |
| 5 | Diagramy czytelne z dystansu | ✅ Mermaid + zoom kamery do węzła |
| 6 | Węzły grafu znaczące, nie spaghetti | ✅ 8 węzłów = realne granice runtime |
| 7 | Wykres odpowiada na realne pytanie | ✅ 119 ms vs 4,4 ms / nawigację (27×) |
| 8 | Tryb reduced-motion działa | ✅ statyczne ujęcie + brak animacji |
| 9 | Eksport działa | ✅ `dist/` (base relative) + screenshoty Playwright |
| 10 | 60 fps na zwykłym laptopie | ✅ overlay debug pokazuje 50–60 fps |
| 11 | Demo działa bez internetu | ✅ fonty systemowe, brak CDN, build lokalny |
| 12 | Brak jednorazowych hacków | ✅ wszystko sterowane `deck.story.json` |
| 13 | Design premium, nie szablon SaaS | ✅ czerń/biel/głęboka czerwień, typografia redakcyjna, bez emoji |

## Budżet wydajności

- Bundle: główny chunk ~1,26 MB (gzip ~374 kB) — zdominowany przez Mermaid (wszystkie
  typy diagramów) + React Flow. Akceptowalne dla lokalnego demo; możliwa lazy-izolacja
  Mermaid, jeśli potrzeba.
- Runtime: transformacja kamery to pojedynczy `transform: translate3d()+scale()` na
  warstwie `will-change` — kompozytowana przez GPU, bez layout-thrash (pomiary cache'owane,
  ScrollTrigger scrub bez transition).
- Cel: ≥50 fps podczas scroll-scrubu kamery (zweryfikowane overlayem `?debug=1`).

## Dowód (screenshoty)

`shots/` zawiera per-sekcję screenshoty (warianty `full-*` i `reduced-*`) generowane
przez `npm run capture`, w tym kinowy `full-architecture-closeup.png` (kamera 2,99×
najeżdża na węzeł „Offscreen Document").
