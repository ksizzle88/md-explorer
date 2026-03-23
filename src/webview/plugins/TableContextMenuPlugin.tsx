/**
 * Right-click context menu for table operations.
 */
import React, { useEffect, useState, useRef } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getSelection,
  $isRangeSelection,
  LexicalNode,
} from "lexical";
import {
  $isTableCellNode,
  $isTableNode,
  $insertTableRowAtSelection,
  $insertTableColumnAtSelection,
  $deleteTableRowAtSelection,
  $deleteTableColumnAtSelection,
} from "@lexical/table";

export default function TableContextMenuPlugin() {
  const [editor] = useLexicalComposerContext();
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleContextMenu = (event: MouseEvent) => {
      editor.getEditorState().read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;
        let current: LexicalNode | null = selection.anchor.getNode();
        while (current) {
          if ($isTableCellNode(current)) {
            event.preventDefault();
            setMenuPos({ x: event.clientX, y: event.clientY });
            return;
          }
          current = current.getParent();
        }
      });
    };

    const handleClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuPos(null);
      }
    };

    const root = editor.getRootElement();
    if (root) root.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("click", handleClick);

    return () => {
      if (root) root.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("click", handleClick);
    };
  }, [editor]);

  const closeMenu = () => setMenuPos(null);

  const action = (fn: () => void) => {
    editor.update(fn);
    closeMenu();
  };

  const deleteTable = () => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        let current: LexicalNode | null = selection.anchor.getNode();
        while (current) {
          if ($isTableNode(current)) {
            current.remove();
            return;
          }
          current = current.getParent();
        }
      }
    });
    closeMenu();
  };

  if (!menuPos) return null;

  return (
    <div
      ref={menuRef}
      className="table-context-menu"
      style={{ position: "fixed", left: menuPos.x, top: menuPos.y, zIndex: 1000 }}
    >
      <button onClick={() => action(() => $insertTableRowAtSelection(false))}>
        Insert Row Above
      </button>
      <button onClick={() => action(() => $insertTableRowAtSelection(true))}>
        Insert Row Below
      </button>
      <div className="context-menu-separator" />
      <button onClick={() => action(() => $insertTableColumnAtSelection(false))}>
        Insert Column Left
      </button>
      <button onClick={() => action(() => $insertTableColumnAtSelection(true))}>
        Insert Column Right
      </button>
      <div className="context-menu-separator" />
      <button onClick={() => action(() => $deleteTableRowAtSelection())}>
        Delete Row
      </button>
      <button onClick={() => action(() => $deleteTableColumnAtSelection())}>
        Delete Column
      </button>
      <div className="context-menu-separator" />
      <button onClick={deleteTable}>Delete Table</button>
    </div>
  );
}
