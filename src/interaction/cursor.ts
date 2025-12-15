import { Simulation } from '../simulation/simulation';
import { StateMachine } from '../content/state-machine';
import { PAGES, PageState } from '../content/pages';
import { GlyphRasterizer } from '../typography/rasterizer';

interface ClickRegion {
  bounds: { x: number; y: number; width: number; height: number };
  target: string;
}

/**
 * Tracks cursor position and handles interactions.
 * The cursor acts as a subtle chemical feed agent and detects link clicks.
 */
export class CursorTracker {
  private simulation: Simulation;
  private stateMachine: StateMachine | null = null;
  private canvas: HTMLCanvasElement;
  private rasterizer: GlyphRasterizer;
  
  private x = 0;
  private y = 0;
  private active = false;
  private hoveredRegion: ClickRegion | null = null;
  private clickRegions: ClickRegion[] = [];

  constructor(canvas: HTMLCanvasElement, simulation: Simulation) {
    this.canvas = canvas;
    this.simulation = simulation;
    this.rasterizer = new GlyphRasterizer(simulation.width * 2, simulation.height * 2);

    canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
    canvas.addEventListener('mouseenter', () => { this.active = true; });
    canvas.addEventListener('mouseleave', () => { 
      this.active = false; 
      this.hoveredRegion = null;
      this.updateCursor();
    });
    canvas.addEventListener('click', this.onClick.bind(this));

    // Touch support
    canvas.addEventListener('touchmove', this.onTouchMove.bind(this), { passive: true });
    canvas.addEventListener('touchstart', this.onTouchStart.bind(this), { passive: true });
    canvas.addEventListener('touchend', () => { this.active = false; }, { passive: true });

    // Update regions for initial page
    this.updateClickRegions('home');
  }

  /**
   * Set the state machine for navigation
   */
  setStateMachine(stateMachine: StateMachine) {
    this.stateMachine = stateMachine;
  }

  /**
   * Update click regions when page changes
   */
  updateClickRegions(state: PageState) {
    const page = PAGES[state];
    this.clickRegions = this.rasterizer.getClickRegions(page);
  }

  private onMouseMove(e: MouseEvent) {
    const rect = this.canvas.getBoundingClientRect();
    this.x = (e.clientX - rect.left) / rect.width;
    this.y = (e.clientY - rect.top) / rect.height;
    this.active = true;

    // Check for hover on link regions
    this.hoveredRegion = this.getHoveredRegion();
    this.updateCursor();
  }

  private onTouchMove(e: TouchEvent) {
    if (e.touches.length > 0) {
      const touch = e.touches[0];
      const rect = this.canvas.getBoundingClientRect();
      this.x = (touch.clientX - rect.left) / rect.width;
      this.y = (touch.clientY - rect.top) / rect.height;
    }
  }

  private onTouchStart(e: TouchEvent) {
    this.active = true;
    if (e.touches.length > 0) {
      const touch = e.touches[0];
      const rect = this.canvas.getBoundingClientRect();
      this.x = (touch.clientX - rect.left) / rect.width;
      this.y = (touch.clientY - rect.top) / rect.height;
      
      // Check for tap on link
      const region = this.getHoveredRegion();
      if (region && this.stateMachine) {
        this.stateMachine.navigateTo(region.target as PageState);
        this.updateClickRegions(region.target as PageState);
      }
    }
  }

  private onClick(_e: MouseEvent) {
    if (this.hoveredRegion && this.stateMachine) {
      this.stateMachine.navigateTo(this.hoveredRegion.target as PageState);
      this.updateClickRegions(this.hoveredRegion.target as PageState);
    }
  }

  private getHoveredRegion(): ClickRegion | null {
    for (const region of this.clickRegions) {
      const { x, y, width, height } = region.bounds;
      if (this.x >= x && this.x <= x + width &&
          this.y >= y && this.y <= y + height) {
        return region;
      }
    }
    return null;
  }

  private updateCursor() {
    this.canvas.style.cursor = this.hoveredRegion ? 'pointer' : 'default';
  }

  /**
   * Update simulation with current cursor state
   */
  update() {
    // Update simulation uniforms - cursor acts as feed agent
    this.simulation.setCursor(this.x, this.y, this.active);
  }

  /**
   * Get current normalized position
   */
  getPosition(): { x: number; y: number } {
    return { x: this.x, y: this.y };
  }

  /**
   * Check if hovering over a link
   */
  isHoveringLink(): boolean {
    return this.hoveredRegion !== null;
  }
}
