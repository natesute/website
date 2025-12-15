/**
 * Layout utilities for positioning content.
 * Handles responsive adjustments and content column calculations.
 */

export interface LayoutConfig {
  maxContentWidth: number;  // In characters (ch)
  verticalPadding: number;  // Normalized 0-1
  horizontalPadding: number; // Normalized 0-1
}

export const DEFAULT_LAYOUT: LayoutConfig = {
  maxContentWidth: 65,
  verticalPadding: 0.1,
  horizontalPadding: 0.15,
};

/**
 * Calculate content bounds for the current viewport
 */
export function calculateContentBounds(
  viewportWidth: number,
  _viewportHeight: number,
  config: LayoutConfig = DEFAULT_LAYOUT
): { x: number; y: number; width: number; height: number } {
  // Approximate character width in pixels for the body font
  const charWidthPx = 12; // Approximate for Cormorant at body size
  const maxWidthPx = config.maxContentWidth * charWidthPx;
  
  // Content width is the lesser of max width or viewport minus padding
  const availableWidth = viewportWidth * (1 - config.horizontalPadding * 2);
  const contentWidth = Math.min(maxWidthPx, availableWidth);
  
  // Normalize to 0-1
  const normalizedWidth = contentWidth / viewportWidth;
  const x = (1 - normalizedWidth) / 2;
  
  return {
    x,
    y: config.verticalPadding,
    width: normalizedWidth,
    height: 1 - config.verticalPadding * 2,
  };
}

/**
 * Convert screen coordinates to simulation coordinates
 */
export function screenToSim(
  screenX: number,
  screenY: number,
  screenWidth: number,
  screenHeight: number,
  simWidth: number,
  simHeight: number
): { x: number; y: number } {
  return {
    x: (screenX / screenWidth) * simWidth,
    y: (screenY / screenHeight) * simHeight,
  };
}

