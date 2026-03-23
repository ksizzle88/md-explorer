/**
 * Ported from Lexical Playground: ComponentPickerPlugin (slash commands).
 * Type "/" to open a searchable command palette.
 */
import React, { useCallback, useEffect, useState, useRef } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  $getRoot,
  $createParagraphNode,
  COMMAND_PRIORITY_HIGH,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
  LexicalEditor,
  TextNode,
} from "lexical";
import { $createHeadingNode, $createQuoteNode } from "@lexical/rich-text";
import { $setBlocksType } from "@lexical/selection";
import { $createCodeNode } from "@lexical/code";
import {
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  INSERT_CHECK_LIST_COMMAND,
} from "@lexical/list";
import { INSERT_HORIZONTAL_RULE_COMMAND } from "@lexical/react/LexicalHorizontalRuleNode";
import { $createTableNodeWithDimensions } from "@lexical/table";
import { $createImageNode } from "../ImageNode";

interface ComponentPickerOption {
  label: string;
  description: string;
  icon: string;
  keywords: string[];
  action: (editor: LexicalEditor) => void;
}

const COMPONENT_PICKER_OPTIONS: ComponentPickerOption[] = [
  {
    label: "Heading 1",
    description: "Large heading",
    icon: "H1",
    keywords: ["heading", "h1", "title", "large"],
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
    keywords: ["heading", "h2", "subtitle", "medium"],
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
    keywords: ["heading", "h3", "small"],
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
    icon: "\u2022",
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
    label: "Check List",
    description: "Todo list with checkboxes",
    icon: "\u2611",
    keywords: ["check", "todo", "task", "checkbox"],
    action: (editor) => {
      editor.dispatchCommand(INSERT_CHECK_LIST_COMMAND, undefined);
    },
  },
  {
    label: "Table",
    description: "Insert a table",
    icon: "\u229E",
    keywords: ["table", "grid"],
    action: (editor) => {
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
    icon: "\u275D",
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
    icon: "\u2015",
    keywords: ["horizontal", "rule", "divider", "hr", "line"],
    action: (editor) => {
      editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined);
    },
  },
  {
    label: "Image",
    description: "Insert an image from URL",
    icon: "\uD83D\uDDBC",
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

export default function ComponentPickerPlugin() {
  const [editor] = useLexicalComposerContext();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const menuRef = useRef<HTMLDivElement>(null);

  const filteredItems = COMPONENT_PICKER_OPTIONS.filter((item) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      item.label.toLowerCase().includes(q) ||
      item.keywords.some((kw) => kw.includes(q))
    );
  });

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    if (!isOpen || !menuRef.current) return;
    const selected = menuRef.current.querySelector(".slash-menu-item.selected");
    if (selected) {
      selected.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex, isOpen]);

  const removeSlashText = useCallback(() => {
    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      const node = selection.anchor.getNode();
      if ($isTextNode(node)) {
        const text = node.getTextContent();
        const slashIndex = text.lastIndexOf("/");
        if (slashIndex !== -1) {
          if (slashIndex === 0) {
            node.setTextContent("");
          } else {
            node.setTextContent(text.substring(0, slashIndex));
          }
          node.selectEnd();
        }
      }
    });
  }, [editor]);

  const executeCommand = useCallback(
    (item: ComponentPickerOption) => {
      removeSlashText();
      setIsOpen(false);
      setQuery("");
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
        const slashMatch = textBeforeCursor.match(/(?:^|\s)\/([a-zA-Z0-9 ]*)$/);

        if (slashMatch) {
          setQuery(slashMatch[1]);
          if (!isOpen) {
            const domSelection = window.getSelection();
            if (domSelection && domSelection.rangeCount > 0) {
              const range = domSelection.getRangeAt(0);
              const rect = range.getBoundingClientRect();
              setMenuPosition({ x: rect.left, y: rect.bottom + 4 });
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
          className={`slash-menu-item ${
            index === selectedIndex ? "selected" : ""
          }`}
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
