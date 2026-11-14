# V1.27 设计与实施归档

2026-11-15。界面与 LOGO 小更新，无独立线框。训练信息架构沿用 [V1.26](../V1.26/README.md) 的「最近教练报告 → 待练计划 → 训练历史」。

- [版本更新](../../releases/V1.27.md)

## 落地范围

- `brand-logo` 使用 `miniprogram/assets/trainbuddy-logo-agamemnon-side-icon.png`。
- `styles/tokens.wxss`、`styles/skin-dark.wxss`、`utils/theme.js` 改为黑金青铜语义色；浅色窗口底 `#ffffff`，深色 `#090909`。
- 学员底栏选中描边 `#c7a45a`，教练选中使用 `coach-icons.bronze`（`#9a7142`）；首页快捷入口图标 `tone="bronze"`。
- `pages/profile`「外观」增加「减少动态效果与触觉」；训练、约课、日记、AI、课后记录、计划编辑页不再展示该开关，仍读取同一本地偏好。
- `report-history` 拆成最近报告与可折叠历史，默认 5 条。

## 未纳入

- 未使用的全尺寸 `trainbuddy-logo-agamemnon-side.png`、旧黑金 PNG 源文件不入库。
- 未改 API、角色或底栏路由。

## 未验证

- 微信开发者工具官方编译、真机浅色/深色 LOGO 小尺寸清晰度未在本机完成。
