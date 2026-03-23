/**
 * Stub: Excalidraw plugin not available in VS Code webview.
 */
import type {JSX} from 'react';
import {createCommand, LexicalCommand} from 'lexical';

export const INSERT_EXCALIDRAW_COMMAND: LexicalCommand<void> = createCommand(
  'INSERT_EXCALIDRAW_COMMAND',
);

export default function ExcalidrawPlugin(): JSX.Element | null {
  return null;
}
