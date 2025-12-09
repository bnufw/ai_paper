import PaperMentionChip from './PaperMentionChip'

interface MessageContentProps {
  content: string
}

// 引用标记正则
const MENTION_PATTERN = /@\[([^\]]+)\]\(paperId:(\d+)\)/g

export default function MessageContent({ content }: MessageContentProps) {
  // 解析内容,将@标记替换为组件
  const parts: (string | { type: 'mention'; title: string; paperId: number })[] = []
  let lastIndex = 0
  let match

  const regex = new RegExp(MENTION_PATTERN)
  while ((match = regex.exec(content)) !== null) {
    // 添加前面的文本
    if (match.index > lastIndex) {
      parts.push(content.substring(lastIndex, match.index))
    }
    
    // 添加引用标记
    parts.push({
      type: 'mention',
      title: match[1],
      paperId: parseInt(match[2])
    })
    
    lastIndex = regex.lastIndex
  }

  // 添加剩余文本
  if (lastIndex < content.length) {
    parts.push(content.substring(lastIndex))
  }

  // 如果没有引用,直接返回纯文本
  if (parts.length === 0 || (parts.length === 1 && typeof parts[0] === 'string')) {
    return <div className="whitespace-pre-wrap break-words overflow-hidden">{content}</div>
  }

  // 渲染混合内容
  return (
    <div className="whitespace-pre-wrap break-words overflow-hidden">
      {parts.map((part, index) => {
        if (typeof part === 'string') {
          return <span key={index}>{part}</span>
        } else {
          return (
            <PaperMentionChip
              key={index}
              title={part.title}
              paperId={part.paperId}
            />
          )
        }
      })}
    </div>
  )
}
