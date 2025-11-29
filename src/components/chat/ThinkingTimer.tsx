import { useState, useEffect } from 'react'

interface ThinkingTimerProps {
  startTime: Date
}

/**
 * 实时显示思考耗时的计时器组件
 * 每秒更新一次，显示从开始到现在的秒数
 */
export default function ThinkingTimer({ startTime }: ThinkingTimerProps) {
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    const start = new Date(startTime).getTime()
    
    // 立即计算一次
    setSeconds(Math.floor((Date.now() - start) / 1000))
    
    // 每秒更新
    const interval = setInterval(() => {
      setSeconds(Math.floor((Date.now() - start) / 1000))
    }, 1000)

    return () => clearInterval(interval)
  }, [startTime])

  return <span>思考中 ({seconds}s)</span>
}
