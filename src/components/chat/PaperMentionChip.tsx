interface PaperMentionChipProps {
  title: string
  paperId: number
  onNavigate?: (paperId: number) => void
}

export default function PaperMentionChip({ 
  title, 
  paperId, 
  onNavigate 
}: PaperMentionChipProps) {
  const handleClick = () => {
    if (onNavigate) {
      onNavigate(paperId)
    }
  }

  return (
    <span
      onClick={handleClick}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 border border-purple-300 max-w-full ${
        onNavigate ? 'cursor-pointer hover:bg-purple-200' : ''
      }`}
      title={`引用论文: ${title}`}
    >
      <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>
      <span className="truncate">{title}</span>
    </span>
  )
}
