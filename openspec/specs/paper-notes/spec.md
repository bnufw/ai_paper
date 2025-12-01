# paper-notes Specification

## Purpose
TBD - created by archiving change add-paper-notes. Update Purpose after archive.
## Requirements
### Requirement: 笔记生成

系统 **SHALL** 支持为论文自动生成 AI 笔记。

#### Scenario: 生成新笔记

- **Given** 用户正在查看一篇有 localPath 的论文
- **And** 该论文尚未生成笔记
- **When** 用户点击「生成笔记」按钮
- **Then** 系统调用 Gemini API 生成笔记
- **And** 显示生成进度（流式输出）
- **And** 生成完成后保存到 note.md 文件
- **And** 自动切换到笔记查看模式

#### Scenario: 笔记已存在时重新生成

- **Given** 用户正在查看笔记
- **And** 该论文已有笔记内容
- **When** 用户点击「重新生成」按钮
- **Then** 系统显示确认对话框警告将覆盖现有内容
- **When** 用户确认
- **Then** 系统重新生成笔记并覆盖原有内容

#### Scenario: 旧论文不支持笔记

- **Given** 用户正在查看一篇无 localPath 的旧论文
- **When** 用户切换到笔记标签页
- **Then** 显示提示信息「此论文不支持笔记功能，请重新上传论文以启用」

---

### Requirement: 笔记存储

系统 **SHALL** 将笔记以 Markdown 文件形式存储在论文本地目录中。

#### Scenario: 笔记文件存储位置

- **Given** 论文存储在 `{根目录}/{分组}/{论文名}_{时间戳}/` 目录
- **When** 保存笔记
- **Then** 笔记保存为同目录下的 `note.md` 文件

#### Scenario: 笔记内容格式

- **Given** 用户生成或编辑笔记
- **When** 保存笔记
- **Then** 笔记以纯 Markdown 文本格式存储
- **And** 支持标准 Markdown 语法
- **And** 支持 KaTeX 数学公式

---

### Requirement: 笔记查看与编辑

系统 **SHALL** 允许用户查看和编辑已生成的笔记。

#### Scenario: 查看笔记

- **Given** 用户正在查看一篇已有笔记的论文
- **When** 用户切换到笔记标签页
- **Then** 系统加载并显示笔记内容
- **And** 默认以预览模式渲染 Markdown

#### Scenario: 编辑笔记

- **Given** 用户正在查看笔记
- **When** 用户点击「编辑」按钮
- **Then** 切换到编辑模式
- **And** 显示 Markdown 文本编辑器

#### Scenario: 保存编辑

- **Given** 用户正在编辑笔记
- **When** 用户点击「保存」按钮或按 Ctrl+S
- **Then** 系统将内容保存到 note.md 文件
- **And** 显示保存成功提示

#### Scenario: 取消编辑

- **Given** 用户正在编辑笔记且有未保存更改
- **When** 用户点击「取消」或切换标签页
- **Then** 系统提示是否放弃更改
- **When** 用户确认放弃
- **Then** 恢复到上次保存的内容

---

### Requirement: 标签页切换

系统 **SHALL** 提供论文内容和笔记之间的标签页切换功能。

#### Scenario: 切换到笔记标签

- **Given** 用户正在查看论文内容
- **When** 用户点击「笔记」标签
- **Then** 内容区域切换显示笔记面板

#### Scenario: 切换到论文标签

- **Given** 用户正在查看笔记
- **When** 用户点击「论文」标签
- **Then** 内容区域切换显示论文 Markdown

#### Scenario: 标签状态指示

- **Given** 论文已有笔记
- **When** 显示标签栏
- **Then** 笔记标签显示正常状态

- **Given** 论文尚无笔记
- **When** 显示标签栏
- **Then** 笔记标签显示为空状态或添加提示图标

---

### Requirement: 笔记空状态

系统 **SHALL** 在论文没有笔记时显示引导界面。

#### Scenario: 显示空状态

- **Given** 用户切换到笔记标签页
- **And** 该论文尚未生成笔记
- **When** 页面加载完成
- **Then** 显示空状态提示「暂无笔记」
- **And** 显示「AI 生成笔记」按钮

---

### Requirement: 错误处理

系统 **SHALL** 妥善处理笔记操作中的错误。

#### Scenario: 生成失败

- **Given** 用户点击生成笔记
- **When** Gemini API 调用失败
- **Then** 显示错误提示信息
- **And** 提供重试选项

#### Scenario: 保存失败

- **Given** 用户编辑笔记后点击保存
- **When** 文件写入失败
- **Then** 显示错误提示「保存失败，请重试」
- **And** 保留编辑器中的内容不丢失

#### Scenario: 加载失败

- **Given** 用户切换到笔记标签页
- **When** 读取 note.md 文件失败
- **Then** 显示错误提示
- **And** 提供重新加载选项

