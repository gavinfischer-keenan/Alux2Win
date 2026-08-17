"""Tests for Alux2Win project structure, configuration, and architecture integrity."""
from __future__ import annotations

import json
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent


class TestProjectStructure:
    """Validate core project configuration and entry point files."""

    def test_package_json_validity(self):
        pkg_file = REPO_ROOT / "package.json"
        assert pkg_file.exists(), "package.json must exist"
        data = json.loads(pkg_file.read_text(encoding="utf-8"))
        assert data.get("name") == "lux"
        assert "dependencies" in data
        assert "pixi.js" in data["dependencies"]
        assert "devDependencies" in data
        assert "vite" in data["devDependencies"]
        assert "typescript" in data["devDependencies"]

    def test_tsconfig_validity(self):
        tsconfig_file = REPO_ROOT / "tsconfig.json"
        assert tsconfig_file.exists(), "tsconfig.json must exist"
        data = json.loads(tsconfig_file.read_text(encoding="utf-8"))
        assert "compilerOptions" in data
        opts = data["compilerOptions"]
        assert opts.get("target") in ["ESNext", "ES2022"]
        assert opts.get("module") in ["ESNext", "ES2022"]

    def test_entry_files_exist(self):
        assert (REPO_ROOT / "index.html").exists(), "index.html must exist"
        assert (REPO_ROOT / "src" / "main.ts").exists(), "src/main.ts must exist"
        assert (REPO_ROOT / "src" / "App.ts").exists(), "src/App.ts must exist"
        assert (REPO_ROOT / "src" / "types.ts").exists(), "src/types.ts must exist"

    def test_architecture_documentation_link(self):
        arch_doc = REPO_ROOT / "ARCHITECTURE.md"
        assert arch_doc.exists(), "ARCHITECTURE.md must exist"
        content = arch_doc.read_text(encoding="utf-8")
        assert "Spatial Hashing" in content
        assert "Combat" in content
        assert "AIController" in content
        
        readme = REPO_ROOT / "README.md"
        assert readme.exists()
        assert "ARCHITECTURE.md" in readme.read_text(encoding="utf-8")
