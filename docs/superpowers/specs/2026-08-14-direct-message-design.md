# 飞书指定人员私信设计

**日期：** 2026-08-14  
**状态：** 已获 Craig 对本次测试发送的明确授权

## 目标

为本地 `feishu-operations` bundle 增加一个只发送一条纯文本私信的本地 MCP 工具。它以 Craig AI 助理机器人的身份向通讯录内一名、且仅一名精确匹配的员工发送消息。

本次已授权的验证动作是：精确匹配 `张超煜`，发送文本 `你好`。

## 方案

新增 `feishu_local.feishu_send_direct_message`，仅接收：

```json
{
  "recipient_name": "张超煜",
  "text": "你好",
  "confirmation": "send_direct_message"
}
```

辅助程序使用与公司通讯录相同的 tenant token 和官方 Contact API，在 Craig AI 助理可见的直接用户与授权部门成员中合并、去重并精确匹配姓名。只有匹配结果恰好一人且存在 `open_id` 时，才调用官方 `POST /open-apis/im/v1/messages?receive_id_type=open_id`，请求体固定为 `msg_type: "text"` 和 JSON 序列化后的文本内容。

## 安全边界

- 每次仅发送给一名精确匹配的员工；零个或多个匹配均失败，绝不猜测或模糊匹配。
- 必须传入固定确认值 `send_direct_message`，调用前由 Codex 向 Craig 展示姓名与完整文本。
- 仅支持非空、单条、最多 2,000 字符的纯文本；不支持群聊、多人、卡片、文件、图片、富文本、回复、转发、编辑或删除。
- 返回仅包含 `recipient_name`、`sent` 和非敏感的发送状态；不返回 `open_id`、token 或原始 API 响应。
- 失败只返回 `FEISHU_DIRECT_MESSAGE_ERROR` 及 `stage`、Feishu code、HTTP status；不泄漏人员 ID、消息文本或原始错误信息。
- 消息发送是写操作；除本次已明确授权的 `张超煜` / `你好` 外，每一次发送都需要新的、逐字确认。

## 验证

1. 单元测试用假 Keychain 与本地 HTTP 服务验证：唯一匹配时仅调用官方文本消息接口；请求参数、固定消息类型和确认门槛正确；不输出原始 ID 或 API 错误。
2. 本地 MCP 测试验证 schema、未知参数与错误确认值在调用辅助程序前被拒绝。
3. 完整回归通过后，从已安装的 MCP 执行这一次已授权的发送，并只报告成功/失败与安全错误码。
