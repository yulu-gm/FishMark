import type { Preferences } from "../../../shared/preferences";
import { SettingsGroup, SettingsRow } from "./SettingsFields";
export function ImagesSettings({ preferences, handleSelectTemporaryImageDirectory, handleResetTemporaryImageDirectory }: {
  preferences: Preferences;
  handleSelectTemporaryImageDirectory: () => void;
  handleResetTemporaryImageDirectory: () => void;
}) {
  const temporaryDirectory =
    preferences.images.temporaryDirectory ?? "FishMark 默认目录";

  return (
    <SettingsGroup
      title="图片"
      description="未保存文档中粘贴的图片会先写入临时图片目录。"
    >
      <SettingsRow>
        <div
          id="settings-temporary-image-directory-label"
          className="settings-label"
        >
          <span>临时图片目录</span>
          <span className="settings-hint">已保存文档仍会写入文档旁的 assets 目录。</span>
        </div>
        <div className="settings-input-stack">
          <div
            id="settings-temporary-image-directory"
            className="settings-input settings-path-display"
            aria-labelledby="settings-temporary-image-directory-label"
          >
            {temporaryDirectory}
          </div>
          <div className="settings-inline-actions">
            <button
              type="button"
              className="settings-reset"
              aria-label="选择临时图片目录"
              onClick={() => {
                void handleSelectTemporaryImageDirectory();
              }}
            >
              选择目录
            </button>
            <button
              type="button"
              className="settings-reset"
              disabled={preferences.images.temporaryDirectory === null}
              onClick={handleResetTemporaryImageDirectory}
            >
              恢复默认目录
            </button>
          </div>
        </div>
      </SettingsRow>
    </SettingsGroup>
  );
}
