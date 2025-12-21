/**
 * Pixelation hover effect.
 * On hover: white pixels randomly appear until box is fully white.
 * After full: crackling effect with black pixels popping in/out.
 */

interface PixelState {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  pixels: boolean[]; // true = white, false = transparent
  width: number;
  height: number;
  cols: number;
  rows: number;
  pixelSize: number;
  isHovering: boolean;
  isFilled: boolean;
  fillAnimationId: number | null;
  crackleAnimationId: number | null;
  cracklePixels: Map<number, number>; // index -> expiry timestamp
}

const PIXEL_SIZE = 4; // Size of each "pixel" in the effect
const FILL_SPEED = 0.15; // Percentage of pixels to fill per frame (0-1)
const CRACKLE_RATE = 0.12; // Probability of spawning a crackle pixel per frame per eligible cell
const CRACKLE_MAX_ACTIVE = 0.24; // Maximum percentage of pixels that can be crackling at once
const CRACKLE_DURATION_MIN = 50; // Min ms each crackle pixel stays visible
const CRACKLE_DURATION_MAX = 250; // Max ms each crackle pixel stays visible

const states = new WeakMap<HTMLElement, PixelState>();

// Track current mouse position for hover detection after page transitions
let mouseX = -1;
let mouseY = -1;

document.addEventListener('mousemove', (e) => {
  mouseX = e.clientX;
  mouseY = e.clientY;
}, { passive: true });

/**
 * Initialize pixel hover effect on an element.
 */
export function initPixelHover(element: HTMLElement): void {
  if (states.has(element)) return;

  // Wrap existing text/children in a span to keep them above the canvas
  const wrapper = document.createElement('span');
  wrapper.style.cssText = 'position: relative; z-index: 1;';
  while (element.firstChild) {
    wrapper.appendChild(element.firstChild);
  }
  element.appendChild(wrapper);

  // Create canvas overlay
  const canvas = document.createElement('canvas');
  canvas.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 0;
  `;
  element.appendChild(canvas);

  const ctx = canvas.getContext('2d')!;
  
  const state: PixelState = {
    canvas,
    ctx,
    pixels: [],
    width: 0,
    height: 0,
    cols: 0,
    rows: 0,
    pixelSize: PIXEL_SIZE,
    isHovering: false,
    isFilled: false,
    fillAnimationId: null,
    crackleAnimationId: null,
    cracklePixels: new Map(),
  };

  states.set(element, state);

  // Resize observer to handle dynamic sizing
  const resizeObserver = new ResizeObserver(() => {
    updateCanvasSize(element, state);
  });
  resizeObserver.observe(element);

  // Initial size
  updateCanvasSize(element, state);

  // Event listeners
  element.addEventListener('mouseenter', () => handleMouseEnter(element, state));
  element.addEventListener('mouseleave', () => handleMouseLeave(element, state));
  
  // Check if cursor is already over element (handles page transitions)
  checkInitialHover(element, state);
}

/**
 * Check if cursor is already over element (handles page transitions).
 * Uses bounding rect check since :hover may not be updated for newly-visible elements.
 */
function checkInitialHover(element: HTMLElement, state: PixelState): void {
  if (mouseX < 0 || mouseY < 0) return;
  
  const rect = element.getBoundingClientRect();
  const isOver = (
    mouseX >= rect.left &&
    mouseX <= rect.right &&
    mouseY >= rect.top &&
    mouseY <= rect.bottom
  );
  
  if (isOver) {
    handleMouseEnter(element, state);
  }
}

function updateCanvasSize(element: HTMLElement, state: PixelState): void {
  const rect = element.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  
  state.width = Math.ceil(rect.width);
  state.height = Math.ceil(rect.height);
  state.cols = Math.ceil(state.width / state.pixelSize);
  state.rows = Math.ceil(state.height / state.pixelSize);
  
  state.canvas.width = state.width * dpr;
  state.canvas.height = state.height * dpr;
  state.canvas.style.width = `${state.width}px`;
  state.canvas.style.height = `${state.height}px`;
  state.ctx.scale(dpr, dpr);
  
  // Reset pixel array
  state.pixels = new Array(state.cols * state.rows).fill(false);
  state.isFilled = false;
  state.cracklePixels.clear();
  
  // If hovering, restart fill animation (handles resize during hover)
  if (state.isHovering) {
    if (state.fillAnimationId) cancelAnimationFrame(state.fillAnimationId);
    if (state.crackleAnimationId) cancelAnimationFrame(state.crackleAnimationId);
    state.crackleAnimationId = null;
    animateFill(element, state);
  }
}

function handleMouseEnter(element: HTMLElement, state: PixelState): void {
  state.isHovering = true;
  
  // Cancel any existing animations
  if (state.fillAnimationId) cancelAnimationFrame(state.fillAnimationId);
  if (state.crackleAnimationId) cancelAnimationFrame(state.crackleAnimationId);
  
  // Start fill animation
  animateFill(element, state);
}

function handleMouseLeave(element: HTMLElement, state: PixelState): void {
  state.isHovering = false;
  
  // Cancel animations
  if (state.fillAnimationId) {
    cancelAnimationFrame(state.fillAnimationId);
    state.fillAnimationId = null;
  }
  if (state.crackleAnimationId) {
    cancelAnimationFrame(state.crackleAnimationId);
    state.crackleAnimationId = null;
  }
  
  // Clear canvas and reset state
  state.ctx.clearRect(0, 0, state.width, state.height);
  state.pixels.fill(false);
  state.isFilled = false;
  state.cracklePixels.clear();
}

function animateFill(element: HTMLElement, state: PixelState): void {
  if (!state.isHovering) return;
  
  const totalPixels = state.pixels.length;
  const unfilledIndices: number[] = [];
  
  // Find unfilled pixels
  for (let i = 0; i < totalPixels; i++) {
    if (!state.pixels[i]) unfilledIndices.push(i);
  }
  
  if (unfilledIndices.length === 0) {
    // Fully filled - start crackling
    state.isFilled = true;
    animateCrackle(element, state);
    return;
  }
  
  // Fill a random subset of pixels
  const pixelsToFill = Math.max(1, Math.ceil(totalPixels * FILL_SPEED));
  shuffleArray(unfilledIndices);
  
  for (let i = 0; i < Math.min(pixelsToFill, unfilledIndices.length); i++) {
    state.pixels[unfilledIndices[i]] = true;
  }
  
  render(state);
  
  state.fillAnimationId = requestAnimationFrame(() => animateFill(element, state));
}

function animateCrackle(element: HTMLElement, state: PixelState): void {
  if (!state.isHovering || !state.isFilled) return;
  
  const now = performance.now();
  const totalPixels = state.pixels.length;
  const maxActive = Math.ceil(totalPixels * CRACKLE_MAX_ACTIVE);
  
  // Remove expired crackle pixels
  let needsRender = false;
  for (const [idx, expiry] of state.cracklePixels) {
    if (now >= expiry) {
      state.cracklePixels.delete(idx);
      needsRender = true;
    }
  }
  
  // Probabilistically add new crackle pixels (if under max)
  if (state.cracklePixels.size < maxActive) {
    // Use per-frame probability for organic timing
    const spawnChance = CRACKLE_RATE * (1 - state.cracklePixels.size / maxActive);
    
    // Pick a few random candidates and check if they should spawn
    const candidateCount = Math.ceil(totalPixels * 0.01); // Check 1% of pixels per frame
    for (let i = 0; i < candidateCount; i++) {
      if (Math.random() < spawnChance && state.cracklePixels.size < maxActive) {
        const idx = getRandomIndex(totalPixels);
        if (!state.cracklePixels.has(idx)) {
          const duration = CRACKLE_DURATION_MIN + Math.random() * (CRACKLE_DURATION_MAX - CRACKLE_DURATION_MIN);
          state.cracklePixels.set(idx, now + duration);
          needsRender = true;
        }
      }
    }
  }
  
  if (needsRender) {
    render(state);
  }
  
  // Continue crackling animation loop
  state.crackleAnimationId = requestAnimationFrame(() => animateCrackle(element, state));
}

/**
 * Returns a random index for crackle pixels.
 */
function getRandomIndex(total: number): number {
  return Math.floor(Math.random() * total);
}

function render(state: PixelState): void {
  const { ctx, pixels, cols, pixelSize, cracklePixels, width, height } = state;
  
  ctx.clearRect(0, 0, width, height);
  
  // Draw white pixels
  ctx.fillStyle = '#e8e4de';
  for (let i = 0; i < pixels.length; i++) {
    if (pixels[i] && !cracklePixels.has(i)) {
      const x = (i % cols) * pixelSize;
      const y = Math.floor(i / cols) * pixelSize;
      ctx.fillRect(x, y, pixelSize, pixelSize);
    }
  }
  
  // Draw black crackle pixels (on top of white background)
  if (cracklePixels.size > 0) {
    ctx.fillStyle = '#101216';
    for (const idx of cracklePixels.keys()) {
      const x = (idx % cols) * pixelSize;
      const y = Math.floor(idx / cols) * pixelSize;
      ctx.fillRect(x, y, pixelSize, pixelSize);
    }
  }
}

function shuffleArray<T>(array: T[]): void {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

/**
 * Re-check hover state on all initialized elements.
 * Call after page transitions to handle cursor already being over elements.
 */
export function recheckAllHoverStates(): void {
  document.querySelectorAll('#home-menu a, .page-content a.list-item').forEach((el) => {
    const state = states.get(el as HTMLElement);
    if (state && !state.isHovering) {
      checkInitialHover(el as HTMLElement, state);
    }
  });
}

/**
 * Initialize pixel hover effect on all matching elements.
 */
export function initAllPixelHovers(): void {
  // Home menu links
  document.querySelectorAll('#home-menu a').forEach((el) => {
    initPixelHover(el as HTMLElement);
  });
  
  // List items on subpages
  document.querySelectorAll('.page-content a.list-item').forEach((el) => {
    initPixelHover(el as HTMLElement);
  });
}

