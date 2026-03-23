import * as vscode from "vscode";
import { scanMarkdownTree, TreeNode } from "./mdScanner";

/**
 * Single unified WebviewView that contains both the filter bar and the file tree/list.
 */
export class ExplorerViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "mdExplorerFiles";

  private _view?: vscode.WebviewView;
  private _data: TreeNode[] = [];

  constructor(private readonly _extensionUri: vscode.Uri) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this.getHtml();

    webviewView.webview.onDidReceiveMessage((msg) => {
      switch (msg.type) {
        case "openFile":
          vscode.window.showTextDocument(vscode.Uri.file(msg.path), { preview: true });
          break;
        case "copyPath":
          vscode.env.clipboard.writeText(msg.path);
          vscode.window.showInformationMessage(`Copied: ${msg.path}`);
          break;
        case "ready":
          this.sendData();
          break;
      }
    });

    this.refresh();
  }

  /** Re-scan filesystem and push data to webview */
  refresh(): void {
    this._data = scanMarkdownTree();
    this.sendData();
  }

  /** Tell webview to show/hide the filter bar */
  toggleFilter(visible: boolean): void {
    this._view?.webview.postMessage({ type: "toggleFilter", visible });
  }

  /** Tell webview to switch between tree and list mode */
  setViewMode(mode: "tree" | "list"): void {
    this._view?.webview.postMessage({ type: "setViewMode", mode });
  }

  /** Tell webview to collapse all directories */
  collapseAll(): void {
    this._view?.webview.postMessage({ type: "collapseAll" });
  }

  private sendData(): void {
    this._view?.webview.postMessage({ type: "data", roots: this._data });
  }

  private getHtml(): string {
    return /*html*/ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: var(--vscode-font-family);
    font-size: 13px;
    color: var(--vscode-foreground);
    overflow-x: hidden;
  }

  /* ── Filter bar ── */
  .filter-bar {
    position: sticky;
    top: 0;
    z-index: 10;
    background: var(--vscode-sideBar-background);
    padding: 6px 8px 4px;
    border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border, transparent);
    display: none;
  }
  .filter-bar.visible { display: block; }

  .filter-row {
    position: relative;
    display: flex;
    align-items: center;
  }

  .filter-icon {
    position: absolute;
    left: 6px;
    top: 50%;
    transform: translateY(-50%);
    opacity: 0.4;
    font-size: 12px;
    pointer-events: none;
  }

  .filter-input {
    width: 100%;
    padding: 4px 26px 4px 24px;
    border: 1px solid var(--vscode-input-border, transparent);
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border-radius: 4px;
    font-size: 12px;
    font-family: var(--vscode-font-family);
    outline: none;
    line-height: 18px;
  }
  .filter-input:focus {
    border-color: var(--vscode-focusBorder);
  }
  .filter-input::placeholder {
    color: var(--vscode-input-placeholderForeground);
  }

  .filter-clear {
    position: absolute;
    right: 3px;
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    color: var(--vscode-foreground);
    cursor: pointer;
    opacity: 0;
    font-size: 13px;
    padding: 2px 5px;
    border-radius: 3px;
    line-height: 1;
  }
  .filter-clear:hover { background: var(--vscode-toolbar-hoverBackground); }
  .filter-clear.visible { opacity: 0.5; }
  .filter-clear.visible:hover { opacity: 1; }

  .filter-status {
    margin-top: 3px;
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    padding-left: 2px;
  }

  /* ── Tree view ── */
  .tree-container {
    padding: 2px 0;
  }

  .dir-header {
    display: flex;
    align-items: center;
    padding: 3px 8px 3px 0;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    user-select: none;
  }
  .dir-header:hover {
    background: var(--vscode-list-hoverBackground);
  }

  .chevron {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    font-size: 11px;
    opacity: 0.7;
    transition: transform 0.12s ease;
  }
  .dir-node.collapsed .chevron {
    transform: rotate(-90deg);
  }

  .dir-label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: 500;
    font-size: 12px;
  }

  .dir-count {
    flex-shrink: 0;
    margin-left: 6px;
    font-size: 11px;
    opacity: 0.5;
    font-weight: normal;
  }

  .dir-children {
    overflow: hidden;
  }
  .dir-node.collapsed .dir-children {
    display: none;
  }

  .file-node {
    display: flex;
    align-items: center;
    padding: 2px 8px 2px 0;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
  }
  .file-node:hover {
    background: var(--vscode-list-hoverBackground);
  }
  .file-node:active {
    background: var(--vscode-list-activeSelectionBackground);
    color: var(--vscode-list-activeSelectionForeground);
  }

  .file-icon {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    margin-right: 4px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 700;
    opacity: 0.55;
  }

  .file-label {
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 12px;
  }

  /* ── List view ── */
  .list-container {
    padding: 2px 0;
    display: none;
  }

  .list-item {
    display: flex;
    align-items: center;
    padding: 2px 8px;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
  }
  .list-item:hover {
    background: var(--vscode-list-hoverBackground);
  }
  .list-item:active {
    background: var(--vscode-list-activeSelectionBackground);
    color: var(--vscode-list-activeSelectionForeground);
  }

  .list-icon {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    margin-right: 4px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 700;
    opacity: 0.55;
  }

  .list-name {
    font-size: 12px;
    margin-right: 6px;
    flex-shrink: 0;
  }

  .list-path {
    font-size: 11px;
    opacity: 0.45;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* ── Context menu ── */
  .ctx-menu {
    position: fixed;
    background: var(--vscode-menu-background);
    border: 1px solid var(--vscode-menu-border, var(--vscode-widget-border));
    border-radius: 4px;
    padding: 4px 0;
    min-width: 140px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.25);
    z-index: 100;
    display: none;
    font-size: 12px;
  }
  .ctx-menu.visible { display: block; }
  .ctx-menu-item {
    padding: 4px 16px;
    cursor: pointer;
    color: var(--vscode-menu-foreground);
  }
  .ctx-menu-item:hover {
    background: var(--vscode-menu-selectionBackground);
    color: var(--vscode-menu-selectionForeground);
  }

  .empty-state {
    padding: 20px 16px;
    text-align: center;
    color: var(--vscode-descriptionForeground);
    font-size: 12px;
  }

  body.view-list .tree-container { display: none; }
  body.view-list .list-container { display: block; }
  body.view-tree .tree-container { display: block; }
  body.view-tree .list-container { display: none; }
</style>
</head>
<body class="view-tree">

  <div class="filter-bar" id="filterBar">
    <div class="filter-row">
      <span class="filter-icon">&#x26B2;</span>
      <input class="filter-input" id="filterInput" type="text"
             placeholder="Filter files... (supports *, **, ?)" spellcheck="false" />
      <button class="filter-clear" id="filterClear" title="Clear (Esc)">&#x2715;</button>
    </div>
    <div class="filter-status" id="filterStatus"></div>
  </div>

  <div class="tree-container" id="treeContainer"></div>
  <div class="list-container" id="listContainer"></div>

  <div class="ctx-menu" id="ctxMenu">
    <div class="ctx-menu-item" data-action="copy-path">Copy Path</div>
    <div class="ctx-menu-item" data-action="copy-name">Copy Filename</div>
  </div>

<script>
(function() {
  const vscode = acquireVsCodeApi();

  const filterBar    = document.getElementById('filterBar');
  const filterInput  = document.getElementById('filterInput');
  const filterClear  = document.getElementById('filterClear');
  const filterStatus = document.getElementById('filterStatus');
  const treeEl       = document.getElementById('treeContainer');
  const listEl       = document.getElementById('listContainer');
  const ctxMenu      = document.getElementById('ctxMenu');

  let allRoots = [];
  let filterText = '';
  let ctxTarget = null;

  vscode.postMessage({ type: 'ready' });

  // ── Messaging ──
  window.addEventListener('message', function(e) {
    var msg = e.data;
    switch (msg.type) {
      case 'data':
        allRoots = msg.roots || [];
        render();
        break;
      case 'toggleFilter':
        filterBar.classList.toggle('visible', msg.visible);
        if (msg.visible) filterInput.focus();
        break;
      case 'setViewMode':
        document.body.className = 'view-' + msg.mode;
        break;
      case 'collapseAll':
        treeEl.querySelectorAll('.dir-node').forEach(function(n) {
          n.classList.add('collapsed');
        });
        break;
    }
  });

  // ── Filter ──
  var debounce;
  filterInput.addEventListener('input', function() {
    filterText = filterInput.value;
    filterClear.classList.toggle('visible', filterText.length > 0);
    clearTimeout(debounce);
    debounce = setTimeout(render, 100);
  });

  filterInput.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      filterText = '';
      filterInput.value = '';
      filterClear.classList.remove('visible');
      render();
    }
  });

  filterClear.addEventListener('click', function() {
    filterText = '';
    filterInput.value = '';
    filterClear.classList.remove('visible');
    render();
    filterInput.focus();
  });

  // ── Context menu ──
  document.addEventListener('click', function() {
    ctxMenu.classList.remove('visible');
  });

  ctxMenu.querySelectorAll('.ctx-menu-item').forEach(function(item) {
    item.addEventListener('click', function() {
      var action = item.dataset.action;
      if (!action || !ctxTarget) return;
      if (action === 'copy-path') {
        vscode.postMessage({ type: 'copyPath', path: ctxTarget });
      } else if (action === 'copy-name') {
        vscode.postMessage({ type: 'copyPath', path: ctxTarget.split('/').pop() });
      }
      ctxMenu.classList.remove('visible');
    });
  });

  function showCtxMenu(e, filePath) {
    e.preventDefault();
    ctxTarget = filePath;
    ctxMenu.style.left = e.clientX + 'px';
    ctxMenu.style.top = e.clientY + 'px';
    ctxMenu.classList.add('visible');
  }

  // ── Glob support ──
  function isGlob(pattern) {
    return pattern.indexOf('*') !== -1 || pattern.indexOf('?') !== -1;
  }

  function globToRegex(pattern) {
    // Split on ** first to handle globstar separately
    var parts = pattern.split('**');
    var regexParts = [];
    for (var i = 0; i < parts.length; i++) {
      var seg = parts[i];
      // Escape regex specials except * and ? by replacing each special char
      var escaped = '';
      for (var j = 0; j < seg.length; j++) {
        var ch = seg[j];
        if ('.+^\${}()|[]\\\\'.indexOf(ch) !== -1) {
          escaped += '\\\\' + ch;
        } else if (ch === '*') {
          escaped += '[^/]*';
        } else if (ch === '?') {
          escaped += '[^/]';
        } else {
          escaped += ch;
        }
      }
      regexParts.push(escaped);
    }
    // Join with .* for ** (match anything including /)
    var full = regexParts.join('.*');
    return new RegExp('^' + full + '$', 'i');
  }

  // ── Tree utilities ──
  function countTreeFiles(nodes) {
    var total = 0;
    for (var i = 0; i < nodes.length; i++) {
      total += nodes[i].files.length;
      total += countTreeFiles(nodes[i].children);
    }
    return total;
  }

  function filterTree(nodes, matchFn) {
    var result = [];
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      var matchedFiles = node.files.filter(matchFn);
      var matchedChildren = filterTree(node.children, matchFn);
      if (matchedFiles.length > 0 || matchedChildren.length > 0) {
        result.push({
          name: node.name,
          fullPath: node.fullPath,
          files: matchedFiles,
          children: matchedChildren
        });
      }
    }
    return result;
  }

  function flattenTree(nodes, items) {
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      for (var k = 0; k < node.files.length; k++) {
        items.push({ file: node.files[k], dirName: node.name });
      }
      flattenTree(node.children, items);
    }
    return items;
  }

  // ── Render ──
  function render() {
    var totalFiles = countTreeFiles(allRoots);
    var displayRoots;
    var filteredFiles;
    var hasFilter = filterText.length > 0;

    if (hasFilter) {
      var trimmed = filterText.trim();
      if (isGlob(trimmed)) {
        var regex = globToRegex(trimmed);
        displayRoots = filterTree(allRoots, function(f) {
          return regex.test(f.relPath);
        });
      } else {
        var lower = trimmed.toLowerCase();
        displayRoots = filterTree(allRoots, function(f) {
          return f.relPath.toLowerCase().indexOf(lower) !== -1;
        });
      }
      filteredFiles = countTreeFiles(displayRoots);
    } else {
      displayRoots = allRoots;
      filteredFiles = totalFiles;
    }

    filterStatus.textContent = hasFilter
      ? (filteredFiles + ' of ' + totalFiles + ' files')
      : (totalFiles + ' files');

    renderTreeView(displayRoots, hasFilter);
    renderList(displayRoots);
  }

  // ── Recursive tree rendering ──
  function renderTreeView(roots, hasFilter) {
    while (treeEl.firstChild) treeEl.removeChild(treeEl.firstChild);

    var isEmpty = roots.length === 0 ||
      (countTreeFiles(roots) === 0 && roots.every(function(r) { return r.children.length === 0; }));

    if (isEmpty) {
      var empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = hasFilter ? 'No files match filter' : 'No markdown files found';
      treeEl.appendChild(empty);
      return;
    }

    for (var i = 0; i < roots.length; i++) {
      renderNode(treeEl, roots[i], 0, true, hasFilter);
    }
  }

  function renderNode(parentEl, node, depth, isRoot, hasFilter) {
    // Skip nodes with nothing to show
    if (node.files.length === 0 && node.children.length === 0) return;

    var dirNode = document.createElement('div');
    // Root nodes and filter-active: expanded. Non-root without filter: collapsed.
    if (!isRoot && !hasFilter) {
      dirNode.className = 'dir-node collapsed';
    } else {
      dirNode.className = 'dir-node';
    }

    var header = document.createElement('div');
    header.className = 'dir-header';
    header.style.paddingLeft = (depth * 16 + 4) + 'px';

    var chevron = document.createElement('span');
    chevron.className = 'chevron';
    chevron.textContent = '\u25BE';

    var label = document.createElement('span');
    label.className = 'dir-label';
    label.textContent = node.name;

    var totalCount = countTreeFiles([node]);
    var count = document.createElement('span');
    count.className = 'dir-count';
    count.textContent = String(totalCount);

    header.appendChild(chevron);
    header.appendChild(label);
    header.appendChild(count);

    header.addEventListener('click', (function(n) {
      return function() { n.classList.toggle('collapsed'); };
    })(dirNode));

    var children = document.createElement('div');
    children.className = 'dir-children';

    // Render files at this node
    for (var k = 0; k < node.files.length; k++) {
      var file = node.files[k];
      var fileNode = document.createElement('div');
      fileNode.className = 'file-node';
      fileNode.style.paddingLeft = ((depth + 1) * 16 + 4) + 'px';
      fileNode.dataset.path = file.fullPath;
      fileNode.title = file.fullPath;

      var fIcon = document.createElement('span');
      fIcon.className = 'file-icon';
      fIcon.textContent = 'M';

      var fLabel = document.createElement('span');
      fLabel.className = 'file-label';
      fLabel.textContent = file.name;

      fileNode.appendChild(fIcon);
      fileNode.appendChild(fLabel);

      fileNode.addEventListener('click', (function(p) {
        return function() { vscode.postMessage({ type: 'openFile', path: p }); };
      })(file.fullPath));

      fileNode.addEventListener('contextmenu', (function(p) {
        return function(e) { showCtxMenu(e, p); };
      })(file.fullPath));

      children.appendChild(fileNode);
    }

    // Recurse into child directories
    for (var c = 0; c < node.children.length; c++) {
      renderNode(children, node.children[c], depth + 1, false, hasFilter);
    }

    dirNode.appendChild(header);
    dirNode.appendChild(children);
    parentEl.appendChild(dirNode);
  }

  // ── List view (flat) ──
  function renderList(roots) {
    while (listEl.firstChild) listEl.removeChild(listEl.firstChild);

    var items = flattenTree(roots, []);

    if (items.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = filterText ? 'No files match filter' : 'No markdown files found';
      listEl.appendChild(empty);
      return;
    }

    for (var i = 0; i < items.length; i++) {
      var file = items[i].file;
      var dirName = items[i].dirName;
      var item = document.createElement('div');
      item.className = 'list-item';
      item.dataset.path = file.fullPath;
      item.title = file.fullPath;

      var icon = document.createElement('span');
      icon.className = 'list-icon';
      icon.textContent = 'M';

      var name = document.createElement('span');
      name.className = 'list-name';
      name.textContent = file.name;

      var pathSpan = document.createElement('span');
      pathSpan.className = 'list-path';
      pathSpan.textContent = dirName;

      item.appendChild(icon);
      item.appendChild(name);
      item.appendChild(pathSpan);

      item.addEventListener('click', (function(p) {
        return function() { vscode.postMessage({ type: 'openFile', path: p }); };
      })(file.fullPath));

      item.addEventListener('contextmenu', (function(p) {
        return function(e) { showCtxMenu(e, p); };
      })(file.fullPath));

      listEl.appendChild(item);
    }
  }
})();
</script>
</body>
</html>`;
  }
}