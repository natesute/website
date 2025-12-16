/**
 * Build script that generates LLM-readable files and HTML content
 * from markdown source files in the content/ directory.
 *
 * Outputs:
 * - public/llms.txt - Index/summary for LLM crawlers
 * - public/llms-full.txt - Complete content for LLMs
 * - generated/html-content.json - HTML content for injection into index.html
 */

import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import { marked } from 'marked';

// Configure marked for clean output
marked.setOptions({
  gfm: true,
  breaks: false,
});

const CONTENT_DIR = path.join(process.cwd(), 'content');
const PUBLIC_DIR = path.join(process.cwd(), 'public');
const GENERATED_DIR = path.join(process.cwd(), 'generated');

// Types for content structure
interface SiteConfig {
  name: string;
  tagline: string;
  email: string;
  github: string;
  url: string;
}

interface PageMeta {
  title: string;
  description: string;
  slug?: string;
  order?: number;
  date?: string;
  draft?: boolean;
}

interface ContentItem {
  path: string;
  meta: PageMeta;
  content: string;
  html: string;
  type: 'page' | 'project' | 'writings';
}

/**
 * Recursively find all markdown files in a directory
 */
function findMarkdownFiles(dir: string, files: string[] = []): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith('.')) {
      findMarkdownFiles(fullPath, files);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Parse a markdown file and return its metadata and content
 */
function parseMarkdownFile(filePath: string): { meta: PageMeta; content: string } {
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const { data, content } = matter(fileContent);
  return {
    meta: data as PageMeta,
    content: content.trim(),
  };
}

/**
 * Determine content type from file path
 */
function getContentType(filePath: string): 'page' | 'project' | 'writings' {
  const relativePath = path.relative(CONTENT_DIR, filePath);
  if (relativePath.startsWith('projects/')) return 'project';
  if (relativePath.startsWith('writings/')) return 'writings';
  return 'page';
}

/**
 * Generate the llms.txt index file
 */
function generateLlmsTxt(site: SiteConfig, items: ContentItem[]): string {
  const lines: string[] = [];

  // Header
  lines.push(`# ${site.name}`);
  lines.push('');
  lines.push(`> ${site.tagline}`);
  lines.push('');

  // Group by type
  const pages = items.filter((i) => i.type === 'page');
  const projects = items.filter((i) => i.type === 'project' && !i.path.includes('_index'));
  const writings = items.filter((i) => i.type === 'writings' && !i.path.includes('_index'));

  // Pages section
  if (pages.length > 0) {
    lines.push('## Pages');
    lines.push('');
    for (const page of pages.sort((a, b) => (a.meta.order ?? 99) - (b.meta.order ?? 99))) {
      const slug = page.meta.slug || page.meta.title.toLowerCase().replace(/\s+/g, '-');
      lines.push(`- [${page.meta.title}](/${slug}): ${page.meta.description}`);
    }
    lines.push('');
  }

  // Projects section
  if (projects.length > 0) {
    lines.push('## Projects');
    lines.push('');
    for (const project of projects.sort((a, b) => (a.meta.order ?? 99) - (b.meta.order ?? 99))) {
      lines.push(`- **${project.meta.title}**: ${project.meta.description}`);
    }
    lines.push('');
  }

  // Writings section
  if (writings.length > 0) {
    lines.push('## Writings');
    lines.push('');
    // Sort by date descending
    const sortedWritings = writings
      .filter((b) => !b.meta.draft)
      .sort((a, b) => {
        const dateA = a.meta.date ? new Date(a.meta.date).getTime() : 0;
        const dateB = b.meta.date ? new Date(b.meta.date).getTime() : 0;
        return dateB - dateA;
      });
    for (const post of sortedWritings) {
      const dateStr = post.meta.date
        ? new Date(post.meta.date).toISOString().split('T')[0]
        : 'Unknown date';
      lines.push(`- **${post.meta.title}** (${dateStr}): ${post.meta.description}`);
    }
    lines.push('');
  }

  // Contact section
  lines.push('## Contact');
  lines.push('');
  lines.push(`- Email: ${site.email}`);
  lines.push(`- GitHub: github.com/${site.github}`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Generate the llms-full.txt complete content file
 */
function generateLlmsFullTxt(site: SiteConfig, items: ContentItem[]): string {
  const lines: string[] = [];

  // Header
  lines.push(`# ${site.name}`);
  lines.push('');
  lines.push(`> ${site.tagline}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // Sort items: pages first (by order), then projects, then writings (by date)
  const pages = items.filter((i) => i.type === 'page');
  const projectIndex = items.find((i) => i.type === 'project' && i.path.includes('_index'));
  const projects = items.filter((i) => i.type === 'project' && !i.path.includes('_index'));
  const writingsIndex = items.find((i) => i.type === 'writings' && i.path.includes('_index'));
  const writings = items.filter((i) => i.type === 'writings' && !i.path.includes('_index'));

  // Pages
  for (const page of pages.sort((a, b) => (a.meta.order ?? 99) - (b.meta.order ?? 99))) {
    lines.push(`## ${page.meta.title}`);
    lines.push('');
    if (page.content) {
      lines.push(page.content);
      lines.push('');
    }
    lines.push('---');
    lines.push('');
  }

  // Projects
  if (projects.length > 0) {
    lines.push('## Projects');
    lines.push('');
    if (projectIndex?.content) {
      lines.push(projectIndex.content);
      lines.push('');
    }
    for (const project of projects.sort((a, b) => (a.meta.order ?? 99) - (b.meta.order ?? 99))) {
      lines.push(`### ${project.meta.title}`);
      lines.push('');
      lines.push(`*${project.meta.description}*`);
      lines.push('');
      if (project.content) {
        lines.push(project.content);
        lines.push('');
      }
    }
    lines.push('---');
    lines.push('');
  }

  // Writings
  if (writings.length > 0) {
    lines.push('## Writings');
    lines.push('');
    if (writingsIndex?.content) {
      lines.push(writingsIndex.content);
      lines.push('');
    }
    const sortedWritings = writings
      .filter((b) => !b.meta.draft)
      .sort((a, b) => {
        const dateA = a.meta.date ? new Date(a.meta.date).getTime() : 0;
        const dateB = b.meta.date ? new Date(b.meta.date).getTime() : 0;
        return dateB - dateA;
      });
    for (const post of sortedWritings) {
      const dateStr = post.meta.date
        ? new Date(post.meta.date).toISOString().split('T')[0]
        : 'Unknown date';
      lines.push(`### ${post.meta.title}`);
      lines.push('');
      lines.push(`*${dateStr}*`);
      lines.push('');
      if (post.content) {
        lines.push(post.content);
        lines.push('');
      }
    }
    lines.push('---');
    lines.push('');
  }

  // Contact
  lines.push('## Contact');
  lines.push('');
  lines.push(`- Email: ${site.email}`);
  lines.push(`- GitHub: github.com/${site.github}`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Generate sitemap.xml for SEO
 */
function generateSitemap(site: SiteConfig, items: ContentItem[]): string {
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');

  // Homepage
  lines.push('  <url>');
  lines.push(`    <loc>${site.url}/</loc>`);
  lines.push('    <changefreq>weekly</changefreq>');
  lines.push('    <priority>1.0</priority>');
  lines.push('  </url>');

  // Pages
  const pages = items.filter((i) => i.type === 'page');
  for (const page of pages) {
    const slug = page.meta.slug || page.meta.title.toLowerCase().replace(/\s+/g, '-');
    lines.push('  <url>');
    lines.push(`    <loc>${site.url}/${slug}</loc>`);
    lines.push('    <changefreq>monthly</changefreq>');
    lines.push('    <priority>0.8</priority>');
    lines.push('  </url>');
  }

  // Section indexes (projects, writings)
  const hasProjects = items.some((i) => i.type === 'project');
  const hasWritings = items.some((i) => i.type === 'writings');

  if (hasProjects) {
    lines.push('  <url>');
    lines.push(`    <loc>${site.url}/projects</loc>`);
    lines.push('    <changefreq>weekly</changefreq>');
    lines.push('    <priority>0.8</priority>');
    lines.push('  </url>');
  }

  if (hasWritings) {
    lines.push('  <url>');
    lines.push(`    <loc>${site.url}/writings</loc>`);
    lines.push('    <changefreq>weekly</changefreq>');
    lines.push('    <priority>0.8</priority>');
    lines.push('  </url>');
  }

  // Writings (with lastmod from date)
  const writings = items.filter((i) => i.type === 'writings' && !i.path.includes('_index') && !i.meta.draft);
  for (const post of writings) {
    const slug = post.meta.slug || post.meta.title.toLowerCase().replace(/\s+/g, '-');
    lines.push('  <url>');
    lines.push(`    <loc>${site.url}/writings/${slug}</loc>`);
    if (post.meta.date) {
      lines.push(`    <lastmod>${new Date(post.meta.date).toISOString().split('T')[0]}</lastmod>`);
    }
    lines.push('    <changefreq>yearly</changefreq>');
    lines.push('    <priority>0.6</priority>');
    lines.push('  </url>');
  }

  lines.push('</urlset>');
  return lines.join('\n');
}

/**
 * Generate HTML content JSON for injection into index.html
 */
function generateHtmlContent(
  site: SiteConfig,
  items: ContentItem[]
): Record<string, { title: string; html: string; meta: PageMeta }> {
  const result: Record<string, { title: string; html: string; meta: PageMeta }> = {};

  // Site config
  result['site'] = {
    title: site.name,
    html: '',
    meta: {
      title: site.name,
      description: site.tagline,
    },
  };

  // Process each item
  for (const item of items) {
    const slug = item.meta.slug || item.meta.title.toLowerCase().replace(/\s+/g, '-');

    // Determine the key for this content item
    let key: string;
    if (item.path.includes('_index')) {
      // Index files use their type as the key
      key = item.type === 'project' ? 'projects' : item.type === 'writings' ? 'writings' : slug;
    } else {
      key = slug;
    }

    result[key] = {
      title: item.meta.title,
      html: item.html,
      meta: item.meta,
    };
  }

  return result;
}

/**
 * Main build function
 */
async function build(): Promise<void> {
  console.log('Building content...');

  // Ensure output directories exist
  if (!fs.existsSync(PUBLIC_DIR)) {
    fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  }
  if (!fs.existsSync(GENERATED_DIR)) {
    fs.mkdirSync(GENERATED_DIR, { recursive: true });
  }

  // Read site config
  const siteConfigPath = path.join(CONTENT_DIR, 'site.md');
  if (!fs.existsSync(siteConfigPath)) {
    throw new Error('Missing content/site.md configuration file');
  }
  const { meta: siteMeta } = parseMarkdownFile(siteConfigPath);
  const site: SiteConfig = {
    name: siteMeta.title || 'My Website',
    tagline: (siteMeta as unknown as SiteConfig).tagline || '',
    email: (siteMeta as unknown as SiteConfig).email || '',
    github: (siteMeta as unknown as SiteConfig).github || '',
    url: (siteMeta as unknown as SiteConfig).url || 'https://example.com',
  };

  // Handle site.md which uses name instead of title
  const siteFileContent = fs.readFileSync(siteConfigPath, 'utf-8');
  const { data: siteData } = matter(siteFileContent);
  site.name = siteData.name || site.name;
  site.tagline = siteData.tagline || site.tagline;
  site.email = siteData.email || site.email;
  site.github = siteData.github || site.github;
  site.url = siteData.url || 'https://example.com';

  // Find and parse all content files
  const markdownFiles = findMarkdownFiles(CONTENT_DIR).filter(
    (f) => !f.endsWith('site.md')
  );

  const items: ContentItem[] = [];
  for (const filePath of markdownFiles) {
    const { meta, content } = parseMarkdownFile(filePath);
    const html = content ? await marked.parse(content) : '';
    items.push({
      path: filePath,
      meta,
      content,
      html,
      type: getContentType(filePath),
    });
  }

  console.log(`Found ${items.length} content files`);

  // Generate outputs
  const llmsTxt = generateLlmsTxt(site, items);
  const llmsFullTxt = generateLlmsFullTxt(site, items);
  const htmlContent = generateHtmlContent(site, items);
  const sitemap = generateSitemap(site, items);

  // Write outputs
  fs.writeFileSync(path.join(PUBLIC_DIR, 'llms.txt'), llmsTxt);
  console.log('Generated public/llms.txt');

  fs.writeFileSync(path.join(PUBLIC_DIR, 'llms-full.txt'), llmsFullTxt);
  console.log('Generated public/llms-full.txt');

  fs.writeFileSync(path.join(PUBLIC_DIR, 'sitemap.xml'), sitemap);
  console.log('Generated public/sitemap.xml');

  fs.writeFileSync(
    path.join(GENERATED_DIR, 'html-content.json'),
    JSON.stringify(htmlContent, null, 2)
  );
  console.log('Generated generated/html-content.json');

  console.log('Build complete!');
}

// Run build
build().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
