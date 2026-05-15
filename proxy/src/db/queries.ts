import { getDb } from './database';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface RequestRecord {
  id?: number;
  timestamp?: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  duration_ms: number;
  prompt: string;
  response_preview: string;
  endpoint?: string;
  status_code?: number;
}

export interface ModelRecord {
  id?: number;
  name: string;
  path: string;
  last_used?: string;
  is_default?: number;
  created_at?: string;
}

export interface SettingRecord {
  key: string;
  value: string;
}

// ─── Request Queries ────────────────────────────────────────────────────────

export function insertRequest(record: RequestRecord): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO requests (model, input_tokens, output_tokens, duration_ms, prompt, response_preview, endpoint, status_code)
    VALUES (@model, @input_tokens, @output_tokens, @duration_ms, @prompt, @response_preview, @endpoint, @status_code)
  `).run({
    model: record.model,
    input_tokens: record.input_tokens,
    output_tokens: record.output_tokens,
    duration_ms: record.duration_ms,
    prompt: record.prompt,
    response_preview: record.response_preview,
    endpoint: record.endpoint || '/v1/chat/completions',
    status_code: record.status_code || 200,
  });
}

export function getRequests(opts: {
  model?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
  offset?: number;
}): { rows: RequestRecord[]; total: number } {
  const db = getDb();
  const conditions: string[] = [];
  const params: Record<string, string | number> = {};

  if (opts.model) {
    conditions.push('model = @model');
    params.model = opts.model;
  }
  if (opts.fromDate) {
    conditions.push('timestamp >= @fromDate');
    params.fromDate = opts.fromDate;
  }
  if (opts.toDate) {
    conditions.push('timestamp <= @toDate');
    params.toDate = opts.toDate;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = opts.limit || 50;
  const offset = opts.offset || 0;

  const rows = db.prepare(`
    SELECT * FROM requests ${where} ORDER BY timestamp DESC LIMIT @limit OFFSET @offset
  `).all({ ...params, limit, offset }) as RequestRecord[];

  const { total } = db.prepare(`
    SELECT COUNT(*) as total FROM requests ${where}
  `).get(params) as { total: number };

  return { rows, total };
}

export function deleteOldRequests(olderThanDays: number): number {
  const db = getDb();
  const result = db.prepare(`
    DELETE FROM requests
    WHERE timestamp < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-' || ? || ' days')
  `).run(olderThanDays);
  return result.changes;
}

export function deleteAllRequests(): number {
  const db = getDb();
  const result = db.prepare('DELETE FROM requests').run();
  return result.changes;
}

// ─── Analytics Queries ──────────────────────────────────────────────────────

export function getTokensPerDay(
  days = 30,
  fromDate?: string,
  toDate?: string,
): Array<{ date: string; input_tokens: number; output_tokens: number; requests: number }> {
  const db = getDb();
  if (fromDate && toDate) {
    return db.prepare(`
      SELECT
        strftime('%Y-%m-%d', timestamp) AS date,
        SUM(input_tokens)  AS input_tokens,
        SUM(output_tokens) AS output_tokens,
        COUNT(*)           AS requests
      FROM requests
      WHERE timestamp >= ? AND timestamp <= ?
      GROUP BY date
      ORDER BY date ASC
    `).all(fromDate, toDate) as Array<{ date: string; input_tokens: number; output_tokens: number; requests: number }>;
  }
  return db.prepare(`
    SELECT
      strftime('%Y-%m-%d', timestamp) AS date,
      SUM(input_tokens)  AS input_tokens,
      SUM(output_tokens) AS output_tokens,
      COUNT(*)           AS requests
    FROM requests
    WHERE timestamp >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-' || ? || ' days')
    GROUP BY date
    ORDER BY date ASC
  `).all(days) as Array<{ date: string; input_tokens: number; output_tokens: number; requests: number }>;
}

export function getModelUsage(
  days = 30,
  fromDate?: string,
  toDate?: string,
): Array<{ model: string; requests: number; input_tokens: number; output_tokens: number; avg_duration_ms: number }> {
  const db = getDb();
  if (fromDate && toDate) {
    return db.prepare(`
      SELECT
        model,
        COUNT(*)            AS requests,
        SUM(input_tokens)   AS input_tokens,
        SUM(output_tokens)  AS output_tokens,
        AVG(duration_ms)    AS avg_duration_ms
      FROM requests
      WHERE timestamp >= ? AND timestamp <= ?
      GROUP BY model
      ORDER BY requests DESC
    `).all(fromDate, toDate) as Array<{ model: string; requests: number; input_tokens: number; output_tokens: number; avg_duration_ms: number }>;
  }
  return db.prepare(`
    SELECT
      model,
      COUNT(*)            AS requests,
      SUM(input_tokens)   AS input_tokens,
      SUM(output_tokens)  AS output_tokens,
      AVG(duration_ms)    AS avg_duration_ms
    FROM requests
    WHERE timestamp >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-' || ? || ' days')
    GROUP BY model
    ORDER BY requests DESC
  `).all(days) as Array<{ model: string; requests: number; input_tokens: number; output_tokens: number; avg_duration_ms: number }>;
}

export function getOverviewStats(): {
  total_requests: number;
  total_input_tokens: number;
  total_output_tokens: number;
  avg_latency_ms: number;
  requests_today: number;
  tokens_today: number;
} {
  const db = getDb();
  const overall = db.prepare(`
    SELECT
      COUNT(*)            AS total_requests,
      SUM(input_tokens)   AS total_input_tokens,
      SUM(output_tokens)  AS total_output_tokens,
      AVG(duration_ms)    AS avg_latency_ms
    FROM requests
  `).get() as { total_requests: number; total_input_tokens: number; total_output_tokens: number; avg_latency_ms: number };

  const today = db.prepare(`
    SELECT
      COUNT(*)                              AS requests_today,
      SUM(input_tokens + output_tokens)     AS tokens_today
    FROM requests
    WHERE timestamp >= strftime('%Y-%m-%dT00:00:00Z', 'now')
  `).get() as { requests_today: number; tokens_today: number };

  return {
    total_requests: overall.total_requests || 0,
    total_input_tokens: overall.total_input_tokens || 0,
    total_output_tokens: overall.total_output_tokens || 0,
    avg_latency_ms: Math.round(overall.avg_latency_ms || 0),
    requests_today: today.requests_today || 0,
    tokens_today: today.tokens_today || 0,
  };
}

export function getLatencyTrend(
  days = 7,
  fromDate?: string,
  toDate?: string,
): Array<{ date: string; avg_latency_ms: number; max_latency_ms: number }> {
  const db = getDb();
  if (fromDate && toDate) {
    return db.prepare(`
      SELECT
        strftime('%Y-%m-%d', timestamp) AS date,
        AVG(duration_ms)                AS avg_latency_ms,
        MAX(duration_ms)                AS max_latency_ms
      FROM requests
      WHERE timestamp >= ? AND timestamp <= ?
      GROUP BY date
      ORDER BY date ASC
    `).all(fromDate, toDate) as Array<{ date: string; avg_latency_ms: number; max_latency_ms: number }>;
  }
  return db.prepare(`
    SELECT
      strftime('%Y-%m-%d', timestamp) AS date,
      AVG(duration_ms)                AS avg_latency_ms,
      MAX(duration_ms)                AS max_latency_ms
    FROM requests
    WHERE timestamp >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-' || ? || ' days')
    GROUP BY date
    ORDER BY date ASC
  `).all(days) as Array<{ date: string; avg_latency_ms: number; max_latency_ms: number }>;
}

// ─── Model Queries ──────────────────────────────────────────────────────────

export function getRequestsPerHour(
  days = 1,
  fromDate?: string,
  toDate?: string,
): Array<{ hour: string; requests: number }> {
  const db = getDb();
  if (fromDate && toDate) {
    return db.prepare(`
      SELECT strftime('%H', timestamp) AS hour, COUNT(*) AS requests
      FROM requests
      WHERE timestamp >= ? AND timestamp <= ?
      GROUP BY hour ORDER BY hour ASC
    `).all(fromDate, toDate) as Array<{ hour: string; requests: number }>;
  }
  return db.prepare(`
    SELECT strftime('%H', timestamp) AS hour, COUNT(*) AS requests
    FROM requests
    WHERE timestamp >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-' || ? || ' days')
    GROUP BY hour ORDER BY hour ASC
  `).all(days) as Array<{ hour: string; requests: number }>;
}

export function getStatusCodeStats(
  days = 30,
  fromDate?: string,
  toDate?: string,
): Array<{ date: string; success: number; errors: number }> {
  const db = getDb();
  if (fromDate && toDate) {
    return db.prepare(`
      SELECT
        strftime('%Y-%m-%d', timestamp) AS date,
        SUM(CASE WHEN status_code >= 200 AND status_code < 300 THEN 1 ELSE 0 END) AS success,
        SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) AS errors
      FROM requests
      WHERE timestamp >= ? AND timestamp <= ?
      GROUP BY date ORDER BY date ASC
    `).all(fromDate, toDate) as Array<{ date: string; success: number; errors: number }>;
  }
  return db.prepare(`
    SELECT
      strftime('%Y-%m-%d', timestamp) AS date,
      SUM(CASE WHEN status_code >= 200 AND status_code < 300 THEN 1 ELSE 0 END) AS success,
      SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) AS errors
    FROM requests
    WHERE timestamp >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-' || ? || ' days')
    GROUP BY date ORDER BY date ASC
  `).all(days) as Array<{ date: string; success: number; errors: number }>;
}

export function getAllModels(): ModelRecord[] {
  const db = getDb();
  return db.prepare('SELECT * FROM models ORDER BY is_default DESC, last_used DESC').all() as ModelRecord[];
}

export function upsertModel(model: ModelRecord): ModelRecord {
  const db = getDb();
  db.prepare(`
    INSERT INTO models (name, path, is_default)
    VALUES (@name, @path, @is_default)
    ON CONFLICT(name) DO UPDATE SET
      path       = excluded.path,
      is_default = excluded.is_default
  `).run({
    name: model.name,
    path: model.path,
    is_default: model.is_default || 0,
  });
  return db.prepare('SELECT * FROM models WHERE name = ?').get(model.name) as ModelRecord;
}

export function deleteModel(id: number): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM models WHERE id = ?').run(id);
  return result.changes > 0;
}

export function setDefaultModel(id: number): void {
  const db = getDb();
  db.prepare('UPDATE models SET is_default = 0').run();
  db.prepare('UPDATE models SET is_default = 1 WHERE id = ?').run(id);
  const model = db.prepare('SELECT name FROM models WHERE id = ?').get(id) as { name: string } | undefined;
  if (model) {
    db.prepare(`UPDATE settings SET value = ? WHERE key = 'active_model'`).run(model.name);
  }
}

export function getDefaultModelPath(): string {
  const db = getDb();
  const row = db.prepare('SELECT path FROM models WHERE is_default = 1 LIMIT 1').get() as { path: string } | undefined;
  return row?.path ?? '';
}

export function touchModel(name: string): void {
  const db = getDb();
  db.prepare(`UPDATE models SET last_used = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE name = ?`).run(name);
}

// ─── Settings Queries ───────────────────────────────────────────────────────

export function getSetting(key: string): string {
  const db = getDb();
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? '';
}

export function getAllSettings(): Record<string, string> {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM settings').all() as SettingRecord[];
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

export function setSetting(key: string, value: string): void {
  const db = getDb();
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

export function bulkSetSettings(settings: Record<string, string>): void {
  const db = getDb();
  const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  const update = db.transaction((entries: [string, string][]) => {
    for (const [key, value] of entries) {
      stmt.run(key, value);
    }
  });
  update(Object.entries(settings));
}

export function vacuumDb(): void {
  const db = getDb();
  db.exec('VACUUM');
}
