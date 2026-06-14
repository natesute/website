/**
 * Home page text blocks for the glyph rasterizer.
 * (Other pages render as plain HTML and don't need rasterization.)
 */

export interface TextBlock {
  text: string;
  x: number;
  y: number;
  fontSize: number;
  align: 'left' | 'center' | 'right';
  maxWidth?: number;
  weight?: 'normal' | 'bold';
  italic?: boolean;
  fontFamily?: string;
  letterSpacing?: number;
}

export interface PageContent {
  blocks: TextBlock[];
}

export const PAGES: Record<'home', PageContent> = {
  home: {
    blocks: [
      {
        text: "nathan's",
        x: 0.5,
        y: 0.44,
        fontSize: 52,
        align: 'center',
        fontFamily: 'Bytesized',
        letterSpacing: 1,
      },
      {
        text: 'web page',
        x: 0.5,
        y: 0.54,
        fontSize: 52,
        align: 'center',
        fontFamily: 'Bytesized',
        letterSpacing: 1,
      },
    ],
  },
};
