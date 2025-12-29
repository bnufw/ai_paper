import { useTheme } from '../../hooks/useTheme'

interface ThemeToggleProps {
  className?: string
  showLabel?: boolean
}

export default function ThemeToggle({ className = '', showLabel = false }: ThemeToggleProps) {
  const { effectiveTheme, toggleTheme } = useTheme()
  const isDark = effectiveTheme === 'dark'

  return (
    <button
      onClick={toggleTheme}
      className={`
        group relative flex items-center gap-2
        px-3 py-2 rounded-2xl
        bg-gray-200 hover:bg-gray-300
        transition-all duration-300 ease-out
        ${className}
      `}
      title={isDark ? '切换到浅色模式' : '切换到深色模式'}
    >
      {/* 切换滑块背景 */}
      <div className="relative w-12 h-6 rounded-full bg-gray-300 transition-colors duration-300 overflow-hidden">
        {/* 滑动圆球 */}
        <div
          className={`
            absolute top-0.5 w-5 h-5 rounded-full
            flex items-center justify-center
            text-xs font-bold
            transform transition-all duration-300 ease-out
            shadow-md
            ${isDark
              ? 'translate-x-6 bg-gray-800 text-yellow-400'
              : 'translate-x-0.5 bg-white text-orange-400'
            }
          `}
        >
          {isDark ? '🌙' : '☀️'}
        </div>

        {/* 背景装饰 - 星星/云朵 */}
        <div className={`
          absolute inset-0 flex items-center justify-end pr-1.5
          text-[8px] transition-opacity duration-300
          ${isDark ? 'opacity-100' : 'opacity-0'}
        `}>
          ✨
        </div>
        <div className={`
          absolute inset-0 flex items-center pl-1.5
          text-[8px] transition-opacity duration-300
          ${isDark ? 'opacity-0' : 'opacity-100'}
        `}>
          ☁️
        </div>
      </div>

      {showLabel && (
        <span className="text-sm font-medium text-gray-700">
          {isDark ? '深色' : '浅色'}
        </span>
      )}
    </button>
  )
}
