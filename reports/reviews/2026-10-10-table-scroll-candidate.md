# 独立只读审查：首项 gate 失败与撤回

现有 `/root/heading_geometry_review` 检查候选源码及7步原始报告。首次点击scrollTop305→13841，+13536px，Range高0；最终写入来自CM默认scrollIntoView，不是handler成功后的锚定补偿。因此H1的handler后锚定假设尚未得到验证。

候选在身份/选区/owner/offset/有效Range不匹配时返回false，没有盲吞请求；验证后可消费零位移。上游hasOwnedSelection不足以识别虽仍在editor内但无有效caret几何的preview→plain选区，可能跳过必要恢复。03之前驱动显式prepareVisible，不能算自动恢复。停止扩大矩阵合理。

本批无输入事件、文档长度不变；保存/composition/undo安全性并未得到本批验收。随后再次只读核验：git status及产品diff为空，table-caret-reveal.ts不存在，table-widget哈希1ed5826db1c80f3b71c23ecee2108dfc4c7aac80f48371b0af8ebe4dbeb92079匹配。失败候选撤回完整。审查未运行新UI。
