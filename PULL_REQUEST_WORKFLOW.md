# Pull Request、分支同步与发布流程

本文档是 Tab Garden 从功能分支进入 `dev`、再进入 `main` 的强制交付流程。用户要求提交、合并、创建 PR 或发布时，coding agent 必须执行本文档，不得跳过检查、使用本地合并代替 GitHub PR，或在 Actions 失败时继续下一阶段。

## 长期分支

流程结束后，本地和远端应只保留以下项目分支：

- `feature/20260719`
- `dev`
- `main`

本流程创建的 `fix/*`、`chore/*` 或同步分支必须在合并成功且合并后 Actions 成功后删除。不要删除非本流程创建的历史分支；如有此类分支，应在最终报告中列出并请求用户决定。

## 通用规则

### 每次操作分支前必须同步

```bash
git fetch origin
git checkout <branch>
git pull --rebase origin <branch>
```

- 工作区不干净时，先分析和保护现有修改，不得丢弃用户改动。
- fetch、pull、rebase 或 merge 出现冲突时立即停止，不自动解决。
- 不对已发布的共享分支执行 force push。
- 每次 push 前再次确认远端没有新增提交。

### 每个合并关卡的成功定义

只有同时满足以下条件才算该关卡完成：

1. 本地验证通过。
2. 真实 GitHub PR 已创建。
3. PR 上所有必需 Actions 成功。
4. PR 已在 GitHub 合并。
5. 合并后目标分支触发的所有 CI/Release Actions 成功。
6. 该阶段创建的临时分支已在本地和远端删除。

任一 Actions 失败，都必须读取失败日志、修复、重新验证并等待重跑成功。成功前不得进入下一关卡。

## 阶段一：整理 feature 分支

1. fetch 远端并 pull 最新 `feature/20260719`。
2. 检查完整工作区 diff，确认没有误包含敏感文件或无关修改。
3. 执行：

   ```bash
   npm run typecheck
   npm test
   git diff --check
   ```

4. 按 `AGENTS.md` 的原子提交规范拆分 commit。
5. push `feature/20260719`。

## 阶段二：feature 合并到 dev

1. 创建真实 GitHub PR：`feature/20260719 → dev`。
2. 等待 PR Actions 全部成功。
3. PR Actions 失败时，在基于最新目标状态的分支上修复并 push，循环直到成功。
4. Actions 成功后在 GitHub 合并 PR。
5. 等待 `dev` 合并后 Actions 全部成功，包括：
   - CI
   - Preview Release
   - `dev-preview` 覆盖发布
6. 合并后 Actions 失败时：
   - fetch/pull 最新 `origin/dev`；
   - 从最新 `dev` 创建临时 `fix/*` 分支；
   - 修复、本地验证、创建真实 PR 到 `dev`；
   - 等待 PR Actions、合并、再等待 `dev` Actions；
   - 全部成功后删除本地和远端 fix 分支。
7. pull 最新 `dev` 和 `feature/20260719`，将 `dev` 的最新状态同步回 feature 并 push。
8. `dev` 全部成功前，不得创建 `dev → main` PR。

## 阶段三：dev 合并到 main

1. fetch/pull 最新 `dev` 和 `main`，确认 `dev` 包含所有已验证修改。
2. 创建真实 GitHub PR：`dev → main`。
3. 等待 PR Actions 全部成功。
4. 失败时先基于最新状态修复，并确保修复经过 `dev` 验证；循环直到 PR 检查成功。
5. Actions 成功后在 GitHub 合并 PR。
6. 等待 `main` 合并后 Actions 全部成功，包括：
   - CI
   - 正式版本 patch 自动递增
   - ZIP 构建
   - GitHub Release 发布
7. `main` Actions 失败时：
   - fetch/pull 最新 `origin/main`；
   - 创建临时 fix 分支定位问题；
   - 修复必须重新经过 `dev` 和 `main` 的真实 PR、检查与合并流程；
   - 生产 Actions 成功后删除本地和远端 fix 分支。

## 阶段四：向下同步分支

生产发布成功后，按以下方向同步：

```text
main → dev → feature/20260719
```

1. fetch/pull 最新 `main`。
2. 通过正常 merge/PR 将 `main` 的合并提交同步回 `dev`，不得 force push。
3. 等待同步后的 `dev` Actions 成功。
4. fetch/pull 最新 `dev` 和 `feature/20260719`。
5. 将 `dev` 同步回 `feature/20260719`，验证并 push。
6. 出现冲突时停止并请求用户处理，不自动解决。

## 临时修复分支清理

临时分支只能在其 PR 已合并且目标分支 Actions 成功后删除：

```bash
git push origin --delete fix/<name>
git branch -d fix/<name>
```

删除前确认：

- PR 状态为 merged；
- commit 已包含在目标分支；
- 合并后的 Actions 成功；
- 当前工作区不在待删除分支上。

## 最终审计与汇报

流程完成后检查：

- 本地和远端分支列表；
- `feature/20260719`、`dev`、`main` 的 commit；
- 三个分支的 ahead/behind 状态；
- 所有相关 PR 均已合并；
- CI、Preview Release 和正式 Release 全部成功；
- 本流程创建的临时分支全部删除；
- 工作区干净。

最终向用户报告：

- 原子 commits 和用途；
- 两个主要 PR 的链接及合并结果；
- 各阶段 Actions 链接；
- Preview Release 和正式 Release 链接；
- 正式发布版本号；
- Actions 失败及修复记录；
- 最终本地/远端分支状态和 ahead/behind 结果。
