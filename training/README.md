# Sensitivity model distillation

Distills the 9-pass zero-shot page-sensitivity signal (cross-encoder NLI) into a
**single-pass ~22.7M MiniLM multi-label classifier**, exported to int8 ONNX for
transformers.js. Measured **27x faster per page** in the extension runtime with
comparable sensitive/benign detection.

## Why

The product needs a per-navigation page-sensitivity score (it drives the
loose↔scorched-earth blocking escalation). The baseline used
`cross-encoder/nli-deberta-v3-small` in **zero-shot**: one forward pass *per
candidate label* → **9 passes/page** of a 140M model. That is slow for a
real-time, per-navigation signal. The 10x is not a bigger model — it is a
**distilled, single-pass** one.

## Pipeline (reproducible)

```
python training/build_corpus.py     # seeded, balanced corpus (+ hand-written held-out)
python training/teacher_label.py    # teacher = NLI zero-shot, SOFT per-label probs  [GPU]
python training/distill_train.py    # student = MiniLM-L6 multi-label, BCE-soft + masked CE  [GPU]
python training/eval_student.py     # held-out: student (1 pass) vs teacher (9 pass)
python training/export_onnx.py      # -> assets/models/sensitivity-distil-minilm/ (int8 ONNX)
node   scripts/bench-sensitivity.mjs  # the 10x, measured in transformers.js CPU
```

## Method notes

- **Distillation, not training-from-labels:** loss is on the teacher's SOFT
  probabilities (BCE), so the student inherits the teacher's nuance
  ("70% medical / 30% mental-health"), not just an argmax. A
  **confidence-masked cross-entropy** term sharpens the top label *only where the
  teacher is confident* (max prob ≥ 0.5) — benign pages (all-low teacher probs)
  are excluded, so we never force a benign page into a sensitive category.
- **Teacher = fp32 hub weights** of the same NLI model (the bundled copy is
  int8-ONNX only, no torch checkpoint); fp32 is the higher-quality teacher.
- **Student = `sentence-transformers/all-MiniLM-L6-v2`** full fine-tune (LoRA is
  for big models; 22M full FT is ~1 min on the GPU).

## Measured (RTX 3080 Laptop 16GB / CPU inference)

- Teacher pass: ~57 pages/s (GPU), 4589 snippets × 9 hypotheses.
- Train: 22.7M params, ~60s, 8 epochs, val MAE vs teacher ≈ 0.09.
- Held-out (24 hand-written, unseen): sensitive-vs-benign detection **student ==
  teacher** (100% / 67%); exact category **student 67% vs teacher 78%**.
- Speed (transformers.js, int8, CPU): teacher **119 ms/page** → student
  **4.4 ms/page** = **27x**.

## HONEST caveats (do not oversell)

- Distillation is standard (Hinton, DistilBERT) — the contribution is the
  **dataset + the fact it runs locally in MV3 + the fusion with blocking**, not
  the technique. Never pitch it as a novel invention.
- The corpus is **seeded/templated**, NOT a real OpenWPM/Tranco crawl. The
  distillation mechanism is identical; corpus realism is the known limitation.
  Swapping in a real crawl is the clear path to closing the 67→78% category gap.
- The "ordinary" label barely fires under zero-shot NLI; the benign decision is
  "no sensitive label crosses threshold", not "ordinary label wins".

## Not yet wired into the extension

The int8 model sits at `assets/models/sensitivity-distil-minilm/`. Replacing the
runtime 9-pass zero-shot call with this 1-pass `text-classification` model (in the
AI deep-dive risk path) is a separate integration step.
