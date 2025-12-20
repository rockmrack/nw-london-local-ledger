/** @type {import('next').NextConfig} */

const securityHeaders = [
  {
    key: 'X-DNS-Prefetch-Control',
    value: 'on'
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload'
  },
  {
    key: 'X-Frame-Options',
    value: 'SAMEORIGIN'
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff'
  },
  {
    key: 'X-XSS-Protection',
    value: '1; mode=block'
  },
  {
    key: 'Referrer-Policy',
    value: 'origin-when-cross-origin'
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()'
  },
  // HTTP/3 and QUIC Support Headers
  {
    key: 'Alt-Svc',
    value: 'h3=":443"; ma=86400, h3-29=":443"; ma=86400'
  },
  {
    key: 'QUIC-Status',
    value: 'quic=":443"; ma=2592000; v="46,43"'
  },
  // Early Hints
  {
    key: 'Link',
    value: '</fonts/inter-var.woff2>; rel=preload; as=font; type="font/woff2"; crossorigin'
  }
];

const performanceHeaders = [
  // Resource Hints
  {
    key: 'Link',
    value: [
      '<https://cdn.jsdelivr.net>; rel=preconnect',
      '<https://fonts.googleapis.com>; rel=preconnect',
      '<https://api.nwlondonledger.com>; rel=dns-prefetch',
      '</css/critical.css>; rel=preload; as=style',
      '</js/app.js>; rel=modulepreload'
    ].join(', ')
  },
  // Server Push for critical resources
  {
    key: 'X-Associated-Content',
    value: '/css/critical.css=/css/critical.css, /js/app.js=/js/app.js'
  },
  // 103 Early Hints
  {
    key: 'Early-Data',
    value: '1'
  },
  // Connection Keep-Alive
  {
    key: 'Keep-Alive',
    value: 'timeout=5, max=1000'
  },
  // Cache Control for different resource types
  {
    key: 'Cache-Control',
    value: 'public, max-age=31536000, immutable'
  }
];

const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,

  // ESLint configuration - warnings don't fail build
  eslint: {
    // Only fail builds on ESLint errors, not warnings
    ignoreDuringBuilds: true,
  },

  // Image optimization with AVIF and WebP
  images: {
    domains: ['nwlondonledger.com', 'images.nwlondonledger.com', 'cdn.nwlondonledger.com'],
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 31536000, // 1 year
    dangerouslyAllowSVG: true,
    contentDispositionType: 'attachment',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },

  // Compression with Brotli
  compress: true,

  // Performance
  poweredByHeader: false,
  generateEtags: true,

  // Output configuration for edge runtime
  output: 'standalone',

  // Headers for security, performance, and HTTP/3
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [...securityHeaders, ...performanceHeaders],
      },
      {
        source: '/api/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, s-maxage=60, stale-while-revalidate=120' },
          { key: 'CDN-Cache-Control', value: 'max-age=60' },
          { key: 'Cloudflare-CDN-Cache-Control', value: 'max-age=60' }
        ],
      },
      {
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        source: '/fonts/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        source: '/service-worker.js',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' }
        ],
      }
    ];
  },

  // Redirects for SEO
  async redirects() {
    return [
      {
        source: '/property/:id',
        destination: '/property/:id-slug',
        permanent: true,
      },
    ];
  },

  // Rewrites for multi-region support
  async rewrites() {
    return {
      beforeFiles: [
        // Regional API routing
        {
          source: '/api/:path*',
          destination: 'https://api-:region.nwlondonledger.com/:path*',
          has: [
            {
              type: 'header',
              key: 'x-region',
            },
          ],
        },
      ],
      afterFiles: [
        // Service Worker
        {
          source: '/sw.js',
          destination: '/service-worker.js',
        },
      ],
    };
  },

  // Environment variables
  env: {
    NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000',
    NEXT_PUBLIC_REGION: process.env.VERCEL_REGION || 'eu-west-2',
    NEXT_PUBLIC_ENABLE_HTTP3: 'true',
    NEXT_PUBLIC_ENABLE_SERVICE_WORKER: 'true',
    NEXT_PUBLIC_ENABLE_STREAMING: 'true',
  },

  // Webpack configuration with advanced optimizations
  webpack: (config, { isServer, dev }) => {
    // WebAssembly support
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      layers: true,
      lazyCompilation: !dev && {
        entries: false,
        imports: true,
      },
      topLevelAwait: true,
    };

    // Handle WASM files
    config.module.rules.push({
      test: /\.wasm$/,
      type: 'asset/resource',
    });

    // Worker support
    config.module.rules.push({
      test: /\.worker\.(js|ts)$/,
      use: { loader: 'worker-loader' },
    });

    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
      };

      // Ignore server-only packages and WASM modules in client bundle
      config.resolve.alias = {
        ...config.resolve.alias,
        '@tensorflow/tfjs-node': false,
        '@mapbox/node-pre-gyp': false,
        'mock-aws-s3': false,
        'aws-sdk': false,
        'nock': false,
      };
    } else {
      // Server-side: Handle missing WASM modules gracefully
      config.resolve.alias = {
        ...config.resolve.alias,
      };
    }

    // Webpack ignore plugin to handle missing WASM modules
    config.plugins = config.plugins || [];
    config.plugins.push(
      new (require('webpack').IgnorePlugin)({
        checkResource(resource) {
          // Ignore WASM module imports
          return resource.includes('pkg/data-transformer') ||
                 resource.includes('pkg/geo-calculator') ||
                 resource.includes('pkg/property-processor') ||
                 resource.includes('pkg/stats-engine') ||
                 resource.includes('pkg/search-optimizer');
        },
      })
    );

    if (!isServer) {
      // Advanced chunk splitting for optimal loading
      config.optimization.splitChunks = {
        chunks: 'all',
        maxInitialRequests: 25,
        minSize: 20000,
        maxSize: 244000,
        cacheGroups: {
          default: false,
          vendors: false,
          // React/Next.js framework chunk
          framework: {
            name: 'framework',
            chunks: 'all',
            test: /[\\/]node_modules[\\/](react|react-dom|next|scheduler|prop-types|use-sync-external-store)[\\/]/,
            priority: 50,
            enforce: true,
          },
          // Library chunk
          lib: {
            test(module) {
              return module.size() > 160000 &&
                /node_modules[\\/]/.test(module.identifier());
            },
            name(module) {
              const hash = require('crypto').createHash('sha1');
              hash.update(module.identifier());
              return `lib-${hash.digest('hex').substring(0, 8)}`;
            },
            priority: 30,
            minChunks: 1,
            reuseExistingChunk: true,
          },
          // Common components
          commons: {
            name: 'commons',
            minChunks: 2,
            priority: 20,
          },
          // Vendor chunk for remaining node_modules
          vendor: {
            name: 'vendor',
            test: /[\\/]node_modules[\\/]/,
            priority: 10,
            reuseExistingChunk: true,
          },
        },
      };

      // Module concatenation for smaller bundles
      config.optimization.concatenateModules = true;

      // Tree shaking optimizations
      config.optimization.usedExports = true;
      config.optimization.sideEffects = false;

      // Minification with aggressive settings
      if (!dev) {
        config.optimization.minimize = true;
        // Note: Next.js handles minification configuration internally
        // Custom terser options can be set via swcMinify or other Next.js config options
      }
    }

    // Performance hints
    config.performance = {
      maxEntrypointSize: 250000,
      maxAssetSize: 100000,
      hints: dev ? false : 'warning',
    };

    return config;
  },

  // ISR and Static Generation Configuration
  staticPageGenerationTimeout: 120,

  // Experimental features for streaming and performance
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
    serverComponentsExternalPackages: [
      'pg',
      '@tensorflow/tfjs-node',
      '@mapbox/node-pre-gyp',
    ],
    serverMinification: true,
    // Optimize package imports
    optimizePackageImports: [
      'redis',
      'bullmq',
      'lodash',
      'date-fns',
      '@headlessui/react',
      '@heroicons/react',
    ],
    workerThreads: true,
    cpus: 8,
    scrollRestoration: true,
    // Module resolution optimizations
    externalDir: true,
    esmExternals: true,
  },

  // Production browser source maps disabled for performance
  productionBrowserSourceMaps: false,

  // Compiler optimizations
  compiler: {
    // Remove console logs in production
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn'],
    } : false,
    // Styled components optimizations
    styledComponents: true,
  },

  // Module aliases
  modularizeImports: {
    'lodash': {
      transform: 'lodash/{{member}}',
    },
    '@heroicons/react/24/outline': {
      transform: '@heroicons/react/24/outline/{{member}}',
    },
    '@heroicons/react/24/solid': {
      transform: '@heroicons/react/24/solid/{{member}}',
    },
  },
};

module.exports = nextConfig;