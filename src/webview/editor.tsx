/**
 * MD Explorer - Full Lexical Playground for VS Code
 *
 * Wraps the Lexical Playground App component and adds:
 * - VS Code message passing (SyncPlugin)
 * - Markdown import/export (load .md → Lexical state, Lexical state → .md)
 * - Our custom markdown transformers (table pipe escaping, image balanced parens)
 * - DiffView and SourceMode from our original code
 */
import React, { useEffect, useRef, useState, useCallback } from "react";
import { createRoot } from "react-dom/client";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
} from "@lexical/markdown";
import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  $createParagraphNode,
  $createTextNode,
  $isParagraphNode,
  TextNode,
  LexicalNode,
  ElementNode,
} from "lexical";

// Import the playground app and transformers
import PlaygroundApp from "./playground/App";
import { PLAYGROUND_TRANSFORMERS } from "./playground/plugins/MarkdownTransformers";

// VS Code theme overrides — MUST be imported last to override all playground CSS
import "./vscode-theme-overrides.css";

// Our custom transformers that improve on the playground's defaults
import {
  $createTableCellNode,
  $createTableRowNode,
  $createTableNode,
  $isTableNode,
  $isTableRowNode,
  $isTableCellNode,
  TableCellHeaderStates,
  TableNode,
  TableRowNode,
  TableCellNode,
} from "@lexical/table";
import { ImageNode, $isImageNode, $createImageNode } from "./ImageNode";
import {
  escapeTableCell,
  unescapeTableCell,
  splitTableRow,
  parseTableDataRows,
} from "./tableUtils";
import { escapeImageAltText, unescapeImageAltText } from "./imageUtils";

// ── VS Code API ─────────────────────────────────────────────────

declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};
const vscode = acquireVsCodeApi();
(window as any).vscodeApi = vscode;

// ── Enhanced Markdown Transformers ──────────────────────────────
// Our transformers override the playground's basic table/image ones
// with better pipe escaping and balanced-paren image URLs.

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
      if (
        TABLE_ROW_REG_EXP.test(line) ||
        TABLE_ROW_DIVIDER_REG_EXP.test(line)
      ) {
        tableLines.push(line);
        endLineIndex = i;
      } else {
        break;
      }
    }

    if (tableLines.length < 2) return null;

    const dataRows = parseTableDataRows(
      tableLines,
      TABLE_ROW_REG_EXP,
      TABLE_ROW_DIVIDER_REG_EXP,
    );

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
  importRegExp:
    /!(?:\[((?:[^\]\\]|\\.)*)\])(?:\(((?:[^()]+|\([^()]*\))+)\))/,
  regExp:
    /!(?:\[((?:[^\]\\]|\\.)*)\])(?:\(((?:[^()]+|\([^()]*\))+)\))$/,
  replace: (textNode: TextNode, match: RegExpMatchArray) => {
    const [, altText, src] = match;
    const imageNode = $createImageNode(
      src,
      unescapeImageAltText(altText || ""),
    );
    textNode.replace(imageNode);
  },
  trigger: ")",
  type: "text-match" as const,
};

// Combine our custom transformers with the playground's,
// filtering out the playground's basic TABLE/IMAGE transformers
// since ours handle escaping better.
const COMBINED_TRANSFORMERS = [
  TABLE_TRANSFORMER,
  IMAGE_TRANSFORMER,
  ...PLAYGROUND_TRANSFORMERS.filter(
    (t: any) =>
      // Remove playground's basic table and image transformers
      !(t.type === "element" && t.dependencies?.includes(TableNode)) &&
      !(t.type === "text-match" && t.dependencies?.includes(ImageNode as any)),
  ),
];

// ── SyncPlugin: VS Code <-> Lexical ─────────────────────────────

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
            $convertFromMarkdownString(msg.text, COMBINED_TRANSFORMERS);
          },
          { tag: "external-update" },
        );

        if (restoreCursor && savedOffset > 0) {
          editor.update(() => {
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
          });
        }

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
            const markdown = $convertToMarkdownString(COMBINED_TRANSFORMERS);
            vscode.postMessage({ type: "edit", text: markdown });
          });
        }, 300);
      },
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
        { tag: "trailing-paragraph" },
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

// ── VS Code Integration Plugins ─────────────────────────────────
// These plugins are injected into the playground's editor context
// via a wrapper that renders them inside the LexicalComposer.

function VSCodePlugins() {
  return (
    <>
      <SyncPlugin />
      <TrailingParagraphPlugin />
      <ClickToEndPlugin />
    </>
  );
}

// Export for use in the playground's Editor component
(window as any).__vsCodePlugins = VSCodePlugins;

// ── Render ──────────────────────────────────────────────────────

// Signal ready to the extension host
vscode.postMessage({ type: "ready" });

const root = createRoot(document.getElementById("app")!);
root.render(<PlaygroundApp />);
