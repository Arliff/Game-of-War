import {
  PlayerInfo,
  PlayerType,
  ResearchType,
  TerrainType,
  UnitType,
} from "@openfront/engine-api/game/GameTypes";
import { researchDefinition } from "@openfront/engine-lib/game/Research";
import {
  AttackLogicInput,
  EngineConfig,
} from "@openfront/engine/configuration/EngineConfig";
import { PlayerExecution } from "@openfront/engine/execution/PlayerExecution";
import { ResearchExecution } from "@openfront/engine/execution/ResearchExecution";
import { Game, Player } from "@openfront/engine/game/Game";
import { setup } from "./util/Setup";
import { expectSnapshotRoundTrip } from "./util/Snapshot";
import { executeTicks } from "./util/utils";

const MAP = "plains";

let game: Game;
let player: Player;
let nation: Player;

function conquerBox(p: Player, x0: number, y0: number, x1: number, y1: number) {
  for (let x = x0; x < x1; x++) {
    for (let y = y0; y < y1; y++) p.conquer(game.ref(x, y));
  }
}

function canBuild(p: Player, type: UnitType, x: number, y: number): boolean {
  return p.canBuild(type, game.ref(x, y)) !== false;
}

/** Researches `type` to completion with one level-1 lab. */
function research(p: Player, type: ResearchType) {
  expect(p.startResearch(type)).toBe(true);
  for (let i = 0; i < researchDefinition(type).points; i++) p.tickResearch();
  expect(p.hasResearched(type)).toBe(true);
}

async function setupGame(researchEnabled: boolean) {
  game = await setup(MAP, { instantBuild: true, research: researchEnabled }, [
    new PlayerInfo("player", PlayerType.Human, "client1", "player_id"),
    new PlayerInfo("nation", PlayerType.Nation, null, "nation_id"),
  ]);
  player = game.player("player_id");
  nation = game.player("nation_id");
  conquerBox(player, 0, 0, 50, 50);
  conquerBox(nation, 60, 60, 99, 99);
  player.addGold(100_000_000n);
  nation.addGold(100_000_000n);
}

describe("Research disabled", () => {
  beforeEach(() => setupGame(false));

  test("structures build as before and the lab does not exist", () => {
    expect(canBuild(player, UnitType.DefensePost, 10, 10)).toBe(true);
    expect(canBuild(player, UnitType.MissileSilo, 10, 10)).toBe(true);
    expect(canBuild(player, UnitType.Factory, 10, 10)).toBe(true);
    expect(canBuild(player, UnitType.ResearchLab, 10, 10)).toBe(false);
    expect(game.config().isUnitDisabled(UnitType.ResearchLab)).toBe(true);
  });

  test("research cannot be started and gives no bonus", () => {
    expect(player.canStartResearch(ResearchType.Weapons1)).toBe(false);
    expect(player.weaponsLevel()).toBe(0);
    expect(player.armorLevel()).toBe(0);
  });
});

describe("Research enabled", () => {
  beforeEach(() => setupGame(true));

  test("locked structures need their research; city and lab do not", () => {
    expect(canBuild(player, UnitType.DefensePost, 10, 10)).toBe(false);
    expect(canBuild(player, UnitType.MissileSilo, 10, 10)).toBe(false);
    expect(canBuild(player, UnitType.SAMLauncher, 10, 10)).toBe(false);
    expect(canBuild(player, UnitType.Factory, 10, 10)).toBe(false);
    expect(canBuild(player, UnitType.City, 10, 10)).toBe(true);
    expect(canBuild(player, UnitType.ResearchLab, 10, 10)).toBe(true);
  });

  test("buildableUnits reports locked structures as unbuildable", () => {
    const bu = player.buildableUnits(game.ref(10, 10));
    const byType = new Map(bu.map((b) => [b.type, b]));
    expect(byType.get(UnitType.DefensePost)!.canBuild).toBe(false);
    expect(byType.get(UnitType.ResearchLab)!.canBuild).not.toBe(false);
  });

  test("nations are not bound by research", () => {
    expect(canBuild(nation, UnitType.DefensePost, 80, 80)).toBe(true);
    expect(canBuild(nation, UnitType.MissileSilo, 80, 80)).toBe(true);
    expect(nation.canStartResearch(ResearchType.Weapons1)).toBe(false);
  });

  test("research needs a lab", () => {
    expect(player.canStartResearch(ResearchType.Fortification)).toBe(false);
    player.buildUnit(UnitType.ResearchLab, game.ref(10, 10), {});
    expect(player.canStartResearch(ResearchType.Fortification)).toBe(true);
  });

  test("starting research charges gold and blocks a second one", () => {
    player.buildUnit(UnitType.ResearchLab, game.ref(10, 10), {});
    const before = player.gold();
    expect(player.startResearch(ResearchType.Fortification)).toBe(true);
    expect(before - player.gold()).toBe(
      researchDefinition(ResearchType.Fortification).cost,
    );
    expect(player.activeResearch()?.type).toBe(ResearchType.Fortification);
    expect(player.canStartResearch(ResearchType.Industry)).toBe(false);
    expect(player.startResearch(ResearchType.Industry)).toBe(false);
  });

  test("research needs its prerequisites and gold", () => {
    player.buildUnit(UnitType.ResearchLab, game.ref(10, 10), {});
    expect(player.canStartResearch(ResearchType.Rocketry)).toBe(false);
    expect(player.canStartResearch(ResearchType.Weapons2)).toBe(false);
    research(player, ResearchType.Fortification);
    expect(player.canStartResearch(ResearchType.Rocketry)).toBe(true);

    player.removeGold(player.gold());
    expect(player.canStartResearch(ResearchType.Rocketry)).toBe(false);
  });

  test("completing research unlocks the structure", () => {
    player.buildUnit(UnitType.ResearchLab, game.ref(10, 10), {});
    research(player, ResearchType.Fortification);
    expect(player.activeResearch()).toBeNull();
    expect(canBuild(player, UnitType.DefensePost, 30, 30)).toBe(true);
    expect(canBuild(player, UnitType.MissileSilo, 30, 30)).toBe(false);
    expect(player.canStartResearch(ResearchType.Fortification)).toBe(false);
  });

  test("progress per tick is the summed level of finished labs", () => {
    expect(player.researchSpeed()).toBe(0);
    const lab = player.buildUnit(UnitType.ResearchLab, game.ref(10, 10), {});
    expect(player.researchSpeed()).toBe(1);
    lab.increaseLevel();
    player.buildUnit(UnitType.ResearchLab, game.ref(40, 40), {});
    expect(player.researchSpeed()).toBe(3);

    player.startResearch(ResearchType.Navigation);
    player.tickResearch();
    expect(player.activeResearch()!.progress).toBe(3);
  });

  test("labs under construction do not research", () => {
    const lab = player.buildUnit(UnitType.ResearchLab, game.ref(10, 10), {});
    lab.setUnderConstruction(true);
    expect(player.researchSpeed()).toBe(0);
    expect(player.canStartResearch(ResearchType.Navigation)).toBe(true);
    player.startResearch(ResearchType.Navigation);
    player.tickResearch();
    expect(player.activeResearch()!.progress).toBe(0);
  });

  test("weapons and armor levels follow their chains", () => {
    player.buildUnit(UnitType.ResearchLab, game.ref(10, 10), {});
    research(player, ResearchType.Weapons1);
    research(player, ResearchType.Weapons2);
    research(player, ResearchType.Armor1);
    expect(player.weaponsLevel()).toBe(2);
    expect(player.armorLevel()).toBe(1);
  });

  test("research intent runs through the game loop", () => {
    game.addExecution(new PlayerExecution(player));
    player.buildUnit(UnitType.ResearchLab, game.ref(10, 10), {});
    game.addExecution(new ResearchExecution(player, ResearchType.Industry));
    executeTicks(game, researchDefinition(ResearchType.Industry).points + 2);
    expect(player.hasResearched(ResearchType.Industry)).toBe(true);
    expect(canBuild(player, UnitType.Factory, 30, 30)).toBe(true);
  });

  test("research status lists every option", () => {
    player.buildUnit(UnitType.ResearchLab, game.ref(10, 10), {});
    research(player, ResearchType.Navigation);
    const status = player.researchStatus();
    expect(status.completed).toEqual([ResearchType.Navigation]);
    expect(status.speed).toBe(1);
    const nav = status.options.find((o) => o.type === ResearchType.Navigation)!;
    expect(nav.completed).toBe(true);
    expect(nav.canStart).toBe(false);
    const weapons = status.options.find(
      (o) => o.type === ResearchType.Weapons1,
    )!;
    expect(weapons.canStart).toBe(true);
  });

  test("research survives a snapshot round trip", async () => {
    game.addExecution(new PlayerExecution(player));
    player.buildUnit(UnitType.ResearchLab, game.ref(10, 10), {});
    research(player, ResearchType.Weapons1);
    player.startResearch(ResearchType.Armor1);
    player.tickResearch();
    const restored = await expectSnapshotRoundTrip(game, MAP, 10);
    const p = restored.player("player_id");
    expect(p.hasResearched(ResearchType.Weapons1)).toBe(true);
    expect(p.activeResearch()?.type).toBe(ResearchType.Armor1);
  });
});

describe("Research combat modifiers", () => {
  beforeEach(() => setupGame(true));

  function input(weaponsLevel: number, armorLevel: number): AttackLogicInput {
    return {
      terrain: TerrainType.Plains,
      attackTroops: 10_000,
      attacker: { type: PlayerType.Human, numTiles: 1000, weaponsLevel },
      defender: {
        type: PlayerType.Human,
        numTiles: 1000,
        troops: 10_000,
        isTraitor: false,
        isDisconnectedTeammate: false,
        armorLevel,
      },
      defenderHasDefensePost: false,
      falloutRatio: null,
      borderSize: 50,
    };
  }

  test("weapons cut and armor raises the attacker's losses", () => {
    // TestConfig stubs attackLogic out; use the real one.
    const config = {
      attackLogic: (i: AttackLogicInput) =>
        EngineConfig.prototype.attackLogic.call(game.config(), i),
    };
    const base = config.attackLogic(input(0, 0)).attackerTroopLoss;
    expect(config.attackLogic(input(3, 0)).attackerTroopLoss).toBeCloseTo(
      base * 0.7,
    );
    expect(config.attackLogic(input(0, 2)).attackerTroopLoss).toBeCloseTo(
      base * 1.2,
    );
    // Defender losses and speed are unchanged.
    expect(config.attackLogic(input(3, 3)).defenderTroopLoss).toBe(
      config.attackLogic(input(0, 0)).defenderTroopLoss,
    );
    expect(config.attackLogic(input(3, 3)).tickFraction).toBe(
      config.attackLogic(input(0, 0)).tickFraction,
    );
  });
});
