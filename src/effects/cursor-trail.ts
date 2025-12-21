/**
 * Cursor trail effect with fuzzy white pixels.
 * Pixels spawn around the cursor and fade out, creating a trailing effect.
 */

interface Particle {
  x: number;
  y: number;
  life: number;
  maxLife: number;
  size: number;
}

const PIXEL_SIZE = 4;
const SPAWN_RATE = 6; // Particles per frame (increased for density)
const SPAWN_RADIUS = 12; // Pixels spawn within this radius of cursor (tighter)
const MAX_LIFE = 400; // Max lifetime in ms
const MIN_LIFE = 150; // Min lifetime in ms

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let particles: Particle[] = [];
let mouseX = -100;
let mouseY = -100;
let isActive = false;
let animationId: number | null = null;

/**
 * Initialize the cursor trail effect.
 */
export function initCursorTrail(): void {
  if (canvas) return; // Already initialized
  
  // Create fullscreen canvas with color inversion blend mode
  canvas = document.createElement('canvas');
  canvas.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 9999;
    mix-blend-mode: difference;
  `;
  document.body.appendChild(canvas);
  
  ctx = canvas.getContext('2d')!;
  
  // Handle resize
  function resize() {
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  
  resize();
  window.addEventListener('resize', resize);
  
  // Track mouse position
  document.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    isActive = true;
  });
  
  document.addEventListener('mouseleave', () => {
    isActive = false;
  });
  
  // Touch support for iOS - activate on touch, deactivate on release
  document.addEventListener('touchstart', (e) => {
    if (e.touches.length > 0) {
      mouseX = e.touches[0].clientX;
      mouseY = e.touches[0].clientY;
      isActive = true;
    }
  }, { passive: true });
  
  document.addEventListener('touchmove', (e) => {
    if (e.touches.length > 0) {
      mouseX = e.touches[0].clientX;
      mouseY = e.touches[0].clientY;
      isActive = true;
    }
  }, { passive: true });
  
  document.addEventListener('touchend', () => {
    isActive = false;
    particles = []; // Clear all particles immediately on touch end
  }, { passive: true });
  
  document.addEventListener('touchcancel', () => {
    isActive = false;
    particles = []; // Clear all particles immediately on touch cancel
  }, { passive: true });
  
  // Start animation loop
  let lastTime = performance.now();
  
  function animate(time: number) {
    const deltaTime = time - lastTime;
    lastTime = time;
    
    if (!ctx || !canvas) return;
    
    // Clear canvas
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    
    // Spawn new particles around cursor
    if (isActive) {
      for (let i = 0; i < SPAWN_RATE; i++) {
        // Random angle and distance for fuzzy distribution
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.random() * SPAWN_RADIUS;
        
        // Snap to pixel grid for that chunky look
        const x = Math.floor((mouseX + Math.cos(angle) * distance) / PIXEL_SIZE) * PIXEL_SIZE;
        const y = Math.floor((mouseY + Math.sin(angle) * distance) / PIXEL_SIZE) * PIXEL_SIZE;
        
        particles.push({
          x,
          y,
          life: 0,
          maxLife: MIN_LIFE + Math.random() * (MAX_LIFE - MIN_LIFE),
          size: PIXEL_SIZE,
        });
      }
    }
    
    // Update and draw particles
    ctx.fillStyle = '#e8e4de';
    
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life += deltaTime;
      
      if (p.life >= p.maxLife) {
        // Remove dead particle
        particles.splice(i, 1);
        continue;
      }
      
      // Calculate opacity - stay full for most of life, then fade at the end
      const lifeRatio = 1 - (p.life / p.maxLife);
      const opacity = Math.min(1, lifeRatio * 2); // Full opacity until 50% life, then fade
      
      ctx.globalAlpha = opacity;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    
    ctx.globalAlpha = 1;
    
    animationId = requestAnimationFrame(animate);
  }
  
  animationId = requestAnimationFrame(animate);
}

/**
 * Cleanup the cursor trail effect.
 */
export function destroyCursorTrail(): void {
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
  
  if (canvas && canvas.parentNode) {
    canvas.parentNode.removeChild(canvas);
  }
  
  canvas = null;
  ctx = null;
  particles = [];
}

