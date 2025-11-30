# paper-group-management Specification

## Purpose
本规范定义了学术论文阅读器的论文分组管理能力，允许用户将论文按单层分组进行组织管理，提升大量论文的可管理性和查找效率。

## ADDED Requirements

### Requirement: 分组数据管理
The system SHALL provide CRUD operations for paper groups to organize papers into categories.

#### Scenario: 创建新分组
- **WHEN** 用户请求创建新分组并提供分组名称
- **THEN** 系统应在数据库中创建新的分组记录
- **AND** 分组名称不能为空或仅包含空白字符
- **AND** 系统应返回新创建分组的 ID

#### Scenario: 重命名分组
- **WHEN** 用户请求重命名已存在的分组
- **THEN** 系统应更新分组名称
- **AND** 系统应同步更新本地文件系统中对应的目录名称

#### Scenario: 删除分组
- **WHEN** 用户请求删除一个分组
- **THEN** 系统应将该分组下的所有论文移至"未分类"
- **AND** 系统应删除分组记录
- **AND** 系统应在本地文件系统中将论文目录移至"未分类"文件夹

#### Scenario: 获取分组列表
- **WHEN** 系统加载论文列表时
- **THEN** 系统应返回所有分组及其包含的论文数量
- **AND** 分组应按创建时间排序

### Requirement: 论文分组归属
The system SHALL allow papers to be assigned to groups for better organization.

#### Scenario: 上传时选择分组
- **WHEN** 用户上传新论文时
- **THEN** 系统应显示分组选择下拉框
- **AND** 用户可选择已有分组或"未分类"
- **AND** 论文应保存到对应分组

#### Scenario: 移动论文到分组
- **WHEN** 用户将论文拖拽到另一个分组
- **THEN** 系统应更新论文的 groupId
- **AND** 系统应在本地文件系统中移动论文目录到新分组目录下

#### Scenario: 查询分组内论文
- **WHEN** 用户展开某个分组
- **THEN** 系统应显示该分组下的所有论文
- **AND** 论文应按创建时间倒序排列

### Requirement: 分组 UI 交互
The system SHALL provide intuitive UI for group management in the sidebar.

#### Scenario: 分组列表展示
- **WHEN** 侧边栏加载时
- **THEN** 系统应以可折叠树形结构显示分组
- **AND** 每个分组应显示名称和论文数量
- **AND** "未分类"分组应始终显示在列表末尾

#### Scenario: 分组展开折叠
- **WHEN** 用户点击分组标题
- **THEN** 系统应切换该分组的展开/折叠状态
- **AND** 展开时显示分组内的论文列表

#### Scenario: 新建分组入口
- **WHEN** 用户点击"新建分组"按钮
- **THEN** 系统应显示输入框让用户输入分组名称
- **AND** 用户确认后创建分组

#### Scenario: 分组右键菜单
- **WHEN** 用户右键点击分组
- **THEN** 系统应显示上下文菜单
- **AND** 菜单包含"重命名"和"删除"选项

#### Scenario: 拖拽论文到分组
- **WHEN** 用户拖拽论文项到目标分组上
- **THEN** 目标分组应显示高亮状态
- **AND** 释放后论文应移动到目标分组
