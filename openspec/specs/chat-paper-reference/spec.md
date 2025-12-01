# chat-paper-reference Specification

## Purpose
TBD - created by archiving change add-chat-enhancements. Update Purpose after archive.
## Requirements
### Requirement: @提及触发
The system SHALL detect @ symbol input and trigger paper mention functionality.

#### Scenario: 输入@触发论文选择器
- **WHEN** 用户在输入框中输入@符号
- **THEN** 系统应在输入框上方弹出论文选择器
- **AND** 选择器应显示所有可引用的论文列表
- **AND** 选择器应自动聚焦到搜索框

#### Scenario: @后输入文字过滤
- **WHEN** 用户输入@后继续输入文字（如@机器学习）
- **THEN** 论文列表应实时过滤，匹配标题包含输入文字的论文
- **AND** 过滤应使用防抖处理（300ms）
- **AND** 匹配不区分大小写

#### Scenario: 关闭选择器
- **WHEN** 用户按Esc键或点击选择器外部
- **THEN** 论文选择器应关闭
- **AND** 输入框内容应保持不变
- **AND** @符号应保留在输入框中

### Requirement: 论文选择器
The system SHALL provide a paper selection interface for @ mentions.

#### Scenario: 显示论文列表
- **WHEN** 论文选择器打开时
- **THEN** 应显示当前论文之外的所有论文
- **AND** 每个论文项显示：标题、所属分组（如有）
- **AND** 论文按更新时间倒序排列
- **AND** 列表最多显示10项，支持滚动

#### Scenario: 选择论文
- **WHEN** 用户点击论文列表中的某项
- **THEN** 系统应在输入框当前位置插入引用标记
- **AND** 引用标记格式为 `@[论文标题](paperId:123)`
- **AND** 选择器应关闭
- **AND** 输入框应保持聚焦

#### Scenario: 键盘导航
- **WHEN** 论文选择器打开时
- **THEN** 用户可使用上下箭头键选择论文
- **AND** 按Enter键确认选择
- **AND** 当前选中项应有高亮样式

#### Scenario: 空搜索结果
- **WHEN** 搜索过滤后无匹配论文
- **THEN** 应显示"未找到匹配的论文"提示
- **AND** 用户可清空搜索重新查找

### Requirement: 引用标记显示
The system SHALL display paper mentions as styled chips in the input area.

#### Scenario: 输入框中的引用显示
- **WHEN** 输入框包含论文引用标记
- **THEN** 引用应渲染为可识别的标签样式（蓝色背景圆角标签）
- **AND** 标签仅显示论文标题，不显示paperId
- **AND** 标签可通过退格键删除

#### Scenario: 编辑包含引用的文本
- **WHEN** 用户编辑包含引用标记的文本
- **THEN** 引用标记应作为整体处理
- **AND** 光标不能进入引用标记内部
- **AND** 删除引用需删除整个标记

### Requirement: 引用内容注入
The system SHALL inject referenced paper content into AI context.

#### Scenario: 解析并读取引用论文
- **WHEN** 用户发送包含论文引用的消息
- **THEN** 系统应解析所有 `@[标题](paperId:N)` 格式的引用
- **AND** 对每个引用，读取对应论文的paper.md文件内容
- **AND** 仅读取文本内容，不读取图片和PDF

#### Scenario: 构建带引用的上下文
- **WHEN** 调用AI API时存在论文引用
- **THEN** 系统应在系统提示词中追加引用论文内容
- **AND** 格式为：
  ```
  [引用论文: {标题}]
  {paper.md内容}
  [/引用论文]
  ```
- **AND** 多篇引用论文依次追加

#### Scenario: 引用数量限制
- **WHEN** 用户尝试在单条消息中引用超过3篇论文
- **THEN** 系统应阻止发送
- **AND** 显示提示"单条消息最多引用3篇论文"
- **AND** 消息内容应保留在输入框

#### Scenario: 引用内容过大截断
- **WHEN** 引用的paper.md内容超过50KB
- **THEN** 系统应截取前50KB内容
- **AND** 在截断位置添加提示"[内容过长，已截断]"
- **AND** 应记录日志提示用户

### Requirement: 引用论文读取
The system SHALL read paper.md content from local storage or database.

#### Scenario: 从本地文件读取
- **WHEN** 引用的论文有localPath字段
- **THEN** 系统应从 `{storageRoot}/{localPath}/paper.md` 读取内容
- **AND** 使用File System Access API或后备方案读取

#### Scenario: 从数据库读取
- **WHEN** 引用的论文没有localPath或本地文件不存在
- **THEN** 系统应回退到数据库中的markdown字段
- **AND** 应正常处理不影响用户体验

#### Scenario: 论文不存在
- **WHEN** 引用的paperId对应的论文不存在（已删除）
- **THEN** 系统应显示错误提示"引用的论文[{标题}]不存在或已删除"
- **AND** 阻止消息发送
- **AND** 用户可移除无效引用后重试

### Requirement: 消息中的引用显示
The system SHALL display paper mentions in sent messages.

#### Scenario: 用户消息显示引用
- **WHEN** 消息列表渲染包含论文引用的用户消息
- **THEN** 引用应显示为可识别的标签样式
- **AND** 点击标签应跳转到对应论文

#### Scenario: 引用跳转
- **WHEN** 用户点击消息中的论文引用标签
- **THEN** 系统应切换到该论文的阅读视图
- **AND** 如果论文已删除，显示提示"该论文已删除"

### Requirement: 排除当前论文
The system SHALL exclude the current paper from mention suggestions.

#### Scenario: 不显示当前论文
- **WHEN** 用户在论文A的对话中触发@选择器
- **THEN** 论文列表不应包含论文A本身
- **AND** 仅显示其他可引用的论文

#### Scenario: 无其他论文可引用
- **WHEN** 系统中只有当前一篇论文
- **THEN** 选择器应显示"暂无其他论文可引用"
- **AND** 提示用户先上传其他论文

