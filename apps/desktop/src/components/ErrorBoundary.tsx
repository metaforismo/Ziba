import React from 'react';

type Props = {
  children: React.ReactNode;
};

type State = {
  error: Error | null;
};

/**
 * Top-level error boundary. Without it, a thrown error during render
 * unmounts the whole React tree and the user sees a blank window — bad
 * UX and unactionable. We catch, render an explanation, and offer a
 * reload button so the renderer can recover from preload bridge issues
 * or transient state corruption without quitting the app.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Surface the failure to the main process console (which we already
    // pipe to stdout in dev) — useful when the user reports "blank window".
    // In production we don't have a logging backend yet.
    if (typeof console !== 'undefined') {
      console.error('[ziba] React error boundary caught:', error, info.componentStack);
    }
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  reload = (): void => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  render(): React.ReactNode {
    const { error } = this.state;
    if (error === null) return this.props.children;

    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-bg p-8 text-fg">
        <div className="w-full max-w-xl rounded-md border border-border bg-bg-subtle p-6">
          <h1 className="mb-2 text-xl font-semibold text-fg">Qualcosa è andato storto</h1>
          <p className="mb-4 text-sm text-fg-muted">
            Ziba ha incontrato un errore inatteso durante il rendering. Puoi riprovare a caricare la
            finestra; se il problema persiste, riavvia l’app o apri una issue su GitHub con il
            messaggio qui sotto.
          </p>
          <pre className="mb-4 max-h-48 overflow-auto rounded bg-bg p-3 font-mono text-xs text-fg-subtle">
            {error.name}: {error.message}
            {error.stack !== undefined && (
              <>
                {'\n\n'}
                {error.stack}
              </>
            )}
          </pre>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={this.reload}
              className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg hover:opacity-90"
            >
              Ricarica la finestra
            </button>
            <button
              type="button"
              onClick={this.reset}
              className="rounded border border-border bg-bg-subtle px-3 py-1.5 text-sm font-medium text-fg-subtle hover:bg-bg-muted hover:text-fg"
            >
              Continua comunque
            </button>
          </div>
        </div>
      </div>
    );
  }
}
