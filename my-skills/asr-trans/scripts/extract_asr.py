#!/usr/bin/env python3
"""Extract a temporary, loss-checked FunASR alignment skeleton."""

from __future__ import annotations

import argparse
import json
import math
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unicodedata


RAW_SCHEMA_VERSION = "asr-raw-1.0"
ALIGNMENT_MODES = ("sentence", "token")
MODEL_IDS = {
    "model": "iic/speech_seaco_paraformer_large_asr_nat-zh-cn-16k-common-vocab8404-pytorch",
    "vad_model": "iic/speech_fsmn_vad_zh-cn-16k-common-pytorch",
    "punc_model": "iic/punc_ct-transformer_cn-en-common-vocab471067-large",
}
MODEL_ENV = {
    "model": "ASR_TRANS_MODEL",
    "vad_model": "ASR_TRANS_VAD_MODEL",
    "punc_model": "ASR_TRANS_PUNC_MODEL",
}


def is_decoration(char: str) -> bool:
    """Punctuation and whitespace have no independent FunASR timestamp."""
    return char.isspace() or unicodedata.category(char)[0] in {"P", "Z"}


def split_spoken(text: str) -> list[str]:
    """Mirror the token shape used by paraformer-zh for Chinese-first speech."""
    tokens: list[str] = []
    index = 0
    while index < len(text):
        char = text[index]
        if is_decoration(char):
            index += 1
            continue
        if char.isascii() and char.isalnum():
            end = index + 1
            while end < len(text) and text[end].isascii() and text[end].isalnum():
                end += 1
            tokens.append(text[index:end])
            index = end
            continue
        tokens.append(char)
        index += 1
    return tokens


def spoken_signature(text: str) -> str:
    """Compare spoken content while ignoring non-acoustic display differences."""
    return "".join(split_spoken(text)).casefold()


def tokenize_with_display(text: str) -> list[dict[str, str]]:
    """Attach punctuation/space to a spoken token while preserving exact text."""
    units: list[dict[str, str]] = []
    pending_prefix = ""
    index = 0
    while index < len(text):
        char = text[index]
        if is_decoration(char):
            if units:
                units[-1]["text"] += char
            else:
                pending_prefix += char
            index += 1
            continue

        if char.isascii() and char.isalnum():
            end = index + 1
            while end < len(text) and text[end].isascii() and text[end].isalnum():
                end += 1
            spoken = text[index:end]
            index = end
        else:
            spoken = char
            index += 1

        units.append({"spoken": spoken, "text": pending_prefix + spoken})
        pending_prefix = ""

    if pending_prefix:
        if not units:
            raise ValueError("ASR 只返回了标点或空白，没有可对齐的发音 token")
        units[-1]["text"] += pending_prefix
    if "".join(unit["text"] for unit in units) != text:
        raise AssertionError("内部 token 化没有完整还原 ASR 文本")
    return units


def require_program(name: str) -> str:
    path = shutil.which(name)
    if not path:
        raise RuntimeError(f"找不到 {name}，请先安装并确认它在 PATH 中")
    return path


def resolve_model(kind: str) -> str:
    """Prefer an explicit/local cached model; otherwise let FunASR download the fixed ID."""
    override = os.environ.get(MODEL_ENV[kind])
    if override:
        return os.fspath(Path(override).expanduser().resolve()) if Path(override).expanduser().exists() else override

    model_id = MODEL_IDS[kind]
    cache_name = model_id.replace("/", "--")
    cache_roots = []
    if os.environ.get("MODELSCOPE_CACHE"):
        cache_roots.append(Path(os.environ["MODELSCOPE_CACHE"]).expanduser())
    cache_roots.append(Path.home() / ".cache" / "modelscope")
    for root in cache_roots:
        candidates = (
            root / "models" / cache_name / "snapshots" / "master",
            root / "hub" / model_id,
        )
        for candidate in candidates:
            if (candidate / "config.yaml").is_file() and (candidate / "model.pt").is_file():
                return os.fspath(candidate)
    return model_id


def media_duration(path: Path, ffprobe: str) -> float:
    result = subprocess.run(
        [
            ffprobe,
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "json",
            os.fspath(path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    duration = float(json.loads(result.stdout)["format"]["duration"])
    if not math.isfinite(duration) or duration <= 0:
        raise ValueError(f"媒体时长无效：{duration!r}")
    return round(duration, 3)


def assert_timeline(units: list[dict], label: str, duration: float) -> None:
    previous_end = -1.0
    for index, unit in enumerate(units):
        start = float(unit["start"])
        end = float(unit["end"])
        if not math.isfinite(start) or not math.isfinite(end):
            raise ValueError(f"{label}[{index}] 时间不是有限数字")
        if start < 0 or end <= start:
            raise ValueError(f"{label}[{index}] 时间范围无效：{start}–{end}")
        if start + 0.001 < previous_end:
            raise ValueError(f"{label}[{index}] 与前一个单元发生时间重叠")
        if end > duration + 0.1:
            raise ValueError(f"{label}[{index}] 超出媒体时长")
        previous_end = end


def build_raw(result: dict, source: Path, duration: float, alignment: str) -> dict:
    text = result.get("text")
    if not isinstance(text, str) or not text.strip():
        raise ValueError("FunASR 没有返回有效 text")

    displays = tokenize_with_display(text)
    timestamps = result.get("timestamp") or []
    if len(displays) != len(timestamps):
        preview = "|".join(unit["spoken"] for unit in displays[:20])
        raise ValueError(
            "FunASR token 与时间戳数量不一致，已停止以避免静默错位："
            f"token={len(displays)} timestamp={len(timestamps)} preview={preview!r}"
        )

    tokens = []
    for index, (display, timestamp) in enumerate(zip(displays, timestamps, strict=True)):
        if not isinstance(timestamp, list) or len(timestamp) != 2:
            raise ValueError(f"timestamp[{index}] 结构无效")
        tokens.append(
            {
                "index": index,
                "start": round(float(timestamp[0]) / 1000, 3),
                "end": round(float(timestamp[1]) / 1000, 3),
                "spoken": display["spoken"],
                "text": display["text"],
            }
        )
    assert_timeline(tokens, "tokens", duration)

    sentence_info = result.get("sentence_info") or []
    if not sentence_info:
        raise ValueError("FunASR 没有返回 sentence_info")
    sentences = []
    for index, sentence in enumerate(sentence_info):
        sentence_text = sentence.get("text")
        if not isinstance(sentence_text, str) or not sentence_text.strip():
            raise ValueError(f"sentence_info[{index}].text 无效")
        sentences.append(
            {
                "index": index,
                "start": round(float(sentence["start"]) / 1000, 3),
                "end": round(float(sentence["end"]) / 1000, 3),
                "text": sentence_text,
            }
        )
    assert_timeline(sentences, "sentences", duration)

    global_spoken = spoken_signature(text)
    sentence_spoken = spoken_signature("".join(unit["text"] for unit in sentences))
    if sentence_spoken != global_spoken:
        limit = min(len(global_spoken), len(sentence_spoken))
        first_diff = next(
            (index for index in range(limit) if global_spoken[index] != sentence_spoken[index]),
            limit,
        )
        raise ValueError(
            "FunASR 的 text 与 sentence_info 在忽略标点、空格和大小写后仍不一致，"
            "已停止以避免漏字："
            f"text_len={len(global_spoken)} sentence_len={len(sentence_spoken)} "
            f"first_diff={first_diff}"
        )

    return {
        "schema_version": RAW_SCHEMA_VERSION,
        "requested_alignment": alignment,
        "source": {"name": source.name, "duration_seconds": duration},
        "language": "zh-CN",
        "text": text,
        "sentences": sentences,
        "tokens": tokens,
    }


def write_new_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    descriptor = os.open(path, flags, 0o600)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
    except Exception:
        path.unlink(missing_ok=True)
        raise


def run(input_path: Path, output_path: Path, alignment: str) -> None:
    if not input_path.is_file():
        raise FileNotFoundError(f"输入不是可读文件：{input_path}")
    if output_path.exists():
        raise FileExistsError(f"临时输出已存在，拒绝覆盖：{output_path}")

    ffmpeg = require_program("ffmpeg")
    ffprobe = require_program("ffprobe")
    duration = media_duration(input_path, ffprobe)

    try:
        from funasr import AutoModel
    except ImportError as error:
        raise RuntimeError(
            "当前 Python 无法导入 funasr；请使用可用解释器或按 Skill 指引通过 uv 运行"
        ) from error

    with tempfile.TemporaryDirectory(prefix="asr-trans-audio-") as directory:
        wav = Path(directory) / "audio.wav"
        subprocess.run(
            [
                ffmpeg,
                "-y",
                "-i",
                os.fspath(input_path),
                "-ac",
                "1",
                "-ar",
                "16000",
                "-vn",
                os.fspath(wav),
            ],
            check=True,
            capture_output=True,
        )
        model = AutoModel(
            model=resolve_model("model"),
            vad_model=resolve_model("vad_model"),
            punc_model=resolve_model("punc_model"),
            disable_pbar=True,
            disable_update=True,
        )
        results = model.generate(input=os.fspath(wav), batch_size_s=300, sentence_timestamp=True)

    if not isinstance(results, list) or not results:
        raise ValueError("FunASR 没有返回识别结果")
    write_new_json(output_path, build_raw(results[0], input_path, duration, alignment))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--alignment", choices=ALIGNMENT_MODES, default="sentence")
    args = parser.parse_args()
    run(args.input.expanduser().resolve(), args.output.expanduser().resolve(), args.alignment)
    print(f"ASR 骨架已生成：{args.output}")


if __name__ == "__main__":
    main()
