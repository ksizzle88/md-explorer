import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  DecoratorNode,
  DOMConversionMap,
  DOMExportOutput,
  LexicalEditor,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  Spread,
  $getNodeByKey,
  $getSelection,
  $isRangeSelection,
  CLICK_COMMAND,
  COMMAND_PRIORITY_LOW,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
} from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";

export type SerializedImageNode = Spread<
  { src: string; altText: string },
  SerializedLexicalNode
>;

export class ImageNode extends DecoratorNode<React.ReactElement> {
  __src: string;
  __altText: string;

  static getType(): string {
    return "image";
  }

  static clone(node: ImageNode): ImageNode {
    return new ImageNode(node.__src, node.__altText, node.__key);
  }

  constructor(src: string, altText: string, key?: NodeKey) {
    super(key);
    this.__src = src;
    this.__altText = altText;
  }

  createDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "editor-image-wrapper";
    return span;
  }

  updateDOM(): false {
    return false;
  }

  exportDOM(): DOMExportOutput {
    const img = document.createElement("img");
    img.setAttribute("src", this.__src);
    img.setAttribute("alt", this.__altText);
    return { element: img };
  }

  static importJSON(serializedNode: SerializedImageNode): ImageNode {
    return $createImageNode(serializedNode.src, serializedNode.altText);
  }

  exportJSON(): SerializedImageNode {
    return {
      type: "image",
      version: 1,
      src: this.__src,
      altText: this.__altText,
    };
  }

  getSrc(): string {
    return this.__src;
  }

  getAltText(): string {
    return this.__altText;
  }

  setSrc(src: string): void {
    const writable = this.getWritable();
    writable.__src = src;
  }

  setAltText(altText: string): void {
    const writable = this.getWritable();
    writable.__altText = altText;
  }

  decorate(): React.ReactElement {
    return (
      <ImageComponent
        src={this.__src}
        altText={this.__altText}
        nodeKey={this.__key}
      />
    );
  }

  isInline(): boolean {
    return false;
  }

  getTextContent(): string {
    return "";
  }
}

export function $createImageNode(src: string, altText: string): ImageNode {
  return new ImageNode(src, altText);
}

export function $isImageNode(node: LexicalNode | null | undefined): node is ImageNode {
  return node instanceof ImageNode;
}

// ── Image Component ──────────────────────────────────────────────

function ImageComponent({
  src,
  altText,
  nodeKey,
}: {
  src: string;
  altText: string;
  nodeKey: NodeKey;
}) {
  const [editor] = useLexicalComposerContext();
  const [isSelected, setIsSelected] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editSrc, setEditSrc] = useState(src);
  const [editAlt, setEditAlt] = useState(altText);
  const imageRef = useRef<HTMLImageElement>(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const unregister = editor.registerCommand(
      CLICK_COMMAND,
      (event: MouseEvent) => {
        if (imageRef.current && imageRef.current.contains(event.target as Node)) {
          setIsSelected(true);
          return true;
        }
        setIsSelected(false);
        setIsEditing(false);
        return false;
      },
      COMMAND_PRIORITY_LOW
    );
    return unregister;
  }, [editor]);

  useEffect(() => {
    if (!isSelected) return;
    const unregisterBackspace = editor.registerCommand(
      KEY_BACKSPACE_COMMAND,
      () => {
        editor.update(() => {
          const node = $getNodeByKey(nodeKey);
          if (node) node.remove();
        });
        return true;
      },
      COMMAND_PRIORITY_LOW
    );
    const unregisterDelete = editor.registerCommand(
      KEY_DELETE_COMMAND,
      () => {
        editor.update(() => {
          const node = $getNodeByKey(nodeKey);
          if (node) node.remove();
        });
        return true;
      },
      COMMAND_PRIORITY_LOW
    );
    return () => {
      unregisterBackspace();
      unregisterDelete();
    };
  }, [editor, isSelected, nodeKey]);

  const handleDoubleClick = useCallback(() => {
    setIsEditing(true);
    setEditSrc(src);
    setEditAlt(altText);
  }, [src, altText]);

  const handleSave = useCallback(() => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if ($isImageNode(node)) {
        node.setSrc(editSrc);
        node.setAltText(editAlt);
      }
    });
    setIsEditing(false);
  }, [editor, nodeKey, editSrc, editAlt]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSave();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setIsEditing(false);
      }
    },
    [handleSave]
  );

  if (isEditing) {
    return (
      <div className="image-edit-form" onClick={(e) => e.stopPropagation()}>
        <label>
          URL:
          <input
            type="text"
            value={editSrc}
            onChange={(e) => setEditSrc(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
          />
        </label>
        <label>
          Alt text:
          <input
            type="text"
            value={editAlt}
            onChange={(e) => setEditAlt(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </label>
        <div className="image-edit-buttons">
          <button onClick={handleSave}>Save</button>
          <button onClick={() => setIsEditing(false)}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`editor-image ${isSelected ? "selected" : ""}`}
      onDoubleClick={handleDoubleClick}
    >
      {hasError ? (
        <div className="image-error">
          Image failed to load: {src}
        </div>
      ) : (
        <img
          ref={imageRef}
          src={src}
          alt={altText}
          draggable={false}
          onError={() => setHasError(true)}
        />
      )}
      {altText && <span className="image-alt-text">{altText}</span>}
    </div>
  );
}
