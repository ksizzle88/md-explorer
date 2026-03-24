/**
 * DiffViewPlugin - Side-by-side diff view comparing current editor content
 * against the last saved/committed version.
 *
 * Uses the `diff` library to compute line-level changes and renders them
 * with VS Code-style diff colors (green additions, red deletions).
 */
import React, { useEffect, useState, useRef, useCallback } from "react";
import { diffLines } from "diff";

interface DiffViewPluginProps {
  isActive: boolean;
  currentText: string;
  onClose: () => void;
}

export default function DiffViewPlugin({
  isActive,
  currentText,
  onClose,
}: DiffViewPluginProps) {
  const [savedText, setSavedText] = useState<string | null>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const syncingRef = useRef(false);

  // Request saved version from the extension when diff mode activates
  useEffect(() => {
    if (!isActive) {
      setSavedText(null);
      return;
    }

    const handler = (event: MessageEvent) => {
      if (event.data.type === "savedVersion") {
        setSavedText(event.data.text);
      }
    };
    window.addEventListener("message", handler);

    // Request the saved version from the extension
    (window as any).vscodeApi.postMessage({ type: "requestSavedVersion" });

    return () => window.removeEventListener("message", handler);
  }, [isActive]);

  // Sync scroll between left and right panels
  const handleScroll = useCallback(
    (source: "left" | "right") => {
      if (syncingRef.current) return;
      syncingRef.current = true;
      const from = source === "left" ? leftRef.current : rightRef.current;
      const to = source === "left" ? rightRef.current : leftRef.current;
      if (from && to) {
        to.scrollTop = from.scrollTop;
      }
      syncingRef.current = false;
    },
    []
  );

  // Handle Escape to close
  useEffect(() => {
    if (!isActive) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isActive, onClose]);

  if (!isActive) return null;

  if (savedText === null) {
    return (
      <div className="diff-view-overlay">
        <div className="diff-view-header">
          <span className="diff-view-title">Loading diff...</span>
          <button className="diff-view-close-btn" onClick={onClose}>
            Close Diff
          </button>
        </div>
      </div>
    );
  }

  const changes = diffLines(savedText, currentText);

  // Build left (saved) and right (current) line arrays with change types
  const leftLines: { text: string; type: "unchanged" | "removed" | "spacer" }[] = [];
  const rightLines: { text: string; type: "unchanged" | "added" | "spacer" }[] = [];

  for (const change of changes) {
    const lines = change.value.replace(/\n$/, "").split("\n");
    // Handle empty string (empty diff part)
    const lineList = change.value === "" ? [] : lines;

    if (change.added) {
      // Added lines appear on the right, spacers on the left
      for (const line of lineList) {
        leftLines.push({ text: "", type: "spacer" });
        rightLines.push({ text: line, type: "added" });
      }
    } else if (change.removed) {
      // Removed lines appear on the left, spacers on the right
      for (const line of lineList) {
        leftLines.push({ text: line, type: "removed" });
        rightLines.push({ text: "", type: "spacer" });
      }
    } else {
      // Unchanged lines appear on both sides
      for (const line of lineList) {
        leftLines.push({ text: line, type: "unchanged" });
        rightLines.push({ text: line, type: "unchanged" });
      }
    }
  }

  const hasChanges = changes.some((c) => c.added || c.removed);
  const addedCount = changes.filter((c) => c.added).reduce((sum, c) => sum + (c.count || 0), 0);
  const removedCount = changes.filter((c) => c.removed).reduce((sum, c) => sum + (c.count || 0), 0);

  return (
    <div className="diff-view-overlay">
      <div className="diff-view-header">
        <span className="diff-view-title">
          Diff View
          {hasChanges ? (
            <span className="diff-view-stats">
              <span className="diff-stat-added">+{addedCount}</span>
              <span className="diff-stat-removed">-{removedCount}</span>
            </span>
          ) : (
            <span className="diff-view-no-changes"> (no changes)</span>
          )}
        </span>
        <button className="diff-view-close-btn" onClick={onClose}>
          Close Diff
        </button>
      </div>
      <div className="diff-view-container">
        <div className="diff-view-panel-header">
          <span className="diff-panel-label">Saved Version</span>
          <span className="diff-panel-label">Current Version</span>
        </div>
        <div className="diff-view-panels">
          <div
            className="diff-view-panel diff-view-left"
            ref={leftRef}
            onScroll={() => handleScroll("left")}
          >
            {leftLines.map((line, i) => (
              <div
                key={i}
                className={`diff-line diff-line-${line.type}`}
              >
                <span className="diff-line-number">
                  {line.type !== "spacer" ? leftLineNumber(leftLines, i) : ""}
                </span>
                <span className="diff-line-marker">
                  {line.type === "removed" ? "-" : " "}
                </span>
                <span className="diff-line-content">{line.text}</span>
              </div>
            ))}
          </div>
          <div
            className="diff-view-panel diff-view-right"
            ref={rightRef}
            onScroll={() => handleScroll("right")}
          >
            {rightLines.map((line, i) => (
              <div
                key={i}
                className={`diff-line diff-line-${line.type}`}
              >
                <span className="diff-line-number">
                  {line.type !== "spacer" ? rightLineNumber(rightLines, i) : ""}
                </span>
                <span className="diff-line-marker">
                  {line.type === "added" ? "+" : " "}
                </span>
                <span className="diff-line-content">{line.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Compute the actual line number for non-spacer lines */
function leftLineNumber(
  lines: { type: string }[],
  index: number
): number {
  let num = 0;
  for (let i = 0; i <= index; i++) {
    if (lines[i].type !== "spacer") num++;
  }
  return num;
}

function rightLineNumber(
  lines: { type: string }[],
  index: number
): number {
  let num = 0;
  for (let i = 0; i <= index; i++) {
    if (lines[i].type !== "spacer") num++;
  }
  return num;
}
