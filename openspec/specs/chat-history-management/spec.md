# chat-history-management Specification

## Purpose
TBD - created by archiving change add-chat-history-management. Update Purpose after archive.
## Requirements
### Requirement: 对话列表展示
The system SHALL display a conversation list in the chat interface to show all conversations for the current paper.

#### Scenario: 显示对话列表
- **WHEN** 用户打开某篇论文的对话面板
- **THEN** 系统应在左侧展示该论文的所有对话会话
- **AND** 对话列表应按更新时间倒序排列(最新的在上)
- **AND** 每个对话项应显示标题、最后更新时间
- **AND** 当前激活的对话应有视觉高亮标识

#### Scenario: 空对话列表状态
- **WHEN** 论文尚未创建任何对话
- **THEN** 系统应显示空状态提示"暂无对话,点击'新对话'开始"
- **AND** 系统应引导用户点击"新对话"按钮

#### Scenario: 对话列表响应式布局
- **WHEN** 对话列表存在时
- **THEN** 对话列表应占据左侧20-25%宽度
- **AND** 对话列表应支持独立滚动
- **AND** 消息区域应占据剩余宽度
- **AND** 对话列表应可通过按钮折叠/展开

### Requirement: 对话切换
The system SHALL allow users to switch between different conversations seamlessly.

#### Scenario: 点击切换对话
- **WHEN** 用户点击对话列表中的某个对话项
- **THEN** 系统应加载该对话的完整消息历史
- **AND** 系统应清空当前输入框内容
- **AND** 系统应滚动消息区域到最新消息
- **AND** 系统应更新当前对话ID状态

#### Scenario: 切换对话时的加载状态
- **WHEN** 用户切换到另一个对话
- **THEN** 系统应立即显示新对话的消息(无需loading状态,因为数据来自本地IndexedDB)
- **AND** 系统应确保消息按时间戳正序排列

### Requirement: 智能对话标题生成
The system SHALL automatically generate meaningful conversation titles based on user's first message.

#### Scenario: 新对话标题生成
- **WHEN** 用户在新对话中发送第一条消息
- **THEN** 系统应使用该消息的前30个字符作为对话标题
- **AND** 如果消息长度超过30字符,应添加"..."省略号
- **AND** 系统应更新对话的title字段到数据库
- **AND** 对话列表应立即反映新标题

#### Scenario: 标题格式处理
- **WHEN** 生成对话标题时
- **THEN** 系统应移除标题中的换行符,替换为空格
- **AND** 系统应trim首尾空格
- **AND** 空消息应使用默认标题"新对话"

### Requirement: 对话删除
The system SHALL allow users to delete conversations they no longer need.

#### Scenario: 删除对话确认
- **WHEN** 用户点击对话项的删除按钮
- **THEN** 系统应显示确认对话框"确定删除此对话?删除后无法恢复"
- **AND** 确认对话框应有"取消"和"删除"两个选项
- **AND** 删除按钮应使用警告色(红色)

#### Scenario: 执行对话删除
- **WHEN** 用户确认删除对话
- **THEN** 系统应从conversations表删除该对话记录
- **AND** 系统应级联删除messages表中该对话的所有消息
- **AND** 系统应从对话列表UI中移除该项
- **AND** 如果删除的是当前激活对话,系统应选择第一个剩余对话(或显示空状态)

#### Scenario: 删除最后一个对话
- **WHEN** 用户删除论文的最后一个对话
- **THEN** 系统应清空消息显示区域
- **AND** 系统应显示空状态提示
- **AND** 系统应将currentConversationId设置为null

### Requirement: 对话重命名
The system SHALL allow users to rename conversations for better organization.

#### Scenario: 进入重命名模式
- **WHEN** 用户点击对话项的重命名按钮(或双击对话标题)
- **THEN** 系统应将对话标题变为可编辑输入框
- **AND** 输入框应自动聚焦
- **AND** 输入框应预填充当前标题文本
- **AND** 输入框应全选文本方便编辑

#### Scenario: 保存新标题
- **WHEN** 用户输入新标题并按Enter或点击确认
- **THEN** 系统应验证标题非空(trim后)
- **AND** 系统应更新conversations表的title字段
- **AND** 系统应更新updatedAt字段为当前时间
- **AND** 对话列表应立即显示新标题
- **AND** 系统应退出编辑模式

#### Scenario: 取消重命名
- **WHEN** 用户按Esc键或点击取消按钮
- **THEN** 系统应恢复原标题
- **AND** 系统应退出编辑模式
- **AND** 不应修改数据库

#### Scenario: 空标题处理
- **WHEN** 用户提交空标题(仅空格或空字符串)
- **THEN** 系统应显示错误提示"标题不能为空"
- **AND** 输入框应保持编辑状态
- **AND** 不应更新数据库

### Requirement: 对话导出
The system SHALL allow users to export conversation history in Markdown format for academic note-taking.

#### Scenario: 导出单个对话
- **WHEN** 用户点击对话项的导出按钮
- **THEN** 系统应生成Markdown格式的对话内容
- **AND** Markdown应包含对话元数据(标题、创建时间、论文标题)
- **AND** Markdown应包含完整的消息历史,用户消息和AI回复清晰区分
- **AND** 系统应触发浏览器下载,文件名格式为"对话标题_YYYYMMDD.md"

#### Scenario: 导出内容格式
- **WHEN** 生成导出的Markdown文本
- **THEN** 格式应为:
  ```
  # {对话标题}
  
  **论文:** {论文标题}
  **创建时间:** {创建时间}
  **最后更新:** {更新时间}
  
  ---
  
  ## {用户消息时间}
  **用户:**
  {用户消息内容}
  
  **AI:**
  {AI回复内容}
  
  ---
  ```
- **AND** AI回复应保留原始Markdown格式(公式、代码块等)

#### Scenario: 导出文件命名
- **WHEN** 生成导出文件名
- **THEN** 文件名应使用对话标题的安全版本(移除特殊字符/\:*?"<>|)
- **AND** 日期格式应为YYYYMMDD_HHMMSS
- **AND** 文件扩展名应为.md
- **AND** 示例:"论文研究方法讨论_20250129_143025.md"

### Requirement: 对话时间显示
The system SHALL display conversation timestamps to help users identify when conversations occurred.

#### Scenario: 相对时间显示
- **WHEN** 对话列表显示对话项
- **THEN** 每个对话应显示最后更新时间
- **AND** 24小时内的对话应显示相对时间("5分钟前"、"2小时前")
- **AND** 超过24小时但在7天内应显示"X天前"
- **AND** 超过7天应显示具体日期(YYYY-MM-DD HH:mm)

#### Scenario: 时间排序
- **WHEN** 系统加载对话列表
- **THEN** 对话应按updatedAt字段倒序排列
- **AND** 最近更新的对话应显示在列表顶部
- **AND** 发送新消息应更新对话的updatedAt时间

### Requirement: 对话列表交互
The system SHALL provide smooth and intuitive interaction patterns for the conversation list.

#### Scenario: 悬停效果
- **WHEN** 用户鼠标悬停在对话项上
- **THEN** 对话项应显示浅色背景高亮
- **AND** 系统应显示操作按钮(重命名、删除、导出)
- **AND** 操作按钮应在非悬停时隐藏,保持界面简洁

#### Scenario: 激活对话视觉反馈
- **WHEN** 某个对话被选中为当前激活对话
- **THEN** 该对话项应有明显的视觉区分(深色背景或边框)
- **AND** 激活状态应在切换对话时立即更新
- **AND** 列表滚动应确保激活对话项可见

#### Scenario: 对话列表折叠
- **WHEN** 用户点击对话列表的折叠按钮
- **THEN** 对话列表应收起,仅显示折叠按钮
- **AND** 消息区域应扩展到全宽
- **AND** 折叠状态应保存到localStorage
- **AND** 再次点击应展开对话列表

### Requirement: 数据库操作优化
The system SHALL ensure efficient database operations for conversation management.

#### Scenario: 批量加载优化
- **WHEN** 系统加载论文的对话列表
- **THEN** 应使用Dexie的索引查询(where('paperId').equals())
- **AND** 应使用sortBy('createdAt')进行排序
- **AND** 不应加载所有消息内容,仅加载对话元数据

#### Scenario: 级联删除
- **WHEN** 删除对话时
- **THEN** 系统应先查询该对话的所有消息ID
- **AND** 系统应使用db.messages.where('conversationId').equals().delete()批量删除
- **AND** 然后删除对话记录本身
- **AND** 操作应在同一事务中执行,保证数据一致性

### Requirement: 错误处理
The system SHALL handle errors gracefully during conversation management operations.

#### Scenario: 删除操作失败
- **WHEN** 对话删除时发生数据库错误
- **THEN** 系统应回滚删除操作
- **AND** 系统应显示错误提示"删除失败,请重试"
- **AND** 对话列表应保持原状

#### Scenario: 重命名操作失败
- **WHEN** 对话重命名时发生数据库错误
- **THEN** 系统应恢复原标题
- **AND** 系统应显示错误提示"重命名失败,请重试"
- **AND** 输入框应退出编辑模式

#### Scenario: 导出操作失败
- **WHEN** 对话导出时无法获取完整数据
- **THEN** 系统应显示错误提示"导出失败,数据不完整"
- **AND** 不应触发文件下载

