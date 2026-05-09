import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { JSX, MouseEvent, ReactNode } from 'react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import type { Note, NotePath } from '@synapsium/core';
import { ipc } from '../../../lib/ipc';
import { extractIpcErrorCode, ipcErrorMessage } from '../../../lib/ipc-error';
import { navigateToNote } from '../../../lib/navigate';

/**
 * React node view for the `embed` Tiptap node.
 *
 * Lifecycle:
 *   1) On mount (and whenever `target` changes) we call
 *      `ipc.resolveTitle({ title })`. Three outcomes:
 *        - `null` -> the target doesn't exist -> show "non trovata" UI
 *          with a "Crea nota" button.
 *        - a `NotePath` -> call `ipc.loadNote({ path })`.
 *        - a thrown error -> show the error UI with retry.
 *   2) Once `loadNote` resolves we render `note.content` through a
 *      tiny in-house markdown preview renderer (see `renderPreview`).
 *      We intentionally don't spin up a nested Tiptap editor: the
 *      embed body is read-only, the preview just needs to be "good
 *      enough" for paragraphs/headings/lists/code/inline emphasis.
 *      Full Tiptap would balloon memory if the user opens a note that
 *      itself embeds a dozen other notes.
 *
 * Why a hand-rolled renderer:
 *   - The desktop app's package.json doesn't depend on `marked` or
 *     `unified`/`remark`. Pulling either in just for read-only embed
 *     previews is heavy (`marked` is ~30KB, `remark*` is far more).
 *   - `markdown-it` is a transitive of `tiptap-markdown` and not
 *     reachable through pnpm's strict module resolution from the app
 *     code. Verified via dynamic import probe.
 *   - Instead, we ship a ~150-line subset that handles the markdown
 *     constructs synapsium-authored notes commonly use: ATX headings,
 *     paragraphs, bullet/ordered lists, fenced code blocks, inline
 *     code, bold, italic, links. Anything fancier (tables, callouts,
 *     wikilinks-as-pills) renders as plain text - acceptable for a
 *     preview.
 *   - The renderer returns a React tree (not a string) so we never
 *     have to use innerHTML escapes; React handles the escaping for
 *     us.
 *
 * Click semantics:
 *   - Click on the body or on the "Apri" button -> navigate to the
 *     embedded note via `navigateToNote(path)`.
 *   - Buttons inside the body call stopPropagation() so they don't
 *     navigate twice.
 */
export function EmbedNodeView(props: NodeViewProps): JSX.Element {
  const target = String(props.node.attrs.target ?? '').trim();

  type LoadState =
    | { kind: 'idle' }
    | { kind: 'loading' }
    | { kind: 'not-found' }
    | { kind: 'error'; message: string }
    | { kind: 'creating' }
    | { kind: 'loaded'; path: NotePath; note: Note };

  const [state, setState] = useState<LoadState>({ kind: 'idle' });

  // Bumping `loadKey` forces the effect below to refetch. Used by the
  // retry button without having to invalidate any other React state.
  const [loadKey, setLoadKey] = useState(0);

  // Track the latest in-flight target so a stale resolution from a
  // previous render can't overwrite a fresh one. This matters when a
  // user edits the target attribute (rare for now - there's no UI -
  // but the node view should still be correct under attribute updates
  // so future inline editing works without races).
  const latestTargetRef = useRef(target);
  useEffect(() => {
    latestTargetRef.current = target;
  });

  useEffect(() => {
    if (target.length === 0) {
      setState({ kind: 'not-found' });
      return;
    }

    let cancelled = false;
    setState({ kind: 'loading' });

    (async (): Promise<void> => {
      try {
        const path = await ipc.resolveTitle({ title: target });
        if (cancelled || latestTargetRef.current !== target) return;
        if (path === null) {
          setState({ kind: 'not-found' });
          return;
        }
        const note = await ipc.loadNote({ path });
        if (cancelled || latestTargetRef.current !== target) return;
        setState({ kind: 'loaded', path, note });
      } catch (err: unknown) {
        if (cancelled || latestTargetRef.current !== target) return;
        setState({ kind: 'error', message: ipcErrorMessage(err) });
      }
    })();

    return (): void => {
      cancelled = true;
    };
  }, [target, loadKey]);

  const handleNavigate = useCallback((): void => {
    if (state.kind === 'loaded') {
      // navigateToNote returns a Promise we deliberately don't await
      // here; the click handler is fire-and-forget and any failure is
      // surfaced through the editor store's `lastSaveError`.
      void navigateToNote(state.path);
    }
  }, [state]);

  const handleRetry = useCallback((): void => {
    setLoadKey((k) => k + 1);
  }, []);

  const handleCreate = useCallback((): void => {
    if (target.length === 0) return;
    setState({ kind: 'creating' });
    (async (): Promise<void> => {
      try {
        // Use `${target}.md` as the path. v0.4 doesn't infer folders
        // from the title — the new note lands at the vault root. Users
        // who want a folder can move it via the file tree.
        const newNote = await ipc.createNote({ path: `${target}.md` });
        if (latestTargetRef.current !== target) return;
        setState({ kind: 'loaded', path: newNote.path, note: newNote });
      } catch (err: unknown) {
        if (latestTargetRef.current !== target) return;
        // Race-window recovery: between our `resolveTitle` returning
        // null and our `createNote` call, an external watcher event
        // (or a parallel "Crea nota" gesture) may have created the
        // note. Re-resolve and load it instead of surfacing the error.
        if (extractIpcErrorCode(err) === 'ALREADY_EXISTS') {
          try {
            const path = await ipc.resolveTitle({ title: target });
            if (latestTargetRef.current !== target) return;
            if (path !== null) {
              const note = await ipc.loadNote({ path });
              if (latestTargetRef.current !== target) return;
              setState({ kind: 'loaded', path, note });
              return;
            }
          } catch {
            // Fall through to the generic error path.
          }
        }
        setState({ kind: 'error', message: ipcErrorMessage(err) });
      }
    })();
  }, [target]);

  const handleHeaderButton = useCallback(
    (e: MouseEvent<HTMLButtonElement>): void => {
      // Stop the wrapper's onClick from firing twice for the same
      // gesture (button clicks bubble up to the wrapper).
      e.stopPropagation();
      handleNavigate();
    },
    [handleNavigate],
  );

  const previewTree = useMemo<ReactNode>(() => {
    if (state.kind !== 'loaded') return null;
    return renderPreview(state.note.content);
  }, [state]);

  const headerLabel = target.length > 0 ? target : '(senza titolo)';

  return (
    <NodeViewWrapper
      className="synapsium-embed"
      data-embed=""
      data-target={target}
      contentEditable={false}
      onClick={handleNavigate}
    >
      <div className="synapsium-embed-header">
        <span className="synapsium-embed-header-title">{`-> ${headerLabel}`}</span>
        {state.kind === 'loaded' ? (
          <button type="button" className="synapsium-embed-open" onClick={handleHeaderButton}>
            Apri
          </button>
        ) : null}
      </div>
      <div className="synapsium-embed-body">
        {state.kind === 'loading' || state.kind === 'idle' ? (
          <div className="synapsium-embed-status">Caricamento&hellip;</div>
        ) : null}
        {state.kind === 'creating' ? (
          <div className="synapsium-embed-status">Creazione&hellip;</div>
        ) : null}
        {state.kind === 'error' ? (
          <div className="synapsium-embed-status synapsium-embed-status--error">
            <span>{`Impossibile caricare ${headerLabel}.`}</span>
            <button
              type="button"
              className="synapsium-embed-retry"
              onClick={(e): void => {
                e.stopPropagation();
                handleRetry();
              }}
            >
              Riprova
            </button>
          </div>
        ) : null}
        {state.kind === 'not-found' ? (
          <div className="synapsium-embed-status synapsium-embed-status--missing">
            <span>{`Nota '${headerLabel}' non trovata. Crea?`}</span>
            <button
              type="button"
              className="synapsium-embed-create"
              onClick={(e): void => {
                e.stopPropagation();
                handleCreate();
              }}
            >
              Crea nota
            </button>
          </div>
        ) : null}
        {state.kind === 'loaded' ? (
          <div className="synapsium-embed-preview">{previewTree}</div>
        ) : null}
      </div>
    </NodeViewWrapper>
  );
}

/**
 * Tiny markdown -> React renderer scoped to the constructs commonly
 * used inside synapsium notes. Output is intentionally minimal - the
 * embed preview is a "what's in this note" affordance, not a faithful
 * re-render. Anything we can't recognize falls through as plain
 * paragraph text so the user still sees the words.
 *
 * Returns a React fragment because some callers may need to nest the
 * result in their own wrapper without an extra DOM node. React handles
 * all string escaping (text children are escaped by default), so we
 * don't have to manage HTML entities ourselves.
 *
 * Supported:
 *   - ATX headings (# .. ######)
 *   - Fenced code blocks (``` ... ```)
 *   - Bullet lists (-, *, +) and ordered lists (1., 2., ...)
 *   - Blockquotes (>)
 *   - Paragraphs
 *   - Inline: **bold**, *italic*, `code`, [text](url)
 *   - Wikilinks `[[Target]]` and embeds `![[Target]]` rendered as
 *     styled pills (clicks bubble up to the wrapper handler).
 *   - Leading frontmatter (`---` block at the very top) is stripped
 *     before rendering, even though `Note.content` already strips
 *     it — defensive against ad-hoc callers.
 *
 * Unsupported (rendered as plain text in their paragraph):
 *   - Tables, footnotes, html, setext headings, definition lists,
 *     task lists, callouts.
 */
export function renderPreview(markdown: string): ReactNode {
  const lines = stripLeadingFrontmatter(markdown).split(/\r?\n/);
  const blocks: ReactNode[] = [];

  let i = 0;
  let key = 0;
  const nextKey = (): string => `b${key++}`;

  while (i < lines.length) {
    const line = lines[i] ?? '';

    // Fenced code block (``` or ~~~). Capture body verbatim until the
    // closing fence.
    const fenceMatch = line.match(/^(\s*)(```+|~~~+)(.*)$/);
    if (fenceMatch !== null) {
      const fence = fenceMatch[2] ?? '```';
      const body: string[] = [];
      i += 1;
      while (i < lines.length) {
        const ln = lines[i] ?? '';
        if (ln.trimStart().startsWith(fence)) {
          i += 1;
          break;
        }
        body.push(ln);
        i += 1;
      }
      blocks.push(
        <pre key={nextKey()}>
          <code>{body.join('\n')}</code>
        </pre>,
      );
      continue;
    }

    // ATX heading.
    const headingMatch = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (headingMatch !== null) {
      const level = (headingMatch[1] ?? '#').length;
      const text = headingMatch[2] ?? '';
      const Tag = `h${level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
      blocks.push(<Tag key={nextKey()}>{renderInline(text)}</Tag>);
      i += 1;
      continue;
    }

    // Bullet list.
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: ReactNode[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i] ?? '')) {
        const m = (lines[i] ?? '').match(/^\s*[-*+]\s+(.*)$/);
        const text = m?.[1] ?? '';
        items.push(<li key={`li${i}`}>{renderInline(text)}</li>);
        i += 1;
      }
      blocks.push(<ul key={nextKey()}>{items}</ul>);
      continue;
    }

    // Ordered list.
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: ReactNode[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i] ?? '')) {
        const m = (lines[i] ?? '').match(/^\s*\d+\.\s+(.*)$/);
        const text = m?.[1] ?? '';
        items.push(<li key={`li${i}`}>{renderInline(text)}</li>);
        i += 1;
      }
      blocks.push(<ol key={nextKey()}>{items}</ol>);
      continue;
    }

    // Blockquote.
    if (/^\s*>/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i] ?? '')) {
        const m = (lines[i] ?? '').match(/^\s*>\s?(.*)$/);
        body.push(m?.[1] ?? '');
        i += 1;
      }
      blocks.push(<blockquote key={nextKey()}>{renderInline(body.join(' '))}</blockquote>);
      continue;
    }

    // Horizontal rule.
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push(<hr key={nextKey()} />);
      i += 1;
      continue;
    }

    // Blank line - skip.
    if (/^\s*$/.test(line)) {
      i += 1;
      continue;
    }

    // Paragraph. Consume until blank line or block-starter.
    const paraLines: string[] = [];
    while (i < lines.length) {
      const ln = lines[i] ?? '';
      if (
        /^\s*$/.test(ln) ||
        /^(\s*)(```+|~~~+)/.test(ln) ||
        /^#{1,6}\s+/.test(ln) ||
        /^\s*[-*+]\s+/.test(ln) ||
        /^\s*\d+\.\s+/.test(ln) ||
        /^\s*>/.test(ln) ||
        /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(ln)
      ) {
        break;
      }
      paraLines.push(ln);
      i += 1;
    }
    if (paraLines.length > 0) {
      blocks.push(<p key={nextKey()}>{renderInline(paraLines.join(' '))}</p>);
    }
  }

  return <Fragment>{blocks}</Fragment>;
}

/**
 * Strip a YAML frontmatter block at the very start of the document.
 *
 * `Note.content` is already body-only because `loadNote` runs the
 * markdown through gray-matter, but `renderPreview` is also exported
 * and may be fed a raw markdown string from tests or future callers
 * (e.g. a clipboard paste preview). Doing the strip here makes the
 * function safe regardless of input source.
 *
 * Recognises only the canonical Obsidian/Hugo form: a `---` line as
 * the first non-empty line, followed by YAML, terminated by `---` or
 * `...` on its own line. Anything else passes through untouched.
 */
function stripLeadingFrontmatter(markdown: string): string {
  if (!markdown.startsWith('---')) return markdown;
  const lines = markdown.split(/\r?\n/);
  if (lines[0] !== '---') return markdown;
  for (let i = 1; i < lines.length; i++) {
    const ln = lines[i];
    if (ln === '---' || ln === '...') {
      return lines.slice(i + 1).join('\n');
    }
  }
  // Unterminated frontmatter — render as-is rather than blanking the
  // whole document. Better to show garbled markdown than nothing.
  return markdown;
}

/**
 * Inline-level rendering. Returns a flat array of React nodes for the
 * given input string. The order of recognition matters: code spans are
 * pulled out first so emphasis substitution doesn't eat backticked
 * asterisks; wikilinks before standard links so `[[..]]` isn't mistaken
 * for a `[text](url)` shape.
 *
 * The implementation is iterative: it walks the input once, peeling
 * off recognized tokens at the cursor and emitting React nodes for
 * each. This is verbose but avoids the regex-replace-into-string
 * approach that would force us back into HTML escaping.
 */
function renderInline(input: string): ReactNode {
  const out: ReactNode[] = [];
  let buf = '';
  let i = 0;
  let key = 0;
  const nextKey = (): string => `i${key++}`;
  const flush = (): void => {
    if (buf.length > 0) {
      out.push(buf);
      buf = '';
    }
  };

  while (i < input.length) {
    const c = input[i] ?? '';
    const c2 = input[i + 1] ?? '';

    // Embed `![[Target]]` (must precede the bare wikilink branch so
    // the leading `!` isn't accumulated as plain text).
    if (c === '!' && c2 === '[' && input[i + 2] === '[') {
      const closeIdx = input.indexOf(']]', i + 3);
      if (closeIdx !== -1) {
        const inner = input.slice(i + 3, closeIdx);
        if (!inner.includes('\n') && inner.length > 0) {
          flush();
          const pipe = inner.indexOf('|');
          const display = (pipe === -1 ? inner : inner.slice(pipe + 1)).trim();
          out.push(
            <span key={nextKey()} className="synapsium-embed-nested">
              {`-> ${display}`}
            </span>,
          );
          i = closeIdx + 2;
          continue;
        }
      }
    }

    // Wikilink `[[Target]]` or `[[Target|Alias]]`.
    if (c === '[' && c2 === '[') {
      const closeIdx = input.indexOf(']]', i + 2);
      if (closeIdx !== -1) {
        const inner = input.slice(i + 2, closeIdx);
        if (!inner.includes('\n') && inner.length > 0) {
          flush();
          const pipe = inner.indexOf('|');
          const display = (pipe === -1 ? inner : inner.slice(pipe + 1)).trim();
          out.push(
            <span key={nextKey()} className="synapsium-embed-wikilink">
              {display}
            </span>,
          );
          i = closeIdx + 2;
          continue;
        }
      }
    }

    // Inline code `code`.
    if (c === '`') {
      const closeIdx = input.indexOf('`', i + 1);
      if (closeIdx !== -1 && closeIdx > i + 1) {
        const body = input.slice(i + 1, closeIdx);
        if (!body.includes('\n')) {
          flush();
          out.push(<code key={nextKey()}>{body}</code>);
          i = closeIdx + 1;
          continue;
        }
      }
    }

    // Markdown link [text](url).
    if (c === '[') {
      const closeBracket = input.indexOf(']', i + 1);
      if (closeBracket !== -1 && input[closeBracket + 1] === '(') {
        const closeParen = input.indexOf(')', closeBracket + 2);
        if (closeParen !== -1) {
          const text = input.slice(i + 1, closeBracket);
          const url = input.slice(closeBracket + 2, closeParen);
          if (!text.includes('\n') && !url.includes('\n') && url.length > 0) {
            flush();
            out.push(
              <a key={nextKey()} href={url} rel="noreferrer">
                {text}
              </a>,
            );
            i = closeParen + 1;
            continue;
          }
        }
      }
    }

    // Bold **text** or __text__.
    if ((c === '*' && c2 === '*') || (c === '_' && c2 === '_')) {
      const marker = c + c2;
      const closeIdx = input.indexOf(marker, i + 2);
      if (closeIdx !== -1 && closeIdx > i + 2) {
        const body = input.slice(i + 2, closeIdx);
        if (!body.includes('\n')) {
          flush();
          out.push(<strong key={nextKey()}>{body}</strong>);
          i = closeIdx + 2;
          continue;
        }
      }
    }

    // Italic *text* or _text_. Require the marker to NOT be doubled
    // (we'd already have caught a bold token above) and the body to
    // be non-empty.
    if ((c === '*' || c === '_') && c2 !== c) {
      const closeIdx = input.indexOf(c, i + 1);
      if (closeIdx !== -1 && closeIdx > i + 1) {
        const body = input.slice(i + 1, closeIdx);
        if (!body.includes('\n') && input[closeIdx + 1] !== c) {
          flush();
          out.push(<em key={nextKey()}>{body}</em>);
          i = closeIdx + 1;
          continue;
        }
      }
    }

    // Plain character - accumulate.
    buf += c;
    i += 1;
  }
  flush();

  return <>{out}</>;
}
