import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

export interface ContextMenuItem {
  label: string
  icon?: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean  // 危险操作显示红色
  divider?: boolean // 分隔线
}

interface ContextMenuProps {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}

export default function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  // 处理点击外部关闭
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    // 短暂延迟，避免右键触发立即关闭
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
    }, 0)

    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [onClose])

  // 处理ESC键关闭
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // 边界检测和自动调整位置
  useEffect(() => {
    if (!menuRef.current) return

    const menu = menuRef.current
    const rect = menu.getBoundingClientRect()

    let adjustedX = x
    let adjustedY = y

    // 右侧溢出检测
    if (rect.right > window.innerWidth) {
      adjustedX = window.innerWidth - rect.width - 10
    }

    // 底部溢出检测
    if (rect.bottom > window.innerHeight) {
      adjustedY = window.innerHeight - rect.height - 10
    }

    // 左侧边界检测
    if (adjustedX < 0) {
      adjustedX = 10
    }

    // 顶部边界检测
    if (adjustedY < 0) {
      adjustedY = 10
    }

    // 应用调整后的位置
    if (adjustedX !== x || adjustedY !== y) {
      menu.style.left = `${adjustedX}px`
      menu.style.top = `${adjustedY}px`
    }
  }, [x, y])

  const menuContent = (
    <div
      ref={menuRef}
      className="fixed bg-white border border-gray-300 rounded-lg shadow-lg z-50 py-1 min-w-[180px]"
      style={{
        left: x,
        top: y
      }}
    >
      {items.map((item, idx) =>
        item.divider ? (
          <div key={idx} className="h-px bg-gray-200 my-1" />
        ) : (
          <button
            key={idx}
            onClick={() => {
              if (!item.disabled) {
                item.onClick()
                onClose()
              }
            }}
            disabled={item.disabled}
            className={`
              w-full text-left px-3 py-2 text-sm
              flex items-center gap-2
              transition-colors
              ${item.disabled
                ? 'text-gray-400 cursor-not-allowed'
                : item.danger
                ? 'text-red-600 hover:bg-red-50'
                : 'text-gray-700 hover:bg-gray-100'
              }
            `}
          >
            {item.icon && <span className="text-base">{item.icon}</span>}
            <span>{item.label}</span>
          </button>
        )
      )}
    </div>
  )

  // 使用Portal渲染到body
  return createPortal(menuContent, document.body)
}
