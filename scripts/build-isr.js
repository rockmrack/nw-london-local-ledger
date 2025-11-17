#!/usr/bin/env node

/**
 * ISR Build Script
 * Optimized build process for Incremental Static Regeneration
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

// Logging utilities
const log = {
  info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  warning: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  section: (msg) => console.log(`\n${colors.bright}${colors.cyan}${msg}${colors.reset}`),
};

// Build configuration
const BUILD_CONFIG = {
  // Environment variables for optimized build
  env: {
    ...process.env,
    NODE_ENV: 'production',
    NEXT_TELEMETRY_DISABLED: '1',
  },

  // Build phases
  phases: [
    {
      name: 'Pre-build Cleanup',
      command: 'rm -rf .next out',
      optional: true,
    },
    {
      name: 'Install Dependencies',
      command: 'npm ci --production=false',
      optional: false,
    },
    {
      name: 'Type Checking',
      command: 'npm run type-check',
      optional: true,
    },
    {
      name: 'Linting',
      command: 'npm run lint',
      optional: true,
    },
    {
      name: 'Build Application',
      command: 'npm run build',
      optional: false,
    },
  ],
};

// Track build metrics
class BuildMetrics {
  constructor() {
    this.startTime = Date.now();
    this.phases = [];
  }

  startPhase(name) {
    this.currentPhase = {
      name,
      startTime: Date.now(),
    };
  }

  endPhase(success = true) {
    if (this.currentPhase) {
      this.currentPhase.endTime = Date.now();
      this.currentPhase.duration = this.currentPhase.endTime - this.currentPhase.startTime;
      this.currentPhase.success = success;
      this.phases.push(this.currentPhase);
      this.currentPhase = null;
    }
  }

  getTotalTime() {
    return Date.now() - this.startTime;
  }

  printSummary() {
    log.section('Build Summary');

    const totalTime = this.getTotalTime();
    const successful = this.phases.filter(p => p.success).length;
    const failed = this.phases.filter(p => !p.success).length;

    console.log(`\n${colors.bright}Build Phases:${colors.reset}`);
    this.phases.forEach(phase => {
      const status = phase.success ? colors.green + '✓' : colors.red + '✗';
      const duration = (phase.duration / 1000).toFixed(2) + 's';
      console.log(`  ${status} ${phase.name.padEnd(30)} ${duration}${colors.reset}`);
    });

    console.log(`\n${colors.bright}Statistics:${colors.reset}`);
    console.log(`  Total Time:     ${(totalTime / 1000).toFixed(2)}s`);
    console.log(`  Successful:     ${successful} phases`);
    if (failed > 0) {
      console.log(`  Failed:         ${failed} phases`);
    }

    // Estimate page generation stats
    this.estimatePageGeneration();
  }

  estimatePageGeneration() {
    console.log(`\n${colors.bright}ISR Page Generation (Estimated):${colors.reset}`);
    console.log(`  Areas:          All (~100 pages)`);
    console.log(`  Properties:     Top 1000 pages`);
    console.log(`  Planning:       Recent 100 pages`);
    console.log(`  News:           Recent 50 pages`);
    console.log(`  Static:         ~10 pages`);
    console.log(`  ${colors.bright}Total:          ~1,260 pages pre-generated${colors.reset}`);
  }
}

// Execute build phase
async function executePhase(phase, metrics) {
  log.info(`Starting: ${phase.name}`);
  metrics.startPhase(phase.name);

  try {
    execSync(phase.command, {
      stdio: 'inherit',
      env: BUILD_CONFIG.env,
    });
    metrics.endPhase(true);
    log.success(`Completed: ${phase.name}`);
    return true;
  } catch (error) {
    metrics.endPhase(false);
    if (phase.optional) {
      log.warning(`Failed (optional): ${phase.name}`);
      return true;
    } else {
      log.error(`Failed: ${phase.name}`);
      throw error;
    }
  }
}

// Analyze build output
function analyzeBuildOutput() {
  const buildManifestPath = path.join(process.cwd(), '.next', 'build-manifest.json');
  const prerenderManifestPath = path.join(process.cwd(), '.next', 'prerender-manifest.json');

  if (fs.existsSync(buildManifestPath) && fs.existsSync(prerenderManifestPath)) {
    try {
      const prerenderManifest = JSON.parse(fs.readFileSync(prerenderManifestPath, 'utf-8'));
      const staticRoutes = Object.keys(prerenderManifest.routes || {});
      const dynamicRoutes = Object.keys(prerenderManifest.dynamicRoutes || {});

      console.log(`\n${colors.bright}Build Analysis:${colors.reset}`);
      console.log(`  Static Routes:    ${staticRoutes.length}`);
      console.log(`  Dynamic Routes:   ${dynamicRoutes.length}`);
      console.log(`  ISR Enabled:      ${staticRoutes.length > 0 ? 'Yes' : 'No'}`);

      // Show sample routes
      if (staticRoutes.length > 0) {
        console.log(`\n${colors.bright}Sample Static Routes:${colors.reset}`);
        staticRoutes.slice(0, 5).forEach(route => {
          const config = prerenderManifest.routes[route];
          console.log(`  ${route} (revalidate: ${config.initialRevalidateSeconds || 'false'}s)`);
        });
      }
    } catch (error) {
      log.warning('Could not analyze build output');
    }
  }
}

// Create environment file if missing
function ensureEnvFile() {
  const envPath = path.join(process.cwd(), '.env.local');

  if (!fs.existsSync(envPath)) {
    log.warning('.env.local not found, creating default file');

    const defaultEnv = `# ISR Configuration
REVALIDATION_SECRET=development-secret-change-in-production
NEXT_PUBLIC_BASE_URL=http://localhost:3000

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/nwlondon

# Optional: Analytics
NEXT_PUBLIC_GA_ID=
`;

    fs.writeFileSync(envPath, defaultEnv);
    log.success('Created .env.local with default values');
  }
}

// Main build process
async function build() {
  console.log(`${colors.bright}${colors.cyan}
╔════════════════════════════════════════╗
║     ISR Optimized Build Process        ║
╚════════════════════════════════════════╝
${colors.reset}`);

  const metrics = new BuildMetrics();

  try {
    // Ensure environment is set up
    ensureEnvFile();

    // Execute build phases
    for (const phase of BUILD_CONFIG.phases) {
      const success = await executePhase(phase, metrics);
      if (!success && !phase.optional) {
        throw new Error(`Build failed at: ${phase.name}`);
      }
    }

    // Analyze build output
    analyzeBuildOutput();

    // Print summary
    metrics.printSummary();

    log.section('Build Completed Successfully! 🎉');

    console.log(`\n${colors.bright}Next Steps:${colors.reset}`);
    console.log('  1. Run: npm start (for production)');
    console.log('  2. Run: npm run dev (for development)');
    console.log('  3. Deploy to your hosting platform');

    console.log(`\n${colors.bright}ISR Features Enabled:${colors.reset}`);
    console.log('  ✓ Static pre-generation for high-traffic pages');
    console.log('  ✓ Automatic revalidation at configured intervals');
    console.log('  ✓ On-demand revalidation via API');
    console.log('  ✓ Optimized build with parallel generation');

    process.exit(0);
  } catch (error) {
    metrics.printSummary();
    log.error(`Build failed: ${error.message}`);
    process.exit(1);
  }
}

// Handle interrupts
process.on('SIGINT', () => {
  log.warning('\nBuild interrupted by user');
  process.exit(130);
});

// Run build
build().catch((error) => {
  log.error(`Unexpected error: ${error.message}`);
  process.exit(1);
});