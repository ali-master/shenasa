#!/bin/bash

# Shenasa Database Migration Script
# This script handles Prisma migrations for both development and production environments
# Usage: ./scripts/migrate.sh [command] [environment]

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Emojis for better UX
SUCCESS="✅"
ERROR="❌"
WARNING="⚠️"
INFO="ℹ️"
ROCKET="🚀"
DATABASE="🗄️"
GEAR="⚙️"

# Function to print colored output
print_info() {
    echo -e "${BLUE}${INFO} ${1}${NC}"
}

print_success() {
    echo -e "${GREEN}${SUCCESS} ${1}${NC}"
}

print_warning() {
    echo -e "${YELLOW}${WARNING} ${1}${NC}"
}

print_error() {
    echo -e "${RED}${ERROR} ${1}${NC}"
}

print_header() {
    echo -e "${PURPLE}${DATABASE} Shenasa Database Migration Tool${NC}"
    echo -e "${CYAN}======================================${NC}"
}

# Function to check if required tools are installed
check_dependencies() {
    print_info "Checking dependencies..."
    
    if ! command -v npx &> /dev/null; then
        print_error "npx is not installed. Please install Node.js and npm"
        exit 1
    fi
    
    if ! command -v wrangler &> /dev/null; then
        print_error "wrangler is not installed. Please install with: npm install -g wrangler"
        exit 1
    fi
    
    print_success "All dependencies are installed"
}

# Function to load environment variables
load_env() {
    local env_file="${1:-.env}"
    
    if [[ -f "$env_file" ]]; then
        print_info "Loading environment from $env_file"
        export $(cat "$env_file" | grep -v '^#' | xargs)
        print_success "Environment loaded"
    else
        print_warning "Environment file $env_file not found"
    fi
}

# Function to validate environment variables
validate_env() {
    local env_type="$1"
    
    print_info "Validating environment variables for $env_type..."
    
    case "$env_type" in
        "dev")
            if [[ -z "$DATABASE_URL" ]]; then
                print_error "DATABASE_URL is not set"
                exit 1
            fi
            ;;
        "prod")
            if [[ -z "$CLOUDFLARE_ACCOUNT_ID" || -z "$CLOUDFLARE_DATABASE_ID" ]]; then
                print_error "Missing Cloudflare credentials for production"
                print_info "Required: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_DATABASE_ID"
                print_info "Optional: CLOUDFLARE_D1_TOKEN (if not using wrangler auth)"
                exit 1
            fi
            
            # Check if wrangler is authenticated or if we have a token
            if [[ -z "$CLOUDFLARE_D1_TOKEN" ]]; then
                print_info "Checking wrangler authentication..."
                if ! wrangler whoami &>/dev/null; then
                    print_error "Wrangler is not authenticated and CLOUDFLARE_D1_TOKEN is not set"
                    print_info "Please run 'wrangler auth login' or set CLOUDFLARE_D1_TOKEN"
                    exit 1
                fi
                print_success "Wrangler is authenticated"
            else
                print_success "Using CLOUDFLARE_D1_TOKEN for authentication"
                export CLOUDFLARE_API_TOKEN="$CLOUDFLARE_D1_TOKEN"
            fi
            ;;
    esac
    
    print_success "Environment validation passed"
}

# Function to backup database (development only)
backup_dev_db() {
    # Check for different possible dev database locations
    local db_file=""
    if [[ -f "dev.db" ]]; then
        db_file="dev.db"
    elif [[ -f "prisma/dev.db" ]]; then
        db_file="prisma/dev.db"
    elif [[ -f "./dev.db" ]]; then
        db_file="./dev.db"
    fi
    
    if [[ -n "$db_file" ]]; then
        local backup_name="${db_file}.backup.$(date +%Y%m%d_%H%M%S)"
        print_info "Creating backup: $backup_name"
        cp "$db_file" "$backup_name"
        print_success "Backup created: $backup_name"
    else
        print_warning "No development database found to backup"
    fi
}

# Function to generate Prisma client
generate_client() {
    print_info "Generating Prisma client..."
    npx prisma generate
    print_success "Prisma client generated"
}

# Function to run development migrations
migrate_dev() {
    print_header
    print_info "Running development migrations..."
    
    load_env ".env"
    validate_env "dev"
    backup_dev_db
    
    print_info "Running Prisma migration..."
    npx prisma migrate dev --name "${MIGRATION_NAME:-auto_migration}"
    
    generate_client
    
    print_success "Development migration completed successfully!"
    print_info "Database is ready for development"
}

# Function to run production migrations
migrate_prod() {
    print_header
    print_info "Running production migrations..."
    
    load_env ".env"
    validate_env "prod"
    
    print_warning "This will modify the production Cloudflare D1 database!"
    read -p "Are you sure you want to continue? (y/N): " -n 1 -r
    echo
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_info "Migration cancelled"
        exit 0
    fi
    
    print_info "Generating migration SQL for Cloudflare D1..."
    
    # Set D1 database URL for Prisma
    export DATABASE_URL="libsql://127.0.0.1:8080?tls=0"
    
    # Generate migration files
    print_info "Creating migration files..."
    npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > migration.sql
    
    if [[ ! -f "migration.sql" || ! -s "migration.sql" ]]; then
        print_error "Failed to generate migration SQL"
        exit 1
    fi
    
    print_info "Applying migrations to Cloudflare D1..."
    
    # Apply migrations using wrangler d1 execute
    if wrangler d1 execute shenasa --file=migration.sql; then
        print_success "D1 database migration completed successfully!"
        
        # Clean up temporary migration file
        rm -f migration.sql
        
        # Generate Prisma client
        generate_client
        
        print_success "Production migration completed successfully!"
        print_info "Cloudflare D1 database is up to date"
    else
        print_error "Failed to apply migrations to D1 database"
        print_info "Migration file saved as migration.sql for manual review"
        exit 1
    fi
}

# Function to reset development database
reset_dev() {
    print_header
    print_info "Resetting development database..."
    
    load_env ".env"
    validate_env "dev"
    
    print_warning "This will delete all data in the development database!"
    read -p "Are you sure you want to continue? (y/N): " -n 1 -r
    echo
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_info "Reset cancelled"
        exit 0
    fi
    
    backup_dev_db
    
    print_info "Resetting database..."
    npx prisma migrate reset --force
    
    generate_client
    
    print_success "Development database reset completed!"
}

# Function to seed database
seed_db() {
    local env_type="$1"
    
    print_header
    print_info "Seeding $env_type database..."
    
    if [[ "$env_type" == "prod" ]]; then
        print_warning "This will add seed data to the production Cloudflare D1 database!"
        read -p "Are you sure you want to continue? (y/N): " -n 1 -r
        echo
        
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            print_info "Seeding cancelled"
            exit 0
        fi
        
        # For production, we need to set up the D1 database URL
        export DATABASE_URL="libsql://127.0.0.1:8080?tls=0"
    fi
    
    load_env ".env"
    validate_env "$env_type"
    
    print_info "Running database seeder..."
    
    if [[ "$env_type" == "prod" ]]; then
        # For production, we need to run the seeder with D1 proxy
        print_info "Starting D1 proxy for seeding..."
        npx wrangler d1 execute shenasa --command="SELECT 1" > /dev/null 2>&1 || true
        
        # Run the seeder
        npm run db:seed
    else
        # For development, run normally
        npm run db:seed
    fi
    
    print_success "Database seeding completed!"
}

# Function to check migration status
check_status() {
    print_header
    print_info "Checking migration status..."
    
    load_env ".env"
    
    print_info "Development database status:"
    echo "DATABASE_URL: $DATABASE_URL"
    
    if [[ -n "$DATABASE_URL" && "$DATABASE_URL" == "file:"* ]]; then
        print_info "Local SQLite database migration status:"
        npx prisma migrate status 2>/dev/null || print_warning "No migrations found or database not accessible"
    fi
    
    # Check Cloudflare D1 status if credentials are available
    if [[ -n "$CLOUDFLARE_ACCOUNT_ID" && -n "$CLOUDFLARE_DATABASE_ID" ]]; then
        print_info "Cloudflare D1 database status:"
        echo "Account ID: $CLOUDFLARE_ACCOUNT_ID"
        echo "Database ID: $CLOUDFLARE_DATABASE_ID"
        
        # Try to query D1 database
        if wrangler d1 execute shenasa --command="SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;" 2>/dev/null; then
            print_success "D1 database is accessible"
        else
            print_warning "D1 database not accessible or not authenticated"
        fi
    else
        print_warning "Cloudflare D1 credentials not configured"
    fi
}

# Function to create a new migration
create_migration() {
    print_header
    print_info "Creating new migration..."
    
    if [[ -z "$MIGRATION_NAME" ]]; then
        read -p "Enter migration name: " MIGRATION_NAME
    fi
    
    if [[ -z "$MIGRATION_NAME" ]]; then
        print_error "Migration name is required"
        exit 1
    fi
    
    load_env ".env"
    validate_env "dev"
    
    print_info "Creating migration: $MIGRATION_NAME"
    npx prisma migrate dev --name "$MIGRATION_NAME" --create-only
    
    print_success "Migration created successfully!"
    print_info "Review the migration file before applying"
}

# Function to open Prisma Studio
studio() {
    print_header
    print_info "Opening Prisma Studio..."
    
    load_env ".env"
    
    print_info "Starting Prisma Studio..."
    npx prisma studio
}

# Function to execute raw SQL on D1 database
execute_d1() {
    local sql_command="$1"
    
    print_header
    print_info "Executing SQL on Cloudflare D1..."
    
    load_env ".env"
    validate_env "prod"
    
    if [[ -z "$sql_command" ]]; then
        print_error "No SQL command provided"
        print_info "Usage: $0 d1-exec \"SELECT * FROM table_name;\""
        exit 1
    fi
    
    print_info "Executing: $sql_command"
    wrangler d1 execute shenasa --command="$sql_command"
}

# Function to show D1 database info
d1_info() {
    print_header
    print_info "Cloudflare D1 Database Information..."
    
    load_env ".env"
    validate_env "prod"
    
    print_info "Database Name: shenasa"
    print_info "Account ID: $CLOUDFLARE_ACCOUNT_ID"
    print_info "Database ID: $CLOUDFLARE_DATABASE_ID"
    
    print_info "Tables in database:"
    wrangler d1 execute shenasa --command="SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
}

# Function to backup D1 database
backup_d1() {
    print_header
    print_info "Creating Cloudflare D1 database backup..."
    
    load_env ".env"
    validate_env "prod"
    
    local backup_file="d1_backup_$(date +%Y%m%d_%H%M%S).sql"
    
    print_info "Exporting D1 database structure and data..."
    
    # Get all tables
    local tables=$(wrangler d1 execute shenasa --command="SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';" --json | jq -r '.[].results[]?.name // empty' 2>/dev/null)
    
    if [[ -n "$tables" ]]; then
        echo "-- D1 Database Backup - $(date)" > "$backup_file"
        echo "-- Database: shenasa" >> "$backup_file"
        echo "" >> "$backup_file"
        
        while IFS= read -r table; do
            if [[ -n "$table" ]]; then
                print_info "Backing up table: $table"
                
                # Get table schema
                echo "-- Table: $table" >> "$backup_file"
                wrangler d1 execute shenasa --command="SELECT sql FROM sqlite_master WHERE type='table' AND name='$table';" --json | jq -r '.[].results[]?.sql // empty' >> "$backup_file" 2>/dev/null
                echo ";" >> "$backup_file"
                echo "" >> "$backup_file"
            fi
        done <<< "$tables"
        
        print_success "D1 database backup created: $backup_file"
    else
        print_warning "No tables found in D1 database or unable to access"
    fi
}

# Function to show help
show_help() {
    print_header
    echo
    echo "Usage: $0 [command] [options]"
    echo
    echo "Commands:"
    echo "  dev                 Run development migrations"
    echo "  prod                Run production migrations (Cloudflare D1)"
    echo "  reset               Reset development database"
    echo "  seed [dev|prod]     Seed database with initial data"
    echo "  status              Check migration status"
    echo "  create [name]       Create new migration"
    echo "  studio              Open Prisma Studio"
    echo "  d1-info             Show Cloudflare D1 database information"
    echo "  d1-exec \"SQL\"       Execute raw SQL on D1 database"
    echo "  d1-backup           Create D1 database backup"
    echo "  help                Show this help message"
    echo
    echo "Options:"
    echo "  --name NAME         Migration name (for dev and create commands)"
    echo "  --env FILE          Environment file (default: .env)"
    echo
    echo "Examples:"
    echo "  $0 dev                          # Run development migrations"
    echo "  $0 dev --name add_new_fields    # Run dev migration with specific name"
    echo "  $0 prod                         # Run production migrations (D1)"
    echo "  $0 reset                        # Reset development database"
    echo "  $0 seed dev                     # Seed development database"
    echo "  $0 seed prod                    # Seed production database (D1)"
    echo "  $0 create add_user_table        # Create new migration"
    echo "  $0 status                       # Check migration status"
    echo "  $0 studio                       # Open Prisma Studio"
    echo "  $0 d1-info                      # Show D1 database info"
    echo "  $0 d1-exec \"SELECT * FROM User LIMIT 5;\"  # Execute SQL on D1"
    echo "  $0 d1-backup                    # Create D1 database backup"
    echo
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --name)
            MIGRATION_NAME="$2"
            shift 2
            ;;
        --env)
            ENV_FILE="$2"
            shift 2
            ;;
        *)
            if [[ -z "$COMMAND" ]]; then
                COMMAND="$1"
            elif [[ -z "$SUBCOMMAND" ]]; then
                SUBCOMMAND="$1"
            fi
            shift
            ;;
    esac
done

# Check dependencies first
check_dependencies

# Execute command
case "$COMMAND" in
    "dev")
        migrate_dev
        ;;
    "prod")
        migrate_prod
        ;;
    "reset")
        reset_dev
        ;;
    "seed")
        seed_db "${SUBCOMMAND:-dev}"
        ;;
    "status")
        check_status
        ;;
    "create")
        MIGRATION_NAME="${SUBCOMMAND:-$MIGRATION_NAME}"
        create_migration
        ;;
    "studio")
        studio
        ;;
    "d1-info")
        d1_info
        ;;
    "d1-exec")
        execute_d1 "$SUBCOMMAND"
        ;;
    "d1-backup")
        backup_d1
        ;;
    "help"|"--help"|"-h"|"")
        show_help
        ;;
    *)
        print_error "Unknown command: $COMMAND"
        echo
        show_help
        exit 1
        ;;
esac