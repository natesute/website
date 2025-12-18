/**
 * Build script that generates LLM-readable files and HTML content
 * from markdown source files in the content/ directory.
 *
 * Outputs:
 * - public/llms.txt - Index/summary for LLM crawlers
 * - public/llms-full.txt - Complete content for LLMs
 * - index.html - Generated from template with injected content
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
const SRC_DIR = path.join(process.cwd(), 'src');
const ROOT_DIR = process.cwd();

// Types for content structure
interface SiteConfig {
  name: string;
  tagline: string;
  email: string;
  github: string;
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
  type: 'page' | 'project' | 'writing';
  slug: string;
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
function getContentType(filePath: string): 'page' | 'project' | 'writing' {
  const relativePath = path.relative(CONTENT_DIR, filePath);
  if (relativePath.startsWith('projects/')) return 'project';
  if (relativePath.startsWith('writings/')) return 'writing';
  return 'page';
}

/**
 * Generate slug from file path or meta
 */
function generateSlug(filePath: string, meta: PageMeta): string {
  if (meta.slug) return meta.slug;
  const basename = path.basename(filePath, '.md');
  // Remove date prefix if present (e.g., 2024-01-15-title -> title)
  const withoutDate = basename.replace(/^\d{4}-\d{2}-\d{2}-/, '');
  return withoutDate.toLowerCase().replace(/\s+/g, '-');
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
  const writings = items.filter((i) => i.type === 'writing' && !i.path.includes('_index'));

  // Pages section
  if (pages.length > 0) {
    lines.push('## Pages');
    lines.push('');
    for (const page of pages.sort((a, b) => (a.meta.order ?? 99) - (b.meta.order ?? 99))) {
      lines.push(`- [${page.meta.title}](/${page.slug}): ${page.meta.description}`);
    }
    lines.push('');
  }

  // Projects section
  if (projects.length > 0) {
    lines.push('## Projects');
    lines.push('');
    for (const project of projects.sort((a, b) => (a.meta.order ?? 99) - (b.meta.order ?? 99))) {
      lines.push(`- [${project.meta.title}](/projects/${project.slug}): ${project.meta.description}`);
    }
    lines.push('');
  }

  // Writings section
  if (writings.length > 0) {
    lines.push('## Writings');
    lines.push('');
    const sortedWritings = writings
      .filter((w) => !w.meta.draft)
      .sort((a, b) => {
        const dateA = a.meta.date ? new Date(a.meta.date).getTime() : 0;
        const dateB = b.meta.date ? new Date(b.meta.date).getTime() : 0;
        return dateB - dateA;
      });
    for (const post of sortedWritings) {
      const dateStr = post.meta.date || 'Unknown date';
      lines.push(`- [${post.meta.title}](/writings/${post.slug}) (${dateStr}): ${post.meta.description}`);
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
  const writingsIndex = items.find((i) => i.type === 'writing' && i.path.includes('_index'));
  const writings = items.filter((i) => i.type === 'writing' && !i.path.includes('_index'));

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
      .filter((w) => !w.meta.draft)
      .sort((a, b) => {
        const dateA = a.meta.date ? new Date(a.meta.date).getTime() : 0;
        const dateB = b.meta.date ? new Date(b.meta.date).getTime() : 0;
        return dateB - dateA;
      });
    for (const post of sortedWritings) {
      lines.push(`### ${post.meta.title}`);
      lines.push('');
      lines.push(`*${post.meta.date || 'Unknown date'}*`);
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
 * Generate projects list HTML
 */
function generateProjectsListHtml(projects: ContentItem[]): string {
  const sorted = projects
    .filter((p) => !p.path.includes('_index'))
    .sort((a, b) => (a.meta.order ?? 99) - (b.meta.order ?? 99));

  return sorted
    .map(
      (p) => `    <a href="/projects/${p.slug}" class="list-item" data-nav="projects/${p.slug}">
      <div class="item-title">${p.meta.title}</div>
      <div class="item-meta">${p.meta.description}</div>
    </a>`
    )
    .join('\n');
}

/**
 * Generate writings list HTML
 */
function generateWritingsListHtml(writings: ContentItem[], writingsIndex?: ContentItem): string {
  const sorted = writings
    .filter((w) => !w.path.includes('_index') && !w.meta.draft)
    .sort((a, b) => {
      const dateA = a.meta.date ? new Date(a.meta.date).getTime() : 0;
      const dateB = b.meta.date ? new Date(b.meta.date).getTime() : 0;
      return dateB - dateA;
    });

  const intro = writingsIndex?.content
    ? `    <p class="meta" style="margin-bottom: 2rem;">${writingsIndex.content}</p>\n`
    : '';

  const items = sorted
    .map((w) => {
      const dateStr = formatDate(w.meta.date);
      return `    <a href="/writings/${w.slug}" class="list-item" data-nav="writings/${w.slug}">
      <div class="item-title">${w.meta.title}</div>
      <div class="item-meta">${dateStr}</div>
    </a>`;
    })
    .join('\n');

  return intro + items;
}

/**
 * Generate individual project page HTML
 */
function generateProjectPageHtml(project: ContentItem): string {
  return `
  <!-- Project: ${project.meta.title} -->
  <article id="page-projects-${project.slug}" class="page-content" data-parent="projects">
    <header>
      <h1>${project.meta.title}</h1>
      <a href="/projects" class="back-link" data-nav="projects">← back to projects</a>
    </header>
    <p class="meta">${project.meta.description}</p>
    <div class="article-content">
      ${project.html}
    </div>
  </article>`;
}

/**
 * Generate individual writing page HTML
 */
function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function generateWritingPageHtml(writing: ContentItem): string {
  const dateStr = formatDate(writing.meta.date);
  return `
  <!-- Writing: ${writing.meta.title} -->
  <article id="page-writings-${writing.slug}" class="page-content" data-parent="writings">
    <header>
      <h1>${writing.meta.title}</h1>
      <a href="/writings" class="back-link" data-nav="writings">← back to writings</a>
    </header>
    <p class="meta">${dateStr}</p>
    <div class="article-content">
      ${writing.html}
    </div>
  </article>`;
}

/**
 * Generate about page content HTML
 */
function generateAboutHtml(items: ContentItem[]): string {
  const about = items.find((i) => i.type === 'page' && i.slug === 'about');
  if (!about) return '<p>About content coming soon.</p>';
  return about.html;
}

/**
 * Generate contact page content HTML
 */
function generateContactHtml(site: SiteConfig): string {
  return `    <div class="contact-item">
      <a href="mailto:${site.email}">${site.email}</a>
    </div>
    <div class="contact-item">
      <a href="https://github.com/${site.github}" target="_blank" rel="noopener">github.com/${site.github}</a>
    </div>`;
}

/**
 * Generate index.html from template
 */
function generateIndexHtml(
  template: string,
  site: SiteConfig,
  items: ContentItem[]
): string {
  const projects = items.filter((i) => i.type === 'project');
  const writings = items.filter((i) => i.type === 'writing');
  const writingsIndex = writings.find((w) => w.path.includes('_index'));

  // Generate all content sections
  const projectsList = generateProjectsListHtml(projects);
  const writingsList = generateWritingsListHtml(writings, writingsIndex);
  const aboutContent = generateAboutHtml(items);
  const contactContent = generateContactHtml(site);

  // Generate individual pages
  const projectPages = projects
    .filter((p) => !p.path.includes('_index'))
    .map(generateProjectPageHtml)
    .join('\n');

  const writingPages = writings
    .filter((w) => !w.path.includes('_index') && !w.meta.draft)
    .map(generateWritingPageHtml)
    .join('\n');

  // Replace placeholders in template
  let html = template;
  html = html.replace('<!-- ABOUT_CONTENT -->', aboutContent);
  html = html.replace('<!-- PROJECTS_LIST -->', projectsList);
  html = html.replace('<!-- PROJECT_PAGES -->', projectPages);
  html = html.replace('<!-- WRITINGS_LIST -->', writingsList);
  html = html.replace('<!-- WRITING_PAGES -->', writingPages);
  html = html.replace('<!-- CONTACT_CONTENT -->', contactContent);

  return html;
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

  // Read site config
  const siteConfigPath = path.join(CONTENT_DIR, 'site.md');
  if (!fs.existsSync(siteConfigPath)) {
    throw new Error('Missing content/site.md configuration file');
  }

  const siteFileContent = fs.readFileSync(siteConfigPath, 'utf-8');
  const { data: siteData } = matter(siteFileContent);
  const site: SiteConfig = {
    name: siteData.name || 'My Website',
    tagline: siteData.tagline || '',
    email: siteData.email || '',
    github: siteData.github || '',
  };

  // Find and parse all content files
  const markdownFiles = findMarkdownFiles(CONTENT_DIR).filter(
    (f) => !f.endsWith('site.md')
  );

  const items: ContentItem[] = [];
  for (const filePath of markdownFiles) {
    const { meta, content } = parseMarkdownFile(filePath);
    const html = content ? await marked.parse(content) : '';
    const slug = generateSlug(filePath, meta);
    items.push({
      path: filePath,
      meta,
      content,
      html,
      type: getContentType(filePath),
      slug,
    });
  }

  console.log(`Found ${items.length} content files`);

  // Generate LLM files
  const llmsTxt = generateLlmsTxt(site, items);
  const llmsFullTxt = generateLlmsFullTxt(site, items);

  fs.writeFileSync(path.join(PUBLIC_DIR, 'llms.txt'), llmsTxt);
  console.log('Generated public/llms.txt');

  fs.writeFileSync(path.join(PUBLIC_DIR, 'llms-full.txt'), llmsFullTxt);
  console.log('Generated public/llms-full.txt');

  // Generate index.html from template
  const templatePath = path.join(SRC_DIR, 'index.template.html');
  if (fs.existsSync(templatePath)) {
    const template = fs.readFileSync(templatePath, 'utf-8');
    const indexHtml = generateIndexHtml(template, site, items);
    fs.writeFileSync(path.join(ROOT_DIR, 'index.html'), indexHtml);
    console.log('Generated index.html from template');
  } else {
    console.log('No template found, skipping index.html generation');
  }

  console.log('Build complete!');
}

// Run build
build().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
