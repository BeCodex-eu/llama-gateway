/**
 * Async logging service — writes to SQLite AFTER request completion.
 * Never blocks the response pipeline.
 */
import { insertRequest, touchModel, RequestRecord } from '../db/queries';

export interface LogPayload {
  model: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  prompt: string;
  responsePreview: string;
  endpoint: string;
  statusCode: number;
}

export function logRequestAsync(payload: LogPayload): void {
  // setImmediate ensures this runs after the current I/O event — never blocking response
  setImmediate(() => {
    try {
      const record: RequestRecord = {
        model: payload.model || 'unknown',
        input_tokens: payload.inputTokens,
        output_tokens: payload.outputTokens,
        duration_ms: payload.durationMs,
        prompt: payload.prompt.slice(0, 1000),
        response_preview: payload.responsePreview.slice(0, 500),
        endpoint: payload.endpoint,
        status_code: payload.statusCode,
      };
      insertRequest(record);

      // Update model's last_used timestamp
      if (payload.model && payload.model !== 'unknown') {
        touchModel(payload.model);
      }
    } catch (_err) {
      // Silent — analytics must never affect request flow
    }
  });
}

/**
 * Parse token usage from a llama.cpp streaming SSE final chunk.
 * Returns { inputTokens, outputTokens } — both 0 if unavailable.
 */
export function parseStreamingUsage(lastDataLine: string): { inputTokens: number; outputTokens: number; responsePreview: string } {
  try {
    const parsed = JSON.parse(lastDataLine);
    const usage = parsed.usage ?? {};
    const content =
      parsed.choices?.[0]?.delta?.content ??
      parsed.choices?.[0]?.message?.content ??
      parsed.content ?? '';
    return {
      inputTokens: usage.prompt_tokens ?? parsed.tokens_evaluated ?? 0,
      outputTokens: usage.completion_tokens ?? parsed.tokens_predicted ?? 0,
      responsePreview: String(content).slice(0, 500),
    };
  } catch {
    return { inputTokens: 0, outputTokens: 0, responsePreview: '' };
  }
}

/**
 * Parse token usage from a non-streaming llama.cpp response body.
 */
export function parseCompletionUsage(responseBody: string): { inputTokens: number; outputTokens: number; responsePreview: string } {
  try {
    const parsed = JSON.parse(responseBody);
    const usage = parsed.usage ?? {};
    const content =
      parsed.choices?.[0]?.message?.content ??
      parsed.choices?.[0]?.text ??
      parsed.content ?? '';
    return {
      inputTokens: usage.prompt_tokens ?? parsed.tokens_evaluated ?? 0,
      outputTokens: usage.completion_tokens ?? parsed.tokens_predicted ?? 0,
      responsePreview: String(content).slice(0, 500),
    };
  } catch {
    return { inputTokens: 0, outputTokens: 0, responsePreview: '' };
  }
}
