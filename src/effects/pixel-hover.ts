/**
 * Hover effect for nav links and list items: instantly fills a canvas overlay
 * with the foreground colour while the cursor is over the element.
 */

interface HoverState {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  isHovering: boolean;
}

const FILL_COLOUR = '#e8e4de';

const states = new WeakMap<HTMLElement, HoverState>();

let mouseX = -1;
let mouseY = -1;

document.addEventListener('mousemove', (e) => {
  mouseX = e.clientX;
  mouseY = e.clientY;
}, { passive: true });

export function initPixelHover(element: HTMLElement): void {
  if (states.has(element)) return;

  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'position: relative; z-index: 1;';
  while (element.firstChild) {
    wrapper.appendChild(element.firstChild);
  }
  element.appendChild(wrapper);

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

  const state: HoverState = {
    canvas,
    ctx,
    width: 0,
    height: 0,
    isHovering: false,
  };

  states.set(element, state);

  const resizeObserver = new ResizeObserver(() => updateCanvasSize(state));
  resizeObserver.observe(element);

  updateCanvasSize(state);

  element.addEventListener('mouseenter', () => {
    state.isHovering = true;
    fill(state);
  });
  element.addEventListener('mouseleave', () => {
    state.isHovering = false;
    state.ctx.clearRect(0, 0, state.width, state.height);
  });

  checkInitialHover(element, state);
}

function checkInitialHover(element: HTMLElement, state: HoverState): void {
  if (mouseX < 0 || mouseY < 0) return;

  const rect = element.getBoundingClientRect();
  if (
    mouseX >= rect.left &&
    mouseX <= rect.right &&
    mouseY >= rect.top &&
    mouseY <= rect.bottom
  ) {
    state.isHovering = true;
    fill(state);
  }
}

function updateCanvasSize(state: HoverState): void {
  const rect = state.canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;

  state.width = rect.width;
  state.height = rect.height;

  state.canvas.width = state.width * dpr;
  state.canvas.height = state.height * dpr;
  state.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  if (state.isHovering) fill(state);
}

function fill(state: HoverState): void {
  state.ctx.fillStyle = FILL_COLOUR;
  state.ctx.fillRect(0, 0, state.width, state.height);
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

export function initAllPixelHovers(): void {
  document.querySelectorAll('#home-menu a').forEach((el) => initPixelHover(el as HTMLElement));
  document.querySelectorAll('.page-content a.list-item').forEach((el) => initPixelHover(el as HTMLElement));
}
