# 提案: add-chat-history-management

## Why
当前系统已具备基础的对话存储能力(conversations和messages表),但UI层缺少对话管理界面。用户无法查看历史对话列表、切换不同对话会话、管理对话(删除/重命名),也无法导出对话记录用于学术笔记。这导致多轮对话场景下用户体验不佳,无法有效组织和回顾与论文相关的研究讨论。

## What Changes
- 创建ConversationList组件展示对话列表(左侧栏,20-25%宽度)
- 实现对话切换功能,点击对话项加载对应消息历史
- 实现智能对话标题生成(基于首条用户消息前30字符)
- 添加对话删除功能(带确认对话框,级联删除消息)
- 添加对话重命名功能(内联编辑,支持Enter/Esc)
- 添加对话导出功能(Markdown格式,包含元数据和完整消息)
- 实现对话列表折叠/展开功能(状态持久化到localStorage)
- 显示相对时间(5分钟前、2小时前、X天前)
- 扩展useChat hook添加管理方法(delete/rename/export)
- 扩展db.ts添加辅助函数

## Impact
**影响的规范:**
- 新增 `chat-history-management` 能力规范

**影响的代码文件:**
- `src/components/chat/ChatPanel.tsx` - 集成对话列表
- `src/hooks/useChat.ts` - 添加管理方法
- `src/services/storage/db.ts` - 添加辅助函数
- 新增 `src/components/chat/ConversationList.tsx`

**数据库变更:**
- 无schema变更,复用现有conversations和messages表

**风险评估:**
- 低风险:纯UI和数据层扩展,不修改核心AI对话逻辑
- 无breaking changes
