// Note: WebGPU implementation preserved in .bak files if needed in future
import { CanvasGrowthSimulation } from './simulation/canvas-growth-simulation';
import { CanvasRenderer } from './canvas-renderer';
import { GlyphRasterizer } from './typography/rasterizer';
import { PAGES } from './content/pages';
import { loadFonts } from './typography/fonts';
import { initAllPixelHovers, recheckAllHoverStates } from './effects/pixel-hover';
import { initCursorTrail } from './effects/cursor-trail';

async function init() {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  const fallback = document.getElementById('fallback') as HTMLDivElement;
  const body = document.body;

  // Initialize Canvas 2D renderer
  const ctx = canvas.getContext('2d')!;
  
  function resize() {
    const dpr = Math.min(window.devicePixelRatio, 2);
    canvas.width = window.innerWidth * dpr;
    canvas.height = (window.innerHeight + window.innerHeight * 0.15) * dpr;
  }
  
  resize();
  
  const simWidth = 256;
  const simHeight = 256;
  const simulation = new CanvasGrowthSimulation(simWidth, simHeight);
  const renderer = new CanvasRenderer(ctx, simulation);
  
  const render = (time: number, isGrowing: boolean) => {
    renderer.render(time / 1000, isGrowing, canvas.width, canvas.height);
  };

  // Hide the fallback message
  fallback.style.display = 'none';

  window.addEventListener('resize', resize);

  await loadFonts();

  const rasterizer = new GlyphRasterizer(simWidth, simHeight);

  // Current navigation path (e.g., "home", "projects", "projects/lorem-ipsum")
  let currentPath = 'home';
  let isGrowing = false;
  let isCanvasMode = true;
  let menuRevealed = false;
  let hasVisitedHome = false;

  // Menu links for staggered reveal
  const menuLinks = document.querySelectorAll('#home-menu a');

  // Initialize pixel hover effect on interactive elements
  initAllPixelHovers();
  
  // Initialize cursor trail effect
  initCursorTrail();

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
      menuLinks.forEach((link, index) => {
        const t = index / (menuLinks.length - 1);
        const easedT = t * t * t;
        const delay = easedT * 450;
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
    
    // Re-check hover states after page becomes visible
    // Double rAF ensures layout is computed and hover states are recalculated
    requestAnimationFrame(() => {
      requestAnimationFrame(() => recheckAllHoverStates());
    });
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
      
      // Step every 4 frames for slower animation
      if (isGrowing && !simulation.getIsComplete() && frameCount % 4 === 0) {
        simulation.step();
      }

      if (simulation.getIsComplete() && isGrowing) {
        isGrowing = false;
        renderer.enableWobble(time / 1000);
        // Delay shift so wobble is visible first
        setTimeout(() => shiftUpAndRevealMenu(), 800);
      }

      const stillGrowing = isGrowing && !simulation.getIsComplete();
      render(time, stillGrowing);
    }

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

init().catch(console.error);
