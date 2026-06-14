"""Export the distilled student to ONNX int8 and lay it out for transformers.js.

Produces assets/models/sensitivity-distil-minilm/ with the same on-disk shape as
the other bundled models (top-level config + tokenizer, weights under onnx/), so
the extension loads it exactly like nli-deberta — but as a SINGLE-pass
text-classification model (problem_type=multi_label_classification => sigmoid).
"""
import os
import shutil

from optimum.onnxruntime import ORTModelForSequenceClassification, ORTQuantizer
from optimum.onnxruntime.configuration import AutoQuantizationConfig
from transformers import AutoTokenizer

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
STUDENT = os.path.join(HERE, "out", "student")
DEST = os.path.join(ROOT, "assets", "models", "sensitivity-distil-minilm")
TMP = os.path.join(HERE, "out", "onnx_tmp")

os.makedirs(DEST, exist_ok=True)
os.makedirs(os.path.join(DEST, "onnx"), exist_ok=True)

print("Exporting student -> ONNX (fp32)...")
model = ORTModelForSequenceClassification.from_pretrained(STUDENT, export=True)
model.save_pretrained(TMP)
AutoTokenizer.from_pretrained(STUDENT).save_pretrained(TMP)

print("Dynamic int8 quantization (CPU, avx512_vnni)...")
quantizer = ORTQuantizer.from_pretrained(TMP)
qconfig = AutoQuantizationConfig.avx512_vnni(is_static=False, per_channel=False)
quantizer.quantize(save_dir=TMP, quantization_config=qconfig)

# Lay out transformers.js style: tokenizer+config at root, weights under onnx/.
for fn in os.listdir(TMP):
    src = os.path.join(TMP, fn)
    if fn.endswith(".onnx"):
        # transformers.js dtype 'q8' looks for onnx/model_quantized.onnx
        name = "model_quantized.onnx" if "quantized" in fn else "model.onnx"
        shutil.copy(src, os.path.join(DEST, "onnx", name))
    elif fn.endswith((".json", ".txt")):
        shutil.copy(src, os.path.join(DEST, fn))

q = os.path.join(DEST, "onnx", "model_quantized.onnx")
print(f"\nDone -> {DEST}")
print(f"  int8 weights: {os.path.getsize(q)/1e6:.1f} MB  {q}")
for fn in sorted(os.listdir(DEST)):
    print("  ", fn)
