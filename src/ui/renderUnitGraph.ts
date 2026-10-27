import type { Faction } from "../types";
export interface UnitHistorySample {
  time: number;
  counts: Map<string, number>;
}

/** Presentation only: no simulation or DOM lifecycle ownership. */
export function renderUnitGraph(
  history: readonly UnitHistorySample[],
): HTMLCanvasElement | null {
  if (history.length < 2) return null;

  // Determine which factions actually appeared
  const factionOrder: Faction[] = ["player", "enemy_a", "enemy_b", "enemy_c"];
  const activeFactions = factionOrder.filter((f) =>
    history.some((s) => (s.counts.get(f) ?? 0) > 0),
  );
  if (activeFactions.length === 0) return null;

  const FACTION_COLORS_CSS: Record<string, string> = {
    player: "#4fc3f7",
    enemy_a: "#ef5350",
    enemy_b: "#66bb6a",
    enemy_c: "#ab47bc",
  };
  const FACTION_LABELS: Record<string, string> = {
    player: "You",
    enemy_a: "Enemy A",
    enemy_b: "Enemy B",
    enemy_c: "Enemy C",
  };

  const W = 560,
    H = 220;
  const PAD = { top: 18, right: 20, bottom: 40, left: 50 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // Dark background
  ctx.fillStyle = "rgba(10,15,30,0.85)";
  ctx.fillRect(0, 0, W, H);

  // Max value for Y axis
  let maxVal = 0;
  for (const s of history) {
    for (const f of activeFactions) {
      const v = s.counts.get(f) ?? 0;
      if (v > maxVal) maxVal = v;
    }
  }
  maxVal = Math.max(maxVal, 10); // never collapse to 0
  const yMax = Math.ceil(maxVal / 10) * 10;

  const totalTime = history[history.length - 1].time;

  const toX = (t: number) => PAD.left + (t / totalTime) * innerW;
  const toY = (v: number) => PAD.top + innerH - (v / yMax) * innerH;

  // Grid lines
  const yTicks = 5;
  ctx.strokeStyle = "rgba(255,255,255,0.07)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= yTicks; i++) {
    const y = PAD.top + (i / yTicks) * innerH;
    ctx.beginPath();
    ctx.moveTo(PAD.left, y);
    ctx.lineTo(PAD.left + innerW, y);
    ctx.stroke();
  }

  // Y axis labels
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.font = "10px Rajdhani, sans-serif";
  ctx.textAlign = "right";
  for (let i = 0; i <= yTicks; i++) {
    const val = Math.round((yMax / yTicks) * (yTicks - i));
    const y = PAD.top + (i / yTicks) * innerH;
    ctx.fillText(val.toString(), PAD.left - 6, y + 4);
  }

  // X axis labels (time)
  const xTicks = Math.min(6, history.length - 1);
  ctx.textAlign = "center";
  for (let i = 0; i <= xTicks; i++) {
    const t = (totalTime / xTicks) * i;
    const x = toX(t);
    const mins = Math.floor(t / 60);
    const secs = Math.floor(t % 60);
    ctx.fillText(
      `${mins}:${String(secs).padStart(2, "0")}`,
      x,
      PAD.top + innerH + 16,
    );
  }

  // Axis lines
  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD.left, PAD.top);
  ctx.lineTo(PAD.left, PAD.top + innerH);
  ctx.lineTo(PAD.left + innerW, PAD.top + innerH);
  ctx.stroke();

  // Draw a line per faction
  for (const faction of activeFactions) {
    const color = FACTION_COLORS_CSS[faction];
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.shadowColor = color;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    let first = true;
    for (const s of history) {
      const x = toX(s.time);
      const y = toY(s.counts.get(faction) ?? 0);
      if (first) {
        ctx.moveTo(x, y);
        first = false;
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // Legend (bottom right)
  ctx.shadowBlur = 0;
  const legendX = PAD.left + innerW - 4;
  let legendY = PAD.top + 6;
  for (const faction of activeFactions) {
    const color = FACTION_COLORS_CSS[faction];
    ctx.fillStyle = color;
    ctx.fillRect(legendX - 60, legendY, 14, 3);
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = "10px Rajdhani, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(FACTION_LABELS[faction], legendX - 42, legendY + 5);
    legendY += 16;
  }

  // Chart title
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.font = "10px Rajdhani, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("UNIT STRENGTH OVER TIME", PAD.left + 2, PAD.top - 4);

  return canvas;
}
