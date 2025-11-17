# Project Structure

This document outlines the directory structure and organization of the NW London Local Ledger project.

## Overview

The project follows a modular architecture with clear separation between frontend, backend, data processing, and infrastructure components.

## Directory Structure

```
nw-london-local-ledger/
│
├── src/                                    # Source code
│   ├── app/                               # Next.js 14 App Router
│   │   ├── (pages)/                      # Route groups
│   │   │   ├── property/                 # Property pages
│   │   │   │   └── [id]/                # Dynamic property routes
│   │   │   ├── area/                     # Area guide pages
│   │   │   │   └── [postcode]/          # Dynamic area routes
│   │   │   ├── planning/                 # Planning application pages
│   │   │   │   └── [council]/           # Council-specific routes
│   │   │   ├── news/                     # News and blog pages
│   │   │   └── search/                   # Search functionality
│   │   ├── api/                          # API routes
│   │   │   ├── property/                 # Property API endpoints
│   │   │   ├── planning/                 # Planning API endpoints
│   │   │   ├── search/                   # Search API endpoints
│   │   │   └── webhooks/                 # External webhooks
│   │   ├── layout.tsx                    # Root layout
│   │   └── page.tsx                      # Homepage
│   │
│   ├── components/                        # React components
│   │   ├── ui/                           # Base UI components
│   │   │   ├── Button/
│   │   │   ├── Card/
│   │   │   ├── Input/
│   │   │   └── Modal/
│   │   ├── property/                     # Property-specific components
│   │   │   ├── PropertyCard/
│   │   │   ├── PropertySearch/
│   │   │   ├── PriceHistory/
│   │   │   └── SimilarProperties/
│   │   ├── planning/                     # Planning-specific components
│   │   │   ├── PlanningCard/
│   │   │   ├── PlanningMap/
│   │   │   └── PlanningTimeline/
│   │   ├── area/                         # Area guide components
│   │   │   ├── AreaStats/
│   │   │   ├── SchoolList/
│   │   │   └── TransportMap/
│   │   └── layout/                       # Layout components
│   │       ├── Header/
│   │       ├── Footer/
│   │       └── Sidebar/
│   │
│   ├── lib/                              # Shared libraries and utilities
│   │   ├── db/                          # Database client and queries
│   │   │   ├── client.ts               # Database connection
│   │   │   ├── queries/                # Database queries
│   │   │   └── models/                 # Data models
│   │   ├── api/                        # External API integrations
│   │   │   ├── land-registry.ts       # Land Registry API
│   │   │   ├── councils/              # Council portal integrations
│   │   │   ├── openai.ts              # OpenAI integration
│   │   │   └── transport.ts           # TfL API
│   │   ├── cache/                      # Caching utilities
│   │   │   ├── redis.ts               # Redis client
│   │   │   └── strategies.ts          # Caching strategies
│   │   ├── search/                     # Search functionality
│   │   │   ├── elasticsearch.ts       # Elasticsearch client
│   │   │   └── indexing.ts            # Index management
│   │   └── utils/                      # Utility functions
│   │       ├── slugify.ts
│   │       ├── format.ts
│   │       └── validation.ts
│   │
│   ├── services/                         # Business logic layer
│   │   ├── property/                    # Property services
│   │   │   ├── PropertyService.ts
│   │   │   ├── PriceAnalysisService.ts
│   │   │   └── PropertySearchService.ts
│   │   ├── planning/                    # Planning services
│   │   │   ├── PlanningService.ts
│   │   │   └── PlanningSearchService.ts
│   │   ├── news/                        # News services
│   │   │   ├── NewsAggregationService.ts
│   │   │   └── AIContentService.ts
│   │   └── seo/                         # SEO services
│   │       ├── PageGenerationService.ts
│   │       ├── SchemaService.ts
│   │       └── SitemapService.ts
│   │
│   ├── scrapers/                         # Data scrapers
│   │   ├── councils/                    # Council planning scrapers
│   │   │   ├── base/                   # Base scraper class
│   │   │   ├── camden/                 # Camden scraper
│   │   │   ├── barnet/                 # Barnet scraper
│   │   │   ├── brent/                  # Brent scraper
│   │   │   ├── westminster/            # Westminster scraper
│   │   │   ├── harrow/                 # Harrow scraper
│   │   │   └── ealing/                 # Ealing scraper
│   │   ├── news/                       # News scrapers
│   │   │   ├── ham-and-high.ts
│   │   │   ├── camden-new-journal.ts
│   │   │   └── kilburn-times.ts
│   │   └── utils/                      # Scraper utilities
│   │       ├── rate-limiter.ts
│   │       ├── proxy-manager.ts
│   │       └── error-handler.ts
│   │
│   ├── ai/                              # AI and ML components
│   │   ├── content-generation/         # Content generation
│   │   │   ├── prompts/               # Prompt templates
│   │   │   ├── generators/            # Content generators
│   │   │   └── validators/            # Content validators
│   │   ├── analysis/                   # Data analysis
│   │   │   ├── price-prediction.ts
│   │   │   └── trend-analysis.ts
│   │   └── utils/                      # AI utilities
│   │       └── token-counter.ts
│   │
│   ├── workers/                         # Background workers
│   │   ├── scraper-worker.ts          # Scraping scheduler
│   │   ├── content-worker.ts          # Content generation
│   │   ├── indexing-worker.ts         # Search indexing
│   │   └── cleanup-worker.ts          # Data cleanup
│   │
│   ├── types/                          # TypeScript type definitions
│   │   ├── property.ts
│   │   ├── planning.ts
│   │   ├── area.ts
│   │   └── api.ts
│   │
│   └── styles/                         # Global styles
│       ├── globals.css
│       └── themes/
│
├── data/                                # Data and schemas
│   ├── schemas/                        # Database schemas
│   │   ├── property.sql
│   │   ├── planning.sql
│   │   └── news.sql
│   ├── migrations/                     # Database migrations
│   │   ├── 001_initial_schema.sql
│   │   ├── 002_add_planning_tables.sql
│   │   └── 003_add_news_tables.sql
│   ├── seeds/                          # Seed data
│   │   ├── areas.json
│   │   ├── postcodes.json
│   │   └── schools.json
│   └── fixtures/                       # Test fixtures
│       └── sample_data.json
│
├── scripts/                            # Utility scripts
│   ├── setup/                         # Setup scripts
│   │   ├── init-db.sh
│   │   └── create-indexes.sh
│   ├── data-processing/               # Data processing
│   │   ├── import-land-registry.py
│   │   ├── geocode-addresses.py
│   │   └── generate-postcodes.py
│   ├── seo/                           # SEO scripts
│   │   ├── generate-sitemap.ts
│   │   ├── generate-pages.ts
│   │   └── update-schema.ts
│   └── maintenance/                   # Maintenance scripts
│       ├── cleanup-old-data.sh
│       └── backup-db.sh
│
├── tests/                              # Test files
│   ├── unit/                          # Unit tests
│   │   ├── services/
│   │   ├── utils/
│   │   └── components/
│   ├── integration/                   # Integration tests
│   │   ├── api/
│   │   ├── scrapers/
│   │   └── database/
│   ├── e2e/                           # End-to-end tests
│   │   ├── property-search.spec.ts
│   │   ├── area-guide.spec.ts
│   │   └── planning-search.spec.ts
│   └── fixtures/                      # Test fixtures
│
├── docs/                               # Documentation
│   ├── api/                           # API documentation
│   │   ├── property-endpoints.md
│   │   ├── planning-endpoints.md
│   │   └── search-endpoints.md
│   ├── architecture/                  # Architecture docs
│   │   ├── data-flow.md
│   │   ├── caching-strategy.md
│   │   └── deployment.md
│   ├── guides/                        # User guides
│   │   ├── development-setup.md
│   │   ├── adding-scrapers.md
│   │   └── content-generation.md
│   └── diagrams/                      # Architecture diagrams
│       └── system-overview.png
│
├── infrastructure/                     # Infrastructure as Code
│   ├── docker/                        # Docker configuration
│   │   ├── Dockerfile
│   │   ├── docker-compose.yml
│   │   └── docker-compose.prod.yml
│   ├── terraform/                     # Terraform configs
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── modules/
│   ├── kubernetes/                    # Kubernetes configs
│   │   ├── deployment.yaml
│   │   ├── service.yaml
│   │   └── ingress.yaml
│   └── monitoring/                    # Monitoring configs
│       ├── prometheus.yml
│       └── grafana-dashboards/
│
├── public/                            # Static assets
│   ├── images/                       # Images
│   │   ├── areas/
│   │   ├── logos/
│   │   └── social/
│   ├── fonts/                        # Custom fonts
│   └── icons/                        # Icons and favicons
│
├── config/                            # Configuration files
│   ├── environment/                  # Environment configs
│   │   ├── development.ts
│   │   ├── staging.ts
│   │   └── production.ts
│   ├── seo/                          # SEO configuration
│   │   ├── meta-templates.ts
│   │   └── schema-templates.ts
│   └── scrapers/                     # Scraper configs
│       └── council-configs.json
│
├── .github/                           # GitHub configuration
│   ├── workflows/                    # GitHub Actions
│   │   ├── ci.yml
│   │   ├── deploy.yml
│   │   └── scraper-schedule.yml
│   ├── ISSUE_TEMPLATE/
│   └── PULL_REQUEST_TEMPLATE.md
│
├── .vscode/                          # VS Code configuration
│   ├── settings.json
│   ├── extensions.json
│   └── launch.json
│
├── DESIGN_DOCUMENT.md                # Design documentation
├── TECHNICAL_ARCHITECTURE.md         # Technical specs
├── DATABASE_SCHEMA.md                # Database design
├── API_INTEGRATION_PLAN.md           # API integration docs
├── IMPLEMENTATION_ROADMAP.md         # Implementation plan
├── SEO_STRATEGY.md                   # SEO strategy
├── CONTRIBUTING.md                   # Contribution guidelines
├── README.md                         # Project overview
├── LICENSE                           # License file
├── .gitignore                        # Git ignore rules
├── .eslintrc.json                    # ESLint configuration
├── .prettierrc                       # Prettier configuration
├── tsconfig.json                     # TypeScript configuration
├── next.config.js                    # Next.js configuration
├── tailwind.config.js                # Tailwind CSS config
├── postcss.config.js                 # PostCSS configuration
├── jest.config.js                    # Jest configuration
├── package.json                      # Node dependencies
└── package-lock.json                 # Locked dependencies
```

## Key Directory Purposes

### `/src`

The main source code directory containing all application logic.

- **`/app`**: Next.js 14 App Router structure with pages and API routes
- **`/components`**: Reusable React components organized by domain
- **`/lib`**: Core libraries, database clients, and external API integrations
- **`/services`**: Business logic layer abstracting complex operations
- **`/scrapers`**: Data collection modules for councils and news sources
- **`/ai`**: AI-powered content generation and analysis
- **`/workers`**: Background job processors
- **`/types`**: TypeScript type definitions
- **`/styles`**: Global CSS and theme configuration

### `/data`

Database schemas, migrations, and seed data.

- **`/schemas`**: SQL schema definitions
- **`/migrations`**: Versioned database migrations
- **`/seeds`**: Initial data for development
- **`/fixtures`**: Test data

### `/scripts`

Utility and maintenance scripts.

- **`/setup`**: Initial setup and configuration
- **`/data-processing`**: ETL and data transformation
- **`/seo`**: SEO-related automation
- **`/maintenance`**: Backup and cleanup routines

### `/tests`

Comprehensive test suite.

- **`/unit`**: Isolated unit tests
- **`/integration`**: Integration tests
- **`/e2e`**: End-to-end browser tests

### `/docs`

Project documentation.

- **`/api`**: API endpoint documentation
- **`/architecture`**: System design docs
- **`/guides`**: Development guides

### `/infrastructure`

Infrastructure as Code and deployment configuration.

- **`/docker`**: Container definitions
- **`/terraform`**: Cloud infrastructure
- **`/kubernetes`**: Orchestration configs
- **`/monitoring`**: Observability setup

### `/public`

Static assets served directly.

- **`/images`**: Static images
- **`/fonts`**: Custom fonts
- **`/icons`**: Favicons and app icons

### `/config`

Application configuration files.

- **`/environment`**: Environment-specific configs
- **`/seo`**: SEO templates and settings
- **`/scrapers`**: Scraper configuration

## File Naming Conventions

- **Components**: PascalCase (`PropertyCard.tsx`)
- **Utilities**: camelCase (`slugify.ts`)
- **Services**: PascalCase with Service suffix (`PropertyService.ts`)
- **Types**: PascalCase (`property.ts` containing `Property` type)
- **Constants**: UPPER_SNAKE_CASE (`API_KEYS.ts`)
- **Tests**: Same as source file with `.test.ts` or `.spec.ts` suffix

## Module Organization

### Feature-Based Organization

Components and services are organized by feature/domain:

```
src/
├── components/
│   ├── property/       # All property-related components
│   ├── planning/       # All planning-related components
│   └── area/           # All area-related components
```

This makes it easy to:
- Find related functionality
- Understand feature boundaries
- Enable code splitting
- Facilitate team collaboration

### Layer Separation

The architecture follows clear separation:

```
Presentation Layer (Components)
        ↓
Business Logic Layer (Services)
        ↓
Data Access Layer (Database/API)
        ↓
External Systems (APIs, Scrapers)
```

## Import Structure

Use absolute imports with path aliases:

```typescript
// tsconfig.json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"],
      "@/components/*": ["./src/components/*"],
      "@/lib/*": ["./src/lib/*"],
      "@/services/*": ["./src/services/*"],
      "@/types/*": ["./src/types/*"]
    }
  }
}
```

Example usage:

```typescript
import { PropertyCard } from '@/components/property/PropertyCard';
import { PropertyService } from '@/services/property/PropertyService';
import { Property } from '@/types/property';
```

## Environment Files

```
.env                    # Local development (git-ignored)
.env.example           # Template for required variables
.env.development       # Development defaults
.env.staging           # Staging environment
.env.production        # Production (secret, git-ignored)
```

## Build Output

```
.next/                 # Next.js build output (git-ignored)
dist/                  # Production build (git-ignored)
coverage/              # Test coverage reports (git-ignored)
```

## Asset Organization

### Images

```
public/images/
├── areas/             # Area-specific images
│   ├── nw1/
│   ├── nw3/
│   └── nw6/
├── logos/             # Brand logos
├── social/            # Social media images
└── ui/                # UI elements
```

### Fonts

```
public/fonts/
├── inter/             # Inter font family
└── merriweather/      # Merriweather font family
```

## Data Flow

```
External Data → Scrapers → Database → Services → API → Frontend
                              ↓
                         Search Index
                              ↓
                         Cache Layer
```

## Deployment Structure

```
Production Environment
├── Web Application (Vercel/AWS)
├── Database (AWS RDS PostgreSQL)
├── Cache (AWS ElastiCache Redis)
├── Search (AWS Elasticsearch)
├── Workers (AWS Lambda)
└── CDN (CloudFront)
```

---

This structure is designed to scale from initial development through to production deployment while maintaining clean separation of concerns and ease of navigation.
