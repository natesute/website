/**
 * Post-build step: copy dist/index.html to dist/<route>/index.html for every
 * real route, so GitHub Pages serves a 200 (instead of falling back to 404.html)
 * for direct navigation, refreshes, and crawlers.
 */

import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';

const DIST_DIR = path.join(process.cwd(), 'dist');
const CONTENT_DIR = path.join(process.cwd(), 'content');

function slugFromFile(filePath: string, frontmatter: Record<string, unknown>): string {
  if (typeof frontmatter.slug === 'string') return frontmatter.slug;
  const base = path.basename(filePath, '.md');
  return base.replace(/^\d{4}-\d{2}-\d{2}-/, '').toLowerCase();
}

function listMarkdown(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.md') && name !== '_index.md')
    .map((name) => path.join(dir, name));
}

function collectChildSlugs(dir: string): string[] {
  return listMarkdown(dir)
    .map((file) => {
      const { data } = matter(fs.readFileSync(file, 'utf-8'));
      if (data.draft === true) return null;
      return slugFromFile(file, data);
    })
    .filter((slug): slug is string => slug !== null);
}

function emitRoute(route: string, indexHtml: string): void {
  const dir = path.join(DIST_DIR, route);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), indexHtml);
}

function main(): void {
  const indexPath = path.join(DIST_DIR, 'index.html');
  if (!fs.existsSync(indexPath)) {
    throw new Error(`Expected ${indexPath} to exist — run vite build first.`);
  }
  const indexHtml = fs.readFileSync(indexPath, 'utf-8');

  const projectSlugs = collectChildSlugs(path.join(CONTENT_DIR, 'projects'));
  const writingSlugs = collectChildSlugs(path.join(CONTENT_DIR, 'writings'));

  const routes = [
    'about-me',
    'projects',
    'writings',
    'contacts',
    ...projectSlugs.map((s) => `projects/${s}`),
    ...writingSlugs.map((s) => `writings/${s}`),
  ];

  for (const route of routes) {
    emitRoute(route, indexHtml);
  }

  console.log(`Prerendered ${routes.length} routes:`);
  for (const route of routes) console.log(`  /${route}`);
}

main();
