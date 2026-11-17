"""Installed ASR commands. Heavy dependencies are imported only by doctor/extract."""

from __future__ import annotations

import contextlib
import hashlib
from importlib import metadata
import json
from pathlib import Path
import shutil
import sys

NAME = "asr-trans-runtime"
VERSION = "1.0.0"
PYTHON = "3.11"
MODULES = ("asr_trans_runtime.py", "extract_asr.py", "transcript_json.py")


def code_digest(read_bytes) -> str:
    digest = hashlib.sha256()
    for name in MODULES:
        digest.update(name.encode())
        digest.update(b"\0")
        digest.update(read_bytes(name))
        digest.update(b"\0")
    return digest.hexdigest()


def doctor() -> dict:
    """Check the installed contract, imports and system tools without loading models."""
    from packaging.requirements import Requirement

    problems = []
    if sys.version_info[:2] != (3, 11):
        problems.append(f"需要 Python {PYTHON}，当前为 {sys.version.split()[0]}")
    requirements = metadata.requires(NAME) or []
    for line in requirements:
        requirement = Requirement(line)
        if requirement.marker and not requirement.marker.evaluate():
            continue
        try:
            installed = metadata.version(requirement.name)
        except metadata.PackageNotFoundError:
            problems.append(f"缺少依赖：{requirement.name}")
            continue
        if not requirement.specifier.contains(installed):
            problems.append(f"依赖不匹配：{requirement}，实际 {installed}")
    dependencies = {}
    with contextlib.redirect_stdout(sys.stderr):
        for name in ("torch", "torchaudio", "funasr"):
            try:
                module = __import__(name)
                dependencies[name] = getattr(module, "__version__", "unknown")
            except Exception as error:
                problems.append(f"{name} 导入失败：{error}")
        try:
            from funasr import AutoModel  # noqa: F401
        except Exception as error:
            problems.append(f"AutoModel 导入失败：{error}")
    programs = {name: shutil.which(name) for name in ("ffmpeg", "ffprobe")}
    problems.extend(f"找不到系统工具：{name}" for name, value in programs.items() if not value)
    directory = Path(__file__).resolve().parent
    return {
        "name": NAME,
        "version": metadata.version(NAME),
        "code_sha256": code_digest(lambda name: (directory / name).read_bytes()),
        "requirements": sorted(requirements),
        "python": sys.executable,
        "python_version": sys.version.split()[0],
        "environment": sys.prefix,
        "dependencies": dependencies,
        "programs": programs,
        "healthy": not problems,
        "problems": problems,
    }


def main() -> None:
    args = sys.argv[1:]
    if args == ["--version"]:
        print(f"{NAME} {VERSION}")
        return
    if args == ["doctor"]:
        result = doctor()
        print(json.dumps(result, ensure_ascii=False))
        raise SystemExit(0 if result["healthy"] else 1)
    if not args or args[0] not in {"extract", "finalize", "validate"}:
        print("用法：asr-trans-runtime doctor|extract|finalize|validate [参数]", file=sys.stderr)
        raise SystemExit(2)
    action, rest = args[0], args[1:]
    if action == "extract":
        import extract_asr

        sys.argv = [sys.argv[0], *rest]
        extract_asr.main()
    else:
        import transcript_json

        sys.argv = [sys.argv[0], action, *rest]
        transcript_json.main()


if __name__ == "__main__":
    main()
