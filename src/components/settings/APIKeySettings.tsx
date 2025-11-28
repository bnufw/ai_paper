import { useState, useEffect } from 'react'
import { getAPIKey, saveAPIKey } from '../../services/storage/db'

interface APIKeySettingsProps {
  onClose: () => void
}

/**
 * API密钥配置组件
 * 允许用户设置Mistral、Gemini和OpenAI的API密钥
 */
export default function APIKeySettings({ onClose }: APIKeySettingsProps) {
  const [keys, setKeys] = useState({
    mistral: '',
    gemini: '',
    openai: ''
  })

  const [showKeys, setShowKeys] = useState({
    mistral: false,
    gemini: false,
    openai: false
  })

  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')

  // 加载已保存的API密钥
  useEffect(() => {
    async function loadKeys() {
      const [mistral, gemini, openai] = await Promise.all([
        getAPIKey('mistral'),
        getAPIKey('gemini'),
        getAPIKey('openai')
      ])

      setKeys({
        mistral: mistral || '',
        gemini: gemini || '',
        openai: openai || ''
      })
    }

    loadKeys()
  }, [])

  // 保存API密钥
  const handleSave = async () => {
    setSaving(true)
    setSaveMessage('')

    try {
      await Promise.all([
        keys.mistral && saveAPIKey('mistral', keys.mistral),
        keys.gemini && saveAPIKey('gemini', keys.gemini),
        keys.openai && saveAPIKey('openai', keys.openai)
      ])

      setSaveMessage('✓ 保存成功！')
      setTimeout(() => setSaveMessage(''), 2000)
    } catch (error) {
      setSaveMessage('✗ 保存失败：' + (error as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-2xl">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800">API密钥配置</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl"
          >
            ×
          </button>
        </div>

        <div className="space-y-4">
          {/* Mistral API Key */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Mistral API Key
              <span className="text-gray-500 text-xs ml-2">(用于PDF OCR转换)</span>
            </label>
            <div className="relative">
              <input
                type={showKeys.mistral ? 'text' : 'password'}
                value={keys.mistral}
                onChange={(e) => setKeys({ ...keys, mistral: e.target.value })}
                placeholder="sk-..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <button
                type="button"
                onClick={() => setShowKeys({ ...showKeys, mistral: !showKeys.mistral })}
                className="absolute right-3 top-2.5 text-gray-500 hover:text-gray-700"
              >
                {showKeys.mistral ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          {/* Gemini API Key */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Google Gemini API Key
              <span className="text-gray-500 text-xs ml-2">(用于AI对话)</span>
            </label>
            <div className="relative">
              <input
                type={showKeys.gemini ? 'text' : 'password'}
                value={keys.gemini}
                onChange={(e) => setKeys({ ...keys, gemini: e.target.value })}
                placeholder="AI..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <button
                type="button"
                onClick={() => setShowKeys({ ...showKeys, gemini: !showKeys.gemini })}
                className="absolute right-3 top-2.5 text-gray-500 hover:text-gray-700"
              >
                {showKeys.gemini ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          {/* OpenAI API Key */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              OpenAI API Key
              <span className="text-gray-500 text-xs ml-2">(用于AI对话)</span>
            </label>
            <div className="relative">
              <input
                type={showKeys.openai ? 'text' : 'password'}
                value={keys.openai}
                onChange={(e) => setKeys({ ...keys, openai: e.target.value })}
                placeholder="sk-..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <button
                type="button"
                onClick={() => setShowKeys({ ...showKeys, openai: !showKeys.openai })}
                className="absolute right-3 top-2.5 text-gray-500 hover:text-gray-700"
              >
                {showKeys.openai ? '🙈' : '👁️'}
              </button>
            </div>
          </div>
        </div>

        {/* 安全提示 */}
        <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-md">
          <p className="text-sm text-yellow-800">
            <strong>⚠️ 安全提示：</strong>
            <br />
            • API密钥仅存储在您浏览器的本地数据库中，不会上传到任何服务器
            <br />
            • 建议使用个人开发密钥，并在API提供商处设置使用限额
            <br />
            • 不要在公共或共享设备上保存密钥
          </p>
        </div>

        {/* 保存按钮 */}
        <div className="mt-6 flex items-center justify-between">
          <div>
            {saveMessage && (
              <span className={`text-sm ${saveMessage.startsWith('✓') ? 'text-green-600' : 'text-red-600'}`}>
                {saveMessage}
              </span>
            )}
          </div>
          <div className="space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-300"
            >
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
