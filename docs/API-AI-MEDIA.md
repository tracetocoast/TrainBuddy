# 媒体 · AI 任务 · 体态 · 目标图 · 咨询（API23–28）

对齐设计文档第 9–10 节与验收 **AC26–32、AC40**。

## 隔离原则

| 模式 | 行为 |
|------|------|
| `mode=demo` | 走 mock 适配器，结果带 `is_demo`；与真实任务分集合／分标记 |
| `mode=real` | 默认 `AI_PROVIDER=unavailable` → 任务 `failed` / `PROVIDER_NOT_CONFIGURED`，**不得显示成功** |
| 本地试点 | `AI_PROVIDER=mock` 可跑通真实路径，仍无伪造「已接入商用模型」文案 |

小程序 AI 页提供「真实／演示」切换；演示结果带 DEMO 标签。已移除原型「82/100」总分。

## 接口一览

| API | 路径 | 说明 |
|-----|------|------|
| 23 | `POST /media/upload-intents`；`POST /media/{id}/complete` | 上传凭证与完成登记 |
| 24 | `GET /media/{id}/access`；`DELETE /media/{id}` | 短期 URL；删除后 410 |
| — | `GET /media/cleanup-tasks/{id}` | 清理任务状态（AC32） |
| — | `POST /media/{id}/export-watermark` | 导出层水印 + 分享范围提醒（AC29） |
| 25 | `POST /ai-tasks`；`GET /ai-tasks/{id}` | 类型 `posture_scan` \| `goal_image` |
| 26 | `POST /ai-tasks/{id}/cancel` \| `retry` | 单节点重试不重复核销成功额度 |
| — | `POST /ai-tasks/{id}/revoke-consent`；`.../callbacks` | 撤权与迟到回调（AC30/31） |
| 27 | `POST /posture-reports/{id}/review` | 教练复核，不覆盖 AI 原文 |
| 28 | `POST /consultations`；`PATCH ...` | 咨询；幂等键返回原单；`order_id` 恒为 null |

## 体态报告

- **无总分**（`overall_score` 恒为 `null`）
- 项目结论：`no_obvious` / `needs_attention` / `unable_to_judge`
- 缺侧面、多人、严重遮挡 → `need_retake`，不生成默认正常报告（AC26）
- 骨盆无法判断时显式 `unable_to_judge`（AC27）
- AI 输出 `draft`；教练 `reviewed` / `needs_more_info` / `rejected`

## 目标图

- 多节点（默认 2/3/6 月，最多 3）
- 水印文案写入结果媒体元数据／导出层：「AI 目标效果模拟，非训练结果保证」
- 部分失败 → `partial`，`POST .../retry` 带 `node_key`（AC28）
- 撤权后迟到回调 `applied: false`（AC30）
- 账本同 `callback_id` 最多核销一次（AC31）

## 咨询（AC40）

- 按钮连点：同一 `Idempotency-Key` 返回同一 `consultation_id`
- 不生成订单；`converted` 须引用真实 `booking_id`
- 仅可咨询已绑定教练；文案用「咨询方案」而非「立即购买」

## 测例

```bash
cd server && AI_PROVIDER=mock npm test -- test/ac-ai-media.test.js
```
