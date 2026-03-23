import * as vscode from "vscode";

/**
 * WebviewView that renders a search/filter input in the sidebar.
 * Sends filter text to the extension on each keystroke (debounced).
 */
export class FilterViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "mdExplorerFilter";

  private _view?: vscode.WebviewView;
  private _filterText: string = "";
  private _fileCount: number = 0;
  private _totalCount: number = 0;

  private _onFilterChange = new vscode.EventEmitter<string>();
  readonly onFilterChange = this._onFilterChange.event;

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
    };

    webviewView.webview.html = this.getHtml();

    webviewView.webview.onDidReceiveMessage((message) => {
      switch (message.type) {
        case "filter":
          this._filterText = message.value;
          this._onFilterChange.fire(message.value);
          break;
        case "clear":
          this._filterText = "";
          this._onFilterChange.fire("");
          break;
      }
    });
  }

  /** Update the result count badge shown below the input */
  updateCount(filtered: number, total: number): void {
    this._fileCount = filtered;
    this._totalCount = total;
    if (this._view) {
      this._view.webview.postMessage({
        type: "updateCount",
        filtered,
        total,
      });
    }
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
      padding: 8px 12px 10px;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
    }

    .search-container {
      position: relative;
      display: flex;
      align-items: center;
    }

    .search-icon {
      position: absolute;
      left: 7px;
      top: 50%;
      transform: translateY(-50%);
      opacity: 0.5;
      pointer-events: none;
      font-size: 14px;
    }

    .search-box {
      width: 100%;
      padding: 5px 28px 5px 26px;
      border: 1px solid var(--vscode-input-border, transparent);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border-radius: 4px;
      font-size: 12px;
      font-family: var(--vscode-font-family);
      outline: none;
      line-height: 18px;
    }

    .search-box:focus {
      border-color: var(--vscode-focusBorder);
    }

    .search-box::placeholder {
      color: var(--vscode-input-placeholderForeground);
    }

    .clear-btn {
      position: absolute;
      right: 4px;
      top: 50%;
      transform: translateY(-50%);
      background: none;
      border: none;
      color: var(--vscode-foreground);
      cursor: pointer;
      opacity: 0;
      font-size: 14px;
      padding: 2px 4px;
      border-radius: 3px;
      line-height: 1;
      transition: opacity 0.15s;
    }

    .clear-btn:hover {
      background: var(--vscode-toolbar-hoverBackground);
    }

    .clear-btn.visible {
      opacity: 0.6;
    }

    .clear-btn.visible:hover {
      opacity: 1;
    }

    .status-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 6px;
      font-size: 11px;
      opacity: 0.7;
    }

    .status-count {
      color: var(--vscode-descriptionForeground);
    }

    .status-filter-active {
      color: var(--vscode-notificationsInfoIcon-foreground, #3794ff);
      font-weight: 500;
    }

    .glob-hint {
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
      margin-top: 4px;
      opacity: 0.6;
      display: none;
    }

    .glob-hint.visible {
      display: block;
    }
  </style>
</head>
<body>
  <div class="search-container">
    <span class="search-icon">&#x1F50D;</span>
    <input class="search-box" type="text" placeholder="Filter by path or name..." spellcheck="false" />
    <button class="clear-btn" title="Clear filter">&#x2715;</button>
  </div>
  <div class="status-bar">
    <span class="status-count"></span>
    <span class="status-filter-active"></span>
  </div>
  <div class="glob-hint">Supports glob: *, ?, task/*</div>

  <script>
    const vscode = acquireVsCodeApi();
    const input = document.querySelector('.search-box');
    const clearBtn = document.querySelector('.clear-btn');
    const statusCount = document.querySelector('.status-count');
    const statusFilter = document.querySelector('.status-filter-active');
    const globHint = document.querySelector('.glob-hint');

    let debounceTimer;

    input.addEventListener('input', () => {
      const val = input.value;
      clearBtn.classList.toggle('visible', val.length > 0);
      globHint.classList.toggle('visible', val.length > 0 && (val.includes('*') || val.includes('?')));

      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        vscode.postMessage({ type: 'filter', value: val });
      }, 150);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        input.value = '';
        clearBtn.classList.remove('visible');
        globHint.classList.remove('visible');
        vscode.postMessage({ type: 'clear' });
      }
    });

    clearBtn.addEventListener('click', () => {
      input.value = '';
      clearBtn.classList.remove('visible');
      globHint.classList.remove('visible');
      vscode.postMessage({ type: 'clear' });
      input.focus();
    });

    // Receive count updates from extension
    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'updateCount') {
        if (msg.filtered === msg.total) {
          statusCount.textContent = msg.total + ' files';
          statusFilter.textContent = '';
        } else {
          statusCount.textContent = msg.filtered + ' of ' + msg.total + ' files';
          statusFilter.textContent = 'filtered';
        }
      }
    });
  </script>
</body>
</html>`;
  }
}
