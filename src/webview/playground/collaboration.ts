/**
 * Collaboration stub for VS Code environment.
 * Real collaboration is not supported in VS Code webview.
 */

// Minimal type stubs - no actual yjs/y-websocket imports needed
type Doc = any;
type Provider = any;

const noopProvider = {
  awareness: {
    getLocalState: () => null,
    getStates: () => new Map(),
    on: () => {},
    off: () => {},
  },
  connect: () => {},
  disconnect: () => {},
  on: () => {},
  off: () => {},
};

export function createWebsocketProvider(
  _id: string,
  _yjsDocMap: Map<string, Doc>,
): Provider {
  return noopProvider;
}

export function createWebsocketProviderWithDoc(
  _id: string,
  _doc: Doc,
): Provider {
  return noopProvider;
}
