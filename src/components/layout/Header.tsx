interface HeaderProps {
  onOpenSettings: () => void
}

export default function Header({ onOpenSettings }: HeaderProps) {
  return (
    <header className="bg-white shadow-sm border-b">
      <div className="px-6 py-4 flex justify-between items-center">
        <div className="flex items-center space-x-3">
          <h1 className="text-2xl font-bold text-gray-800">
            📚 学术论文阅读器
          </h1>
        </div>

        <button
          onClick={onOpenSettings}
          className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors"
        >
          ⚙️ 设置
        </button>
      </div>
    </header>
  )
}
