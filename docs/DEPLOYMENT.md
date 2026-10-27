# Ubuntu / 腾讯云部署准备与运维手册

本次仅准备代码，**以下服务器命令尚未执行**。先读 [审计及阶段计划](PRODUCTION-AUDIT.md) 和 [验收记录](PRODUCTION-VERIFICATION.md)。当前是 PostgreSQL JSONB 请求事务兼容层，不是已经关系化的高并发系统；未经隔离预发布、真实微信和恢复演练，不应直接公开运营。

## 1. 交付和限制

后端 Node.js 22 + Express；`pg` 驱动；数据库 PostgreSQL 17；Caddy 自动 HTTPS；Docker Compose。只发布 80/443，API 和数据库均不映射宿主机端口；腾讯云安全组仅开放 80/443 和限定运维来源的 SSH，不开放 5432/8787。

API 非 root、只读容器文件系统、丢弃 Linux capabilities；数据库持久卷 `pgdata`，证书持久卷 `caddy_data`。运行账号仅可 SELECT/UPDATE `runtime_state`，不读 `migration_runs` 原始归档；DDL、初始化、导入、管理角色引导使用独立迁移账号，不把它的密码交给 API。备份使用独立只读账号，不获得迁移写权限。

**当前容量边界**：每个 API 请求获取同一状态行锁，含 GET、认证、权限和幂等检查。成功响应在 COMMIT 后发送；失败响应回滚，库不可用不返回伪造成功。此阶段吞吐有限，锁等待 5 秒、SQL 超时 20 秒、请求事务超时 25 秒；大数据量和高并发需要关系 repository、短事务及任务队列后再扩容。生产关闭 AI/媒体/语音，避免网络生成任务持锁。进程内限流只适用于当前单 API 容器；扩容前需共享限流与网关限流。

## 2. 服务器预备（人工审阅后）

选择隔离的 Ubuntu 服务器，安装受支持的 Docker Engine 和 Compose 插件；为 API 配置真实域名 A/AAAA 到服务器。确认域名备案、微信合法域名/隐私要求、80/443 网络可达，AppID 与小程序项目一致。Caddy 自动 HTTPS 的 DNS、端口及持久化要求见 [官方文档](https://caddyserver.com/docs/automatic-https)。发布前固定经验证的镜像 digest；仓库模板的 Node/Postgres/Caddy major 标签仍会跟随补丁更新。

在仓库根目录准备配置（不提交实际值）：

```sh
cp deploy/.env.example deploy/.env
chmod 600 deploy/.env
```

分别生成四个不同的随机 hex 密码，避免连接 URL 中的特殊字符编码问题；填入 PostgreSQL 管理员、迁移账号、运行账号和只读备份账号字段。另填真实微信 AppID/AppSecret、至少 32 字符的独立 ADMIN_API_KEY、域名及 ACME 联系邮箱。密钥不得发送到聊天、复制到小程序或写进 Dockerfile。不要使用示例/测试密码。环境文件属于服务器敏感配置，Docker 管理权限等同于可读取这些秘密。

审核兼容层限制后再把 `PRODUCTION_COMPAT_STORE_ACK` 设为 `single-document-locking-reviewed`。缺字段、JSON 生产存储、Mock AI 或启用支付占位都会阻止生产启动。

```sh
docker compose --env-file deploy/.env -f deploy/compose.yaml config --quiet
docker compose --env-file deploy/.env -f deploy/compose.yaml build
docker compose --env-file deploy/.env -f deploy/compose.yaml up -d db
docker compose --env-file deploy/.env -f deploy/compose.yaml run --rm migrate
```

数据库初始化脚本只在**空持久卷**执行。修改 `.env` 里的数据库密码不会自动更新既有角色；密码轮换要先在数据库变更，再协调服务重启。绝不要为使初始化重跑而删除现有卷。

## 3. 两种初始化方式，只能选一种

全新项目、不导入历史数据时：

```sh
docker compose --env-file deploy/.env -f deploy/compose.yaml run --rm migrate node scripts/database.js init-empty
```

命令只创建空业务状态，不创建演示用户、管理员、邀请码或免费权益。目标已存在时 INSERT 失败，不覆盖。

有历史 `store.json` 时，**先停止旧 API 和所有写入者**，复制文件到受限目录并保存原始 SHA-256。不要运行 `seed`/`reset`；不要先 `init-empty`。原文件只读保存，迁移工具不会改它。

```sh
mkdir -p deploy/migration-input
chmod 700 deploy/migration-input
# 人工复制经过确认的完整 store.json 为 deploy/migration-input/store-source.json
chmod 400 deploy/migration-input/store-source.json
sha256sum deploy/migration-input/store-source.json
docker compose --env-file deploy/.env -f deploy/compose.yaml run --rm -v "$PWD/deploy/migration-input:/migration:ro" migrate node scripts/database.js import /migration/store-source.json --dry-run
docker compose --env-file deploy/.env -f deploy/compose.yaml run --rm -v "$PWD/deploy/migration-input:/migration:ro" migrate node scripts/database.js import /migration/store-source.json --apply
docker compose --env-file deploy/.env -f deploy/compose.yaml run --rm -v "$PWD/deploy/migration-input:/migration:ro" migrate node scripts/database.js import /migration/store-source.json --verify
sha256sum deploy/migration-input/store-source.json
```

执行 apply 前核对 dry-run 的源字节哈希、业务集合数量和预期导入哈希。apply 只允许空目标，单事务导入，读回并对比完整规范化 JSON 摘要；原始完整文档、原始文件字节、集合数量和摘要保存到受限 `migration_runs`，分别验证归档的字节哈希与结构哈希。未知扩展字段和数组顺序保留，原始字节归档保留空白和对象键顺序；损坏结构、非 UTF-8、重复用户 ID、非有限数或不安全大整数会拒绝导入，不能为了成功而丢记录。上线前预留活动数据与完整双重归档所需空间。

唯一主动变换：活动 `sessions` 和 `idempotency` 清空，避免旧明文 token、演示管理员会话和缓存登录响应进入生产认证链路；原值仍完整保存在受限原始归档。回执列出失效数量。`--verify` 应在开放 API 写入**之前**运行；上线后业务正常变动会改变当前文档摘要。

历史演示用户的 mock openid 不会自动变成真实微信身份。真实用户注册生成新用户；真实历史账户映射、角色归属和健康数据迁移须先人工核对，不能按姓名自动关联。对于缺失引用/孤儿业务记录，兼容层保留原文；进入关系模型前需出映射报告并修复，不能通过丢弃记录满足 FK。

## 4. 启动与身份

```sh
docker compose --env-file deploy/.env -f deploy/compose.yaml up -d api caddy backup
docker compose --env-file deploy/.env -f deploy/compose.yaml ps
```

`/health/live` 仅检查进程；`/health/ready` 检查数据库及业务状态是否已初始化。Caddy 只有在 API 健康后启动。依赖机制见 [Compose 官方文档](https://docs.docker.com/compose/how-tos/startup-order/)。探针可用不等于微信/AI/备份异地恢复通过。

真实微信登录：小程序取得 code，服务端固定请求微信 code2Session；保存 appid+openid 主体，不返回 session_key。新用户只有 student 角色，不接受客户端自称 coach/ops。Session 使用随机 256-bit token，库中只有 SHA-256，生产有效期 12 小时；`POST /api/v1/auth/logout` 撤销服务器会话，禁用账号即时失效。正式微信联调仍待真实凭证验收。

管理员先用真实微信登录获得自身 userId，然后服务器运维人工授予，要求审核理由：

```sh
# 使用真实用户 ID；以下 USER_ID 为占位符。理由通过环境传入，勿写入敏感资料。
docker compose --env-file deploy/.env -f deploy/compose.yaml run --rm -e ADMIN_BOOTSTRAP_REASON='首次授权，已有人工审核记录' migrate node scripts/bootstrap-admin.js USER_ID
```

引导工具拒绝 mock 用户和重复授权，并写审计。公网 Caddy 拒绝 `/ops` 和 `/api/v1/admin/*`；内部管理请求仍同时要求有效 ops Session 与 `X-Admin-Key`，两者缺一返回拒绝。通过受控运维容器/SSH 内部访问，避免把管理密钥放入浏览器持久存储。管理员密钥轮换后重启 API。不要开启旧运营 HTML 作为正式管理后台。

## 5. 小程序环境构建

只向构建脚本提供公开 API 地址，不传服务端 `.env`：

```sh
MINIPROGRAM_DEV_API_BASE_URL=http://192.168.1.10:8787/api/v1 node scripts/build-miniprogram-config.js
MINIPROGRAM_TRIAL_API_BASE_URL=https://staging-api.your-domain/api/v1 MINIPROGRAM_RELEASE_API_BASE_URL=https://api.your-domain/api/v1 node scripts/build-miniprogram-config.js --release
```

Windows PowerShell 用 `$env:变量名='值'` 设置同名环境变量，再执行 node 命令。每次生成都应提供本次需要的完整环境集合，脚本不会继承上一次生成的 release 地址。开发/体验/发布分别使用 develop/trial/release；未配置发布 URL 直接失败，不回退 localhost。发布/体验要求 HTTPS 公网域名，禁止携带账号密码和 query。开发者工具上传前必须先生成 `miniprogram/config.generated.js`，此文件被 Git 忽略，CI 也会生成。release/trial 不显示演示账号；服务端仍独立拒绝演示请求。

在微信后台配置 request/uploadFile/downloadFile 合法域名、服务器白名单和隐私接口声明；核对 AppID、证书链、真机登录和受保护 API。不能用“不校验合法域名”的开发设置代替正式配置。

## 6. 日志与备份

API stdout 为结构化 JSON，仅含服务器生成的 request_id、方法、状态和耗时；不记 code、Authorization、AppSecret、正文、照片或完整 URL。错误只记录异常类型。Caddy 不记录原始访问日志（邀请 token 在 query、管理密钥在自定义头）；Docker json-file 每份 10MB、保留 5 份。需要集中日志时继续保留脱敏规则，不能简单增加全量 request dump。

backup 容器启动后立刻 `pg_dump -Fc`，之后每 86400 秒再执行；成功后 `pg_restore --list` 校验目录、保存 SHA-256 和 last-success，失败退出触发重启。超过 26 小时无成功备份会 unhealthy；这本身不会发送告警，必须接入监控通知。成功后仅轮转该目录内自身命名、超过 30 天的备份（可配置，至少 7 天）。第一次运行前检查磁盘空间并严格控制宿主机 `deploy/backups` 权限。

手工备份：

```sh
docker compose --env-file deploy/.env -f deploy/compose.yaml run --rm --entrypoint sh backup /scripts/backup-once.sh
```

同机备份不能抵御整机损坏。正式上线前必须配置加密异地副本（例如私有 COS）、最小 IAM 权限、保留策略、恢复演练与失败告警；仓库没有配置用户的 COS 账号，也未宣称异地备份已生效。

## 7. 恢复与回滚：始终先恢复到隔离库

1. 核对备份 SHA-256，验证 `pg_restore --list`，保留现有生产库及所有源备份。
2. 在隔离实例/新数据库建立相同 schema 权限及角色，先执行迁移所需版本，再按备份兼容性恢复。恢复完整 schema 的 dump 时应使用**空数据库**，不要重复预建同名表。
3. 将 dump 输入独立数据库，示意命令：

```sh
# trainbuddy_restore_review 必须是新建隔离目标，不是当前在线数据库。
# 数据库创建和角色授权由受控运维账号执行，审核目标后才运行。
docker compose --env-file deploy/.env -f deploy/compose.yaml exec -T db pg_restore -U postgres -d trainbuddy_restore_review --no-owner --no-acl --exit-on-error < deploy/backups/REVIEWED_BACKUP.dump
```

4. `--no-owner --no-acl` 恢复后，要由运维重新确认表所有者归迁移角色、运行账号仅有 runtime_state SELECT/UPDATE、不能读 migration_runs；不能因方便而把应用连到超级用户。核对用户/角色/绑定、预约区间、训练快照、分享、余额/预占/账本、原始归档摘要；运行隔离 API 冒烟、登录、越权及并发测试。
5. 验证恢复时长和最大丢失窗口，再经人工批准维护窗口切换 DATABASE_URL 并重启。不要在在线库运行 `pg_restore --clean`、DROP 或 `docker compose down -v`。
6. 尚未放开新库写入时可切回保留的旧 API/原始 JSON。已接受新写入后不可简单回切旧 JSON，否则丢失新数据；必须对账/导出增量或回滚到经验证的数据库副本。回滚旧演示 API 不得作为公开生产服务。

CI 提供独立随机项目的 Compose 启动、数据库角色隔离及备份/恢复内容比对，但它只会在 GitHub CI 中执行；本机缺少 Docker/PG，不能把该脚本存在说成演练已通过。

## 8. 发布前必须完成

- PostgreSQL 真实并发、持久化、连接故障和备份恢复测试；设置容量阈值及告警。
- 微信真实 code 登录、失效/注销/禁用、角色审核和隐私/域名真机验证。
- 真实历史主体映射和迁移双重对账，不启用演示账户管理员。
- 需要开放 AI、媒体、语音时，先完成私有 COS、异步 worker、回调认证、内容水印和供应商真实验收，再单独改生产门禁；当前部署不给这些未验收功能开关。
- 支付和外部订阅通知仍未接入；教练申请流程仅占位，生产禁用。
- 秘密扫描是格式规则检查，不是“证明不存在任何密钥”；若任何凭据曾提交过，先轮换再处理历史，不能只删当前文件。
