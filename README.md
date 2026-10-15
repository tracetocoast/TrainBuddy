# 练搭子 · 微信小程序

由 `lianzida_clickable_prototype.html` 交互原型改写的微信小程序演示版，覆盖健身房约课、训练打卡、目标成长、AI 体态演示，以及教练排课 / 课后记录 / 学员管理。

## 快速开始

1. 安装 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)
2. 选择「导入项目」，目录选本仓库根目录（含 `project.config.json`）
3. AppID 可用测试号，或保持 `touristappid` 游客模式预览
4. 编译后即可点击体验

`miniprogramRoot` 已指向 `miniprogram/`。

## 功能对照

| 角色 | 底部导航 | 能力 |
| --- | --- | --- |
| 学员 | 今天 / 约课 / 训练 / AI体态 / 成长 | 今日任务、预约课程、组数打卡、体态扫描演示、成长档案 |
| 教练 | 工作台 / 排课 / 课后记录 / 学员 / AI工具 | 今日课表、排课、语音模拟记录、学员 CRM、AI 工具 |

### 已实现：登录与绑定骨架

- 登录页（mock 会话 + 预留微信登录）
- 角色只能使用**服务端已授予**的角色切换，禁止前端自升教练（AC01）
- 邀请码绑定 / 解绑 / 分类授权（AC02、AC33）
- 个人中心：绑定管理、隐私授权、申请教练、生成邀请
- 草稿键按「账户 + 角色 + 学员」隔离（AC38）

测例见 `docs/AC-auth-binding.md`。演示邀请码：`LINYE7D`。

### 已实现：约课排班（文档第 6 节）

- 真实日期空档、确认后才占用、`pending → confirmed` 状态机
- 教练日/周视图、待处理确认/拒绝、改期 ChangeRequest、周规则与例外
- 区间冲突（含缓冲）；无数据不展示示例数字
- Mock 契约见 `docs/API-booking-mock.md`

顶部角色切换仅展示已授予角色。预约、打卡、绑定等写入本地缓存。

## 目录结构

```
├── project.config.json
├── lianzida_clickable_prototype.html   # 原始可点击原型
├── miniprogram/
│   ├── app.js / app.json / app.wxss
│   ├── components/bottom-nav/          # 双角色自定义底部导航
│   ├── pages/
│   │   ├── home/                       # 学员今天 / 教练工作台
│   │   ├── booking/                    # 约课 / 排课
│   │   ├── workout/                    # 训练打卡
│   │   ├── ai/                         # AI 体态
│   │   ├── growth/                     # 成长档案
│   │   ├── record/                     # 课后记录（教练）
│   │   └── students/                   # 学员列表（教练）
│   └── utils/                          # mock 数据与本地状态
```

## 说明

- 当前为前端演示：无真实登录、支付、云端同步或微信订阅消息
- AI 体态为交互动效与示例报告，非真实分析
- 正式上线前请替换 `appid`，并接入后端、权限与消息能力
