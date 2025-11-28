# example.ipynb 模型调用汇总（2025-11-27 执行示例）
- 输入来源：笔记本内全部代码单元，去重整理；所有系统/用户提示词统一以 `xxx` 代指。

## Gemini 3 Pro（gemini-3-pro-preview）
- 客户端：`genai.Client(api_key=GEMINI_API_KEY, http_options=HttpOptions(timeout=60000, base_url="https://api-proxy.de/gemini"))`。
- 参数范围：`temperature` 官方默认 1.0（常用 0–2）；`max_output_tokens` 受账号配额约束（示例 4024）；`thinking_level` ∈ {low, high}；`include_thoughts` ∈ {True, False}。
- 调用A：`generate_content`，system_instruction=xxx，temperature=1.0，max_output_tokens=4024。
- 调用B：`generate_content`，thinking_config(thinking_level="low", include_thoughts=True)，其余默认。

## Gemini 2.5 Pro（gemini-2.5-pro）
- 参数范围：`temperature` 常用 0–2；`max_output_tokens` 受配额（示例 3024/4048/7024）；`thinking_budget` 支持 128–32768；`include_thoughts` ∈ {True, False}；流式与否由接口决定。
- 调用A：`generate_content`，system_instruction=xxx，temperature=0.5，max_output_tokens=7024。
- 调用B：`generate_content`，thinking_config(thinking_budget=128, include_thoughts=True)，max_output_tokens=4048。
- 调用C：非流式 `generate_content`，temperature=0.7，max_output_tokens=3024。
- 调用D：流式 `generate_content_stream`，temperature=0.7，max_output_tokens=3024。

## OpenAI 兼容端点（https://api.oaipro.com/v1，需自备 API key）
- Claude 4.5 Sonnet（claude-sonnet-4-5-20250929）
  - 参数范围：`max_tokens` ≤ 64000（含思考）；`temperature` 支持 0–2；`thinking.type` ∈ {enabled, disabled}；`budget_tokens` ≥ 1024（示例 1024）；`effort` ∈ {low, medium, high}。
  - 基础对话：system=xxx，user=xxx。
  - 思考版：max_tokens=2000，temperature=1.0，extra_body.thinking={type:"enabled", budget_tokens=1024}。
  - Effort 版：max_tokens=2000，temperature=1.0，extra_body.thinking 同上，extra_body.output_config.effort="low"。
- GPT-5 / GPT-5.1
  - 参数范围：`reasoning_effort`：gpt-5 ∈ {minimal, low, medium, high}；gpt-5.1 ∈ {none, low, medium, high}；`verbosity` ∈ {low, medium, high}；`temperature` 仅在 reasoning_effort=none 时可用；`max_completion_tokens` 受配额（高推理建议 ≥25000，示例 128）。
  - 调用1：model="gpt-5"，reasoning_effort="minimal"，max_completion_tokens=128，verbosity="low"，system=xxx，user=xxx。
  - 调用2：model="gpt-5.1"，reasoning_effort="low"，max_completion_tokens=128，verbosity="low"，system=xxx，user=xxx。
- o4-mini
  - 参数范围：`reasoning_effort` ∈ {low, medium, high}；不支持 temperature / verbosity；`max_completion_tokens` 受配额（示例 512）。
  - 调用：system=xxx，user=xxx，reasoning_effort="low"，max_completion_tokens=512。

## Qwen 3 Max Preview（qwen3-max-preview）
- 客户端：`OpenAI(base_url="https://dashscope.aliyuncs.com/compatible-mode/v1", api_key=DASHSCOPE_API_KEY, timeout=1000)`。
- 参数范围：`enable_thinking` ∈ {True, False}；`max_completion_tokens` 受配额（示例 2000）；temperature 未在示例中设置（保持默认）。
- 调用：system=xxx，user=xxx，extra_body={enable_thinking: True}，max_completion_tokens=2000。