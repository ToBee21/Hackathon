// src/tabs/licenses.tsx
// In-extension "Licenses / Attributions" screen. Opened from the popup footer
// ("Licencje") at chrome-extension://<id>/tabs/licenses.html. Renders the
// verified third-party attributions (mirrors THIRD_PARTY_LICENSES.md) and shows
// any license that REQUIRES a visible notice (e.g. Google Gemma Terms) up top.
//
// Design language: Stealth Intelligence Console — dark surface, ration teal
// accent, monospace for license/data fields, no emoji.

import {
  ATTRIBUTIONS,
  attributionsByCategory,
  noticeRequiredAttributions,
  type Attribution
} from "../shared/attributions"

import "../style.css"

function LicenseRow({ a }: { a: Attribution }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0,1fr) auto",
        gap: "8px 16px",
        padding: "12px 0",
        borderBottom: "1px solid rgba(120,140,150,0.14)"
      }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600, color: "#e7f6f3" }}>{a.name}</div>
        <div style={{ fontSize: 12, color: "#8aa0a0", marginTop: 2 }}>
          {a.component}
        </div>
        <div
          style={{
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
            fontSize: 11,
            color: "#9fb6b2",
            marginTop: 6,
            wordBreak: "break-word"
          }}>
          {a.attribution}
        </div>
        <a
          href={a.url}
          target="_blank"
          rel="noreferrer noopener"
          style={{
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
            fontSize: 11,
            color: "#40e0c8",
            marginTop: 4,
            display: "inline-block",
            wordBreak: "break-all"
          }}>
          {a.url}
        </a>
      </div>
      <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
        <span
          style={{
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
            fontSize: 11,
            color: a.requiresNotice ? "#04211c" : "#cfe7e2",
            background: a.requiresNotice
              ? "rgba(64,224,200,0.9)"
              : "rgba(120,140,150,0.16)",
            borderRadius: 4,
            padding: "2px 8px"
          }}>
          {a.spdx || a.license}
        </span>
      </div>
    </div>
  )
}

function Licenses() {
  const groups = attributionsByCategory()
  const notices = noticeRequiredAttributions()
  const empty = ATTRIBUTIONS.length === 0

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0a1414",
        color: "#cfe7e2",
        fontFamily:
          "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif",
        padding: "32px 0"
      }}>
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "0 24px" }}>
        <h1 style={{ margin: 0, fontSize: 22, color: "#e7f6f3" }}>
          Licencje i atrybucje
        </h1>
        <p style={{ color: "#8aa0a0", fontSize: 13, lineHeight: 1.6, marginTop: 8 }}>
          PrivacyMyst uruchamia całą analizę lokalnie i dystrybuuje
          poniższe komponenty stron trzecich (modele AI, runtime, biblioteki,
          listy blokujące) zgodnie z ich licencjami. Pełny dokument:{" "}
          <span
            style={{
              fontFamily:
                "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
              color: "#9fb6b2"
            }}>
            THIRD_PARTY_LICENSES.md
          </span>
          .
        </p>

        {empty && (
          <p style={{ color: "#c89a4a", fontSize: 13, marginTop: 16 }}>
            Lista atrybucji jest aktualnie generowana z audytu licencji.
          </p>
        )}

        {notices.length > 0 && (
          <section
            style={{
              marginTop: 20,
              border: "1px solid rgba(64,224,200,0.4)",
              borderRadius: 8,
              padding: "14px 16px",
              background: "rgba(64,224,200,0.06)"
            }}>
            <div
              style={{
                fontSize: 12,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "#40e0c8",
                fontWeight: 700
              }}>
              Wymagane noty licencyjne
            </div>
            {notices.map((a) => (
              <div
                key={a.name}
                style={{ marginTop: 8, fontSize: 12.5, color: "#cfe7e2", lineHeight: 1.6 }}>
                <strong style={{ color: "#e7f6f3" }}>{a.name}</strong> —{" "}
                {a.attribution}
              </div>
            ))}
          </section>
        )}

        {groups.map((group) => (
          <section key={group.category} style={{ marginTop: 28 }}>
            <h2
              style={{
                fontSize: 13,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "#8aa0a0",
                margin: "0 0 4px"
              }}>
              {group.category}
            </h2>
            {group.items.map((a) => (
              <LicenseRow key={a.name} a={a} />
            ))}
          </section>
        ))}

        <section style={{ marginTop: 32 }}>
          <h2
            style={{
              fontSize: 13,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "#8aa0a0",
              margin: "0 0 6px"
            }}>
            Prywatność i przetwarzanie
          </h2>
          <p style={{ color: "#9fb6b2", fontSize: 12.5, lineHeight: 1.7 }}>
            Cała analiza działa <strong style={{ color: "#cfe7e2" }}>lokalnie na
            Twoim urządzeniu</strong> (WebGPU/WASM). Aby zadziałać, rozszerzenie
            odczytuje <strong style={{ color: "#cfe7e2" }}>treść strony</strong>,{" "}
            <strong style={{ color: "#cfe7e2" }}>obrazy na stronie</strong> oraz{" "}
            <strong style={{ color: "#cfe7e2" }}>zrzut aktywnej karty</strong>{" "}
            (do detektora reklam-obrazków AI) — wyłącznie lokalnie i tymczasowo.
            Żadne treści, obrazy, zrzuty ani aktywność przeglądania{" "}
            <strong style={{ color: "#cfe7e2" }}>nie opuszczają przeglądarki</strong>:
            brak serwerów, brak telemetrii, brak zbierania/sprzedaży danych.
          </p>
        </section>

        <section style={{ marginTop: 24 }}>
          <h2
            style={{
              fontSize: 13,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "#8aa0a0",
              margin: "0 0 6px"
            }}>
            Zastrzeżenie (AI)
          </h2>
          <p style={{ color: "#9fb6b2", fontSize: 12.5, lineHeight: 1.7 }}>
            Lokalne modele (klasyfikator ryzyka, detektor reklam) są{" "}
            <strong style={{ color: "#cfe7e2" }}>best-effort</strong> — mogą się
            mylić lub „halucynować". Ich wyniki nie są poradą profesjonalną, prawną,
            medyczną, finansową ani bezpieczeństwa. Oprogramowanie jest dostarczane{" "}
            „AS IS", bez gwarancji.
          </p>
        </section>

        <section style={{ marginTop: 24 }}>
          <h2
            style={{
              fontSize: 13,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "#8aa0a0",
              margin: "0 0 6px"
            }}>
            Dokumenty prawne
          </h2>
          <p
            style={{
              color: "#9fb6b2",
              fontSize: 12,
              lineHeight: 1.8,
              fontFamily:
                "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
            }}>
            legal/TERMS_OF_SERVICE.md · legal/PRIVACY_POLICY.md ·
            legal/EULA.md · legal/DISCLAIMER_AND_LIABILITY.md ·
            THIRD_PARTY_LICENSES.md · NOTICE · licenses/
          </p>
        </section>

        <section style={{ marginTop: 24 }}>
          <h2
            style={{
              fontSize: 13,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "#8aa0a0",
              margin: "0 0 6px"
            }}>
            Podziękowania
          </h2>
          <p style={{ color: "#9fb6b2", fontSize: 12.5, lineHeight: 1.7 }}>
            Z szacunkiem dla twórców technologii, które to napędzają: Google
            DeepMind (Gemma — używane na podstawie Gemma Terms of Use), Hugging Face
            (SmolVLM, Transformers.js), Alibaba (Qwen), Microsoft (ONNX Runtime,
            DeBERTa), Meta (React), zespoły three.js / Plasmo / Tailwind, autorzy
            list HaGeZi i Phishing.Database oraz autorzy korpusów MultiNLI i SNLI.
            PrivacyMyst nie jest powiązane z, autoryzowane ani wspierane przez
            żadną z tych organizacji — ich nazwy podano wyłącznie jako rzetelną
            atrybucję wymaganą przez licencje.
          </p>
        </section>
      </div>
    </div>
  )
}

export default Licenses
