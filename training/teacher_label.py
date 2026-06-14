"""Teacher pass: soft-label the corpus with the cross-encoder NLI zero-shot model.

This is the EXPENSIVE-at-inference signal we are distilling: one forward pass per
(text, label) hypothesis -> 9 passes/page. We run it once here, offline, on GPU,
to produce SOFT per-label probabilities [N, 9]. The student learns to reproduce
these in a single pass.

Teacher = cross-encoder/nli-deberta-v3-small (the exact model in assets/models/,
same one proven in scripts/run-local-nli.mjs). multi_label=True => each label gets
an independent entailment probability, matching the product's usage.

Out: training/data/teacher.npz  (texts: str[N], probs: float32[N,9])
"""
import json
import os
import time

import numpy as np
import torch
from transformers import pipeline

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
ROOT = os.path.dirname(HERE)
# The bundled assets/models/nli-deberta-v3-small/ holds ONLY the int8 ONNX (for
# transformers.js) — no PyTorch checkpoint. For the GPU teacher pass we pull the
# fp32 torch weights of the SAME model from the hub. fp32 is a higher-quality
# teacher than the shipped int8 build, and it's the same architecture/behavior.
TEACHER_DIR = "cross-encoder/nli-deberta-v3-small"

LABELS = [
    "mental health content",
    "medical condition or treatment content",
    "financial distress or debt content",
    "legal trouble content",
    "political extremism or radicalization content",
    "addiction or substance abuse content",
    "religious belief or conversion content",
    "identity or major life event content",
    "ordinary non-sensitive article",
]


def load_texts(path):
    texts = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                texts.append(json.loads(line)["text"])
    return texts


def main():
    use_cuda = torch.cuda.is_available()
    dev = 0 if use_cuda else -1
    print(f"Teacher: {TEACHER_DIR}")
    print(f"Device: {'cuda:0 ' + torch.cuda.get_device_name(0) if use_cuda else 'cpu'}")

    clf = pipeline(
        "zero-shot-classification",
        model=TEACHER_DIR,
        tokenizer=TEACHER_DIR,
        device=dev,
        torch_dtype=torch.float16 if use_cuda else torch.float32,
    )

    texts = load_texts(os.path.join(DATA, "corpus.jsonl"))
    print(f"Labeling {len(texts)} snippets x {len(LABELS)} hypotheses...")

    t0 = time.time()
    probs = np.zeros((len(texts), len(LABELS)), dtype=np.float32)
    BATCH = 16
    done = 0
    # The pipeline batches internally per call; feed in chunks for progress + memory.
    for i in range(0, len(texts), BATCH):
        chunk = texts[i : i + BATCH]
        outs = clf(chunk, candidate_labels=LABELS, multi_label=True, batch_size=BATCH)
        if isinstance(outs, dict):
            outs = [outs]
        for j, out in enumerate(outs):
            score_by_label = dict(zip(out["labels"], out["scores"]))
            probs[i + j] = [score_by_label[l] for l in LABELS]
        done += len(chunk)
        if done % 320 == 0 or done == len(texts):
            rate = done / (time.time() - t0)
            print(f"  {done}/{len(texts)}  ({rate:.0f} pages/s)")

    out_path = os.path.join(DATA, "teacher.npz")
    np.savez_compressed(out_path, texts=np.array(texts, dtype=object), probs=probs)
    dt = time.time() - t0
    print(f"\nSaved {out_path}")
    print(f"Teacher pass: {dt:.1f}s for {len(texts)} pages "
          f"({len(texts)*len(LABELS)} NLI forward passes, {len(texts)/dt:.0f} pages/s)")
    # quick sanity: mean prob per label
    print("Mean teacher prob per label:")
    for k, l in enumerate(LABELS):
        print(f"  {probs[:,k].mean():.3f}  {l}")


if __name__ == "__main__":
    main()
