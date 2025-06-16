# Database Migration Guide

## Overview

Shenasa uses Prisma ORM with Cloudflare D1 database for data persistence. This guide covers database migrations for both development and production environments using our custom migration script.

## Migration Script

We provide a comprehensive shell script (`scripts/migrate.sh`) that handles all database operations with a developer-friendly interface.

### Prerequisites

Before using the migration script, ensure you have:

- **Node.js** and **npm** installed
- **Wrangler CLI** installed globally: `npm install -g wrangler`
- **Environment variables** configured (see Environment Setup)
- **Database created** in Cloudflare D1 (for production)

### Environment Setup

#### Development Environment

Create a `.env` file in the project root:

```bash
# Development Database (Local SQLite)
DATABASE_URL="file:./prisma/dev.db"

# Optional: Admin secret for API key management
ADMIN_SECRET_KEY="your-admin-secret-key"
```

#### Production Environment

For production migrations, you need Cloudflare credentials:

```bash
# Production Database (Cloudflare D1)
DATABASE_URL="file:./prisma/dev.db"  # Keep for local dev

# Cloudflare Credentials (Required for production migrations)
CLOUDFLARE_ACCOUNT_ID="your-cloudflare-account-id"
CLOUDFLARE_DATABASE_ID="your-d1-database-id"
CLOUDFLARE_D1_TOKEN="your-cloudflare-d1-token"  # Optional if wrangler is authenticated

# Admin secret for API key management
ADMIN_SECRET_KEY="your-production-admin-secret-key"
```

## Using the Migration Script

### Basic Commands

```bash
# Show help and available commands
./scripts/migrate.sh help

# Run development migrations
./scripts/migrate.sh dev

# Run production migrations
./scripts/migrate.sh prod

# Reset development database (destructive)
./scripts/migrate.sh reset

# Seed database with initial data
./scripts/migrate.sh seed dev
./scripts/migrate.sh seed prod

# Check migration status
./scripts/migrate.sh status

# Create a new migration
./scripts/migrate.sh create add_new_feature

# Open Prisma Studio for database inspection
./scripts/migrate.sh studio

# Cloudflare D1 specific commands
./scripts/migrate.sh d1-info                    # Show D1 database information
./scripts/migrate.sh d1-backup                  # Create D1 database backup
./scripts/migrate.sh d1-exec "SELECT COUNT(*) FROM PersianName;"  # Execute raw SQL
```

### Advanced Usage

```bash
# Run development migration with custom name
./scripts/migrate.sh dev --name "add_user_preferences"

# Use custom environment file
./scripts/migrate.sh dev --env .env.staging

# Create migration without applying
./scripts/migrate.sh create new_indexes --name "add_performance_indexes"
```

## Development Workflow

### 1. Making Schema Changes

1. Edit `prisma/schema.prisma` to add/modify models
2. Create a new migration:
   ```bash
   ./scripts/migrate.sh create "describe_your_changes"
   ```
3. Review the generated migration file in `prisma/migrations/`
4. Apply the migration:
   ```bash
   ./scripts/migrate.sh dev
   ```

### 2. Seeding Development Data

After migrations, populate your database:

```bash
# Seed with CSV data from assets/
./scripts/migrate.sh seed dev
```

### 3. Resetting Development Database

When you need a fresh start:

```bash
# ⚠️ This will delete all data!
./scripts/migrate.sh reset
```

## Production Deployment

### 1. Pre-deployment Testing

Always test migrations locally first:

```bash
# Create a backup of your current dev database
cp prisma/dev.db prisma/dev.db.backup

# Test the migration
./scripts/migrate.sh dev

# Verify everything works as expected
npm run dev
```

### 2. Production Migration

Deploy migrations to production Cloudflare D1:

```bash
# ⚠️ This modifies production Cloudflare D1 database!
./scripts/migrate.sh prod
```

The script will:
- Validate all required Cloudflare credentials
- Show a confirmation prompt
- Generate migration SQL from Prisma schema
- Apply migrations using `wrangler d1 execute`
- Generate updated Prisma client

**Note**: Production migrations use a different approach than development:
- Generates SQL from schema using `prisma migrate diff`
- Applies SQL directly to D1 using `wrangler d1 execute`
- Compatible with Cloudflare D1's SQLite implementation

### 3. Production Seeding (if needed)

```bash
# ⚠️ Only run if you need to add initial data to production
./scripts/migrate.sh seed prod
```

## Migration Script Features

### 🎨 Beautiful Output
- Color-coded log levels with emojis
- Clear progress indicators
- Formatted error messages
- Readable status reports

### 🔒 Safety Features
- Environment validation before operations
- Confirmation prompts for destructive operations
- Automatic database backups (development)
- Dependency checking

### 📊 Comprehensive Logging
- Operation tracking with timestamps
- Context-aware error reporting
- Performance metrics
- Database operation logging

### 🚀 Developer Experience
- Interactive prompts for migration names
- Detailed help documentation
- Environment-specific configurations
- Batch operations support

### ☁️ Cloudflare D1 Integration
- Native D1 database support
- Automatic SQL generation from Prisma schema
- D1-specific backup and restore functions
- Raw SQL execution on D1 databases
- Local and remote D1 database access

## Troubleshooting

### Common Issues

#### 1. "npx is not installed"
```bash
# Install Node.js and npm
# Then verify installation
node --version
npm --version
```

#### 2. "wrangler is not installed"
```bash
# Install Wrangler globally
npm install -g wrangler

# Verify installation
wrangler --version
```

#### 3. "Missing Cloudflare credentials"
Ensure all required environment variables are set:
- `CLOUDFLARE_ACCOUNT_ID`: Your Cloudflare account ID
- `CLOUDFLARE_DATABASE_ID`: Your D1 database ID
- `CLOUDFLARE_D1_TOKEN`: Your Cloudflare D1 token (optional if wrangler is authenticated)

You can authenticate with wrangler instead of using a token:
```bash
wrangler auth login
```

#### 4. "Migration failed"
- Check the migration file for syntax errors
- Verify database connectivity
- Review Prisma schema for conflicts
- Check the logs for specific error details

### Getting Help

If you encounter issues:

1. **Check the logs**: Migration script provides detailed error information
2. **Verify environment**: Ensure all required variables are set correctly
3. **Test locally**: Always test migrations in development first
4. **Review schema**: Check for Prisma schema validation errors

### Migration Status

Check current migration status:

```bash
./scripts/migrate.sh status
```

This will show:
- Applied migrations
- Pending migrations
- Database schema information
- Connection status

## Database Schema Overview

Our Prisma schema includes these main models:

- **PersianName**: Core name data with gender information
- **RequestLog**: API request tracking for analytics
- **ApiKey**: API key management with tier-based access
- **SystemMetrics**: Aggregated system metrics
- **CacheEntry**: Persistent cache storage
- **Webhook**: Webhook configuration and logs
- **AuditLog**: Security and operation auditing
- **GeographicStats**: Geographic usage analytics

## Best Practices

### Development
- Always backup before major schema changes
- Test migrations thoroughly in development
- Use descriptive migration names
- Review generated SQL before applying

### Production
- Schedule migrations during low-traffic periods
- Have rollback plan ready
- Monitor application after deployment
- Keep migration history clean and documented

### Schema Design
- Use appropriate indexes for query performance
- Consider data migration needs for schema changes
- Document complex relationships
- Plan for future scalability needs

## Continuous Integration

For CI/CD pipelines, you can run migrations programmatically:

```bash
# In your CI script
export DATABASE_URL="your-ci-database-url"
./scripts/migrate.sh dev --name "ci_migration_$(date +%s)"
```

This ensures your CI environment stays in sync with your latest schema changes.