/**
 * Page content definitions.
 * Each page defines its text content and layout for the glyph rasterizer.
 */

export type PageState = 'home' | 'projects' | 'about me' | 'blog' | 'contact me';

export interface TextBlock {
  text: string;
  x: number;      // Normalized 0-1
  y: number;      // Normalized 0-1
  fontSize: number; // In pixels (at 1024px canvas)
  align: 'left' | 'center' | 'right';
  maxWidth?: number; // Normalized, for wrapping
  weight?: 'normal' | 'bold';
  italic?: boolean;
  fontFamily?: string; // Custom font family (defaults to Cormorant Garamond)
  letterSpacing?: number; // Letter spacing in pixels (scaled with fontSize)
  isLink?: boolean;
  linkTarget?: PageState;
}

export interface PageContent {
  blocks: TextBlock[];
}

export const PAGES: Record<PageState, PageContent> = {
  home: {
    blocks: [
      {
        text: "nathan's",
        x: 0.5,
        y: 0.34,
        fontSize: 36,
        align: 'center',
        fontFamily: 'Bytesized',
        letterSpacing: 1,
      },
      {
        text: 'web page',
        x: 0.5,
        y: 0.40,
        fontSize: 36,
        align: 'center',
        fontFamily: 'Bytesized',
        letterSpacing: 1,
      },
    ],
  },

  projects: {
    blocks: [
      {
        text: 'projects',
        x: 0.5,
        y: 0.28,
        fontSize: 22,
        align: 'center',
        italic: true,
      },
      {
        text: 'Lorem Ipsum',
        x: 0.5,
        y: 0.42,
        fontSize: 28,
        align: 'center',
        weight: 'bold',
      },
      {
        text: 'Dolor sit amet consectetur',
        x: 0.5,
        y: 0.48,
        fontSize: 20,
        align: 'center',
      },
      {
        text: 'Adipiscing Elit',
        x: 0.5,
        y: 0.58,
        fontSize: 28,
        align: 'center',
        weight: 'bold',
      },
      {
        text: 'Sed do eiusmod tempor incididunt',
        x: 0.5,
        y: 0.64,
        fontSize: 20,
        align: 'center',
      },
      {
        text: 'back',
        x: 0.5,
        y: 0.85,
        fontSize: 24,
        align: 'center',
        isLink: true,
        linkTarget: 'home',
      },
    ],
  },

  'about me': {
    blocks: [
      {
        text: 'about me',
        x: 0.5,
        y: 0.18,
        fontSize: 22,
        align: 'center',
        italic: true,
      },
      {
        text: 'Lorem ipsum dolor sit amet,',
        x: 0.5,
        y: 0.35,
        fontSize: 24,
        align: 'center',
      },
      {
        text: 'consectetur adipiscing elit.',
        x: 0.5,
        y: 0.41,
        fontSize: 24,
        align: 'center',
      },
      {
        text: 'Ut enim ad minim veniam,',
        x: 0.5,
        y: 0.52,
        fontSize: 22,
        align: 'center',
      },
      {
        text: 'quis nostrud exercitation',
        x: 0.5,
        y: 0.58,
        fontSize: 22,
        align: 'center',
      },
      {
        text: 'ullamco laboris.',
        x: 0.5,
        y: 0.64,
        fontSize: 22,
        align: 'center',
      },
      {
        text: 'back',
        x: 0.5,
        y: 0.85,
        fontSize: 24,
        align: 'center',
        isLink: true,
        linkTarget: 'home',
      },
    ],
  },

  blog: {
    blocks: [
      {
        text: 'blog',
        x: 0.5,
        y: 0.18,
        fontSize: 22,
        align: 'center',
        italic: true,
      },
      {
        text: 'Duis aute irure dolor in',
        x: 0.5,
        y: 0.28,
        fontSize: 22,
        align: 'center',
        italic: true,
      },
      {
        text: 'reprehenderit in voluptate.',
        x: 0.5,
        y: 0.34,
        fontSize: 22,
        align: 'center',
        italic: true,
      },
      {
        text: 'Excepteur Sint Occaecat',
        x: 0.5,
        y: 0.48,
        fontSize: 26,
        align: 'center',
        weight: 'bold',
      },
      {
        text: '20XX.XX.XX',
        x: 0.5,
        y: 0.54,
        fontSize: 18,
        align: 'center',
      },
      {
        text: 'Cupidatat Non Proident',
        x: 0.5,
        y: 0.64,
        fontSize: 26,
        align: 'center',
        weight: 'bold',
      },
      {
        text: '20XX.XX.XX',
        x: 0.5,
        y: 0.70,
        fontSize: 18,
        align: 'center',
      },
      {
        text: 'back',
        x: 0.5,
        y: 0.85,
        fontSize: 24,
        align: 'center',
        isLink: true,
        linkTarget: 'home',
      },
    ],
  },

  'contact me': {
    blocks: [
      {
        text: 'contact me',
        x: 0.5,
        y: 0.25,
        fontSize: 22,
        align: 'center',
        italic: true,
      },
      {
        text: 'admin@email.com',
        x: 0.5,
        y: 0.45,
        fontSize: 24,
        align: 'center',
      },
      {
        text: 'github.com/mygithubusername',
        x: 0.5,
        y: 0.55,
        fontSize: 24,
        align: 'center',
      },
      {
        text: 'back',
        x: 0.5,
        y: 0.85,
        fontSize: 24,
        align: 'center',
        isLink: true,
        linkTarget: 'home',
      },
    ],
  },
};

