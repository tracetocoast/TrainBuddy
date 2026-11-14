# TrainBuddy Studio V2.1 · Warm Editorial × Kinetic Utility

设计基线：main@0a1a941c40dede9a2817d98fded00ffbc9bef876（2026-11-14 核对）。

这版明确不延续 V2.0 的大面积绿黑卡片、同权重圆角按钮和缺少交互反馈的列表。视觉策略从“功能块”改为 **字体层级、精准数字、非对称留白、细分隔线和有意义的小动效**。

- 学员端新主题色：Paper #FCFBF9；Ink #222434；Indigo #5559DC；Coral #F27D62；完成状态 Green #328B6A。
- 保留学员主导航 首页 / 训练 / 进展，教练端不受此试点影响。
- beUI（https://beui.dev/components/motion）为 React/TSX 风格，**不直接复制到微信原生小程序**，仅移植 Animated Collapsible、Action Swap、Motion Tabs 等设计意图。
- TDesign Miniprogram、Vant Weapp、WeUI 作为按需基础控件来源，避免整套替换技术栈或叠加两套视觉体系。
- 当前试点的原生组件位于本分支 miniprogram/components/tb-*；业务接线尚未完成，不应作为已验收功能上线。
- 18 场景可点击 HTML、22 页 PDF、逐屏 PNG、详细 Codex 改造说明由本轮会话交付 ZIP。将 ZIP 上传给 Codex 以进行逐页设计还原与实现。
- 不允许因为视觉修改重写 WorkoutSession、ActualSet、保存队列或教练报告权限。

实施建议：先只做学生端首页 / 训练执行 / 进展三屏试点，确认美术和真机操作后再扩展二级页面。P0 是保存失败与完成状态可信；P1 是主流程视觉；P2 是身体/饮食/预约等低频视图。

组件列表：
1. tb-motion-tabs：有动效的分段指示，事件由父页面接收；
2. tb-set-row：原生逐组重量/次数输入，状态持久化由父页面负责；
3. tb-action-swap：idle/loading/success 状态可视化，不自动假装成功；
4. tb-reveal：可关闭动效的展开动画，长内容超过 max-height 时需换策略。

重要：演示中的姓名、日期、课程、统计和教练反馈均为虚构数据。