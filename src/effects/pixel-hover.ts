/**
 * Pixelation hover effect.
 * On hover: white pixels randomly appear until box is fully white.
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
}

const PIXEL_SIZE = 4; // Size of each "pixel" in the effect
const FILL_SPEED = 0.15; // Percentage of pixels to fill per frame (0-1)

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

  // Wrap existing text/children in a div to keep them above the canvas
  const wrapper = document.createElement('div');
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
  
  // If hovering, restart fill animation (handles resize during hover)
  if (state.isHovering) {
    if (state.fillAnimationId) cancelAnimationFrame(state.fillAnimationId);
    animateFill(element, state);
  }
}

function handleMouseEnter(element: HTMLElement, state: PixelState): void {
  state.isHovering = true;
  
  // Cancel any existing animation
  if (state.fillAnimationId) cancelAnimationFrame(state.fillAnimationId);
  
  // Start fill animation
  animateFill(element, state);
}

function handleMouseLeave(_element: HTMLElement, state: PixelState): void {
  state.isHovering = false;
  
  // Cancel animation
  if (state.fillAnimationId) {
    cancelAnimationFrame(state.fillAnimationId);
    state.fillAnimationId = null;
  }
  
  // Clear canvas and reset state
  state.ctx.clearRect(0, 0, state.width, state.height);
  state.pixels.fill(false);
  state.isFilled = false;
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
    // Fully filled - stay filled (no crackle effect)
    state.isFilled = true;
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

function render(state: PixelState): void {
  const { ctx, pixels, cols, pixelSize, width, height, isFilled } = state;
  
  ctx.clearRect(0, 0, width, height);
  
  if (isFilled) {
    // When fully filled, draw solid background to avoid sub-pixel gaps
    ctx.fillStyle = '#e8e4de';
    ctx.fillRect(0, 0, width, height);
  } else {
    // During fill animation, draw individual pixels with slight overlap to prevent gaps
    ctx.fillStyle = '#e8e4de';
    const overlap = 0.5;
    for (let i = 0; i < pixels.length; i++) {
      if (pixels[i]) {
        const x = (i % cols) * pixelSize;
        const y = Math.floor(i / cols) * pixelSize;
        ctx.fillRect(x, y, pixelSize + overlap, pixelSize + overlap);
      }
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

