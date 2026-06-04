import { describe, expect, it } from 'vitest';
import {
  dispatchScrollToHeading,
  extractOutlineHeadings,
  SCROLL_TO_HEADING_EVENT,
  type ScrollToHeadingDetail,
} from './outline';

describe('outline extraction', () => {
  it('extracts markdown headings while skipping frontmatter and code fences', () => {
    const headings = extractOutlineHeadings(`---
title: Draft
---

# Project [[Ziba]]

\`\`\`md
## Not a heading
\`\`\`

## Roadmap
### [Graph](graph.md) **polish** ###
`);

    expect(headings).toEqual([
      { index: 0, level: 1, line: 5, text: 'Project Ziba' },
      { index: 1, level: 2, line: 11, text: 'Roadmap' },
      { index: 2, level: 3, line: 12, text: 'Graph polish' },
    ]);
  });

  it('dispatches a typed scroll event for editor integration', () => {
    const events: ScrollToHeadingDetail[] = [];
    const listener: EventListener = (event) => {
      events.push((event as CustomEvent<ScrollToHeadingDetail>).detail);
    };
    window.addEventListener(SCROLL_TO_HEADING_EVENT, listener);

    dispatchScrollToHeading({ path: 'Project.md', index: 2 });

    expect(events).toEqual([{ path: 'Project.md', index: 2 }]);

    window.removeEventListener(SCROLL_TO_HEADING_EVENT, listener);
  });
});
