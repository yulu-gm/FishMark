import type { ChangeEvent, KeyboardEvent, RefObject } from "react";

export function FindReplacePanel({ findText, replaceText, matchStatusLabel, findInputRef, handleFindReplaceKeyDown, handleFindTextChange, handleReplaceTextChange, hasMatches, onPrevious, onNext, onReplaceCurrent, onReplaceAll }: {
  findText: string;
  replaceText: string;
  matchStatusLabel: string;
  findInputRef: RefObject<HTMLInputElement | null>;
  handleFindReplaceKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  handleFindTextChange: (event: ChangeEvent<HTMLInputElement>) => void;
  handleReplaceTextChange: (event: ChangeEvent<HTMLInputElement>) => void;
  hasMatches: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onReplaceCurrent: () => void;
  onReplaceAll: () => void;
}) {
  return (
    <div
      className="find-replace-panel"
      data-fishmark-region="search"
      aria-label="Find and replace"
      onKeyDown={handleFindReplaceKeyDown}
    >
      <label className="find-replace-field">
        <span>Find</span>
        <input
          type="search"
          className="find-replace-input"
          aria-label="Find text"
          ref={findInputRef}
          value={findText}
          onChange={handleFindTextChange}
        />
      </label>
      <div className="find-replace-row">
        <p
          className="find-replace-status"
          data-fishmark-region="find-replace-status"
          aria-live="polite"
        >
          {matchStatusLabel}
        </p>
        <button
          type="button"
          className="find-replace-icon-button"
          aria-label="Previous match"
          disabled={!hasMatches}
          onClick={onPrevious}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M6 14l6-6 6 6" />
          </svg>
        </button>
        <button
          type="button"
          className="find-replace-icon-button"
          aria-label="Next match"
          disabled={!hasMatches}
          onClick={onNext}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M6 10l6 6 6-6" />
          </svg>
        </button>
      </div>
      <label className="find-replace-field">
        <span>Replace</span>
        <input
          type="text"
          className="find-replace-input"
          aria-label="Replace with"
          value={replaceText}
          onChange={handleReplaceTextChange}
        />
      </label>
      <div className="find-replace-row">
        <button
          type="button"
          className="find-replace-text-button"
          aria-label="Replace current match"
          disabled={!hasMatches}
          onClick={onReplaceCurrent}
        >
          Replace
        </button>
        <button
          type="button"
          className="find-replace-text-button"
          aria-label="Replace all matches"
          disabled={!hasMatches}
          onClick={onReplaceAll}
        >
          Replace all
        </button>
      </div>
    </div>
  );
}
