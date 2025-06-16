# Development Guide

This guide covers local development setup, testing, and contribution workflows for Shenasa.

## Development Setup

### Prerequisites

- Node.js 18+ and npm
- Git
- Cloudflare account (for D1 database)
- Code editor (VS Code recommended)

### Initial Setup

1. **Clone the repository:**
```bash
git clone <repository-url>
cd shenasa
```

2. **Install dependencies:**
```bash
npm install
```

3. **Setup environment variables:**
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. **Setup local database:**
```bash
# Generate Prisma client
npm run db:generate

# Run migrations
npm run db:migrate

# Seed database with sample data
npm run seed
```

5. **Start development server:**
```bash
npm run dev
```

The API will be available at `http://localhost:8787`

## Project Structure

```
shenasa/
├── src/
│   ├── index.ts              # Main application entry point
│   ├── seeder.ts             # Database seeding utility
│   ├── schema/               # Zod validation schemas
│   │   ├── index.ts          # Schema exports
│   │   ├── metrics.ts        # Metrics/analytics schemas
│   │   ├── exception.ts      # Error response schemas
│   │   └── get-gender-by-name.ts # Name lookup schemas
│   ├── utils/                # Utility modules
│   │   ├── index.ts          # Utility exports
│   │   ├── prisma.ts         # Database client factory
│   │   ├── cache.ts          # Caching layer
│   │   ├── metrics.ts        # Metrics collection
│   │   ├── rate-limiter.ts   # Rate limiting middleware
│   │   ├── api-key.ts        # API key management
│   │   ├── unique-id.ts      # ID generation
│   │   └── secure-headers-config.ts # Security configuration
│   └── exceptions/           # Custom exception classes
│       ├── index.ts          # Exception exports
│       └── timeout.ts        # Timeout exception
├── assets/                   # Dataset files (CSV)
├── prisma/                   # Database schema and migrations
├── docs/                     # Documentation
├── tests/                    # Test files
└── Configuration files
```

## Development Workflow

### 1. Feature Development

1. **Create a feature branch:**
```bash
git checkout -b feature/name-similarity-scoring
```

2. **Make changes following the patterns:**
   - Add schemas in `src/schema/`
   - Add utilities in `src/utils/`
   - Add endpoints in `src/index.ts`
   - Add tests in `tests/`

3. **Test your changes:**
```bash
npm test
npm run dev # Manual testing
```

4. **Format and lint:**
```bash
npm run format
npm run lint
npm run check-types
```

### 2. Database Changes

1. **Modify Prisma schema:**
```prisma
// prisma/schema.prisma
model NewFeature {
  id        String   @id @default(cuid(2))
  name      String
  createdAt DateTime @default(now())
  
  @@index([name])
}
```

2. **Generate migration:**
```bash
npx prisma migrate dev --name add_new_feature
```

3. **Update seeder if needed:**
```typescript
// src/seeder.ts - add new data seeding logic
```

### 3. API Development

#### Adding New Endpoints

1. **Define schemas:**
```typescript
// src/schema/new-feature.ts
import { z } from "zod";

export const newFeatureRequestSchema = z.object({
  name: z.string().min(1).max(100),
  options: z.object({
    includeDetails: z.boolean().default(false),
  }).optional(),
});

export const newFeatureResponseSchema = z.object({
  result: z.string(),
  confidence: z.number().min(0).max(1),
  metadata: z.object({
    processingTime: z.number(),
  }),
});
```

2. **Add endpoint:**
```typescript
// src/index.ts
app.post(
  "/new-feature",
  describeRoute({
    description: "New feature endpoint",
    security: [{ ApiKeyAuth: [] }],
    responses: {
      200: {
        description: "Success",
        content: {
          "application/json": { schema: resolver(newFeatureResponseSchema) },
        },
      },
    },
  }),
  zValidator("json", newFeatureRequestSchema, (result, ctx) => {
    if (!result.success) {
      return ctx.json({
        code: 40001,
        message: result.error.errors[0].message,
      }, 400);
    }
  }),
  async (c) => {
    const { name, options } = c.req.valid("json");
    
    // Implementation logic
    const result = await processNewFeature(name, options);
    
    return c.json(result);
  },
);
```

#### Middleware Development

```typescript
// src/utils/custom-middleware.ts
export function customMiddleware(options: CustomOptions) {
  return async (c: Context, next: () => Promise<void>) => {
    // Pre-processing
    const startTime = Date.now();
    
    await next();
    
    // Post-processing
    const duration = Date.now() - startTime;
    c.header("X-Processing-Time", duration.toString());
  };
}
```

## Testing

### Unit Tests

Create test files in `tests/` directory:

```typescript
// tests/utils/cache.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { CacheManager } from '../src/utils/cache';

describe('CacheManager', () => {
  let cache: CacheManager;
  
  beforeEach(() => {
    cache = new CacheManager(mockDb, { prefix: 'test' });
  });
  
  it('should set and get values', async () => {
    await cache.set('key', 'value', 60);
    const result = await cache.get('key');
    expect(result).toBe('value');
  });
  
  it('should handle expiration', async () => {
    await cache.set('key', 'value', -1); // Already expired
    const result = await cache.get('key');
    expect(result).toBeNull();
  });
});
```

### Integration Tests

```typescript
// tests/integration/api.test.ts
import { describe, it, expect } from 'vitest';

describe('API Integration', () => {
  it('should return name gender', async () => {
    const response = await fetch('http://localhost:8787/api/v1/name/محمد');
    const data = await response.json();
    
    expect(response.status).toBe(200);
    expect(data.gender).toBe('MALE');
  });
  
  it('should handle rate limiting', async () => {
    // Make requests beyond limit
    const promises = Array(101).fill(0).map(() => 
      fetch('http://localhost:8787/api/v1/name/تست')
    );
    
    const responses = await Promise.all(promises);
    const rateLimited = responses.some(r => r.status === 429);
    
    expect(rateLimited).toBe(true);
  });
});
```

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test cache.test.ts

# Run tests in watch mode
npm test -- --watch

# Run tests with coverage
npm test -- --coverage
```

## Code Style and Standards

### TypeScript Configuration

The project uses strict TypeScript configuration:

```json
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "noImplicitReturns": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  }
}
```

### Code Formatting

```bash
# Format code
npm run format

# Check formatting
npm run format:check
```

### Linting

```bash
# Run linter
npm run lint

# Fix linting issues
npm run lint:fix
```

### Naming Conventions

- **Files**: kebab-case (`user-service.ts`)
- **Functions**: camelCase (`getUserById`)
- **Classes**: PascalCase (`UserService`) 
- **Constants**: SCREAMING_SNAKE_CASE (`API_VERSION`)
- **Types/Interfaces**: PascalCase (`UserResponse`)

### Error Handling

```typescript
// Use custom exceptions
import { HttpTimeoutException } from './exceptions';

// Consistent error responses
return c.json({
  code: 40001,
  message: "Validation failed"
}, 400);

// Async error handling
try {
  const result = await riskyOperation();
  return c.json(result);
} catch (error) {
  console.error('Operation failed:', error);
  return c.json({
    code: 50001,
    message: "Internal server error"
  }, 500);
}
```

## Performance Guidelines

### Database Queries

```typescript
// ✅ Good: Use select to limit fields
const users = await db.user.findMany({
  select: {
    id: true,
    name: true,
  },
  where: { active: true },
  take: 50,
});

// ❌ Bad: Select all fields
const users = await db.user.findMany({
  where: { active: true },
});
```

### Caching Strategy

```typescript
// ✅ Good: Cache frequently accessed data
const cached = await cache.get(`user:${id}`);
if (cached) return cached;

const user = await db.user.findUnique({ where: { id } });
await cache.set(`user:${id}`, user, 3600);
return user;

// ❌ Bad: No caching for repeated queries
const user = await db.user.findUnique({ where: { id } });
return user;
```

### Response Optimization

```typescript
// ✅ Good: Stream large responses
app.get('/export', async (c) => {
  const stream = new ReadableStream({
    start(controller) {
      // Stream data in chunks
    }
  });
  
  return new Response(stream, {
    headers: { 'Content-Type': 'application/json' }
  });
});
```

## Debugging

### Local Debugging

1. **Enable debug logging:**
```typescript
// src/index.ts
if (process.env.NODE_ENV === 'development') {
  app.use('*', async (c, next) => {
    console.log(`[${new Date().toISOString()}] ${c.req.method} ${c.req.url}`);
    await next();
  });
}
```

2. **Use Wrangler tail for real-time logs:**
```bash
npx wrangler tail
```

3. **Database debugging:**
```bash
# Open Prisma Studio
npm run db:studio

# View database directly
npx wrangler d1 execute your-db --command="SELECT * FROM PersianName LIMIT 10;"
```

### VS Code Configuration

Create `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Wrangler",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/node_modules/wrangler/bin/wrangler.js",
      "args": ["dev", "--local"],
      "console": "integratedTerminal",
      "env": {
        "NODE_ENV": "development"
      }
    }
  ]
}
```

## Contributing

### Pull Request Process

1. **Fork and clone the repository**

2. **Create a feature branch:**
```bash
git checkout -b feature/description
```

3. **Make changes following coding standards**

4. **Add tests for new functionality**

5. **Ensure all tests pass:**
```bash
npm test
npm run lint
npm run check-types
```

6. **Update documentation if needed**

7. **Submit pull request with:**
   - Clear description of changes
   - Reference to related issues
   - Screenshots for UI changes

### Commit Messages

Follow conventional commits:

```bash
feat: add name similarity scoring
fix: resolve cache invalidation issue
docs: update API documentation
test: add unit tests for metrics
refactor: simplify rate limiting logic
```

### Code Review Checklist

- [ ] Code follows project conventions
- [ ] Tests added for new functionality
- [ ] Documentation updated
- [ ] No console.log statements
- [ ] Error handling implemented
- [ ] Performance considerations addressed
- [ ] Security implications reviewed

## Common Development Tasks

### Adding a New Utility Function

1. **Create the function:**
```typescript
// src/utils/string-similarity.ts
export function calculateSimilarity(str1: string, str2: string): number {
  // Implementation
  return similarity;
}
```

2. **Export from index:**
```typescript
// src/utils/index.ts
export * from "./string-similarity";
```

3. **Add tests:**
```typescript
// tests/utils/string-similarity.test.ts
import { calculateSimilarity } from '../src/utils/string-similarity';

describe('calculateSimilarity', () => {
  it('should return 1 for identical strings', () => {
    expect(calculateSimilarity('test', 'test')).toBe(1);
  });
});
```

### Adding Database Migrations

1. **Modify schema:**
```prisma
model PersianName {
  // existing fields...
  similarNames String[] // New field
}
```

2. **Generate migration:**
```bash
npx prisma migrate dev --name add_similar_names
```

3. **Update types:**
```bash
npm run db:generate
```

### Environment-Specific Configuration

```typescript
// src/config.ts
export const config = {
  environment: process.env.NODE_ENV || 'development',
  database: {
    url: process.env.DATABASE_URL,
  },
  cache: {
    ttl: process.env.NODE_ENV === 'production' ? 3600 : 60,
  },
  rateLimit: {
    enabled: process.env.NODE_ENV === 'production',
  },
};
```