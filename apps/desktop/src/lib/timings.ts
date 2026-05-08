// Centralised timing constants used by debounced UI work.
//
// Why a single module: scattering ad-hoc numbers across stores and
// components makes them hard to tune and hard to reason about during
// performance debugging. Pulling them here gives one place to look
// when "why does it feel sluggish?" comes up, and it documents the
// reasoning behind each number.

/**
 * Editor autosave debounce. The user typically pauses for ~300ms
 * between thoughts; 500ms is short enough to feel responsive on
 * exit (Cmd+Tab) and long enough to coalesce typing bursts into one
 * disk write.
 */
export const AUTOSAVE_DEBOUNCE_MS = 500;

/**
 * Vault store refresh after watcher events. Chokidar fires several
 * events per single user action (touch, save in editor, git checkout)
 * inside a tight window; coalescing for 150ms turns those bursts
 * into one re-list of the index. Long enough to coalesce, short
 * enough that the sidebar feels live.
 */
export const VAULT_EVENT_REFRESH_MS = 150;

/**
 * BacklinksPanel refetch after vault events. Slightly slower than the
 * vault-event refresh because backlink fetches are heavier (one IPC
 * round-trip plus a SQLite query per source note for context snippets).
 */
export const BACKLINKS_REFETCH_MS = 250;
