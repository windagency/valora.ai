# API Documentation: [Service Name]

| Attribute | Value |
|-----------|-------|
| **Base URL** | `https://api.example.com/v1` |
| **Version** | 1.0.0 |
| **Last Updated** | [YYYY-MM-DD] |
| **Authentication** | Bearer Token / API Key / None |

---

## Quick Reference

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/resources` | List all resources | Yes |
| GET | `/resources/:id` | Get resource by ID | Yes |
| POST | `/resources` | Create new resource | Yes |
| PUT | `/resources/:id` | Update resource | Yes |
| DELETE | `/resources/:id` | Delete resource | Yes |

---

## Authentication

### Bearer Token

```bash
curl -X GET "https://api.example.com/v1/resources" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### API Key

```bash
curl -X GET "https://api.example.com/v1/resources" \
  -H "X-API-Key: YOUR_API_KEY"
```

---

## Endpoints

### GET /resources

List all resources with pagination.

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | integer | 1 | Page number |
| `limit` | integer | 20 | Items per page (max: 100) |
| `sort` | string | `createdAt` | Sort field |
| `order` | string | `desc` | Sort order (asc/desc) |

**Response:**

```json
{
  "data": [
    { "id": "abc-123", "name": "Resource 1", "createdAt": "2025-01-01T00:00:00Z" }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

---

### GET /resources/:id

Get a single resource by ID.

**Path Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `id` | string | Resource UUID |

**Response:**

```json
{
  "data": {
    "id": "abc-123",
    "name": "Resource 1",
    "description": "Description here",
    "createdAt": "2025-01-01T00:00:00Z",
    "updatedAt": "2025-01-01T00:00:00Z"
  }
}
```

---

### POST /resources

Create a new resource.

**Request Body:**

```json
{
  "name": "New Resource",
  "description": "Optional description"
}
```

**Validation Rules:**

| Field | Rules |
|-------|-------|
| `name` | Required, 1-255 chars |
| `description` | Optional, max 1000 chars |

**Response:** `201 Created`

```json
{
  "data": {
    "id": "new-uuid",
    "name": "New Resource",
    "description": "Optional description",
    "createdAt": "2025-01-01T00:00:00Z"
  }
}
```

---

### PUT /resources/:id

Update an existing resource.

**Request Body:**

```json
{
  "name": "Updated Name",
  "description": "Updated description"
}
```

**Response:** `200 OK`

```json
{
  "data": {
    "id": "abc-123",
    "name": "Updated Name",
    "description": "Updated description",
    "updatedAt": "2025-01-01T12:00:00Z"
  }
}
```

---

### DELETE /resources/:id

Delete a resource.

**Response:** `204 No Content`

---

## Error Responses

All errors follow this format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": {}
  }
}
```

### Error Codes

| HTTP | Code | Description |
|------|------|-------------|
| 400 | `VALIDATION_ERROR` | Invalid request body/params |
| 401 | `UNAUTHORIZED` | Missing or invalid auth |
| 403 | `FORBIDDEN` | Insufficient permissions |
| 404 | `NOT_FOUND` | Resource not found |
| 409 | `CONFLICT` | Resource already exists |
| 422 | `UNPROCESSABLE` | Business rule violation |
| 429 | `RATE_LIMITED` | Too many requests |
| 500 | `INTERNAL_ERROR` | Server error |

---

## Rate Limiting

| Tier | Requests/min | Burst |
|------|--------------|-------|
| Free | 60 | 10 |
| Pro | 600 | 100 |
| Enterprise | 6000 | 1000 |

**Rate limit headers:**

```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1640995200
```

---

## Webhooks (if applicable)

### Events

| Event | Trigger |
|-------|---------|
| `resource.created` | New resource created |
| `resource.updated` | Resource updated |
| `resource.deleted` | Resource deleted |

### Payload

```json
{
  "event": "resource.created",
  "timestamp": "2025-01-01T00:00:00Z",
  "data": {
    "id": "abc-123",
    "name": "Resource 1"
  }
}
```

---

## SDKs & Examples

### cURL

```bash
# List resources
curl -X GET "https://api.example.com/v1/resources" \
  -H "Authorization: Bearer TOKEN"

# Create resource
curl -X POST "https://api.example.com/v1/resources" \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "New Resource"}'
```

### TypeScript/JavaScript

```typescript
const response = await fetch('https://api.example.com/v1/resources', {
  headers: { 'Authorization': `Bearer ${token}` }
});
const { data } = await response.json();
```

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | [YYYY-MM-DD] | Initial API release |
