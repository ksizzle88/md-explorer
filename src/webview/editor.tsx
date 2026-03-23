/**
 * MD Explorer - Lexical Markdown Editor for VS Code
 *
 * Architecture ported from Lexical Playground (facebook/lexical).
 * Plugins are modular files in ./plugins/, keeping this file as a thin orchestrator.
 *
 * What we kept from our code:
 *   - VS Code integration (vscode API, SyncPlugin, SourceModePlugin)
 *   - Custom markdown transformers (table with pipe escaping, image with balanced parens)
 *   - VS Code CSS theming
 *   - ImageNode
 *
 * What we ported from the playground:
 *   - ToolbarPlugin with dropdown menus
 *   - FloatingTextFormatToolbarPlugin
 *   - ComponentPickerPlugin (enhanced slash commands)
 *   - CodeHighlightPlugin
 *   - DraggableBlockPlugin
 *   - MarkdownShortcutsPlugin (inline markdown shortcuts)
 *   - Modular plugin architecture
 */
import React, { useEffect, useCallback, useState, useRef } from "react";
import { createRoot } from "react-dom/client";

import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { CheckListPlugin } from "@lexical/react/LexicalCheckListPlugin";
import { TabIndentationPlugin } from "@lexical/react/LexicalTabIndentationPlugin";
import { TablePlugin } from "@lexical/react/LexicalTablePlugin";
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin";
import { HorizontalRulePlugin } from "@lexical/react/LexicalHorizontalRulePlugin";
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
  $createTableCellNode,
  $createTableRowNode,
  $createTableNode,
  $isTableNode,
  $isTableRowNode,
  $isTableCellNode,
  TableCellHeaderStates,
} from "@lexical/table";
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  TRANSFORMERS,
} from "@lexical/markdown";

import {
  $getRoot,
  $createParagraphNode,
  $createTextNode,
  $isParagraphNode,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  TextNode,
  LexicalNode,
  ElementNode,
} from "lexical";

import { ImageNode, $isImageNode, $createImageNode } from "./ImageNode";
import { escapeTableCell, unescapeTableCell, splitTableRow, parseTableDataRows } from "./tableUtils";
import { escapeImageAltText, unescapeImageAltText } from "./imageUtils";

// Plugins (ported from Lexical Playground + our originals)
import ToolbarPlugin from "./plugins/ToolbarPlugin";
import FloatingTextFormatToolbarPlugin from "./plugins/FloatingTextFormatToolbarPlugin";
import ComponentPickerPlugin from "./plugins/ComponentPickerPlugin";
import CodeHighlightPlugin from "./plugins/CodeHighlightPlugin";
import CodeBlockBehaviorPlugin from "./plugins/CodeBlockBehaviorPlugin";
import KeyboardShortcutsPlugin from "./plugins/KeyboardShortcutsPlugin";
import TableContextMenuPlugin from "./plugins/TableContextMenuPlugin";
import DraggableBlockPlugin from "./plugins/DraggableBlockPlugin";
import DiffViewPlugin from "./plugins/DiffViewPlugin";

// ── VS Code API ─────────────────────────────────────────────────

declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};
const vscode = acquireVsCodeApi();
(window as any).vscodeApi = vscode;

// ── Custom Markdown Transformers ────────────────────────────────

const TABLE_ROW_REG_EXP = /^(?:\|)(.+)(?:\|)\s*$/;
const TABLE_ROW_DIVIDER_REG_EXP = /^(\| ?:?-+:? ?)+\|\s*$/;

const TABLE_TRANSFORMER = {
  dependencies: [TableNode, TableRowNode, TableCellNode],
  export: (node: LexicalNode) => {
    if (!$isTableNode(node)) return null;
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
        const text = cell.getTextContent().replace(/\n/g, " ").trim();
        cellTexts.push(escapeTableCell(text) || " ");
      }

      output.push("| " + cellTexts.join(" | ") + " |");

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

    const dataRows = parseTableDataRows(tableLines, TABLE_ROW_REG_EXP, TABLE_ROW_DIVIDER_REG_EXP);

    if (dataRows.length === 0) return null;

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
  regExpEnd: { optional: true, regExp: TABLE_ROW_REG_EXP },
  regExpStart: TABLE_ROW_REG_EXP,
  replace: () => {},
  type: "multiline-element" as const,
};

const IMAGE_TRANSFORMER = {
  dependencies: [ImageNode],
  export: (node: LexicalNode) => {
    if (!$isImageNode(node)) return null;
    return `![${escapeImageAltText(node.getAltText())}](${node.getSrc()})`;
  },
  importRegExp: /!(?:\[((?:[^\]\\]|\\.)*)\])(?:\(((?:[^()]+|\([^()]*\))+)\))/,
  regExp: /!(?:\[((?:[^\]\\]|\\.)*)\])(?:\(((?:[^()]+|\([^()]*\))+)\))$/,
  replace: (textNode: TextNode, match: RegExpMatchArray) => {
    const [, altText, src] = match;
    const imageNode = $createImageNode(src, unescapeImageAltText(altText || ""));
    textNode.replace(imageNode);
  },
  trigger: ")",
  type: "text-match" as const,
};

const ALL_TRANSFORMERS = [TABLE_TRANSFORMER, IMAGE_TRANSFORMER, ...TRANSFORMERS];

// ── Sync Plugin: VS Code <-> Lexical ────────────────────────────

function SyncPlugin() {
  const [editor] = useLexicalComposerContext();
  const isFirstUpdate = useRef(true);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (msg.type === "update") {
        const restoreCursor = !isFirstUpdate.current;
        let savedOffset = 0;

        if (restoreCursor) {
          editor.getEditorState().read(() => {
            const selection = $getSelection();
            if ($isRangeSelection(selection)) {
              const anchor = selection.anchor;
              const anchorNode = anchor.getNode();
              const root = $getRoot();
              const allText = root.getTextContent();
              const nodeText = anchorNode.getTextContent();
              const nodeStart = allText.indexOf(nodeText);
              if (nodeStart !== -1) {
                savedOffset = nodeStart + anchor.offset;
              }
            }
          });
        }

        editor.update(
          () => {
            const root = $getRoot();
            root.clear();
            $convertFromMarkdownString(msg.text, ALL_TRANSFORMERS);

            if (restoreCursor && savedOffset > 0) {
              const allNodes: TextNode[] = [];
              const collectTextNodes = (node: LexicalNode) => {
                if ($isTextNode(node)) {
                  allNodes.push(node);
                } else if (
                  "getChildren" in node &&
                  typeof (node as ElementNode).getChildren === "function"
                ) {
                  (node as ElementNode).getChildren().forEach(collectTextNodes);
                }
              };
              collectTextNodes($getRoot());

              let currentOffset = 0;
              for (const textNode of allNodes) {
                const len = textNode.getTextContent().length;
                if (currentOffset + len >= savedOffset) {
                  const offsetInNode = savedOffset - currentOffset;
                  textNode.select(offsetInNode, offsetInNode);
                  return;
                }
                currentOffset += len;
              }
              const lastChild = $getRoot().getLastChild();
              if (lastChild) lastChild.selectEnd();
            }
          },
          { tag: "external-update" }
        );

        isFirstUpdate.current = false;
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [editor]);

  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout>;
    const removeListener = editor.registerUpdateListener(
      ({ editorState, tags }) => {
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

// ── Trailing Paragraph Plugin ───────────────────────────────────

function TrailingParagraphPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerUpdateListener(({ tags }) => {
      if (tags.has("external-update")) return;
      editor.update(
        () => {
          const root = $getRoot();
          const lastChild = root.getLastChild();
          if (!lastChild || !$isParagraphNode(lastChild)) {
            root.append($createParagraphNode());
          }
        },
        { tag: "trailing-paragraph" }
      );
    });
  }, [editor]);

  return null;
}

// ── Click-to-End Plugin ─────────────────────────────────────────

function ClickToEndPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const editorShell = editor.getRootElement()?.parentElement;
    if (!editorShell) return;

    let shell: HTMLElement | null = editorShell;
    while (shell && !shell.classList.contains("editor-shell")) {
      shell = shell.parentElement;
    }
    if (!shell) return;

    const handleClick = (event: MouseEvent) => {
      const root = editor.getRootElement();
      if (!root) return;
      if (root.contains(event.target as Node)) return;
      const rootRect = root.getBoundingClientRect();
      if (event.clientY > rootRect.bottom) {
        editor.update(() => {
          const rootNode = $getRoot();
          const lastChild = rootNode.getLastChild();
          if (lastChild) lastChild.selectEnd();
        });
        root.focus();
      }
    };

    shell.addEventListener("click", handleClick);
    return () => shell!.removeEventListener("click", handleClick);
  }, [editor]);

  return null;
}

// ── Focus Mode Plugin ───────────────────────────────────────────

function FocusModePlugin({
  isActive,
  onToggle,
}: {
  isActive: boolean;
  onToggle: () => void;
}) {
  const [editor] = useLexicalComposerContext();

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

  useEffect(() => {
    const root = editor.getRootElement();
    if (!root) return;

    if (isActive) {
      root.classList.add("focus-mode");
    } else {
      root.classList.remove("focus-mode");
      root.querySelectorAll(".focus-active").forEach((el) => {
        el.classList.remove("focus-active");
      });
      return;
    }

    const removeListener = editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const selection = $getSelection();
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
          if (dom) dom.classList.add("focus-active");
        }
      });
    });

    return () => {
      removeListener();
      root.querySelectorAll(".focus-active").forEach((el) => {
        el.classList.remove("focus-active");
      });
    };
  }, [editor, isActive]);

  return null;
}

// ── Source Mode Plugin ──────────────────────────────────────────

function SourceModePlugin({
  isSourceMode,
  sourceText,
  onSourceTextChange,
}: {
  isSourceMode: boolean;
  sourceText: string;
  onSourceTextChange: (text: string) => void;
}) {
  const [editor] = useLexicalComposerContext();
  const prevSourceMode = useRef(isSourceMode);

  useEffect(() => {
    const wasSource = prevSourceMode.current;
    prevSourceMode.current = isSourceMode;

    if (isSourceMode && !wasSource) {
      editor.getEditorState().read(() => {
        const markdown = $convertToMarkdownString(ALL_TRANSFORMERS);
        onSourceTextChange(markdown);
      });
    } else if (!isSourceMode && wasSource) {
      editor.update(
        () => {
          const root = $getRoot();
          root.clear();
          $convertFromMarkdownString(sourceText, ALL_TRANSFORMERS);
        },
        { tag: "external-update" }
      );
      vscode.postMessage({ type: "edit", text: sourceText });
    }
  }, [isSourceMode]);

  useEffect(() => {
    if (!isSourceMode) return;
    const timer = setTimeout(() => {
      vscode.postMessage({ type: "edit", text: sourceText });
    }, 300);
    return () => clearTimeout(timer);
  }, [sourceText, isSourceMode]);

  return null;
}

// ── Editor Theme ────────────────────────────────────────────────

const editorTheme = {
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
  code: "editor-code-block",
  codeHighlight: {
    atrule: "editor-tokenAttr",
    attr: "editor-tokenAttr",
    boolean: "editor-tokenProperty",
    builtin: "editor-tokenSelector",
    cdata: "editor-tokenComment",
    char: "editor-tokenSelector",
    class: "editor-tokenFunction",
    "class-name": "editor-tokenFunction",
    comment: "editor-tokenComment",
    constant: "editor-tokenProperty",
    deleted: "editor-tokenProperty",
    doctype: "editor-tokenComment",
    entity: "editor-tokenOperator",
    function: "editor-tokenFunction",
    important: "editor-tokenVariable",
    inserted: "editor-tokenSelector",
    keyword: "editor-tokenAttr",
    namespace: "editor-tokenVariable",
    number: "editor-tokenProperty",
    operator: "editor-tokenOperator",
    prolog: "editor-tokenComment",
    property: "editor-tokenProperty",
    punctuation: "editor-tokenPunctuation",
    regex: "editor-tokenVariable",
    selector: "editor-tokenSelector",
    string: "editor-tokenSelector",
    symbol: "editor-tokenProperty",
    tag: "editor-tokenProperty",
    url: "editor-tokenOperator",
    variable: "editor-tokenVariable",
  },
  list: {
    listitem: "editor-listitem",
    listitemChecked: "editor-listitem-checked",
    listitemUnchecked: "editor-listitem-unchecked",
    nested: {
      listitem: "editor-nested-listitem",
    },
  },
  table: "editor-table",
  tableCell: "editor-table-cell",
  tableCellHeader: "editor-table-cell-header",
  tableCellSelected: "editor-table-cell-selected",
  tableRow: "editor-table-row",
  tableSelection: "editor-table-selection",
};

// ── Editor Config ───────────────────────────────────────────────

const editorConfig = {
  namespace: "MarkdownEditor",
  theme: editorTheme,
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

// ── Main Editor Component ───────────────────────────────────────

function Editor() {
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [isSourceMode, setIsSourceMode] = useState(false);
  const [isDiffMode, setIsDiffMode] = useState(false);
  const [sourceText, setSourceText] = useState("");
  const [diffCurrentText, setDiffCurrentText] = useState("");
  const [floatingAnchorElem, setFloatingAnchorElem] =
    useState<HTMLDivElement | null>(null);

  const toggleFocusMode = useCallback(
    () => setIsFocusMode((prev) => !prev),
    []
  );
  const toggleSourceMode = useCallback(
    () => setIsSourceMode((prev) => !prev),
    []
  );
  const toggleDiffMode = useCallback(
    () => setIsDiffMode((prev) => !prev),
    []
  );
  const closeDiffMode = useCallback(
    () => setIsDiffMode(false),
    []
  );

  const onRef = useCallback((elem: HTMLDivElement | null) => {
    if (elem !== null) {
      setFloatingAnchorElem(elem);
    }
  }, []);

  return (
    <LexicalComposer initialConfig={editorConfig}>
      <ToolbarPlugin
        isFocusMode={isFocusMode}
        onToggleFocusMode={toggleFocusMode}
        isSourceMode={isSourceMode}
        onToggleSourceMode={toggleSourceMode}
        isDiffMode={isDiffMode}
        onToggleDiffMode={toggleDiffMode}
      />
      <SourceModePlugin
        isSourceMode={isSourceMode}
        sourceText={sourceText}
        onSourceTextChange={setSourceText}
      />
      {isSourceMode ? (
        <div className="editor-shell">
          <div className="editor-content-area">
            <textarea
              className="source-textarea"
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
              spellCheck={false}
            />
          </div>
        </div>
      ) : (
        <div className="editor-shell">
          <div className="editor-content-area" ref={onRef}>
            <RichTextPlugin
              contentEditable={<ContentEditable />}
              ErrorBoundary={LexicalErrorBoundary}
            />
            <HistoryPlugin />
            <ListPlugin />
            <CheckListPlugin />
            <LinkPlugin />
            <HorizontalRulePlugin />
            <TablePlugin hasTabHandler={true} />
            <TabIndentationPlugin />
            <MarkdownShortcutPlugin transformers={TRANSFORMERS} />
            <KeyboardShortcutsPlugin />
            <CodeHighlightPlugin />
            <CodeBlockBehaviorPlugin />
            <FocusModePlugin
              isActive={isFocusMode}
              onToggle={toggleFocusMode}
            />
            <TableContextMenuPlugin />
            <ComponentPickerPlugin />
            <SyncPlugin />
            <TrailingParagraphPlugin />
            <ClickToEndPlugin />
            <DraggableBlockPlugin />
            {floatingAnchorElem && (
              <FloatingTextFormatToolbarPlugin
                anchorElem={floatingAnchorElem}
              />
            )}
          </div>
        </div>
      )}
      <DiffCapturePlugin isDiffMode={isDiffMode} onCapture={setDiffCurrentText} />
      <DiffKeyboardPlugin onToggle={toggleDiffMode} />
      {isDiffMode && (
        <DiffViewPlugin
          isActive={isDiffMode}
          currentText={diffCurrentText}
          onClose={closeDiffMode}
        />
      )}
    </LexicalComposer>
  );
}

// ── Diff Capture Plugin ─────────────────────────────────────
// Captures current markdown text when diff mode is toggled on

function DiffCapturePlugin({
  isDiffMode,
  onCapture,
}: {
  isDiffMode: boolean;
  onCapture: (text: string) => void;
}) {
  const [editor] = useLexicalComposerContext();
  const prevDiffMode = useRef(false);

  useEffect(() => {
    if (isDiffMode && !prevDiffMode.current) {
      editor.getEditorState().read(() => {
        const markdown = $convertToMarkdownString(ALL_TRANSFORMERS);
        onCapture(markdown);
      });
    }
    prevDiffMode.current = isDiffMode;
  }, [isDiffMode, editor, onCapture]);

  return null;
}

// ── Diff Keyboard Plugin ────────────────────────────────────
// Handles Ctrl+D shortcut to toggle diff view

function DiffKeyboardPlugin({ onToggle }: { onToggle: () => void }) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const root = editor.getRootElement();
    if (!root) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const isCtrl = event.ctrlKey || event.metaKey;
      if (isCtrl && event.key === "d") {
        event.preventDefault();
        onToggle();
      }
    };
    root.addEventListener("keydown", handleKeyDown);
    return () => root.removeEventListener("keydown", handleKeyDown);
  }, [editor, onToggle]);

  return null;
}

// ── Mount ───────────────────────────────────────────────────────

const container = document.getElementById("app");
if (container) {
  const root = createRoot(container);
  root.render(<Editor />);
}

vscode.postMessage({ type: "ready" });
