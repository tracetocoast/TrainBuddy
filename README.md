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

顶部可切换「我是学员 / 我是教练」。预约、打卡、课后记录等状态会写入本地缓存（`wx.setStorageSync`），刷新后仍保留。

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
