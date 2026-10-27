import { describe, it, expect, vi, afterEach } from "vitest";
import { GameLoop, FIXED_DT } from "../GameLoop";
afterEach(() => vi.unstubAllGlobals());
describe("GameLoop lifecycle", () => {
  it("does not render, update again, or request another frame after stopping inside update", () => {
    let frame!: FrameRequestCallback;
    const raf = vi.fn((cb: FrameRequestCallback) => {
      frame = cb;
      return 1;
    });
    vi.stubGlobal("requestAnimationFrame", raf);
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.spyOn(performance, "now").mockReturnValue(0);
    const render = vi.fn();
    const update = vi.fn(() => loop.stop());
    const loop = new GameLoop(update, render);
    loop.start();
    frame(1000);
    expect(update).toHaveBeenCalledTimes(1);
    expect(render).not.toHaveBeenCalled();
    expect(raf).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });
  it("runs fixed ticks, clamps catch-up, and start is idempotent", () => {
    let frame!: FrameRequestCallback;
    const raf = vi.fn((cb: FrameRequestCallback) => {
      frame = cb;
      return 1;
    });
    vi.stubGlobal("requestAnimationFrame", raf);
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.spyOn(performance, "now").mockReturnValue(0);
    const update = vi.fn(),
      render = vi.fn();
    const loop = new GameLoop(update, render);
    loop.start();
    loop.start();
    frame(1000);
    expect(update.mock.calls.length).toBeLessThanOrEqual(5);
    expect(update.mock.calls.length).toBeGreaterThan(0);
    expect(update).toHaveBeenCalledWith(FIXED_DT);
    expect(render).toHaveBeenCalledTimes(1);
    loop.stop();
    vi.restoreAllMocks();
  });
});
