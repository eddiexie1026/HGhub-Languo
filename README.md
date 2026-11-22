# HGHub 蓝果短剧网页源（实验版）

适用于 HGHub HPP 1.0 的第三方网页数据源实验插件，不是蓝果或 HGHub 官方插件。

**单插件导入 URL：**

```
https://raw.githubusercontent.com/eddiexie1026/HGhub-Languo/main/languo-hghub-source.js
```

**列表订阅 URL：**

```
https://raw.githubusercontent.com/eddiexie1026/HGhub-Languo/main/manifest.json
```

## 在 HGHub v0.0.4 中安装

1. 进入插件中心 → 导入与列表订阅。
2. 将上述任一 HTTPS URL 粘贴到左侧输入框。
3. 点击“读取列表或插件”，确认安装、启用。
4. 此插件元信息带 `mature: true`，若未显示，检查宿主的成人内容展示设置。
5. 测试：首页/分类、作品详情、分集、播放。

## v0.2.0 已知限制

- 此版本**未经 HGHub 原生客户端与目标网站播放链路的实机验证**。
- 分类页从网站 HTML 提取作品链接、标题与封面；页面结构变化可能导致空列表。
- 搜索已切换为官网实际 `/search/video/关键词/` 与 `/search/gv/关键词/` 结果页，不再从分类页扫描标题；仍未验证所有关键词和结果页面的 HTML 结构。
- 搜索分页仅在网页结果里存在明确下一页链接时启用，实际分页 URL 规则尚未完整核实。
- 详情页只显示从实际页面中识别出的分集链接；并不能保证获取全部剧集。
- 播放优先提取 HTML 中直接出现的 HTTPS HLS/MP4；取不到时提供外部浏览器打开原站播放页的回退。
- 不会绕过登录、付费/访问控制或 DRM。
- 本插件只访问目标网站页面，不会将播放媒体保存或转存至这个仓库。
- 本站内容可能属于成人内容，请遵守当地法律、版权及平台条款。

## 调试

如果导入成功但列表为空、详情/播放报错：
打开 HGHub 插件 → 设置与日志，复制对应错误码与日志（请移除 Cookie、令牌、个人信息）。

HGHub 官方协议：https://minireel.github.io/HGhub/docs/developers/quickstart.html
网站：https://languo.ai/

## v0.2.0 变更（2026-11-22）

- 根据网站真实搜索结果页确认的路径，改为获取 `/search/video/<编码关键词>/` 和 `/search/gv/<编码关键词>/`。
- 搜索结果只取搜索页 `<main>` 里的作品链接，避免把全站热门榜单当成搜索结果。
- 保留原插件 ID 与 Raw URL，可通过 HGHub 现有订阅链接更新。
- **未经过目标站点非空搜索结果、真实 HGHub 客户端及播放链路的完整端到端验证。**
