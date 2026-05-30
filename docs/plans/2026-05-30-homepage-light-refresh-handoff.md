# homepage-light-refresh handoff

Date: 2026-05-30

## What Changed

- Restored homepage-related files to the repository baseline before reworking the page.
- Rebuilt `site/index.html` from the original static homepage structure using a light neutral palette.
- Kept the original full-viewport hero rhythm, editor preview, feature sections, shortcuts, CTA, `fade-up` scroll reveal, and cursor blink animation.
- Changed the brand and section icons to pale neutral blue-gray instead of green.
- Removed the developer stack section and replaced it with a customer-facing Markdown syntax support section.
- Updated homepage copy to focus on writing, tabs, outline, clipboard images, autosave, search/replace, HTML export, shortcuts, and supported syntax.
- Updated the GitHub Pages site test to lock the new navigation, customer-facing copy, syntax labels, light styling, and original motion hooks.

## Files

- `site/index.html`
- `src/main/github-pages-site.test.ts`
- `docs/test-report.md`
- `docs/plans/2026-05-30-homepage-light-refresh-intake.md`
- `docs/plans/2026-05-30-homepage-light-refresh-handoff.md`
- `reports/task-summaries/homepage-light-refresh.md`

## Verification

- `npm.cmd run test -- src/main/github-pages-site.test.ts`
- `rg -n -e 本地优先 -e local-first -e Local-first -e 而非 -e 不是 -e 而是 -e 技术栈 -e Electron -e React -e TypeScript -e CodeMirror -e micromark -e Vitest -e '#tech' -e 'tech-' -e 'v0\\.2\\.2' -e green -e 绿色 site/index.html`
- `npm.cmd run lint`
- `npm.cmd run typecheck`
- `git diff --check`
- `npm.cmd run build`
- Chrome headless screenshots for desktop top, mobile top, editor preview after scroll, and syntax section after scroll.

## Manual Acceptance

1. Open `file:///D:/FishMark/FishMark/site/index.html`.
2. Confirm the first viewport keeps the original centered homepage rhythm but uses a light palette.
3. Confirm the fish logo and small UI icons are pale neutral icons, not green.
4. Scroll through the page and confirm the original reveal animation still appears.
5. Confirm the page no longer shows the developer technology stack section.
6. Confirm the syntax section lists the currently advertised Markdown syntax support.
7. Confirm mobile width around 390px does not clip the hero heading, copy, or buttons.

## Known Risk

- This is a static marketing-page change; it does not verify app editor behavior beyond existing documented capabilities and the homepage static tests.

