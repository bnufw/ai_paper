# local-file-storage Specification

## Purpose
本规范定义了学术论文阅读器的本地文件存储能力，使用 File System Access API 将 OCR 转换后的 Markdown 文件和图片保存到用户指定的本地目录，实现数据的本地化管理和跨应用访问。

## ADDED Requirements

### Requirement: 目录授权管理
The system SHALL use File System Access API to request and manage user directory access permissions.

#### Scenario: 首次授权目录
- **WHEN** 用户首次使用应用且未配置存储目录
- **THEN** 系统应显示引导对话框说明需要授权
- **AND** 用户点击授权后调用 `showDirectoryPicker()` 选择目录
- **AND** 系统应将目录句柄持久化存储到 IndexedDB

#### Scenario: 检查目录权限
- **WHEN** 应用启动时
- **THEN** 系统应检查已存储的目录句柄是否仍有效
- **AND** 调用 `queryPermission()` 验证读写权限
- **AND** 权限有效时自动恢复目录访问

#### Scenario: 权限失效处理
- **WHEN** 目录权限检查失败（用户拒绝或目录不存在）
- **THEN** 系统应显示提示要求用户重新授权
- **AND** 提供"重新授权"按钮触发新的授权流程

#### Scenario: 更换存储目录
- **WHEN** 用户在设置中点击"更换目录"
- **THEN** 系统应调用 `showDirectoryPicker()` 选择新目录
- **AND** 系统应更新存储的目录句柄
- **AND** 系统应提示用户现有文件不会自动迁移

### Requirement: 文件目录结构
The system SHALL organize papers in a hierarchical folder structure on the local file system.

#### Scenario: 创建论文目录结构
- **WHEN** 新论文保存到本地时
- **THEN** 系统应在分组目录下创建以论文标题命名的文件夹
- **AND** 文件夹内包含 `paper.md`、`source.pdf` 和 `images/` 子目录
- **AND** 目录结构为: `<根目录>/<分组名>/<论文标题>/`

#### Scenario: 处理文件名冲突
- **WHEN** 论文标题与已存在的目录同名
- **THEN** 系统应在目录名后添加时间戳后缀
- **AND** 格式为: `论文标题_YYYYMMDD_HHMMSS`

#### Scenario: 未分类论文存储
- **WHEN** 论文未指定分组时
- **THEN** 系统应将论文存储在 `未分类/` 目录下

### Requirement: Markdown 文件处理
The system SHALL save Markdown files with proper image references to the local file system.

#### Scenario: 保存 PDF 原文
- **WHEN** 用户上传 PDF 进行 OCR 处理后
- **THEN** 系统应将 PDF 原文保存为 `source.pdf` 文件
- **AND** 文件保存在论文目录根下

#### Scenario: 保存 Markdown 文件
- **WHEN** OCR 处理完成后
- **THEN** 系统应将 Markdown 内容写入 `paper.md` 文件
- **AND** 文件编码应为 UTF-8

#### Scenario: 图片引用路径转换
- **WHEN** 保存 Markdown 到本地前
- **THEN** 系统应将所有图片引用从 base64 转换为相对路径
- **AND** 路径格式为: `![alt](images/image_N.png)`
- **AND** N 从 0 开始连续编号

#### Scenario: 保存图片文件
- **WHEN** 保存论文到本地时
- **THEN** 系统应将所有 base64 图片解码并保存为 PNG 文件
- **AND** 图片保存在 `images/` 子目录中
- **AND** 文件名与 Markdown 引用路径对应

### Requirement: 数据库存储优化
The system SHALL store only metadata and plain text Markdown in IndexedDB.

#### Scenario: 存储纯文本 Markdown
- **WHEN** 论文保存到数据库时
- **THEN** markdown 字段应只包含纯文本内容
- **AND** 图片引用应保留相对路径格式（不含 base64）
- **AND** 不再存储 pdfData 和图片 base64 数据

#### Scenario: 存储本地路径
- **WHEN** 论文保存到数据库时
- **THEN** 系统应存储论文在本地文件系统的相对路径
- **AND** 路径格式为: `分组名/论文标题`

### Requirement: 文件读取
The system SHALL read PDF, Markdown and images from local file system for display.

#### Scenario: 读取 PDF 原文显示
- **WHEN** 用户打开论文的 PDF 视图时
- **THEN** 系统应从本地文件系统读取 `source.pdf` 文件
- **AND** 创建 Blob URL 供 iframe 显示
- **AND** 页面关闭时释放 Blob URL

#### Scenario: 读取 Markdown 显示
- **WHEN** 用户打开论文查看时
- **THEN** 系统应从本地文件系统读取完整的 Markdown 文件
- **AND** 解析图片相对路径并加载显示

#### Scenario: 图片加载失败处理
- **WHEN** 图片文件不存在或读取失败
- **THEN** 系统应显示占位图或错误提示
- **AND** 不应影响 Markdown 其他内容的显示

### Requirement: 浏览器兼容性
The system SHALL handle browser compatibility for File System Access API.

#### Scenario: 检测 API 支持
- **WHEN** 应用加载时
- **THEN** 系统应检测浏览器是否支持 File System Access API
- **AND** 检查 `window.showDirectoryPicker` 是否存在

#### Scenario: 不支持时降级处理
- **WHEN** 浏览器不支持 File System Access API
- **THEN** 系统应显示友好提示信息
- **AND** 建议用户使用 Chrome 86+ 或 Edge 86+
- **AND** 禁用需要本地存储的功能

### Requirement: 存储目录设置界面
The system SHALL provide UI for managing storage directory settings.

#### Scenario: 显示当前目录
- **WHEN** 用户打开设置页面
- **THEN** 系统应显示当前配置的存储目录路径
- **AND** 如未配置则显示"未设置"

#### Scenario: 首次引导对话框
- **WHEN** 检测到未配置存储目录且需要保存文件时
- **THEN** 系统应显示模态引导对话框
- **AND** 说明需要授权目录访问的原因
- **AND** 提供"选择目录"按钮

## MODIFIED Requirements

### Requirement: OCR 结果保存流程
The PDF processing flow SHALL be modified to save output to local file system instead of IndexedDB.

#### Scenario: OCR 结果保存流程变更
- **WHEN** Mistral OCR 返回处理结果后
- **THEN** 系统应首先将 Markdown 和图片保存到本地文件系统
- **AND** 然后将元数据和纯文本 Markdown 保存到 IndexedDB
- **AND** 不再将图片 base64 数据存储到数据库

## REMOVED Requirements

### Requirement: 图片数据库存储
The system SHALL no longer store image data in IndexedDB.

#### Scenario: 移除 PaperImage 表
- **WHEN** 系统存储论文时
- **THEN** 系统不应向 images 表写入数据
- **AND** 图片仅存储在本地文件系统

#### Scenario: 移除 PDF 原文存储
- **WHEN** 系统存储论文时
- **THEN** 系统不应存储 pdfData 字段
- **AND** PDF 原文不再保存到数据库
