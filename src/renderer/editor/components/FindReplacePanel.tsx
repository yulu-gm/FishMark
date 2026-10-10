import { useState, type ChangeEvent, type KeyboardEvent, type MouseEvent, type RefObject } from "react";
import type { FindReplaceMatch } from "../../code-editor";

export function FindReplacePanel({ findText, replaceText, matchStatusLabel, findInputRef, handleFindReplaceKeyDown, handleFindTextChange, handleReplaceTextChange, hasMatches, onPrevious, onNext, onReplaceCurrent, onReplaceAll, matches, currentMatchIndex, onSelectMatch, autoFocus = true }: {
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
  matches: readonly FindReplaceMatch[];
  currentMatchIndex: number | null;
  onSelectMatch: (match: FindReplaceMatch) => void;
  autoFocus?: boolean;
}) {
  const pageSize = 50;
  const currentPage = Math.floor(((currentMatchIndex ?? 1) - 1) / pageSize);
  const [pageState, setPageState] = useState({ findText, currentMatchIndex, page: currentPage });
  // Follow an externally navigated match, but allow browsing other pages without
  // changing the editor selection. A new canonical projection starts on its current page.
  if (pageState.findText !== findText || pageState.currentMatchIndex !== currentMatchIndex) {
    setPageState({ findText, currentMatchIndex, page: currentPage });
  }
  const page = Math.min(Math.max(0, Math.ceil(matches.length / pageSize) - 1),
    pageState.findText === findText && pageState.currentMatchIndex === currentMatchIndex ? pageState.page : currentPage);
  const start = page * pageSize;
  const visibleMatches = matches.slice(start, start + pageSize);
  const preserveInputFocus = (event: MouseEvent<HTMLButtonElement>) => {
    if (document.activeElement instanceof HTMLInputElement) event.preventDefault();
  };
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
          autoFocus={autoFocus}
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
          onMouseDown={preserveInputFocus}
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
          onMouseDown={preserveInputFocus}
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
          onMouseDown={preserveInputFocus}
          onClick={onReplaceCurrent}
        >
          Replace
        </button>
        <button
          type="button"
          className="find-replace-text-button"
          aria-label="Replace all matches"
          disabled={!hasMatches}
          onMouseDown={preserveInputFocus}
          onClick={onReplaceAll}
        >
          Replace all
        </button>
      </div>
      <div className="find-replace-results" data-fishmark-region="search-results" aria-label="Search results">
        {matches.length === 0 ? <p className="find-replace-results-empty">{findText ? "No matches" : "Enter text to find matches"}</p> : <>
          {matches.length > pageSize ? <div className="find-replace-row find-replace-results-pages">
            <button type="button" className="find-replace-icon-button" aria-label="Previous results page" disabled={page === 0}
              onMouseDown={preserveInputFocus} onClick={() => setPageState({ findText, currentMatchIndex, page: page - 1 })}>‹</button>
            <span aria-live="polite">{start + 1}–{Math.min(start + pageSize, matches.length)} of {matches.length}</span>
            <button type="button" className="find-replace-icon-button" aria-label="Next results page" disabled={start + pageSize >= matches.length}
              onMouseDown={preserveInputFocus} onClick={() => setPageState({ findText, currentMatchIndex, page: page + 1 })}>›</button>
          </div> : null}
          <ol className="find-replace-results-list" start={start + 1}>
            {visibleMatches.map((match, offset) => {
              const index = start + offset + 1;
              return <li key={index}>
                <button type="button" className="find-replace-result" data-match-index={index}
                  aria-current={currentMatchIndex === index ? "true" : undefined}
                  onMouseDown={preserveInputFocus} onClick={() => onSelectMatch(match)}>
                  <span className="find-replace-result-location">{index}. Line {match.line}, column {match.column}</span>
                  <span className="find-replace-result-snippet">{match.snippet}</span>
                </button>
              </li>;
            })}
          </ol>
        </>}
      </div>
    </div>
  );
}
