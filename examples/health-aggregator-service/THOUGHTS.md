# Health Aggregator Service - Initial Thoughts

## The Problem

Our platform runs multiple microservices on Cloud Run, and we currently have no unified way to check the health of our entire system. Each service has its own `/health` endpoint, but:

- Operations team manually checks each service individually
- No single pane of glass for system health
- Kubernetes/Cloud Run probes only check individual containers
- Incident response is slow because we don't know which services are affected
- No historical context — we can't see if a service has been flaky

## What We Need

A lightweight health aggregator service that:

1. **Monitors multiple backend services** — Polls health endpoints of all registered services
2. **Provides a unified health API** — Single endpoint to get overall system status
3. **Runs on Cloud Run** — Must be cloud-native, containerised, auto-scaling
4. **Fast and reliable** — Should not become a bottleneck or single point of failure

## Initial Service List to Monitor

For the demo, we'll monitor these services:

- `user-service` — User authentication and profiles
- `order-service` — Order processing
- `inventory-service` — Stock management
- `notification-service` — Email/SMS notifications
- `payment-gateway` — Payment processing (external, may be slow)

## Key Requirements (Rough Ideas)

### Endpoints We Need

```
GET /health          → Basic liveness (is this service running?)
GET /health/ready    → Readiness (can this service handle requests?)
GET /health/live     → Liveness probe for K8s/Cloud Run
GET /status/aggregate → Full health report of all monitored services
```

### Response Format Ideas

```json
{
  "status": "healthy | degraded | unhealthy",
  "timestamp": "2024-01-25T10:00:00.000Z",
  "services": [
    {
      "name": "user-service",
      "url": "https://user-service.run.app/health",
      "status": "healthy",
      "latency": 45,
      "lastChecked": "2024-01-25T10:00:00.000Z"
    }
  ],
  "summary": {
    "total": 5,
    "healthy": 4,
    "degraded": 1,
    "unhealthy": 0
  }
}
```

### Performance Considerations

- **Parallel checks**: Don't check services sequentially — that's too slow
- **Timeouts**: Each service check should timeout after 2-5 seconds
- **Caching**: Cache results briefly (5-10 seconds) to avoid hammering services
- **Circuit breaker**: If a service is consistently failing, stop checking it temporarily

### Cloud Run Specifics

- Must respect Cloud Run cold start behaviour
- Graceful shutdown on SIGTERM (Cloud Run sends this)
- Use `PORT` environment variable
- Structured logging in Cloud Logging JSON format
- Support for X-Cloud-Trace-Context header for trace correlation

### Configuration

Services to monitor should be configurable via:

- Environment variables (simple)
- Or a config file mounted as a secret
- Or fetched from a configuration service

Example config:

```yaml
services:
  - name: user-service
    url: https://user-service-abc123.run.app
    timeout: 3000
    critical: true
  - name: payment-gateway
    url: https://api.payment.com/health
    timeout: 5000
    critical: true
  - name: analytics
    url: https://analytics-service.run.app/health
    timeout: 2000
    critical: false  # Non-critical — degraded is OK
```

### Health Status Logic

- **healthy**: All critical services healthy, non-critical can be degraded
- **degraded**: Some non-critical services unhealthy, all critical OK
- **unhealthy**: Any critical service is unhealthy

## Technical Preferences

- **Language**: TypeScript (team standard)
- **Framework**: Fastify (better performance than Express, native TypeScript support)
- **Container**: Multi-stage Dockerfile, node:20-slim base
- **Testing**: Jest for unit tests, supertest for integration

## Out of Scope (For Now)

- Historical data storage (no database)
- Alerting integration (PagerDuty, Slack) — future phase
- Service discovery (manual config for now)
- Authentication (internal service, not public)
- Metrics export to Prometheus (future phase)

## Success Criteria

1. Can query a single endpoint to get health of all services
2. Response time < 500ms even with 10 services
3. Handles service timeouts gracefully
4. Cloud Logging compatible structured logs
5. Works with Cloud Run health probes
6. Graceful shutdown within 10 seconds
7. > 80% test coverage

## Open Questions

1. Should we cache health results? If so, for how long?
2. How do we handle services that are slow but eventually respond?
3. Should the aggregator itself be considered unhealthy if > 50% of services are down?
4. Do we need to support different health check protocols (HTTP, TCP, gRPC)?
5. Should we expose Prometheus metrics for the aggregator itself?

## Notes

This is the first phase. Future phases could add:

- Prometheus metrics endpoint
- Slack/PagerDuty alerting
- Historical trend data
- Service discovery via Cloud Run API
- Admin UI dashboard
