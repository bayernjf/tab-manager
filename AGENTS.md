# AGENTS.md — Tab Garden 项目指令

本文档供在本仓库工作的 AI coding agents 使用。修改代码前应先阅读本文档，并保持本文档与实际项目同步。

## 项目概览

Tab Garden 是一个 Chrome / Edge Manifest V3 标签管理扩展，使用原生 TypeScript、HTML 和 CSS 开发，不使用前端框架或打包器。

- 包管理器：npm，不使用 pnpm 或 yarn
- 语言：TypeScript（strict mode）
- 运行环境：Chrome / Edge Manifest V3
- 后台：ES Module service worker
- 后端：Supabase Auth + PostgREST
- 数据库迁移：`supabase/migrations/`
- 构建产物：`dist/`，不提交到 Git

## 项目结构

```text
tab-manager/
├── .github/workflows/
│   ├── ci.yml                # PR/main/dev 验证与临时构建产物
│   └── release.yml           # 版本标签打包及 GitHub Release
├── src/
│   ├── manifest.json          # 扩展权限、后台和 popup 配置
│   ├── background.ts          # 消息路由、标签分组、设置同步
│   ├── popup.html             # 登录和标签管理界面
│   ├── popup.ts               # popup 交互逻辑
│   ├── popup.css              # popup 样式
│   ├── shared.ts              # 通用类型、常量和纯函数
│   ├── storage.ts             # chrome.storage.local 读写
│   ├── auth.ts                # Supabase Auth REST 客户端
│   ├── sync.ts                # Supabase user_settings 同步
│   └── supabase-config.ts     # 构建时替换的配置占位符
├── scripts/
│   └── inject-env.mjs         # 将 .env.local 注入 dist 配置
├── supabase/migrations/
│   └── 001_create_user_sync_tables.sql
├── tests/
│   └── shared.test.js         # Node.js 单元测试
├── .env.example
├── PULL_REQUEST_WORKFLOW.md # PR、Actions、发布和分支回同步流程
├── package.json
└── tsconfig.json
```

## 常用命令

所有命令在仓库根目录执行。

```bash
npm install          # 安装依赖
npm run typecheck    # TypeScript 类型检查，不生成文件
npm run build        # 清理 dist、编译、复制静态文件并注入环境配置
npm test             # 完整构建并执行 Node.js 测试
```

提交或交付代码前至少执行：

```bash
npm test
```

还应运行 `git diff --check`，确保没有空白符错误。

## 本地加载扩展

1. 创建并填写 `.env.local`。
2. 执行 `npm run build`。
3. 打开 `chrome://extensions` 或 `edge://extensions`。
4. 开启开发者模式，加载已解压的 `dist/`。
5. 修改源代码后必须重新构建并在扩展管理页重新加载。

## 环境变量与构建

`.env.local` 必须包含：

```dotenv
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-or-publishable-key
```

约定：

- `.env.local` 和其他 `.env.*.local` 文件禁止提交。
- 新增或重命名环境变量时必须同步更新 `.env.example`。
- 只能在客户端使用 Supabase anon/publishable key，绝不能写入 `service_role` key。
- 项目没有 Vite/Webpack，不能使用 `import.meta.env` 或 `process.env` 读取浏览器运行时配置。
- `scripts/inject-env.mjs` 在构建末尾将配置写入 `dist/supabase-config.js`。
- `src/supabase-config.ts` 必须保留占位符，禁止将真实项目配置直接写入该文件。

## 运行架构

### Popup 与后台通信

Popup 不直接管理认证会话或数据库访问。`popup.ts` 通过 `chrome.runtime.sendMessage` 调用 `background.ts`，后台负责：

- 注册、登录、退出和恢复会话
- 刷新过期 access token
- 读取及同步用户设置
- 查询和修改浏览器标签页/标签组

新增消息类型时，应同时更新 `PopupMessage` 联合类型和后台消息处理分支。错误应通过 `{ error: string }` 返回给 popup。

### Supabase 认证

`src/auth.ts` 直接调用 Supabase Auth REST API，不引入 `@supabase/supabase-js`。

- 会话存储键为 `supabaseSession`，保存在扩展私有的 `chrome.storage.local`。
- access token 临近过期时自动使用 refresh token 刷新。
- 认证失败或刷新失败时清除无效会话。
- 不在日志、界面报错或测试输出中暴露 token。

### 数据同步策略

当前只同步 `Settings`：

- `autoGroupEnabled` ↔ `user_settings.auto_group_enabled`
- `minimumTabs` ↔ `user_settings.minimum_tabs`

同步规则：

- 登录或恢复会话时查询远端设置。
- 远端已有记录时以云端为准并写入本地。
- 远端无记录时用当前本地设置初始化云端。
- 用户修改设置时先保存本地，再 upsert 到 Supabase。

以下是浏览器运行时状态，只保存在本地，禁止同步到 Supabase：

- `tabId`
- `windowId`
- Chrome 原生 `groupId`
- `autoGroups` 中的运行时映射
- 当前打开标签页列表

`group_rules` 表已经创建，但当前尚未接入扩展。未来跨设备同步自定义分组时，应保存稳定的域名规则、标题、颜色和顺序，不能上传浏览器临时 ID。

## Supabase 数据库

数据库结构和 RLS 策略位于：

```text
supabase/migrations/001_create_user_sync_tables.sql
```

迁移包含：

- `public.user_settings`
- `public.group_rules`
- `updated_at` 触发器
- 查询索引
- 仅允许认证用户访问自己数据的 RLS policies

修改数据库结构时：

- 新建后续编号的迁移文件，不要重写已在线上执行的迁移来代替新迁移。
- 所有用户数据表必须启用 RLS。
- 策略必须基于 `auth.uid() = user_id` 限制数据所有权。
- 数据库字段使用 `snake_case`，TypeScript 字段使用 `camelCase`，转换集中放在同步层。
- SQL 应尽可能支持安全重复执行，并包含必要索引和约束。

## 标签分组规则

- 自动分组以 `windowId + 标准化 hostname` 为边界。
- `www.example.com` 与 `example.com` 视为同一网站。
- 只处理 HTTP(S) 页面，忽略固定标签页和浏览器内部页面。
- 达到 `minimumTabs` 才创建自动分组。
- 自动组低于阈值或混入其他域名时应解散并重新协调。
- 自定义分组和非本扩展管理的原生分组必须保持不动。
- 所有可能高频触发的标签事件通过现有 debounce 调度，避免重复协调。

## 代码规范

- 保持 TypeScript strict 通过，避免 `any` 和不必要的类型断言。
- 共享类型、纯函数和常量放在 `shared.ts`。
- Chrome 本地存储访问集中在 `storage.ts`。
- Supabase Auth 逻辑放在 `auth.ts`，数据库同步逻辑放在 `sync.ts`。
- DOM 查询使用现有 `$<T>()` helper，并为表单元素声明准确类型。
- 用户可见文案使用简体中文；内部标识和代码命名使用英文。
- 不使用 `innerHTML` 渲染用户或远端数据，优先使用 `textContent` 和 DOM API。
- 保持 popup 适配约 390px 宽度和 600px 最大高度。
- 未经明确需求不要引入框架、状态库、Supabase SDK 或构建器。
- 修改 manifest 权限时遵循最小权限原则，并说明新增权限用途。

## 测试与验证

自动验证：

```bash
npm test
npm run typecheck
git diff --check
```

涉及浏览器 API、认证或同步的改动还需要手动验证：

1. 未登录时只显示登录/注册界面。
2. 注册后正确处理邮件确认开启和关闭两种情况。
3. 登录、会话恢复、token 刷新和退出正常。
4. 修改设置后 Supabase `user_settings` 记录正确更新。
5. 换账号后不会读取其他用户的数据。
6. 离线或 Supabase 失败时不破坏本地标签管理数据。
7. 自动分组和自定义分组的既有行为无回归。

纯函数优先添加到 `shared.ts` 并在 `tests/` 中补充 Node.js 单元测试。依赖真实 Chrome 或 Supabase 的逻辑应尽量拆出可测试的转换函数。

## Commit Message 规范

提交规则以 `.trae/rules/git-commit-message.md` 为准。

```text
<type>(<scope>): <imperative English summary>

<English body explaining the purpose>
```

- type：`feat` / `fix` / `refactor` / `chore` / `docs` / `test` / `style` / `perf`
- scope：优先使用 `auth` / `sync` / `popup` / `tabs` / `storage` / `supabase` / `build` / `docs`
- subject 使用英文祈使句，不超过 50 个字符。
- 每个 commit 必须包含简短英文 body，说明改动目的。
- 每个 commit 只做一件事，按功能和文件职责原子拆分。
- 文档、构建配置、测试、UI、认证和同步等无关改动不得混入同一 commit。

示例：

```text
feat(sync): persist user settings to Supabase

Upsert grouping preferences after local changes and restore them
when an authenticated session is resumed.
```

## Git 工作流

涉及提交、push、PR、合并、Actions 等待、发布或分支同步时，必须先阅读并严格执行 `PULL_REQUEST_WORKFLOW.md`。该文件是完整交付流程的最高优先级项目内说明；本节只定义通用 Git 约定。

### 分支职责

| 分支 | 用途 |
|---|---|
| `main` | 稳定版本，必须通过 PR 和人工 review 合并 |
| `dev` | 日常开发集成分支 |
| `feature/<描述>` | 新功能开发 |
| `fix/<描述>` | Bug 修复 |
| `chore/<描述>` | 构建、配置或维护工作 |

- 不直接在 `main` 或 `dev` 上开发或提交。
- push 前先执行 `git pull --rebase` 或等效的 fetch/rebase 检查。
- rebase、merge 或 pull 出现冲突时，不自动解决；列出冲突文件并等待用户确认。
- 不擅自提交、push、创建 PR 或合并，只有用户明确要求对应操作时才执行。

### 用户交付指令

#### “提交代码”

仅提交并 push 当前分支，不创建 PR 或合并：

1. 检查当前分支、工作区和完整 diff。
2. 执行项目验证，失败则停止并报告。
3. 按原子规则拆分多个 commit。
4. push 前同步远端，发现冲突则停止。
5. push 当前分支并报告 commit 和分支。

#### “提交代码并合并到 dev”

1. 执行完整验证，失败则停止。
2. 原子提交并 push 当前功能分支。
3. 获取最新 `origin/dev` 并进行冲突预检。
4. 有冲突时停止，不自动解决。
5. 无冲突时创建目标为 `dev` 的 PR。
6. 该完整指令本身视为合并授权：将功能分支合并到 `dev` 并 push，最后切回原分支。

#### “创建 PR”

1. 验证、原子提交并 push 当前分支。
2. 创建目标分支符合用户要求的 PR；未指定时默认目标为 `dev`。
3. 创建后停止，不进行本地或远端合并。

### PR 描述模板

```markdown
## 改动摘要
- ...

## 影响范围
- [ ] Popup UI
- [ ] 标签分组
- [ ] 认证与会话
- [ ] Supabase 同步 / 数据库
- [ ] 构建配置
- [ ] 文档

## 验证
- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `git diff --check`
- [ ] 浏览器手动测试
```

## CI/CD

### 持续集成

`.github/workflows/ci.yml` 在以下情况运行：

- 向 `main` 或 `dev` 发起或更新 Pull Request。
- 代码 push 到 `main` 或 `dev`。
- 用户在 GitHub Actions 页面手动触发。

CI 使用 `.env.example` 作为无真实账号的构建配置，依次执行 `npm ci`、类型检查和 `npm test`，并保留 7 天的 `dist/` artifact。CI 不访问真实 Supabase 数据。

### 版本发布

`.github/workflows/release.yml` 在以下情况运行：

- 代码合并或 push 到 `dev` 时，发布预览版。
- 代码合并或 push 到 `main` 时，发布最新版。
- 手动创建并 push 名称匹配 `v*` 的 Git tag 时，发布对应版本。

发布通道：

| 触发来源 | Release tag | 产物 | 行为 |
|---|---|---|---|
| `dev` | `dev-preview` | `tab-garden-preview.zip` | 保持 `manifest.json` 版本号不变，移动固定 tag 并覆盖预览 Release 和同名 asset |
| `main` | 自动递增的 `vX.Y.Z` | `tab-garden-vX.Y.Z.zip` | 读取最高正式 tag 并将 patch 加一，更新包内 manifest 版本，创建新的正式 Release |
| `v*` tag | 用户创建的 tag | `tab-garden-<tag>.zip` | 创建或更新该版本 Release |

`dev-preview` 是滚动 tag，会由 Actions 强制移动到 `dev` 的最新提交，不要为它设置禁止 Actions 更新的保护规则。`main` 自动版本以仓库中最高的严格三段式 tag（`vMAJOR.MINOR.PATCH`）为基准递增 patch；若当前提交已有正式 tag，失败重跑时会复用该 tag，不会重复加版本。分支和 tag 发布都会执行完整类型检查与测试。

Release workflow 需要仓库 Actions Secrets：

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

正式版本 tag 发布前必须确保 tag 所指向的 `src/manifest.json` 版本号正确。Release 构建产物包含公开的 Supabase publishable key，但不得包含 `service_role` key。

## 安全与 Git 约定

- 不提交 `.env.local`、会话 token、用户邮箱或其他真实用户数据。
- anon/publishable key 可以出现在构建产物中，但只允许依赖 RLS 保护数据；它不是服务端秘密。
- `service_role` key 永远不能进入扩展、源码、构建产物或 Git 历史。
- 不修改或删除与当前任务无关的用户改动和未跟踪文件。
- `dist/` 和 `node_modules/` 由工具生成，不直接编辑。
- 不执行破坏性 Git 命令，除非用户明确要求。
