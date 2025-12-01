interface NoteEmptyStateProps {
  onGenerate: () => void
  isGenerating: boolean
}

export default function NoteEmptyState({ onGenerate, isGenerating }: NoteEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full bg-gray-50">
      <div className="text-center space-y-6 max-w-md">
        <div className="text-6xl">📝</div>
        <h2 className="text-2xl font-semibold text-gray-700">暂无笔记</h2>
        <p className="text-gray-500">
          还没有为这篇论文生成笔记。点击下方按钮,让 AI 为您自动生成结构化的论文笔记。
        </p>
        <button
          onClick={onGenerate}
          disabled={isGenerating}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center gap-2 mx-auto"
        >
          {isGenerating ? (
            <>
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              生成中...
            </>
          ) : (
            <>
              <span className="text-xl">✨</span>
              AI 生成笔记
            </>
          )}
        </button>
      </div>
    </div>
  )
}
