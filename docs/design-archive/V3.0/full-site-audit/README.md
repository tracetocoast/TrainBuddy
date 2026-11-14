# Field Notes 全站 V3.0：第一轮代码差异审查

审查日期：2026-11-14。状态：**审查完成，未开始本轮页面重构，未提交、推送、合并或部署。**

## 1. 结论与证据边界

33 个路由都存在，但不能将 76 张原型理解为 76 项已实现功能。主流程已有代码基础；主要工作是重排信息、统一视觉，并补全状态呈现。排班正式编辑器、报告导出分享、部分异步恢复和照片管理等仍是设计提案或部分能力。

最优先不是全局换色，而是保住训练组保存、教练草稿和发布权限，然后按「教练录音 → AI 草稿 → 学员执行 → 正式报告」分批还原。当前 main 的测试并非全绿，需先校准过期测试，不能为了通过测试恢复自动完成训练组的旧行为。

本轮读取 README、完整主文档、交互矩阵、信息架构、组件规范、场景 Manifest，并逐张查看全部 76 张 PNG（以六张一组、每张 390×844 的联系表审阅）。未将 HTML 当作小程序实现。设计原图和演示数据不进入业务数据。PNG 阅读记录、SHA256、路由与源码事件索引见本目录 JSON。

“已有”仅表示在 JS/WXML 中找到实现和调用链，不等于真机、真实供应商或生产已验证。此次运行了隔离 main 的自动化及官方编译检查；没有重新完成 76 个实际微信状态截图、iOS/Android、真实录音或供应商验证。

## 2. Git 三层基线：不能混为一谈

| 层 | 实际状态 | 处理 |
|---|---|---|
| 最新远端 main | `0a1a941c40dede9a2817d98fded00ffbc9bef876` | fetch 成功，与交付包基线完全一致，无新远端提交 |
| 当前本地 HEAD | `1eff38392fd730019993ec7d4c3c03521353c495` | 比 main 多一个 V1.27 提交：33 文件、661 增行、209 删行 |
| 当前工作区 | `feat/field-notes-v3`；上一轮 Field Notes 两页试作未提交 | 全部保留；本轮只新增审查文档，不 reset/stash/切换/覆盖 |

未提交内容包括 workout 的 WXML/WXSS，record 的 WXML/WXSS/JSON，voice-input 三文件，field-notes.wxss，coach-refinement 测试和旧 V3.0 设计文档；`project.config.json` 是既有本机配置，不随功能提交。

V1.27 已在本地增加训练添加队列与幂等键、组 revision 冲突保护、已完成组编辑限制、休息暂停、计划开练导航、进展补充和测试修正；其中包含服务端训练逻辑变化。**它不是本轮纯视觉修改，也尚不在远端 main。** 后续不能把混合分支一次推成“UI 更新”。应将 V1.27 单独复核，或在干净 main worktree 中只移植审定的前端批次；工作区现有内容保留为参考，不静默丢弃。

旧 `docs/DEVELOPER-HANDOFF.md` 部分内容仍停留在 V1.6，且描述同步前自动 done。当前 main `record/index.js:onFinalize` 已阻止 pending 发布，不能按旧文档恢复该行为。

## 3. 分类方法与逐路由清单

下表 A=代码中已实现；V=视觉精修；I=交互修改；N=尚未实现/设计提案。一个页面可同时属于多类。所有路径相对仓库；每行列出拟修改文件，**不是本轮已修改文件**。`index.*` 明确指该页 WXML、WXSS；只有 I/N 项需要按列出的 JS 修改。所有页面保留原路由，不扩成 76 个页面。

| 路由 / 原型 | A：可复用实现 | V / I：具体差异与拟改文件 | N / 风险 / API依赖 | 优先级 |
|---|---|---|---|---|
| home / 01–03 | `index.js:40`按角色读取课程、计划、session；`onTrainingCta/goRecord` | `index.wxml/.wxss`去快捷矩阵和统计首屏，课程/当前训练/最近报告为连续段落；JS 增最新报告投影 | 最近报告首页区尚未完整落位；复用 trainingApi、bookingApi、report-history，不能给未绑定用户造课程 | P1 |
| workout / 04–05、07–10 | `index.js:655–780`原位输入、串行队列、回包后完成；草稿、历史预填、结束确认已有 | `index.wxml/.wxss`展开动作＋连续组行；`index.js`绑定逐行重试、结束摘要、键盘避让；保留队列 | main 无休息暂停，V1.27 本地已有；添加批次失败恢复及revision保护本地更强，不能混称 main 已有。sessions API 不变 | P0 |
| new-workout / 06 | `onCustom/onTemplates`分别去空白训练与计划 | `index.wxml/.wxss`两个编号入口＋说明，避免重复主按钮 | 不新增选择弹窗；真实新建仅由 workout 负责，防双创建 | P1 |
| exercises / 11–13 | 搜索、器械/部位、常用/最近、连续分页、多选事件回传 | `index.wxml/.wxss`双列大图改紧凑行；`index.js`组织已选视图和筛选位置，保留稳定ID及usage | “已选”独立筛选为补充交互；批量添加部分成功不能清空失败项。exerciseApi、trainingApi | P1 |
| exercise-detail / 14 | `onFav/onAddPlan`、真实动作元数据 | `index.wxml/.wxss`照片、动作要点、计重说明分段；JS只投影已有字段 | 不把卧推照片复制到所有动作，不给没有来源的动作生成呼吸/错误建议；exerciseApi | P1 |
| plans / 15–16 | 按权限查看/编辑/开练、侧滑删除 | `index.wxml/.wxss`列表＋明确草稿/发布态；JS调整筛选 | 原型“今日可练/我的模板”与当前筛选不完全等价；尊重 planSchedule 与 can_edit。trainingApi | P1 |
| plan-edit / 17–18 | 本地草稿、逐组目标、动作排序复制、版本保存/发布 | `index.wxml/.wxss`紧凑目标行和轻面板；JS仅改显示适配 | 18图“已完成2/4组/完成圈”不适用计划，不得变更实际组状态；计划不是session。trainingApi | P1 |
| training-report / 19–20 | `index.js:reload`重新授权取session；`utils/trainingReport.js`白名单、完成/共享过滤 | `index.wxml/.wxss`编辑式标题/动作摘要/公开反馈，JS增加只读展开状态；复用report-history | 时长、主辅肌图、分享导出不是现成能力；没有可靠来源就不显示；私人备注禁止入图。GET sessions/:id | P0 |
| growth / 21–23 | 月历、同日多session、身体/饮食切换及日期选择 | `index.wxml/.wxss`月历置顶，周环/统计下沉；JS按当前分类生成日期标记 | 不能以“有训练”替代“有身体/饮食”；V1.27本地修复切标签迟到响应。growth/diary/body APIs | P1 |
| body-data / 24–26 | 人体测量入口、公斤/斤、图表、筛选、单日多条 | `index.wxml/.wxss`当前值＋分隔列表/图表；JS保留全部指标及左右区分 | 原图简化了人体图，不据此删除既有围度入口；曲线日期/缺失值不可模拟。bodyMeasurementApi | P1 |
| body-metric / 27 | 单指标、范围、真实趋势和新增入口 | `index.wxml/.wxss`单值主视觉、趋势、历史；JS仅调整范围映射 | 图示7/30/90与现有范围选项需显式映射；不画假斜率。bodyMeasurementApi/bodyInsights | P1 |
| body-record / 28 | 日期时间、数值校验、独立幂等意图追加 | `index.wxml/.wxss`无卡片表单行，JS保留切指标未保存提醒 | 同日记录不能覆盖；单位转换只发生一次；不默认接受前次值。bodyMeasurementApi.append | P1 |
| body-history / 29 | 时间倒序、多指标、趋势导航 | `index.wxml/.wxss`时间轴式行，空/错分离 | 早期时间缺失继续明确显示，不补造时间。bodyMeasurementApi.list | P1 |
| diary / 30–33 | 分模块折叠、饮食/饮水/睡眠/特殊情况及逐日共享 | `index.wxml/.wxss`去重复概览卡，日期条＋折叠行；JS只改展开呈现 | 原型疲劳2/5与代码0–10不一致，不能改单位语义；新增“添加记录”不能自动共享。diaryApi | P1 |
| food-photo / 34–35 | 拍照/相册→上传→task→确认入日记；营养未知值与auto_sync区分 | `index.wxml/.wxss`选图/确认两态，JS仅状态与入口适配 | 模式与供应商错误提示仍需保留；实际AI未重测；确认接口和授权不变。aiApi | P1 |
| coach / 36–37 | 已共享教练报告、每日饮食反馈/撤回、约课入口 | `index.wxml/.wxss`三标签和反馈排版；JS维持日期与权限 | “本次反馈/下次建议”目前不能从public_note随意拆字段。trainingApi/diaryApi/bindingApi | P1 |
| booking / 38–42 | 真实slots、预约提交状态、日/周/待办、改期接受拒绝 | `index.wxml/.wxss`日期/月历＋轻时段行；JS增单选默认/显式多约模式，保留批次重试 | 当前默认多选，原型39单选；42名为周视图却画月历，应保留真实周语义，月历只作日期定位。bookingApi | P1 |
| booking-detail / 43–45 | 取消确认、改期申请、教练决定/出勤 | `index.wxml/.wxss`详情分段、同页改期；JS补加载错误、出勤确认和防重 | `onAttend`直接请求，需防误触；loadChangeSlots暂无序号保护，快速换日待复现；不造“撤销出勤”接口。bookingApi | P0验证/P1视觉 |
| schedule-rules / 46 | 周规则读取；仅develop+demo=1演示快捷写入 | `index.wxml/.wxss/.js`正式规则表单、例外编辑、保存/冲突反馈 | 正式编辑器未实现；已有patchAvailability/addException可复用，例外删除/更新需核实服务端，不把演示按钮换名上线 | P1独立交互批 |
| record / 47–54 | 选学员、speechComposer、自动合并可用候选、原位编辑、公开/私人备注、逐组确认和发布 | `index.wxml/.wxss`录音/草稿/确认/成功同路由多态；JS只处理UI状态与恢复，voice-input复用 | 固定cdraft幂等键仍可能复用旧课次；候选恢复/字段本地耐久性需补；“查看学员报告”不能直接跳仅本人报告页。trainingApi/voiceApi | P0 |
| students / 55–56 | 搜索、待办筛选、绑定名单及档案；诊断dev隔离 | `index.wxml/.wxss`名单行；JS保留错误状态，不把读取失败当无训练 | 当前每人listSessions N+1，且catch置空；前端先显示未知，规模优化才要求汇总API。binding/booking/training APIs | P1 |
| student-profile / 57–58 | 训练历史、计划、授权生活资料折叠、点评 | `index.wxml/.wxss`训练优先/生活次级；JS补受保护内容加载态 | “下次课程”如要直接展示需复用booking查询；不能绕过canCoachReadStudent。diary/training/binding APIs | P1 |
| ai / 59–63 | 工具入口、上传、任务、体态复核、目标配置/重试/对比/导出 | `index.wxml/.wxss`列表与状态，JS减少工具轮播层级 | 63照片管理删除入口尚未接；aiApi.deleteMedia已有，不等于相册/资源清理已验收。供应商、照片所有者和水印不改 | P2 |
| friends / 64–65 | 邀请预览/确认、近7日训练、点评和解绑 | `index.wxml/.wxss`名单与共享说明；JS仅显示状态 | 原型“训练摘要”不能隐瞒当前共享包括动作重量次数；无任意范围编辑协议。friendApi | P2 |
| points / 66 | 余额、流水筛选与成就/兑换入口 | `index.wxml/.wxss`余额＋流水，无额外图表 | 不把积分当现金，不造收益，pointsApi | P2 |
| achievements / 67 | 成就/进度/描述读取 | `index.wxml/.wxss`编辑式里程碑列表 | “查看规则”尚无独立交互，使用服务端描述可内联展开，不造达成条件。pointsApi | P2 |
| rewards / 68 | 真实SKU兑换、确认弹窗、余额和订单跳转 | `index.wxml/.wxss`商品行 | 原图毛巾等不是实际目录，不能换掉真实权益商品或暗示物流。pointsApi | P2 |
| redemption-detail / 69 | 订单状态读取与错误反馈 | `index.wxml/.wxss`订单说明；JS可加明确返回 | 原型“返回兑换记录”缺现成订单列表路由；回商品页不叫订单历史，不造发货状态。pointsApi.order | P2 |
| profile / 70–71 | 受授予角色切换、绑定/解绑、邀请、隐私和外观 | `index.wxml/.wxss`账号/服务/隐私列表；JS仅路由/主题呈现 | 原型“跟随系统”当前无对应模式；主题全局修改影响未迁移页，先页级Field Notes，不据角色显示“已认证” | P1 |
| bind / 72 | 邀请预览、按域选择授权、确认绑定 | `index.wxml/.wxss`表单行与确认；JS保留预览/过期/错误处理 | 演示邀请码从正式UI移除；饮食默认关闭；已共享训练与全部训练不同。bindingApi | P0验证/P1视觉 |
| privacy / 73 | 绑定作用域读取与保存 | `index.wxml/.wxss`独立开关行 | 不减少既有CONSENT_CATEGORIES，不把关闭说成历史照片全部删除；服务端撤权要回归。bindingApi | P0验证/P1视觉 |
| login / 74–75 | 微信配置查询、隐私勾选、登录及演示登录 | `index.wxml/.wxss`品牌/协议/登录；JS增加环境能力门控，协议需可读入口 | main演示账号卡无环境wx:if，正式包必须隐藏且后端拒绝；不通过视觉宣布真实微信已配置。authApi | P0 |
| ops-hint / 76 | 身份限制、按配置构造链接、复制/退出 | `index.wxml/.wxss`简洁文字提示 | 不复制原型假URL；真实后台HTTPS和权限属部署验证，当前不改生产。config/session | P2 |

逐场景执行表见 [76场景差异清单.csv](76场景差异清单.csv)。它将每个原型映射到上表页面及事件，并列出局部缺口，不能替代真实操作测试。

## 4. 四条核心体验的文件级方案

### 4.1 教练录音（47–49）

- `pages/record/index.wxml/.wxss`：学员/课程行、语音/文字标签、唯一中央主操作、转写内容、补录与手写入口。不同状态不换路由，不清空原文。
- `components/voice-input/index.wxml/.wxss/.js`：复用真实 state/canPause/seconds 及事件，整合准备、录音、暂停、中断、结束、处理和错误。不得给录音结束和暂停分别造无真实能力的按钮。
- `pages/record/index.js`：保存/恢复显示状态、用户输入保护；保持 `speechHooks/transcribeAudioToText` 的请求协议。`utils/speechComposer.js` 只审查，不顺手改 ASR。
- 录音通道差异：WechatSI 有 onPartial；RecorderManager 在 stop 后上传转写。`app.json` 当前未注册 WechatSI 插件，因此不能默认宣传实时转写。使用能力标签与真实结果，波形只作状态指示，不伪装音量测量。
- 第一验收：拒绝麦克风仍可手填；暂停不支持时允许结束补录；切学员/切后台不把A的结果写给B；原话可恢复。真实录音与中断必须真机复核。

### 4.2 AI 草稿与发布（50–54）

- `pages/record/index.wxml/.wxss`：已整理动作直接呈现可编辑行；未解决候选独立标记；原话/依据/私人备注按需展开。可复用现有 `applyVoiceTask/doMerge/onUndoMerge`，不重写AI。
- `record/index.js:392` 已自动合并无冲突的唯一动作，重复名称仍需核对。保留服务端 merge 的 `base_revision` 和 `keep_human` 默认，不用前端拼报告替代 merge。
- 发布确认显示具体学员、实际完成/跳过/未核对组数、公开反馈；pending 阻断仍保留。成功必须来自 finalize；“已发布可查看”比“已经送达/已读”准确，当前没有投递回执。
- `saveLocalDraft:241` 目前仅持久化 textInput/publicNote/privateNote；字段输入 `_fieldInputs`、候选patch和voice task ID未全部纳入恢复。`flushWrites:253`回包直接替换session，缺少与新本地字段值叠加及明确owner/session闭包校验。列为P0回归风险，先用延迟/失败测试复现，再最小修复，不删写队列。
- 已有 `voiceApi.listTasks/getTask` 可支撑恢复查询；重新进入的任务恢复协调逻辑尚不完整。录音文件本地临时路径寿命不能等同永久原音留存。

### 4.3 学员训练执行（07–10）

- `pages/workout/index.wxml/.wxss`：动作折叠列表、连续行、等宽数值、浅绿确认组和44逻辑px左右触控区域；可视完成圆圈可小，触控热区不能一起缩小。
- 原位系统数字键盘、`onSetField → onSetEditEnd → drainSetEdits → saveSet`链保留。响应到达后才完成；本地输入、保存中、失败重试三者明确，不能因皮肤移除pending覆盖逻辑。
- `pages/workout/index.js`仅为展开、结束摘要、键盘与rest条协调增加状态；在已完成组上修改需先撤销。休息不覆盖最后一行或键盘，切后台按deadline复算。
- main 支持失败保留当前pending；V1.27另有 `addQueue/onRetrySet/base_revision`。这些是业务可靠性差异，不是CSS，未来移植必须成对核对服务端兼容。
- 10号图只是一种确认状态，不新建路由。结束时既有规则是pending必做组→skipped，不是done；零完成组结束被拒绝。摘要文案必须讲清。

### 4.4 学员正式报告（19–20）

- `pages/training-report/index.wxml/.wxss`：衬线标题、日期/来源、动作和完成组数、动作分隔行、公开教练反馈；逐组内容只读展开。
- `utils/trainingReport.js`白名单保留，`components/report-history/`只展示允许学员看见的记录。不得直接将record整个data传入学员页面。
- main没有可靠肌群区域投影；V1.27有基于目录bodyPart的最多两区域归纳，不能称实际肌肉激活或主辅强度。
- started_at/ended_at是会话时间，不自动等于实练时长，尤其课后录入。暂不显示原型58分钟。导出/分享需要独立权限审查，第一批保留为未实现，不画可点假入口。
- 教练查看发布预览应使用本页公开字段预览或独立授权呈现，不以学员身份绕过 `report(session, owner)` 的 student_id 约束。

## 5. 设计包本身需解释的差异

1. 07 顶部“完成”在原稿发生两行换行。实现保留位置，但保持单行与触控宽度，不忠实复制排版缺陷。
2. 18 是计划目标却显示“已完成2/4组”和完成列；不能用于写入训练完成状态。调整为目标参数/保存状态。
3. 19 的58分钟、主辅肌、保存分享需真实数据与实现支撑；不能写死。
4. 38/42 的日期示例和“周视图”月历只是演示，不将原型日期写进逻辑；保留现有预约窗口及真实周范围。
5. 48 实时转写/自动暂存依赖通道。原始音频未持久化时不能声称原音可恢复。
6. 54 的“送达”没有回执证据，只能表示服务端发布成功。
7. 32 疲劳2/5与现有0–10量表不同；视觉升级不改变数值语义。
8. 63照片管理、67规则查看、69订单历史、71跟随系统是补充设计，不能由已有事件名推断已实现。
9. 74/75隐私协议需要真实可阅读内容和同意记录；图里的说明不替代正式协议。
10. 大量原型底部红按钮表达状态意图，并不要求每个列表都固定一个同样的大按钮。优先遵守每屏一个主动作，导航使用系统返回，不照搬灵动岛/电量/系统时钟。

## 6. API 协作清单与风险分级

| 编号 | 已确认代码或待验证风险 | 处理边界与验收 |
|---|---|---|
| P0-01 | `services/trainingApi.js:createCoachDraftSession`固定`cdraft_学生ID`；idempotency middleware同键同body返回缓存；record重新GET只能纠正旧状态，不能创建下一节 | 服务端负责人确认“恢复草稿”和“新课次意图”协议；建议显式intent_id/booking_id与恢复查询分开，同意图重试同session，新课次不同session。仅提案，不擅改请求或服务端 |
| P0-02 | 教练字段草稿没有完整耐久缓存，queue回包缺新输入overlay和作用域检查 | 前端可在原协议上修复：owner+student+session缓存、输入版本及队列闭包、迟到结果丢弃；失败杀进程/恢复和双账号测试必须通过 |
| P0-03 | main与本地V1.27保存契约不同，不能孤立复制带base_revision的UI | 先建立main测试基线并复核V1.27，区分已合并与待审代码；禁止视觉批次偷偷带入backend变更 |
| P0-04 | login演示卡无客户端环境门控 | 前端隐藏正式入口，保留开发测试能力；后端是否拒绝生产mock单独验证，不能只隐藏按钮就宣称安全 |
| P0-05 | 发布和数据隔离是硬约束，不是新增功能 | 用已有权限/白名单/merge/finalize协议验证；不通过测试恢复pending→done，不展示私密备注 |
| P1-01 | 学员列表按人读取训练，失败被映射成空训练/无草稿 | 先前端明确未知状态；多人规模实测后再提授权汇总接口，不能凭需要加统计卡 |
| P1-02 | booking-detail切日请求未见generation保护，出勤直接提交 | 前端迟到响应隔离、明确确认/进行中/错误；revision/冲突由既有API决定，撤销出勤能力另提案 |
| P1-03 | 正式排班编辑器缺失 | 复用availability PATCH和exception POST；删除/修改例外范围需确认；不把demo快捷行为冒充正式表单 |
| P2-01 | 报告导出、时长和肌群图、照片管理、跟随系统 | 有数据/权限/资源生命周期方案后单独实现，不阻塞核心四条流程 |

原协议可复用：`GET/PATCH /sessions/:id`、`PATCH /sessions/:id/sets/:setId`、动作与组增删、`POST .../finalize`；`/voice/providers`、voice-tasks创建/查询/list/merge/undo及parse-text；plans草稿/发布；booking slots/预约/改期/出勤；bindings及独立授权；diary/body-measurements；AI上传/task/确认。客户端封装见 services 下对应文件，完整路由在 server/src/routes/index.js。新增网络调用先做数据投影/现有聚合复用，不默认要求新API。

## 7. 分批实施与验收门槛

| 批次 | 范围与文件 | 通过条件 | 回滚 |
|---|---|---|---|
| 0 / P0 | 审计基线、失败测试校准、可靠性风险复现 | main六项失败有逐项解释和正确断言；V1.27单独核对；不扩大协议 | 文档/测试独立提交 |
| 1 / P0 | `record` capture、`voice-input`、页级`styles/field-notes.wxss` | 47–49真实截图＋拒绝/暂停/中断/手填；真实时长，无假成功；用户验收 | 一个独立UI提交，可revert；本机配置不入提交 |
| 2 / P0 | `record`草稿、确认和成功态 | 50–54截图；人工编辑优先、失败不丢、pending阻断、私人备注隔离；用户验收 | UI和必要前端恢复逻辑分开提交 |
| 3 / P0 | `workout`执行与错误/休息/结束态 | 07–10截图；4组连续编辑；旧响应不覆盖；撤销/重试/恢复；四宽度和键盘；用户验收 | 保存队列不替换；单独revert视觉提交 |
| 4 / P0 | `training-report`与`report-history` | 19–20截图；只读、无私密字段、未知值不变0、同日两记录分开；用户验收 | 白名单不放宽，组件/页独立提交 |
| 5 / P1 | home、growth、new-workout、plans、plan-edit、exercises及detail | 一主操作；首页任务真实；日历日期保持；搜索/分页/多选/计划版本回归 | 按路由组提交，禁止全局一次替换 |
| 6 / P1 | students、student-profile、booking/detail、coach、bind/privacy/login/profile | 两角色三导航、撤权、预约并发状态、输入/错误路径；正式排班单列子批 | 权限代码不改，必要交互单独提交 |
| 7 / P1/P2 | 身体/日记/饮食AI，再其余工具、朋友、积分订单 | 保留所有现有入口但降低主次；真实供应商与演示严格区分 | 每域独立提交 |

每批先给同一尺寸的「原型PNG｜真实微信截图」，附状态、账号角色、数据来自隔离测试、工具版本和commit。截图未取得则该批视觉未验收；不得以HTML浏览器图替代小程序图。320/375/390/430每宽度检查大字、长姓名、长动作名、最后一行键盘与安全区；iOS/Android真机缺任一则标未验证。

页面级Field Notes作用域先行，避免改全局`.card/.primary`导致33页一起失控。原生navigationBar/page-meta/skin-dark也必须一致；现有theme.js仍是浅绿/深绿，单改页面底色不算完成。明确采用纸色主题后不恢复黑绿；“跟随系统”不能误恢复旧皮肤。

回滚不用reset --hard。每批有独立提交、测试日志与截图，撤销使用git revert（发布/合并仍需用户验收）。数据、数据库、生产配置、ASR/Prompt均不参与视觉回滚。

## 8. 本轮实际验证

环境：Windows PowerShell，Node v24.22.1，官方wcc.exe/wcsc.exe。测试对象为git archive导出的纯origin/main，不含工作区改动、.env及真实store；依赖通过NODE_PATH使用本机已安装server/node_modules，未重新npm ci，故不声称依赖完全重装复现。

```powershell
git fetch origin
git rev-parse origin/main
git diff --stat 0a1a941c HEAD
git archive --format=zip --output=<隔离目录>/main-source.zip origin/main
# 在解压后的clean-main目录
$env:NODE_PATH='<本地仓库>/server/node_modules'
node --test server/test/*.test.js
node scripts/check-interaction-build.cjs
```

- 路由/设计资产清点：**Passed**，33/33路由吻合，76/76 PNG存在并已查看；source-inventory含文件哈希。
- 首次沙箱测试：受本机监听权限影响，不作为业务结论；允许本机测试端口后重跑。
- main自动化：**Failed**，245项、239通过、6失败。原始记录 [main-tests-unrestricted.log](main-tests-unrestricted.log)。
- main官方编译：**Passed**，44 WXML、50 WXSS；JSON及JS语法检查failures=0。见 [main-compile.log](main-compile.log)。
- 新版全站实机截图、四宽度、键盘、真实ASR/AI、生产：**Not Executed**。本轮只审查，不操作用户真实训练，不创建录音/报告数据。

### 六项失败的解释（不改业务迎合旧测试）

| 测试位置 | 实际与原因 | 后续动作 |
|---|---|---|
| coach-refinement.test.js:56 | 期待“首页,记录,进展”，实现是“首页,训练,进展” | 校准标签断言，本地V1.27已调整 |
| coach-workbench.test.js:34 | 保存成功后的定时提示调用setTimeout/clearTimeout，VM未提供，flush返回false | 补测试环境计时器；不能据此断言真实保存失败，本地V1.27已补 |
| coach-workbench.test.js:40 | 同一VM缺计时器导致队列测试false | 同上，另增加真实迟到回包/持久恢复测试 |
| plan-editor-page.test.js:113 | 旧测试期待weekly，当前模板编辑规范化为permanent | 对齐取消时效配置后的业务断言，保留历史计划读取测试 |
| plan-list-page.test.js:51 | 要求外链swipe-axis.wxs，实际已内联WXS | 检查内联手势实现而非旧文件名，本地V1.27已改 |
| ui-rollout-page.test.js:185 | 期待pending自动done并弹发布框，当前实现正确阻断，因此modal不存在 | 改成显式done/skipped后仅发布一次；不能恢复自动done，本地V1.27已改 |

六项主要体现测试滞后/VM桩缺失，**不表示产品没有其他风险**。新的P0恢复、重复请求、权限和真机测试仍必须做。此次没有修测试、没有新改前端，所有旧未提交文件保持不动。

## 9. 下一步决策

先确认本审查与批次边界，再从已有独立分支或干净main隔离工作区开始第0/1批；不直接在混合工作区一键提交全部内容。首次交付录音和AI草稿时，明确列出主图还原、状态变体和仍需服务端确认的课次创建问题。用户未验收不合并main，不部署。
