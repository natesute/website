import { CanvasGrowthSimulation } from './simulation/canvas-growth-simulation';

const VOID_BLACK = { r: 10, g: 14, b: 20 };
const WHITE = { r: 232, g: 227, b: 222 };
const SHADOW = { r: 140, g: 166, b: 184 };

const VOID_BLACK_CSS = `rgb(${VOID_BLACK.r}, ${VOID_BLACK.g}, ${VOID_BLACK.b})`;

/**
 * Renders the growth simulation by rasterising it once per dirty frame at
 * simulation resolution, then blitting it onto the visible canvas with
 * nearest-neighbour scaling. The browser handles the upscale on the GPU.
 */
export class CanvasRenderer {
  private ctx: CanvasRenderingContext2D;
  private simulation: CanvasGrowthSimulation;
  private offscreen: OffscreenCanvas;
  private offCtx: OffscreenCanvasRenderingContext2D;
  private imageData: ImageData;

  private wobbleEnabled = false;
  private wobbleStartTime = 0;
  private lastTimeSlot = -1;
  private dirty = true;

  constructor(ctx: CanvasRenderingContext2D, simulation: CanvasGrowthSimulation) {
    this.ctx = ctx;
    this.simulation = simulation;

    const { width: simW, height: simH } = simulation.getDimensions();
    this.offscreen = new OffscreenCanvas(simW, simH);
    const offCtx = this.offscreen.getContext('2d');
    if (!offCtx) throw new Error('Could not get 2D context for offscreen canvas');
    this.offCtx = offCtx;
    this.imageData = this.offCtx.createImageData(simW, simH);
  }

  /** Mark the next render as needed (call after simulation.step / state changes). */
  markDirty() {
    this.dirty = true;
  }

  enableWobble(currentTime: number) {
    this.wobbleEnabled = true;
    this.wobbleStartTime = currentTime;
    this.lastTimeSlot = -1;
    this.dirty = true;
  }

  disableWobble() {
    this.wobbleEnabled = false;
    this.dirty = true;
  }

  private hash(px: number, py: number): number {
    const n = (px * 127 + py * 311 + 7919) >>> 0;
    const h = Math.imul(n, 0xcc9e2d51) >>> 0;
    return ((h ^ (h >>> 15)) & 0xFFFF) / 65535;
  }

  private hashTime(px: number, py: number, t: number): number {
    const n = (px * 127 + py * 311 + t * 5381 + 7919) >>> 0;
    const h = Math.imul(n, 0xcc9e2d51) >>> 0;
    return ((h ^ (h >>> 15)) & 0xFFFF) / 65535;
  }

  render(time: number, canvasWidth: number, canvasHeight: number) {
    const wobbleTime = this.wobbleEnabled ? (time - this.wobbleStartTime) : 0;
    const timeSlot = Math.floor(wobbleTime);

    if (this.wobbleEnabled && timeSlot !== this.lastTimeSlot) {
      this.dirty = true;
      this.lastTimeSlot = timeSlot;
    }

    if (!this.dirty) return;

    const { width: simW, height: simH } = this.simulation.getDimensions();
    const state = this.simulation.getCurrentState();
    const mask = this.simulation.getMask();
    const data = this.imageData.data;

    for (let cy = 0; cy < simH; cy++) {
      const rowBase = cy * simW;
      for (let cx = 0; cx < simW; cx++) {
        let sx = cx;
        let sy = cy;

        if (this.wobbleEnabled) {
          const wobbleChance = this.hashTime(cx, cy, timeSlot);
          if (wobbleChance < 0.03) {
            const dir = Math.floor(wobbleChance * 133) % 4;
            if (dir === 0 && sx > 0) sx -= 1;
            else if (dir === 1 && sx < simW - 1) sx += 1;
            else if (dir === 2 && sy > 0) sy -= 1;
            else if (dir === 3 && sy < simH - 1) sy += 1;
          }
        }

        const sIdx = sy * simW + sx;
        const stateIdx = sIdx * 2;
        const outIdx = (rowBase + cx) * 4;

        let r = VOID_BLACK.r;
        let g = VOID_BLACK.g;
        let b = VOID_BLACK.b;

        if (state[stateIdx] === 1) {
          const age = state[stateIdx + 1];
          const delayRand = this.hash(sx, sy);
          const visibilityDelay = Math.floor(delayRand * delayRand * 6);
          if (age >= visibilityDelay) {
            if (mask[sIdx] > 128) {
              r = WHITE.r; g = WHITE.g; b = WHITE.b;
            } else {
              r = SHADOW.r; g = SHADOW.g; b = SHADOW.b;
            }
          }
        }

        data[outIdx] = r;
        data[outIdx + 1] = g;
        data[outIdx + 2] = b;
        data[outIdx + 3] = 255;
      }
    }

    this.offCtx.putImageData(this.imageData, 0, 0);

    // Letterbox the (square) sim into the canvas, centered, shifted up 7% of the side length.
    const side = Math.min(canvasWidth, canvasHeight);
    const dstX = (canvasWidth - side) / 2;
    const dstY = (canvasHeight - side) / 2 - 0.07 * side;

    this.ctx.fillStyle = VOID_BLACK_CSS;
    this.ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.drawImage(this.offscreen, 0, 0, simW, simH, dstX, dstY, side, side);

    this.dirty = false;
  }
}
