# 微信云开发（可选）

当前主路径是本地/云托管 **Node HTTP**（`../server`），契约见 `docs/API-server.md`。

若改用云函数，请保持：

- 相同路径语义（API01–22 / 29 / 31）
- `Idempotency-Key` / `REVISION_CONFLICT`
- 权限矩阵与 Asia/Shanghai 业务日

可将 `server/src` 业务层迁入云函数入口，或云托管直接跑 `server`。
