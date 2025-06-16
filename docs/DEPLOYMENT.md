# Deployment Guide

This guide covers deploying Shenasa to Cloudflare Workers and other platforms.

## Cloudflare Workers (Recommended)

### Prerequisites

- Cloudflare account
- Node.js 18+ and npm
- Wrangler CLI installed globally

### Initial Setup

1. **Install Wrangler CLI:**
```bash
npm install -g wrangler
```

2. **Authenticate with Cloudflare:**
```bash
wrangler auth
```

3. **Clone and setup project:**
```bash
git clone <repository-url>
cd shenasa
npm install
```

### Database Setup

1. **Create D1 database:**
```bash
npx wrangler d1 create shenasa-production
```

2. **Update wrangler.jsonc with database ID:**
```json
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "shenasa-production", 
      "database_id": "your-d1-database-id"
    }
  ]
}
```

3. **Run migrations:**
```bash
# Generate Prisma client
npm run db:generate

# Run migrations to D1
npx wrangler d1 migrations apply shenasa-production --remote
```

4. **Seed the database:**
```bash
# Update DATABASE_URL in .env for production seeding
DATABASE_URL="your-d1-database-url"

# Seed remote database
npm run seed
```

### Environment Variables

Set production environment variables:

```bash
# Set secrets in Cloudflare Workers
npx wrangler secret put ADMIN_SECRET_KEY
# Enter your admin secret when prompted

# For database migrations (local .env file)
CLOUDFLARE_API_TOKEN="your-cloudflare-token"
CLOUDFLARE_ACCOUNT_ID="your-account-id"  
CLOUDFLARE_DATABASE_ID="your-d1-database-id"
```

### Deploy

```bash
# Deploy to production
npm run deploy

# Deploy with specific environment
npx wrangler deploy --env production
```

### Custom Domain Setup

1. **Add custom domain in Cloudflare Dashboard:**
   - Go to Workers & Pages → Your Worker → Settings → Triggers
   - Add custom domain: `api.yourdomain.com`

2. **Update CORS origins if needed:**
```typescript
// In src/index.ts
cors({
  origin: ["https://yourdomain.com", "https://www.yourdomain.com"],
  // ... other options
})
```

### Monitoring Setup

1. **Enable analytics in wrangler.jsonc:**
```json
{
  "observability": {
    "enabled": true
  },
  "send_metrics": true
}
```

2. **Setup alerts in Cloudflare Dashboard:**
   - Workers & Pages → Your Worker → Observability
   - Configure alerts for errors, latency, etc.

## Alternative Platforms

### Docker Deployment

Create `Dockerfile`:

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 8787

CMD ["npm", "start"]
```

Build and run:

```bash
docker build -t shenasa .
docker run -p 8787:8787 -e DATABASE_URL="your-db-url" shenasa
```

### Vercel Deployment

1. **Install Vercel CLI:**
```bash
npm install -g vercel
```

2. **Create vercel.json:**
```json
{
  "builds": [
    {
      "src": "src/index.ts",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/api/v1/(.*)",
      "dest": "/src/index.ts"
    }
  ],
  "env": {
    "DATABASE_URL": "@database_url"
  }
}
```

3. **Deploy:**
```bash
vercel --prod
```

### Railway Deployment

1. **Create railway.json:**
```json
{
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "npm start",
    "healthcheckPath": "/api/v1/health"
  }
}
```

2. **Deploy via Railway CLI:**
```bash
railway login
railway init
railway up
```

## Environment-Specific Configurations

### Development

```bash
# .env.development
DATABASE_URL="file:./dev.db"
NODE_ENV="development"
LOG_LEVEL="debug"
```

### Staging

```bash
# .env.staging  
DATABASE_URL="your-staging-db-url"
NODE_ENV="staging"
ADMIN_SECRET_KEY="staging-admin-secret"
```

### Production

```bash
# .env.production
DATABASE_URL="your-production-db-url"
NODE_ENV="production"
ADMIN_SECRET_KEY="production-admin-secret"
```

## Database Migrations

### Creating Migrations

1. **Modify Prisma schema:**
```prisma
// Add new model or field
model NewModel {
  id String @id @default(cuid(2))
  // ... fields
}
```

2. **Generate migration:**
```bash
npx prisma migrate dev --name add_new_model
```

3. **Apply to production:**
```bash
npx wrangler d1 migrations apply shenasa-production --remote
```

### Rollback Strategy

```bash
# List migrations
npx wrangler d1 migrations list shenasa-production --remote

# Rollback (manual SQL)
npx wrangler d1 execute shenasa-production --remote --command="DROP TABLE NewModel;"
```

## Performance Optimization

### Caching Strategy

1. **Configure cache TTL:**
```typescript
// In src/utils/cache.ts
const cacheManager = new CacheManager(db, {
  ttl: 3600, // 1 hour for production
  prefix: "shenasa-prod"
});
```

2. **Warm cache after deployment:**
```bash
curl -X POST \
  -H "X-Admin-Key: your-admin-secret" \
  "https://your-domain.com/api/v1/admin/cache/warm"
```

### Database Optimization

1. **Index frequently queried fields:**
```prisma
model PersianName {
  name String
  // ... other fields
  
  @@index([name])           // Single field index
  @@index([name, gender])   // Composite index
}
```

2. **Monitor query performance:**
```typescript
// Add to Prisma client config
const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});
```

## Security Hardening

### API Rate Limiting

```typescript
// Configure stricter rate limits for production
export const rateLimitTiers = {
  FREE: { requests: 50, window: 3600000 },      // Reduced for production
  BASIC: { requests: 500, window: 3600000 },
  PREMIUM: { requests: 5000, window: 3600000 },
  ENTERPRISE: { requests: 50000, window: 3600000 },
};
```

### Security Headers

```typescript
// Enhanced security for production
export const secureHeadersConfig = {
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    scriptSrc: ["'self'"],
    imgSrc: ["'self'", "data:"],
  },
  strictTransportSecurity: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
};
```

### API Key Security

1. **Use strong admin secrets:**
```bash
# Generate cryptographically secure secret
openssl rand -base64 32
```

2. **Rotate API keys regularly:**
```bash
# Deactivate old keys
curl -X DELETE \
  -H "X-Admin-Key: your-admin-secret" \
  "https://your-domain.com/api/v1/admin/api-keys/old-key-id"
```

## Monitoring and Alerting

### Health Checks

```bash
# Setup external monitoring
curl "https://your-domain.com/api/v1/health"

# Expected response for healthy system:
{
  "status": "healthy",
  "checks": {
    "database": {"status": "pass"},
    "cache": {"status": "pass"},  
    "memory": {"status": "pass"}
  }
}
```

### Logging

```typescript
// Enhanced logging for production
import { logger } from "hono/logger";

app.use(logger((message, ...rest) => {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: "info",
    message,
    metadata: rest
  }));
}));
```

### Metrics Collection

```bash
# Monitor API metrics
curl -H "X-API-Key: your-monitoring-key" \
     "https://your-domain.com/api/v1/metrics"
```

## Troubleshooting

### Common Issues

1. **Database connection errors:**
```bash
# Verify D1 database exists
npx wrangler d1 list

# Check bindings
npx wrangler d1 info shenasa-production
```

2. **Migration failures:**
```bash
# Check migration status
npx wrangler d1 migrations list shenasa-production --remote

# Manual migration
npx wrangler d1 execute shenasa-production --remote --file=./migrations/001_initial.sql
```

3. **Performance issues:**
```bash
# Check worker analytics
npx wrangler tail

# Monitor cache hit rates
curl "https://your-domain.com/api/v1/metrics" | jq '.cacheHitRate'
```

### Debug Mode

Enable debug logging:

```typescript
// Add to src/index.ts for debugging
if (process.env.NODE_ENV === 'development') {
  app.use('*', async (c, next) => {
    console.log(`${c.req.method} ${c.req.url}`);
    await next();
  });
}
```

## Backup and Recovery

### Database Backup

```bash
# Export D1 database
npx wrangler d1 execute shenasa-production --remote \
  --command=".dump" > backup-$(date +%Y%m%d).sql
```

### Disaster Recovery

1. **Recreate D1 database:**
```bash
npx wrangler d1 create shenasa-recovery
```

2. **Restore from backup:**
```bash
npx wrangler d1 execute shenasa-recovery --remote --file=backup.sql
```

3. **Update worker binding:**
```json
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "shenasa-recovery",
      "database_id": "new-database-id"
    }
  ]
}
```

4. **Redeploy:**
```bash
npm run deploy
```