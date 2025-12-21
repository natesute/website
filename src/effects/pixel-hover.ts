/**
 * Pixelation hover effect.
 * On hover: box instantly fills with white.
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
}

const PIXEL_SIZE = 4; // Size of each "pixel" in the effect

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

function updateCanvasSize(_element: HTMLElement, state: PixelState): void {
  // Get actual rendered size of the canvas element (CSS handles the sizing via 100%)
  const rect = state.canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  
  state.width = rect.width;
  state.height = rect.height;
  state.cols = Math.ceil(state.width / state.pixelSize);
  state.rows = Math.ceil(state.height / state.pixelSize);
  
  // Set bitmap dimensions to match display size × pixel ratio
  // Note: setting canvas.width/height resets the context transform
  state.canvas.width = state.width * dpr;
  state.canvas.height = state.height * dpr;
  state.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  
  // Reset pixel array
  state.pixels = new Array(state.cols * state.rows).fill(false);
  state.isFilled = false;
  
  // If hovering, refill (handles resize during hover)
  if (state.isHovering) {
    fillInstantly(state);
  }
}

function handleMouseEnter(_element: HTMLElement, state: PixelState): void {
  state.isHovering = true;
  fillInstantly(state);
}

function handleMouseLeave(_element: HTMLElement, state: PixelState): void {
  state.isHovering = false;
  
  // Clear canvas and reset state
  state.ctx.clearRect(0, 0, state.width, state.height);
  state.pixels.fill(false);
  state.isFilled = false;
}

function fillInstantly(state: PixelState): void {
  // Fill all pixels immediately
  state.pixels.fill(true);
  state.isFilled = true;
  render(state);
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

