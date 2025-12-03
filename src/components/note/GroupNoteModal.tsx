/**
 * 分组笔记弹窗
 * 支持编辑/预览模式切换，自动保存
 */

import { useState, useEffect, useCallback } from 'react'
import { saveGroupNote, loadGroupNote } from '../../services/storage/fileSystem'
import NoteEditor from './NoteEditor'

interface Props {
  isOpen: boolean
  onClose: () => void
  groupName: string
}

export default function GroupNoteModal({ isOpen, onClose, groupName }: Props) {
  const [content, setContent] = useState('')
  const [initialContent, setInitialContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [mode, setMode] = useState<'edit' | 'preview'>('edit')

  // 加载笔记内容
  useEffect(() => {
    if (!isOpen || !groupName) return

    setLoading(true)
    loadGroupNote(groupName)
      .then(note => {
        const text = note || ''
        setContent(text)
        setInitialContent(text)
      })
      .finally(() => {
        setLoading(false)
      })
  }, [isOpen, groupName])

  // 保存笔记
  const handleSave = useCallback(async () => {
    if (!groupName || saving) return

    setSaving(true)
    try {
      await saveGroupNote(groupName, content)
      setInitialContent(content)
    } catch (err) {
      console.error('保存笔记失败:', err)
    } finally {
      setSaving(false)
    }
  }, [groupName, content, saving])

  // 关闭前保存（仅在内容变化时）
  const handleClose = async () => {
    if (content !== initialContent) {
      try {
        await saveGroupNote(groupName, content)
      } catch (err) {
        console.error('保存笔记失败:', err)
      }
    }
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-[900px] h-[80vh] flex flex-col">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">分组笔记</h2>
            <span className="text-sm text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
              {groupName}
            </span>
            {saving && (
              <span className="text-xs text-gray-400">保存中...</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* 模式切换 */}
            <div className="flex bg-gray-100 rounded-md p-0.5">
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
      </div>
    </div>
  )
}
