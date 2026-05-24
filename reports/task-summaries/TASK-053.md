# TASK-053 Typora oracle 与 FishMark baseline

结果：PASS

## 本轮完成内容

- 将 Typora-like editing alignment 拆成 TASK-053 到 TASK-058，并写入 backlog/progress。
- 建立 Typora oracle artifact 协议、16 个 case 的 case matrix、Phase 1 baseline report 与 TASK-053 handoff。
- 在 Windows Typora 1.13.4 下捕获 12 个可靠 oracle case；4 个 whitespace / structural blank GUI 定位不可靠 case 保持 `blocked`。
- 将 FishMark editing-experience probe 映射到首批 12 个 captured `caseId`，支持 `FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_CASE` 与 `FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_GROUP=oracle-captured`。
- 为 mapped oracle case 增加 source、selection 与 visual assertions；当前 FishMark baseline 为 10 pass / 2 fail。

## 验证

- `FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_CASE=empty-type-hash / empty-type-three-spaces / paragraph-end-enter / heading-end-enter npm.cmd run test:editing-experience`：通过，均输出稳定 `caseId` 与视觉断言。
- `FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_GROUP=oracle-captured npm.cmd run test:editing-experience`：预期 exit 1，12 个 case 中只有 `heading-end-repeated-enter` 与 `structural-blank-arrow-down` 失败。
- `npm.cmd run typecheck`：通过。
- `npm.cmd run lint`：通过。
- `npm.cmd run build`：通过。
- `git diff --check` scoped 到 TASK-053 文件：通过，仅有 Windows LF/CRLF warning。
- JSON 校验：通过，16 个 case 均有 JSON 记录，统计为 captured 12 / blocked 4。

## 人工验收

1. 打开 `docs/plans/typora-like-editor/oracle/case-matrix.json`，确认 16 个 case 都有稳定 `caseId` 与 capture status。
2. 打开 `docs/plans/typora-like-editor/2026-05-24-phase-1-baseline-report.md`，确认 captured 12、blocked 4、FishMark baseline 10 pass / 2 fail。
3. 运行 `$env:FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_CASE='empty-type-hash'; npm.cmd run test:editing-experience`，确认输出含 `caseId: "empty-type-hash"` 与 `details.visualAssertions`。
4. 运行 `$env:FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_GROUP='oracle-captured'; npm.cmd run test:editing-experience`，确认失败只限 `heading-end-repeated-enter` 与 `structural-blank-arrow-down`。
5. 打开 4 个 blocked JSON，确认它们明确写明 failed capture 证据和下一步人工捕获步骤。

## 剩余风险

- 4 个 blocked case 仍不能作为 Typora oracle expectation；后续需要人工捕获或更强 GUI 自动化。
- 默认 legacy full `npm.cmd run test:editing-experience` 本轮单独运行 10 分钟超时，未作为 TASK-053 通过证据。
- 当前工作树有大量非 TASK-053 dirty changes；本总结只验收 TASK-053 scoped 文件。
