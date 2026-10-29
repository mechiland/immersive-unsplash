# Immersive Unsplash

基于 WXT、TypeScript、Chrome Manifest V3 的桌面扩展。取消 Unsplash 左侧导航占位，保留原站图片流、推广、搜索、账户和图片操作，将浏览导航整理为顶部布局。没有 popup、设置页、后台服务、遥测或第三方接口。

## 工具链与安装

项目用 `mise.toml` 固定 Node.js **24.21.0** 和 pnpm **10.20.0**，不需要修改全局 Node/pnpm 配置。先安装 [mise](https://mise.jdx.dev/getting-started.html)，然后在项目目录执行：

```sh
mise trust mise.toml
mise install
mise exec -- pnpm install --frozen-lockfile
```

依赖安装会运行 `wxt prepare` 生成 `.wxt/` 类型配置。只使用 pnpm，锁文件为 `pnpm-lock.yaml`。

```sh
# 开发（WXT 开发构建与浏览器 runner）
mise exec -- pnpm dev

# 类型、ESLint 和单元测试
mise exec -- pnpm check

# Chrome MV3 生产构建，自动同步到可见的 artifacts 目录
mise exec -- pnpm build

# 重新构建并生成 ZIP，同步构建目录与 ZIP 到 artifacts
mise exec -- pnpm zip
```

## 在 Chrome 加载

1. 打开 `chrome://extensions`，启用“开发者模式”。
2. 点击“加载已解压的扩展程序”，选择本项目的 **`artifacts/chrome-mv3`** 目录。
3. 刷新已打开的 Unsplash 页面。

目录包含 `manifest.json` 和 `content-scripts/`，可以直接作为 unpacked extension 加载。`.output/chrome-mv3` 是 WXT 的同一份原始构建，但 `.output` 在 macOS 中是隐藏目录，因此推荐选择可见的 `artifacts/chrome-mv3`。文件选择器中也可按 `⌘⇧G` 输入完整目录路径。

更新源码并重新构建后，在扩展管理页点击这张扩展卡片的“重新加载”，再刷新 Unsplash；只刷新网页可能继续使用 Chrome 缓存的旧扩展资源。ZIP 应先解压再选择其中含 `manifest.json` 的目录。

## 支持范围

- 首页、Illustrations、主题 `/t/…`、照片和插画搜索结果及原站搜索分类切换。
- 照片/插画详情及从图片流打开的原生详情弹层。
- 经实站确认共用导航的个人页、个人收藏集、收藏集详情、Bookmarks、Download History。
- 桌面断点为 **1024 CSS px**。低于断点自动撤销扩展节点、样式标记、菜单修改，恢复原站导航；放大后自动重新应用。
- 登录、注册、账户设置、投稿等特殊页面和未识别页面保留原站布局。DOM 契约缺失或尚未 hydration 时，扩展等待或安全回退。

Photos/Illustrations 优先使用原生选择器；搜索页等未挂载该控件的页面，从原有导航链接建立局部菜单。搜索框使用实际 CSS 视口宽度计算中心，避免左右导航和滚动条预留宽度影响。导航滚动后共用白色半透明背景与背景模糊，搜索框始终为不透明浅灰色。

登录状态下，头像菜单保留账户名称和真实原生动作，增加 Collections、Download History、Bookmarks 分组。原生提交按钮、账户设置链接和退出 POST 表单保持原位与原绑定。未登录时显示访客菜单，登录入口和受登录限制的功能继续触发原站流程，不生成个人信息。

## 验证

验证结果、发现、限制及截图索引见 [`output/verification/validation.md`](output/verification/validation.md)。单元测试使用合成 DOM，明确区别于真实网站验证。

可以重跑独立的未登录实站测试。它会真实加载 `artifacts/chrome-mv3`，不注入扩展实现、不模拟网络：

```sh
mise exec -- pnpm exec playwright install chromium
mise exec -- pnpm build
mise exec -- pnpm verify:live

# 等待真实图库图片完成加载后重拍核心页面
mise exec -- pnpm verify:visual
```

可用 `CHROME_PATH` 指向已安装的 Chromium/Chrome for Testing 可执行文件，`HEADLESS=1` 使用完整 Chromium 的无头模式。当前 Chrome/Edge 正式版移除了侧载扩展的启动参数，因此自动化使用 Chromium；手动 Chrome 加载仍通过扩展管理页进行。

```sh
CHROME_PATH='/path/to/chromium' mise exec -- pnpm verify:live
```

自动测试保存：

- `output/verification/live-results.json`：逐项结果、CSS 视口、DPR、边界和布局数据。
- `output/playwright/screenshots/`：真实扩展页面截图。
- `output/playwright/private/`：独立浏览器配置和会话，仅本地使用，已忽略提交。

## 实现与限制

站点适配集中在 `src/adapter.ts`；CSS 全部受 `data-iu-active` 与桌面媒体查询限定。原站节点不搬家，不重建业务页面。通过 hydration 标记、合并到动画帧的重新适配、WXT 路由事件、页面恢复事件和过滤后的 MutationObserver 处理动态页面；图片流追加不会触发整页重新发现。退出桌面范围或脚本失效时可逆清理，保留原站滚动锁定和其他内联样式。

此版本适配本次调查的英文 Unsplash 桌面 DOM。站点的标签、结构、实验版本、地区或语言发生变化时，可能回退原站或需要更新适配器。站点检查、登录状态和网络会影响实站自动化；失败会记录，不视为通过。投稿、退出、账户资料修改不在自动测试中执行最终操作。

参考：[WXT content scripts](https://wxt.dev/guide/essentials/content-scripts.html)、[WXT manifest](https://wxt.dev/guide/essentials/config/manifest.html)、[Playwright 扩展测试](https://playwright.dev/docs/chrome-extensions)。
