# MagicSniffer - Development Skills

## Skill: add-scan-category

当需要添加新的文件分类时使用此技能。

### 步骤

1. 在 `src-tauri/src/models.rs` 的 `FileCategory` 枚举中添加新变体
2. 在 `FileCategory::label()` 方法中添加中文标签
3. 在 `FileCategory::color()` 方法中添加对应颜色
4. 在 `src-tauri/src/categorizer.rs` 的 `Categorizer::new()` 中添加路径匹配规则
5. 在 `src-tauri/src/categorizer::categorize()` 方法中添加分类逻辑
6. 在 `src-tauri/src/risk.rs` 的 `RiskAssessor::assess()` 中添加风险评估
7. 在 `src-tauri/src/risk.rs` 的 `RiskAssessor::get_detail()` 中添加风险说明
8. 在 `src/types/index.ts` 的 `CATEGORY_INFO` 中添加前端显示信息

### 示例

```rust
// models.rs
pub enum FileCategory {
    // ... existing variants ...
    DockerImages,  // 新增
}

// categorizer.rs
fn categorize(&self, path: &Path, name: &str) -> FileCategory {
    // ...
    if path_str.contains("/containers/storage/") {
        return FileCategory::DockerImages;
    }
    // ...
}
```

## Skill: add-tauri-command

当需要添加新的后端 IPC 命令时使用此技能。

### 步骤

1. 在 `src-tauri/src/models.rs` 中定义请求和响应结构体（derive `Serialize`/`Deserialize`）
2. 在 `src-tauri/src/commands.rs` 中实现 async 函数，添加 `#[tauri::command]` 宏
3. 在 `src-tauri/src/lib.rs` 的 `generate_handler![]` 中注册命令
4. 在 `src/types/index.ts` 中添加对应的 TypeScript 接口
5. 在 `src/hooks/useTauriCommand.ts` 中添加 `invoke()` 封装函数

### 示例

```rust
// commands.rs
#[tauri::command]
pub async fn my_new_command(
    request: MyRequest,
    state: State<'_, AppState>,
) -> Result<MyResponse, String> {
    // implementation
}
```

```typescript
// useTauriCommand.ts
export async function myNewCommand(request: MyRequest): Promise<MyResponse> {
  return invoke<MyResponse>("my_new_command", { request });
}
```

## Skill: add-treemap-feature

当需要修改 Treemap 可视化行为时使用此技能。

### 关键文件

- `src/components/Treemap.tsx` - 核心 Treemap 组件，包含布局算法和 SVG 渲染
- `src/styles/index.css` - Treemap 相关样式（`.treemap-*` 类）

### 布局算法

Squarified Treemap 算法实现在 `computeTreemapLayout()` 函数中：

- `squarify()` - 核心布局，将一系列矩形排列到指定区域
- `findBestSplit()` - 确定行的最佳分割点
- 可通过修改 `computeTreemapLayout()` 调整递归深度限制（当前最大 8 层）

### 渲染控制

- `renderTreemapNode()` 函数控制 SVG 渲染
- 最小渲染尺寸: `minSize = 0.5` (百分比)
- SVG 视口: `1000x1000`
