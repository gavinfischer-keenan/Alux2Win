"""Tests for Alux2Win level definitions and schema compliance."""
from __future__ import annotations

import json
from pathlib import Path
import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent
LEVELS_DIR = REPO_ROOT / "src" / "levels"


class TestLevelSchemas:
    """Validate all JSON level files against game requirements."""

    def test_levels_directory_exists(self):
        assert LEVELS_DIR.exists(), "src/levels directory must exist"

    def test_test_level_json_structure(self):
        level_file = LEVELS_DIR / "test_level.json"
        assert level_file.exists(), "test_level.json must exist"
        data = json.loads(level_file.read_text(encoding="utf-8-sig"))
        assert "planets" in data
        assert isinstance(data["planets"], list)

    def test_all_level_json_files_are_valid(self):
        json_files = list(LEVELS_DIR.glob("*.json")) + list(REPO_ROOT.glob("*level*.json"))
        assert len(json_files) > 0, "Should have at least one level JSON file"

        for jf in json_files:
            content = jf.read_text(encoding="utf-8-sig")
            data = json.loads(content)
            assert isinstance(data, dict), f"{jf.name} must be a JSON object"
            if "planets" in data:
                for planet in data["planets"]:
                    assert "x" in planet and "y" in planet, f"Planet in {jf.name} must have x and y"
                    has_attr = any(k in planet for k in ("radius", "size", "team", "faction", "id", "units"))
                    assert has_attr, f"Planet in {jf.name} missing attributes"
