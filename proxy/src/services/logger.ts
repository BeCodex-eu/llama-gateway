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
  promptProcessingMs: number;
  completionMs: number;
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
        prompt_processing_ms: payload.promptProcessingMs,
        completion_ms: payload.completionMs,
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
 * Both token counts and timing data come from the `timings` object.
 * (Streaming responses do NOT include a `usage` object.)
 */
export function parseStreamingUsage(lastDataLine: string): { inputTokens: number; outputTokens: number; responsePreview: string; promptProcessingMs: number; completionMs: number } {
  try {
    const parsed = JSON.parse(lastDataLine);
    const timings = parsed.timings ?? {};
    const content =
      parsed.choices?.[0]?.delta?.content ??
      parsed.choices?.[0]?.message?.content ??
      parsed.content ?? '';
    return {
      inputTokens: timings.prompt_n ?? 0,
      outputTokens: timings.predicted_n ?? 0,
      responsePreview: String(content).slice(0, 500),
      promptProcessingMs: timings.prompt_ms ?? 0,
      completionMs: timings.predicted_ms ?? 0,
    };
  } catch {
    return { inputTokens: 0, outputTokens: 0, responsePreview: '', promptProcessingMs: 0, completionMs: 0 };
  }
}

/**
 * Parse token usage from a non-streaming llama.cpp response body.
 * Timing data comes from the `timings` object (prompt_ms, predicted_ms).
 * Token counts come from the `usage` object.
 */
export function parseCompletionUsage(responseBody: string): { inputTokens: number; outputTokens: number; responsePreview: string; promptProcessingMs: number; completionMs: number } {
  try {
    const parsed = JSON.parse(responseBody);
    const usage = parsed.usage ?? {};
    const timings = parsed.timings ?? {};
    const content =
      parsed.choices?.[0]?.message?.content ??
      parsed.choices?.[0]?.text ??
      parsed.content ?? '';
    const promptProcessingMs = timings.prompt_ms ?? 0;
    const completionMs = timings.predicted_ms ?? 0;
    return {
      inputTokens: usage.prompt_tokens ?? parsed.tokens_evaluated ?? 0,
      outputTokens: usage.completion_tokens ?? parsed.tokens_predicted ?? 0,
      responsePreview: String(content).slice(0, 500),
      promptProcessingMs,
      completionMs,
    };
  } catch {
    return { inputTokens: 0, outputTokens: 0, responsePreview: '', promptProcessingMs: 0, completionMs: 0 };
  }
}
