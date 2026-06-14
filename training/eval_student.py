"""Eval the distilled student vs the teacher on the hand-written held-out set.

Apples-to-apples on real-ish wording the student never saw. We report, for BOTH
student (1 pass) and teacher (9 pass):
  - sensitive-vs-benign detection (max over the 8 sensitive labels >= thr)
  - category correctness on truly-sensitive examples (argmax sensitive == hand label)
  - student<->teacher top-sensitive-label agreement
The "ordinary" label barely fires under zero-shot NLI, so the benign decision is
"no sensitive label crosses threshold", not "ordinary label wins".
"""
import json
import os

import numpy as np
import torch
from transformers import (
    AutoModelForSequenceClassification,
    AutoTokenizer,
    pipeline,
)

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
STUDENT = os.path.join(HERE, "out", "student")
TEACHER = "cross-encoder/nli-deberta-v3-small"
THR = 0.5

LABELS = json.load(open(os.path.join(STUDENT, "labels.json"), encoding="utf-8"))
BENIGN = LABELS.index("ordinary non-sensitive article")  # == 8
SENS = [i for i in range(len(LABELS)) if i != BENIGN]


def short(i):
    return LABELS[i].replace(" content", "").replace(" or ", "/")[:22]


def student_probs(texts):
    tok = AutoTokenizer.from_pretrained(STUDENT)
    model = AutoModelForSequenceClassification.from_pretrained(STUDENT).eval()
    enc = tok(texts, truncation=True, max_length=128, padding=True, return_tensors="pt")
    with torch.no_grad():
        return torch.sigmoid(model(**enc).logits).numpy()


def teacher_probs(texts):
    dev = 0 if torch.cuda.is_available() else -1
    clf = pipeline("zero-shot-classification", model=TEACHER, device=dev)
    out = clf(texts, candidate_labels=LABELS, multi_label=True)
    if isinstance(out, dict):
        out = [out]
    P = np.zeros((len(texts), len(LABELS)), dtype=np.float32)
    for j, o in enumerate(out):
        d = dict(zip(o["labels"], o["scores"]))
        P[j] = [d[l] for l in LABELS]
    return P


def report(name, P, texts, labels):
    sens_max = P[:, SENS].max(axis=1)
    sens_top = np.array([SENS[i] for i in P[:, SENS].argmax(axis=1)])
    det_ok = cat_ok = n_sens = n_benign = benign_ok = 0
    for k, gold in enumerate(labels):
        is_sens = gold != BENIGN
        pred_sens = sens_max[k] >= THR
        if is_sens:
            n_sens += 1
            if pred_sens:
                det_ok += 1
            if sens_top[k] == gold:
                cat_ok += 1
        else:
            n_benign += 1
            if not pred_sens:
                benign_ok += 1
    print(f"\n=== {name} ===")
    print(f"  sensitive detection : {det_ok}/{n_sens}  ({100*det_ok/n_sens:.0f}%)")
    print(f"  benign  detection   : {benign_ok}/{n_benign}  ({100*benign_ok/max(1,n_benign):.0f}%)")
    print(f"  category correct    : {cat_ok}/{n_sens}  ({100*cat_ok/n_sens:.0f}%)  (argmax sensitive == gold)")
    return sens_top, sens_max


def main():
    rows = [json.loads(l) for l in open(os.path.join(DATA, "heldout.jsonl"), encoding="utf-8") if l.strip()]
    texts = [r["text"] for r in rows]
    labels = [r["label"] for r in rows]

    Ps = student_probs(texts)
    Pt = teacher_probs(texts)

    st_top, st_max = report("STUDENT (1 forward pass, 22.7M)", Ps, texts, labels)
    te_top, te_max = report("TEACHER (9 forward passes, 140M)", Pt, texts, labels)

    agree = int((st_top == te_top).sum())
    print(f"\nstudent<->teacher top-sensitive-label agreement: {agree}/{len(texts)} "
          f"({100*agree/len(texts):.0f}%)")

    print("\nper-example (gold | student top | teacher top):")
    for k, t in enumerate(texts):
        flag = " " if st_top[k] == labels[k] or (labels[k] == BENIGN and st_max[k] < THR) else "x"
        print(f"  {flag} {short(labels[k]):22s} | {short(st_top[k]):22s} {st_max[k]:.2f} | "
              f"{short(te_top[k]):22s} {te_max[k]:.2f} | {t[:46]}")


if __name__ == "__main__":
    main()
