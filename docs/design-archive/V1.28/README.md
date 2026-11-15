# V1.28 设计与实施归档

2026-11-15。无新界面设计，沿用 [V1.27](../V1.27/README.md) 品牌标志。本版只处理预览包体积。

- [版本更新](../../releases/V1.28.md)

## 落地范围

- 小程序仅保留压缩后的 `miniprogram/assets/trainbuddy-logo-agamemnon-side-icon.png`。
- 源文件与旧图标在 `design/brand-logos/`，不打进预览包。
- `project.config.json` 与 `miniprogram/project.config.json` 增加对应 `packOptions.ignore`。

## 未纳入

- 未使用的 1MB 级全尺寸 PNG 仍不入库。
