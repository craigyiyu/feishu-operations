# 日历、任务、审批与妙记能力设计

**日期：** 2026-08-12  
**状态：** 已获 Craig 批准，待实施

## 目标

在本地 `feishu-operations` bundle 中一次性加入并验证三类工作能力：

1. 日历与会议：查看空闲/事件，创建、修改、删除事件，添加参会人。
2. 任务：查看、创建、修改、删除任务，添加负责人/关注人和提醒。
3. 审批与妙记：严格只读地查询审批和读取指定妙记的元信息、转写文本。

## 架构决策

保留三个 MCP 服务器的职责：`feishu` 使用 Craig 的用户授权并承载官方 API；`feishu_local` 只补官方 MCP 缺少的妙记转写读取；`feishu_tenant` 仍只承载固定的 HR/Payroll 只读清单。

`feishu` 不再允许通过环境变量任意替换工具清单。启动器固定选择以下官方工具，避免把广泛授权的写入/管理 API 无意暴露：

- 保持现有能力：`preset.default`。
- 日历/会议：`preset.calendar.default`、`calendar.v4.calendarEvent.list`、`calendar.v4.calendarEvent.delete`、`calendar.v4.calendarEventAttendee.create`、`calendar.v4.calendarEventAttendee.list`。
- 任务：`preset.task.default`、`task.v2.task.get`、`task.v2.task.list`、`task.v2.task.delete`。
- 审批只读：`approval.v4.approval.get`、`approval.v4.instance.get`、`approval.v4.instance.list`、`approval.v4.instance.query`、`approval.v4.instanceComment.list`、`approval.v4.task.query`、`approval.v4.task.search`。
- 妙记元信息只读：`minutes.v1.minute.get`。

官方 MCP 当前没有“导出妙记文字记录”工具。`feishu_local` 新增 `feishu_minute_transcript`，只调用官方 `GET /open-apis/minutes/v1/minutes/:minute_token/transcript`；使用已有 Keychain 中 Craig 的用户 access token；只接受一个精确的 24 字符 `minute_token`，`format` 限制为 `txt` 或 `srt`，可选说话人与时间戳。它不会枚举妙记、下载音视频、写入飞书或保留文本到磁盘。

## 安全与确认规则

- 日历、会议、任务的所有写入继续遵循 bundle 的“先读取、展示精确目标/载荷、获得当次确认、回读验证”规则。
- 对外参会人、会议群、视频会议、通知、任务负责人/关注人、任务提醒属于额外影响范围；必须在预览中逐项列出并获得确认。
- 审批和妙记新入口严格只读：不创建、审批、拒绝、转交、撤销、评论、订阅、导出媒体，也不在工作区写入内容。
- 只对请求中明确给出的妙记链接或 token 读取转写。默认返回摘要；仅在 Craig 明确要求时返回原文。
- 不能因具备 scope 而把其他 API 自动加入 bundle。

## 验证边界

- 创建一条标有 `[Codex Test]`、仅 Craig 自己可见、没有参会人的 10 分钟日历事件；读回后删除。
- 创建一条标有 `[Codex Test]`、仅归属 Craig 的任务；读回后删除。
- 审批仅以最小查询验证可读性；不对实例做任何操作。
- 妙记只用 Craig 明确提供的 token/链接做最小元信息与转写读取。若没有可访问 token，则记录为“工具已安装和静态验证，等待指定妙记的真实授权验证”，不做枚举或猜测。

## 成功条件

- 官方 MCP 固定清单包含上述工具且不允许环境变量扩大范围。
- 本地 MCP 输入校验和失败信息不泄漏 token/转写内容；静态测试通过。
- 能完成日历、任务的安全真实写入—回读—清理闭环。
- 审批/妙记分别获得最小真实读验证，或准确报告由具体数据访问条件导致的待验证项。
