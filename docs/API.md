# API Documentation

## Overview

The Shenasa API provides comprehensive Persian name gender detection with enterprise-grade features. All endpoints return JSON responses and support CORS for cross-origin requests.

## Base URL

**Production**: `https://shenasa.usestrict.dev/api/v1`  
**Development**: `http://localhost:8787/api/v1`

## Authentication

### API Keys

Most advanced features require an API key. Include your API key in the request header:

```http
X-API-Key: sk_your_api_key_here
```

### Admin Access

Admin endpoints require admin authentication:

```http
X-Admin-Key: your_admin_secret
```

## Rate Limiting

Rate limits vary by tier:

| Tier | Requests/Hour | Features |
|------|---------------|----------|
| Free | 100 | Basic lookup |
| Basic | 1,000 | + Batch processing, Metrics |
| Premium | 10,000 | + Analytics |
| Enterprise | 100,000 | + Custom features |

Rate limit headers are included in responses:

```http
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 2024-01-01T12:00:00Z
```

## Endpoints

### Core Endpoints

#### Get Name Gender

```http
GET /name/{name}
```

Returns gender and English transliteration for a Persian name.

**Parameters:**
- `name` (required): Persian name to lookup

**Response:**
```json
{
  "gender": "MALE" | "FEMALE" | "UNKNOWN" | null,
  "enName": "english_transliteration" | null
}
```

**Example:**
```bash
curl "https://shenasa.usestrict.dev/api/v1/name/محمد"
```

#### Health Check

```http
GET /health
```

Returns system health status.

**Response:**
```json
{
  "status": "healthy" | "degraded" | "unhealthy",
  "timestamp": "2024-01-01T12:00:00Z",
  "version": "2.0.0",
  "uptime": 12345,
  "checks": {
    "database": {
      "status": "pass" | "fail",
      "responseTime": 50
    },
    "cache": {
      "status": "pass" | "fail", 
      "responseTime": 10
    },
    "memory": {
      "status": "pass" | "fail",
      "usage": 75.5
    }
  }
}
```

### Enterprise Endpoints

#### Batch Processing

```http
POST /batch
```

Process multiple names in a single request.

**Authentication:** API Key required (Basic+ tier)

**Request Body:**
```json
{
  "names": ["علی", "زهرا", "حسین"],
  "includePopularity": false
}
```

**Response:**
```json
{
  "results": [
    {
      "name": "علی",
      "gender": "MALE",
      "enName": "ali",
      "popularity": 95,
      "confidence": 0.95
    }
  ],
  "processedCount": 3,
  "errorCount": 0,
  "processingTime": 150
}
```

#### System Metrics

```http
GET /metrics
```

Get system usage metrics and statistics.

**Authentication:** API Key required (Basic+ tier)

**Response:**
```json
{
  "totalRequests": 10000,
  "successfulRequests": 9950,
  "failedRequests": 50,
  "averageResponseTime": 85.5,
  "uniqueNamesCount": 5000,
  "topRequestedNames": [
    {"name": "محمد", "count": 500},
    {"name": "فاطمه", "count": 450}
  ],
  "requestsByHour": [
    {"hour": "2024-01-01 10:00:00", "count": 100}
  ],
  "errorRate": 0.5,
  "uptime": "5d 12h 30m"
}
```

#### Advanced Analytics

```http
GET /analytics?startDate=2024-01-01&endDate=2024-01-31&limit=50
```

Get advanced analytics and insights.

**Authentication:** API Key required (Premium+ tier)

**Query Parameters:**
- `startDate` (optional): Start date (ISO 8601)
- `endDate` (optional): End date (ISO 8601)
- `limit` (optional): Limit results (1-100, default: 50)

**Response:**
```json
{
  "genderDistribution": {
    "male": 5500,
    "female": 4200,
    "unknown": 300
  },
  "popularNames": [
    {
      "name": "محمد",
      "gender": "MALE",
      "count": 500,
      "popularity": 95
    }
  ],
  "originDistribution": [
    {
      "origin": "عربی",
      "count": 3000,
      "percentage": 30.0
    }
  ],
  "dailyTrends": [
    {
      "date": "2024-01-01",
      "requests": 1000,
      "uniqueNames": 500
    }
  ]
}
```

### Admin Endpoints

#### Create API Key

```http
POST /admin/api-keys
```

Create a new API key.

**Authentication:** Admin key required

**Request Body:**
```json
{
  "name": "My Application",
  "tier": "BASIC" | "PREMIUM" | "ENTERPRISE"
}
```

**Response:**
```json
{
  "id": "key_id",
  "key": "sk_generated_key",
  "name": "My Application",
  "tier": "BASIC",
  "requestLimit": 1000,
  "requestCount": 0,
  "isActive": true,
  "createdAt": "2024-01-01T12:00:00Z",
  "lastUsedAt": null
}
```

#### Warm Cache

```http
POST /admin/cache/warm
```

Pre-populate cache with popular names.

**Authentication:** Admin key required

**Response:**
```json
{
  "message": "Cache warmed successfully"
}
```

## Error Handling

All errors follow a consistent format:

```json
{
  "code": 40001,
  "message": "Error description"
}
```

### Error Codes

| Code | Description |
|------|-------------|
| 40001 | Validation error |
| 40002 | Value too small |
| 40003 | Value too large |
| 40101 | Authentication required |
| 40301 | Insufficient permissions |
| 40302 | Feature requires upgrade |
| 40303 | Quota exceeded |
| 42901 | Rate limit exceeded |

## SDKs and Examples

### JavaScript/TypeScript

```typescript
class ShenasaClient {
  constructor(private apiKey?: string, private baseUrl = 'https://shenasa.usestrict.dev/api/v1') {}

  async getName(name: string) {
    const response = await fetch(`${this.baseUrl}/name/${encodeURIComponent(name)}`, {
      headers: this.apiKey ? { 'X-API-Key': this.apiKey } : {}
    });
    return response.json();
  }

  async batchProcess(names: string[], includePopularity = false) {
    if (!this.apiKey) throw new Error('API key required for batch processing');
    
    const response = await fetch(`${this.baseUrl}/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey
      },
      body: JSON.stringify({ names, includePopularity })
    });
    return response.json();
  }
}

// Usage
const client = new ShenasaClient('your-api-key');
const result = await client.getName('محمد');
console.log(result); // { gender: "MALE", enName: "mohammad" }
```

### Python

```python
import requests

class ShenasaClient:
    def __init__(self, api_key=None, base_url='https://shenasa.usestrict.dev/api/v1'):
        self.api_key = api_key
        self.base_url = base_url
        self.session = requests.Session()
        if api_key:
            self.session.headers.update({'X-API-Key': api_key})

    def get_name(self, name):
        response = self.session.get(f"{self.base_url}/name/{name}")
        response.raise_for_status()
        return response.json()

    def batch_process(self, names, include_popularity=False):
        if not self.api_key:
            raise ValueError("API key required for batch processing")
        
        response = self.session.post(f"{self.base_url}/batch", json={
            'names': names,
            'includePopularity': include_popularity
        })
        response.raise_for_status()
        return response.json()

# Usage
client = ShenasaClient('your-api-key')
result = client.get_name('محمد')
print(result)  # {'gender': 'MALE', 'enName': 'mohammad'}
```

### cURL Examples

```bash
# Basic name lookup
curl "https://shenasa.usestrict.dev/api/v1/name/محمد"

# With API key
curl -H "X-API-Key: your-api-key" \
     "https://shenasa.usestrict.dev/api/v1/name/فاطمه"

# Batch processing
curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{"names": ["علی", "زهرا"], "includePopularity": true}' \
  "https://shenasa.usestrict.dev/api/v1/batch"

# Get metrics
curl -H "X-API-Key: your-api-key" \
     "https://shenasa.usestrict.dev/api/v1/metrics"

# Health check
curl "https://shenasa.usestrict.dev/api/v1/health"
```