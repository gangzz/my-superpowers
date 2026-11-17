#!/usr/bin/env python3
"""Locate a registered uv tool; install only when absent, never overwrite conflicts."""

from __future__ import annotations

import argparse
from email.parser import BytesParser
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import zipfile

from asr_trans_runtime import NAME, VERSION, PYTHON, code_digest


class RuntimeErrorDetail(RuntimeError):
    pass


def tool_environment() -> dict:
    environment = os.environ.copy()
    # Do not inherit a business project's Python import path or active environment.
    for key in ("PYTHONPATH", "PYTHONHOME", "VIRTUAL_ENV"):
        environment.pop(key, None)
    return environment


def capture(command: list[str]) -> subprocess.CompletedProcess:
    result = subprocess.run(command, capture_output=True, text=True, env=tool_environment())
    if result.returncode:
        raise RuntimeErrorDetail(
            f"命令失败（{result.returncode}）：{command[0]} {' '.join(command[1:3])}\n"
            f"{result.stderr.strip() or result.stdout.strip()}"
        )
    return result


def wheel_contract(root: Path) -> dict:
    wheels = list((root / "runtime").glob("*.whl"))
    if len(wheels) != 1:
        raise RuntimeErrorDetail("Skill 必须随附且只随附一个 runtime/*.whl；请由维护者构建运行包")
    wheel = wheels[0]
    with zipfile.ZipFile(wheel) as archive:
        metadata_files = [name for name in archive.namelist() if name.endswith(".dist-info/METADATA")]
        if len(metadata_files) != 1:
            raise RuntimeErrorDetail("运行包元数据无效")
        info = BytesParser().parsebytes(archive.read(metadata_files[0]))
        digest = code_digest(archive.read)
    local_digest = code_digest(lambda name: (root / "scripts" / name).read_bytes())
    if info["Name"] != NAME or info["Version"] != VERSION or digest != local_digest:
        raise RuntimeErrorDetail("随附运行包与 Skill 源码或版本不一致，请先重新构建；未安装或替换工具")
    return {
        "wheel": wheel,
        "version": info["Version"],
        "code_sha256": digest,
        "requirements": sorted(info.get_all("Requires-Dist", [])),
    }


def locate(uv: str) -> tuple[bool, Path]:
    listing = capture([uv, "tool", "list"]).stdout
    registered = bool(re.search(rf"^{re.escape(NAME)}\s+v\S+", listing, re.MULTILINE))
    directory = Path(capture([uv, "tool", "dir", "--bin"]).stdout.strip())
    executable = directory / (NAME + (".exe" if os.name == "nt" else ""))
    if not registered and (executable.exists() or executable.is_symlink()):
        raise RuntimeErrorDetail(f"命令路径被未登记的文件占用，拒绝覆盖：{executable}")
    if registered and not executable.is_file():
        raise RuntimeErrorDetail(f"工具已登记但入口缺失，停止且不自动重装：{executable}")
    return registered, executable


def verify(executable: Path, contract: dict) -> dict:
    try:
        report = json.loads(capture([str(executable), "doctor"]).stdout)
    except (ValueError, OSError) as error:
        raise RuntimeErrorDetail(f"工具健康检查没有返回有效结果：{error}") from error
    for key, expected in (("name", NAME), ("version", contract["version"]),
                          ("code_sha256", contract["code_sha256"]),
                          ("requirements", contract["requirements"]), ("healthy", True)):
        if report.get(key) != expected:
            raise RuntimeErrorDetail(
                f"工具的 {key} 与当前 Skill 不兼容；停止且不自动升级或覆盖。"
                "请由维护者确认版本后重新安装命名工具。"
            )
    return report


def ensure(root: Path, *, install: bool) -> dict:
    uv = shutil.which("uv")
    if not uv:
        raise RuntimeErrorDetail("找不到 uv；请先安装 uv。本程序不自动安装系统软件")
    contract = wheel_contract(root)
    registered, executable = locate(uv)
    if not registered and not install:
        return {"state": "missing", "name": NAME, "expected_version": VERSION,
                "executable": str(executable)}
    if not registered:
        for name in ("ffmpeg", "ffprobe"):
            if not shutil.which(name):
                raise RuntimeErrorDetail(f"找不到 {name}，停止且不准备运行环境")
        print(f"首次准备 {NAME}：uv 将安装 Python {PYTHON} 和锁定依赖；复用已有缓存。",
              file=sys.stderr)
        result = subprocess.run(
            [uv, "tool", "install", "--no-config", "--python", PYTHON, str(contract["wheel"])],
            env=tool_environment(),
        )
        if result.returncode:
            raise RuntimeErrorDetail("运行工具安装失败；已停止，没有自动重试或生成终稿")
        found, executable = locate(uv)
        if not found:
            raise RuntimeErrorDetail("安装命令结束，但 uv 未登记运行工具；已停止")
    report = verify(executable, contract)
    return {"state": "ready", "name": NAME, "reused": registered,
            "executable": str(executable), **report}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("status", "ensure", "extract", "finalize", "validate"))
    parser.add_argument("arguments", nargs=argparse.REMAINDER)
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    try:
        if args.action in {"status", "ensure"} and args.arguments:
            parser.error("status/ensure 不接受附加参数")
        report = ensure(root, install=args.action != "status")
        if args.action in {"status", "ensure"}:
            print(json.dumps(report, ensure_ascii=False))
            raise SystemExit(0 if report["state"] == "ready" else 3)
        result = subprocess.run([report["executable"], args.action, *args.arguments], env=tool_environment())
        raise SystemExit(result.returncode)
    except (RuntimeErrorDetail, OSError, zipfile.BadZipFile) as error:
        print(f"ASR 运行环境：{error}", file=sys.stderr)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
