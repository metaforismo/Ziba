// TODO: register MathBlockExtension + MathInlineExtension in EditorExtensions.ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import katex from 'katex';

/**
 * Shared rendering helpers for the math node views.
 *
 * Why a single file instead of two co-located NodeView components?
 *   - The block and inline node views differ only in three things:
 *     the wrapper element (`div` vs `span`), the KaTeX `displayMode`,
 *     and the placeholder text. Everything else — the click-to-edit
 *     popover, the textarea state machine, KaTeX error handling — is
 *     identical. Sharing keeps both surfaces in lock-step.
 *
 * KaTeX integration approach:
 *   - We use `renderToString({ throwOnError: false })` and inject the
 *     output via `dangerouslySetInnerHTML`. KaTeX's documentation
 *     explicitly endorses this: with `throwOnError: false` the output
 *     is *always* safe HTML — invalid input renders as a styled error
 *     span (we surface it via `errorColor` + a `.synapsium-math-error`
 *     wrapper for theming). The only inputs reaching this code path
 *     are the `formula` attribute on our nodes, which originates from
 *     either the user's keystrokes or markdown they authored — both
 *     trusted by the same threat model that lets them author HTML in
 *     code blocks already.
 *   - We avoid `katex.render(formula, element)` (DOM-side) because that
 *     would couple us to a DOM node lifecycle controlled by ProseMirror;
 *     the `renderToString` + `dangerouslySetInnerHTML` flow lets React
 *     manage the diff and stays in sync with attribute updates.
 */

/**
 * Render a LaTeX formula to KaTeX HTML. Centralized so both block and
 * inline node views call into the same code path with the same error
 * handling.
 *
 * Empty input is a special case: KaTeX would render an empty span,
 * which is invisible — instead we return null so the caller can show
 * a placeholder.
 */
function renderKatex(formula: string, displayMode: boolean): string | null {
  const trimmed = formula.trim();
  if (trimmed.length === 0) return null;
  // `throwOnError: false` makes KaTeX emit `<span class="katex-error">`
  // for invalid input rather than throwing. We pipe through a known
  // CSS color so theming sits in our globals.css.
  return katex.renderToString(formula, {
    displayMode,
    throwOnError: false,
    errorColor: '#ef4444',
    output: 'html',
  });
}

interface MathNodeViewOptions {
  /** Distinguishes block (`$$`) from inline (`$`) math. */
  displayMode: boolean;
  /** Wrapper tag — `div` for block, `span` for inline. */
  as: 'div' | 'span';
  /** Class applied to the wrapper for hover affordance. */
  wrapperClass: string;
  /** Placeholder shown when the formula is empty. */
  placeholder: string;
}

/**
 * Build a React node view component for math. The resulting component
 * is what `addNodeView` returns via `ReactNodeViewRenderer`.
 *
 * UX (kept deliberately minimal for v0.4):
 *   - Click the rendered KaTeX → enters edit mode: a textarea replaces
 *     the rendered output (block mode) or appears below it (inline mode
 *     uses an absolutely-positioned mini popover so the surrounding
 *     paragraph layout doesn't shift).
 *   - Live preview while typing.
 *   - Esc → revert to the last saved formula and exit edit mode.
 *   - Cmd/Ctrl+Enter → save and exit edit mode.
 *   - Plain Enter inserts a newline in block mode; in inline mode it
 *     commits (newlines have no meaning in `$..$`).
 *   - On blur we commit so a stray click outside doesn't strand the
 *     user in edit mode.
 */
function createMathNodeView({
  displayMode,
  as: Wrapper,
  wrapperClass,
  placeholder,
}: MathNodeViewOptions): React.FC<NodeViewProps> {
  const MathNodeView: React.FC<NodeViewProps> = ({ node, updateAttributes, selected, editor }) => {
    const formula = String(node.attrs.formula ?? '');

    const [editing, setEditing] = useState<boolean>(false);
    // Draft mirrors the textarea while editing. Diverges from the node
    // attribute until the user commits.
    const [draft, setDraft] = useState<string>(formula);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);

    // When the underlying node changes from elsewhere (collab, undo)
    // sync the draft so we don't display stale text on next edit.
    useEffect(() => {
      if (!editing) setDraft(formula);
    }, [formula, editing]);

    // Render the *committed* formula (not the draft) for the read view,
    // and the draft for the live preview while editing. Memoised so we
    // don't re-run KaTeX on unrelated re-renders.
    const renderedHtml = useMemo(
      () => renderKatex(editing ? draft : formula, displayMode),
      [draft, formula, editing],
    );

    const enterEdit = useCallback((): void => {
      if (!editor.isEditable) return;
      setDraft(formula);
      setEditing(true);
      // Defer focus until after the textarea mounts.
      requestAnimationFrame(() => {
        const ta = textareaRef.current;
        if (ta !== null) {
          ta.focus();
          // Place cursor at the end so the user can append immediately.
          ta.setSelectionRange(ta.value.length, ta.value.length);
        }
      });
    }, [editor, formula]);

    const commit = useCallback((): void => {
      // Inline math collapses newlines on commit — `$x\ny$` isn't valid
      // CommonMark inline math anyway.
      const next = displayMode ? draft : draft.replace(/\s*\n\s*/g, ' ');
      if (next !== formula) {
        updateAttributes({ formula: next });
      }
      setEditing(false);
    }, [draft, formula, updateAttributes]);

    const cancel = useCallback((): void => {
      setDraft(formula);
      setEditing(false);
    }, [formula]);

    const onKeyDown = useCallback(
      (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          cancel();
          return;
        }
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          event.stopPropagation();
          commit();
          return;
        }
        // For inline math, plain Enter commits — newlines aren't
        // meaningful in `$..$` and pressing Enter "finishes" the edit
        // is the natural ergonomic. Block math allows newlines so the
        // user can write multi-line LaTeX (matrices, aligned envs).
        if (!displayMode && event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          event.stopPropagation();
          commit();
          return;
        }
      },
      [cancel, commit],
    );

    const baseClass = [
      wrapperClass,
      selected ? 'ProseMirror-selectednode' : '',
      editing ? 'synapsium-math--editing' : '',
    ]
      .filter(Boolean)
      .join(' ');

    // KaTeX output is trusted (we generated it locally with
    // `throwOnError: false`, which is documented as XSS-safe even for
    // arbitrary user input). Wrapping its HTML in
    // `dangerouslySetInnerHTML` is the canonical KaTeX integration
    // pattern — see https://katex.org/docs/api.html#rendertostring.
    const previewMarkup =
      renderedHtml === null ? null : { __html: renderedHtml /* trusted KaTeX HTML */ };

    if (editing) {
      // Editing view: live preview + textarea. We deliberately render
      // these inside a NodeViewWrapper so ProseMirror still owns the
      // outer DOM node — that way arrow keys and selection updates
      // continue to behave correctly when the user exits edit mode.
      return (
        <NodeViewWrapper
          as={Wrapper}
          className={baseClass}
          contentEditable={false}
          data-math-block={displayMode ? '' : undefined}
          data-math-inline={displayMode ? undefined : ''}
        >
          <div className="synapsium-math-editor">
            <div className="synapsium-math-preview">
              {previewMarkup === null ? (
                <span className="synapsium-math-placeholder">{placeholder}</span>
              ) : (
                <span dangerouslySetInnerHTML={previewMarkup} />
              )}
            </div>
            <textarea
              ref={textareaRef}
              className="synapsium-math-textarea"
              value={draft}
              onChange={(e): void => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              onBlur={(): void => {
                // Commit on blur so a stray click outside doesn't strand
                // the user in edit mode. Inline math without commit
                // would otherwise look broken (the textarea floats over
                // the next paragraph).
                commit();
              }}
              rows={displayMode ? 3 : 1}
              spellCheck={false}
              placeholder="LaTeX (e.g. x^2 + y^2 = z^2)"
            />
          </div>
        </NodeViewWrapper>
      );
    }

    return (
      <NodeViewWrapper
        as={Wrapper}
        className={baseClass}
        contentEditable={false}
        data-math-block={displayMode ? '' : undefined}
        data-math-inline={displayMode ? undefined : ''}
        onClick={(e: React.MouseEvent): void => {
          e.preventDefault();
          enterEdit();
        }}
        // Keyboard activation for accessibility — when the node is
        // selected via arrow keys, Enter opens the editor.
        onKeyDown={(e: React.KeyboardEvent): void => {
          if (e.key === 'Enter') {
            e.preventDefault();
            enterEdit();
          }
        }}
        tabIndex={-1}
      >
        {previewMarkup === null ? (
          <span className="synapsium-math-placeholder">{placeholder}</span>
        ) : (
          <span dangerouslySetInnerHTML={previewMarkup} />
        )}
      </NodeViewWrapper>
    );
  };
  // Set displayName so React DevTools shows something useful even
  // though both views share the underlying component.
  MathNodeView.displayName = displayMode ? 'MathBlockView' : 'MathInlineView';
  return MathNodeView;
}

export const MathBlockView = createMathNodeView({
  displayMode: true,
  as: 'div',
  wrapperClass: 'synapsium-math-block',
  placeholder: '↪ tap to add formula',
});

export const MathInlineView = createMathNodeView({
  displayMode: false,
  as: 'span',
  wrapperClass: 'synapsium-math-inline',
  placeholder: '↪ tap to add formula',
});
