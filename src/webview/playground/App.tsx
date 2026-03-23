/**
 * Lexical Playground - VS Code Edition
 *
 * Stripped: header, logo, Settings panel, GitHub corner, DocsPlugin,
 * PasteLogPlugin, TestRecorderPlugin, TypingPerfPlugin.
 * Always: emptyEditor=true, isCollab=false, isRichText=true.
 */

import {
  AutoFocusExtension,
  ClearEditorExtension,
  DecoratorTextExtension,
  HorizontalRuleExtension,
  SelectionAlwaysOnDisplayExtension,
} from '@lexical/extension';
import {HashtagExtension} from '@lexical/hashtag';
import {HistoryExtension} from '@lexical/history';
import {
  ClickableLinkExtension,
  LinkExtension,
} from '@lexical/link';
import {
  CheckListExtension,
  ListExtension,
} from '@lexical/list';
import {LexicalCollaboration} from '@lexical/react/LexicalCollaborationContext';
import {LexicalExtensionComposer} from '@lexical/react/LexicalExtensionComposer';
import {
  RichTextExtension,
} from '@lexical/rich-text';
import {
  configExtension,
  defineExtension,
} from 'lexical';
import {type JSX, useMemo} from 'react';

import {buildHTMLConfig} from './buildHTMLConfig';
import {FlashMessageContext} from './context/FlashMessageContext';
import {SettingsContext} from './context/SettingsContext';
import {ToolbarContext} from './context/ToolbarContext';
import Editor from './Editor';
import {KeywordsExtension} from './nodes/KeywordNode';
import PlaygroundNodes from './nodes/PlaygroundNodes';
import {PlaygroundAutoLinkExtension} from './plugins/AutoLinkExtension';
import {DateTimeExtension} from './plugins/DateTimeExtension';
import {DragDropPasteExtension} from './plugins/DragDropPasteExtension';
import {EmojisExtension} from './plugins/EmojisExtension';
import {ImagesExtension} from './plugins/ImagesExtension';
import {PlaygroundMarkdownShortcutsExtension} from './plugins/MarkdownShortcutsExtension';
import {MaxLengthExtension} from './plugins/MaxLengthPlugin';
import PlaygroundEditorTheme from './themes/PlaygroundEditorTheme';
import {validateUrl} from './utils/url';

// Rich text extensions
const PlaygroundRichTextExtension = defineExtension({
  dependencies: [
    RichTextExtension,
    ImagesExtension,
    HorizontalRuleExtension,
    configExtension(ListExtension, {shouldPreserveNumbering: false}),
    CheckListExtension,
    PlaygroundMarkdownShortcutsExtension,
  ],
  name: '@lexical/playground/RichText',
});

// Core extensions
const AppExtension = defineExtension({
  dependencies: [
    AutoFocusExtension,
    ClearEditorExtension,
    DecoratorTextExtension,
    HistoryExtension,
    KeywordsExtension,
    HashtagExtension,
    DateTimeExtension,
    MaxLengthExtension,
    DragDropPasteExtension,
    EmojisExtension,
    configExtension(LinkExtension, {validateUrl}),
    PlaygroundAutoLinkExtension,
    ClickableLinkExtension,
    SelectionAlwaysOnDisplayExtension,
  ],
  html: buildHTMLConfig(),
  name: '@lexical/playground',
  namespace: 'Playground',
  nodes: PlaygroundNodes,
  theme: PlaygroundEditorTheme,
});

// VS Code edition: always rich text, empty editor (content from .md file via SyncPlugin),
// no collaboration
const vsCodeExtension = defineExtension({
  $initialEditorState: undefined, // empty - content loaded via SyncPlugin
  dependencies: [
    AppExtension,
    HistoryExtension,
    PlaygroundRichTextExtension,
  ],
  html: buildHTMLConfig(),
  name: '@lexical/playground/vscode',
});

function App(): JSX.Element {
  return (
    <LexicalCollaboration>
      <LexicalExtensionComposer extension={vsCodeExtension} contentEditable={null}>
        <ToolbarContext>
          <div className="editor-shell">
            <Editor />
          </div>
        </ToolbarContext>
      </LexicalExtensionComposer>
    </LexicalCollaboration>
  );
}

export default function PlaygroundApp(): JSX.Element {
  return (
    <SettingsContext>
      <FlashMessageContext>
        <App />
      </FlashMessageContext>
    </SettingsContext>
  );
}
