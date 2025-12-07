/**
 * 领域知识管理弹窗
 * 支持 docx 上传、粘贴内容、AI 整理
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  parseDocx,
  organizeKnowledge,
  saveDomainKnowledge,
  loadDomainKnowledge,
  generateFromNotes
} from '../../services/knowledge/domainKnowledgeService'
import NoteEditor from '../note/NoteEditor'

interface Props {
  isOpen: boolean
  onClose: () => void
  groupId: number
  groupName: string
}

export default function DomainKnowledgeModal({ isOpen, onClose, groupId, groupName }: Props) {
  const [content, setContent] = useState('')
  const [initialContent, setInitialContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [organizing, setOrganizing] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<'edit' | 'preview'>('edit')
  const [pasteText, setPasteText] = useState('')
  const [showPasteInput, setShowPasteInput] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isOpen || !groupName) return

    setLoading(true)
    loadDomainKnowledge(groupName)
      .then(knowledge => {
        const text = knowledge || ''
        setContent(text)
        setInitialContent(text)
      })
      .finally(() => {
        setLoading(false)
      })
  }, [isOpen, groupName])

  const handleSave = useCallback(async () => {
    if (!groupName || saving) return

    setSaving(true)
    setError('')
    try {
      await saveDomainKnowledge(groupName, content)
      setInitialContent(content)
    } catch (err) {
      const msg = (err as Error).message || '保存失败'
      setError(msg)
      console.error('保存失败:', err)
    } finally {
      setSaving(false)
    }
  }, [groupName, content, saving])

  const handleClose = async () => {
    if (content !== initialContent) {
      try {
        await saveDomainKnowledge(groupName, content)
      } catch (err) {
        const msg = (err as Error).message || '保存失败'
        if (!confirm(`${msg}\n\n确定要放弃未保存的内容并关闭吗？`)) {
          return
        }
      }
    }
    setShowPasteInput(false)
    setPasteText('')
    setError('')
    onClose()
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setOrganizing(true)
    setError('')
    try {
      const texts: string[] = []
      for (const file of files) {
        if (file.name.endsWith('.docx')) {
          try {
            const text = await parseDocx(file)
            texts.push(text)
          } catch (parseErr) {
            setError(`解析 ${file.name} 失败：请确保是有效的 .docx 文件`)
            return
          }
        } else {
          setError(`不支持的文件格式：${file.name}（仅支持 .docx）`)
          return
        }
      }

      if (texts.length > 0) {
        const newContent = texts.join('\n\n---\n\n')
        try {
          if (content) {
            const organized = await organizeKnowledge(content, newContent, setContent)
            setContent(organized)
          } else {
            if (texts.length > 1) {
              const organized = await organizeKnowledge('', newContent, setContent)
              setContent(organized)
            } else {
              setContent(newContent)
            }
          }
        } catch (aiErr) {
          setError(`AI 整理失败：${(aiErr as Error).message || '请检查网络或 API Key'}`)
          setContent(content ? content + '\n\n---\n\n' + newContent : newContent)
        }
      }
    } finally {
      setOrganizing(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handlePasteConfirm = async () => {
    if (!pasteText.trim()) {
      setShowPasteInput(false)
      return
    }

    setOrganizing(true)
    setError('')
    try {
      if (content) {
        const organized = await organizeKnowledge(content, pasteText, setContent)
        setContent(organized)
      } else {
        setContent(pasteText)
      }
    } catch (err) {
      setError(`AI 整理失败：${(err as Error).message || '请检查网络或 API Key'}`)
      setContent(content ? content + '\n\n---\n\n' + pasteText : pasteText)
    } finally {
      setOrganizing(false)
      setShowPasteInput(false)
      setPasteText('')
    }
  }

  const handleOrganize = async () => {
    if (!content.trim() || organizing) return

    setOrganizing(true)
    setError('')
    try {
      const organized = await organizeKnowledge('', content, setContent)
      setContent(organized)
    } catch (err) {
      setError(`AI 整理失败：${(err as Error).message || '请检查网络或 API Key'}`)
    } finally {
      setOrganizing(false)
    }
  }

  const handleGenerateFromNotes = async () => {
    if (organizing) return

    setOrganizing(true)
    setError('')
    try {
      const generated = await generateFromNotes(groupId, content, setContent)
      setContent(generated)
    } catch (err) {
      setError(`从笔记生成失败：${(err as Error).message || '请检查网络或 API Key'}`)
    } finally {
      setOrganizing(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-[900px] h-[80vh] flex flex-col">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-gray-700">📚 领域知识</h2>
            <span className="text-sm text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
              {groupName}
            </span>
            {saving && <span className="text-xs text-gray-400">保存中...</span>}
            {organizing && <span className="text-xs text-blue-500">AI 整理中...</span>}
          </div>
          <div className="flex items-center gap-2">
            {/* 操作按钮 */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".docx"
              multiple
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={organizing}
              className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
            >
              上传 docx
            </button>
            <button
              onClick={() => setShowPasteInput(!showPasteInput)}
              disabled={organizing}
              className="px-3 py-1.5 text-sm bg-gray-500 text-white rounded hover:bg-gray-600 disabled:opacity-50"
            >
              粘贴内容
            </button>
            <button
              onClick={handleOrganize}
              disabled={organizing || !content.trim()}
              className="px-3 py-1.5 text-sm bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
            >
              AI 整理
            </button>
            <button
              onClick={handleGenerateFromNotes}
              disabled={organizing}
              className="px-3 py-1.5 text-sm bg-purple-500 text-white rounded hover:bg-purple-600 disabled:opacity-50"
              title="从分组内论文笔记提取并整合到领域知识"
            >
              加入笔记
            </button>
            {/* 模式切换 */}
            <div className="flex bg-gray-100 rounded-md p-0.5 ml-2">
              <button
                onClick={() => setMode('edit')}
                className={`px-3 py-1 text-sm rounded ${
                  mode === 'edit'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                编辑
              </button>
              <button
                onClick={() => setMode('preview')}
                className={`px-3 py-1 text-sm rounded ${
                  mode === 'preview'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                预览
              </button>
            </div>
            {/* 关闭按钮 */}
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 ml-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="px-6 py-2 bg-red-50 border-b border-red-200 text-sm text-red-600 flex items-center justify-between">
            <span>⚠️ {error}</span>
            <button onClick={() => setError('')} className="text-red-400 hover:text-red-600">✕</button>
          </div>
        )}

        {/* 粘贴输入区 */}
        {showPasteInput && (
          <div className="px-6 py-3 border-b bg-gray-50">
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="粘贴领域知识内容..."
              className="w-full h-32 p-3 border rounded-lg resize-none text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex justify-end gap-2 mt-2">
              <button
                onClick={() => {
                  setShowPasteInput(false)
                  setPasteText('')
                }}
                className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800"
              >
                取消
              </button>
              <button
                onClick={handlePasteConfirm}
                disabled={!pasteText.trim() || organizing}
                className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
              >
                {content ? '合并到现有内容' : '添加'}
              </button>
            </div>
          </div>
        )}

        {/* 内容区域 */}
        <div className="flex-1 overflow-hidden">
          {loading ? (
            <div className="h-full flex items-center justify-center">
              <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
            </div>
          ) : (
            <NoteEditor
              content={content}
              onChange={setContent}
              onSave={handleSave}
              mode={mode}
            />
          )}
        </div>

        {/* 使用提示 */}
        <div className="px-6 py-2 border-t bg-gray-50 text-xs text-gray-500">
          💡 在对话中输入 <code className="bg-gray-200 px-1 rounded">@领域知识</code> 可引用此分组的领域知识
        </div>
      </div>
    </div>
  )
}
