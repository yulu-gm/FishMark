import type { Dispatch, SetStateAction } from "react";
import type { DraftState, FontOption } from "./settings-inputs";
import { SettingsGroup, SettingsRow } from "./SettingsFields";
export function TypographySettings({ draft, setDraft, uiFontOptions, documentFontOptions, documentCjkFontOptions, handleUiFontPresetChange, handleUiFontSizeCommit, handleDocumentFontPresetChange, handleDocumentCjkFontPresetChange, handleDocumentFontSizeCommit }: {
  draft: DraftState;
  setDraft: Dispatch<SetStateAction<DraftState>>;
  uiFontOptions: FontOption[];
  documentFontOptions: FontOption[];
  documentCjkFontOptions: FontOption[];
  handleUiFontPresetChange: (value: string) => void;
  handleUiFontSizeCommit: () => void;
  handleDocumentFontPresetChange: (value: string) => void;
  handleDocumentCjkFontPresetChange: (value: string) => void;
  handleDocumentFontSizeCommit: () => void;
}) {
  return (
    <SettingsGroup
      title="排版"
      description="应用 UI 字号影响面板和按钮，文档字号与字体影响编辑器正文和 Markdown 渲染。"
    >
      <SettingsRow>
        <label
          className="settings-label"
          htmlFor="settings-ui-font-preset"
        >
          <span>应用 UI 字体预设</span>
          <span className="settings-hint">作用于按钮、标题、侧栏和设置面板等应用界面文字。</span>
        </label>
        <select
          id="settings-ui-font-preset"
          className="settings-input settings-select"
          value={draft.uiFontFamily}
          onChange={(event) => handleUiFontPresetChange(event.target.value)}
        >
          {uiFontOptions.map((option) => (
            <option
              key={option.value.length === 0 ? "__default__" : option.value}
              value={option.value}
            >
              {option.label}
            </option>
          ))}
        </select>
      </SettingsRow>
      <SettingsRow>
        <label
          className="settings-label"
          htmlFor="settings-ui-font-size"
        >
          <span>应用 UI 字号</span>
          <span className="settings-hint">单位像素，范围 8 - 72，留空表示使用默认值。</span>
        </label>
        <input
          id="settings-ui-font-size"
          className="settings-input settings-input-narrow"
          type="number"
          min={8}
          max={72}
          value={draft.uiFontSize}
          placeholder="默认"
          onChange={(event) =>
            setDraft((current) => ({ ...current, uiFontSize: event.target.value }))
          }
          onBlur={handleUiFontSizeCommit}
        />
      </SettingsRow>
      <SettingsRow>
        <label
          className="settings-label"
          htmlFor="settings-document-font-size"
        >
          <span>文档字号</span>
          <span className="settings-hint">单位像素，范围 8 - 72，留空表示使用主题默认值。</span>
        </label>
        <input
          id="settings-document-font-size"
          className="settings-input settings-input-narrow"
          type="number"
          min={8}
          max={72}
          value={draft.documentFontSize}
          placeholder="默认"
          onChange={(event) =>
            setDraft((current) => ({ ...current, documentFontSize: event.target.value }))
          }
          onBlur={handleDocumentFontSizeCommit}
        />
      </SettingsRow>
      <SettingsRow>
        <label
          className="settings-label"
          htmlFor="settings-document-font-preset"
        >
          <span>文档字体预设</span>
          <span className="settings-hint">应用于正文中的西文、数字和未单独覆盖的字符。</span>
        </label>
        <select
          id="settings-document-font-preset"
          className="settings-input settings-select"
          value={draft.documentFontFamily}
          onChange={(event) => handleDocumentFontPresetChange(event.target.value)}
        >
          {documentFontOptions.map((option) => (
            <option
              key={option.value.length === 0 ? "__default__" : option.value}
              value={option.value}
            >
              {option.label}
            </option>
          ))}
        </select>
      </SettingsRow>
      <SettingsRow>
        <label
          className="settings-label"
          htmlFor="settings-document-cjk-font-preset"
        >
          <span>中文字体预设</span>
          <span className="settings-hint">仅作用于正文中文字符，代码块和行内代码不受影响。</span>
        </label>
        <select
          id="settings-document-cjk-font-preset"
          className="settings-input settings-select"
          value={draft.documentCjkFontFamily}
          onChange={(event) => handleDocumentCjkFontPresetChange(event.target.value)}
        >
          {documentCjkFontOptions.map((option) => (
            <option
              key={option.value.length === 0 ? "__default__" : option.value}
              value={option.value}
            >
              {option.label}
            </option>
          ))}
        </select>
      </SettingsRow>
    </SettingsGroup>
  );
}
