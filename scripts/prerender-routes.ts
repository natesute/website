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
  const flat = listMarkdown(dir)
    .map((file) => {
      const { data } = matter(fs.readFileSync(file, 'utf-8'));
      if (data.draft === true) return null;
      return slugFromFile(file, data);
    })
    .filter((slug): slug is string => slug !== null);

  // Folder-based entries: <dir>/<slug>/index.md
  const folders = fs.existsSync(dir)
    ? fs
        .readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
        .map((e) => {
          const indexFile = path.join(dir, e.name, 'index.md');
          if (!fs.existsSync(indexFile)) return null;
          const { data } = matter(fs.readFileSync(indexFile, 'utf-8'));
          if (data.draft === true) return null;
          return typeof data.slug === 'string' ? data.slug : e.name;
        })
        .filter((slug): slug is string => slug !== null)
    : [];

  return [...flat, ...folders];
}

function generateSitemap(routes: string[]): string {
  const urls = ['', ...routes]
    .map(
      (route) => `  <url><loc>https://nathansuttie.com/${route}</loc></url>`
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
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
    ...(projectSlugs.length > 0 ? ['projects'] : []),
    'writings',
    'contacts',
    ...projectSlugs.map((s) => `projects/${s}`),
    ...writingSlugs.map((s) => `writings/${s}`),
  ];

  for (const route of routes) {
    emitRoute(route, indexHtml);
  }

  // The sitemap is generated from the same route list, so it can never drift
  fs.writeFileSync(path.join(DIST_DIR, 'sitemap.xml'), generateSitemap(routes));

  console.log(`Prerendered ${routes.length} routes (+ sitemap.xml):`);
  for (const route of routes) console.log(`  /${route}`);
}

main();
