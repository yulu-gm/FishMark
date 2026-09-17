# RF-HARDEN-001 intake

用户授权：由 work agent 修复 2026-09-17 复审的切换前阻断，主 agent 独立验收及调整后续路线。

范围：恢复基线、可靠 ACK/退出顺序；增量正确性及消除普通输入隐式完整解析；桥接版本校验、版本单调、派生快照共享。保留现有技术栈，不切换 RF-506。

解析只在可以证明块边界不变时局部重解析；结构与全局定义编辑显式完整解析并暴露原因。通用 parser continuation 优化后续实现，不能把 fallback 当作局部性能完成。

实现者运行聚焦回归；主 agent 跑 build/lint/typecheck 并做最终独立验收。路线、主进度、backlog/test-report 由主 agent 更新。真实平台 IME/history 与全量性能仍需切换前门禁。
