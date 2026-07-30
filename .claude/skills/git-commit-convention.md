# Git Commit Convention

## 提交规范

所有 commit message 必须遵循以下格式：

```
<emoji> <type>: <subject>
```

### Emoji 对照表

| Emoji | Type | 说明 | 示例 |
|-------|------|------|------|
| ➕ | Feat | 新功能、新特性 | `➕ Feat: 添加文件搜索功能` |
| 🐛 | Bug | Bug 修复 | `🐛 Bug: 修复扫描大目录时崩溃` |
| 🚧 | Fix | 修复、修正问题 | `🚧 Fix: 修正权限检查逻辑` |
| 🔨 | Refactor | 代码重构（不改变功能） | `🔨 Refactor: 提取公共工具函数` |
| 📝 | Docs | 文档更新 | `📝 Docs: 更新 README 安装说明` |
| ✨ | Style | 代码风格、格式调整 | `✨ Style: 统一缩进格式` |
| 🍱 | Perf | 性能优化 | `🍱 Perf: 优化 treemap 渲染` |
| 🔧 | Test | 测试相关 | `🔧 Test: 添加扫描器单元测试` |
| ⚡️ | Chore | 构建、依赖、工具配置 | `⚡️ Chore: 更新 Tauri 依赖` |

### 格式要求

- Subject 使用中文或英文，简洁描述变更内容
- 不超过 72 个字符
- 不需要句号结尾
- 使用现在时态（"添加" 而非 "添加了"）

### 多行 Commit（可选）

当需要详细说明时，第二行留空后写 body：

```
➕ Feat: 添加搜索面板

- 支持正则表达式搜索
- 支持按文件类型过滤
- 搜索结果实时高亮
```
