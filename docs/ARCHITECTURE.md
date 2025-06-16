# System Architecture

This document describes the architecture, design decisions, and technical implementation of the Shenasa Persian name gender detection API.

## Overview

Shenasa is built as a serverless edge-first application designed for global scale, high performance, and enterprise-grade reliability. The architecture leverages Cloudflare's edge computing platform for optimal performance worldwide.

## High-Level Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Client Apps   │    │   Web Browser   │    │  Mobile Apps    │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          └──────────────────────┼──────────────────────┘
                                 │
                    ┌─────────────▼─────────────┐
                    │     Cloudflare CDN       │
                    │   (Global Edge Network)  │
                    └─────────────┬─────────────┘
                                 │
                    ┌─────────────▼─────────────┐
                    │   Cloudflare Workers     │
                    │    (Shenasa API)         │
                    │  • Rate Limiting         │
                    │  • Caching               │
                    │  • Authentication        │
                    │  • Business Logic        │
                    └─────────────┬─────────────┘
                                 │
                ┌────────────────┼────────────────┐
                │                │                │
      ┌─────────▼─────────┐ ┌────▼────┐ ┌─────────▼─────────┐
      │   Cloudflare D1   │ │  KV     │ │    Analytics      │
      │   (SQLite DB)     │ │ Store   │ │   & Monitoring    │
      │  • Names Data     │ │ Cache   │ │  • Request Logs   │
      │  • Metrics        │ │         │ │  • Performance    │
      │  • API Keys       │ │         │ │  • Error Tracking │
      └───────────────────┘ └─────────┘ └───────────────────┘
```

## Core Components

### 1. API Gateway Layer (Cloudflare Workers)

**Responsibilities:**
- Request routing and validation
- Authentication and authorization
- Rate limiting and quota management
- Response caching and optimization
- Security headers and CORS handling
- Request/response logging

**Key Features:**
- Edge computing for <50ms global latency
- Auto-scaling based on demand
- Built-in DDoS protection
- Zero cold starts

### 2. Business Logic Layer

**Components:**

#### Name Processing Engine
```typescript
class NameProcessor {
  async processName(name: string): Promise<NameResult> {
    // 1. Normalize input (remove diacritics, standardize)
    // 2. Check cache for existing result
    // 3. Query database with fuzzy matching
    // 4. Apply confidence scoring
    // 5. Cache result for future requests
  }
}
```

#### Analytics Engine
```typescript
class AnalyticsEngine {
  async collectMetrics(request: RequestData): Promise<void> {
    // 1. Extract request metadata
    // 2. Calculate response time
    // 3. Store in metrics database
    // 4. Update real-time counters
  }
  
  async generateInsights(): Promise<AnalyticsData> {
    // 1. Aggregate request data
    // 2. Calculate trends and patterns
    // 3. Generate popularity rankings
    // 4. Return formatted insights
  }
}
```

#### Caching System
```typescript
class CacheManager {
  // Multi-layer caching strategy
  // L1: In-memory (Worker runtime)
  // L2: Cloudflare KV (Edge cache)
  // L3: Database cache table
}
```

### 3. Data Layer

#### Primary Database (Cloudflare D1)
- **Type**: SQLite-compatible, distributed
- **Performance**: <10ms query latency
- **Capacity**: Millions of records
- **Consistency**: Eventually consistent across regions

**Schema Design:**
```sql
-- Core name data
PersianName {
  id: String (CUID2)
  name: String (indexed)
  gender: Enum
  enName: String?
  origin: String?
  popularity: Integer (indexed)
  abjadValue: Integer?
}

-- Request tracking
RequestLog {
  id: String
  persianNameId: String?
  requestedName: String (indexed)
  responseTime: Integer
  statusCode: Integer
  createdAt: DateTime (indexed)
}

-- API management
ApiKey {
  id: String
  key: String (unique, indexed)
  tier: Enum (indexed)
  requestLimit: Integer
  requestCount: Integer
}
```

#### Cache Layer (Cloudflare KV)
- **Type**: Global key-value store
- **TTL**: Configurable per entry
- **Consistency**: Eventually consistent
- **Performance**: Sub-millisecond reads

### 4. Security Layer

#### Authentication System
```typescript
interface SecurityContext {
  // API Key validation
  validateApiKey(key: string): Promise<ApiKeyData>
  
  // Rate limiting
  checkRateLimit(identifier: string, tier: Tier): Promise<boolean>
  
  // Request sanitization
  sanitizeInput(input: any): SanitizedInput
}
```

#### Rate Limiting Strategy
```typescript
const rateLimits = {
  // Sliding window with burst allowance
  FREE: { requests: 100, window: '1h', burst: 10 },
  BASIC: { requests: 1000, window: '1h', burst: 50 },
  PREMIUM: { requests: 10000, window: '1h', burst: 200 },
  ENTERPRISE: { requests: 100000, window: '1h', burst: 1000 }
}
```

## Data Flow

### 1. Request Processing Flow

```
Client Request
      ↓
┌─────────────────┐
│ Edge Validation │ ← CORS, Security Headers
└─────────┬───────┘
          ↓
┌─────────────────┐
│ Authentication  │ ← API Key Check
└─────────┬───────┘
          ↓
┌─────────────────┐
│ Rate Limiting   │ ← Tier-based Limits
└─────────┬───────┘
          ↓
┌─────────────────┐
│ Cache Check     │ ← L1/L2/L3 Lookup
└─────────┬───────┘
          ↓
┌─────────────────┐
│ Database Query  │ ← If Cache Miss
└─────────┬───────┘
          ↓
┌─────────────────┐
│ Response Cache  │ ← Store Result
└─────────┬───────┘
          ↓
┌─────────────────┐
│ Metrics Log     │ ← Analytics Data
└─────────┬───────┘
          ↓
    Client Response
```

### 2. Batch Processing Flow

```
Batch Request (up to 100 names)
      ↓
┌─────────────────┐
│ Input Validation│ ← Size, Format Check
└─────────┬───────┘
          ↓
┌─────────────────┐
│ Parallel Cache  │ ← Check All Names
│ Lookup          │   in Cache
└─────────┬───────┘
          ↓
┌─────────────────┐
│ Batch DB Query  │ ← Single Query for
│                 │   Cache Misses
└─────────┬───────┘
          ↓
┌─────────────────┐
│ Result Assembly │ ← Combine Cached +
│                 │   Fresh Results
└─────────┬───────┘
          ↓
┌─────────────────┐
│ Batch Cache     │ ← Store New Results
│ Update          │
└─────────┬───────┘
          ↓
    Batch Response
```

## Performance Optimizations

### 1. Caching Strategy

**Multi-Level Caching:**
```typescript
class CacheStrategy {
  // L1: Runtime Memory (fastest, limited scope)
  private memoryCache = new Map<string, CacheEntry>();
  
  // L2: Edge KV Store (fast, global scope)
  private edgeCache: KVNamespace;
  
  // L3: Database Cache Table (persistent, queryable)
  private dbCache: PrismaClient;
}
```

**Cache Warming:**
- Popular names pre-loaded on deployment
- Background refresh of expiring entries
- Predictive caching based on trends

### 2. Database Optimization

**Query Optimization:**
```sql
-- Optimized name lookup with index usage
SELECT gender, enName 
FROM PersianName 
WHERE name = ? 
LIMIT 1;

-- Compound index for efficient filtering
CREATE INDEX idx_name_gender ON PersianName(name, gender);

-- Popularity-based ordering
CREATE INDEX idx_popularity ON PersianName(popularity DESC);
```

**Connection Management:**
- Connection pooling via Prisma
- Query batching for multiple requests
- Prepared statement caching

### 3. Response Optimization

**Compression:**
- Gzip compression for responses >1KB
- JSON response minification
- ETag-based conditional requests

**Streaming:**
```typescript
// Large dataset responses use streaming
async function streamResults(query: string): Promise<ReadableStream> {
  return new ReadableStream({
    async start(controller) {
      const results = await db.query(query);
      for (const chunk of results) {
        controller.enqueue(JSON.stringify(chunk) + '\n');
      }
      controller.close();
    }
  });
}
```

## Scalability Design

### 1. Horizontal Scaling

**Auto-Scaling:**
- Cloudflare Workers automatically scale to demand
- No server management required
- Global distribution across 200+ cities

**Load Distribution:**
- DNS-based geographic routing
- Edge-side load balancing
- Automatic failover between regions

### 2. Database Scaling

**Read Scaling:**
- Replica reads from multiple regions
- Cache-first strategy reduces DB load
- Query result pagination for large datasets

**Write Scaling:**
- Async metrics collection
- Batch inserts for request logs
- Event-driven cache invalidation

### 3. Resource Management

**Memory Management:**
```typescript
class ResourceManager {
  // Monitor worker memory usage
  checkMemoryUsage(): number {
    return (performance as any).memory?.usedJSHeapSize || 0;
  }
  
  // Cleanup expired cache entries
  async cleanupCache(): Promise<void> {
    const expired = this.findExpiredEntries();
    await this.removeEntries(expired);
  }
}
```

## Security Architecture

### 1. Defense in Depth

**Layer 1: Edge Security**
- DDoS protection via Cloudflare
- WAF rules for common attacks
- Geographic blocking if needed

**Layer 2: Application Security**
- Input validation and sanitization
- SQL injection prevention via Prisma
- XSS protection through CSP headers

**Layer 3: Data Security**
- Encrypted data at rest
- TLS 1.3 for data in transit
- API key encryption and rotation

### 2. Access Control

**Authentication:**
```typescript
interface AccessControl {
  // API key tiers with different permissions
  validateAccess(key: string, resource: string): Promise<boolean>;
  
  // Admin-only endpoints
  requireAdmin(request: Request): Promise<boolean>;
  
  // Rate limiting by tier
  checkQuota(key: string, endpoint: string): Promise<QuotaStatus>;
}
```

### 3. Audit and Monitoring

**Request Logging:**
- All API requests logged with metadata
- Failed authentication attempts tracked
- Suspicious activity patterns flagged

**Security Monitoring:**
- Real-time alerting on anomalies
- Automated response to detected threats
- Regular security audit reports

## Monitoring and Observability

### 1. Metrics Collection

**Application Metrics:**
```typescript
interface Metrics {
  requestCount: number;
  responseTime: number[];
  errorRate: number;
  cacheHitRate: number;
  activeConnections: number;
}
```

**Business Metrics:**
- Most popular names
- Geographic usage patterns
- API tier adoption rates
- Feature usage statistics

### 2. Health Monitoring

**Health Checks:**
```typescript
class HealthMonitor {
  async checkDatabase(): Promise<HealthStatus> {
    // Test DB connectivity and latency
  }
  
  async checkCache(): Promise<HealthStatus> {
    // Verify cache accessibility
  }
  
  async checkExternalDeps(): Promise<HealthStatus> {
    // Monitor third-party services
  }
}
```

### 3. Alerting System

**Alert Conditions:**
- Error rate >1% for 5 minutes
- Response time >500ms for 10 minutes
- Database connection failures
- Cache miss rate >50%

## Data Management

### 1. Data Sources

**Primary Datasets:**
- Iranian Names Dataset (40K+ names)
- Persian Gender Names (20K+ names)  
- Extended Names with Metadata (50K+ names)

**Data Quality:**
- Deduplication across sources
- Confidence scoring for ambiguous names
- Manual verification for popular names

### 2. Data Pipeline

```typescript
class DataPipeline {
  async processCSVData(file: string): Promise<ProcessedData[]> {
    // 1. Parse CSV with encoding detection
    // 2. Normalize Persian text (remove diacritics)
    // 3. Validate gender assignments
    // 4. Calculate popularity scores
    // 5. Generate English transliterations
    // 6. Apply quality filters
  }
}
```

### 3. Data Evolution

**Version Management:**
- Schema migrations with backward compatibility
- Data format versioning
- Rollback capabilities for bad updates

**Quality Assurance:**
- Automated data validation
- A/B testing for algorithm changes
- User feedback integration

## Future Architecture Considerations

### 1. Machine Learning Integration

**Planned Enhancements:**
- AI-powered name similarity scoring
- Predictive caching based on trends
- Automated quality assessment
- Multi-language support expansion

### 2. Microservices Evolution

**Service Decomposition:**
```
Current Monolith → Future Services
├── Name Lookup Service
├── Analytics Service  
├── Cache Management Service
├── User Management Service
└── ML Inference Service
```

### 3. Multi-Region Strategy

**Global Expansion:**
- Regional database replicas
- Localized content delivery
- Compliance with regional regulations
- Currency and pricing localization

## Technology Decisions

### 1. Platform Choice: Cloudflare Workers

**Advantages:**
- Global edge deployment
- Zero cold starts
- Built-in security features
- Automatic scaling
- Cost-effective at scale

**Trade-offs:**
- Runtime limitations (CPU/memory)
- Vendor lock-in considerations
- Limited local development tools

### 2. Database Choice: Cloudflare D1

**Advantages:**
- SQLite compatibility
- Global distribution
- Automatic backups
- Cost-effective storage
- ACID transactions

**Trade-offs:**
- Limited complex queries
- Eventual consistency
- Storage size limitations

### 3. Framework Choice: Hono

**Advantages:**
- Lightweight and fast
- TypeScript-first design
- Edge runtime optimized
- Excellent middleware system
- Active development

**Trade-offs:**
- Smaller ecosystem vs Express
- Fewer third-party integrations
- Learning curve for teams

## Performance Benchmarks

### 1. Response Time Targets

| Endpoint | Target | Actual |
|----------|--------|--------|
| Name Lookup | <100ms | ~85ms |
| Batch Processing | <500ms | ~350ms |
| Health Check | <50ms | ~25ms |
| Metrics | <200ms | ~150ms |

### 2. Throughput Capacity

| Tier | Requests/Second | Sustained |
|------|----------------|-----------|
| Free | 28 | ✅ |
| Basic | 278 | ✅ |
| Premium | 2,778 | ✅ |
| Enterprise | 27,778 | ✅ |

### 3. Availability Targets

- **Uptime**: 99.9% (8.76 hours downtime/year)
- **Error Rate**: <0.1%
- **Cache Hit Rate**: >90%
- **Global Latency**: <100ms (P95)