# homepage-light-refresh intake

Date: 2026-05-30

## Goal

Restore the homepage-related files to the repository baseline first, then rebuild the static homepage from the original page rhythm as a light version.

## Scope

- `site/index.html`
- `src/main/github-pages-site.test.ts`
- `docs/test-report.md`

## Requirements

- Keep the original homepage structure, section rhythm, scroll-triggered `fade-up` animation, and cursor blink preview.
- Change the homepage to a light color system.
- Use light neutral icon treatment instead of green icons.
- Replace developer-facing stack details with customer-facing capabilities and currently supported Markdown syntax.
- Update copy and avoid the disallowed homepage phrases called out in the request.

## Out Of Scope

- No changes to app runtime behavior.
- No changes to Electron, renderer, preload, or editor internals.
- No changes to unrelated dirty files in the working tree.

