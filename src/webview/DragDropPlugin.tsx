import { useEffect, useRef, useCallback } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getRoot,
  $getNodeByKey,
  LexicalEditor,
  ElementNode,
} from "lexical";

// ── Helpers ──────────────────────────────────────────────────────

/** Find the top-level block DOM element from an arbitrary target */
function getTopLevelBlockElement(
  target: HTMLElement,
  editorRoot: HTMLElement
): HTMLElement | null {
  let el: HTMLElement | null = target;
  while (el && el.parentElement !== editorRoot) {
    el = el.parentElement;
  }
  return el && el.parentElement === editorRoot ? el : null;
}

/** Get the Lexical node key from a DOM element rendered by Lexical */
function getNodeKeyFromDOM(el: HTMLElement): string | null {
  // Lexical stores the key in a __lexicalKey_* property or data-lexical-node attribute
  // The most reliable way is the internal property
  const keys = Object.keys(el);
  for (const key of keys) {
    if (key.startsWith("__lexicalKey")) {
      return (el as any)[key] as string;
    }
  }
  return null;
}

// ── Plugin ───────────────────────────────────────────────────────

export default function DragDropPlugin(): null {
  const [editor] = useLexicalComposerContext();
  const dragHandleRef = useRef<HTMLDivElement | null>(null);
  const dropIndicatorRef = useRef<HTMLDivElement | null>(null);
  const draggedKeyRef = useRef<string | null>(null);
  const activeBlockRef = useRef<HTMLElement | null>(null);
  const isDraggingRef = useRef(false);

  const getEditorRoot = useCallback((): HTMLElement | null => {
    return editor.getRootElement();
  }, [editor]);

  useEffect(() => {
    const root = getEditorRoot();
    if (!root) return;

    const editorShell = root.closest(".editor-content-area") as HTMLElement;
    if (!editorShell) return;

    // Create drag handle
    const handle = document.createElement("div");
    handle.className = "drag-handle";
    handle.setAttribute("draggable", "true");
    handle.innerHTML = "⠿";
    handle.style.display = "none";
    editorShell.appendChild(handle);
    dragHandleRef.current = handle;

    // Create drop indicator
    const indicator = document.createElement("div");
    indicator.className = "drop-indicator";
    indicator.style.display = "none";
    editorShell.appendChild(indicator);
    dropIndicatorRef.current = indicator;

    // ── Show/hide handle on mouse move ──

    const onMouseMove = (e: MouseEvent) => {
      if (isDraggingRef.current) return;

      const target = e.target as HTMLElement;
      const block = getTopLevelBlockElement(target, root);

      if (!block) {
        handle.style.display = "none";
        activeBlockRef.current = null;
        return;
      }

      // Check if mouse is in the left gutter region
      const rootRect = root.getBoundingClientRect();
      const blockRect = block.getBoundingClientRect();
      const isInGutter = e.clientX < rootRect.left + 40;
      const isNearLeftEdge = e.clientX < blockRect.left + 8;

      if (!isInGutter && !isNearLeftEdge) {
        // Also show when hovering near the handle itself
        const handleRect = handle.getBoundingClientRect();
        const isOnHandle =
          e.clientX >= handleRect.left - 4 &&
          e.clientX <= handleRect.right + 4 &&
          e.clientY >= handleRect.top - 4 &&
          e.clientY <= handleRect.bottom + 4;
        if (!isOnHandle) {
          handle.style.display = "none";
          activeBlockRef.current = null;
          return;
        }
      }

      activeBlockRef.current = block;
      const key = getNodeKeyFromDOM(block);
      if (!key) {
        handle.style.display = "none";
        return;
      }

      // Position the handle to the left of the block
      const shellRect = editorShell.getBoundingClientRect();
      const top = blockRect.top - shellRect.top + editorShell.scrollTop;
      handle.style.display = "flex";
      handle.style.top = `${top}px`;
      handle.style.left = `${blockRect.left - shellRect.left - 28}px`;
      handle.dataset.nodeKey = key;
    };

    const onMouseLeave = () => {
      if (!isDraggingRef.current) {
        handle.style.display = "none";
        activeBlockRef.current = null;
      }
    };

    // ── Drag events ──

    const onDragStart = (e: DragEvent) => {
      const key = handle.dataset.nodeKey;
      if (!key) {
        e.preventDefault();
        return;
      }

      isDraggingRef.current = true;
      draggedKeyRef.current = key;
      e.dataTransfer!.effectAllowed = "move";
      e.dataTransfer!.setData("text/plain", key);

      // Dim the source block
      const block = activeBlockRef.current;
      if (block) {
        block.style.opacity = "0.3";
      }

      // Create ghost image
      if (block) {
        const ghost = block.cloneNode(true) as HTMLElement;
        ghost.style.position = "absolute";
        ghost.style.top = "-9999px";
        ghost.style.opacity = "0.7";
        ghost.style.maxHeight = "200px";
        ghost.style.overflow = "hidden";
        ghost.style.borderRadius = "4px";
        ghost.style.width = `${block.offsetWidth}px`;
        document.body.appendChild(ghost);
        e.dataTransfer!.setDragImage(ghost, 20, 20);
        requestAnimationFrame(() => ghost.remove());
      }

      handle.style.display = "none";
    };

    const onDragOver = (e: DragEvent) => {
      if (!isDraggingRef.current) return;
      e.preventDefault();
      e.dataTransfer!.dropEffect = "move";

      // Find the block we're hovering over
      const target = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement;
      if (!target) return;

      const block = getTopLevelBlockElement(target, root);
      if (!block) {
        indicator.style.display = "none";
        return;
      }

      const blockKey = getNodeKeyFromDOM(block);
      if (blockKey === draggedKeyRef.current) {
        indicator.style.display = "none";
        return;
      }

      // Show drop indicator above or below the block
      const blockRect = block.getBoundingClientRect();
      const shellRect = editorShell.getBoundingClientRect();
      const midY = blockRect.top + blockRect.height / 2;
      const insertBefore = e.clientY < midY;

      const indicatorTop = insertBefore
        ? blockRect.top - shellRect.top + editorShell.scrollTop - 1
        : blockRect.bottom - shellRect.top + editorShell.scrollTop - 1;

      indicator.style.display = "block";
      indicator.style.top = `${indicatorTop}px`;
      indicator.dataset.targetKey = blockKey || "";
      indicator.dataset.position = insertBefore ? "before" : "after";
    };

    const onDragEnd = (e: DragEvent) => {
      isDraggingRef.current = false;
      indicator.style.display = "none";
      handle.style.display = "none";

      // Restore opacity on all blocks
      const children = root.children;
      for (let i = 0; i < children.length; i++) {
        (children[i] as HTMLElement).style.opacity = "";
      }
      draggedKeyRef.current = null;
    };

    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const draggedKey = draggedKeyRef.current;
      const targetKey = indicator.dataset.targetKey;
      const position = indicator.dataset.position;

      if (!draggedKey || !targetKey || draggedKey === targetKey) {
        onDragEnd(e);
        return;
      }

      editor.update(() => {
        const draggedNode = $getNodeByKey(draggedKey);
        const targetNode = $getNodeByKey(targetKey);

        if (!draggedNode || !targetNode) return;

        // Remove the dragged node from its current position
        draggedNode.remove();

        // Insert at the target position
        if (position === "before") {
          targetNode.insertBefore(draggedNode);
        } else {
          targetNode.insertAfter(draggedNode);
        }

        // Flash the moved block
        requestAnimationFrame(() => {
          const movedEl = editor.getElementByKey(draggedKey);
          if (movedEl) {
            movedEl.classList.add("drag-drop-landed");
            setTimeout(() => movedEl.classList.remove("drag-drop-landed"), 400);
          }
        });
      });

      onDragEnd(e);
    };

    // ── Bind events ──

    editorShell.addEventListener("mousemove", onMouseMove);
    editorShell.addEventListener("mouseleave", onMouseLeave);
    handle.addEventListener("dragstart", onDragStart);
    editorShell.addEventListener("dragover", onDragOver);
    editorShell.addEventListener("drop", onDrop);
    editorShell.addEventListener("dragend", onDragEnd);

    return () => {
      editorShell.removeEventListener("mousemove", onMouseMove);
      editorShell.removeEventListener("mouseleave", onMouseLeave);
      handle.removeEventListener("dragstart", onDragStart);
      editorShell.removeEventListener("dragover", onDragOver);
      editorShell.removeEventListener("drop", onDrop);
      editorShell.removeEventListener("dragend", onDragEnd);
      handle.remove();
      indicator.remove();
    };
  }, [editor, getEditorRoot]);

  return null;
}
