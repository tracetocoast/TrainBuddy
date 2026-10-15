# 训练计划 / 会话 Mock（设计文档第 7 节）

实现：`miniprogram/services/trainingApi.js`

## 模型分离

| 实体 | 含义 |
| --- | --- |
| TrainingPlan + PlanRevision | 未来安排；发布后不可就地覆盖 |
| WorkoutSession + ActualSet | 一次实际训练；每组独立 ID/重量/次数/状态 |

开练时复制计划快照到 Session；之后改计划不影响本次。

## 关键路径

### 教练课后表 C04（`pages/record`）

1. 选择绑定学员 → 创建/恢复 **draft** 会话（`shared_at` 为空）
2. 点击添加动作，或「文字录入」解析候选（缺组数/次数不自动写入）
3. 逐组编辑 ActualSet →「确认并同步」
4. `finalizeSession(share=true)` → 正式版学员可见；触发**规则版**下次计划草稿（复制完成值，**不 +5kg**）
5. 同一 `completion_key` 再提交幂等，不重复计数

### 下次计划 C05（`pages/plan-edit`）

- 状态：`draft → published`（旧 published → superseded）
- 可改组重量/次数/标题/日期；发布需显式确认

### 学员开练（`pages/workout`）

1. 选已发布计划 → `startSessionFromPlan`（可恢复未完成）
2. 每组独立完成/跳过；草稿随改保存
3. 结束：`completion_key` 幂等；零完成组不可计次（可放弃）

## 验收对照

| 用例 | 期望 |
| --- | --- |
| AC10 | 三组重量 50/50/45 分别保存 |
| AC11 | 「50kg 5次」无组数 → 待确认，不自动补组 |
| AC15 | 草稿不同步；私人备注不同步 |
| AC16 | 同步成功；计划生成失败不撤销训练表 |
| AC17 | finalize 重试三次只完成一次 |
| AC18–20 | 发布新计划；已开练会话保留旧快照 |
| AC21 | 同日两次会话计 2；重复结束不重复计 |

语音转写未接入；当前为文字结构化路径。
