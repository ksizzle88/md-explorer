/**
 * Stub: Excalidraw modal not available in VS Code webview.
 */
import type {JSX} from 'react';

export type ExcalidrawInitialElements = ReadonlyArray<any>;

export default function ExcalidrawModal(_props: {
  initialElements: ExcalidrawInitialElements;
  initialAppState: any;
  initialFiles: any;
  isShown?: boolean;
  onDelete: () => void;
  onClose: () => void;
  onSave: (elements: ExcalidrawInitialElements, appState: any, files: any) => void;
  closeOnClickOutside?: boolean;
}): JSX.Element | null {
  return null;
}
