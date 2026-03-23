/**
 * Stub: Versions plugin requires yjs collaboration, not available in VS Code.
 */
import type {JSX} from 'react';
import {createCommand, LexicalCommand} from 'lexical';

export const SHOW_VERSIONS_COMMAND: LexicalCommand<void> = createCommand(
  'SHOW_VERSIONS_COMMAND',
);

export function VersionsPlugin(_props: {id: string}): JSX.Element | null {
  return null;
}
