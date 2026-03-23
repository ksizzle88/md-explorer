/**
 * Keyboard shortcuts for text formatting and heading levels.
 */
import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getSelection,
  $isRangeSelection,
  $createParagraphNode,
  FORMAT_TEXT_COMMAND,
  LexicalNode,
} from "lexical";
import { $createHeadingNode, $isHeadingNode } from "@lexical/rich-text";
import { $setBlocksType } from "@lexical/selection";
import { $isLinkNode, TOGGLE_LINK_COMMAND } from "@lexical/link";

export default function KeyboardShortcutsPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isCtrl = event.ctrlKey || event.metaKey;
      const isShift = event.shiftKey;
      if (!isCtrl) return;

      // Don't fire markdown shortcuts inside code blocks
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
      if (insideCode) return;

      if (event.key === "b" && !isShift) {
        event.preventDefault();
        editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold");
        return;
      }
      if (event.key === "i" && !isShift) {
        event.preventDefault();
        editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic");
        return;
      }
      if (event.key === "k" && !isShift) {
        event.preventDefault();
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            const node = selection.anchor.getNode();
            const parent = node.getParent();
            if ($isLinkNode(node) || $isLinkNode(parent)) {
              editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
            } else {
              const url = prompt("Enter URL:");
              if (url) editor.dispatchCommand(TOGGLE_LINK_COMMAND, url);
            }
          }
        });
        return;
      }
      if (event.key === "K" && isShift) {
        event.preventDefault();
        editor.dispatchCommand(FORMAT_TEXT_COMMAND, "code");
        return;
      }

      // Ctrl+Shift+1/2/3 — Heading levels
      const headingShortcuts: Record<string, { key: string; code: string; level: "h1" | "h2" | "h3" }> = {
        "!": { key: "!", code: "Digit1", level: "h1" },
        "@": { key: "@", code: "Digit2", level: "h2" },
        "#": { key: "#", code: "Digit3", level: "h3" },
      };
      for (const [, shortcut] of Object.entries(headingShortcuts)) {
        if (isShift && (event.key === shortcut.key || event.code === shortcut.code)) {
          event.preventDefault();
          editor.update(() => {
            const selection = $getSelection();
            if ($isRangeSelection(selection)) {
              const anchorNode = selection.anchor.getNode();
              const element =
                anchorNode.getKey() === "root"
                  ? anchorNode
                  : anchorNode.getTopLevelElementOrThrow();
              if ($isHeadingNode(element) && element.getTag() === shortcut.level) {
                $setBlocksType(selection, () => $createParagraphNode());
              } else {
                $setBlocksType(selection, () => $createHeadingNode(shortcut.level));
              }
            }
          });
          return;
        }
      }
    };

    const root = editor.getRootElement();
    if (root) {
      root.addEventListener("keydown", handleKeyDown);
      return () => root.removeEventListener("keydown", handleKeyDown);
    }
  }, [editor]);

  return null;
}
