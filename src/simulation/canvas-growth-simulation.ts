/**
 * Canvas 2D fallback for Growth Cellular Automaton.
 * CPU-based implementation matching the WebGPU version pixel-for-pixel.
 * Each cell stores: (on/off, age) using typed arrays.
 */
export class CanvasGrowthSimulation {
  readonly width: number;
  readonly height: number;

  // Double-buffered state: [on/off, age] per cell
  private stateBuffers: Uint32Array[];
  private currentBuffer = 0;

  // Mask stores intensity values (0-255)
  private maskData: Uint32Array;

  private isComplete = false;
  private stepCount = 0;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;

    // State buffers: 2 values per cell (on/off, age)
    const stateSize = width * height * 2;
    this.stateBuffers = [
      new Uint32Array(stateSize),
      new Uint32Array(stateSize),
    ];

    this.maskData = new Uint32Array(width * height);
  }

  reset() {
    this.stateBuffers[0].fill(0);
    this.stateBuffers[1].fill(0);
    this.isComplete = false;
    this.stepCount = 0;
  }

  setMaskFromImage(
    imageData: Uint8ClampedArray,
    imageWidth: number,
    imageHeight: number
  ) {
    this.reset();

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const imgX = Math.floor((x / this.width) * imageWidth);
        const imgY = Math.floor((y / this.height) * imageHeight);
        const imgIdx = (imgY * imageWidth + imgX) * 4;
        // Store actual intensity value (0-255) to differentiate shadow from main text
        const intensity = imageData[imgIdx];

        const idx = y * this.width + x;
        this.maskData[idx] = intensity;
      }
    }

    // Place seeds using connected components
    this.placeSeeds();
  }

  private placeSeeds() {
    const visited = new Uint8Array(this.width * this.height);
    const components: number[][] = [];

    // Use high threshold (> 128) for seed placement so shadow doesn't bridge letters
    const seedThreshold = 128;

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const idx = y * this.width + x;
        if (this.maskData[idx] > seedThreshold && visited[idx] === 0) {
          const component: number[] = [];
          this.floodFill(x, y, visited, component, seedThreshold);
          if (component.length > 0) {
            components.push(component);
          }
        }
      }
    }

    // Place exactly 1 random seed in each component
    const stateData = this.stateBuffers[0];
    for (const component of components) {
      const randomIdx = Math.floor(Math.random() * component.length);
      const cellIdx = component[randomIdx];
      stateData[cellIdx * 2] = 1;     // on
      stateData[cellIdx * 2 + 1] = 0; // age = 0
    }

    // Copy to second buffer as well
    this.stateBuffers[1].set(this.stateBuffers[0]);

    console.log(`[Canvas] Found ${components.length} connected components, placed 1 seed each`);
  }

  private floodFill(
    startX: number,
    startY: number,
    visited: Uint8Array,
    component: number[],
    threshold: number
  ) {
    const stack: [number, number][] = [[startX, startY]];

    while (stack.length > 0) {
      const [x, y] = stack.pop()!;

      if (x < 0 || x >= this.width || y < 0 || y >= this.height) continue;

      const idx = y * this.width + x;
      if (visited[idx] === 1 || this.maskData[idx] <= threshold) continue;

      visited[idx] = 1;
      component.push(idx);

      stack.push([x - 1, y]);
      stack.push([x + 1, y]);
      stack.push([x, y - 1]);
      stack.push([x, y + 1]);
    }
  }

  /**
   * Execute one simulation step on CPU.
   * Implements the same 8-neighbor growth rule as the WGSL shader.
   */
  step() {
    if (this.isComplete) return;

    this.stepCount++;

    const current = this.stateBuffers[this.currentBuffer];
    const next = this.stateBuffers[1 - this.currentBuffer];
    const w = this.width;
    const h = this.height;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        const stateIdx = idx * 2;

        const isCurrentlyOn = current[stateIdx] === 1;
        const currentAge = current[stateIdx + 1];
        const inTextRegion = this.maskData[idx];

        // If not in text region, stay off
        if (inTextRegion === 0) {
          next[stateIdx] = 0;
          next[stateIdx + 1] = 0;
          continue;
        }

        // If already on, stay on and increment age
        if (isCurrentlyOn) {
          next[stateIdx] = 1;
          next[stateIdx + 1] = currentAge + 1;
          continue;
        }

        // Check for active neighbors (8-connected)
        let hasActiveNeighbor = false;

        // Helper to check neighbor with wrapping
        const isOn = (nx: number, ny: number): boolean => {
          const wx = ((nx % w) + w) % w;
          const wy = ((ny % h) + h) % h;
          return current[(wy * w + wx) * 2] === 1;
        };

        if (isOn(x - 1, y)) hasActiveNeighbor = true;
        if (isOn(x + 1, y)) hasActiveNeighbor = true;
        if (isOn(x, y - 1)) hasActiveNeighbor = true;
        if (isOn(x, y + 1)) hasActiveNeighbor = true;
        if (isOn(x - 1, y - 1)) hasActiveNeighbor = true;
        if (isOn(x + 1, y - 1)) hasActiveNeighbor = true;
        if (isOn(x - 1, y + 1)) hasActiveNeighbor = true;
        if (isOn(x + 1, y + 1)) hasActiveNeighbor = true;

        // Grow if has neighbor - age starts at 0
        if (hasActiveNeighbor) {
          next[stateIdx] = 1;
          next[stateIdx + 1] = 0;
        } else {
          next[stateIdx] = 0;
          next[stateIdx + 1] = 0;
        }
      }
    }

    this.currentBuffer = 1 - this.currentBuffer;

    if (this.stepCount > 60) {
      this.isComplete = true;
    }
  }

  getIsComplete(): boolean {
    return this.isComplete;
  }

  /**
   * Instantly complete the simulation - all masked cells become visible.
   */
  setComplete() {
    const stateData = this.stateBuffers[this.currentBuffer];

    for (let i = 0; i < this.width * this.height; i++) {
      if (this.maskData[i] > 0) {
        stateData[i * 2] = 1;       // on
        stateData[i * 2 + 1] = 100; // high age so visibility delay is passed
      }
    }

    this.isComplete = true;
  }

  /**
   * Update the mask without resetting state - for hover effects.
   */
  updateMask(
    imageData: Uint8ClampedArray,
    imageWidth: number,
    imageHeight: number
  ) {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const imgX = Math.floor((x / this.width) * imageWidth);
        const imgY = Math.floor((y / this.height) * imageHeight);
        const imgIdx = (imgY * imageWidth + imgX) * 4;
        const value = imageData[imgIdx] > 64 ? 1 : 0;

        const idx = y * this.width + x;
        this.maskData[idx] = value;
      }
    }

    if (this.isComplete) {
      this.isComplete = false;
      this.stepCount = 500;
    }
  }

  /**
   * Get the current state buffer for rendering.
   */
  getCurrentState(): Uint32Array {
    return this.stateBuffers[this.currentBuffer];
  }

  /**
   * Get the mask data for rendering.
   */
  getMask(): Uint32Array {
    return this.maskData;
  }

  getDimensions(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }
}

