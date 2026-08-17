// ============================================================
// AIStrategies.ts — Strategy parameter tables & sub-roles for LUX AI
// ============================================================

import type { Faction, UpgradeLevel, PlanetData } from '../types';
import type { AIDifficulty } from '../core/SettingsStore';

/** The high-level intentions the AI can be in. */
export type AIState =
  | 'defend'
  | 'conquer_neutral'
  | 'upgrade'
  | 'attack'
  | 'retreat'
  | 'breakthrough'
  | 'counterattack';

/** Sub-roles for NORMAL difficulty. */
export type NormalSubRole = 'fortress' | 'balanced' | 'opportunist' | 'expander';

/** Sub-roles for HARD difficulty. */
export type HardSubRole = 'berserker' | 'economic' | 'blitzkrieg' | 'dominator';

export type AISubRole = NormalSubRole | HardSubRole | 'easy_turtle';

export interface AIStrategy {
  evalInterval: number;
  evalJitter: number;
  minToDeploy: number;
  reserveParticles: number;
  aggressionRatio: number;
  upgradeTrigger: number;
  neutralAttackCap: number;
  upgradeFraction: number;
  neutralFraction: number;
  attackFraction: number;
  upgradeWeight: number;
  hazardToleranceThreshold: number;
  usesWaypoints: boolean;
  expandWeight: number;
  maxUpgrade: UpgradeLevel;
  defendTimeout: number;
  opportunityRange: number;
  maxSources: number;

  // Counterattack parameters
  counterattackChance: number;
  counterattackDefenseRatio: number;
  counterattackMinDefenders: number;

  // Breakthrough parameters
  breakthroughChance: number;
  breakthroughScanRadius: number;
  breakthroughWeaknessThreshold: number;
  breakthroughSurgeFraction: number;
  breakthroughConsolidateSecs: number;
  breakthroughMaxTargets: number;

  // Futility detection
  futilityEnabled: boolean;
  futilityTimeoutSecs: number;
  futilityMaxWaves: number;
  futilityProgressThreshold: number;
  futilityGrowthPauseSecs: number;

  // Early-game attack gate
  earlyGameAttackBlockSecs: number;

  // Production-rate emergency
  productionEmergencyEnabled: boolean;
  productionEmergencyThreshold: number;

  // Expansion control
  overflowThreshold: number;
  minToDeployNeutral: number;
  earlyGameExpandForcedSecs: number;
}

export interface FutilityEntry {
  targetFaction: Faction;
  startedAt: number;
  wavesSent: number;
  enemyParticlesAtStart: number;
}

export interface AIWave {
  faction: Faction;
  targetPlanetId: string;
  particleIds: number[];
  originalTargetFaction: Faction;
  sentAt: number;
  waypointX?: number;
  waypointY?: number;
}

export interface BreakthroughEntry {
  surgeTargetIds: Set<string>;
  launchedAt: number;
  consolidateSecs: number;
}

export interface SituationAssessment {
  myPlanets: PlanetData[];
  myParticles: number;
  myProduction: number;
  neutralsAvailable: PlanetData[];
  totalEnemyParticles: number;
  bestEnemyProduction: number;
  bestEnemyParticles: number;
  strongestEnemyFaction: Faction | null;
  highestProductionFaction: Faction | null;
  productionAdvantage: number;
  unitAdvantage: number;
  enemyFactions: Map<Faction, { planets: PlanetData[]; particles: number; production: number }>;
  isVisionBlocked: boolean;
  canUpgradeForVision: boolean;
}

export const STRATEGIES: Record<AISubRole, AIStrategy> = {
  // ── EASY ────────────────────────────────────────────────────────────────────
  easy_turtle: {
    evalInterval: 5.5,
    evalJitter: 1.5,
    minToDeploy: 18,
    reserveParticles: 15,
    aggressionRatio: 2.5,
    upgradeTrigger: 80,
    neutralAttackCap: 3,
    upgradeFraction: 0.35,
    neutralFraction: 0.45,
    attackFraction: 0.40,
    upgradeWeight: 0.6,
    expandWeight: 0.7,
    maxUpgrade: 2,
    hazardToleranceThreshold: -999,
    usesWaypoints: true,
    defendTimeout: 20,
    opportunityRange: 300,
    maxSources: 1,
    counterattackChance: 0.0,
    counterattackDefenseRatio: 1.0,
    counterattackMinDefenders: 99,
    breakthroughChance: 0.0,
    breakthroughScanRadius: 0,
    breakthroughWeaknessThreshold: 0,
    breakthroughSurgeFraction: 0,
    breakthroughConsolidateSecs: 0,
    breakthroughMaxTargets: 0,
    futilityEnabled: false,
    futilityTimeoutSecs: 0,
    futilityMaxWaves: 0,
    futilityProgressThreshold: 1.0,
    futilityGrowthPauseSecs: 0,
    earlyGameAttackBlockSecs: 0,
    productionEmergencyEnabled: false,
    productionEmergencyThreshold: 0,
    overflowThreshold: 30,
    minToDeployNeutral: 8,
    earlyGameExpandForcedSecs: 60,
  },

  // ── NORMAL ──────────────────────────────────────────────────────────────────
  fortress: {
    evalInterval: 2.5,
    evalJitter: 0.6,
    minToDeploy: 12,
    reserveParticles: 10,
    aggressionRatio: 1.6,
    upgradeTrigger: 30,
    neutralAttackCap: 50,
    upgradeFraction: 0.55,
    neutralFraction: 0.80,
    attackFraction: 0.50,
    upgradeWeight: 0.85,
    expandWeight: 0.95,
    maxUpgrade: 3,
    hazardToleranceThreshold: -79,
    usesWaypoints: true,
    defendTimeout: 10,
    opportunityRange: 400,
    maxSources: 2,
    counterattackChance: 0.10,
    counterattackDefenseRatio: 0.80,
    counterattackMinDefenders: 10,
    breakthroughChance: 0.05,
    breakthroughScanRadius: 350,
    breakthroughWeaknessThreshold: 8,
    breakthroughSurgeFraction: 0.20,
    breakthroughConsolidateSecs: 25,
    breakthroughMaxTargets: 1,
    futilityEnabled: true,
    futilityTimeoutSecs: 120,
    futilityMaxWaves: 3,
    futilityProgressThreshold: 0.90,
    futilityGrowthPauseSecs: 90,
    earlyGameAttackBlockSecs: 180,
    productionEmergencyEnabled: true,
    productionEmergencyThreshold: 0.70,
    overflowThreshold: 25,
    minToDeployNeutral: 4,
    earlyGameExpandForcedSecs: 0,
  },
  balanced: {
    evalInterval: 2.0,
    evalJitter: 0.5,
    minToDeploy: 6,
    reserveParticles: 3,
    aggressionRatio: 0.9,
    upgradeTrigger: 20,
    neutralAttackCap: 30,
    upgradeFraction: 0.50,
    neutralFraction: 0.85,
    attackFraction: 0.75,
    upgradeWeight: 0.55,
    expandWeight: 0.85,
    maxUpgrade: 3,
    hazardToleranceThreshold: -499,
    usesWaypoints: true,
    defendTimeout: 8,
    opportunityRange: 500,
    maxSources: 2,
    counterattackChance: 0.35,
    counterattackDefenseRatio: 0.60,
    counterattackMinDefenders: 6,
    breakthroughChance: 0.35,
    breakthroughScanRadius: 450,
    breakthroughWeaknessThreshold: 12,
    breakthroughSurgeFraction: 0.35,
    breakthroughConsolidateSecs: 20,
    breakthroughMaxTargets: 2,
    futilityEnabled: true,
    futilityTimeoutSecs: 90,
    futilityMaxWaves: 4,
    futilityProgressThreshold: 0.90,
    futilityGrowthPauseSecs: 60,
    earlyGameAttackBlockSecs: 0,
    productionEmergencyEnabled: true,
    productionEmergencyThreshold: 0.70,
    overflowThreshold: 20,
    minToDeployNeutral: 3,
    earlyGameExpandForcedSecs: 180,
  },
  opportunist: {
    evalInterval: 1.5,
    evalJitter: 0.4,
    minToDeploy: 5,
    reserveParticles: 2,
    aggressionRatio: 0.8,
    upgradeTrigger: 20,
    neutralAttackCap: 20,
    upgradeFraction: 0.35,
    neutralFraction: 0.75,
    attackFraction: 0.80,
    upgradeWeight: 0.35,
    expandWeight: 0.85,
    maxUpgrade: 3,
    hazardToleranceThreshold: -499,
    usesWaypoints: true,
    defendTimeout: 6,
    opportunityRange: 600,
    maxSources: 2,
    counterattackChance: 0.60,
    counterattackDefenseRatio: 0.40,
    counterattackMinDefenders: 4,
    breakthroughChance: 0.65,
    breakthroughScanRadius: 550,
    breakthroughWeaknessThreshold: 16,
    breakthroughSurgeFraction: 0.50,
    breakthroughConsolidateSecs: 18,
    breakthroughMaxTargets: 2,
    futilityEnabled: true,
    futilityTimeoutSecs: 60,
    futilityMaxWaves: 5,
    futilityProgressThreshold: 0.90,
    futilityGrowthPauseSecs: 45,
    earlyGameAttackBlockSecs: 0,
    productionEmergencyEnabled: true,
    productionEmergencyThreshold: 0.65,
    overflowThreshold: 18,
    minToDeployNeutral: 3,
    earlyGameExpandForcedSecs: 60,
  },
  expander: {
    evalInterval: 1.8,
    evalJitter: 0.5,
    minToDeploy: 5,
    reserveParticles: 2,
    aggressionRatio: 1.3,
    upgradeTrigger: 25,
    neutralAttackCap: 60,
    upgradeFraction: 0.30,
    neutralFraction: 0.90,
    attackFraction: 0.55,
    upgradeWeight: 0.25,
    expandWeight: 0.99,
    maxUpgrade: 3,
    hazardToleranceThreshold: -999,
    usesWaypoints: true,
    defendTimeout: 8,
    opportunityRange: 450,
    maxSources: 2,
    counterattackChance: 0.15,
    counterattackDefenseRatio: 0.75,
    counterattackMinDefenders: 8,
    breakthroughChance: 0.20,
    breakthroughScanRadius: 400,
    breakthroughWeaknessThreshold: 8,
    breakthroughSurgeFraction: 0.25,
    breakthroughConsolidateSecs: 15,
    breakthroughMaxTargets: 1,
    futilityEnabled: true,
    futilityTimeoutSecs: 75,
    futilityMaxWaves: 3,
    futilityProgressThreshold: 0.90,
    futilityGrowthPauseSecs: 60,
    earlyGameAttackBlockSecs: 120,
    productionEmergencyEnabled: true,
    productionEmergencyThreshold: 0.60,
    overflowThreshold: 12,
    minToDeployNeutral: 2,
    earlyGameExpandForcedSecs: 360,
  },

  // ── HARD ────────────────────────────────────────────────────────────────────
  berserker: {
    evalInterval: 1.0,
    evalJitter: 0.3,
    minToDeploy: 4,
    reserveParticles: 1,
    aggressionRatio: 0.6,
    upgradeTrigger: 15,
    neutralAttackCap: 20,
    upgradeFraction: 0.25,
    neutralFraction: 0.80,
    attackFraction: 0.95,
    upgradeWeight: 0.20,
    expandWeight: 0.60,
    maxUpgrade: 3,
    hazardToleranceThreshold: -999,
    usesWaypoints: true,
    defendTimeout: 4,
    opportunityRange: 700,
    maxSources: 3,
    counterattackChance: 0.90,
    counterattackDefenseRatio: 0.20,
    counterattackMinDefenders: 2,
    breakthroughChance: 0.90,
    breakthroughScanRadius: 700,
    breakthroughWeaknessThreshold: 30,
    breakthroughSurgeFraction: 0.70,
    breakthroughConsolidateSecs: 12,
    breakthroughMaxTargets: 3,
    futilityEnabled: false,
    futilityTimeoutSecs: 0,
    futilityMaxWaves: 0,
    futilityProgressThreshold: 1.0,
    futilityGrowthPauseSecs: 0,
    earlyGameAttackBlockSecs: 0,
    productionEmergencyEnabled: true,
    productionEmergencyThreshold: 0.50,
    overflowThreshold: 12,
    minToDeployNeutral: 2,
    earlyGameExpandForcedSecs: 0,
  },
  economic: {
    evalInterval: 1.5,
    evalJitter: 0.4,
    minToDeploy: 5,
    reserveParticles: 2,
    aggressionRatio: 1.3,
    upgradeTrigger: 20,
    neutralAttackCap: 8,
    upgradeFraction: 0.75,
    neutralFraction: 0.60,
    attackFraction: 0.70,
    upgradeWeight: 0.90,
    expandWeight: 0.70,
    maxUpgrade: 3,
    hazardToleranceThreshold: -499,
    usesWaypoints: true,
    defendTimeout: 6,
    opportunityRange: 500,
    maxSources: 3,
    counterattackChance: 0.20,
    counterattackDefenseRatio: 0.75,
    counterattackMinDefenders: 8,
    breakthroughChance: 0.20,
    breakthroughScanRadius: 400,
    breakthroughWeaknessThreshold: 10,
    breakthroughSurgeFraction: 0.25,
    breakthroughConsolidateSecs: 30,
    breakthroughMaxTargets: 1,
    futilityEnabled: true,
    futilityTimeoutSecs: 90,
    futilityMaxWaves: 3,
    futilityProgressThreshold: 0.90,
    futilityGrowthPauseSecs: 75,
    earlyGameAttackBlockSecs: 120,
    productionEmergencyEnabled: true,
    productionEmergencyThreshold: 0.80,
    overflowThreshold: 22,
    minToDeployNeutral: 3,
    earlyGameExpandForcedSecs: 90,
  },
  blitzkrieg: {
    evalInterval: 1.0,
    evalJitter: 0.3,
    minToDeploy: 3,
    reserveParticles: 1,
    aggressionRatio: 0.7,
    upgradeTrigger: 15,
    neutralAttackCap: 30,
    upgradeFraction: 0.30,
    neutralFraction: 0.95,
    attackFraction: 0.90,
    upgradeWeight: 0.20,
    expandWeight: 0.95,
    maxUpgrade: 2,
    hazardToleranceThreshold: -999,
    usesWaypoints: true,
    defendTimeout: 3,
    opportunityRange: 600,
    maxSources: 3,
    counterattackChance: 0.80,
    counterattackDefenseRatio: 0.25,
    counterattackMinDefenders: 2,
    breakthroughChance: 0.80,
    breakthroughScanRadius: 600,
    breakthroughWeaknessThreshold: 20,
    breakthroughSurgeFraction: 0.60,
    breakthroughConsolidateSecs: 10,
    breakthroughMaxTargets: 3,
    futilityEnabled: true,
    futilityTimeoutSecs: 45,
    futilityMaxWaves: 6,
    futilityProgressThreshold: 0.90,
    futilityGrowthPauseSecs: 30,
    earlyGameAttackBlockSecs: 60,
    productionEmergencyEnabled: true,
    productionEmergencyThreshold: 0.65,
    overflowThreshold: 14,
    minToDeployNeutral: 2,
    earlyGameExpandForcedSecs: 60,
  },
  dominator: {
    evalInterval: 1.2,
    evalJitter: 0.4,
    minToDeploy: 5,
    reserveParticles: 2,
    aggressionRatio: 0.8,
    upgradeTrigger: 20,
    neutralAttackCap: 10,
    upgradeFraction: 0.50,
    neutralFraction: 0.70,
    attackFraction: 0.90,
    upgradeWeight: 0.60,
    expandWeight: 0.75,
    maxUpgrade: 3,
    hazardToleranceThreshold: -499,
    usesWaypoints: true,
    defendTimeout: 5,
    opportunityRange: 600,
    maxSources: 3,
    counterattackChance: 0.55,
    counterattackDefenseRatio: 0.50,
    counterattackMinDefenders: 5,
    breakthroughChance: 0.55,
    breakthroughScanRadius: 500,
    breakthroughWeaknessThreshold: 15,
    breakthroughSurgeFraction: 0.45,
    breakthroughConsolidateSecs: 20,
    breakthroughMaxTargets: 2,
    futilityEnabled: true,
    futilityTimeoutSecs: 80,
    futilityMaxWaves: 4,
    futilityProgressThreshold: 0.90,
    futilityGrowthPauseSecs: 55,
    earlyGameAttackBlockSecs: 0,
    productionEmergencyEnabled: true,
    productionEmergencyThreshold: 0.70,
    overflowThreshold: 20,
    minToDeployNeutral: 3,
    earlyGameExpandForcedSecs: 60,
  },
};

export const NORMAL_ROLES: NormalSubRole[] = ['fortress', 'balanced', 'opportunist', 'expander'];
export const HARD_ROLES:   HardSubRole[]   = ['berserker', 'economic', 'blitzkrieg', 'dominator'];

export function pickSubRole(difficulty: AIDifficulty): AISubRole {
  switch (difficulty) {
    case 'easy':   return 'easy_turtle';
    case 'hard':   return HARD_ROLES[Math.floor(Math.random() * HARD_ROLES.length)];
    default:       return NORMAL_ROLES[Math.floor(Math.random() * NORMAL_ROLES.length)];
  }
}
