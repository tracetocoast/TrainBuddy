# 学员报告 P0 · 审查与实施方案

2026-11-09，基线main 8118720。用户附件标题V1.3为产品方案名，仓库已有V1.3历史归档不覆盖。本轮独立分支feat/student-training-report-p0，不推送合并。

数据来自trainingApi.listSessions/getSession，服务端GET重新授权；公开字段为title/business_date/exercises/ActualSet/public_note。报告仅completed；教练课后报告还要求shared_at。独立前端ViewModel白名单，不复制private_note、原始语音或AI候选。学员自己的自主完成训练也可只读查看。

路由：workout保留训练执行，首页/训练/进展导航；coach保留饮食/约课，仅训练tab改报告入口；新增pages/training-report/index，所有列表仅传session_id，详情重新请求，不用列表缓存绕过授权。训练页新增最近教练报告和倒序历史，独立report-history组件隔离加载错误，不阻塞正在训练。

逐文件：bottom-nav/index.js修改学员名称；workout/index.wxml/json接入历史组件、改标题；coach/index.js/wxml增加详情导航并去嵌套展开表；app.json注册报告；training-report/index四文件创建只读页面；utils/trainingReport.js纯白名单投影和去重排序；components/report-history四文件负责加载/空/错/跳转；新增模型与页面身份切换测试。trainingApi和server/src不修改。

字段缺口：可靠教练姓名来自已绑定资料，缺少时只用“教练指导”，不编造人名；公共反馈直接使用public_note，不拆出独立下次建议。组类型仅按已存字段显示。没有可靠负重口径、真实开练时间证据时不展示容量和时长；不展示热量/评分。

肌群P1：先审计动作库normalized primary/secondary映射，固定合法原创前后人体区域；仅done且可靠ID映射，主要覆盖辅助，未知显示未映射，不用名字猜人体激活。完整报告纵向阅读；精简卡日后与报告共用模型，默认隐去姓名，不放私人备注/假二维码，真正完成导出前不放按钮。

P0验收：完整逐组数据（null非0）、done/skipped/pending文字区分、未发布拒绝、不同session分别访问、重复列表去重、切号清空与迟到响应、错误重试、安全区长内容。服务端读取权限/解绑策略以实际HTTP验证并记录，不能用前端筛选替代安全。后端协作项：解绑后的历史访问政策、发布快照是否可修订、分页、可靠教练名称与负重口径/动作映射。P1再做人体图、容量与导出；P2反馈结构/收藏/阶段对比。

实际截图和真机仅有运行证据后记录，不把原型当截图。无自动分享或发布，不改变组状态及统计。

## 实施记录 · V1.24

已实现P0独立只读详情、训练页报告和历史组件、协作页详情入口及学员导航名称。完整报告直接使用已发布Session，不重新调用AI。详情读取时严格匹配当前学员，并要求completed及教练报告shared_at。当前返回历史使用训练页history查询，避免自动恢复训练遮住历史入口；组件独立加载，失败可重试。

报告只显示实际存在的公开字段；没有可靠教练姓名不伪造名称。未实现肌群图、导出和分享，不展示相应按钮。动作库元数据与高亮映射属于P1，未用名称猜肌群。当前API无分页，本轮列表按现有接口加载全部，规模增长需协作分页。

测试：student-report、ac-training、coach-space、coach-space-page、coach-navigation、coach-v13-http共31项。初次30通过1失败为旧导航文字断言，按新需求更新为“训练”后重跑。新增4项覆盖null/0、组状态、字段白名单、未发布/越权投影拒绝、同日两报告和去重、切号迟到响应。既有真实隔离HTTP覆盖共享训练与私人备注、无关账号及绑定权限，未声称撤权后学员本人历史访问应被禁止。

截图阻塞：CUA发现微信开发者工具窗口最小化，绑定观察报错，尝试官方应用唤起失败；未取得报告界面截图。官方编译已通过，不等于模拟器/真机验证。iOS/Android、小屏、字体放大与20+动作的实际视觉仍需验收。

用户后续明确授权测试后合入main，覆盖本次原先不合并的约束；不部署生产。密钥、本机project.config.json不提交。

[版本更新](../../releases/V1.24.md)
