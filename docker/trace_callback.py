"""
LLM 调用追踪回调 — 挂载到 ai-service 容器，自动记录所有 LLM 调用。

通过 docker-compose volume 挂载为 sitecustomize.py，Python 启动时自动执行。
所有 LLM 调用（prompt/response/token/耗时）写入 /app/data/llm_traces.jsonl。
wren-ui 的 /api/traces 接口读取该文件展示在 Logs 页面。

文件位置（容器内）:
  - 本文件: /app/.venv/lib/python3.12/site-packages/sitecustomize.py
  - 输出:   /app/data/llm_traces.jsonl
"""

import json
import os
import threading
from datetime import datetime, timezone

# 输出路径 — docker-compose 中 data volume 挂载到 /app/data/
TRACE_FILE = os.environ.get("LLM_TRACE_FILE", "/app/data/llm_traces.jsonl")
_lock = threading.Lock()
_current_context = threading.local()


def set_trace_context(query_id=None, pipeline_name=None, question=None):
    if query_id is not None:
        _current_context.query_id = query_id
    if pipeline_name is not None:
        _current_context.pipeline_name = pipeline_name
    if question is not None:
        _current_context.question = question


def get_trace_context():
    return {
        "query_id": getattr(_current_context, "query_id", None),
        "pipeline_name": getattr(_current_context, "pipeline_name", None),
        "question": getattr(_current_context, "question", None),
    }


def _truncate(text, max_len=2000):
    if not text or len(text) <= max_len:
        return text
    half = max_len // 2
    return text[:half] + "\n... (" + str(len(text) - max_len) + " chars truncated) ...\n" + text[-half:]


def _write_event(event):
    with _lock:
        try:
            with open(TRACE_FILE, "a") as f:
                f.write(json.dumps(event, ensure_ascii=False, default=str) + "\n")
        except Exception as e:
            print("[trace_callback] write error: " + str(e))


try:
    import litellm
    from litellm.integrations.custom_logger import CustomLogger

    class WrenTraceLogger(CustomLogger):
        async def async_log_success_event(self, kwargs, response_obj, start_time, end_time):
            try:
                messages = kwargs.get("messages", [])
                model = kwargs.get("model", "unknown")

                usage = {}
                if hasattr(response_obj, "usage") and response_obj.usage:
                    usage = {
                        "prompt_tokens": getattr(response_obj.usage, "prompt_tokens", 0),
                        "completion_tokens": getattr(response_obj.usage, "completion_tokens", 0),
                        "total_tokens": getattr(response_obj.usage, "total_tokens", 0),
                    }

                response_text = ""
                if hasattr(response_obj, "choices") and response_obj.choices:
                    choice = response_obj.choices[0]
                    if hasattr(choice, "message") and hasattr(choice.message, "content"):
                        response_text = choice.message.content or ""

                system_prompt = ""
                user_prompt = ""
                for msg in messages:
                    role = msg.get("role", "")
                    content = msg.get("content", "")
                    if isinstance(content, list):
                        content = " ".join(
                            p.get("text", "") for p in content if isinstance(p, dict)
                        )
                    if role == "system":
                        system_prompt = content
                    elif role == "user":
                        user_prompt = content

                ctx = get_trace_context()
                duration_ms = 0
                if start_time and end_time:
                    duration_ms = int((end_time - start_time).total_seconds() * 1000)

                event = {
                    "type": "llm_call",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "query_id": ctx.get("query_id"),
                    "pipeline": ctx.get("pipeline_name"),
                    "question": ctx.get("question"),
                    "model": model,
                    "duration_ms": duration_ms,
                    "tokens": usage,
                    "system_prompt": _truncate(system_prompt, 3000),
                    "user_prompt": _truncate(user_prompt, 3000),
                    "response": _truncate(response_text, 3000),
                }
                _write_event(event)
            except Exception as e:
                print("[trace_callback] success error: " + str(e))

        async def async_log_failure_event(self, kwargs, response_obj, start_time, end_time):
            try:
                ctx = get_trace_context()
                messages = kwargs.get("messages", [])
                user_prompt = ""
                for msg in messages:
                    if msg.get("role") == "user":
                        content = msg.get("content", "")
                        if isinstance(content, list):
                            content = " ".join(
                                p.get("text", "") for p in content if isinstance(p, dict)
                            )
                        user_prompt = content

                duration_ms = 0
                if start_time and end_time:
                    duration_ms = int((end_time - start_time).total_seconds() * 1000)

                event = {
                    "type": "llm_error",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "query_id": ctx.get("query_id"),
                    "pipeline": ctx.get("pipeline_name"),
                    "question": ctx.get("question"),
                    "model": kwargs.get("model", "unknown"),
                    "duration_ms": duration_ms,
                    "error": str(response_obj),
                    "user_prompt": _truncate(user_prompt, 1000),
                }
                _write_event(event)
            except Exception as e:
                print("[trace_callback] failure error: " + str(e))

    wren_trace_logger = WrenTraceLogger()
    litellm.callbacks = [wren_trace_logger]
    print("[trace_callback] LLM trace logger registered, writing to " + TRACE_FILE)

except ImportError:
    # 不在 ai-service 容器里（比如被其他服务意外加载），静默跳过
    pass
