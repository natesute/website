import { PageContent, TextBlock } from '../content/pages';

/**
 * Rasterizes text content to a grayscale mask for the RD parameter field.
 * White pixels indicate text regions, black pixels indicate background.
 */
export class GlyphRasterizer {
  private canvas: OffscreenCanvas;
  private ctx: OffscreenCanvasRenderingContext2D;
  readonly width: number;
  readonly height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.canvas = new OffscreenCanvas(width, height);
    const ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      throw new Error('Could not get 2D context for glyph rasterization');
    }
    this.ctx = ctx;
  }

  /**
   * Rasterize a full page of content
   * @param hoveredBlockIndex - Optional index of block to underline
   */
  rasterizePage(page: PageContent, hoveredBlockIndex?: number): ImageData {
    // Clear to black
    this.ctx.fillStyle = '#000000';
    this.ctx.fillRect(0, 0, this.width, this.height);

    // Render each text block in white
    for (let i = 0; i < page.blocks.length; i++) {
      const block = page.blocks[i];
      const shouldUnderline = hoveredBlockIndex === i && block.isLink;
      this.renderBlock(block, shouldUnderline);
    }

    return this.ctx.getImageData(0, 0, this.width, this.height);
  }

  private renderBlock(block: TextBlock, underline: boolean = false) {
    const x = block.x * this.width;
    const y = block.y * this.height;
    
    // Scale font size - use larger multiplier for visibility
    const scale = this.width / 512; // Adjusted for 512px canvas
    const fontSize = Math.max(block.fontSize * scale, 12); // Minimum 12px

    // Build font string
    let fontStyle = '';
    if (block.italic) fontStyle += 'italic ';
    if (block.weight === 'bold') fontStyle += '600 ';
    else fontStyle += '400 ';
    
    const fontFamily = block.fontFamily || 'Cormorant Garamond';
    this.ctx.font = `${fontStyle}${fontSize}px "${fontFamily}", Georgia, serif`;
    this.ctx.textAlign = block.align;
    this.ctx.textBaseline = 'middle';
    
    // Set letter spacing if specified (scaled with fontSize)
    if (block.letterSpacing !== undefined) {
      const scale = this.width / 512;
      this.ctx.letterSpacing = `${block.letterSpacing * scale}px`;
    } else {
      this.ctx.letterSpacing = 'normal';
    }
    
    // Shadow offset (down and to the right)
    const shadowOffset = fontSize * 0.06;
    
    // Draw shadow first (dark gray for subtle shadow pattern)
    this.ctx.fillStyle = '#444444';
    if (block.maxWidth) {
      this.renderWrappedText(block.text, x + shadowOffset, y + shadowOffset, block.maxWidth * this.width, fontSize);
    } else {
      this.ctx.fillText(block.text, x + shadowOffset, y + shadowOffset);
    }
    
    // Draw main text on top (white for mask)
    this.ctx.fillStyle = '#ffffff';
    if (block.maxWidth) {
      this.renderWrappedText(block.text, x, y, block.maxWidth * this.width, fontSize);
    } else {
      this.ctx.fillText(block.text, x, y);
    }

    // Draw underline if requested
    if (underline) {
      const metrics = this.ctx.measureText(block.text);
      let lineX = x;
      if (block.align === 'center') lineX -= metrics.width / 2;
      else if (block.align === 'right') lineX -= metrics.width;
      
      const lineY = y + fontSize * 0.5 + 2; // Below text baseline
      const lineHeight = Math.max(2, fontSize * 0.08); // Thin underline
      
      this.ctx.fillRect(lineX, lineY, metrics.width, lineHeight);
    }
  }

  private renderWrappedText(text: string, x: number, y: number, maxWidth: number, fontSize: number) {
    const words = text.split(' ');
    let line = '';
    let lineY = y;
    const lineHeight = fontSize * 1.4;

    for (const word of words) {
      const testLine = line + (line ? ' ' : '') + word;
      const metrics = this.ctx.measureText(testLine);
      
      if (metrics.width > maxWidth && line) {
        this.ctx.fillText(line, x, lineY);
        line = word;
        lineY += lineHeight;
      } else {
        line = testLine;
      }
    }
    
    if (line) {
      this.ctx.fillText(line, x, lineY);
    }
  }

  /**
   * Get hit regions for click detection
   * Returns bounds of each link block
   */
  getClickRegions(page: PageContent): Array<{
    bounds: { x: number; y: number; width: number; height: number };
    target: string;
  }> {
    const regions: Array<{
      bounds: { x: number; y: number; width: number; height: number };
      target: string;
    }> = [];

    for (const block of page.blocks) {
      if (block.isLink && block.linkTarget) {
        const scale = this.width / 1024;
        const fontSize = block.fontSize * scale;
        
        // Approximate text bounds
        this.ctx.font = `400 ${fontSize}px "Cormorant Garamond", Georgia, serif`;
        const metrics = this.ctx.measureText(block.text);
        
        let x = block.x * this.width;
        if (block.align === 'center') x -= metrics.width / 2;
        else if (block.align === 'right') x -= metrics.width;
        
        const y = block.y * this.height - fontSize / 2;
        
        regions.push({
          bounds: {
            x: x / this.width,
            y: y / this.height,
            width: metrics.width / this.width,
            height: fontSize * 1.2 / this.height,
          },
          target: block.linkTarget,
        });
      }
    }

    return regions;
  }
}

