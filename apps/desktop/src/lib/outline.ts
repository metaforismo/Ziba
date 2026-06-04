export const SCROLL_TO_HEADING_EVENT = 'ziba:scroll-to-heading';

export type OutlineHeading = {
  index: number;
  level: number;
  line: number;
  text: string;
};

export type ScrollToHeadingDetail = {
  path: string;
  index: number;
};

function stripInlineMarkdown(text: string): string {
  return text
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[`*_~]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isFenceStart(line: string): boolean {
  return /^(```|~~~)/.test(line.trim());
}

export function extractOutlineHeadings(markdown: string): OutlineHeading[] {
  const headings: OutlineHeading[] = [];
  const lines = markdown.split(/\r?\n/);
  let inFence = false;
  let inFrontmatter = lines[0]?.trim() === '---';

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    const trimmed = line.trim();

    if (i > 0 && inFrontmatter && trimmed === '---') {
      inFrontmatter = false;
      continue;
    }
    if (inFrontmatter) continue;

    if (isFenceStart(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const match = /^(#{1,6})[ \t]+(.+?)\s*$/.exec(line);
    if (match === null) continue;

    const rawText = match[2]?.replace(/[ \t]+#+[ \t]*$/, '') ?? '';
    const text = stripInlineMarkdown(rawText);
    if (text.length === 0) continue;

    headings.push({
      index: headings.length,
      level: match[1]?.length ?? 1,
      line: i + 1,
      text,
    });
  }

  return headings;
}

export function dispatchScrollToHeading(detail: ScrollToHeadingDetail): void {
  window.dispatchEvent(new CustomEvent<ScrollToHeadingDetail>(SCROLL_TO_HEADING_EVENT, { detail }));
}
