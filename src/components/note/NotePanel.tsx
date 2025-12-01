import { useState, useEffect } from 'react'
import { generateNote, loadNote, saveNote } from '../../services/note/noteService'
import NoteEditor from './NoteEditor'
import NoteEmptyState from './NoteEmptyState'

interface NotePanelProps {
  paperId: number
  localPath: string | undefined
  mode: 'edit' | 'preview'
}

export default function NotePanel({ paperId, localPath, mode }: NotePanelProps) {
  const [noteContent, setNoteContent] = useState<string>('')
  const [hasNote, setHasNote] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // 加载笔记
  useEffect(() => {
    async function loadExistingNote() {
      if (!localPath) {
        setLoading(false)
        return
      }

      try {
        const content = await loadNote(localPath)
        if (content) {
          setNoteContent(content)
          setHasNote(true)
        }
      } catch (err) {
        console.error('加载笔记失败:', err)
      } finally {
        setLoading(false)
      }
    }

    loadExistingNote()
  }, [paperId, localPath])

  // 生成笔记
  const handleGenerate = async () => {
    if (!localPath) {
      setError('该论文不支持笔记功能(仅支持新版论文)')
      return
    }

    setIsGenerating(true)
    setError(null)

    try {
      const content = await generateNote(localPath, (text) => {
        setNoteContent(text)
      })
      setNoteContent(content)
      setHasNote(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成笔记失败')
    } finally {
      setIsGenerating(false)
    }
  }

  // 保存笔记
  const handleSave = async () => {
    if (!localPath) return

    try {
      await saveNote(localPath, noteContent)
    } catch (err) {
      setError('保存失败')
    }
  }

  // 内容变更
  const handleContentChange = (content: string) => {
    setNoteContent(content)
  }

  // 加载中
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-600">加载中...</div>
      </div>
    )
  }

  // 旧论文不支持
  if (!localPath) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-gray-50">
        <div className="text-center space-y-4 max-w-md">
          <div className="text-6xl">📋</div>
          <h2 className="text-2xl font-semibold text-gray-700">不支持笔记功能</h2>
          <p className="text-gray-500">
            此论文使用旧版存储方式,不支持笔记功能。请重新上传论文以使用笔记功能。
          </p>
        </div>
      </div>
    )
  }

  // 错误状态
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-gray-50">
        <div className="text-center space-y-4 max-w-md">
          <div className="text-6xl">⚠️</div>
          <h2 className="text-2xl font-semibold text-gray-700">出错了</h2>
          <p className="text-red-500">{error}</p>
          <button
            onClick={() => setError(null)}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            返回
          </button>
        </div>
      </div>
    )
  }

  // 显示笔记编辑器或空状态
  if (hasNote || isGenerating) {
    return (
      <NoteEditor
        content={noteContent}
        onChange={handleContentChange}
        onSave={handleSave}
        mode={mode}
      />
    )
  }

  return <NoteEmptyState onGenerate={handleGenerate} isGenerating={isGenerating} />
}


