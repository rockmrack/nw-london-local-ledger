# Contributing to NW London Local Ledger

Thank you for your interest in contributing to the NW London Local Ledger! This document provides guidelines and instructions for contributing to the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Testing Requirements](#testing-requirements)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)

## Code of Conduct

This project adheres to professional development standards. We expect all contributors to:

- Write clean, maintainable, and well-documented code
- Follow established coding conventions
- Respect the project's architecture and design decisions
- Maintain confidentiality regarding sensitive data and API keys

## Getting Started

### Prerequisites

Before contributing, ensure you have:

- Node.js 18+ and npm/yarn
- PostgreSQL 14+
- Redis
- Python 3.9+ (for data processing scripts)
- Git

### Setting Up Development Environment

```bash
# Clone the repository
git clone https://github.com/yourusername/nw-london-local-ledger.git
cd nw-london-local-ledger

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Configure your .env file with required credentials
# (See README.md for required environment variables)

# Run database migrations
npm run db:migrate

# Seed development data
npm run db:seed

# Start development server
npm run dev
```

## Development Workflow

### Branch Strategy

We use a feature branch workflow:

```
main (production-ready code)
  ├── develop (integration branch)
  │   ├── feature/property-search
  │   ├── feature/ai-news-generation
  │   └── bugfix/planning-scraper
```

### Creating a New Branch

```bash
# For new features
git checkout -b feature/your-feature-name

# For bug fixes
git checkout -b bugfix/issue-description

# For performance improvements
git checkout -b perf/optimization-description
```

### Branch Naming Conventions

- `feature/` - New features
- `bugfix/` - Bug fixes
- `hotfix/` - Urgent production fixes
- `perf/` - Performance improvements
- `refactor/` - Code refactoring
- `docs/` - Documentation updates
- `test/` - Test additions or modifications

## Coding Standards

### TypeScript/JavaScript

- Use TypeScript for all new code
- Follow ESLint and Prettier configurations
- Use functional programming patterns where appropriate
- Prefer const over let, avoid var
- Use async/await over Promise chains

```typescript
// Good
const fetchPropertyData = async (propertyId: string): Promise<Property> => {
  const data = await db.property.findUnique({ where: { id: propertyId } });
  return data;
};

// Avoid
function fetchPropertyData(propertyId) {
  return new Promise((resolve, reject) => {
    db.property.findUnique({ where: { id: propertyId } })
      .then(data => resolve(data))
      .catch(err => reject(err));
  });
}
```

### Python

- Follow PEP 8 style guide
- Use type hints for function signatures
- Document functions with docstrings
- Use virtual environments

```python
# Good
def scrape_planning_applications(council: str, start_date: datetime) -> List[PlanningApplication]:
    """
    Scrape planning applications from a council's planning portal.

    Args:
        council: Council name (e.g., 'Camden', 'Barnet')
        start_date: Start date for scraping

    Returns:
        List of PlanningApplication objects
    """
    applications = []
    # Implementation
    return applications
```

### Component Structure

- Use functional components with hooks
- Keep components small and focused
- Separate business logic from presentation

```typescript
// components/PropertyCard/index.ts
export { PropertyCard } from './PropertyCard';
export type { PropertyCardProps } from './types';

// components/PropertyCard/PropertyCard.tsx
import { PropertyCardProps } from './types';

export const PropertyCard: React.FC<PropertyCardProps> = ({ property }) => {
  // Component logic
};
```

## Testing Requirements

### Unit Tests

- Write unit tests for all new functions
- Aim for >80% code coverage
- Use Jest for JavaScript/TypeScript tests
- Use pytest for Python tests

```typescript
// __tests__/utils/slugify.test.ts
import { slugify } from '@/utils/slugify';

describe('slugify', () => {
  it('should convert string to lowercase slug', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('should handle special characters', () => {
    expect(slugify('123 Main St, NW3')).toBe('123-main-st-nw3');
  });
});
```

### Integration Tests

- Test API endpoints
- Test database interactions
- Test scraper functionality

```typescript
// __tests__/api/property.test.ts
import { GET } from '@/app/api/property/[id]/route';

describe('Property API', () => {
  it('should return property data', async () => {
    const request = new Request('http://localhost/api/property/123');
    const response = await GET(request, { params: { id: '123' } });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveProperty('address');
  });
});
```

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- __tests__/utils/slugify.test.ts
```

## Commit Guidelines

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Test additions or modifications
- `chore`: Build process or auxiliary tool changes

### Examples

```bash
# Feature
git commit -m "feat(scraper): add Barnet council planning scraper"

# Bug fix
git commit -m "fix(api): resolve property search pagination issue"

# Documentation
git commit -m "docs(readme): update installation instructions"

# Performance
git commit -m "perf(search): implement Elasticsearch caching"
```

### Detailed Commit Message

For complex changes, provide a detailed body:

```
feat(ai-news): implement AI-powered news article generation

- Add OpenAI integration for article generation
- Create prompt templates for different article types
- Implement content quality validation
- Add rate limiting for API calls

Closes #123
```

## Pull Request Process

### Before Submitting

1. **Update your branch** with the latest from `develop`:
   ```bash
   git checkout develop
   git pull origin develop
   git checkout your-feature-branch
   git rebase develop
   ```

2. **Run tests** and ensure they all pass:
   ```bash
   npm test
   npm run lint
   npm run type-check
   ```

3. **Update documentation** if needed:
   - Update README.md if adding new features
   - Update API documentation
   - Add JSDoc comments to new functions

### Submitting a Pull Request

1. **Push your branch** to the repository:
   ```bash
   git push origin your-feature-branch
   ```

2. **Create a Pull Request** on GitHub with:
   - Clear, descriptive title
   - Detailed description of changes
   - Link to related issues
   - Screenshots/videos if applicable

### Pull Request Template

```markdown
## Description
Brief description of what this PR does.

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Performance improvement
- [ ] Documentation update

## Related Issues
Closes #123

## Changes Made
- Change 1
- Change 2
- Change 3

## Testing
Describe how you tested these changes:
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Manual testing performed

## Screenshots (if applicable)
Add screenshots here.

## Checklist
- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Comments added for complex logic
- [ ] Documentation updated
- [ ] Tests pass locally
- [ ] No new warnings generated
```

### Review Process

1. **Automated checks** must pass:
   - All tests
   - Linting
   - Type checking
   - Build process

2. **Code review** by at least one maintainer

3. **Approval** required before merging

4. **Squash and merge** into develop branch

## Code Review Guidelines

### For Authors

- Keep PRs focused and reasonably sized
- Respond to feedback constructively
- Update PR based on review comments
- Request re-review after making changes

### For Reviewers

- Review within 48 hours if possible
- Provide constructive, specific feedback
- Approve when satisfied with changes
- Test locally for significant changes

## Project-Specific Guidelines

### Working with Scrapers

- Always implement rate limiting
- Handle errors gracefully with retries
- Log all scraping activities
- Respect robots.txt
- Cache responses when appropriate

```python
class CouncilScraper:
    def __init__(self, council: str, rate_limit: int = 1):
        self.council = council
        self.rate_limiter = RateLimiter(rate_limit)
        self.logger = logging.getLogger(f'scraper.{council}')

    async def scrape(self):
        await self.rate_limiter.acquire()
        try:
            # Scraping logic
            pass
        except Exception as e:
            self.logger.error(f'Scraping failed: {e}')
            raise
```

### Working with AI Content

- Implement content quality checks
- Add human review for published content
- Monitor token usage and costs
- Cache generated content
- Version control prompts

### Database Migrations

- Never modify existing migrations
- Always create new migrations for schema changes
- Include both up and down migrations
- Test migrations on development data

```bash
# Create migration
npm run migration:create -- add-property-views

# Run migrations
npm run migration:run

# Rollback migration
npm run migration:rollback
```

### SEO Considerations

- All programmatic pages must include:
  - Unique title tags
  - Meta descriptions
  - Proper header hierarchy
  - Schema markup
  - Internal links

## Getting Help

- **Documentation**: Check the [docs](./docs) directory
- **Issues**: Search existing issues before creating new ones
- **Questions**: Use GitHub Discussions for general questions
- **Security**: Email security@example.com for security issues

## License

By contributing, you agree that your contributions will be licensed under the same license as the project.

---

Thank you for contributing to NW London Local Ledger! Your efforts help make this the best resource for North West London residents.
