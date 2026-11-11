# V1.22 自主训练与组编辑归档

## 当前实现
新建页分别进入空白自主训练与模板列表。自主训练通过 POST /sessions 的 source_type=manual 创建或恢复本人未完成训练；新增/删除组沿用事务、权限及幂等机制，限制 1–30 组。组类型为可选 warmup/working，旧数据默认正式组。

执行页保留轮盘，移除大幅示范插画，使用紧凑组行。重量、次数、组类型在当前页底部面板编辑；关闭面板不等于完成训练组，勾选以实际 API 结果为准。支持增删组、动作删除确认、按日期倒序历史。

模板保存使用永久模板；历史模板未重新保存前保留原规则，不批量修改数据。动作次数按已完成训练去重统计，不按点击次数。推荐排序为编辑推荐，不是全网热度排名。

## 涉及模块
miniprogram/pages/new-workout、workout、plan-edit、plans、exercises；services/trainingApi.js；utils/http.js；server/src/routes/index.js；services/trainingService.js、exerciseService.js；相关测试与编译脚本。

## 验证与交接
运行 node --test server/test/new-workout.test.js server/test/http-session.test.js server/test/exercise-browser.test.js：15 项通过，包含隔离 HTTP、组修改幂等、未登录拒绝、底部面板输入、会话失效和动作浏览。
此前全量 230 项中 220 通过、10 失败；一项测试替身已修复，其余仍需对照基线排查。不能宣称全量通过。微信开发者工具连接不稳定，实际新界面与真机键盘、小屏、弱网尚未验收。

下一步：处理剩余回归失败，检查身份切换期间异步写入、动作历史切换、导入动作标识及真机底部面板。左右独立重量未实现，热身组仍沿用已有容量统计规则。

资料线索：https://www.hevyapp.com/stronger-with-hevy/ 、https://www.gymstreak.com/research/how-lifters-train 、https://www.boostcamp.app/state-of-lifting-2025 。统计口径不同，不宣称统一热度榜。
