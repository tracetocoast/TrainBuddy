# 统一业务 API（Node）

对齐设计文档第 16 节 **API01–22、API29、API31**。

## 启动

```bash
cd server
npm install
npm start          # http://127.0.0.1:8787
npm test           # AC03–09 / AC10 / AC15–25 等
npm run reset      # 清空并重新 seed
```

演示邀请码：`LINYE7D`  
演示登录 `accountKey`：`student_only` | `coach_approved` | `student_claim_coach` | `coach_b`

小程序：`miniprogram/config.js` → `API_BASE_URL`，开发者工具勾选「不校验合法域名」。

## 横切约定

| 能力 | 实现 |
| --- | --- |
| 幂等 | 写操作头 `Idempotency-Key`；同键同体复用，同键异体 `IDEMPOTENCY_CONFLICT` |
| 版本 | `base_revision` / `If-Match` → `409 REVISION_CONFLICT` |
| 权限 | 身份 + 角色 + 绑定 + 授权类别（13.1） |
| 业务日 | `Asia/Shanghai`（`server/src/lib/time.js`） |
| 响应 | 成功 `{ data, request_id }`；失败 `{ error:{code,message,retryable,fields}, request_id }` |

## 路径前缀

`/api/v1`

主要路由见 `server/src/routes/index.js`。

## 小程序改造

- `services/*` 改为 HTTP 客户端
- 本地 `store` **仅**会话与草稿（`lianzida_state_v6`）
- 业务读写以服务端结果为准

## 验收（`npm test`）

| 用例 | 覆盖 |
| --- | --- |
| AC01 | 自授 coach 拒绝 |
| AC02 | 未绑定学员 403 |
| AC03–08 | 冲突占用、缓冲、跨教练、过期、改期 |
| AC09 | 无请求不建预约（契约） |
| AC10 | 三组重量独立 |
| AC15–21 | 草稿不可见、finalize 幂等、快照、计数 |
| AC22–25 | 共享可见性、休息日记、完成率暂无 |

## 微信云开发

当前交付为可本地运行的 Node HTTP 服务。上云时可：

1. 将 `server` 部署到云托管 / 云函数 HTTP，或  
2. 用云函数包装同一 `routes`（保持路径与幂等语义不变）

不推荐把业务写进仅前端 mock。
