/**
 * Ported from Lexical Playground: FloatingTextFormatToolbarPlugin
 * Shows a floating toolbar when text is selected with formatting options.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getSelection,
  $isRangeSelection,
  FORMAT_TEXT_COMMAND,
  LexicalEditor,
  TextFormatType,
} from "lexical";
import { $isLinkNode, TOGGLE_LINK_COMMAND } from "@lexical/link";
import { $isCodeHighlightNode } from "@lexical/code";
import { computePosition, flip, shift, offset } from "@floating-ui/dom";

function TextFormatFloatingToolbar({
  editor,
  anchorElem,
  isBold,
  isItalic,
  isStrikethrough,
  isCode,
  isLink,
}: {
  editor: LexicalEditor;
  anchorElem: HTMLElement;
  isBold: boolean;
  isItalic: boolean;
  isStrikethrough: boolean;
  isCode: boolean;
  isLink: boolean;
}) {
  const popupRef = useRef<HTMLDivElement>(null);

  const updatePosition = useCallback(() => {
    const nativeSelection = window.getSelection();
    const popupElem = popupRef.current;
    if (!nativeSelection || nativeSelection.rangeCount === 0 || !popupElem) return;

    const range = nativeSelection.getRangeAt(0);
    const virtualEl = {
      getBoundingClientRect: () => range.getBoundingClientRect(),
    };

    computePosition(virtualEl as Element, popupElem, {
      placement: "top",
      middleware: [offset(8), flip(), shift({ padding: 8 })],
    }).then(({ x, y }) => {
      popupElem.style.left = `${x}px`;
      popupElem.style.top = `${y}px`;
    });
  }, []);

  useEffect(() => {
    updatePosition();
    const scrollHandler = () => updatePosition();
    const resizeHandler = () => updatePosition();
    const shell = anchorElem.closest(".editor-shell");
    if (shell) {
      shell.addEventListener("scroll", scrollHandler);
    }
    window.addEventListener("resize", resizeHandler);
    return () => {
      if (shell) shell.removeEventListener("scroll", scrollHandler);
      window.removeEventListener("resize", resizeHandler);
    };
  }, [anchorElem, updatePosition]);

  const formatText = (format: TextFormatType) => {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, format);
  };

  const insertLink = () => {
    if (isLink) {
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
    } else {
      const url = prompt("Enter URL:");
      if (url) {
        editor.dispatchCommand(TOGGLE_LINK_COMMAND, url);
      }
    }
  };

  return (
    <div ref={popupRef} className="floating-text-format-popup">
      <button
        className={`popup-item ${isBold ? "active" : ""}`}
        onClick={() => formatText("bold")}
        title="Bold (Ctrl+B)"
        aria-label="Format text as bold"
      >
        <strong>B</strong>
      </button>
      <button
        className={`popup-item ${isItalic ? "active" : ""}`}
        onClick={() => formatText("italic")}
        title="Italic (Ctrl+I)"
        aria-label="Format text as italic"
      >
        <em>I</em>
      </button>
      <button
        className={`popup-item ${isStrikethrough ? "active" : ""}`}
        onClick={() => formatText("strikethrough")}
        title="Strikethrough"
        aria-label="Format text with strikethrough"
      >
        <span style={{ textDecoration: "line-through" }}>S</span>
      </button>
      <button
        className={`popup-item ${isCode ? "active" : ""}`}
        onClick={() => formatText("code")}
        title="Inline Code"
        aria-label="Format text as code"
      >
        {"</>"}
      </button>
      <button
        className={`popup-item ${isLink ? "active" : ""}`}
        onClick={insertLink}
        title="Link (Ctrl+K)"
        aria-label="Insert link"
      >
        Link
      </button>
    </div>
  );
}

function useFloatingTextFormatToolbar(
  editor: LexicalEditor,
  anchorElem: HTMLElement
) {
  const [isText, setIsText] = useState(false);
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isStrikethrough, setIsStrikethrough] = useState(false);
  const [isCode, setIsCode] = useState(false);
  const [isLink, setIsLink] = useState(false);

  const updatePopup = useCallback(() => {
    editor.getEditorState().read(() => {
      if (editor.isComposing()) return;

      const selection = $getSelection();
      const nativeSelection = window.getSelection();

      if (!$isRangeSelection(selection) || !nativeSelection || nativeSelection.isCollapsed) {
        setIsText(false);
        return;
      }

      const node = selection.anchor.getNode();
      if ($isCodeHighlightNode(node)) {
        setIsText(false);
        return;
      }

      // Check selection has text content
      if (selection.getTextContent().trim() === "") {
        setIsText(false);
        return;
      }

      setIsBold(selection.hasFormat("bold"));
      setIsItalic(selection.hasFormat("italic"));
      setIsStrikethrough(selection.hasFormat("strikethrough"));
      setIsCode(selection.hasFormat("code"));

      const parent = node.getParent();
      setIsLink($isLinkNode(parent) || $isLinkNode(node));
      setIsText(true);
    });
  }, [editor]);

  useEffect(() => {
    document.addEventListener("selectionchange", updatePopup);
    return () => document.removeEventListener("selectionchange", updatePopup);
  }, [updatePopup]);

  useEffect(() => {
    return editor.registerUpdateListener(() => updatePopup());
  }, [editor, updatePopup]);

  if (!isText) return null;

  return (
    <TextFormatFloatingToolbar
      editor={editor}
      anchorElem={anchorElem}
      isBold={isBold}
      isItalic={isItalic}
      isStrikethrough={isStrikethrough}
      isCode={isCode}
      isLink={isLink}
    />
  );
}

export default function FloatingTextFormatToolbarPlugin({
  anchorElem,
}: {
  anchorElem: HTMLElement;
}): React.ReactElement | null {
  const [editor] = useLexicalComposerContext();
  return useFloatingTextFormatToolbar(editor, anchorElem);
}
