import React, { useEffect, useCallback, useState, useRef } from "react";
import { createRoot } from "react-dom/client";

import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { TabIndentationPlugin } from "@lexical/react/LexicalTabIndentationPlugin";
import { TablePlugin } from "@lexical/react/LexicalTablePlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";

import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { ListNode, ListItemNode } from "@lexical/list";
import { LinkNode, AutoLinkNode } from "@lexical/link";
import { CodeNode, CodeHighlightNode } from "@lexical/code";
import { HorizontalRuleNode } from "@lexical/react/LexicalHorizontalRuleNode";
import {
  TableNode,
  TableCellNode,
  TableRowNode,
  $createTableNodeWithDimensions,
  $createTableCellNode,
  $createTableRowNode,
  $createTableNode,
  $isTableNode,
  $isTableRowNode,
  $isTableCellNode,
  TableCellHeaderStates,
  $insertTableRowAtSelection,
  $insertTableColumnAtSelection,
  $deleteTableRowAtSelection,
  $deleteTableColumnAtSelection,
} from "@lexical/table";

import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  TRANSFORMERS,
} from "@lexical/markdown";

import { escapeTableCell, unescapeTableCell, splitTableRow } from "./tableUtils";

import {
  $getRoot,
  $createParagraphNode,
  $createTextNode,
  FORMAT_TEXT_COMMAND,
  UNDO_COMMAND,
  REDO_COMMAND,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_HIGH,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
  TextNode,
  $isTextNode,
  LexicalNode,
  LexicalEditor,
  ElementNode,
} from "lexical";

import {
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
} from "@lexical/list";

import { $createHeadingNode, $createQuoteNode, $isHeadingNode } from "@lexical/rich-text";
import { $setBlocksType } from "@lexical/selection";
import { $createCodeNode } from "@lexical/code";
import { HorizontalRulePlugin } from "@lexical/react/LexicalHorizontalRulePlugin";
import { INSERT_HORIZONTAL_RULE_COMMAND } from "@lexical/react/LexicalHorizontalRuleNode";
import { $isLinkNode, TOGGLE_LINK_COMMAND } from "@lexical/link";
import { ImageNode, $createImageNode, $isImageNode } from "./ImageNode";

// Acquire VS Code API
declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};
const vscode = acquireVsCodeApi();

// ── Table Markdown Transformer ───────────────────────────────────

const TABLE_ROW_REG_EXP = /^(?:\|)(.+)(?:\|)\s*$/;
const TABLE_ROW_DIVIDER_REG_EXP = /^(\| ?:?-+:? ?)+\|\s*$/;

const TABLE_TRANSFORMER = {
  dependencies: [TableNode, TableRowNode, TableCellNode],
  export: (node: LexicalNode) => {
    if (!$isTableNode(node)) {
      return null;
    }
    const rows = node.getChildren();
    if (rows.length === 0) return "";

    const output: string[] = [];
    let isFirstRow = true;

    for (const row of rows) {
      if (!$isTableRowNode(row)) continue;
      const cells = row.getChildren();
      const cellTexts: string[] = [];

      for (const cell of cells) {
        if (!$isTableCellNode(cell)) continue;
        // Get text content from cell, replacing newlines with spaces
        const text = cell.getTextContent().replace(/\n/g, " ").trim();
        cellTexts.push(escapeTableCell(text) || " ");
      }

      output.push("| " + cellTexts.join(" | ") + " |");

      // Add divider row after header
      if (isFirstRow) {
        const divider = cellTexts.map(() => "---").join(" | ");
        output.push("| " + divider + " |");
        isFirstRow = false;
      }
    }

    return output.join("\n");
  },
  handleImportAfterStartMatch: ({
    lines,
    rootNode,
    startLineIndex,
  }: {
    lines: string[];
    rootNode: ElementNode;
    startLineIndex: number;
    startMatch: RegExpMatchArray;
    transformer: unknown;
  }) => {
    // Collect all consecutive table lines
    const tableLines: string[] = [lines[startLineIndex]];
    let endLineIndex = startLineIndex;

    for (let i = startLineIndex + 1; i < lines.length; i++) {
      const line = lines[i];
      if (TABLE_ROW_REG_EXP.test(line) || TABLE_ROW_DIVIDER_REG_EXP.test(line)) {
        tableLines.push(line);
        endLineIndex = i;
      } else {
        break;
      }
    }

    if (tableLines.length < 2) return null;

    // Parse table rows, skipping divider
    const dataRows: string[][] = [];
    for (const line of tableLines) {
      if (TABLE_ROW_DIVIDER_REG_EXP.test(line)) continue;
      const match = line.match(TABLE_ROW_REG_EXP);
      if (match) {
        const cells = splitTableRow(match[1]).map((c) => unescapeTableCell(c));
        dataRows.push(cells);
      }
    }

    if (dataRows.length === 0) return null;

    // Create table node
    const columnCount = Math.max(...dataRows.map((r) => r.length));
    const tableNode = $createTableNode();

    dataRows.forEach((row, rowIndex) => {
      const rowNode = $createTableRowNode();
      for (let col = 0; col < columnCount; col++) {
        const headerState =
          rowIndex === 0
            ? TableCellHeaderStates.ROW
            : TableCellHeaderStates.NO_STATUS;
        const cellNode = $createTableCellNode(headerState);
        const paragraph = $createParagraphNode();
        paragraph.append($createTextNode(row[col] || ""));
        cellNode.append(paragraph);
        rowNode.append(cellNode);
      }
      tableNode.append(rowNode);
    });

    rootNode.append(tableNode);
    return [true, endLineIndex] as [boolean, number];
  },
  regExpEnd: {
    optional: true,
    regExp: TABLE_ROW_REG_EXP,
  },
  regExpStart: TABLE_ROW_REG_EXP,
  replace: () => {
    // Import is handled entirely by handleImportAfterStartMatch
  },
  type: "multiline-element" as const,
};

// ── Image Markdown Transformer ──────────────────────────────────

const IMAGE_TRANSFORMER = {
  dependencies: [ImageNode],
  export: (node: LexicalNode) => {
    if (!$isImageNode(node)) return null;
    return `![${node.getAltText()}](${node.getSrc()})`;
  },
  importRegExp: /!(?:\[([^\]]*)\])(?:\(([^)]+)\))/,
  regExp: /!(?:\[([^\]]*)\])(?:\(([^)]+)\))$/,
  replace: (textNode: TextNode, match: RegExpMatchArray) => {
    const [, altText, src] = match;
    const imageNode = $createImageNode(src, altText || "");
    textNode.replace(imageNode);
  },
  trigger: ")",
  type: "text-match" as const,
};

// All transformers including our custom table and image ones
const ALL_TRANSFORMERS = [TABLE_TRANSFORMER, IMAGE_TRANSFORMER, ...TRANSFORMERS];

// ── Toolbar ──────────────────────────────────────────────────────

function ToolbarPlugin({ isFocusMode, onToggleFocusMode }: { isFocusMode: boolean; onToggleFocusMode: () => void }) {
  const [editor] = useLexicalComposerContext();
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isStrikethrough, setIsStrikethrough] = useState(false);
  const [isCode, setIsCode] = useState(false);
  const [blockType, setBlockType] = useState("paragraph");

  const updateToolbar = useCallback(() => {
    editor.getEditorState().read(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        setIsBold(selection.hasFormat("bold"));
        setIsItalic(selection.hasFormat("italic"));
        setIsStrikethrough(selection.hasFormat("strikethrough"));
        setIsCode(selection.hasFormat("code"));

        const anchorNode = selection.anchor.getNode();
        const element =
          anchorNode.getKey() === "root"
            ? anchorNode
            : anchorNode.getTopLevelElementOrThrow();

        if ($isHeadingNode(element)) {
          setBlockType(element.getTag());
        } else {
          setBlockType(element.getType());
        }
      }
    });
  }, [editor]);

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => updateToolbar());
    });
  }, [editor, updateToolbar]);

  const formatHeading = (level: "h1" | "h2" | "h3") => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        if (blockType === level) {
          $setBlocksType(selection, () => $createParagraphNode());
        } else {
          $setBlocksType(selection, () => $createHeadingNode(level));
        }
      }
    });
  };

  const formatQuote = () => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        if (blockType === "quote") {
          $setBlocksType(selection, () => $createParagraphNode());
        } else {
          $setBlocksType(selection, () => $createQuoteNode());
        }
      }
    });
  };

  const formatCodeBlock = () => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        if (blockType === "code") {
          $setBlocksType(selection, () => $createParagraphNode());
        } else {
          $setBlocksType(selection, () => $createCodeNode());
        }
      }
    });
  };

  const insertLink = () => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        const node = selection.anchor.getNode();
        const parent = node.getParent();
        if ($isLinkNode(node) || $isLinkNode(parent)) {
          editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
        } else {
          const url = prompt("Enter URL:");
          if (url) {
            editor.dispatchCommand(TOGGLE_LINK_COMMAND, url);
          }
        }
      }
    });
  };

  const insertTable = () => {
    editor.update(() => {
      const tableNode = $createTableNodeWithDimensions(3, 3, true);
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        const anchor = selection.anchor.getNode();
        const topLevel =
          anchor.getKey() === "root"
            ? anchor
            : anchor.getTopLevelElementOrThrow();
        if (topLevel && topLevel.getKey() !== "root") {
          topLevel.insertAfter(tableNode);
        } else {
          $getRoot().append(tableNode);
        }
      } else {
        $getRoot().append(tableNode);
      }
    });
  };

  const insertImage = () => {
    const url = prompt("Enter image URL:");
    if (!url) return;
    const alt = prompt("Enter alt text (optional):") || "";
    editor.update(() => {
      const imageNode = $createImageNode(url, alt);
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        const anchor = selection.anchor.getNode();
        const topLevel =
          anchor.getKey() === "root"
            ? anchor
            : anchor.getTopLevelElementOrThrow();
        if (topLevel && topLevel.getKey() !== "root") {
          topLevel.insertAfter(imageNode);
        } else {
          $getRoot().append(imageNode);
        }
      } else {
        $getRoot().append(imageNode);
      }
    });
  };

  return (
    <div className="toolbar">
      <button
        onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)}
        title="Undo (Ctrl+Z)"
      >
        ↩
      </button>
      <button
        onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)}
        title="Redo (Ctrl+Y)"
      >
        ↪
      </button>
      <div className="separator" />
      <button
        className={blockType === "h1" ? "active" : ""}
        onClick={() => formatHeading("h1")}
        title="Heading 1 (Ctrl+Shift+1)"
      >
        H1
      </button>
      <button
        className={blockType === "h2" ? "active" : ""}
        onClick={() => formatHeading("h2")}
        title="Heading 2 (Ctrl+Shift+2)"
      >
        H2
      </button>
      <button
        className={blockType === "h3" ? "active" : ""}
        onClick={() => formatHeading("h3")}
        title="Heading 3 (Ctrl+Shift+3)"
      >
        H3
      </button>
      <div className="separator" />
      <button
        className={isBold ? "active" : ""}
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold")}
        title="Bold (Ctrl+B)"
      >
        <strong>B</strong>
      </button>
      <button
        className={isItalic ? "active" : ""}
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic")}
        title="Italic (Ctrl+I)"
      >
        <em>I</em>
      </button>
      <button
        className={isStrikethrough ? "active" : ""}
        onClick={() =>
          editor.dispatchCommand(FORMAT_TEXT_COMMAND, "strikethrough")
        }
        title="Strikethrough"
      >
        <span className="editor-strikethrough">S</span>
      </button>
      <button
        className={isCode ? "active" : ""}
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "code")}
        title="Inline Code (Ctrl+Shift+K)"
      >
        {"</>"}
      </button>
      <div className="separator" />
      <button
        onClick={() =>
          editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)
        }
        title="Bullet List"
      >
        • List
      </button>
      <button
        onClick={() =>
          editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)
        }
        title="Numbered List"
      >
        1. List
      </button>
      <button
        className={blockType === "quote" ? "active" : ""}
        onClick={formatQuote}
        title="Quote"
      >
        ❝
      </button>
      <button
        className={blockType === "code" ? "active" : ""}
        onClick={formatCodeBlock}
        title="Code Block"
      >
        {"{ }"}
      </button>
      <div className="separator" />
      <button onClick={insertLink} title="Insert Link (Ctrl+K)">
        🔗
      </button>
      <button onClick={insertTable} title="Insert Table (3×3)">
        ⊞
      </button>
      <button onClick={insertImage} title="Insert Image">
        🖼
      </button>
      <button
        onClick={() =>
          editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined)
        }
        title="Horizontal Rule"
      >
        ―
      </button>
      <div className="separator" />
      <button
        className={isFocusMode ? "active" : ""}
        onClick={onToggleFocusMode}
        title="Focus Mode (Ctrl+Shift+F)"
      >
        Focus
      </button>
    </div>
  );
}

// ── Keyboard Shortcuts Plugin ────────────────────────────────────

function KeyboardShortcutsPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isCtrl = event.ctrlKey || event.metaKey;
      const isShift = event.shiftKey;

      if (!isCtrl) return;

      // Ctrl+B — Bold
      if (event.key === "b" && !isShift) {
        event.preventDefault();
        editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold");
        return;
      }

      // Ctrl+I — Italic
      if (event.key === "i" && !isShift) {
        event.preventDefault();
        editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic");
        return;
      }

      // Ctrl+K — Insert Link
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
              if (url) {
                editor.dispatchCommand(TOGGLE_LINK_COMMAND, url);
              }
            }
          }
        });
        return;
      }

      // Ctrl+Shift+K — Inline Code
      if (event.key === "K" && isShift) {
        event.preventDefault();
        editor.dispatchCommand(FORMAT_TEXT_COMMAND, "code");
        return;
      }

      // Ctrl+Shift+1/2/3 — Heading levels
      if (isShift && (event.key === "!" || event.code === "Digit1")) {
        event.preventDefault();
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            const anchorNode = selection.anchor.getNode();
            const element =
              anchorNode.getKey() === "root"
                ? anchorNode
                : anchorNode.getTopLevelElementOrThrow();
            if ($isHeadingNode(element) && element.getTag() === "h1") {
              $setBlocksType(selection, () => $createParagraphNode());
            } else {
              $setBlocksType(selection, () => $createHeadingNode("h1"));
            }
          }
        });
        return;
      }

      if (isShift && (event.key === "@" || event.code === "Digit2")) {
        event.preventDefault();
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            const anchorNode = selection.anchor.getNode();
            const element =
              anchorNode.getKey() === "root"
                ? anchorNode
                : anchorNode.getTopLevelElementOrThrow();
            if ($isHeadingNode(element) && element.getTag() === "h2") {
              $setBlocksType(selection, () => $createParagraphNode());
            } else {
              $setBlocksType(selection, () => $createHeadingNode("h2"));
            }
          }
        });
        return;
      }

      if (isShift && (event.key === "#" || event.code === "Digit3")) {
        event.preventDefault();
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            const anchorNode = selection.anchor.getNode();
            const element =
              anchorNode.getKey() === "root"
                ? anchorNode
                : anchorNode.getTopLevelElementOrThrow();
            if ($isHeadingNode(element) && element.getTag() === "h3") {
              $setBlocksType(selection, () => $createParagraphNode());
            } else {
              $setBlocksType(selection, () => $createHeadingNode("h3"));
            }
          }
        });
        return;
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

// ── Focus Mode Plugin ────────────────────────────────────────────

function FocusModePlugin({ isActive, onToggle }: { isActive: boolean; onToggle: () => void }) {
  const [editor] = useLexicalComposerContext();

  // Keyboard shortcut: Ctrl+Shift+F
  useEffect(() => {
    const root = editor.getRootElement();
    if (!root) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const isCtrl = event.ctrlKey || event.metaKey;
      if (isCtrl && event.shiftKey && event.key === "F") {
        event.preventDefault();
        onToggle();
      }
    };

    root.addEventListener("keydown", handleKeyDown);
    return () => root.removeEventListener("keydown", handleKeyDown);
  }, [editor, onToggle]);

  // Toggle .focus-mode class on contenteditable and track active block
  useEffect(() => {
    const root = editor.getRootElement();
    if (!root) return;

    if (isActive) {
      root.classList.add("focus-mode");
    } else {
      root.classList.remove("focus-mode");
      // Clean up any focus-active classes
      root.querySelectorAll(".focus-active").forEach((el) => {
        el.classList.remove("focus-active");
      });
      return;
    }

    // Update active block on selection changes
    const removeListener = editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const selection = $getSelection();
        // Remove all existing focus-active classes
        root.querySelectorAll(".focus-active").forEach((el) => {
          el.classList.remove("focus-active");
        });

        if (!$isRangeSelection(selection)) return;

        const anchorNode = selection.anchor.getNode();
        const topLevelElement =
          anchorNode.getKey() === "root"
            ? null
            : anchorNode.getTopLevelElementOrThrow();

        if (topLevelElement) {
          const dom = editor.getElementByKey(topLevelElement.getKey());
          if (dom) {
            dom.classList.add("focus-active");
          }
        }
      });
    });

    return () => {
      removeListener();
      // Clean up on unmount
      root.querySelectorAll(".focus-active").forEach((el) => {
        el.classList.remove("focus-active");
      });
    };
  }, [editor, isActive]);

  return null;
}

// ── Table Context Menu Plugin ────────────────────────────────────

function TableContextMenuPlugin() {
  const [editor] = useLexicalComposerContext();
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleContextMenu = (event: MouseEvent) => {
      editor.getEditorState().read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;
        const node = selection.anchor.getNode();
        // Walk up to find table cell
        let current: LexicalNode | null = node;
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
    if (root) {
      root.addEventListener("contextmenu", handleContextMenu);
    }
    document.addEventListener("click", handleClick);

    return () => {
      if (root) {
        root.removeEventListener("contextmenu", handleContextMenu);
      }
      document.removeEventListener("click", handleClick);
    };
  }, [editor]);

  const closeMenu = () => {
    setMenuPos(null);
  };

  const insertRowAbove = () => {
    editor.update(() => {
      $insertTableRowAtSelection(false);
    });
    closeMenu();
  };

  const insertRowBelow = () => {
    editor.update(() => {
      $insertTableRowAtSelection(true);
    });
    closeMenu();
  };

  const insertColumnLeft = () => {
    editor.update(() => {
      $insertTableColumnAtSelection(false);
    });
    closeMenu();
  };

  const insertColumnRight = () => {
    editor.update(() => {
      $insertTableColumnAtSelection(true);
    });
    closeMenu();
  };

  const deleteRow = () => {
    editor.update(() => {
      $deleteTableRowAtSelection();
    });
    closeMenu();
  };

  const deleteColumn = () => {
    editor.update(() => {
      $deleteTableColumnAtSelection();
    });
    closeMenu();
  };

  const deleteTable = () => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        const node = selection.anchor.getNode();
        let current: LexicalNode | null = node;
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
      style={{
        position: "fixed",
        left: menuPos.x,
        top: menuPos.y,
        zIndex: 1000,
      }}
    >
      <button onClick={insertRowAbove}>Insert Row Above</button>
      <button onClick={insertRowBelow}>Insert Row Below</button>
      <div className="context-menu-separator" />
      <button onClick={insertColumnLeft}>Insert Column Left</button>
      <button onClick={insertColumnRight}>Insert Column Right</button>
      <div className="context-menu-separator" />
      <button onClick={deleteRow}>Delete Row</button>
      <button onClick={deleteColumn}>Delete Column</button>
      <div className="context-menu-separator" />
      <button onClick={deleteTable}>Delete Table</button>
    </div>
  );
}

// ── Slash Command Menu Plugin ─────────────────────────────────────

interface SlashCommandItem {
  label: string;
  description: string;
  icon: string;
  keywords: string[];
  action: (editor: LexicalEditor) => void;
}

const SLASH_COMMANDS: SlashCommandItem[] = [
  {
    label: "Heading 1",
    description: "Large heading",
    icon: "H1",
    keywords: ["heading", "h1", "title"],
    action: (editor) => {
      editor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          $setBlocksType(selection, () => $createHeadingNode("h1"));
        }
      });
    },
  },
  {
    label: "Heading 2",
    description: "Medium heading",
    icon: "H2",
    keywords: ["heading", "h2", "subtitle"],
    action: (editor) => {
      editor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          $setBlocksType(selection, () => $createHeadingNode("h2"));
        }
      });
    },
  },
  {
    label: "Heading 3",
    description: "Small heading",
    icon: "H3",
    keywords: ["heading", "h3"],
    action: (editor) => {
      editor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          $setBlocksType(selection, () => $createHeadingNode("h3"));
        }
      });
    },
  },
  {
    label: "Bullet List",
    description: "Unordered list",
    icon: "•",
    keywords: ["bullet", "unordered", "list", "ul"],
    action: (editor) => {
      editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
    },
  },
  {
    label: "Numbered List",
    description: "Ordered list",
    icon: "1.",
    keywords: ["numbered", "ordered", "list", "ol"],
    action: (editor) => {
      editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
    },
  },
  {
    label: "Table",
    description: "Insert a 3×3 table",
    icon: "⊞",
    keywords: ["table", "grid"],
    action: (editor) => {
      editor.update(() => {
        const tableNode = $createTableNodeWithDimensions(3, 3, true);
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          const anchor = selection.anchor.getNode();
          const topLevel =
            anchor.getKey() === "root"
              ? anchor
              : anchor.getTopLevelElementOrThrow();
          if (topLevel && topLevel.getKey() !== "root") {
            topLevel.insertAfter(tableNode);
          } else {
            $getRoot().append(tableNode);
          }
        }
      });
    },
  },
  {
    label: "Code Block",
    description: "Fenced code block",
    icon: "{ }",
    keywords: ["code", "codeblock", "fenced", "pre"],
    action: (editor) => {
      editor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          $setBlocksType(selection, () => $createCodeNode());
        }
      });
    },
  },
  {
    label: "Quote",
    description: "Block quote",
    icon: "❝",
    keywords: ["quote", "blockquote", "callout"],
    action: (editor) => {
      editor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          $setBlocksType(selection, () => $createQuoteNode());
        }
      });
    },
  },
  {
    label: "Horizontal Rule",
    description: "Divider line",
    icon: "―",
    keywords: ["horizontal", "rule", "divider", "hr", "line"],
    action: (editor) => {
      editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined);
    },
  },
  {
    label: "Image",
    description: "Insert an image from URL",
    icon: "🖼",
    keywords: ["image", "picture", "img", "photo"],
    action: (editor) => {
      const url = prompt("Enter image URL:");
      if (!url) return;
      const alt = prompt("Enter alt text (optional):") || "";
      editor.update(() => {
        const imageNode = $createImageNode(url, alt);
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          const anchor = selection.anchor.getNode();
          const topLevel =
            anchor.getKey() === "root"
              ? anchor
              : anchor.getTopLevelElementOrThrow();
          if (topLevel && topLevel.getKey() !== "root") {
            topLevel.insertAfter(imageNode);
          } else {
            $getRoot().append(imageNode);
          }
        }
      });
    },
  },
];

function SlashCommandPlugin() {
  const [editor] = useLexicalComposerContext();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const menuRef = useRef<HTMLDivElement>(null);

  const filteredItems = SLASH_COMMANDS.filter((item) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      item.label.toLowerCase().includes(q) ||
      item.keywords.some((kw) => kw.includes(q))
    );
  });

  // Reset selected index when filtered results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Scroll selected item into view
  useEffect(() => {
    if (!isOpen || !menuRef.current) return;
    const selected = menuRef.current.querySelector(".slash-menu-item.selected");
    if (selected) {
      selected.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex, isOpen]);

  // Remove the slash text and close the menu
  const removeSlashText = useCallback(() => {
    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      const node = selection.anchor.getNode();
      if ($isTextNode(node)) {
        const text = node.getTextContent();
        // Find the slash and query text to remove
        const slashIndex = text.lastIndexOf("/");
        if (slashIndex !== -1) {
          // If the slash is all the text, remove the entire text content
          if (slashIndex === 0) {
            node.setTextContent("");
          } else {
            node.setTextContent(text.substring(0, slashIndex));
          }
          // Move selection to end
          node.selectEnd();
        }
      }
    });
  }, [editor]);

  const executeCommand = useCallback(
    (item: SlashCommandItem) => {
      removeSlashText();
      setIsOpen(false);
      setQuery("");
      // Use setTimeout so the text removal completes before the action
      setTimeout(() => item.action(editor), 0);
    },
    [editor, removeSlashText]
  );

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState, tags }) => {
      if (tags.has("external-update")) return;

      editorState.read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
          if (isOpen) {
            setIsOpen(false);
            setQuery("");
          }
          return;
        }

        const node = selection.anchor.getNode();
        if (!$isTextNode(node)) {
          if (isOpen) {
            setIsOpen(false);
            setQuery("");
          }
          return;
        }

        const text = node.getTextContent();
        const offset = selection.anchor.offset;
        const textBeforeCursor = text.substring(0, offset);

        // Check for slash at start of text or after whitespace
        const slashMatch = textBeforeCursor.match(/(?:^|\s)\/([a-zA-Z0-9 ]*)$/);
        if (slashMatch) {
          const filterText = slashMatch[1];
          setQuery(filterText);
          if (!isOpen) {
            // Position the menu near the cursor
            const domSelection = window.getSelection();
            if (domSelection && domSelection.rangeCount > 0) {
              const range = domSelection.getRangeAt(0);
              const rect = range.getBoundingClientRect();
              setMenuPosition({
                x: rect.left,
                y: rect.bottom + 4,
              });
            }
            setIsOpen(true);
          }
        } else if (isOpen) {
          setIsOpen(false);
          setQuery("");
        }
      });
    });
  }, [editor, isOpen]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const removeDown = editor.registerCommand(
      KEY_ARROW_DOWN_COMMAND,
      (event) => {
        event?.preventDefault();
        setSelectedIndex((prev) =>
          prev < filteredItems.length - 1 ? prev + 1 : 0
        );
        return true;
      },
      COMMAND_PRIORITY_HIGH
    );

    const removeUp = editor.registerCommand(
      KEY_ARROW_UP_COMMAND,
      (event) => {
        event?.preventDefault();
        setSelectedIndex((prev) =>
          prev > 0 ? prev - 1 : filteredItems.length - 1
        );
        return true;
      },
      COMMAND_PRIORITY_HIGH
    );

    const removeEnter = editor.registerCommand(
      KEY_ENTER_COMMAND,
      (event) => {
        if (filteredItems.length > 0) {
          event?.preventDefault();
          executeCommand(filteredItems[selectedIndex]);
          return true;
        }
        return false;
      },
      COMMAND_PRIORITY_HIGH
    );

    const removeEscape = editor.registerCommand(
      KEY_ESCAPE_COMMAND,
      (event) => {
        event?.preventDefault();
        setIsOpen(false);
        setQuery("");
        return true;
      },
      COMMAND_PRIORITY_HIGH
    );

    return () => {
      removeDown();
      removeUp();
      removeEnter();
      removeEscape();
    };
  }, [editor, isOpen, filteredItems, selectedIndex, executeCommand]);

  if (!isOpen || filteredItems.length === 0) return null;

  return (
    <div
      ref={menuRef}
      className="slash-command-menu"
      style={{
        position: "fixed",
        left: menuPosition.x,
        top: menuPosition.y,
        zIndex: 1000,
      }}
    >
      {filteredItems.map((item, index) => (
        <button
          key={item.label}
          className={`slash-menu-item ${index === selectedIndex ? "selected" : ""}`}
          onMouseEnter={() => setSelectedIndex(index)}
          onMouseDown={(e) => {
            e.preventDefault();
            executeCommand(item);
          }}
        >
          <span className="slash-menu-icon">{item.icon}</span>
          <span className="slash-menu-text">
            <span className="slash-menu-label">{item.label}</span>
            <span className="slash-menu-description">{item.description}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

// ── Sync Plugin: VS Code ↔ Lexical ──────────────────────────────

function SyncPlugin() {
  const [editor] = useLexicalComposerContext();

  // Listen for messages from VS Code extension
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (msg.type === "update") {
        editor.update(
          () => {
            const root = $getRoot();
            root.clear();
            $convertFromMarkdownString(msg.text, ALL_TRANSFORMERS);
          },
          { tag: "external-update" }
        );
      }
};
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [editor]);

  // Send changes back to VS Code
  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout>;
    const removeListener = editor.registerUpdateListener(
      ({ editorState, tags }) => {
        // Skip sending if this was an external update
        if (tags.has("external-update")) return;

        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          editorState.read(() => {
            const markdown = $convertToMarkdownString(ALL_TRANSFORMERS);
            vscode.postMessage({ type: "edit", text: markdown });
          });
        }, 300);
      }
    );
    return () => {
      removeListener();
      clearTimeout(debounceTimer);
    };
  }, [editor]);

  return null;
}

// ── Main Editor ──────────────────────────────────────────────────

const editorConfig = {
  namespace: "MarkdownEditor",
  theme: {
    text: {
      bold: "editor-bold",
      italic: "editor-italic",
      strikethrough: "editor-strikethrough",
      code: "editor-code",
      underline: "editor-underline",
    },
    heading: {
      h1: "editor-h1",
      h2: "editor-h2",
      h3: "editor-h3",
      h4: "editor-h4",
      h5: "editor-h5",
      h6: "editor-h6",
    },
    table: "editor-table",
    tableCell: "editor-table-cell",
    tableCellHeader: "editor-table-cell-header",
    tableRow: "editor-table-row",
  },
  nodes: [
    HeadingNode,
    QuoteNode,
    ListNode,
    ListItemNode,
    LinkNode,
    AutoLinkNode,
    CodeNode,
    CodeHighlightNode,
    HorizontalRuleNode,
    TableNode,
    TableCellNode,
    TableRowNode,
    ImageNode,
  ],
  onError: (error: Error) => {
    console.error("Lexical error:", error);
  },
};

function Editor() {
  const [isFocusMode, setIsFocusMode] = useState(false);
  const toggleFocusMode = useCallback(() => setIsFocusMode((prev) => !prev), []);

  return (
    <LexicalComposer initialConfig={editorConfig}>
      <ToolbarPlugin isFocusMode={isFocusMode} onToggleFocusMode={toggleFocusMode} />
      <div className="editor-shell">
        <div className="editor-content-area">
          <RichTextPlugin
            contentEditable={<ContentEditable />}
            ErrorBoundary={LexicalErrorBoundary}
          />
          <HistoryPlugin />
          <ListPlugin />
          <LinkPlugin />
          <HorizontalRulePlugin />
          <TablePlugin hasTabHandler={true} />
          <TabIndentationPlugin />
          <KeyboardShortcutsPlugin />
          <FocusModePlugin isActive={isFocusMode} onToggle={toggleFocusMode} />
          <TableContextMenuPlugin />
          <SlashCommandPlugin />
          <SyncPlugin />
        </div>
      </div>
    </LexicalComposer>
  );
}

// ── Mount ────────────────────────────────────────────────────────

const container = document.getElementById("app");
if (container) {
  const root = createRoot(container);
  root.render(<Editor />);
}

// Signal to VS Code that the webview is ready
vscode.postMessage({ type: "ready" });
