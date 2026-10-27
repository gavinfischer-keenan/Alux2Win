"""Tests for Pea Puffer / Lux TypeScript systems, core components, and AI contracts."""
from __future__ import annotations

import re
from pathlib import Path
import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = REPO_ROOT / "src"


class TestSystemsContracts:
    """Validate system source code contracts and exports."""

    def test_core_systems_exist(self):
        systems_dir = SRC_DIR / "systems"
        assert systems_dir.exists()
        
        required_systems = [
            "MovementSystem.ts",
            "GravitySystem.ts",
            "CollisionSystem.ts",
            "CombatSystem.ts",
            "ProductionSystem.ts",
            "AsteroidSystem.ts",
            "GammaRaySystem.ts",
        ]
        for sys_file in required_systems:
            p = systems_dir / sys_file
            assert p.exists(), f"System {sys_file} must exist"
            content = p.read_text(encoding="utf-8")
            assert "class " in content or "export " in content, f"{sys_file} must declare exported classes or functions"

    def test_spatial_hash_contract(self):
        spatial_file = SRC_DIR / "core" / "SpatialHash.ts"
        assert spatial_file.exists()
        content = spatial_file.read_text(encoding="utf-8")
        assert "class SpatialHash" in content or "SpatialHash" in content
        assert "insert" in content or "add" in content or "query" in content or "clear" in content

    def test_ai_controller_contract(self):
        ai_file = SRC_DIR / "ai" / "AIController.ts"
        assert ai_file.exists()
        content = ai_file.read_text(encoding="utf-8")
        assert "AIController" in content
        assert "update" in content or "think" in content or "evaluate" in content or "decide" in content

    def test_ai_strategies_contract(self):
        strategies_file = SRC_DIR / "ai" / "AIStrategies.ts"
        assert strategies_file.exists(), "src/ai/AIStrategies.ts must exist"
        content = strategies_file.read_text(encoding="utf-8")
        assert "export" in content
        assert "executeBerserkerStrategy" in content or "Strategy" in content

    def test_types_definitions(self):
        types_file = SRC_DIR / "types.ts"
        assert types_file.exists()
        content = types_file.read_text(encoding="utf-8")
        assert "interface " in content or "type " in content
