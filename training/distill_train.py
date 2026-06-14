"""Distill the 9-pass zero-shot teacher into a single-pass MiniLM-L6 student.

Student = sentence-transformers/all-MiniLM-L6-v2 (~22M) wrapped as a multi-label
sequence classifier: ONE forward pass -> 9 sigmoid scores. We full-fine-tune it
(LoRA is for big models; 22M full FT is minutes on a 3080) against the teacher's
SOFT per-label probabilities with BCE-on-soft-targets == knowledge distillation
(it transfers the teacher's nuance, e.g. "70% medical / 30% mental-health",
not just a hard argmax).

Out: training/out/student/  (HF model + tokenizer, id2label set to the 9 labels)
"""
import json
import os
import time

import numpy as np
import torch
from torch.utils.data import DataLoader, Dataset
from transformers import (
    AutoModelForSequenceClassification,
    AutoTokenizer,
    get_linear_schedule_with_warmup,
)

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
OUT = os.path.join(HERE, "out", "student")
os.makedirs(OUT, exist_ok=True)

BASE = "sentence-transformers/all-MiniLM-L6-v2"
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
MAX_LEN = 128
EPOCHS = 8
BATCH = 32
LR = 5e-5
SEED = 1337
# Sharpen the top-label decision ONLY where the teacher is confident (max prob >=
# this). Benign pages have all-low teacher probs, so they are excluded — we never
# force a benign page into a sensitive category. Pure soft-BCE alone left the
# student blurry between correlated labels (addiction<->medical, debt<->legal).
CONF_THR = 0.5
CE_WEIGHT = 0.45

torch.manual_seed(SEED)
np.random.seed(SEED)


class SoftDataset(Dataset):
    def __init__(self, texts, probs, tok):
        self.enc = tok(list(texts), truncation=True, max_length=MAX_LEN,
                       padding="max_length", return_tensors="pt")
        self.y = torch.tensor(probs, dtype=torch.float32)

    def __len__(self):
        return self.y.shape[0]

    def __getitem__(self, i):
        return (self.enc["input_ids"][i], self.enc["attention_mask"][i], self.y[i])


def main():
    dev = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Device: {dev}  ({torch.cuda.get_device_name(0) if dev=='cuda' else 'cpu'})")

    npz = np.load(os.path.join(DATA, "teacher.npz"), allow_pickle=True)
    texts, probs = npz["texts"], npz["probs"].astype(np.float32)
    print(f"Loaded {len(texts)} soft-labeled snippets")

    # 95/5 split for a quick val signal (real eval is the hand-written held-out set).
    idx = np.random.permutation(len(texts))
    n_val = max(64, len(texts) // 20)
    val_idx, tr_idx = idx[:n_val], idx[n_val:]

    tok = AutoTokenizer.from_pretrained(BASE)
    model = AutoModelForSequenceClassification.from_pretrained(
        BASE,
        num_labels=len(LABELS),
        problem_type="multi_label_classification",
        id2label={i: l for i, l in enumerate(LABELS)},
        label2id={l: i for i, l in enumerate(LABELS)},
    ).to(dev)

    tr = DataLoader(SoftDataset(texts[tr_idx], probs[tr_idx], tok),
                    batch_size=BATCH, shuffle=True)
    va = DataLoader(SoftDataset(texts[val_idx], probs[val_idx], tok),
                    batch_size=BATCH)

    opt = torch.optim.AdamW(model.parameters(), lr=LR, weight_decay=0.01)
    total_steps = len(tr) * EPOCHS
    sched = get_linear_schedule_with_warmup(opt, int(0.06 * total_steps), total_steps)
    lossf = torch.nn.BCEWithLogitsLoss()
    cef = torch.nn.CrossEntropyLoss()
    scaler = torch.cuda.amp.GradScaler(enabled=(dev == "cuda"))

    t0 = time.time()
    for ep in range(1, EPOCHS + 1):
        model.train()
        run = 0.0
        for ids, mask, y in tr:
            ids, mask, y = ids.to(dev), mask.to(dev), y.to(dev)
            opt.zero_grad()
            with torch.autocast(device_type=dev, dtype=torch.float16, enabled=(dev == "cuda")):
                logits = model(input_ids=ids, attention_mask=mask).logits
                loss = lossf(logits, y)  # calibrated multi-label distillation
                conf = y.max(dim=1).values >= CONF_THR  # teacher-confident rows only
                if conf.any():
                    loss = loss + CE_WEIGHT * cef(logits[conf], y[conf].argmax(dim=1))
            scaler.scale(loss).backward()
            scaler.step(opt)
            scaler.update()
            sched.step()
            run += loss.item() * ids.size(0)
        tr_loss = run / len(tr.dataset)

        # val: BCE + mean abs error vs teacher probs
        model.eval()
        vl, mae, n = 0.0, 0.0, 0
        with torch.no_grad():
            for ids, mask, y in va:
                ids, mask, y = ids.to(dev), mask.to(dev), y.to(dev)
                logits = model(input_ids=ids, attention_mask=mask).logits
                vl += lossf(logits, y).item() * ids.size(0)
                mae += (torch.sigmoid(logits) - y).abs().sum().item()
                n += ids.size(0)
        print(f"epoch {ep}/{EPOCHS}  train_bce {tr_loss:.4f}  "
              f"val_bce {vl/n:.4f}  val_mae {mae/(n*len(LABELS)):.4f}")

    dt = time.time() - t0
    model.save_pretrained(OUT)
    tok.save_pretrained(OUT)
    with open(os.path.join(OUT, "labels.json"), "w", encoding="utf-8") as f:
        json.dump(LABELS, f, indent=2)
    n_params = sum(p.numel() for p in model.parameters())
    print(f"\nTrained {n_params/1e6:.1f}M-param student in {dt:.1f}s -> {OUT}")


if __name__ == "__main__":
    main()
