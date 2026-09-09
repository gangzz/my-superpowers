#!/usr/bin/env python3
"""Offline behavioral tests for asr-trans deterministic helpers."""

from __future__ import annotations

import json
from pathlib import Path
import sys
import tempfile
import unittest


SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from extract_asr import (  # noqa: E402
    build_raw,
    spoken_signature,
    split_spoken,
    tokenize_with_display,
)
from transcript_json import (  # noqa: E402
    ContractError,
    assemble,
    atomic_write,
    validate_final,
)


def raw_fixture(mode: str) -> dict:
    return {
        "schema_version": "asr-raw-1.0",
        "requested_alignment": mode,
        "source": {"name": "sample.mp4", "duration_seconds": 3.0},
        "language": "zh-CN",
        "text": "携带APOE四的人。",
        "sentences": [
            {"index": 0, "start": 0.1, "end": 1.5, "text": "携带APOE四的人。"}
        ],
        "tokens": [
            {"index": 0, "start": 0.1, "end": 0.2, "spoken": "携", "text": "携"},
            {"index": 1, "start": 0.2, "end": 0.3, "spoken": "带", "text": "带"},
            {"index": 2, "start": 0.3, "end": 0.7, "spoken": "APOE", "text": "APOE"},
            {"index": 3, "start": 0.7, "end": 0.9, "spoken": "四", "text": "四"},
            {"index": 4, "start": 0.9, "end": 1.0, "spoken": "的", "text": "的"},
            {"index": 5, "start": 1.0, "end": 1.2, "spoken": "人", "text": "人。"},
        ],
    }


class TokenizeTests(unittest.TestCase):
    def test_preserves_exact_text_and_groups_ascii(self) -> None:
        text = "我说 loser，值100%。"
        units = tokenize_with_display(text)
        self.assertEqual("".join(unit["text"] for unit in units), text)
        self.assertEqual([unit["spoken"] for unit in units], ["我", "说", "loser", "值", "100"])
        self.assertEqual(units[-1]["text"], "100%。")

    def test_sentence_comparison_ignores_punctuation_and_spaces(self) -> None:
        self.assertEqual(split_spoken("你好，AI 100！"), ["你", "好", "AI", "100"])

    def test_spoken_signature_ignores_display_only_differences(self) -> None:
        self.assertEqual(
            spoken_signature("  Hello，AI！！ Ok。"),
            spoken_signature("hello ai ok???"),
        )

    def test_build_raw_accepts_display_only_sentence_differences(self) -> None:
        result = {
            "text": "Hello，AI！！ Ok。",
            "timestamp": [[100, 200], [200, 300], [300, 500]],
            "sentence_info": [
                {"text": "hello ai？", "start": 100, "end": 300},
                {"text": "ok！", "start": 300, "end": 500},
            ],
        }
        payload = build_raw(result, Path("sample.wav"), 1.0, "sentence")
        self.assertEqual(payload["text"], result["text"])
        self.assertEqual([unit["text"] for unit in payload["sentences"]], ["hello ai？", "ok！"])

    def test_token_timestamp_mismatch_stops(self) -> None:
        result = {
            "text": "你好。",
            "timestamp": [[100, 200]],
            "sentence_info": [{"text": "你好。", "start": 100, "end": 400}],
        }
        with self.assertRaisesRegex(ValueError, "数量不一致"):
            build_raw(result, Path("sample.wav"), 1.0, "token")

    def test_sentence_content_mismatch_stops(self) -> None:
        result = {
            "text": "你好。",
            "timestamp": [[100, 200], [200, 400]],
            "sentence_info": [{"text": "你坏。", "start": 100, "end": 400}],
        }
        with self.assertRaisesRegex(ValueError, "text_len=2 sentence_len=2 first_diff=1"):
            build_raw(result, Path("sample.wav"), 1.0, "sentence")


class AssembleTests(unittest.TestCase):
    def test_sentence_mode_sparse_correction(self) -> None:
        raw = raw_fixture("sentence")
        result = assemble(
            raw,
            {"mode": "sentence", "changes": [{"source_index": 0, "text": "携带APOE4的人。"}]},
        )
        self.assertEqual(result["text"], "携带APOE4的人。")
        self.assertEqual(result["alignment"]["units"][0]["start"], 0.1)

    def test_token_mode_contiguous_group(self) -> None:
        raw = raw_fixture("token")
        result = assemble(
            raw,
            {"mode": "token", "changes": [{"source_start": 2, "source_end": 4, "text": "APOE4"}]},
        )
        self.assertEqual(result["text"], "携带APOE4的人。")
        grouped = result["alignment"]["units"][2]
        self.assertEqual((grouped["start"], grouped["end"], grouped["text"]), (0.3, 0.9, "APOE4"))

    def test_empty_changes_keep_identity(self) -> None:
        result = assemble(raw_fixture("token"), {"mode": "token", "changes": []})
        self.assertEqual(result["text"], "携带APOE四的人。")

    def test_overlapping_changes_fail(self) -> None:
        with self.assertRaisesRegex(ContractError, "重叠"):
            assemble(
                raw_fixture("token"),
                {
                    "mode": "token",
                    "changes": [
                        {"source_start": 1, "source_end": 3, "text": "带APOE"},
                        {"source_start": 2, "source_end": 4, "text": "APOE4"},
                    ],
                },
            )

    def test_final_text_must_equal_units(self) -> None:
        payload = assemble(raw_fixture("sentence"), {"mode": "sentence", "changes": []})
        payload["text"] = "不一致"
        with self.assertRaisesRegex(ContractError, "拼接结果不一致"):
            validate_final(payload)

    def test_refuses_overwrite_without_force(self) -> None:
        payload = assemble(raw_fixture("sentence"), {"mode": "sentence", "changes": []})
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "result.json"
            atomic_write(output, payload, force=False)
            with self.assertRaisesRegex(FileExistsError, "拒绝覆盖"):
                atomic_write(output, payload, force=False)
            atomic_write(output, payload, force=True)
            self.assertEqual(json.loads(output.read_text(encoding="utf-8"))["text"], payload["text"])


if __name__ == "__main__":
    unittest.main()
