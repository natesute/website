import { CanvasGrowthSimulation } from './simulation/canvas-growth-simulation';

/**
 * Canvas 2D fallback renderer matching the WebGPU version pixel-for-pixel.
 * Implements the same rendering logic as render-pixels.wgsl.
 */
export class CanvasRenderer {
  private ctx: CanvasRenderingContext2D;
  private simulation: CanvasGrowthSimulation;
  private imageData: ImageData | null = null;

  // Underline region (normalized coords): x, y, width, height
  private underlineRegion: [number, number, number, number] = [0, 0, 0, 0];

  // Controls whether the idle wobble/dithering effect is active
  private wobbleEnabled: boolean = false;
  private wobbleStartTime: number = 0;

  // Colors (matching WGSL shader exactly)
  private readonly VOID_BLACK = { r: 10, g: 14, b: 20 };    // #0A0E14 -> 0.039, 0.055, 0.078
  private readonly WHITE = { r: 232, g: 227, b: 222 };       // 0.910, 0.890, 0.870
  private readonly SHADOW = { r: 140, g: 166, b: 184 };      // 0.55, 0.65, 0.72

  constructor(ctx: CanvasRenderingContext2D, simulation: CanvasGrowthSimulation) {
    this.ctx = ctx;
    this.simulation = simulation;
  }

  /**
   * Hash function matching WGSL shader exactly for visibility delay.
   * Uses the same constants and operations.
   */
  private hash(px: number, py: number): number {
    let n = (px * 127 + py * 311 + 7919) >>> 0;
    let h = Math.imul(n, 0xcc9e2d51) >>> 0;
    let h2 = (h ^ (h >>> 15)) & 0xFFFF;
    return h2 / 65535;
  }

  /**
   * Hash with time component for wobble effect.
   */
  private hashTime(px: number, py: number, t: number): number {
    let n = (px * 127 + py * 311 + t * 5381 + 7919) >>> 0;
    let h = Math.imul(n, 0xcc9e2d51) >>> 0;
    let h2 = (h ^ (h >>> 15)) & 0xFFFF;
    return h2 / 65535;
  }

  setUnderline(x: number, y: number, width: number, height: number) {
    this.underlineRegion = [x, y, width, height];
  }

  clearUnderline() {
    this.underlineRegion = [0, 0, 0, 0];
  }

  enableWobble(currentTime: number) {
    this.wobbleEnabled = true;
    this.wobbleStartTime = currentTime;
  }

  disableWobble() {
    this.wobbleEnabled = false;
  }

  /**
   * Render current state to canvas.
   * This is the CPU equivalent of the fragment shader.
   */
  render(time: number, _isGrowing: boolean, canvasWidth: number, canvasHeight: number) {
    const { width: simWidth, height: simHeight } = this.simulation.getDimensions();
    const state = this.simulation.getCurrentState();
    const mask = this.simulation.getMask();

    // Ensure ImageData exists and matches canvas size
    if (!this.imageData || this.imageData.width !== canvasWidth || this.imageData.height !== canvasHeight) {
      this.imageData = this.ctx.createImageData(canvasWidth, canvasHeight);
    }

    const data = this.imageData.data;
    const [ux, uy, uw, uh] = this.underlineRegion;

    // Wobble time relative to start
    const wobbleTime = this.wobbleEnabled ? (time - this.wobbleStartTime) : 0;
    const timeSlot = Math.floor(wobbleTime * 1.0);

    // Aspect ratio calculations matching WGSL
    const canvasAspect = canvasWidth / canvasHeight;
    const simAspect = simWidth / simHeight; // Should be 1.0 for square

    for (let py = 0; py < canvasHeight; py++) {
      for (let px = 0; px < canvasWidth; px++) {
        const pixelIdx = (py * canvasWidth + px) * 4;

        // Calculate UV coordinates (0-1 range)
        // Canvas 2D: (0,0) is top-left, same as WGSL UV coords where Y=0 is top
        let uvX = px / canvasWidth;
        let uvY = py / canvasHeight;

        // Aspect ratio correction matching WGSL
        if (canvasAspect > simAspect) {
          // Canvas is wider than simulation - letterbox horizontally
          const scale = canvasAspect / simAspect;
          uvX = (uvX - 0.5) * scale + 0.5;
        } else {
          // Canvas is taller than simulation - letterbox vertically
          const scale = simAspect / canvasAspect;
          uvY = (uvY - 0.5) * scale + 0.5;
        }

        // Shift simulation content up
        uvY = uvY + 0.07;

        // Outside simulation bounds = background
        if (uvX < 0 || uvX > 1 || uvY < 0 || uvY > 1) {
          data[pixelIdx] = this.VOID_BLACK.r;
          data[pixelIdx + 1] = this.VOID_BLACK.g;
          data[pixelIdx + 2] = this.VOID_BLACK.b;
          data[pixelIdx + 3] = 255;
          continue;
        }

        // Calculate cell coordinates
        let cx = Math.min(Math.floor(uvX * simWidth), simWidth - 1);
        let cy = Math.min(Math.floor(uvY * simHeight), simHeight - 1);

        // Check underline region
        const inUnderline = uvX >= ux && uvX <= ux + uw &&
                           uvY >= uy && uvY <= uy + uh &&
                           uw > 0;

        if (inUnderline) {
          data[pixelIdx] = this.WHITE.r;
          data[pixelIdx + 1] = this.WHITE.g;
          data[pixelIdx + 2] = this.WHITE.b;
          data[pixelIdx + 3] = 255;
          continue;
        }

        // Wobble effect
        if (this.wobbleEnabled) {
          const wobbleChance = this.hashTime(cx, cy, timeSlot);

          if (wobbleChance < 0.03) {
            const dir = Math.floor(wobbleChance * 133) % 4;
            if (dir === 0 && cx > 0) cx = cx - 1;
            else if (dir === 1 && cx < simWidth - 1) cx = cx + 1;
            else if (dir === 2 && cy > 0) cy = cy - 1;
            else if (dir === 3 && cy < simHeight - 1) cy = cy + 1;
          }
        }

        const idx = cy * simWidth + cx;
        const stateIdx = idx * 2;
        const isOn = state[stateIdx] === 1;
        const age = state[stateIdx + 1];

        if (!isOn) {
          data[pixelIdx] = this.VOID_BLACK.r;
          data[pixelIdx + 1] = this.VOID_BLACK.g;
          data[pixelIdx + 2] = this.VOID_BLACK.b;
          data[pixelIdx + 3] = 255;
          continue;
        }

        // Visibility delay matching WGSL
        const delayRand = this.hash(cx, cy);
        const skewed = delayRand * delayRand;
        const visibilityDelay = Math.floor(skewed * 6);

        if (age < visibilityDelay) {
          data[pixelIdx] = this.VOID_BLACK.r;
          data[pixelIdx + 1] = this.VOID_BLACK.g;
          data[pixelIdx + 2] = this.VOID_BLACK.b;
          data[pixelIdx + 3] = 255;
          continue;
        }

        // Check mask intensity
        const maskIntensity = mask[idx];

        if (maskIntensity > 128) {
          data[pixelIdx] = this.WHITE.r;
          data[pixelIdx + 1] = this.WHITE.g;
          data[pixelIdx + 2] = this.WHITE.b;
        } else {
          data[pixelIdx] = this.SHADOW.r;
          data[pixelIdx + 1] = this.SHADOW.g;
          data[pixelIdx + 2] = this.SHADOW.b;
        }
        data[pixelIdx + 3] = 255;
      }
    }

    this.ctx.putImageData(this.imageData, 0, 0);
  }
}

