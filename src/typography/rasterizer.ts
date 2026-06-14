import { PageContent, TextBlock } from '../content/pages';

/**
 * Rasterizes text blocks to a grayscale mask used as the growth-simulation seed
 * region. White pixels = text, dark grey = drop-shadow, black = background.
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

  rasterizePage(page: PageContent): ImageData {
    this.ctx.fillStyle = '#000000';
    this.ctx.fillRect(0, 0, this.width, this.height);

    for (const block of page.blocks) {
      this.renderBlock(block);
    }

    return this.ctx.getImageData(0, 0, this.width, this.height);
  }

  private renderBlock(block: TextBlock) {
    const x = block.x * this.width;
    const y = block.y * this.height;

    const scale = this.width / 512;
    const fontSize = Math.max(block.fontSize * scale, 12);

    let fontStyle = '';
    if (block.italic) fontStyle += 'italic ';
    fontStyle += block.weight === 'bold' ? '600 ' : '400 ';

    const fontFamily = block.fontFamily || 'Cormorant Garamond';
    this.ctx.font = `${fontStyle}${fontSize}px "${fontFamily}", Georgia, serif`;
    this.ctx.textAlign = block.align;
    this.ctx.textBaseline = 'middle';

    if (block.letterSpacing !== undefined) {
      this.ctx.letterSpacing = `${block.letterSpacing * scale}px`;
    } else {
      this.ctx.letterSpacing = 'normal';
    }

    const shadowOffset = fontSize * 0.06;

    this.ctx.fillStyle = '#444444';
    if (block.maxWidth) {
      this.renderWrappedText(block.text, x + shadowOffset, y + shadowOffset, block.maxWidth * this.width, fontSize);
    } else {
      this.ctx.fillText(block.text, x + shadowOffset, y + shadowOffset);
    }

    this.ctx.fillStyle = '#ffffff';
    if (block.maxWidth) {
      this.renderWrappedText(block.text, x, y, block.maxWidth * this.width, fontSize);
    } else {
      this.ctx.fillText(block.text, x, y);
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
}
