import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { Suspense } from 'react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { ServiceWorkerRegistration } from '@/components/ServiceWorkerRegistration';
import { ProgressiveHydration } from '@/components/ProgressiveHydration';
import { PreloadResources } from '@/components/PreloadResources';
import { LoadingHeader } from '@/components/layout/LoadingHeader';
import { LoadingFooter } from '@/components/layout/LoadingFooter';
import { COMPANY, COMPANY_META, getOrganizationSchema } from '@/lib/constants/company';
import '@/styles/globals.css';

// Optimize font loading with variable fonts
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
  preload: true,
  adjustFontFallback: true,
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0f172a' },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL(COMPANY.contact.website),
  title: {
    default: `${COMPANY.name} | ${COMPANY.branding.tagline}`,
    template: COMPANY_META.titleTemplate,
  },
  description: COMPANY_META.description,
  keywords: COMPANY_META.keywords,
  authors: [{ name: COMPANY.name, url: COMPANY.contact.website }],
  creator: COMPANY.name,
  publisher: COMPANY.legalName,
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  robots: {
    index: true,
    follow: true,
    nocache: false,
    googleBot: {
      index: true,
      follow: true,
      noimageindex: false,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  openGraph: {
    type: 'website',
    locale: 'en_GB',
    url: COMPANY.contact.website,
    siteName: COMPANY.name,
    title: `${COMPANY.name} | ${COMPANY.branding.tagline}`,
    description: COMPANY.branding.description,
    images: [
      {
        url: '/images/og-image.jpg',
        width: 1200,
        height: 630,
        alt: COMPANY.name,
        type: 'image/jpeg',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${COMPANY.name} | ${COMPANY.branding.tagline}`,
    description: COMPANY.branding.description,
    images: ['/images/twitter-image.jpg'],
    creator: COMPANY.social.twitter,
    site: COMPANY.social.twitter,
  },
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png' },
      { url: '/apple-touch-icon-76x76.png', sizes: '76x76' },
      { url: '/apple-touch-icon-120x120.png', sizes: '120x120' },
      { url: '/apple-touch-icon-152x152.png', sizes: '152x152' },
    ],
    other: [
      {
        rel: 'mask-icon',
        url: '/safari-pinned-tab.svg',
        color: '#4f46e5',
      },
    ],
  },
  manifest: '/manifest.json',
  verification: {
    google: 'google-site-verification-code',
    yandex: 'yandex-verification-code',
    bing: 'bing-verification-code',
  },
  alternates: {
    canonical: COMPANY.contact.website,
    languages: {
      'en-GB': COMPANY.contact.website,
    },
    types: {
      'application/rss+xml': `${COMPANY.contact.website}/feed.xml`,
    },
  },
  category: 'Real Estate',
};

// Export for edge runtime compatibility
export const runtime = 'nodejs';
export const preferredRegion = ['lhr1']; // London region

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={inter.variable}
      suppressHydrationWarning
    >
      <head>
        {/* Preload critical resources */}
        <PreloadResources />

        {/* DNS Prefetch for external domains */}
        <link rel="dns-prefetch" href="https://cdn.jsdelivr.net" />
        <link rel="dns-prefetch" href="https://fonts.googleapis.com" />
        <link rel="dns-prefetch" href="https://api.nwlondonledger.com" />

        {/* Preconnect to required origins */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />

        {/* Resource hints for performance */}
        <link rel="modulepreload" href="/_next/static/chunks/framework.js" />
        <link rel="prefetch" href="/api/properties" as="fetch" crossOrigin="anonymous" />

        {/* Critical CSS inline */}
        <style
          dangerouslySetInnerHTML={{
            __html: `
              /* Critical CSS for above-the-fold content */
              :root {
                --font-inter: 'Inter', system-ui, -apple-system, sans-serif;
              }
              * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
              }
              body {
                font-family: var(--font-inter);
                -webkit-font-smoothing: antialiased;
                -moz-osx-font-smoothing: grayscale;
                text-rendering: optimizeLegibility;
              }
              .min-h-screen {
                min-height: 100vh;
              }
              .flex {
                display: flex;
              }
              .flex-col {
                flex-direction: column;
              }
              .flex-1 {
                flex: 1;
              }
              .antialiased {
                -webkit-font-smoothing: antialiased;
                -moz-osx-font-smoothing: grayscale;
              }
              /* Loading skeleton animation */
              @keyframes shimmer {
                0% {
                  background-position: -468px 0;
                }
                100% {
                  background-position: 468px 0;
                }
              }
              .skeleton {
                animation: shimmer 1.5s infinite linear;
                background: linear-gradient(
                  to right,
                  #f0f0f0 4%,
                  #e0e0e0 25%,
                  #f0f0f0 36%
                );
                background-size: 936px 1px;
              }
            `,
          }}
        />

        {/* Web App Manifest */}
        <link rel="manifest" href="/manifest.json" />

        {/* Theme color for mobile browsers */}
        <meta name="theme-color" content="#4f46e5" />

        {/* Apple mobile web app settings */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content={COMPANY.name} />

        {/* Company Schema.org structured data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(getOrganizationSchema()),
          }}
        />

        {/* Microsoft tile settings */}
        <meta name="msapplication-TileColor" content="#4f46e5" />
        <meta name="msapplication-config" content="/browserconfig.xml" />
      </head>
      <body
        className="min-h-screen antialiased flex flex-col"
        suppressHydrationWarning
      >
        {/* Progressive Enhancement Wrapper */}
        <ProgressiveHydration>
          {/* Header with Suspense for streaming */}
          <Suspense fallback={<LoadingHeader />}>
            <Header />
          </Suspense>

          {/* Main content area */}
          <main className="flex-1">
            {/* Children will be streamed */}
            {children}
          </main>

          {/* Footer with Suspense for streaming */}
          <Suspense fallback={<LoadingFooter />}>
            <Footer />
          </Suspense>
        </ProgressiveHydration>

        {/* Service Worker Registration (non-blocking) */}
        <ServiceWorkerRegistration />

        {/* No-JS fallback */}
        <noscript>
          <div className="fixed bottom-0 left-0 right-0 bg-yellow-100 text-yellow-800 p-4 text-center">
            This website works best with JavaScript enabled for enhanced functionality.
          </div>
        </noscript>
      </body>
    </html>
  );
}