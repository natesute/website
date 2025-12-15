import { Simulation } from '../simulation/simulation';
import { GENOMES, lerpGenome, easeInOutCubic } from '../simulation/parameters';
import { GlyphRasterizer } from '../typography/rasterizer';
import { PAGES, PageState } from './pages';

/**
 * Manages page state and transitions.
 * Handles URL routing and genome interpolation for organic morphing.
 */
export class StateMachine {
  private simulation: Simulation;
  private rasterizer: GlyphRasterizer;
  
  private currentState: PageState = 'home';
  private targetState: PageState | null = null;
  private transitionProgress = 0;
  private transitionDuration = 2.5; // seconds
  
  private currentMask: ImageData | null = null;
  private targetMask: ImageData | null = null;

  constructor(simulation: Simulation) {
    this.simulation = simulation;
    this.rasterizer = new GlyphRasterizer(simulation.width * 2, simulation.height * 2);
    
    // Initial render
    this.renderCurrentPage();
  }

  /**
   * Navigate to a URL path
   */
  navigateToPath(path: string) {
    const state = this.pathToState(path);
    if (state !== this.currentState) {
      this.startTransition(state);
    }
  }

  /**
   * Navigate to a specific state (called from UI)
   */
  navigateTo(state: PageState) {
    if (state !== this.currentState && !this.targetState) {
      history.pushState(null, '', this.stateToPath(state));
      this.startTransition(state);
    }
  }

  private pathToState(path: string): PageState {
    const clean = path.replace(/^\/|\/$/g, '').toLowerCase();
    if (clean in PAGES) {
      return clean as PageState;
    }
    return 'home';
  }

  private stateToPath(state: PageState): string {
    return state === 'home' ? '/' : `/${state}`;
  }

  private startTransition(target: PageState) {
    this.targetState = target;
    this.transitionProgress = 0;
    
    // Pre-render target page mask
    const page = PAGES[target];
    this.targetMask = this.rasterizer.rasterizePage(page);
  }

  private renderCurrentPage() {
    const page = PAGES[this.currentState];
    this.currentMask = this.rasterizer.rasterizePage(page);
    
    const genome = GENOMES[this.currentState];
    this.simulation.setParametersFromMask(
      this.currentMask.data,
      this.currentMask.width,
      this.currentMask.height,
      genome.textFeed,
      genome.textKill,
      genome.feed,
      genome.kill
    );
    
    // Seed patterns only in text regions
    this.simulation.seedFromMask();
  }

  /**
   * Update transition state each frame
   */
  update(dt: number) {
    if (!this.targetState) return;

    this.transitionProgress += dt / this.transitionDuration;
    
    if (this.transitionProgress >= 1) {
      // Transition complete
      this.currentState = this.targetState;
      this.targetState = null;
      this.transitionProgress = 0;
      this.currentMask = this.targetMask;
      this.targetMask = null;
      
      // Apply final state
      this.renderCurrentPage();
    } else {
      // Interpolate genomes and masks
      const t = easeInOutCubic(this.transitionProgress);
      const fromGenome = GENOMES[this.currentState];
      const toGenome = GENOMES[this.targetState];
      const genome = lerpGenome(fromGenome, toGenome, t);
      
      // Blend masks - crossfade current to target
      if (this.targetMask && this.currentMask) {
        const blendedMask = this.blendMasks(this.currentMask, this.targetMask, t);
        this.simulation.setParametersFromMask(
          blendedMask.data,
          blendedMask.width,
          blendedMask.height,
          genome.textFeed,
          genome.textKill,
          genome.feed,
          genome.kill
        );
      }
    }
  }

  private blendMasks(a: ImageData, b: ImageData, t: number): ImageData {
    const result = new ImageData(a.width, a.height);
    for (let i = 0; i < a.data.length; i++) {
      result.data[i] = a.data[i] + (b.data[i] - a.data[i]) * t;
    }
    return result;
  }

  /**
   * Get current page state for UI
   */
  getCurrentState(): PageState {
    return this.currentState;
  }

  /**
   * Check if currently transitioning
   */
  isTransitioning(): boolean {
    return this.targetState !== null;
  }
}

