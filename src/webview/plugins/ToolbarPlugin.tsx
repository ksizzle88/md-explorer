/**
 * Enhanced ToolbarPlugin ported from Lexical Playground.
 * Features dropdown menus for block format, insert actions, and text formatting.
 */
import React, { useCallback, useEffect, useState, useRef } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getSelection,
  $isRangeSelection,
  $getRoot,
  $createParagraphNode,
  FORMAT_TEXT_COMMAND,
  UNDO_COMMAND,
  REDO_COMMAND,
  CAN_UNDO_COMMAND,
  CAN_REDO_COMMAND,
  COMMAND_PRIORITY_CRITICAL,
  LexicalNode,
} from "lexical";
import {
  $createHeadingNode,
  $createQuoteNode,
  $isHeadingNode,
  HeadingTagType,
} from "@lexical/rich-text";
import { $setBlocksType } from "@lexical/selection";
import { $createCodeNode } from "@lexical/code";
import {
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  INSERT_CHECK_LIST_COMMAND,
} from "@lexical/list";
import { INSERT_HORIZONTAL_RULE_COMMAND } from "@lexical/react/LexicalHorizontalRuleNode";
import { $isLinkNode, TOGGLE_LINK_COMMAND } from "@lexical/link";
import {
  $createTableNodeWithDimensions,
  $isTableNode,
} from "@lexical/table";
import { $createImageNode } from "../ImageNode";

// ── Dropdown Component ──────────────────────────────────────────

function DropDown({
  buttonLabel,
  buttonClassName,
  buttonTitle,
  children,
  disabled,
}: {
  buttonLabel: string;
  buttonClassName?: string;
  buttonTitle?: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen]);

  return (
    <div className="toolbar-dropdown-wrap">
      <button
        ref={buttonRef}
        className={`toolbar-dropdown-btn ${buttonClassName || ""} ${isOpen ? "active" : ""}`}
        onClick={() => setIsOpen(!isOpen)}
        title={buttonTitle}
        disabled={disabled}
      >
        {buttonLabel}
        <span className="dropdown-caret">&#x25BE;</span>
      </button>
      {isOpen && (
        <div ref={dropdownRef} className="toolbar-dropdown-menu">
          <div onClick={() => setIsOpen(false)}>{children}</div>
        </div>
      )}
    </div>
  );
}

function DropDownItem({
  onClick,
  children,
  active,
  title,
}: {
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
  title?: string;
}) {
  return (
    <button
      className={`toolbar-dropdown-item ${active ? "active" : ""}`}
      onClick={onClick}
      title={title}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="toolbar-divider" />;
}

// ── Block type names ────────────────────────────────────────────

const blockTypeToBlockName: Record<string, string> = {
  paragraph: "Normal",
  h1: "Heading 1",
  h2: "Heading 2",
  h3: "Heading 3",
  h4: "Heading 4",
  h5: "Heading 5",
  h6: "Heading 6",
  quote: "Quote",
  code: "Code Block",
  "bullet-list": "Bullet List",
  "number-list": "Numbered List",
  "check-list": "Check List",
};

// ── Main Toolbar ────────────────────────────────────────────────

export default function ToolbarPlugin({
  isFocusMode,
  onToggleFocusMode,
  isSourceMode,
  onToggleSourceMode,
  isDiffMode,
  onToggleDiffMode,
}: {
  isFocusMode: boolean;
  onToggleFocusMode: () => void;
  isSourceMode: boolean;
  onToggleSourceMode: () => void;
  isDiffMode: boolean;
  onToggleDiffMode: () => void;
}) {
  const [editor] = useLexicalComposerContext();
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isStrikethrough, setIsStrikethrough] = useState(false);
  const [isCode, setIsCode] = useState(false);
  const [isLink, setIsLink] = useState(false);
  const [blockType, setBlockType] = useState("paragraph");

  const $updateToolbar = useCallback(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) {
      setIsBold(selection.hasFormat("bold"));
      setIsItalic(selection.hasFormat("italic"));
      setIsStrikethrough(selection.hasFormat("strikethrough"));
      setIsCode(selection.hasFormat("code"));

      const anchorNode = selection.anchor.getNode();
      let element: LexicalNode =
        anchorNode.getKey() === "root"
          ? anchorNode
          : anchorNode.getTopLevelElementOrThrow();

      if ($isHeadingNode(element)) {
        setBlockType(element.getTag());
      } else {
        const type = element.getType();
        if (type === "list") {
          const listType = (element as any).getListType?.();
          if (listType === "bullet") setBlockType("bullet-list");
          else if (listType === "number") setBlockType("number-list");
          else if (listType === "check") setBlockType("check-list");
          else setBlockType(type);
        } else {
          setBlockType(type);
        }
      }

      // Check link
      const node = selection.anchor.getNode();
      const parent = node.getParent();
      setIsLink($isLinkNode(parent) || $isLinkNode(node));
    }
  }, []);

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => $updateToolbar());
    });
  }, [editor, $updateToolbar]);

  useEffect(() => {
    return editor.registerCommand(
      CAN_UNDO_COMMAND,
      (payload) => {
        setCanUndo(payload);
        return false;
      },
      COMMAND_PRIORITY_CRITICAL
    );
  }, [editor]);

  useEffect(() => {
    return editor.registerCommand(
      CAN_REDO_COMMAND,
      (payload) => {
        setCanRedo(payload);
        return false;
      },
      COMMAND_PRIORITY_CRITICAL
    );
  }, [editor]);

  // ── Block format handlers ──

  const formatParagraph = () => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        $setBlocksType(selection, () => $createParagraphNode());
      }
    });
  };

  const formatHeading = (level: HeadingTagType) => {
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

  // ── Insert handlers ──

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
    const rows = prompt("Number of rows:", "3");
    const cols = prompt("Number of columns:", "3");
    if (!rows || !cols) return;
    const r = Math.min(Math.max(parseInt(rows) || 3, 1), 50);
    const c = Math.min(Math.max(parseInt(cols) || 3, 1), 20);
    editor.update(() => {
      const tableNode = $createTableNodeWithDimensions(r, c, true);
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
      {/* Undo/Redo */}
      <button
        disabled={!canUndo}
        onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)}
        title="Undo (Ctrl+Z)"
        className="toolbar-btn"
      >
        &#x21A9;
      </button>
      <button
        disabled={!canRedo}
        onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)}
        title="Redo (Ctrl+Y)"
        className="toolbar-btn"
      >
        &#x21AA;
      </button>
      <Divider />

      {/* Block Format Dropdown */}
      <DropDown
        buttonLabel={blockTypeToBlockName[blockType] || "Normal"}
        buttonClassName="toolbar-block-format"
        buttonTitle="Block format"
      >
        <DropDownItem onClick={formatParagraph} active={blockType === "paragraph"}>
          Normal
        </DropDownItem>
        <DropDownItem onClick={() => formatHeading("h1")} active={blockType === "h1"}>
          Heading 1
        </DropDownItem>
        <DropDownItem onClick={() => formatHeading("h2")} active={blockType === "h2"}>
          Heading 2
        </DropDownItem>
        <DropDownItem onClick={() => formatHeading("h3")} active={blockType === "h3"}>
          Heading 3
        </DropDownItem>
        <DropDownItem onClick={() => formatHeading("h4")} active={blockType === "h4"}>
          Heading 4
        </DropDownItem>
        <DropDownItem onClick={() => formatHeading("h5")} active={blockType === "h5"}>
          Heading 5
        </DropDownItem>
        <DropDownItem onClick={() => formatHeading("h6")} active={blockType === "h6"}>
          Heading 6
        </DropDownItem>
        <DropDownItem
          onClick={() => editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)}
          active={blockType === "bullet-list"}
        >
          Bullet List
        </DropDownItem>
        <DropDownItem
          onClick={() => editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)}
          active={blockType === "number-list"}
        >
          Numbered List
        </DropDownItem>
        <DropDownItem
          onClick={() => editor.dispatchCommand(INSERT_CHECK_LIST_COMMAND, undefined)}
          active={blockType === "check-list"}
        >
          Check List
        </DropDownItem>
        <DropDownItem onClick={formatQuote} active={blockType === "quote"}>
          Quote
        </DropDownItem>
        <DropDownItem onClick={formatCodeBlock} active={blockType === "code"}>
          Code Block
        </DropDownItem>
      </DropDown>
      <Divider />

      {/* Text Format Buttons */}
      <button
        className={`toolbar-btn ${isBold ? "active" : ""}`}
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold")}
        title="Bold (Ctrl+B)"
      >
        <strong>B</strong>
      </button>
      <button
        className={`toolbar-btn ${isItalic ? "active" : ""}`}
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic")}
        title="Italic (Ctrl+I)"
      >
        <em>I</em>
      </button>
      <button
        className={`toolbar-btn ${isStrikethrough ? "active" : ""}`}
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "strikethrough")}
        title="Strikethrough"
      >
        <span style={{ textDecoration: "line-through" }}>S</span>
      </button>
      <button
        className={`toolbar-btn ${isCode ? "active" : ""}`}
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "code")}
        title="Inline Code (Ctrl+Shift+K)"
      >
        {"</>"}
      </button>
      <button
        className={`toolbar-btn ${isLink ? "active" : ""}`}
        onClick={insertLink}
        title="Insert Link (Ctrl+K)"
      >
        Link
      </button>
      <Divider />

      {/* Insert Dropdown */}
      <DropDown
        buttonLabel="+ Insert"
        buttonTitle="Insert"
      >
        <DropDownItem onClick={() => editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined)}>
          Horizontal Rule
        </DropDownItem>
        <DropDownItem onClick={insertTable}>
          Table...
        </DropDownItem>
        <DropDownItem onClick={insertImage}>
          Image...
        </DropDownItem>
      </DropDown>
      <Divider />

      {/* Toggle buttons */}
      <button
        className={`toolbar-btn ${isFocusMode ? "active" : ""}`}
        onClick={onToggleFocusMode}
        title="Focus Mode (Ctrl+Shift+F)"
      >
        Focus
      </button>
      <button
        className={`toolbar-btn ${isSourceMode ? "active" : ""}`}
        onClick={onToggleSourceMode}
        title="View Markdown Source"
      >
        {"</>"}&#xFE0E; Src
      </button>
      <button
        className={`toolbar-btn ${isDiffMode ? "active" : ""}`}
        onClick={onToggleDiffMode}
        title="Diff View (Ctrl+D)"
      >
        Diff
      </button>
    </div>
  );
}
