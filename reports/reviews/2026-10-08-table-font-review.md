# Independent review — table font candidate 6e01b0ef

Verdict: **CHANGES_REQUESTED**. Read-only production review by an agent not involved in implementation. Window checkpoint 53d86ac remains outside this review. No production edits, rebuild, push, system-font changes or installation.

## Findings

### P2 — Unicode alias discards installed weight/style face selection

Location: `src/renderer/editor/table-cjk-font.ts:7-9`.

The alias registers only `local(family)` with default normal weight/style. A table header or strong span requesting bold therefore uses the regular face plus synthesis even when the user's selected family has an installed native bold face. Independent Electron 41.2.0 / Chromium 146 CDP measurements on this host:

| Selected family | Native CSS at weight 700 | Candidate alias at weight 700 |
| --- | --- | --- |
| Microsoft YaHei | MicrosoftYaHei-Bold | MicrosoftYaHei |
| Noto Sans SC | Noto-Sans-SC-Bold | Noto-Sans-SC |

Normal 400 resolves the intended CJK font; Latin resolves Georgia and its native bold/italic variants. SimSun (no distinct bold detected) remains SimSun in both. This is not a claim that Chinese becomes visually non-bold: synthesis can retain apparent weight, but it replaces the chosen family's real designed bold outlines. The previous app evidence only compared alias preview against alias editing, so it cannot detect this regression against the original family contract.

Minimum acceptable direction: preserve real style-aware font-family selection, or explicitly defer this candidate until a bounded mapping can resolve installed face metadata reliably. Do not guess names such as `${family} Bold`, silently force regular, or expand platform font-enumeration architecture merely to ship this patch.

Evidence: `.artifacts/font-review/font-face.cjs`, `font-face-result.json`, `font-face.png`. Standalone Electron font fixture isolates font selection; it is not a complete app screenshot test. Initial fixture overquoted the alias and was corrected before the retained final result.

### P2 — Active inline code starts using the CJK prose preference

Location: `src/renderer/styles/markdown-render.css:1160-1162`.

The new family covers every character of the editable cell, including inline code. The settings UI explicitly says the Chinese preference does not affect code blocks or inline code (`TypographySettings.tsx:119`). The preview code span still has its code font, but activation makes the cell a plain native text node; the entire backtick-delimited code then receives the CJK alias. This newly routes code text through the user's prose CJK font. Existing preview/edit code-style differences do not authorize extending the Chinese preference to code.

Actual built candidate fixture: a cell containing only backtick-delimited `中文测试`. Preview DOM has `.cm-inactive-inline-code`, with computed Cascadia Code / Consolas / SFMono-Regular / Courier New / monospace. Editing DOM is plain backtick-delimited text, computed `"FishMark Table CJK", Georgia`; platform CJK becomes Microsoft YaHei. This violates the exemption even though the DOM transition itself is pre-existing.

Minimum direction: preserve the code exemption without introducing post-input DOM reconstruction. If a uniform plain-cell mapping cannot distinguish code and prose safely, explicitly bound/defer the candidate rather than silently changing that contract.

Evidence: `.artifacts/font-review/code-main.cjs`, `code/result.json`, `code/before.png`, `code/after.png`; this fixture uses the actual built product and native Electron click.

## Other review results and limits

- No production Windows font name is hardcoded: the face source comes from the user's `preferences.document.cjkFontFamily`. Windows names occur in fixtures/tests. The issue is local face semantics, not Windows branching.
- CSS is scoped to table inputs, with their preview CJK spans inheriting; it does not directly style outside-table prose or code blocks. It still includes inline-code raw characters while editing as described above.
- Cleanup cancels stale completion and removes its face/ready flag. No table DOM/input handler changes occur in the candidate. Existing reported insertion, selection replacement, undo/redo and repeat-entry evidence was inspected, not independently rerun wholesale.
- Installed Microsoft YaHei, Noto Sans SC and SimSun loaded through local faces in the independent fixture; an intentionally missing name failed safely without adding a face. Failure leaves the previous preview/edit mismatch, so it is fallback retention rather than a consistency fix for every preference.
- `normalizeFontFamily` only trims and accepts a CSS string; old presentation assigns that string directly to the CSS variable. Quoted family values, generic families and CSS fallback stacks cannot be treated as a single local face name. The fixture confirmed `local("Microsoft YaHei, serif")` fails even with Microsoft YaHei installed. A full app preference-stack scenario and quoted-name scenario were not run; compatibility mismatch follows from code inspection. Do not claim support for arbitrary pre-existing CSS font lists based on the current four lifecycle tests.
- No macOS/Linux font rendering, uninstalled/custom downloadable font, native Windows IME, multi-cell drag selection or arbitrary italic-face family was verified. These remain unmeasured, not passing.
- No new P1 found. Both P2 findings are contract regressions; the candidate should remain unaccepted until addressed or explicitly redesigned. Layout jumping remains separate and unfixed.
