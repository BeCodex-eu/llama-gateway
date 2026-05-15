import { FastifyInstance } from 'fastify';
import {
  getOverviewStats,
  getTokensPerDay,
  getModelUsage,
  getLatencyTrend,
  getRequests,
  getRequestsPerHour,
  getStatusCodeStats,
} from '../db/queries';

export async function analyticsPlugin(fastify: FastifyInstance): Promise<void> {
  // GET /api/analytics/overview — summary stats
  fastify.get('/api/analytics/overview', async () => {
    return getOverviewStats();
  });

  // GET /api/analytics/tokens-per-day?days=30&fromDate=2026-01-01T00:00:00Z&toDate=2026-01-31T23:59:59Z
  fastify.get<{ Querystring: { days?: string; fromDate?: string; toDate?: string } }>('/api/analytics/tokens-per-day', async (request) => {
    const days = Math.min(parseInt(request.query.days || '30', 10), 365);
    return { data: getTokensPerDay(days, request.query.fromDate, request.query.toDate) };
  });

  // GET /api/analytics/model-usage?days=30&fromDate=...&toDate=...
  fastify.get<{ Querystring: { days?: string; fromDate?: string; toDate?: string } }>('/api/analytics/model-usage', async (request) => {
    const days = Math.min(parseInt(request.query.days || '30', 10), 365);
    return { data: getModelUsage(days, request.query.fromDate, request.query.toDate) };
  });

  // GET /api/analytics/requests-per-hour?days=1&fromDate=...&toDate=...
  fastify.get<{ Querystring: { days?: string; fromDate?: string; toDate?: string } }>('/api/analytics/requests-per-hour', async (request) => {
    const days = Math.min(parseInt(request.query.days || '1', 10), 90);
    return { data: getRequestsPerHour(days, request.query.fromDate, request.query.toDate) };
  });

  // GET /api/analytics/status-stats?days=30&fromDate=...&toDate=...
  fastify.get<{ Querystring: { days?: string; fromDate?: string; toDate?: string } }>('/api/analytics/status-stats', async (request) => {
    const days = Math.min(parseInt(request.query.days || '30', 10), 365);
    return { data: getStatusCodeStats(days, request.query.fromDate, request.query.toDate) };
  });

  // GET /api/analytics/latency?days=7&fromDate=...&toDate=...
  fastify.get<{ Querystring: { days?: string; fromDate?: string; toDate?: string } }>('/api/analytics/latency', async (request) => {
    const days = Math.min(parseInt(request.query.days || '7', 10), 90);
    return { data: getLatencyTrend(days, request.query.fromDate, request.query.toDate) };
  });

  // GET /api/analytics/requests?model=&fromDate=&toDate=&limit=50&offset=0
  fastify.get<{
    Querystring: {
      model?: string;
      fromDate?: string;
      toDate?: string;
      limit?: string;
      offset?: string;
    };
  }>('/api/analytics/requests', async (request) => {
    const { model, fromDate, toDate, limit, offset } = request.query;
    return getRequests({
      model,
      fromDate,
      toDate,
      limit: limit ? Math.min(parseInt(limit, 10), 200) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
    });
  });
}
