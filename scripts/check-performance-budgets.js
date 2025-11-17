#!/usr/bin/env node

/**
 * Performance Budget Checker
 * Validates Lighthouse results against defined performance budgets
 */

const fs = require('fs');
const path = require('path');

// Load budget configuration
const budgetConfigPath = process.env.BUDGET_CONFIG || './config/performance-budgets.json';
const budgetConfig = JSON.parse(fs.readFileSync(budgetConfigPath, 'utf8'));

// Results object to store performance data
const results = {
  lighthouse: {
    performance: 0,
    accessibility: 0,
    bestPractices: 0,
    seo: 0,
  },
  vitals: {
    fcp: 0,
    lcp: 0,
    cls: 0,
    tbt: 0,
    ttfb: 0,
    fid: 0,
  },
  bundle: {
    js: 0,
    css: 0,
    images: 0,
    fonts: 0,
    total: 0,
  },
  passing: true,
  failures: [],
  warnings: [],
};

/**
 * Process Lighthouse results
 */
function processLighthouseResults() {
  const lighthouseDir = './lighthouse-results';

  if (!fs.existsSync(lighthouseDir)) {
    console.error('Lighthouse results directory not found');
    return;
  }

  const files = fs.readdirSync(lighthouseDir);
  const jsonFiles = files.filter(f => f.endsWith('.json'));

  let scoreSum = {
    performance: 0,
    accessibility: 0,
    'best-practices': 0,
    seo: 0,
  };

  let vitalSum = {
    'first-contentful-paint': 0,
    'largest-contentful-paint': 0,
    'cumulative-layout-shift': 0,
    'total-blocking-time': 0,
    'speed-index': 0,
    'interactive': 0,
  };

  let count = 0;

  jsonFiles.forEach(file => {
    const filePath = path.join(lighthouseDir, file);
    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    if (content.categories) {
      Object.keys(scoreSum).forEach(key => {
        if (content.categories[key]) {
          scoreSum[key] += content.categories[key].score * 100;
        }
      });
    }

    if (content.audits) {
      Object.keys(vitalSum).forEach(key => {
        if (content.audits[key]) {
          vitalSum[key] += content.audits[key].numericValue || 0;
        }
      });
    }

    count++;
  });

  // Calculate averages
  if (count > 0) {
    results.lighthouse.performance = Math.round(scoreSum.performance / count);
    results.lighthouse.accessibility = Math.round(scoreSum.accessibility / count);
    results.lighthouse.bestPractices = Math.round(scoreSum['best-practices'] / count);
    results.lighthouse.seo = Math.round(scoreSum.seo / count);

    results.vitals.fcp = Math.round(vitalSum['first-contentful-paint'] / count);
    results.vitals.lcp = Math.round(vitalSum['largest-contentful-paint'] / count);
    results.vitals.cls = parseFloat((vitalSum['cumulative-layout-shift'] / count).toFixed(3));
    results.vitals.tbt = Math.round(vitalSum['total-blocking-time'] / count);
  }
}

/**
 * Process bundle statistics
 */
function processBundleStats() {
  const statsPath = './bundle-stats';

  if (!fs.existsSync(statsPath)) {
    console.error('Bundle stats directory not found');
    return;
  }

  // Read Next.js build output
  const buildManifestPath = './.next/build-manifest.json';
  if (fs.existsSync(buildManifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(buildManifestPath, 'utf8'));

    // Calculate sizes
    let jsSize = 0;
    let cssSize = 0;

    Object.values(manifest.pages).forEach(files => {
      files.forEach(file => {
        const filePath = path.join('./.next', file);
        if (fs.existsSync(filePath)) {
          const stats = fs.statSync(filePath);
          if (file.endsWith('.js')) {
            jsSize += stats.size;
          } else if (file.endsWith('.css')) {
            cssSize += stats.size;
          }
        }
      });
    });

    results.bundle.js = Math.round(jsSize / 1024); // Convert to KB
    results.bundle.css = Math.round(cssSize / 1024);
  }

  // Check static assets
  const publicDir = './public';
  if (fs.existsSync(publicDir)) {
    let imageSize = 0;
    let fontSize = 0;

    function walkDir(dir) {
      const files = fs.readdirSync(dir);
      files.forEach(file => {
        const filePath = path.join(dir, file);
        const stats = fs.statSync(filePath);

        if (stats.isDirectory()) {
          walkDir(filePath);
        } else {
          const ext = path.extname(file).toLowerCase();
          if (['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.avif'].includes(ext)) {
            imageSize += stats.size;
          } else if (['.woff', '.woff2', '.ttf', '.eot'].includes(ext)) {
            fontSize += stats.size;
          }
        }
      });
    }

    walkDir(publicDir);

    results.bundle.images = Math.round(imageSize / 1024);
    results.bundle.fonts = Math.round(fontSize / 1024);
  }

  results.bundle.total = results.bundle.js + results.bundle.css + results.bundle.images + results.bundle.fonts;
}

/**
 * Check against performance budgets
 */
function checkBudgets() {
  const budget = budgetConfig.budgets[0]; // Use homepage budget as primary

  // Check Lighthouse scores
  Object.keys(budget.metrics).forEach(metric => {
    const actualScore = results.lighthouse[metric] || 0;
    const targetScore = budget.metrics[metric];

    if (actualScore < targetScore) {
      const severity = actualScore < targetScore * budgetConfig.thresholds.error ? 'error' : 'warning';
      const message = `${metric} score (${actualScore}) is below target (${targetScore})`;

      if (severity === 'error') {
        results.failures.push(message);
        results.passing = false;
      } else {
        results.warnings.push(message);
      }
    }
  });

  // Check Core Web Vitals
  if (results.vitals.fcp > budget.timings.firstContentfulPaint) {
    results.failures.push(`FCP (${results.vitals.fcp}ms) exceeds budget (${budget.timings.firstContentfulPaint}ms)`);
    results.passing = false;
  }

  if (results.vitals.lcp > budget.timings.largestContentfulPaint) {
    results.failures.push(`LCP (${results.vitals.lcp}ms) exceeds budget (${budget.timings.largestContentfulPaint}ms)`);
    results.passing = false;
  }

  if (results.vitals.cls > budget.timings.cumulativeLayoutShift) {
    results.failures.push(`CLS (${results.vitals.cls}) exceeds budget (${budget.timings.cumulativeLayoutShift})`);
    results.passing = false;
  }

  if (results.vitals.tbt > budget.timings.totalBlockingTime) {
    results.warnings.push(`TBT (${results.vitals.tbt}ms) exceeds budget (${budget.timings.totalBlockingTime}ms)`);
  }

  // Check bundle sizes
  if (results.bundle.js > budget.resources.script.budget / 1024) {
    results.failures.push(`JavaScript bundle (${results.bundle.js}KB) exceeds budget (${budget.resources.script.budget / 1024}KB)`);
    results.passing = false;
  }

  if (results.bundle.css > budget.resources.stylesheet.budget / 1024) {
    results.warnings.push(`CSS bundle (${results.bundle.css}KB) exceeds budget (${budget.resources.stylesheet.budget / 1024}KB)`);
  }

  if (results.bundle.total > budget.resources.total.budget / 1024) {
    results.failures.push(`Total bundle size (${results.bundle.total}KB) exceeds budget (${budget.resources.total.budget / 1024}KB)`);
    results.passing = false;
  }
}

/**
 * Generate report
 */
function generateReport() {
  console.log('\n========================================');
  console.log('     PERFORMANCE BUDGET CHECK REPORT    ');
  console.log('========================================\n');

  console.log('📊 LIGHTHOUSE SCORES');
  console.log('--------------------');
  Object.entries(results.lighthouse).forEach(([key, value]) => {
    const emoji = value >= 90 ? '✅' : value >= 50 ? '⚠️' : '❌';
    console.log(`${emoji} ${key}: ${value}%`);
  });

  console.log('\n⚡ CORE WEB VITALS');
  console.log('------------------');
  console.log(`FCP: ${results.vitals.fcp}ms`);
  console.log(`LCP: ${results.vitals.lcp}ms`);
  console.log(`CLS: ${results.vitals.cls}`);
  console.log(`TBT: ${results.vitals.tbt}ms`);

  console.log('\n📦 BUNDLE SIZES');
  console.log('---------------');
  console.log(`JavaScript: ${results.bundle.js}KB`);
  console.log(`CSS: ${results.bundle.css}KB`);
  console.log(`Images: ${results.bundle.images}KB`);
  console.log(`Fonts: ${results.bundle.fonts}KB`);
  console.log(`Total: ${results.bundle.total}KB`);

  if (results.failures.length > 0) {
    console.log('\n❌ FAILURES');
    console.log('-----------');
    results.failures.forEach(failure => {
      console.log(`• ${failure}`);
    });
  }

  if (results.warnings.length > 0) {
    console.log('\n⚠️ WARNINGS');
    console.log('-----------');
    results.warnings.forEach(warning => {
      console.log(`• ${warning}`);
    });
  }

  console.log('\n========================================');
  if (results.passing) {
    console.log('✅ All performance checks PASSED!');
  } else {
    console.log('❌ Performance checks FAILED!');
    console.log('Please address the failures before merging.');
  }
  console.log('========================================\n');
}

/**
 * Main execution
 */
function main() {
  try {
    console.log('Checking performance budgets...\n');

    // Process results
    processLighthouseResults();
    processBundleStats();

    // Check against budgets
    checkBudgets();

    // Generate report
    generateReport();

    // Write results to file for CI
    fs.writeFileSync('performance-results.json', JSON.stringify(results, null, 2));

    // Exit with appropriate code
    process.exit(results.passing ? 0 : 1);
  } catch (error) {
    console.error('Error checking performance budgets:', error);
    process.exit(1);
  }
}

// Run the checker
main();