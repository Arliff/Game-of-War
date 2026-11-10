import {
  ResearchOption,
  ResearchStatus,
  ResearchType,
} from "@openfront/engine-api/game/GameTypes";
import { renderNumber } from "@openfront/engine-lib/Format";
import {
  RESEARCH_DEFINITIONS,
  researchDefinition,
} from "@openfront/engine-lib/game/Research";
import { assetUrl } from "@openfront/shared/AssetUrls";
import { EventBus } from "@openfront/shared/EventBus";
import { html, LitElement, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { Controller } from "../../Controller";
import { SendResearchIntentEvent } from "../../Transport";
import { translateText } from "../../Utils";
import { GameView } from "../../view";

const researchIcon = assetUrl("images/ResearchLabIconWhite.svg");

/** Translation key segment per research (`research.<key>.name|desc`). */
const RESEARCH_KEYS: Record<ResearchType, string> = {
  [ResearchType.Navigation]: "navigation",
  [ResearchType.Industry]: "industry",
  [ResearchType.Fortification]: "fortification",
  [ResearchType.Rocketry]: "rocketry",
  [ResearchType.AirDefense]: "air_defense",
  [ResearchType.Weapons1]: "weapons_1",
  [ResearchType.Weapons2]: "weapons_2",
  [ResearchType.Weapons3]: "weapons_3",
  [ResearchType.Armor1]: "armor_1",
  [ResearchType.Armor2]: "armor_2",
  [ResearchType.Armor3]: "armor_3",
};

function researchKey(type: ResearchType): string {
  return RESEARCH_KEYS[type];
}

const UNLOCK_TYPES = RESEARCH_DEFINITIONS.filter(
  (d) => d.unlocks !== undefined,
).map((d) => d.type);
const MILITARY_TYPES = RESEARCH_DEFINITIONS.filter(
  (d) => d.unlocks === undefined,
).map((d) => d.type);

/**
 * Research panel: a toggle button plus a list of techs the player can start
 * at their Research Labs. Only shown in games with research enabled.
 */
@customElement("research-panel")
export class ResearchPanel extends LitElement implements Controller {
  public game: GameView;
  public eventBus: EventBus;

  @state() private open = false;
  @state() private status: ResearchStatus | null = null;

  createRenderRoot() {
    return this;
  }

  init() {}

  tick() {
    if (!this.game?.config().researchEnabled()) return;
    const player = this.game.myPlayer();
    if (player === null || !player.isAlive() || this.game.inSpawnPhase()) {
      if (this.status !== null) this.status = null;
      return;
    }
    // Refresh at ~2Hz while open, and every few seconds while closed (the
    // button shows the active research).
    const every = this.open ? 5 : 20;
    if (this.game.ticks() % every !== 0 && this.status !== null) return;
    player
      .actions(undefined, null)
      .then((actions) => {
        this.status = actions.research ?? null;
      })
      .catch((e) => console.warn("Failed to refresh research", e));
  }

  private start(type: ResearchType) {
    this.eventBus.emit(new SendResearchIntentEvent(type));
    // Optimistic: block the buttons until the next refresh.
    if (this.status !== null) {
      this.status = {
        ...this.status,
        options: this.status.options.map((o) => ({ ...o, canStart: false })),
      };
    }
  }

  render() {
    if (this.status === null) return nothing;
    const active = this.status.active;
    const pct =
      active === null
        ? 0
        : Math.min(100, Math.floor((active.progress / active.required) * 100));
    return html`
      <div
        class="fixed left-2 bottom-[calc(env(safe-area-inset-bottom)+170px)] sm:bottom-[calc(env(safe-area-inset-bottom)+12px)] z-[210] flex flex-col items-start gap-2 pointer-events-none"
      >
        ${this.open ? this.renderPanel() : nothing}
        <button
          class="pointer-events-auto flex items-center gap-2 rounded-lg bg-gray-800/92 backdrop-blur-sm shadow-lg px-3 py-2 text-white text-sm hover:bg-gray-700"
          @click=${() => (this.open = !this.open)}
          title=${translateText("research.title")}
        >
          <img src=${researchIcon} class="w-5 h-5" alt="" />
          <span>${translateText("research.title")}</span>
          ${
            active !== null
              ? html`<span class="text-xs text-sky-300">
                  ${translateText(`research.${researchKey(active.type)}.name`)}
                  ${pct}%
                </span>`
              : nothing
          }
        </button>
      </div>
    `;
  }

  private renderPanel() {
    const status = this.status!;
    const byType = new Map(status.options.map((o) => [o.type, o]));
    return html`
      <div
        class="pointer-events-auto w-[min(360px,calc(100vw-16px))] max-h-[60vh] overflow-y-auto rounded-lg bg-gray-800/95 backdrop-blur-sm shadow-lg p-3 text-white text-sm"
      >
        <div class="flex items-center justify-between mb-2">
          <h2 class="font-bold text-base">
            ${translateText("research.title")}
          </h2>
          <span class="text-xs text-gray-300">
            ${translateText("research.speed", { speed: status.speed })}
          </span>
        </div>
        ${
          status.speed === 0
            ? html`<p class="text-xs text-amber-300 mb-2">
                ${translateText("research.no_lab")}
              </p>`
            : nothing
        }
        ${this.renderActive()}
        <h3 class="text-xs uppercase tracking-wide text-gray-400 mt-2 mb-1">
          ${translateText("research.unlocks")}
        </h3>
        ${UNLOCK_TYPES.map((t) => this.renderOption(byType.get(t)!))}
        <h3 class="text-xs uppercase tracking-wide text-gray-400 mt-3 mb-1">
          ${translateText("research.military")}
        </h3>
        ${MILITARY_TYPES.map((t) => this.renderOption(byType.get(t)!))}
      </div>
    `;
  }

  private renderActive() {
    const active = this.status!.active;
    if (active === null) return nothing;
    const pct = Math.min(
      100,
      Math.floor((active.progress / active.required) * 100),
    );
    const speed = this.status!.speed;
    const secondsLeft =
      speed > 0
        ? Math.ceil((active.required - active.progress) / speed / 10)
        : null;
    return html`
      <div class="rounded bg-gray-900/60 p-2 mb-1">
        <div class="flex justify-between text-xs">
          <span>
            ${translateText("research.in_progress")}:
            ${translateText(`research.${researchKey(active.type)}.name`)}
          </span>
          <span>
            ${
              secondsLeft === null
                ? translateText("research.paused")
                : translateText("research.seconds_left", {
                    seconds: secondsLeft,
                  })
            }
          </span>
        </div>
        <div class="h-1.5 bg-gray-700 rounded mt-1 overflow-hidden">
          <div class="h-full bg-sky-400" style="width: ${pct}%"></div>
        </div>
      </div>
    `;
  }

  private renderOption(option: ResearchOption) {
    const key = researchKey(option.type);
    const def = researchDefinition(option.type);
    const isActive = this.status!.active?.type === option.type;
    const missing = def.requires.filter(
      (r) => !this.status!.completed.includes(r),
    );
    let action;
    if (option.completed) {
      action = html`<span class="text-green-400 text-xs">
        ${translateText("research.done")}
      </span>`;
    } else if (isActive) {
      action = html`<span class="text-sky-300 text-xs">
        ${translateText("research.researching")}
      </span>`;
    } else {
      action = html`<button
        class="text-xs rounded px-2 py-1 ${
          option.canStart
            ? "bg-sky-600 hover:bg-sky-500"
            : "bg-gray-600 opacity-50 cursor-not-allowed"
        }"
        ?disabled=${!option.canStart}
        @click=${() => this.start(option.type)}
      >
        ${translateText("research.start")} · ${renderNumber(option.cost)}
      </button>`;
    }
    return html`
      <div
        class="flex items-start justify-between gap-2 py-1.5 border-b border-white/5 ${
          option.completed ? "opacity-70" : ""
        }"
      >
        <div class="min-w-0">
          <div class="font-semibold">
            ${translateText(`research.${key}.name`)}
          </div>
          <div class="text-xs text-gray-300">
            ${translateText(`research.${key}.desc`)}
          </div>
          ${
            missing.length > 0 && !option.completed
              ? html`<div class="text-xs text-amber-300">
                  ${translateText("research.requires", {
                    research: missing
                      .map((r) =>
                        translateText(`research.${researchKey(r)}.name`),
                      )
                      .join(", "),
                  })}
                </div>`
              : nothing
          }
        </div>
        <div class="shrink-0">${action}</div>
      </div>
    `;
  }
}
