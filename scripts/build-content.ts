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
  date?: string | Date;
  draft?: boolean;
  // Project-only fields
  status?: 'ongoing' | 'shipped' | 'experiment' | 'dormant';
  repo?: string;
  demo?: string;
}

interface ContentItem {
  path: string;
  meta: PageMeta;
  content: string;
  html: string;
  type: 'page' | 'project' | 'writing';
  slug: string;
}

interface JournalEntry {
  title: string;
  date?: string | Date;
  content: string;
  html: string;
}

interface ProjectItem extends ContentItem {
  entries: JournalEntry[];
  lastUpdated?: Date;
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
 * Collect projects that live as folders: content/projects/<slug>/index.md
 * plus optional dated journal entries in content/projects/<slug>/log/*.md.
 */
async function collectFolderProjects(): Promise<ProjectItem[]> {
  const projectsDir = path.join(CONTENT_DIR, 'projects');
  if (!fs.existsSync(projectsDir)) return [];

  const projects: ProjectItem[] = [];
  const dirs = fs
    .readdirSync(projectsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'));

  for (const dir of dirs) {
    const indexPath = path.join(projectsDir, dir.name, 'index.md');
    if (!fs.existsSync(indexPath)) continue;

    const { meta, content } = parseMarkdownFile(indexPath);
    const html = content ? await marked.parse(content) : '';

    const entries: JournalEntry[] = [];
    const logDir = path.join(projectsDir, dir.name, 'log');
    if (fs.existsSync(logDir)) {
      const logFiles = fs
        .readdirSync(logDir)
        .filter((f) => f.endsWith('.md'))
        .map((f) => path.join(logDir, f));
      for (const logFile of logFiles) {
        const entry = parseMarkdownFile(logFile);
        // Date comes from frontmatter, else from a YYYY-MM-DD- filename prefix
        const dateMatch = path.basename(logFile).match(/^(\d{4}-\d{2}-\d{2})-/);
        entries.push({
          title: entry.meta.title || path.basename(logFile, '.md'),
          date: entry.meta.date ?? dateMatch?.[1],
          content: entry.content,
          html: entry.content ? await marked.parse(entry.content) : '',
        });
      }
      entries.sort(
        (a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime()
      );
    }

    const project: ProjectItem = {
      path: indexPath,
      meta,
      content,
      html,
      type: 'project',
      slug: meta.slug || dir.name,
      entries,
      lastUpdated: computeLastUpdated(meta, entries),
    };
    projects.push(project);
  }

  return projects;
}

/**
 * A project's freshness: the newest journal entry, else its own date.
 */
function computeLastUpdated(meta: PageMeta, entries: JournalEntry[]): Date | undefined {
  const dates = entries
    .map((e) => (e.date ? new Date(e.date).getTime() : 0))
    .filter((t) => t > 0);
  if (meta.date) dates.push(new Date(meta.date).getTime());
  if (dates.length === 0) return undefined;
  return new Date(Math.max(...dates));
}

/**
 * Sort projects for display: freshest journal first, undated ones by order.
 */
function sortProjects(projects: ProjectItem[]): ProjectItem[] {
  return [...projects].sort((a, b) => {
    const tA = a.lastUpdated?.getTime() ?? 0;
    const tB = b.lastUpdated?.getTime() ?? 0;
    if (tA !== tB) return tB - tA;
    return (a.meta.order ?? 99) - (b.meta.order ?? 99);
  });
}

/**
 * Defer loading of media in hidden pages: every page ships in the DOM at once,
 * and display:none does not stop the browser fetching img/iframe src. The
 * client swaps data-src back to src when a page is activated (src/main.ts).
 */
function lazifyMedia(html: string): string {
  return html.replace(/<(img|iframe)\b([^>]*?)\ssrc="/g, '<$1$2 data-src="');
}

/**
 * Format a frontmatter date as an ISO date string (YYYY-MM-DD).
 * gray-matter parses unquoted YAML dates as Date objects at UTC midnight,
 * so read UTC components — interpolating the Date directly would embed the
 * build machine's timezone.
 */
function toIsoDate(date: string | Date | undefined): string {
  if (!date) return '';
  if (typeof date === 'string') return date;
  return date.toISOString().slice(0, 10);
}

/**
 * Generate the llms.txt index file
 */
function generateLlmsTxt(
  site: SiteConfig,
  items: ContentItem[],
  projects: ProjectItem[]
): string {
  const lines: string[] = [];

  // Header
  lines.push(`# ${site.name}`);
  lines.push('');
  lines.push(`> ${site.tagline}`);
  lines.push('');

  // Group by type
  const pages = items.filter((i) => i.type === 'page');
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
    for (const project of sortProjects(projects)) {
      const status = project.meta.status ? ` [${project.meta.status}]` : '';
      lines.push(`- [${project.meta.title}](/projects/${project.slug})${status}: ${project.meta.description}`);
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
      const dateStr = toIsoDate(post.meta.date) || 'Unknown date';
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
function generateLlmsFullTxt(
  site: SiteConfig,
  items: ContentItem[],
  projects: ProjectItem[]
): string {
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
    for (const project of sortProjects(projects)) {
      lines.push(`### ${project.meta.title}`);
      lines.push('');
      const status = project.meta.status ? ` — ${project.meta.status}` : '';
      lines.push(`*${project.meta.description}*${status}`);
      lines.push('');
      if (project.content) {
        lines.push(project.content);
        lines.push('');
      }
      for (const entry of project.entries) {
        lines.push(`#### ${entry.title} (${toIsoDate(entry.date) || 'undated'})`);
        lines.push('');
        if (entry.content) {
          lines.push(entry.content);
          lines.push('');
        }
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
      lines.push(`*${toIsoDate(post.meta.date) || 'Unknown date'}*`);
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
function statusBadgeHtml(status: PageMeta['status']): string {
  if (!status) return '';
  return `<span class="status-badge status-${status}">${status}</span>`;
}

function generateProjectsListHtml(projects: ProjectItem[], projectsIndex?: ContentItem): string {
  const sorted = sortProjects(projects.filter((p) => !p.path.includes('_index')));

  const intro = projectsIndex?.html
    ? `    <div class="page-intro">${projectsIndex.html}</div>\n`
    : '';

  const items = sorted
    .map((p) => {
      const updated = p.lastUpdated
        ? `\n      <div class="item-meta item-updated">last entry ${formatDate(p.lastUpdated)}</div>`
        : '';
      return `    <a href="/projects/${p.slug}" class="list-item" data-nav="projects/${p.slug}">
      <div class="item-title">${p.meta.title}${statusBadgeHtml(p.meta.status)}</div>
      <div class="item-meta">${p.meta.description}</div>${updated}
    </a>`;
    })
    .join('\n');

  return intro + items;
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

  const intro = writingsIndex?.html
    ? `    <div class="page-intro">${writingsIndex.html}</div>\n`
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
function generateProjectPageHtml(project: ProjectItem): string {
  const facts: string[] = [];
  if (project.meta.status) facts.push(statusBadgeHtml(project.meta.status));
  if (project.lastUpdated) facts.push(`<span>last entry ${formatDate(project.lastUpdated)}</span>`);
  if (project.meta.repo) {
    facts.push(
      `<a href="${project.meta.repo}" target="_blank" rel="noopener">source</a>`
    );
  }
  const factsHtml = facts.length
    ? `\n    <p class="project-facts">${facts.join('\n      ')}</p>`
    : '';

  const demoHtml = project.meta.demo
    ? `
    <div class="demo-embed">
      <iframe src="${project.meta.demo}" title="${project.meta.title} — live demo" allow="fullscreen; autoplay; midi"></iframe>
    </div>
    <p class="demo-note"><a href="${project.meta.demo}" target="_blank" rel="noopener">open the demo in its own tab →</a></p>`
    : '';

  const journalHtml = project.entries.length
    ? `
    <section class="journal">
      <h2>journal</h2>
${project.entries
  .map(
    (e) => `      <article class="journal-entry">
        <h3>${e.title}</h3>
        <p class="meta">${formatDate(e.date)}</p>
        <div class="article-content">
          ${e.html}
        </div>
      </article>`
  )
  .join('\n')}
    </section>`
    : '';

  return lazifyMedia(`
  <!-- Project: ${project.meta.title} -->
  <article id="page-projects-${project.slug}" class="page-content" data-parent="projects">
    <header>
      <h1>${project.meta.title}</h1>
      <a href="/projects" class="back-link" data-nav="projects">← back to projects</a>
    </header>
    <p class="meta">${project.meta.description}</p>${factsHtml}${demoHtml}
    <div class="article-content">
      ${project.html}
    </div>${journalHtml}
  </article>`);
}

/**
 * Generate individual writing page HTML
 */
function formatDate(dateStr: string | Date | undefined): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  // timeZone: 'UTC' keeps the rendered day independent of the build machine —
  // frontmatter dates are UTC midnight, so local formatting can shift the day.
  return date.toLocaleDateString('en-AU', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
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
  // Match by source file, not slug — the slug is author-set and has drifted before
  const about = items.find(
    (i) => i.type === 'page' && path.basename(i.path) === 'about.md'
  );
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
  items: ContentItem[],
  projects: ProjectItem[]
): string {
  const writings = items.filter((i) => i.type === 'writing');
  const writingsIndex = writings.find((w) => w.path.includes('_index'));
  const projectsIndex = items.find(
    (i) => i.type === 'project' && i.path.includes('_index')
  );

  // Generate all content sections
  const projectsList = generateProjectsListHtml(projects, projectsIndex);
  const writingsList = generateWritingsListHtml(writings, writingsIndex);
  const aboutContent = generateAboutHtml(items);
  const contactContent = generateContactHtml(site);

  // Generate individual pages
  const projectPages = sortProjects(projects)
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

  // Find and parse all content files. Project folders (projects/<slug>/...)
  // are handled separately by collectFolderProjects — skip them here.
  const markdownFiles = findMarkdownFiles(CONTENT_DIR).filter((f) => {
    if (f.endsWith('site.md')) return false;
    const rel = path.relative(CONTENT_DIR, f);
    const segments = rel.split(path.sep);
    return !(segments[0] === 'projects' && segments.length > 2);
  });

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

  // Projects: flat projects/<slug>.md files plus projects/<slug>/ folders
  const projects: ProjectItem[] = items
    .filter((i) => i.type === 'project' && !i.path.includes('_index'))
    .map((i) => ({
      ...i,
      entries: [],
      lastUpdated: computeLastUpdated(i.meta, []),
    }));
  projects.push(...(await collectFolderProjects()));

  console.log(`Found ${items.length} content files, ${projects.length} projects`);

  // Generate LLM files
  const llmsTxt = generateLlmsTxt(site, items, projects);
  const llmsFullTxt = generateLlmsFullTxt(site, items, projects);

  fs.writeFileSync(path.join(PUBLIC_DIR, 'llms.txt'), llmsTxt);
  console.log('Generated public/llms.txt');

  fs.writeFileSync(path.join(PUBLIC_DIR, 'llms-full.txt'), llmsFullTxt);
  console.log('Generated public/llms-full.txt');

  // Generate index.html from template
  const templatePath = path.join(SRC_DIR, 'index.template.html');
  if (fs.existsSync(templatePath)) {
    const template = fs.readFileSync(templatePath, 'utf-8');
    const indexHtml = generateIndexHtml(template, site, items, projects);
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
