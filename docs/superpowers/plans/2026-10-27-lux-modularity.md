# Lux modularity and performance implementation plan

Goal: Preserve game rules, AI choices, levels, ordering, settings keys, and browser-only execution while reducing hot-path cost and clarifying module boundaries.

Approved approach: incremental refactor, as selected by Gavin. Existing uncommitted tests are preserved (patch saved outside the repository); only authored files are committed.

1. Establish full test/build baseline and deterministic collision benchmark (distributed and dense cases). Record timing as local CPU evidence, not browser FPS.
2. Extract pure createGameState(levelData, random) and renderUnitGraph(history) modules from GameScene. Characterize initialization with seeded random, no mutation of input levels, and independent state instances.
3. Extract SimulationPipeline and PlanetCollisionSystem. Keep exact system ordering, hazard gating, audio signals, and simulation timing; compact dead particles/effects in place with stable order. Add ordering, disabled-hazard, collision, and compaction tests.
4. Extract AI wave liveness pruning with one indexed particle pass instead of repeated find scans. Preserve wave order and original first-match semantics. Test all modes, dead/missing IDs, duplicate IDs, empty input, and immediate pruning.
5. Replace collision pair-key Set with bounded ordinal bitset bookkeeping and sparse fallback (preserves asymmetric neighborhoods without numeric precision hazards). Regression-test permutations, simultaneous damage, high IDs, and deterministic randomized equivalence against the legacy algorithm.
6. Add scoped EventBus subscription cleanup; destroy AI on scene teardown. Fix stop-during-update scheduling in GameLoop with fake-frame tests; preserve fixed step, pause, speed behavior. Remove redundant async Pixi import.
7. Run unit/schema/build checks, compare benchmark, review whole diff, smoke-test browser tutorial/pause/restart/editor, document ownership and future split seams. Deploy only verified static artifacts and retain previous release.

Constraints: No gameplay redesign, backend, new framework, storage migration, tuning changes, or dependency major upgrades. Preserve required credits and current names.

Verification: npm test; python -m pytest tests; npm run build -- --base=/play/; deterministic before/after benchmark; live byte/hash checks and browser smoke test.
