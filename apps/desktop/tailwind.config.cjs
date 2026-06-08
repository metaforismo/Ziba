/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Semantic tokens. The actual values are defined in
        // `src/styles/globals.css` as CSS variables so that dark mode can
        // override them via the `.dark` class on <html>.
        bg: {
          DEFAULT: 'rgb(var(--bg) / <alpha-value>)',
          subtle: 'rgb(var(--bg-subtle) / <alpha-value>)',
          muted: 'rgb(var(--bg-muted) / <alpha-value>)',
        },
        fg: {
          DEFAULT: 'rgb(var(--fg) / <alpha-value>)',
          subtle: 'rgb(var(--fg-subtle) / <alpha-value>)',
          muted: 'rgb(var(--fg-muted) / <alpha-value>)',
        },
        border: {
          DEFAULT: 'rgb(var(--border) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          fg: 'rgb(var(--accent-fg) / <alpha-value>)',
        },
        // Graph-surface palette. Theme-derived (see `--graph-*` in
        // globals.css) so the knowledge graph chrome follows all 5
        // themes + light/dark instead of hardcoding dark hex. SVG
        // `fill`/`stroke` attributes still read these via the
        // `useGraphPalette()` hook (a class does nothing on a <circle>),
        // but graph OVERLAY chrome (panels, legend) uses these classes.
        graph: {
          bg: 'rgb(var(--graph-bg) / <alpha-value>)',
          surface: 'rgb(var(--graph-surface) / <alpha-value>)',
          node: 'rgb(var(--graph-node) / <alpha-value>)',
          'node-muted': 'rgb(var(--graph-node-muted) / <alpha-value>)',
          edge: 'rgb(var(--graph-edge) / <alpha-value>)',
          'edge-mention': 'rgb(var(--graph-edge-mention) / <alpha-value>)',
          text: 'rgb(var(--graph-text) / <alpha-value>)',
          'text-muted': 'rgb(var(--graph-text-muted) / <alpha-value>)',
          selection: 'rgb(var(--graph-selection) / <alpha-value>)',
        },
      },
    },
  },
  plugins: [],
};
