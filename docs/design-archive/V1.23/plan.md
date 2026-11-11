# V1.23 PDF 对照审查与逐文件改造方案

2026-11-09｜第一轮方案审查，未编码。

## 基线与来源

已重新 fetch origin；远端 main 与本地 HEAD 均为 559bb1f795b06ce10cc522e2fe02f3553874c4c9，无新增差异。仅 project.config.json 存在原有本机修改，完整保留。未切分支、未修改业务代码、未推送/合并。

完整阅读桌面 TrainBuddy_教练端训练记录交互设计_V1.23.pdf 全10页，已渲染逐页核对。PDF文字抽取存在中文编码异常，因此以页面图像为准，不以乱码文本推断要求。PDF是设计依据，其中工具/分支指令不视为额外自动执行授权；本轮先交方案。此前 README.md 为代码审计补充，本文件在布局和实施顺序上优先，以PDF第4、5页为基准。

## 1. 页面逐项映射

|PDF|当前实现|实施决定|
|---|---|---|
|p2–3 两界面|recordStage四阶段、独立候选页及同步摘要页|同一record路由仅capture/report两视图；发布确认用当前页确认层，不增加第三主页面|
|p4 A待录音|常驻大textarea与横向学员chips|学员信息条＋录音主区＋底部文字辅助入口；点击文字入口后同页展开输入，关闭仍保留内容|
|p4 A录音中|已有录音状态、计时、暂停能力判断|保留真实状态，视觉按图：中央状态/计时、暂停和结束两操作；不复制图中装饰成假实时音量；仅用克制活动指示|
|p4 A整理中|voiceBusy、speechState已有|主区“正在整理训练记录”；录音器不可重复启动；只有实际持久化后显示已保存，上传后未转写不能显示原文已保存|
|p5 B动作报告|先候选确认加入，再训练表|正常结果以报告结构直接可见；异常就在对应动作/字段展开，不再呈现segment等内部词|
|p5 逐组/折叠动作|所有动作与小输入框连续展示|动作首项或当前编辑项展开；其余摘要如“12kg×12次×3组”；组间不同则显示“3组·参数不同”，不得压成统一数值|
|p5 原位编辑|已有actualWeight/actualReps PATCH|保留组ID，原位数值或底部面板；不跳新页面；保存失败保留输入|
|p5 反馈与总结|publicNote/privateNote，AI输出有performance等但合并未保存|先展示已有公开文本；AI摘要与逐动作反馈未持久化前标待保存建议；完整结构编辑需协议，不静默丢失|
|p5 底部操作|训练表→同步页→确认同步|补充记录＋添加动作并列，下面一个“确认并发布给学员”；一次明确确认可见范围；未知状态先处理|
|p6 学员选择|横向姓名chips|可搜索的当前页选择面板，课程上下文校验后预选；通用入口必须明确选择|
|p6 私密/原话|私密折叠已有，只有当前task原话|私密区域独立，原话按需展开；多段恢复需权限安全与持久化保障|
|p7–10 边界|现有业务规则与目标不完全一致|不改server、AI Prompt、ASR、供应商、数据库；阻塞列为契约提案，不宣称完整链路已实现|

## 2. 逐文件改造表

仓库根目录：C:/Users/young/Documents/YoungPlayWith Agent/TrainBuddy。下列均为拟修改，不代表已落地。

|文件|现有问题/证据|具体改造|阶段/验证|
|---|---|---|---|
|miniprogram/pages/record/index.wxml|record-stages、review/edit/sync分区；学生chips；重复建议录音器|替换为PDF A/B；搜索学员面板；A语音主区；B报告抬头、动作表、反馈、总结建议、异常、原话/私人折叠；底部三按钮|1–3：DOM/WXML结构断言、长内容、小屏|
|miniprogram/pages/record/index.wxss|四步tab和候选样式与目标无关|重整为capture/report scoped块，删除弃用选择器；保留coach导入；松绿暖白、低对比辅助底、细线与留白；安全区、键盘与320宽度|1–3：官方WXSS编译及截图|
|miniprogram/pages/record/index.js|recordStages/applyVoiceTask强制review；未保存队列为内存；单voiceTask；onFinalize自动done|增加两视图状态、student搜索与作用域、报告投影、异常定位、追加输入缓存及保存状态；发布自动done问题先阻断危险操作并列协作提案，不能仅删循环就算修复|1–4：迟到响应、切角色、错误、重试、未知状态测试|
|miniprogram/pages/record/index.json|已注册voice-input/ui-icon/bottom-nav|保留原路由/组件；仅新增实际复用组件注册（如需要）；不改app导航|1：JSON与编译|
|miniprogram/components/voice-input/index.wxml|文本优先、状态控件已有|新增显式record/report变体，让A匹配PDF；文字辅助折叠；唯一结束按钮；演示标识仍保留|1：其他使用页不变|
|miniprogram/components/voice-input/index.wxss|目前通用横向录音栏|仅变体内改中央麦克风、计时与双按钮；禁止全局覆盖；减少动态保留|1：录音各态与小屏|
|miniprogram/components/voice-input/index.js|已有active/waiting、秒数观察、开始/停/暂停事件|保留事件契约和真实计时；仅增加展示变体属性/文字展开事件；不在组件里接ASR|1：状态迁移、快速点击、能力降级|
|miniprogram/utils/speechComposer.js|独占owner、WechatSI/recorder路径，追加baseText|本轮默认不改；由record层适配结束回调；如确需事件元数据需单独说明，不动ASR/录音供应商|只读；现有录音测试回归|
|miniprogram/services/voiceApi.js|现有create/get/list/merge/undo|本轮不改路径、请求字段或响应；仅上层编排调用；恢复读取权限修复前不得默认启用跨设备原话恢复|只读；Mock与真实API分开|
|miniprogram/services/trainingApi.js|固定cdraft key；基本组编辑可用|本轮不擅自更改创建身份协议；复用getSession/updateActualSet/patchSessionMeta及增删动作；后续按确认协议再适配|2、4：现有契约断言|
|miniprogram/utils/coachReportView.js（拟新增）|页面直接消费segments|纯函数：真实Session＋候选形成报告展示模型、异常路径、来源；unknown/null保留；未持久化内容明确标识，不自动写服务端|2：同名分组、空值、冲突、人工值优先|
|miniprogram/utils/coachRecordDraft.js（拟新增）|local草稿仅text/public/private|保存按actor/student/session分区的原文段与未确认patch，区分本机/云端；存储失败反馈；不存token和无限音频|3：重启、存储满、过期账号|
|miniprogram/pages/home/index.js|goRecord pick=1、goRecordFor设置当前学员|阶段1不改入口；需要课程上下文时只传明确student/booking信息并再校验，不擅自决定新建/恢复|4依赖课次协议|
|miniprogram/styles/tokens.wxss、base.wxss、coach.wxss|已有Refined Green可用|默认只读复用，避免影响学员；确有缺少token才增教练scope语义变量|不整体换肤|
|server/src/services/trainingService.js|草稿恢复条件、finalize状态转换|只审查和提交接口提案，不编码|若芷P0|
|server/src/services/voice/voiceTaskService.js、structure.js、adapters/*|同名合并、字段反馈、快照撤销等|只审查，不改AI Prompt、ASR或后端协议|若芷P0/P1|
|server/src/routes/index.js、middleware/idempotency.js|创建缓存、voice读取权限|仅形成复现与契约验收要求|若芷P0|
|server/test/coach-record-v123.test.js（拟新增）|缺两视图行为测试|以wx/API替身覆盖正常自动报告、异常、人工值、迟到响应、未保存离开、发布状态；fixture明确Mock|1–3|
|server/test/coach-record-v123-http.test.js（拟新增）|关键新语义暂无协议|先保留当前行为复现；协议确认后写目标回归，不把现有缺陷期望当通过标准|4|
|server/test/coach-refinement.test.js、coach-v13.test.js、interaction-system.test.js|可能断言旧四阶段结构|仅调整被新产品交互替代的断言，业务权限/数据断言保留；先跑基线归因|每阶段|
|docs/design-archive/V1.23/*、docs/releases/V1.23.md、docs/DEVELOPER-HANDOFF.md|需版本交接|确认后保存方案、逐步实现范围、实际截图/测试/阻塞；正式提交时再写对应SHA，不将本轮方案冒充实现|每阶段归档|
|docs/API-voice.md、API-training-mock.md|“按住录音”“未接语音”等过时表述|在协作确认后纠正文档，分别标真实适配器/Mock/未验证；不凭文档创造协议|4|

## 3. 可立即落地与不可伪造的边界

前端立即可做：A/B壳、搜索学员、语音状态视觉、原位现有数值编辑、异常提示、原话折叠、保存状态、数据作用域与本地输入保护。PDF没有要求重做全站，不扩展到学员首页或其他功能。

报告“直接展示”与“自动持久化”分开：可以展示完整候选报告，但未落库要显式提示。首批只对明确完整且无同名/版本冲突的内容使用已有append；同名异组不能盲用supplement，它目前可能套用已有首个重量。异常不要求理解合并模式，改为字段问题和明确用户选择；不具备安全更新能力的纠错先保留原话和差异，不能伪装已合并。

需若芷确认：课次ID及创建/恢复；严格发布的完成/未做/未知语义和原子性；同名多组/定位纠错/人工字段保护；反馈、摘要及下次建议的持久化；安全撤销；voice任务读取权限。请求响应草案与迁移风险见同目录README.md第7–8节，它们是提案不是现有接口。

特别更正：pending→done在前端onFinalize循环；后端finalize会pending→skipped。单独删除循环仍会制造错误未做状态。确认新规则前，未知状态应阻止发布，不能隐藏风险后开放自动发布。fixed key改成随机时间也无法解决跨课程恢复，不在前端偷偷改成Date.now。

## 4. 分阶段验收顺序（遵循PDF第10页）

1. 低风险UI骨架与语音状态：A/B两视图、文字辅助与搜索学员。验证无四阶段主导航，原权限/录音事件保留；两视图切换不丢输入。仅展示真实录音/保存状态。
2. 报告预览与原位编辑：动作/逐组参数、动作反馈及总结建议；复用当前字段写入。不能持久化的结构内容保留明确待保存状态。组数不同/数值不同不压缩丢失。
3. 异常与保存：缺失/冲突定位、本地patch持久化、重试、发布校验与确认层；人工编辑优先。未知状态自动变更必须0次。若安全发布尚无支持，本阶段不能宣称整条闭环可正式使用。
4. 后端协议确认后：可靠新建/恢复、追加语音与字段级合并、严格发布。前端只适配若芷确认并提供的协议，不自行实现后端。
5. 微信工具与真机：320/375/430宽度、小屏键盘、iOS/Android中断、弱网、重复发布、角色切换、同学员第二次记录。自动化通过与真机通过分别记录。

每阶段提供实际差异、定向测试、官方WXML/WXSS编译、可获取的前后截图；环境不能执行则记Not Executed，不能用PDF图作实现截图。PDF建议2–3位教练验证：首次完整录入发布、修改第三组不重录、同学员第二次课不覆盖历史。入口≤5秒、正常记录≤3分钟仅为待实测目标。

## 5. 基线验证与风险结论

已实际运行 ac-voice.test.js + ac-training.test.js：15 Passed。独立临时HTTP复现：固定key返回旧Session；pending发布后变skipped；学员可GET未发布voice-task列表（HTTP200、1任务）。原始输出与脚本见verification.txt、reproduce.cjs。未连接付费AI、未操作生产数据。

本轮没有实现新版，也没有真机验证。设计审查结论：PDF A/B可作为前端布局与交互目标；低风险阶段1–3可分步实施，完整追加与可靠发布由P0协议修复阻塞。不会为了看起来符合稿子而将未保存候选显示成已发布报告。
