# 飞书以本人身份发送私信设计

**日期：** 2026-08-14  
**状态：** Craig 已选择“以本人身份发送”路径，并已明确授权本次向 `张超煜` 发送 `你好` 的测试。

## 目标

在本地 `feishu-operations` bundle 中新增一个与机器人路径完全独立的私信工具。它使用 Craig 已授权的 `user_access_token`，让收件人看到消息来自 Craig，而不是 Craig AI 助理机器人。

## 方案

新增 `feishu_local.feishu_send_user_direct_message`，只接受：

```json
{
  "recipient_name": "张超煜",
  "text": "你好",
  "confirmation": "send_user_direct_message"
}
```

辅助程序先通过现有、受限的公司通讯录进行精确姓名匹配；仅当恰好命中一个活跃员工且有 `open_id` 时，才从 macOS Keychain 读取或刷新 Craig 的用户访问令牌。随后调用官方 `POST /open-apis/im/v1/messages?receive_id_type=open_id`，并以该用户令牌的 `Authorization: Bearer` 请求头发送固定的 `text` 消息。

现有 `feishu_send_direct_message` 保持原状，仍明确表示“以 Craig AI 助理机器人身份发送”。两个工具的名称、确认值、帮助程序和错误前缀均不复用，防止调用方混淆发送者身份。

## 授权与安全边界

- 用户令牌必须拥有 `im:message` 和 `im:message.send_as_user`；若当前令牌不含它们，工具只返回脱敏的官方失败码并停止，不自动改变授权或权限。
- 每次只能向一名、姓名完全匹配的员工发送一条非空、最多 2,000 字符的纯文本。零个或多个匹配都失败，绝不猜测或模糊匹配。
- 必须传入固定确认值 `send_user_direct_message`。除了这次已授权的 `张超煜` / `你好` 测试外，每次发送前必须在当前对话中展示姓名与完整正文，并获得新的逐字确认。
- 不支持群聊、多人、文件、图片、卡片、富文本、回复、转发、编辑、删除或定时发送。
- 成功只返回 `recipient_name` 与 `sent`；失败只返回 `FEISHU_USER_DIRECT_MESSAGE_ERROR` 加 `stage`、Feishu code、HTTP status。两种结果都不包含人员 ID、消息 ID、token、消息正文或原始 API 错误。

## 验证

1. 单元测试使用假 Keychain 和本地 HTTP 服务，证明消息 POST 使用 `user_access_token` 而不是 tenant token，并验证精确匹配、确认门槛、失败脱敏与不发送条件。
2. 本地 MCP 测试验证 schema、确认值和未知参数会在辅助程序启动前被拒绝。
3. 完整回归、安装和 source/cache 一致性检查通过后，从已安装 MCP 发起已授权测试。只汇报已发送，或安全错误码及最小恢复步骤。
