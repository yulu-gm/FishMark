# Independent review — Outline load ownership (2026-10-09)

Reviewer: separate `/root/heading_geometry_review` agent, read-only, no production edits, tests, system changes or push. Base5c866ed1137623cfa703026c3be037ad661ec179.

**No P0/P1/P2 blocking finding.**

The layout effect updates the callback ref on every committed render, before document-loading passive effects. Assignment alone does not trigger a render or rebuild the controller. The persistent controller therefore invokes the current load callback.

The existing derived-data controller still rejects stale identities, clears old timers and de-duplicates the same snapshot. Diagnostic-v3 shows current epoch3/load2 with callback epoch2/load1 despite correctly parsed new headings, supporting the repair's scope.

Publishing after `setDocumentIdentity` preserves the existing seal/discard/bind/reset order. It does not create a text or selection transaction, reparse a document or reset native history. The new epoch-only test checks snapshot reuse, selection, Undo/Redo and absence of onChange. Null-identity publication is rejected by the existing scheduler and the no-document projection remains empty; composition freeze logic is unchanged.

The added persistent-controller callback contract covers publication during replacement and after it. The reviewer verified candidate-v5 **12/12** real-window checks: reload, later open, switch back, secondary-process route, heading deletion/re-addition, mode preservation, bottom navigation and20/30/10px levels. The corrected final-item selector targets the actual last item; the previous selector's false navigation assertion was a probe error.

Review limitations: reviewer did not run tests or native IME. Raw targeted-v4 had398 pass/2 failures; both identities subsequently matched the unchanged exact-known allowlist. Author's final full Windows gate remainsFAIL with3221 pass/10exactknown/1unexpected symlink skip; it is not represented as green or approved for push. Final production window separately repeats12/12, and formal bundle1429998/1430000 passes with only2bytes margin.
