# AI 能力与性能测试报告

## 1. 实现概要

内置 AI 位于 `src/core/ai.mjs`，**完全本地运行**（无外部大模型、无需下载权重）。

| 组件 | 方法 |
|---|---|
| 合法行动生成 | `enumerateActions`：仅用公开占位 + 图拓扑；隐藏守方 `targetType=null` |
| 局面评估 | `evaluate`：子力（未知敌子用期望值）、军旗安全、敌旗候选城逼近 |
| 暗棋推断 | `unknownPool`：仅基于已揭示类型 + 剩余子总数；未知敌子按期望值 |
| 决策 | 三档：简单=高随机合法行动；普通=1-ply 贪心；困难=贪心 + 攻占敌城奖励 + 避免重复 |
| 抢旗 | 攻占敌城 +30；向敌城推进 ×4；避免重复 -25 |

## 2. 公平性（信息隔离）

- AI 只消费 `getVisibleState` 语义的公开信息；`enumerateActions` 对隐藏守方一律 `targetType=null`。
- **自动化验证**（`tests/ai.test.mjs`）：
  - 同一可见局面、隐藏守方分别为「地雷」与「步兵」时，AI 可选动作集**完全相同**，且攻击项 `targetType=null`。
  - 两地雷/步兵局面的 `evaluate` 值**相同**（不依赖隐藏类型）。
- 未实现任何读取 `state.pieces` 隐藏 `typeId` 的旁路；AI 主循环只调用公开接口。

## 3. 性能

| 指标 | 数值 |
|---|---|
| 单步决策（困难档） | 约 **1.8 ms** |
| normal vs normal 20 局 | 总耗时 16.5 s，**824 ms/局** |
| hard vs easy 12 局 | 总耗时 10.7 s，**894 ms/局** |
| 浏览器 AI 思考 | 260–320 ms 延迟 + 单步 <5ms，**无冻结** |

> 远低于需要 Web Worker 的阈值；Web 界面以 `setTimeout` 让出主线程，AI 回合不阻塞 UI。

## 4. 对局统计（AI 对局验收）

### normal vs normal（20 局）
- 完成 **20/20**，异常 **0**
- 胜负：红 8 · 黑 11 · 和 1
- 平均回合 161.6（最长 252）
- 结束原因：`flag_captured` 19 · `repetition` 1

### hard vs easy（12 局，困难执红 vs 简单执黑）
- 完成 **12/12**，异常 **0**
- 胜负：困难 9 · 简单 0 · 和 3
- 结束原因：`flag_captured` 9 · `repetition` 3

> **难度差异结论**：困难档对简单档 9:0 全胜（另有 3 和），难度分级体现真实决策差异，而非延迟/随机。

## 5. 诚实声明（不得夸大）

- 困难档为「1-ply 贪心 + 启发式」，**不是**深度搜索或概率推断的强 AI；未实现蒙特卡洛/期望搜索。
- 仍有少量重复局面和棋（normal 20 局中 1 局，hard-vs-easy 12 局中 3 局），说明 AI 在长局中偶有推进不足。
- 该成绩反映「能正常对局并结束、难度有差异」，**不代表高战略水平**。

## 6. 复现命令

```bash
node demo/ai-sim.mjs 20 normal normal
node demo/ai-sim.mjs 12 hard easy
node --test tests/ai.test.mjs
```
