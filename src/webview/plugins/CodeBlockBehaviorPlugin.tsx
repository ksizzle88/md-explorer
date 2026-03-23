/**
 * Code block keyboard behavior: Tab inserts spaces, Enter inserts newline,
 * Backspace at start doesn't delete the code block.
 */
import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getSelection,
  $isRangeSelection,
  LexicalNode,
  ElementNode,
} from "lexical";

export default function CodeBlockBehaviorPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const root = editor.getRootElement();
    if (!root) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      let insideCode = false;
      editor.getEditorState().read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;
        let current: LexicalNode | null = selection.anchor.getNode();
        while (current) {
          if (current.getType() === "code") {
            insideCode = true;
            return;
          }
          current = current.getParent();
        }
      });

      if (!insideCode) return;

      if (event.key === "Tab" && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            selection.insertRawText("  ");
          }
        });
        return;
      }

      if (event.key === "Enter" && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            selection.insertRawText("\n");
          }
        });
        return;
      }

      if (event.key === "Backspace") {
        editor.getEditorState().read(() => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection) || !selection.isCollapsed()) return;
          const anchor = selection.anchor;
          const node = anchor.getNode();
          if (anchor.offset === 0) {
            let current: LexicalNode | null = node;
            while (current) {
              if (current.getType() === "code") {
                const codeNode = current as ElementNode;
                const firstChild = codeNode.getFirstChild();
                if (node === firstChild || node.getKey() === codeNode.getKey()) {
                  event.preventDefault();
                }
                return;
              }
              current = current.getParent();
            }
          }
        });
      }
    };

    root.addEventListener("keydown", handleKeyDown);
    return () => root.removeEventListener("keydown", handleKeyDown);
  }, [editor]);

  return null;
}
