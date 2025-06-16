# 🌙 Shenasa (شناسا) - Persian Name Gender Detection API

<div align="center">
  <img src="assets/logo.svg" alt="Shenasa - Persian Name Gender Detection API" width="400" />

  <p><em>شناسا - Persian Name Gender Detection API</em></p>
  <p><strong>Honoring Persian Heritage Through Modern Technology</strong></p>
</div>

[![Deploy Status](https://img.shields.io/badge/Deploy-Cloudflare%20Workers-orange?style=flat-square&logo=cloudflare)](https://shenasa.usestrict.dev)
[![API Version](https://img.shields.io/badge/API-v2.0.0-blue?style=flat-square)](https://shenasa.usestrict.dev/api/v1/docs)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

Shenasa (شناسا meaning "identifier" in Persian) is a comprehensive, enterprise-grade API service that determines the gender of Persian/Farsi names. Built on Cloudflare Workers with advanced features including analytics, caching, rate limiting, and batch processing.

## 🚀 Live Demo

- **API Endpoint**: https://shenasa.usestrict.dev/api/v1
- **Interactive Documentation**: https://shenasa.usestrict.dev/api/v1/docs
- **Health Check**: https://shenasa.usestrict.dev/api/v1/health

## ✨ Features

### Core Features
- **Name Gender Detection**: Accurate gender identification for Persian/Farsi names
- **English Transliteration**: Romanized versions of Persian names
- **Comprehensive Database**: 100,000+ Persian names with metadata
- **Real-time Processing**: Sub-100ms response times globally

### Enterprise Features
- **🔐 API Key Management**: Tiered access control (Free, Basic, Premium, Enterprise)
- **📊 Advanced Analytics**: Usage insights, popularity trends, and demographics
- **⚡ Intelligent Caching**: Multi-layer caching with automatic cache warming
- **🚦 Rate Limiting**: Dynamic rate limits based on subscription tier
- **📦 Batch Processing**: Process up to 100 names in a single request
- **📈 Metrics Dashboard**: Real-time system metrics and performance monitoring
- **🔍 Health Monitoring**: Comprehensive health checks and system status

### Technical Features
- **Global Edge Network**: Deployed on Cloudflare Workers for worldwide performance
- **OpenAPI Documentation**: Complete API specification with interactive docs
- **Type Safety**: Full TypeScript implementation with strict validation
- **Database Optimization**: Indexed queries with connection pooling
- **Security Headers**: Comprehensive security hardening
- **Request Logging**: Detailed request tracking for analytics

## 📊 API Tiers

| Feature | Free | Basic | Premium | Enterprise |
|---------|------|-------|---------|------------|
| Requests/hour | 100 | 1,000 | 10,000 | 100,000 |
| Basic name lookup | ✅ | ✅ | ✅ | ✅ |
| Batch processing | ❌ | ✅ | ✅ | ✅ |
| Metrics access | ❌ | ✅ | ✅ | ✅ |
| Analytics | ❌ | ❌ | ✅ | ✅ |
| Priority support | ❌ | ❌ | ✅ | ✅ |
| Custom integration | ❌ | ❌ | ❌ | ✅ |

## 🔧 Quick Start

### Basic Usage

```bash
# Simple name lookup
curl "https://shenasa.usestrict.dev/api/v1/name/محمد"

# Response
{
  "gender": "MALE",
  "enName": "mohammad"
}
```

### With API Key

```bash
curl -H "X-API-Key: your-api-key" \
     "https://shenasa.usestrict.dev/api/v1/name/فاطمه"
```

### Batch Processing

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{"names": ["علی", "زهرا", "حسین"], "includePopularity": true}' \
  "https://shenasa.usestrict.dev/api/v1/batch"
```

## 📖 API Endpoints

### Core Endpoints

#### `GET /api/v1/name/{name}`
Get gender and English name for a Persian name.

**Response:**
```json
{
  "gender": "MALE" | "FEMALE" | "UNKNOWN" | null,
  "enName": "english_transliteration" | null
}
```

#### `GET /api/v1/health`
System health check with detailed status.

#### `GET /api/v1/docs`
Interactive API documentation.

### Enterprise Endpoints

#### `POST /api/v1/batch`
Process multiple names in a single request (requires API key).

#### `GET /api/v1/metrics`
Get usage metrics and statistics (Basic+ tier).

#### `GET /api/v1/analytics`
Advanced analytics and insights (Premium+ tier).

#### `POST /api/v1/admin/api-keys`
Create new API keys (Admin access required).

## 🏠 Self-Hosting Guide

### Prerequisites

- Node.js 18+ and npm
- Cloudflare account (for Workers and D1)
- Git

### 1. Clone and Setup

```bash
git clone https://github.com/your-username/shenasa.git
cd shenasa
npm install
```

### 2. Environment Configuration

Create `.env` file:

```env
# Database
DATABASE_URL="file:./dev.db"

# Cloudflare (for migrations)
CLOUDFLARE_API_TOKEN="your-cloudflare-token"
CLOUDFLARE_ACCOUNT_ID="your-account-id"
CLOUDFLARE_DATABASE_ID="your-d1-database-id"

# Optional: Admin access
ADMIN_SECRET_KEY="your-admin-secret"
```

### 3. Database Setup

```bash
# Create Cloudflare D1 database
npx wrangler d1 create shenasa-db

# Update wrangler.jsonc with database ID
# Generate Prisma client
npm run db:generate

# Run migrations
npm run db:migrate

# Seed the database
npm run seed
```

### 4. Local Development

```bash
# Start development server
npm run dev

# API will be available at http://localhost:8787
```

### 5. Production Deployment

```bash
# Deploy to Cloudflare Workers
npm run deploy
```

### 6. Database Seeding

The project includes comprehensive dataset seeding:

```bash
# Seed database with Persian names
npm run seed
```

**Supported datasets:**
- `assets/persian-gender-by-name.csv` - Basic name-gender mapping
- `assets/iranianNamesDataset.csv` - Iranian names with gender
- `assets/names.csv` - Extended dataset with origin and popularity

## 🔧 Configuration

### Wrangler Configuration

Update `wrangler.jsonc`:

```json
{
  "name": "shenasa",
  "main": "src/index.ts",
  "compatibility_date": "2024-01-15",
  "compatibility_flags": ["nodejs_compat"],
  "observability": { "enabled": true },
  "send_metrics": true,
  "placement": { "mode": "smart" },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "shenasa-db",
      "database_id": "your-d1-database-id"
    }
  ]
}
```

### API Rate Limits

Configure rate limits in `src/utils/rate-limiter.ts`:

```typescript
export const rateLimitTiers = {
  FREE: { requests: 100, window: 3600000 },
  BASIC: { requests: 1000, window: 3600000 },
  PREMIUM: { requests: 10000, window: 3600000 },
  ENTERPRISE: { requests: 100000, window: 3600000 },
};
```

## 📊 Monitoring and Analytics

### Health Monitoring

```bash
curl "https://your-domain.com/api/v1/health"
```

### Metrics Access

```bash
curl -H "X-API-Key: your-basic-key" \
     "https://your-domain.com/api/v1/metrics"
```

### Analytics Dashboard

```bash
curl -H "X-API-Key: your-premium-key" \
     "https://your-domain.com/api/v1/analytics?startDate=2024-01-01"
```

## 🧪 Testing

```bash
# Run tests
npm test

# Run specific test
npm test -- name-lookup.test.ts
```

## 📁 Project Structure

```
shenasa/
├── src/
│   ├── index.ts              # Main application entry
│   ├── seeder.ts             # Database seeding CLI
│   ├── schema/               # Zod validation schemas
│   │   ├── metrics.ts        # Metrics & analytics schemas
│   │   └── ...
│   ├── utils/                # Utility functions
│   │   ├── cache.ts          # Caching layer
│   │   ├── metrics.ts        # Metrics collection
│   │   ├── rate-limiter.ts   # Rate limiting
│   │   ├── api-key.ts        # API key management
│   │   └── ...
│   └── exceptions/           # Custom exceptions
├── assets/                   # Dataset files
│   ├── persian-gender-by-name.csv
│   ├── iranianNamesDataset.csv
│   └── names.csv
├── prisma/
│   └── schema.prisma         # Database schema
├── docs/                     # Additional documentation
└── tests/                    # Test files
```

## 🔐 Security

### API Key Management

- API keys use CUID2 for collision resistance
- Keys are prefixed with `sk_` for identification
- Automatic usage tracking and rate limiting
- Admin endpoints require separate authentication

### Security Headers

- Content Security Policy (CSP)
- HTTP Strict Transport Security (HSTS)
- X-Frame-Options protection
- X-Content-Type-Options nosniff

### Rate Limiting

- IP-based limiting for anonymous users
- API key-based limiting for authenticated users
- Exponential backoff recommendations
- Detailed rate limit headers

## 🐛 Troubleshooting

### Common Issues

**1. Database Connection Errors**
```bash
# Verify D1 database configuration
npx wrangler d1 list

# Check database binding in wrangler.jsonc
```

**2. Seeding Failures**
```bash
# Ensure CSV files exist in assets/
ls -la assets/

# Check database permissions
npm run db:studio
```

**3. API Key Issues**
```bash
# Create admin API key
curl -X POST \
  -H "X-Admin-Key: admin-secret-key" \
  -H "Content-Type: application/json" \
  -d '{"name": "My API Key", "tier": "BASIC"}' \
  "http://localhost:8787/api/v1/admin/api-keys"
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Persian name datasets from various open sources
- Cloudflare Workers platform for edge computing
- Hono framework for lightweight web APIs
- Prisma ORM for type-safe database access

## 📞 Support

- **Documentation**: https://your-domain.com/api/v1/docs
- **Issues**: [GitHub Issues](https://github.com/your-username/shenasa/issues)
- **Email**: [Keep in touch for support](mailto:ali_4286@live.com)

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/ali-master">Ali Torki</a> for the Persian community
</p>
