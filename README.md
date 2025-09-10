# Tampermonkey Scripts Collection

这个仓库包含了一系列实用的油猴脚本 (Tampermonkey/Greasemonkey)，主要用于增强各种网站的用户体验。

## 📦 脚本列表

### 🔧 Mify Tenant ID Copier (mify-tenant-id-copier.js)
- **版本**: v1.2
- **功能**: 获取并复制 Mify 工作空间的 tenant_id、user_id 和 midun_token
- **支持网站**: 
  - https://mify.mioffice.cn/*
  - http://dify.test.ai.srv/*
  - https://dify.preview.xiaomi.com/*
- **特性**:
  - ✅ 可折叠面板
  - ✅ 可拖拽定位
  - ✅ 一键复制功能
  - ✅ 支持多环境（生产、测试、预览）
  - ✅ 自动获取用户信息

### 🎵 NetEase Downloader (netease_downloader.js)
- **功能**: 网易云音乐下载器

### 📺 YouTube Downloader (youtube-downloader.js)
- **功能**: YouTube 视频下载器

### 🎮 YouTube Toggle Controls (youtube-toggle-controls.js)
- **功能**: YouTube 控制栏切换工具

### 📚 Douban2PP (douban2pp.js)
- **功能**: 豆瓣增强工具

### 💰 AiFaDian (aifadian.js)
- **功能**: 爱发电增强脚本

## 🚀 安装方式

### 方法 1: 直接安装
1. 确保已安装 [Tampermonkey](https://tampermonkey.net/) 扩展
2. 点击对应脚本的 Raw 链接
3. Tampermonkey 会自动提示安装

### 方法 2: 自动更新安装
对于支持自动更新的脚本，可以在脚本头部看到 `@updateURL` 和 `@downloadURL` 配置，Tampermonkey 会定期检查更新。

## 🔄 自动更新设置

为了启用自动更新功能，请在脚本的 UserScript 头部添加：

```javascript
// @updateURL    https://raw.githubusercontent.com/your-username/tampermonkey-scripts/main/script-name.js
// @downloadURL  https://raw.githubusercontent.com/your-username/tampermonkey-scripts/main/script-name.js
```

## 📋 使用说明

### Mify Tenant ID Copier 详细说明

1. **安装后自动启用**: 脚本在支持的网站上会自动加载
2. **面板操作**:
   - 点击标题栏的 `−` / `+` 按钮可折叠/展开面板
   - 拖拽标题栏可移动面板位置
3. **获取信息**: 点击"获取工作空间信息"按钮
4. **复制功能**: 点击对应的"复制"按钮可复制相应信息到剪贴板

## 🛠️ 开发环境

- **编辑器**: 推荐使用支持 JavaScript 的代码编辑器
- **测试**: 在目标网站上安装脚本进行测试
- **调试**: 使用浏览器开发者工具的 Console 查看日志

## 📝 贡献指南

1. Fork 这个仓库
2. 创建你的特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交你的更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开一个 Pull Request

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情

## 🐛 问题反馈

如果您遇到任何问题或有改进建议，请：

1. 查看现有的 [Issues](../../issues)
2. 如果没有相关问题，请创建新的 Issue
3. 详细描述问题和您的环境

## 📞 联系方式

如有任何问题或建议，欢迎通过以下方式联系：

- GitHub Issues: [提交问题](../../issues/new)
- 邮箱: [您的邮箱]

---

⭐ 如果这些脚本对您有帮助，请给个 Star 支持一下！