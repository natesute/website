import { GrowthSimulation } from './simulation/growth-simulation';
import { Renderer } from './renderer';
import { GlyphRasterizer } from './typography/rasterizer';
import { PAGES, PageState } from './content/pages';
import { loadFonts } from './typography/fonts';

async function init() {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  const fallback = document.getElementById('fallback') as HTMLDivElement;
  const body = document.body;

  // Page elements
  const pageElements: Record<string, HTMLElement | null> = {
    'about me': document.getElementById('page-about-me'),
    'projects': document.getElementById('page-projects'),
    'writings': document.getElementById('page-writings'),
    'contact me': document.getElementById('page-contact-me'),
  };

  // Check WebGPU support
  if (!navigator.gpu) {
    fallback.classList.add('active');
    console.error('WebGPU not supported');
    return;
  }

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    fallback.classList.add('active');
    console.error('No GPU adapter found');
    return;
  }

  const device = await adapter.requestDevice();

  const context = canvas.getContext('webgpu');
  if (!context) {
    fallback.classList.add('active');
    console.error('Could not get WebGPU context');
    return;
  }

  const format = navigator.gpu.getPreferredCanvasFormat();
  
  function resize() {
    const dpr = Math.min(window.devicePixelRatio, 2);
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    context!.configure({
      device,
      format,
      alphaMode: 'opaque',
    });
  }

  resize();
  window.addEventListener('resize', resize);

  await loadFonts();

  // Grid size
  const simWidth = 512;
  const simHeight = 512;
  const simulation = new GrowthSimulation(device, simWidth, simHeight);
  const renderer = new Renderer(device, format, simulation);
  const rasterizer = new GlyphRasterizer(simWidth, simHeight);
  
  let currentState: PageState = 'home';
  let isGrowing = false;
  let isCanvasMode = true;
  let menuRevealed = false;
  let hasVisitedHome = false;  // Track if we've already visited home once
  
  // Menu links for staggered reveal
  const menuLinks = document.querySelectorAll('#home-menu a');
  
  function hideMenuLinks() {
    menuRevealed = false;
    menuLinks.forEach(link => link.classList.remove('visible'));
    canvas.classList.remove('shifted-up');
  }
  
  function shiftUpAndRevealMenu() {
    if (menuRevealed) return;
    menuRevealed = true;
    
    // Shift canvas up first
    canvas.classList.add('shifted-up');
    
    // Enable wobble after shift animation completes + 500ms delay
    setTimeout(() => {
      renderer.enableWobble(performance.now() / 1000);
    }, 1300);
    
    // Start revealing links 600ms after shift starts
    setTimeout(() => {
      menuLinks.forEach((link, index) => {
        // Eased timing: faster at start, slower at end
        // Using cubic curve for more noticeable slowdown
        const t = index / (menuLinks.length - 1);
        const easedT = t * t * t; // Cubic - delays grow more progressively
        const delay = easedT * 400; // Total spread of ~400ms
        setTimeout(() => {
          link.classList.add('visible');
        }, delay);
      });
    }, 600);
  }

  // Switch to canvas mode (home page)
  function showCanvasMode() {
    isCanvasMode = true;
    body.classList.remove('html-mode');
    body.classList.add('canvas-mode');
    
    // Hide all HTML pages
    Object.values(pageElements).forEach(el => {
      if (el) el.classList.remove('active');
    });
  }

  // Switch to HTML mode (subpages)
  function showHtmlMode(state: PageState) {
    isCanvasMode = false;
    body.classList.remove('canvas-mode');
    body.classList.add('html-mode');
    
    // Hide all pages first
    Object.values(pageElements).forEach(el => {
      if (el) el.classList.remove('active');
    });
    
    // Show the requested page
    const pageEl = pageElements[state];
    if (pageEl) {
      pageEl.classList.add('active');
    }
  }

  // Load home page - animate on first visit, instant on return
  async function loadHomePage() {
    currentState = 'home';
    showCanvasMode();
    renderer.clearUnderline();
    
    // Ensure fonts are ready before rasterizing
    await document.fonts.ready;
    
    const page = PAGES['home'];
    const mask = rasterizer.rasterizePage(page);
    simulation.setMaskFromImage(mask.data, mask.width, mask.height);
    
    if (hasVisitedHome) {
      // Return visit: show everything instantly
      simulation.setComplete();
      renderer.enableWobble(performance.now() / 1000);
      menuLinks.forEach(link => link.classList.add('visible'));
      canvas.classList.add('shifted-up');
      menuRevealed = true;
      isGrowing = false;
    } else {
      // First visit: run the full animation
      hasVisitedHome = true;
      renderer.disableWobble();
      hideMenuLinks();
      isGrowing = true;
    }
  }

  // Navigate to a page
  function navigateTo(state: PageState) {
    if (state === currentState) return;
    
    currentState = state;
    const url = state === 'home' ? '/' : `/${state.replace(' ', '-')}`;
    history.pushState({ state }, '', url);
    
    if (state === 'home') {
      loadHomePage();
    } else {
      showHtmlMode(state);
    }
  }

  // Handle browser back/forward
  window.addEventListener('popstate', () => {
    const path = window.location.pathname.replace(/^\/|\/$/g, '').toLowerCase().replace('-', ' ');
    const state = (path in PAGES ? path : 'home') as PageState;
    currentState = state;
    
    if (state === 'home') {
      loadHomePage();
    } else {
      showHtmlMode(state);
    }
  });

  // Set up all navigation links (home menu + back links)
  document.querySelectorAll('[data-nav]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const target = (link as HTMLElement).dataset.nav as PageState;
      navigateTo(target);
    });
  });

  // Initial page load based on URL
  const initialPath = window.location.pathname.replace(/^\/|\/$/g, '').toLowerCase().replace('-', ' ');
  const initialState = (initialPath in PAGES ? initialPath : 'home') as PageState;
  
  if (initialState === 'home') {
    await loadHomePage();
  } else {
    currentState = initialState;
    showHtmlMode(initialState);
  }

  // Main loop (only renders when in canvas mode)
  let frameCount = 0;
  function frame(time: number) {
    if (isCanvasMode) {
      frameCount++;

      if (isGrowing && !simulation.getIsComplete() && frameCount % 2 === 0) {
        simulation.step();
      }
      
      if (simulation.getIsComplete()) {
        isGrowing = false;
        shiftUpAndRevealMenu();
      }

      renderer.updateBindGroup();

      const commandEncoder = device.createCommandEncoder();
      const stillGrowing = isGrowing && !simulation.getIsComplete();
      renderer.render(commandEncoder, context!.getCurrentTexture().createView(), time / 1000, stillGrowing, canvas.width, canvas.height);
      device.queue.submit([commandEncoder.finish()]);
    }

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

init().catch(console.error);
