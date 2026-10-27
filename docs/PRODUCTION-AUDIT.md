# TrainBuddy 生产准备审计与阶段计划

审计基线：本地 main `b8d5df1`，2026-10-27。实施分支：`deploy/production-readiness`。未连接腾讯云、未执行生产迁移、未清空本地数据。现有自动测试基线为 103 项。

## 当前架构与阻断项

| 范围 | 代码证据与风险 | 生产准备要求 |
| --- | --- | --- |
| JSON 存储 | `server/src/store/memoryStore.js` 启动同步读取全量文件；浅合并默认结构；读失败静默回退空库，随后 seed 可覆盖历史 | 损坏文件必须中止启动；迁移前留只读副本、哈希、数量与完整结构验证 |
| 持久化 | `persist()` 全量 JSON → 固定 `.tmp` → rename；没有跨进程锁、WAL、备份或刷盘保证 | PostgreSQL 作为唯一生产存储；提交前不能向客户端返回成功 |
| 事务 | `tx()` 只串行化本进程 Promise，无失败回滚；领域服务通过 `asApp.persist()` 可在事务中途落盘；GET 也会修改过期预约、余额等 | 请求级数据库事务涵盖认证、权限、幂等、业务及响应缓存；失败整体回滚；跨实例共同加锁 |
| API 耦合 | 路由、auth、idempotency、friends 和所有领域服务直接访问 `store.state`；不能仅把 `persist()` 改成异步 SQL | 第一阶段使用 PostgreSQL JSONB 兼容存储保留全部契约；第二阶段逐领域替换 repository，不能把兼容层描述成已完成关系化 |
| 登录 | `authService.wechatSession` 把 code 当演示账号映射，无参默认陈佳宁；`ops_admin` 可取得管理员 | 生产必须通过微信 code2Session；拒绝 accountKey 和演示 code，不导入演示管理员权限 |
| Session | token 明文作 sessions 对象键，七天有效，无服务端退出端点 | 高熵随机 token；库中只存 SHA-256；支持撤销与过期；迁移清除旧会话但保留原始归档 |
| 权限 | `/admin/*` 有 ops 检查，但演示登录可绕过身份根基；复查发现课后表创建、预约详情/列表、部分教练操作、语音任务读取及时间线私密备注存在遗漏 | 补角色/资源归属/当前绑定；清理任务仅本人或 ops 可查；解绑后使幂等缓存授权上下文失效；管理员额外保护 |
| 媒体 | `mediaService` 上传和签名地址包含 mock 域名，complete 仅登记元数据；水印可能只有字段 | 私有 COS、实际字节校验、水印、删除清理、授权撤回与真机验收完成前生产关闭媒体链路 |
| AI/语音 | Qwen、豆包、DeepSeek、MiniMax 有适配代码；存在 demo/mock 回退；部分远程调用在事务内执行 | 不能以“已配置”当作真实验收；生产先关闭未验收链路，后续独立任务队列、限额、回调认证及媒体集成验收 |
| 支付/通知 | 支付是占位；outbox 站内事件不等于微信订阅消息投递成功；教练申请仅返回 pending，未持久化申请 | 支付、外部通知和申请审核流程不能标记已上线；必要路由返回明确不可用 |
| 部署 | 无容器、PostgreSQL 迁移、HTTPS、自动备份、恢复演练 | Compose 私有数据库网段、持久卷、健康检查、TLS、日志轮转、备份与恢复到独立库验证 |
| 客户端 | API 地址本地写死；演示账号 UI、隐私说明及 wx.login 入口仍是体验流程 | 由构建环境生成 release/trial 地址；release 强制 HTTPS 公网域名，隐藏演示账号，完成微信隐私与域名配置 |
| 密钥 | `.env` 已忽略，但未全面覆盖环境变体、dump、证书；日志可能打印原始异常 | 扫描已跟踪文件并仅报告路径/行号，历史扫描结果与疑似项需复核；密钥轮换不能靠删除 Git 文件解决 |

## PostgreSQL 模型与演进

第一阶段采用 `runtime_state(id, revision, document JSONB)` 作为**兼容模型**，保留所有未知扩展字段、顺序、账本、分享、幂等与版本快照，避免一次重写导致数据丢失。所有 API 请求在同一行的 `FOR UPDATE` 锁内读取最新状态并提交；不在每个进程缓存一份陈旧状态。此方式吞吐受限，仅供单服务初期/预发布验收，不能声称已完成关系型建模或高并发改造。

目标关系模型（下一阶段逐域迁移）：

- `users(id PK, wechat_openid UNIQUE, status, profile)`；`user_roles(user_id FK, role, status, UNIQUE(user_id,role))`；`sessions(token_hash PK, user_id FK, expires_at, revoked_at)`。
- `coach_profiles`、`bindings`、`binding_scopes`、`invitations`；每名学员仅一条 active primary 绑定的部分唯一索引，撤权/解绑与可读性在同一事务处理。
- `schedule_rules`、`schedule_exceptions`、`bookings`、`booking_changes`；timestamptz 存绝对时间，Asia/Shanghai 生成业务日；active 预约对教练/学员时间区间使用 GiST 排斥约束（包含缓冲），创建/改期/取消原子提交。
- `training_plans`、`plan_revisions`、`session_exercises`、`actual_sets`、`training_sessions`；`UNIQUE(plan_id,version)`，已发布/已完成快照不可覆盖，完成幂等与下次计划生成同事务。
- `daily_logs`、`meals`、`water_records`、`body_states`、`day_shares`、`feedback`；按主体/业务日/类别索引，分享不能回溯默认开启，特殊状态单独授权。
- `body_measurements(id PK, user_id FK, measured_at, business_date, values JSONB)`；保留同日多次测量，旧日汇总不可覆盖追加历史。
- `friend_relations`、`friend_comments`、`media_assets`、`media_cleanup_jobs`、`ai_tasks`、`voice_tasks`、`task_attempts`；任务状态迁移版本锁，媒体归属 FK，外部副作用经 outbox/worker 执行。
- `entitlement_balances`、`entitlement_ledger`、`subscriptions`：检查 balance/reserved 非负、核销 charge_key 唯一，额度预占/核销/释放原子化；`idempotency(actor,method,path,key)` 唯一且校验请求摘要。
- `outbox`、`notifications`、`ops_audits`、`migration_runs`；保留迁移来源哈希、验证哈希、结构计数、工具版本，审核与操作记录可追溯。

关系模型迁移应先建立映射/孤儿报告，再导入到隔离库、完整对账；不得通过丢弃不满足 FK 的历史记录来“迁移成功”。切换 repository 前逐域双读比对，避免 JSON 与关系表双写冲突。

## 分阶段计划与验收

1. **审计与保护**：独立分支，记录当前状态与基线；无生产连接，所有本地配置保留。交付本文。
2. **存储与迁移**：修复 JSON 异常/回滚；实现 PostgreSQL 请求事务兼容层、版本化 schema、空库初始化、只读 dry-run 和全量校验迁移。迁移只允许空目标，保存原始文档，拒绝未知/损坏结构；旧会话失效。运行原测试和迁移/事务测试；真实 PG 测试必须独立声明是否实际执行。
3. **身份与生产门禁**：真实微信登录、哈希会话、退出撤销、限流、管理接口二道保护、日志脱敏；生产禁用演示登录/种子/Mock/未验收 AI、媒体、支付。测试成功/失败登录、伪造角色、禁用/过期/注销、管理越权和门禁。
4. **部署与客户端环境**：多阶段镜像、非 root 运行、Caddy HTTPS、数据库私有网络与持久卷、ready/live 探针、优雅退出、环境模板、备份计划与恢复说明、开发/体验/发布 API 配置及密钥扫描。运行静态/配置检查、全部回归、可用环境中的 PG/容器集成测试。
5. **上线前人工验收（不在本次自动部署）**：腾讯云隔离预发布库迁移演练、压力/并发/恢复演练；真实微信凭证和域名/隐私备案；管理账号独立授予；供应商真实验收；备份异机加密与告警。完成检查才可申请正式切流。

## 官方依据

[PostgreSQL 锁与事务](https://www.postgresql.org/docs/current/explicit-locking.html)、[Compose 健康依赖](https://docs.docker.com/compose/how-tos/startup-order/)、[Caddy 自动 HTTPS 与 DNS/端口要求](https://caddyserver.com/docs/automatic-https)。微信官方 code2Session 页面本次工具读取失败，协议实现须在微信测试 AppID 下再次验收，不能声明已通过真实微信联调。
