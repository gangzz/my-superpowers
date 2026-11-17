"""Offline tests for registered-tool discovery, conflicts and one-shot installation."""

from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parent))
import runtime
from asr_trans_runtime import MODULES, NAME, VERSION


class RuntimeTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name) / "Skill with spaces"
        (self.root / "scripts").mkdir(parents=True)
        (self.root / "runtime").mkdir()
        for name in MODULES:
            (self.root / "scripts" / name).write_text(f"# {name}\n")
        self.wheel = self.root / "runtime" / "asr_trans_runtime-1.0.0-py3-none-any.whl"
        with zipfile.ZipFile(self.wheel, "w") as archive:
            for name in MODULES:
                archive.write(self.root / "scripts" / name, name)
            archive.writestr("asr_trans_runtime-1.0.0.dist-info/METADATA",
                             f"Name: {NAME}\nVersion: {VERSION}\nRequires-Dist: funasr==1.3.22\n\n")
        self.executable = self.root / NAME

    def test_changed_source_rejects_stale_wheel_before_install(self):
        (self.root / "scripts" / MODULES[0]).write_text("changed")
        with self.assertRaisesRegex(runtime.RuntimeErrorDetail, "不一致"):
            runtime.wheel_contract(self.root)

    def test_missing_status_never_installs(self):
        with patch.object(runtime.shutil, "which", return_value="/uv"), \
             patch.object(runtime, "locate", return_value=(False, self.executable)), \
             patch.object(runtime.subprocess, "run") as run:
            self.assertEqual(runtime.ensure(self.root, install=False)["state"], "missing")
            run.assert_not_called()

    def test_registered_runtime_is_reused_without_install(self):
        with patch.object(runtime.shutil, "which", return_value="/uv"), \
             patch.object(runtime, "locate", return_value=(True, self.executable)), \
             patch.object(runtime, "verify", return_value={"healthy": True}), \
             patch.object(runtime.subprocess, "run") as run:
            self.assertTrue(runtime.ensure(self.root, install=True)["reused"])
            run.assert_not_called()

    def test_first_install_uses_bundled_wheel_once(self):
        with patch.object(runtime.shutil, "which", return_value="/uv"), \
             patch.object(runtime, "locate", side_effect=[(False, self.executable), (True, self.executable)]), \
             patch.object(runtime, "verify", return_value={"healthy": True}), \
             patch.object(runtime.subprocess, "run", return_value=subprocess.CompletedProcess([], 0)) as run:
            self.assertFalse(runtime.ensure(self.root, install=True)["reused"])
            self.assertEqual(run.call_count, 1)
            self.assertEqual(run.call_args.args[0][-1], str(self.wheel))
            self.assertNotIn("--force", run.call_args.args[0])

    def test_install_failure_is_not_retried(self):
        with patch.object(runtime.shutil, "which", return_value="/uv"), \
             patch.object(runtime, "locate", return_value=(False, self.executable)), \
             patch.object(runtime.subprocess, "run", return_value=subprocess.CompletedProcess([], 1)) as run:
            with self.assertRaisesRegex(runtime.RuntimeErrorDetail, "没有自动重试"):
                runtime.ensure(self.root, install=True)
            self.assertEqual(run.call_count, 1)

    def test_existing_incompatible_tool_is_never_reinstalled(self):
        with patch.object(runtime.shutil, "which", return_value="/uv"), \
             patch.object(runtime, "locate", return_value=(True, self.executable)), \
             patch.object(runtime, "verify", side_effect=runtime.RuntimeErrorDetail("版本冲突")), \
             patch.object(runtime.subprocess, "run") as run:
            with self.assertRaisesRegex(runtime.RuntimeErrorDetail, "版本冲突"):
                runtime.ensure(self.root, install=True)
            run.assert_not_called()

    def test_unregistered_executable_is_not_overwritten(self):
        self.executable.write_text("owned by someone else")
        with patch.object(runtime, "capture", side_effect=[
            subprocess.CompletedProcess([], 0, "", "No tools installed"),
            subprocess.CompletedProcess([], 0, str(self.root) + "\n", ""),
        ]):
            with self.assertRaisesRegex(runtime.RuntimeErrorDetail, "未登记"):
                runtime.locate("/uv")

    def test_registered_missing_executable_stops(self):
        with patch.object(runtime, "capture", side_effect=[
            subprocess.CompletedProcess([], 0, f"{NAME} v{VERSION}\n- {NAME}\n", ""),
            subprocess.CompletedProcess([], 0, str(self.root) + "\n", ""),
        ]):
            with self.assertRaisesRegex(runtime.RuntimeErrorDetail, "入口缺失"):
                runtime.locate("/uv")

    def test_same_version_different_code_is_rejected(self):
        contract = runtime.wheel_contract(self.root)
        report = {"name": NAME, "version": VERSION, "healthy": True,
                  "requirements": contract["requirements"], "code_sha256": "stale"}
        with patch.object(runtime, "capture", return_value=subprocess.CompletedProcess([], 0, json.dumps(report), "")):
            with self.assertRaisesRegex(runtime.RuntimeErrorDetail, "code_sha256"):
                runtime.verify(self.executable, contract)

    def test_business_project_python_settings_are_not_inherited(self):
        with patch.dict(os.environ, {"PYTHONPATH": "/business", "PYTHONHOME": "/business", "VIRTUAL_ENV": "/business"}):
            environment = runtime.tool_environment()
            for key in ("PYTHONPATH", "PYTHONHOME", "VIRTUAL_ENV"):
                self.assertNotIn(key, environment)


if __name__ == "__main__":
    unittest.main()
