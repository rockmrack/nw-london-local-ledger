import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import '@/styles/globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'NW London Local Ledger | Property, Planning & Local News',
  description:
    'The most comprehensive data-driven community hub for North West London property information, planning applications, and local news.',
  keywords: [
    'NW London property',
    'planning applications',
    'property prices',
    'local news',
    'Hampstead',
    'Camden',
    'Kilburn',
  ],
  authors: [{ name: 'NW London Local Ledger' }],
  creator: 'NW London Local Ledger',
  publisher: 'NW London Local Ledger',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  openGraph: {
    type: 'website',
    locale: 'en_GB',
    url: 'https://nwlondonledger.com',
    siteName: 'NW London Local Ledger',
    title: 'NW London Local Ledger | Property, Planning & Local News',
    description:
      'Everything you need to know about living and owning property in North West London',
    images: [
      {
        url: '/images/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'NW London Local Ledger',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'NW London Local Ledger | Property, Planning & Local News',
    description:
      'Everything you need to know about living and owning property in North West London',
    images: ['/images/twitter-image.jpg'],
    creator: '@nwlondonledger',
  },
  verification: {
    google: 'google-site-verification-code',
  },
  alternates: {
    canonical: 'https://nwlondonledger.com',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
