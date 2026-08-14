# 公司员工通讯录读取设计

**日期：** 2026-08-13  
**状态：** 已验证；2026-08-13 根据真实租户数据源修订

## 目标

为本地 `feishu-operations` bundle 增加一个专用、只读的公司员工通讯录入口。它仅返回在职员工的以下字段：

- 姓名
- 工作邮箱
- 飞书 `user_id`
- 飞书 `open_id`
- Core HR `employment_id`

能力只在调用时把结果返回给 Codex；不写入飞书、不生成文件、不缓存名单，也不导出给第三方。

## 方案与边界

新增 `feishu_local.feishu_company_directory`。真实验证表明本租户的员工名单位于飞书通讯录，而不是 Core HR 任职记录：Craig AI 助理可直接读取 18 名成员，另有 1 名仅通过已授权部门可见。工具因此调用官方 Contact API 的授权范围、批量用户读取及部门成员读取接口，使用现有 Keychain App 凭据获取 tenant access token，但不复用通用 MCP 的自由字段输入。

工具不接受字段列表、关键字、部门、人员状态或任意 API 路径。它固定请求 `hired`（在职）员工与通讯录所需字段，并在本地过滤响应，只输出五个允许字段。任何缺失字段以 `null` 表示，不推断、不补全。

## 输入与输出

输入：

```json
{
  "page_size": 100,
  "page_token": "optional directory continuation token"
}
```

- `page_size` 可选，范围 1–500，默认 100。
- `page_token` 可选，只接受上一页原样返回的本地目录延续 token。

输出：

```json
{
  "employees": [
    {
      "name": "…",
      "work_email": "…",
      "user_id": "…",
      "open_id": "…",
      "employment_id": "…"
    }
  ],
  "has_more": true,
  "page_token": "…"
}
```

`has_more` 为真时，Codex 只在 Craig 明确要求“全部”或要求下一页时再传入 `page_token` 继续读取。工具不会自动跨页遍历整个公司。

## 安全、错误与隐私

- 严格只读；不添加或修改员工、部门、权限、薪酬、任务或通讯录。
- 仅限在职员工；离职员工不在默认通讯录中。
- 不返回电话、住址、证件、薪酬、合同、出生信息、私人邮箱或其他 HR 字段。
- 不将员工内容写入 bundle 的文档、测试夹具、日志或最终交接信息。
- API 失败只返回 `FEISHU_DIRECTORY_ERROR` 及安全的 `stage`、Feishu code、HTTP status；不泄漏 token 或原始错误载荷。

## 验证

1. 单元测试验证 MCP schema、字段固定、分页参数与不支持参数的拒绝。
2. 使用本地 HTTP 服务器和伪 Keychain 验证官方请求方法、token 身份、固定筛选与响应字段清洗。
3. 真实飞书验证读取一页（最多 500 位在职员工），确认姓名、邮箱和两种飞书 ID 的实际字段映射；不把结果写入文件或在交接中复述。`employment_id` 在没有关联 Core HR 记录时为 `null`。
4. 通过后更新能力台账为“已验证、只读、分页”。

## 非目标

- 不创建通讯录 Bitable、CSV、文件或同步任务。
- 不做离职员工、部门筛选、模糊检索或任意 HR 报表。
- 不把 tenant token、通用 Core HR API 或通用通讯录 API 开放给其他本地工具。
