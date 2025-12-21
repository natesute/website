/**
 * Font loading utilities.
 * Ensures fonts are loaded before rasterization begins.
 */

export interface FontConfig {
  family: string;
  weights: number[];
  italic?: boolean;
}

export const FONTS: FontConfig[] = [
  { family: 'Cormorant Garamond', weights: [400, 600], italic: true },
  { family: 'JetBrains Mono', weights: [400] },
  { family: 'Press Start 2P', weights: [400] },
  { family: 'Geo', weights: [400], italic: true },
];

/**
 * Wait for all configured fonts to load
 */
export async function loadFonts(): Promise<void> {
  if (!document.fonts) return;

  await document.fonts.ready;

  // Load all font variants (including italic when specified)
  for (const font of FONTS) {
    for (const weight of font.weights) {
      // Load regular (non-italic) variant
      const regularSpec = `${weight} 16px "${font.family}"`;
      try {
        await document.fonts.load(regularSpec);
      } catch {
        console.warn(`Font not available: ${regularSpec}`);
      }

      // Load italic variant if configured
      if (font.italic) {
        const italicSpec = `italic ${weight} 16px "${font.family}"`;
        try {
          await document.fonts.load(italicSpec);
        } catch {
          console.warn(`Font not available: ${italicSpec}`);
        }
      }
    }
  }
}

/**
 * Check if a specific font is available
 */
export function isFontLoaded(family: string): boolean {
  if (!document.fonts) return false;
  return document.fonts.check(`16px "${family}"`);
}





