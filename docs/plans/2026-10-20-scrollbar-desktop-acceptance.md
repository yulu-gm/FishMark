# Pending desktop acceptance and DPI coverage

Status: awaiting the user's explicit foreground permission through the parent thread. No visible window, focus request or desktop input has been started. Current evidence uses hidden/offscreen Electron 41.2.0 / Chromium 146.0.7680.179 and browser-dispatched input, not OS mouse capture.

## Preparation after permission

Open one clearly labelled candidate window with fresh temporary appData/userData and disposable plain-text/table fixtures. Keep existing user windows and documents intact. Record candidate source hashes, exact PID/window identity, renderer/devicePixelRatio, content bounds, zoom and display scaling. Capture only this test window's content and events.

Do not rerun the security-blocked input guard or replace it with another OS injector. The user can perform the physical mouse actions while the assistant passively records pointer coordinates/capture events, thumb bounds/paint, source selection, scrollTop/scrollHeight and release stability. If automated OS input is specifically required, the old security blocker still applies and must be reported separately.

## Approximately 2–3 minutes at the current display scale

1. Drag the thumb down/up, reverse while holding, move far left/right, cross the actual window boundary and return. It should remain controlled by the scrolling axis, retain capture while the OS supplies the gesture, and preserve document selection.
2. Release outside the track/window, return with no button held, and wait. Scrolling must not restart or return to the drag origin. If capture is cancelled by the OS or focus loss, it must stop safely without rollback.
3. Hold below/above the thumb. Expect one immediate page, an initial delay, then repeated pages. Leave the track while still held: pause. Reenter: resume. When the thumb reaches the pointer: stop without oscillation. Release/cancel: no further pages.
4. Repeat the essential drag/held-track actions after clicking a visible table cell. Check focus/selection and source preservation. Exercise wheel and scrollbar PageUp/PageDown/Home/End, then resize the test window.

Record each physical observation separately from offscreen assertions. Reversed scrollTop alone is not a visual failure: compare pointer input, actual thumb position, content anchors and changing document extent. No full original document is needed for these interaction checks.

## DPI matrix

Read the existing Windows scale; do not change display, registry, accessibility or security settings. If monitors at different scales are already available, repeat a short thumb-drag + held-track cycle at 100%, 125%, 150% and 200%, including moving the test window between those monitors. Check for thumb/cursor drift, incorrect hit regions, clipped controls, delayed capture release and stale geometry after the monitor transition. Allow roughly 30–45 seconds per additional available scale, beyond the basic session.

If a scale or another monitor is unavailable, mark that physical cell NOT_TESTED. Renderer DPR emulation at 1.25/1.5/2 is useful background coverage but does not certify Windows per-monitor DPI, OS cursor coordinates or actual cross-window capture. A physical touchpad and a screen reader require separate checks when those devices/tools are available; keyboard/ARIA assertions do not replace them.

## Stop conditions

Stop on unexpected focus theft, source changes, scrolling after release, capture stuck after cancellation, or a safety-tool denial. Preserve that attempt and report the precise observed action and state. No commit, push or release is authorized by this acceptance plan.

## Release preparation update — 2026-10-20

The earlier candidate-only and pending-permission statements above describe the historical checkpoints. The user subsequently manually tested the explicitly labelled candidate window and reported no issues, then confirmed committing to main and releasing Windows 4.0.1. Startup records identify `fishmark-scrollbar-repeat-20261020/dist/index.html`, PID 50216, Electron 41.2.0, DPR 1, fresh temporary profile and disposable document. No automated OS input was issued. This feedback is not a complete per-case desktop test matrix and does not certify physical touchpad, screen-reader, per-monitor DPI or macOS coverage. Those remain untested. The released product changes are byte-identical to the validated candidate; only documentation and release version metadata are updated for publication.
