# 教程革命 AI 助教接入

`src/components/assistant/TutorialAssistant.astro` 是独立的 Astro 组件，入口为 `/guides/assistant/`。它不依赖 React，也不改变现有文档页面的渲染。浏览器使用原生 Fetch 调用教程革命服务。

## 服务与费用归属

默认服务地址为 `https://stellaris-mod-academy-hua.cheeky-cup-6627.chatgpt.site`。此集成经服务所有者授权，共用教程革命现有的 DeepSeek 密钥、98 条知识库和同一份 D1 费用账本；不会创建新的 50 美元预算。两个网站的所有访客共同消耗一次性 50 美元总额，耗尽后服务端暂停问答。

密钥只在教程革命服务端使用，浏览器和本仓库均不持有密钥。知识库由服务端按问题检索，版本与验证范围随上下文提供给模型；本仓库不复制完整教程、私人聊天或个人记忆。当前固定模型为 DeepSeek V4.1 Flash（`deepseek-flash`），思考强度为 `high`，输出上限为 8192 tokens（包含思考与正文）。回答默认简明纯文本，保留代码语法。

服务端保留原子费用预留、幂等请求、未知结果保留预留和不自动重试等规则。当前价格复核截止时间为 2026-11-12 08:00（上海）；未复核时自动暂停。维护者不应将 `available` 状态理解为可用性承诺：供应商或网络也可能暂时不可用。

## 配置

默认构建即可使用上述服务，不需要配置 API key。可用公开构建变量 `PUBLIC_TUTORIAL_ASSISTANT_API_URL` 替换为兼容服务的 HTTPS 根地址；显式设置为空字符串则停用问答。不要把密钥、令牌或用户名密码放入此变量。

服务端只允许精确来源：

- `https://pdxdoc-next.netlify.app`
- `https://main--pdxdoc-next.netlify.app`
- 教程革命自身同源请求

本地开发、任意 Netlify Deploy Preview 和其他自定义域名不会自动获得生产 API 访问权限。新增来源需要服务所有者明确配置；不得使用 `*.netlify.app` 或通配 `Access-Control-Allow-Origin`。CORS 是浏览器来源限制，不是用户身份验证或完整的反滥用系统。

没有服务或服务暂停时，页面显示原因和手动重新检查按钮，原文档仍可使用。移除侧边栏条目与 `assistant.mdx` 即可撤销 UI 接入，不涉及数据库迁移。服务所有者也可移除目标域名白名单暂停外站接入。

## 接口

- `GET /api/chat/status` 返回 `{ available, message, model, effort, maxOutputTokens }`，仅检查配置与预算状态，不发起付费问答。
- `POST /api/chat` 使用 JSON `{ message, history, lessonId: "home" }`，附 `Idempotency-Key: <UUID v4>`。
- 成功返回 `{ content, sources: [{ id, title, relatedLesson }] }`；失败返回 `{ message }` 和对应非 2xx 状态码。
- 同一问题只发起一次请求，没有自动重试或自动续写。失败消息不会混入下一轮对话历史。
- 问题最多 8192 UTF-8 字节；历史最多六条、每条 8192 字节且合计 24000 字节。此字节限制与模型输出 token 上限不是同一概念。

浏览器只在用户提交时发送问题与有限历史。对话留在当前页面内存，不写入 Cookie 或 localStorage；刷新、离开或新建对话后清除。问题与历史由教程革命转交 DeepSeek。答案与来源作为文本渲染，不执行模型输出中的 HTML。引用链接回到教程革命的对应课程。

## 验证

遵循仓库现有 pnpm 工作流：

```sh
pnpm install --frozen-lockfile
node --test tests/tutorial-assistant.test.mjs
pnpm run build
```

测试使用离线数据，不使用生产密钥、不产生模型费用。部署预览默认不会通过生产服务的来源校验；如需本地完整交互测试，可配置本地模拟接口。服务端的 CORS、共享账本和费用并发回归位于教程革命服务仓库，并不由这个纯前端 PR 迁移。
