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
  type: 'page' | 'project' | 'blog';
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
function getContentType(filePath: string): 'page' | 'project' | 'blog' {
  const relativePath = path.relative(CONTENT_DIR, filePath);
  if (relativePath.startsWith('projects/')) return 'project';
  if (relativePath.startsWith('blog/')) return 'blog';
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
  const blogs = items.filter((i) => i.type === 'blog' && !i.path.includes('_index'));

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

  // Blog section
  if (blogs.length > 0) {
    lines.push('## Blog Posts');
    lines.push('');
    // Sort by date descending
    const sortedBlogs = blogs
      .filter((b) => !b.meta.draft)
      .sort((a, b) => {
        const dateA = a.meta.date ? new Date(a.meta.date).getTime() : 0;
        const dateB = b.meta.date ? new Date(b.meta.date).getTime() : 0;
        return dateB - dateA;
      });
    for (const post of sortedBlogs) {
      const dateStr = post.meta.date || 'Unknown date';
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

  // Sort items: pages first (by order), then projects, then blog posts (by date)
  const pages = items.filter((i) => i.type === 'page');
  const projectIndex = items.find((i) => i.type === 'project' && i.path.includes('_index'));
  const projects = items.filter((i) => i.type === 'project' && !i.path.includes('_index'));
  const blogIndex = items.find((i) => i.type === 'blog' && i.path.includes('_index'));
  const blogs = items.filter((i) => i.type === 'blog' && !i.path.includes('_index'));

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

  // Blog posts
  if (blogs.length > 0) {
    lines.push('## Blog');
    lines.push('');
    if (blogIndex?.content) {
      lines.push(blogIndex.content);
      lines.push('');
    }
    const sortedBlogs = blogs
      .filter((b) => !b.meta.draft)
      .sort((a, b) => {
        const dateA = a.meta.date ? new Date(a.meta.date).getTime() : 0;
        const dateB = b.meta.date ? new Date(b.meta.date).getTime() : 0;
        return dateB - dateA;
      });
    for (const post of sortedBlogs) {
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
    const key = item.path.includes('_index')
      ? item.type === 'project'
        ? 'projects'
        : 'blog'
      : slug;

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
  };

  // Handle site.md which uses name instead of title
  const siteFileContent = fs.readFileSync(siteConfigPath, 'utf-8');
  const { data: siteData } = matter(siteFileContent);
  site.name = siteData.name || site.name;
  site.tagline = siteData.tagline || site.tagline;
  site.email = siteData.email || site.email;
  site.github = siteData.github || site.github;

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

  // Write outputs
  fs.writeFileSync(path.join(PUBLIC_DIR, 'llms.txt'), llmsTxt);
  console.log('Generated public/llms.txt');

  fs.writeFileSync(path.join(PUBLIC_DIR, 'llms-full.txt'), llmsFullTxt);
  console.log('Generated public/llms-full.txt');

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
