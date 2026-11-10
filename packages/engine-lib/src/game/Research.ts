import {
  Gold,
  PlayerType,
  ResearchType,
  UnitType,
} from "@openfront/engine-api/game/GameTypes";

/**
 * Research rules, shared by the engine and the client.
 *
 * A player researches one tech at a time. Starting one costs gold up front;
 * it then needs `points` progress points. Each tick the player gains as many
 * points as the summed levels of their finished Research Labs, so a level-1
 * lab finishes a 300-point tech in 30 seconds and more or bigger labs go
 * faster. A player without a finished lab makes no progress.
 */
export interface ResearchDefinition {
  type: ResearchType;
  cost: Gold;
  points: number;
  requires: ResearchType[];
  /** Structure this tech allows building, if any. */
  unlocks?: UnitType;
}

export const RESEARCH_DEFINITIONS: readonly ResearchDefinition[] = [
  {
    type: ResearchType.Navigation,
    cost: 100_000n,
    points: 300,
    requires: [],
    unlocks: UnitType.Port,
  },
  {
    type: ResearchType.Industry,
    cost: 150_000n,
    points: 300,
    requires: [],
    unlocks: UnitType.Factory,
  },
  {
    type: ResearchType.Fortification,
    cost: 100_000n,
    points: 300,
    requires: [],
    unlocks: UnitType.DefensePost,
  },
  {
    type: ResearchType.Rocketry,
    cost: 500_000n,
    points: 600,
    requires: [ResearchType.Fortification],
    unlocks: UnitType.MissileSilo,
  },
  {
    type: ResearchType.AirDefense,
    cost: 750_000n,
    points: 600,
    requires: [ResearchType.Rocketry],
    unlocks: UnitType.SAMLauncher,
  },
  {
    type: ResearchType.Weapons1,
    cost: 200_000n,
    points: 400,
    requires: [],
  },
  {
    type: ResearchType.Weapons2,
    cost: 500_000n,
    points: 700,
    requires: [ResearchType.Weapons1],
  },
  {
    type: ResearchType.Weapons3,
    cost: 1_000_000n,
    points: 1000,
    requires: [ResearchType.Weapons2],
  },
  {
    type: ResearchType.Armor1,
    cost: 200_000n,
    points: 400,
    requires: [],
  },
  {
    type: ResearchType.Armor2,
    cost: 500_000n,
    points: 700,
    requires: [ResearchType.Armor1],
  },
  {
    type: ResearchType.Armor3,
    cost: 1_000_000n,
    points: 1000,
    requires: [ResearchType.Armor2],
  },
];

const BY_TYPE = new Map<ResearchType, ResearchDefinition>(
  RESEARCH_DEFINITIONS.map((d) => [d.type, d]),
);

const UNLOCKED_BY = new Map<UnitType, ResearchType>(
  RESEARCH_DEFINITIONS.filter((d) => d.unlocks !== undefined).map((d) => [
    d.unlocks!,
    d.type,
  ]),
);

export function researchDefinition(type: ResearchType): ResearchDefinition {
  const def = BY_TYPE.get(type);
  if (def === undefined) {
    throw new Error(`unknown research ${type}`);
  }
  return def;
}

/** The tech a structure needs, or null when it is always available. */
export function researchRequiredFor(unitType: UnitType): ResearchType | null {
  return UNLOCKED_BY.get(unitType) ?? null;
}

/**
 * Research only binds human players: nations and tribes play by the normal
 * rules, so their AI keeps building as before.
 */
export function researchApplies(
  researchEnabled: boolean,
  playerType: PlayerType,
): boolean {
  return researchEnabled && playerType === PlayerType.Human;
}

const WEAPONS = [
  ResearchType.Weapons1,
  ResearchType.Weapons2,
  ResearchType.Weapons3,
];
const ARMOR = [ResearchType.Armor1, ResearchType.Armor2, ResearchType.Armor3];

/** Each Weapons level cuts the troops a player's attacks lose by 10%. */
export const WEAPONS_LOSS_REDUCTION_PER_LEVEL = 0.1;
/** Each Armor level makes attackers lose 10% more troops against the player. */
export const ARMOR_LOSS_INCREASE_PER_LEVEL = 0.1;

function level(
  chain: readonly ResearchType[],
  has: (t: ResearchType) => boolean,
) {
  let n = 0;
  for (const t of chain) {
    if (!has(t)) break;
    n++;
  }
  return n;
}

export function weaponsLevel(has: (t: ResearchType) => boolean): number {
  return level(WEAPONS, has);
}

export function armorLevel(has: (t: ResearchType) => boolean): number {
  return level(ARMOR, has);
}

/** Multiplier on the attacker's troop loss from its Weapons research. */
export function attackLossMultiplier(weapons: number): number {
  return 1 - WEAPONS_LOSS_REDUCTION_PER_LEVEL * weapons;
}

/** Multiplier on the attacker's troop loss from the defender's Armor research. */
export function defenseLossMultiplier(armor: number): number {
  return 1 + ARMOR_LOSS_INCREASE_PER_LEVEL * armor;
}
