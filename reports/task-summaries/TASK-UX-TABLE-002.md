# TASK-UX-TABLE-002 — Table CJK font consistency candidate

Status: **REJECTED AND PRODUCT CHANGES WITHDRAWN** by normal commit `7ac968e90477071b4a9b02735660aded38d07124`; no push, no release acceptance. Historical candidate results below are retained, not the current product state. Base diagnosis: `7d8fc870ead8b160e4beb54ca0cd0f593c3cae66`. Local main remains frozen at `53d86ac377e6a8610c45be8d8f8c6cde3c611b4b`.

## Change and scope

A small renderer font lifecycle loads the configured local CJK family through a Unicode-restricted FontFace. Only table cells use this mapping; their preview CJK spans inherit the same family chain as native editable text. Latin continues through the existing document/theme family. Loading, missing-font fallback, preference-change cleanup and stale asynchronous completion are covered by unit tests. The character ranges are checked against the existing Han/fullwidth preview contract in the current Node runtime.

There are no changes to table input handlers, cell child reconstruction, column weights, parser, selection state, toolbar layout or scroll position. No remote font download. The configured local regular face supplies CJK and browser synthesis supplies styled weights; the measured header uses Georgia-Bold for Latin and MicrosoftYaHei for CJK in both modes. Native bold-face equivalence across other font families/platforms has not been established, and needs review before general release. Unavailable local faces retain the existing fallback path rather than enabling an empty mapping.

This fixes the reproduced table font-family mismatch without rebuilding input DOM. It does not alter the separate existing computed table line-height (33.3px at 18px, versus canonical 1.55), or claim the entire typography contract is now accepted.

## Real Electron evidence

Same yuluStation baseline and isolated preferences as TASK-UX-TABLE-001. Synthesized fixtures, not a recovered original from the old computer. Five cases (short, mixed, long prose/unbroken, scrolled, header) at widths 1200 and 900, plus the prior diagnostic-only reserved-space control: **11/11 asserted PASS**.

- Before fix: Chinese preview Microsoft YaHei, editing Noto Sans SC; short glyph Range height 24 -> 21px.
- Candidate: Chinese Microsoft YaHei in both modes, Latin Georgia; short glyph Range height 21 -> 21px. Preview now shares mixed-font line metrics with editable content.
- Relative glyph x/y/width/height delta is 0 in plain Chinese cases and at most 0.015625px in mixed/header cases. The assertion allows 0.05px for Chromium 1/64px text-run boundary quantization; it would reject the old 1px/3px differences.
- Both mixed widths: native insertion, Ctrl+Z/Ctrl+Y, Home + four Shift+Right selecting `中文测试`, replacement by `替换 X`, undo and redo all pass. Three blur/re-entry cycles at each width retain text, selected-cell modes, platform fonts and relative geometry.
- Real screenshots inspected. Raw `before.png`/`after.png`, DOM ranges, platform font records and operation results: `.artifacts/table-transition/font-asserted/<case>-<width>-baseline/`.
- Reproduce on a fresh build: set `FISHMARK_EXPECT_FONT_STABLE=1`, then `node scripts/probe-table-transition.mjs <new-run-id>`.

Native Windows IME is **unmeasured**: no supported native desktop control is available. Existing composition-related table tests ran in the full regression; synthetic tests do not certify OS IME. Typora, macOS/Linux rendering, other installed font variants and multi-cell drag selection are not claimed as measured.

## Layout conclusion (no product layout patch)

Diagnostic scroll compensation requests `oldScrollTop + scrollerTopDelta` after the shell transition:

| Real case | Requested scrollTop | Actual scrollTop | Remaining table displacement |
| --- | ---: | ---: | ---: |
| short | 53 | 0 | 53px |
| scrolled | 559 | 559 | 0px |

Evidence: `.artifacts/table-transition/anchor-short/` and `anchor-scrolled/`. The short document has no scrolling range, so the browser clamps the request. Moving only the left-rail table toolbar cannot remove the app grid's tab-strip rows. Therefore the universal fix still requires a shell product choice (stable space, changing tab presentation, or deliberate transient scroll extent/cropping). No permanent 53px reservation or content-covering toolbar was shipped, and this does not block the independent font candidate.

## Validation and remaining gate

- Build PASS; lint PASS; typecheck PASS.
- New font lifecycle/coverage tests 4/4 PASS.
- Formal behavior protocol PASS: 121/121 cases, 2541 targets (79 existing + 2363 runner + 99 known defects), unexpected 0, not-run 0. Raw `font-formal.json`/`.log`.
- Relevant editor/table set: 488 passed plus the same 10 exact known parser/editor failures (raw focused invocation exits 1); full wrapper confirms their exact identities.
- Full regression: **3179 passed, 10 exact known failures, 1 unexpected symlink skip, 0 collection/hook/unhandled errors**. Four new passing tests versus frozen53d86ac; Windows gate remains FAIL. Raw `.artifacts/table-transition/font-regression.json` and `.log` preserve it. No allowlist or OS settings changed.
- Original bundle budget PASS: **1429561 / 1430000 gzip bytes** (+362 versus frozen checkpoint).
- Initial script quoting, test-environment setup and strict-zero geometry failures are retained in local logs. They were corrected before the asserted matrix; the earlier strict-zero result rejected only the recorded 1/64px rounding, not a whole-pixel difference.
- Independent review completed: **CHANGES_REQUESTED**, two P2 contract regressions (native bold-face selection replaced by regular synthesis; active inline code newly uses prose CJK preference). See [review](../reviews/2026-10-08-table-font-review.md). Existing CSS family stacks also are not faithfully represented by one local face name. The candidate remains isolated and must not merge as-is. No safe minimal code correction was made in this review slice: uniform code-point font mapping cannot distinguish prose from code in the same plain cell, and guessing bold font names would not preserve arbitrary selected families. Frozen launch release still awaits the user's Windows gate decision. M9/cp13/cp16 untouched.

See [bounded rich-mark assessment](../../docs/plans/2026-10-08-table-rich-font-assessment.md): no existing safe small-fix path found; no input architecture expansion was implemented.
