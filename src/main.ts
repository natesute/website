import { GrowthSimulation } from './simulation/growth-simulation';
import { Renderer } from './renderer';
import { GlyphRasterizer } from './typography/rasterizer';
import { PAGES } from './content/pages';
import { loadFonts } from './typography/fonts';

async function init() {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  const fallback = document.getElementById('fallback') as HTMLDivElement;
  const body = document.body;

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
  
  // Current navigation path (e.g., "home", "projects", "projects/lorem-ipsum")
  let currentPath = 'home';
  let isGrowing = false;
  let isCanvasMode = true;
  let menuRevealed = false;
  let hasVisitedHome = false;
  
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
    
    canvas.classList.add('shifted-up');
    
    setTimeout(() => {
      renderer.enableWobble(performance.now() / 1000);
    }, 1300);
    
    setTimeout(() => {
      menuLinks.forEach((link, index) => {
        const t = index / (menuLinks.length - 1);
        const easedT = t * t * t;
        const delay = easedT * 400;
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
    document.querySelectorAll('.page-content').forEach(el => {
      el.classList.remove('active');
    });
  }

  /**
   * Show HTML mode for a given path.
   * Path can be: "about me", "projects", "projects/lorem-ipsum", etc.
   */
  function showHtmlMode(pagePath: string) {
    isCanvasMode = false;
    body.classList.remove('canvas-mode');
    body.classList.add('html-mode');
    
    // Hide all pages first
    document.querySelectorAll('.page-content').forEach(el => {
      el.classList.remove('active');
    });
    
    // Convert path to page ID
    // e.g., "about me" -> "page-about-me"
    // e.g., "projects/lorem-ipsum" -> "page-projects-lorem-ipsum"
    const pageId = 'page-' + pagePath.replace(/\s+/g, '-').replace(/\//g, '-');
    const pageEl = document.getElementById(pageId);
    
    if (pageEl) {
      pageEl.classList.add('active');
    } else {
      // Fallback: try the parent page for nested routes
      const parentPath = pagePath.split('/')[0];
      const parentId = 'page-' + parentPath.replace(/\s+/g, '-');
      const parentEl = document.getElementById(parentId);
      if (parentEl) {
        parentEl.classList.add('active');
      }
    }
  }

  // Load home page - animate on first visit, instant on return
  async function loadHomePage() {
    currentPath = 'home';
    showCanvasMode();
    renderer.clearUnderline();
    
    await document.fonts.ready;
    
    const page = PAGES['home'];
    const mask = rasterizer.rasterizePage(page);
    simulation.setMaskFromImage(mask.data, mask.width, mask.height);
    
    if (hasVisitedHome) {
      simulation.setComplete();
      renderer.enableWobble(performance.now() / 1000);
      menuLinks.forEach(link => link.classList.add('visible'));
      canvas.classList.add('shifted-up');
      menuRevealed = true;
      isGrowing = false;
    } else {
      hasVisitedHome = true;
      renderer.disableWobble();
      hideMenuLinks();
      isGrowing = true;
    }
  }

  /**
   * Convert URL path to internal navigation path.
   * e.g., "/about-me" -> "about me"
   * e.g., "/writings/my-article" -> "writings/my-article"
   */
  function urlToNavPath(urlPath: string): string {
    const clean = urlPath.replace(/^\/|\/$/g, '').toLowerCase();
    if (!clean) return 'home';
    
    // Handle nested paths (keep the slash)
    const parts = clean.split('/');
    if (parts.length === 1) {
      // Single segment - replace hyphens with spaces for known pages
      return parts[0].replace(/-/g, ' ');
    }
    // Multi-segment path - keep as-is but replace hyphens in first segment
    parts[0] = parts[0].replace(/-/g, ' ');
    return parts.join('/');
  }

  /**
   * Convert internal navigation path to URL.
   * e.g., "about me" -> "/about-me"
   * e.g., "writings/my-article" -> "/writings/my-article"
   */
  function navPathToUrl(navPath: string): string {
    if (navPath === 'home') return '/';
    // Replace spaces with hyphens
    return '/' + navPath.replace(/\s+/g, '-');
  }

  /**
   * Check if a path is the home page
   */
  function isHomePath(navPath: string): boolean {
    return navPath === 'home' || navPath === '';
  }

  /**
   * Navigate to a path (can be simple like "projects" or nested like "projects/lorem-ipsum")
   */
  function navigateTo(navPath: string) {
    if (navPath === currentPath) return;
    
    currentPath = navPath;
    history.pushState({ path: navPath }, '', navPathToUrl(navPath));
    
    if (isHomePath(navPath)) {
      loadHomePage();
    } else {
      showHtmlMode(navPath);
    }
  }

  // Handle browser back/forward
  window.addEventListener('popstate', () => {
    const navPath = urlToNavPath(window.location.pathname);
    currentPath = navPath;
    
    if (isHomePath(navPath)) {
      loadHomePage();
    } else {
      showHtmlMode(navPath);
    }
  });

  // Set up all navigation links (home menu + back links + item links)
  document.querySelectorAll('[data-nav]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const target = (link as HTMLElement).dataset.nav as string;
      navigateTo(target);
    });
  });

  // Initial page load based on URL
  const initialPath = urlToNavPath(window.location.pathname);
  
  if (isHomePath(initialPath)) {
    await loadHomePage();
  } else {
    currentPath = initialPath;
    showHtmlMode(initialPath);
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
