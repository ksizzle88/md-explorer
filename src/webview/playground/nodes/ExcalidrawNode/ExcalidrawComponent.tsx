/**
 * Stub: Excalidraw component not available in VS Code webview.
 */
import type {JSX} from 'react';

export default function ExcalidrawComponent(_props: {
  nodeKey: string;
  data: string;
  width: number | 'inherit';
  height: number | 'inherit';
}): JSX.Element {
  return (
    <div style={{padding: '12px', background: 'var(--vscode-editor-background)', border: '1px dashed var(--vscode-editorWidget-border, #555)', borderRadius: '4px', color: 'var(--vscode-descriptionForeground, #666)', textAlign: 'center'}}>
      [Excalidraw drawing]
    </div>
  );
}
