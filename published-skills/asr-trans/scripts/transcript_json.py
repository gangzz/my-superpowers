#!/usr/bin/env python3
"""Finalize and validate corrected transcript JSON files."""

from __future__ import annotations

import argparse
import json
import math
import os
from pathlib import Path
import tempfile


FINAL_SCHEMA_VERSION = "1.0"
RAW_SCHEMA_VERSION = "asr-raw-1.0"
MODES = {"sentence", "token"}


class ContractError(ValueError):
    pass


def load_json(path: Path) -> dict:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise ContractError(f"JSON 格式错误：{path}: {error}") from error
    if not isinstance(payload, dict):
        raise ContractError(f"JSON 顶层必须是对象：{path}")
    return payload


def finite_number(value: object, label: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ContractError(f"{label} 必须是数字")
    number = float(value)
    if not math.isfinite(number):
        raise ContractError(f"{label} 必须是有限数字")
    return number


def validate_final(payload: dict) -> None:
    if payload.get("schema_version") != FINAL_SCHEMA_VERSION:
        raise ContractError(f"schema_version 必须是 {FINAL_SCHEMA_VERSION}")
    if payload.get("language") != "zh-CN":
        raise ContractError("language 必须是 zh-CN")

    source = payload.get("source")
    if not isinstance(source, dict):
        raise ContractError("source 必须是对象")
    if not isinstance(source.get("name"), str) or not source["name"]:
        raise ContractError("source.name 必须是非空字符串")
    if Path(source["name"]).name != source["name"]:
        raise ContractError("source.name 只能保存文件名，不能包含路径")
    duration = finite_number(source.get("duration_seconds"), "source.duration_seconds")
    if duration <= 0:
        raise ContractError("source.duration_seconds 必须大于 0")

    text = payload.get("text")
    if not isinstance(text, str) or not text:
        raise ContractError("text 必须是非空字符串")
    alignment = payload.get("alignment")
    if not isinstance(alignment, dict) or alignment.get("mode") not in MODES:
        raise ContractError("alignment.mode 必须是 sentence 或 token")
    units = alignment.get("units")
    if not isinstance(units, list) or not units:
        raise ContractError("alignment.units 必须是非空数组")

    previous_end = -1.0
    pieces: list[str] = []
    for index, unit in enumerate(units):
        if not isinstance(unit, dict):
            raise ContractError(f"alignment.units[{index}] 必须是对象")
        if unit.get("index") != index:
            raise ContractError(f"alignment.units[{index}].index 必须连续且等于 {index}")
        start = finite_number(unit.get("start"), f"alignment.units[{index}].start")
        end = finite_number(unit.get("end"), f"alignment.units[{index}].end")
        unit_text = unit.get("text")
        if not isinstance(unit_text, str) or not unit_text:
            raise ContractError(f"alignment.units[{index}].text 必须是非空字符串")
        if start < 0 or end <= start:
            raise ContractError(f"alignment.units[{index}] 时间范围无效")
        if start + 0.001 < previous_end:
            raise ContractError(f"alignment.units[{index}] 与前一个单元发生时间重叠")
        if end > duration + 0.1:
            raise ContractError(f"alignment.units[{index}] 超出媒体时长")
        previous_end = end
        pieces.append(unit_text)
    if "".join(pieces) != text:
        raise ContractError("text 与 alignment.units[].text 拼接结果不一致")


def validate_raw(payload: dict) -> str:
    if payload.get("schema_version") != RAW_SCHEMA_VERSION:
        raise ContractError(f"原始骨架 schema_version 必须是 {RAW_SCHEMA_VERSION}")
    mode = payload.get("requested_alignment")
    if mode not in MODES:
        raise ContractError("原始骨架 requested_alignment 无效")
    source = payload.get("source")
    if not isinstance(source, dict):
        raise ContractError("原始骨架 source 无效")
    if not isinstance(source.get("name"), str) or not source["name"]:
        raise ContractError("原始骨架 source.name 无效")
    finite_number(source.get("duration_seconds"), "原始骨架 source.duration_seconds")
    key = "sentences" if mode == "sentence" else "tokens"
    units = payload.get(key)
    if not isinstance(units, list) or not units:
        raise ContractError(f"原始骨架 {key} 必须是非空数组")
    for index, unit in enumerate(units):
        if not isinstance(unit, dict) or unit.get("index") != index:
            raise ContractError(f"原始骨架 {key}[{index}] 下标无效")
        finite_number(unit.get("start"), f"原始骨架 {key}[{index}].start")
        finite_number(unit.get("end"), f"原始骨架 {key}[{index}].end")
        if not isinstance(unit.get("text"), str) or not unit["text"]:
            raise ContractError(f"原始骨架 {key}[{index}].text 无效")
    return mode


def parse_changes(corrections: dict, mode: str, count: int) -> list[dict]:
    if corrections.get("mode") != mode:
        raise ContractError("corrections.mode 与 ASR 骨架模式不一致")
    changes = corrections.get("changes")
    if not isinstance(changes, list):
        raise ContractError("corrections.changes 必须是数组")

    normalized: list[dict] = []
    for index, change in enumerate(changes):
        if not isinstance(change, dict):
            raise ContractError(f"changes[{index}] 必须是对象")
        replacement = change.get("text")
        if not isinstance(replacement, str) or not replacement:
            raise ContractError(f"changes[{index}].text 必须是非空字符串")
        if mode == "sentence":
            source_index = change.get("source_index")
            if isinstance(source_index, bool) or not isinstance(source_index, int):
                raise ContractError(f"changes[{index}].source_index 必须是整数")
            start, end = source_index, source_index + 1
        else:
            start, end = change.get("source_start"), change.get("source_end")
            if (
                isinstance(start, bool)
                or isinstance(end, bool)
                or not isinstance(start, int)
                or not isinstance(end, int)
            ):
                raise ContractError(f"changes[{index}] 的 token 范围必须是整数")
        if start < 0 or end <= start or end > count:
            raise ContractError(f"changes[{index}] 的来源范围无效：[{start}, {end})")
        normalized.append({"start": start, "end": end, "text": replacement})

    normalized.sort(key=lambda item: (item["start"], item["end"]))
    previous_end = -1
    for index, change in enumerate(normalized):
        if change["start"] < previous_end:
            raise ContractError(f"changes[{index}] 与前一个纠错范围重叠")
        previous_end = change["end"]
    return normalized


def assemble(raw: dict, corrections: dict) -> dict:
    mode = validate_raw(raw)
    key = "sentences" if mode == "sentence" else "tokens"
    source_units = raw[key]
    changes = parse_changes(corrections, mode, len(source_units))
    by_start = {change["start"]: change for change in changes}

    units = []
    source_index = 0
    while source_index < len(source_units):
        change = by_start.get(source_index)
        if change:
            first = source_units[change["start"]]
            last = source_units[change["end"] - 1]
            unit_text = change["text"]
            source_index = change["end"]
        else:
            first = last = source_units[source_index]
            unit_text = first["text"]
            source_index += 1
        units.append(
            {
                "index": len(units),
                "start": first["start"],
                "end": last["end"],
                "text": unit_text,
            }
        )

    payload = {
        "schema_version": FINAL_SCHEMA_VERSION,
        "source": {
            "name": Path(raw["source"]["name"]).name,
            "duration_seconds": raw["source"]["duration_seconds"],
        },
        "language": "zh-CN",
        "text": "".join(unit["text"] for unit in units),
        "alignment": {"mode": mode, "units": units},
    }
    validate_final(payload)
    return payload


def atomic_write(path: Path, payload: dict, force: bool) -> None:
    if not path.parent.is_dir():
        raise FileNotFoundError(f"输出目录不存在：{path.parent}")
    encoded = (json.dumps(payload, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(encoded)
            handle.flush()
            os.fsync(handle.fileno())
        if force:
            os.replace(temporary, path)
        else:
            try:
                os.link(temporary, path)
            except FileExistsError as error:
                raise FileExistsError(f"输出已存在，拒绝覆盖：{path}") from error
            temporary.unlink()
    finally:
        temporary.unlink(missing_ok=True)


def command_finalize(args: argparse.Namespace) -> None:
    raw = load_json(args.raw.expanduser().resolve())
    corrections = load_json(args.corrections.expanduser().resolve())
    output = args.output.expanduser().resolve()
    atomic_write(output, assemble(raw, corrections), args.force)
    print(f"终稿已生成：{output}")


def command_validate(args: argparse.Namespace) -> None:
    path = args.input.expanduser().resolve()
    payload = load_json(path)
    validate_final(payload)
    units = payload["alignment"]["units"]
    print(
        f"有效：mode={payload['alignment']['mode']} "
        f"units={len(units)} duration={payload['source']['duration_seconds']}s"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(required=True)

    finalize = subparsers.add_parser("finalize", help="合成纠正后的最终 JSON")
    finalize.add_argument("--raw", required=True, type=Path)
    finalize.add_argument("--corrections", required=True, type=Path)
    finalize.add_argument("--output", required=True, type=Path)
    finalize.add_argument("--force", action="store_true")
    finalize.set_defaults(handler=command_finalize)

    validate = subparsers.add_parser("validate", help="校验最终 JSON")
    validate.add_argument("--input", required=True, type=Path)
    validate.set_defaults(handler=command_validate)

    args = parser.parse_args()
    args.handler(args)


if __name__ == "__main__":
    main()
