# Tab Garden

一个使用 TypeScript 开发的 Chrome / Edge Manifest V3 标签管理扩展。

## 第一版能力

- 同一窗口内，按标准化 hostname 自动分组（默认 2 个标签页触发）。
- `www.example.com` 与 `example.com` 视为同一网站。
- 忽略固定标签页、浏览器内部页面和非 HTTP(S) 页面。
- 用户可选择任意标签页创建自定义分组，并设置名称和颜色。
- 自定义分组及浏览器中手工创建的原生分组不会被自动规则改动。
- 支持暂停自动分组、调整触发数量和手动重新整理。
- 扩展启动、标签创建/更新/关闭/跨窗口移动时自动恢复一致状态。

## 开发

```bash
npm install
npm test
```

## 配置 Supabase 登录

1. 在 Supabase 创建项目，并在 **Authentication → Providers → Email** 开启邮箱登录。
2. 从 **Project Settings → API** 复制 Project URL 和 anon/publishable key。
3. 执行 `cp .env.example .env.local`，将它们填入 `.env.local`。不要使用 `service_role` key。
4. 执行 `npm run build`，然后重新加载扩展。

扩展支持邮箱注册、邮箱密码登录、邮件确认、自动刷新会话和退出登录。认证会话保存在扩展自己的 `chrome.storage.local` 中。登录后，自动分组开关和分组阈值会同步到 `public.user_settings`；已有云端设置优先，云端没有记录时会使用本地设置初始化。

## 加载到浏览器

1. 执行 `npm run build`。
2. 打开 `chrome://extensions`（Edge 使用 `edge://extensions`）。
3. 开启“开发者模式”。
4. 点击“加载已解压的扩展程序”，选择本项目的 `dist` 目录。

## 当前规则

自动分组以 `windowId + hostname` 为边界。自动组少于设置的标签数量时会解散；自定义组不会自动解散。若标签页已经位于一个不受本扩展管理的原生标签组中，扩展将其视为用户手工分组并保持不动。
