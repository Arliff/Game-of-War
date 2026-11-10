import { ResearchType } from "@openfront/engine-api/game/GameTypes";
import { zPlayerRef } from "@openfront/engine-lib/snapshot/SnapshotType";
import { z } from "zod";
import { Execution, Game, Player } from "../game/Game";
import { execSnapshotType } from "../snapshot/ExecutionSnapshot";
import type {
  ExecRecord,
  SnapshotReader,
  SnapshotWriter,
} from "../snapshot/SnapshotContext";

/**
 * Starts a research for a player. One-shot: the player pays up front and
 * PlayerExecution advances the research each tick (Player.tickResearch).
 */
export class ResearchExecution implements Execution {
  constructor(
    private player: Player,
    private research: ResearchType,
  ) {}

  init(_mg: Game, _ticks: number): void {
    if (!this.player.startResearch(this.research)) {
      console.warn(
        `player ${this.player.name()} cannot start research ${this.research}`,
      );
    }
  }

  tick(_: number): void {}

  isActive(): boolean {
    return false;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }

  snapshot(w: SnapshotWriter): ExecRecord {
    return ResearchExecutionSnapshot.write({
      player: w.player(this.player),
      research: this.research,
    });
  }

  restoreSnapshot(s: ResearchState, r: SnapshotReader): void {
    this.player = r.player(s.player);
    this.research = s.research;
  }
}

const ResearchStateSchema = z.object({
  player: zPlayerRef(),
  research: z.enum(ResearchType),
});
type ResearchState = z.infer<typeof ResearchStateSchema>;

export const ResearchExecutionSnapshot = execSnapshotType({
  name: "Research",
  version: 1,
  schema: ResearchStateSchema,
  cls: () => ResearchExecution,
});
