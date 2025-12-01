# Tasks: add-paper-notes

## 阶段 1: 服务层实现

### 1.1 笔记存储服务
- [x] 在 `services/storage/paperStorage.ts` 中添加笔记相关函数：
  - `saveNoteToLocal(localPath, content)`: 保存笔记到 note.md
  - `loadNoteFromLocal(localPath)`: 读取笔记内容
  - `hasNoteLocal(localPath)`: 检查笔记是否存在
- **验证**: 手动测试文件读写功能

### 1.2 笔记生成服务
- [x] 创建 `services/note/noteService.ts`:
  - 实现 `generateNote(paperId, onStream)` 函数
  - 读取 `prompts/note.md` 作为系统提示词
  - 调用 Gemini API 生成笔记内容
  - 支持流式输出
- **依赖**: 1.1
- **验证**: 控制台测试 API 调用

## 阶段 2: UI 组件开发

### 2.1 笔记面板组件
- [x] 创建 `components/note/NotePanel.tsx`:
  - 管理编辑/预览模式切换
  - 处理笔记加载和保存
  - 显示生成进度状态
- **依赖**: 1.1, 1.2

### 2.2 笔记编辑器组件
- [x] 创建 `components/note/NoteEditor.tsx`:
  - Textarea 输入区域
  - 实时预览（复用 MarkdownViewer）
  - 自动保存功能（防抖）
- **依赖**: 2.1

### 2.3 空状态组件
- [x] 创建 `components/note/NoteEmptyState.tsx`:
  - 显示空状态提示
  - "生成笔记"按钮
  - 生成中的 loading 状态
- **依赖**: 2.1

## 阶段 3: 主界面集成

### 3.1 标签页切换
- [x] 修改 `App.tsx`:
  - 添加 `activeTab: 'paper' | 'note'` 状态
  - 实现论文/笔记标签切换 UI
  - 根据当前标签显示对应内容
- **依赖**: 2.1, 2.2, 2.3

### 3.2 旧论文兼容提示
- [x] 当论文无 `localPath` 时显示升级提示
- **依赖**: 3.1

## 阶段 4: 收尾优化

### 4.1 错误处理
- [x] API 调用失败的错误提示
- [x] 文件读写失败的错误处理
- **依赖**: 3.1

### 4.2 用户体验优化
- [x] 保存成功的 Toast 提示
- [x] 快捷键支持（Ctrl+S 保存）
- **依赖**: 4.1

## 任务依赖图

```
1.1 笔记存储 ──┬──► 1.2 笔记生成 ──┬──► 2.1 面板组件
              │                    │
              └────────────────────┼──► 2.2 编辑器
                                   │
                                   └──► 2.3 空状态
                                            │
                                            ▼
                                   3.1 标签页集成
                                            │
                                            ▼
                                   3.2 兼容提示
                                            │
                                            ▼
                                   4.1 错误处理
                                            │
                                            ▼
                                   4.2 体验优化
```

## 工作量估算

| 阶段 | 任务 | 估算时间 |
|------|------|----------|
| 1 | 服务层 | 1-2 小时 |
| 2 | UI 组件 | 2-3 小时 |
| 3 | 主界面集成 | 1-2 小时 |
| 4 | 收尾优化 | 1 小时 |
| **总计** | | **5-8 小时** |
