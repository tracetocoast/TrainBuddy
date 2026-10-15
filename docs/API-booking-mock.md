# 约课排班 Mock API（对齐设计文档 API04–API10）

实现文件：`miniprogram/services/bookingApi.js`  
配置：`miniprogram/utils/scheduleConfig.js`

## 状态机

```
提交成功 → pending
  ├─ 教练 accept → confirmed
  ├─ 教练 reject → rejected（释放）
  ├─ 学员撤回 → cancelled（释放）
  └─ 超时 → expired（释放）

confirmed
  ├─ 规则内 cancel → cancelled
  ├─ 改期 ChangeRequest(pending) → 教练 accept（事务替换时段）/ reject|expired（原课保留）
  ├─ attendance in_progress → completed / no_show
```

**关键修复：** 仅在用户确认弹层并 `createBooking` 成功后才写入；取消弹层不创建预约。

## 接口形状（逻辑契约）

| ID | 方法 | 函数 | 说明 |
| --- | --- | --- | --- |
| API04 | GET/PATCH availability | `getAvailability` / `patchAvailability` | `base_revision` 乐观锁 |
| API05 | GET slots | `getSlots` | 返回 `startAt/endAt/status`；占用显示「不可约」不泄露学员 |
| API06 | POST bookings | `createBooking` | 需 `acceptedRulesVersion`；支持 Idempotency-Key |
| API07 | accept/reject | `decideBooking` | pending 专属；过期返回 `BOOKING_EXPIRED` |
| API08 | cancel | `cancelBooking` | 校验取消窗口 |
| API09 | changes | `requestChange` / `decideChange` | 旧课保持 confirmed 直至接受 |
| API10 | attendance | `setAttendance` | in_progress / completed / no_show |

成功响应：`{ data, request_id }`  
失败：`{ code, message, retryable? }`（Promise reject）

## 冲突规则

区间重叠：`new_start < existing_end && new_end > existing_start`，含 buffer。  
同时校验教练占用与学员占用。

## 建议联调路径

1. 陈佳宁绑定 `LINYE7D`
2. 约课页选真实日期 → 点预约 → **取消**弹层 → 我的预约仍为空
3. 再预约并确认提交 → 状态 pending
4. 林野登录 → 排课「待处理」→ 接受 → confirmed
5. 学员申请改期 → 教练拒绝 → 原课时间不变
6. 教练「排班规则」关闭明天上午 → 学员端对应空档「不可约」

## 验收对照（前端 mock）

- AC03/AC04：重叠/缓冲冲突 → `SLOT_CONFLICT` 并刷新
- AC06：pending 超时后 accept → `BOOKING_EXPIRED`
- AC07：改期拒绝 → 原课保留
- AC09：取消确认弹层 → 无预约创建
