/**
 * Header Component
 * Main site navigation
 */

import Link from 'next/link';

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center px-4">
        <div className="mr-8 flex">
          <Link href="/" className="flex items-center space-x-2">
            <span className="text-xl font-bold">NW London Local Ledger</span>
          </Link>
        </div>

        <nav className="flex items-center space-x-6 text-sm font-medium">
          <Link
            href="/properties"
            className="transition-colors hover:text-foreground/80 text-foreground/60"
          >
            Properties
          </Link>
          <Link
            href="/planning"
            className="transition-colors hover:text-foreground/80 text-foreground/60"
          >
            Planning
          </Link>
          <Link
            href="/areas"
            className="transition-colors hover:text-foreground/80 text-foreground/60"
          >
            Areas
          </Link>
          <Link
            href="/news"
            className="transition-colors hover:text-foreground/80 text-foreground/60"
          >
            News
          </Link>
        </nav>

        <div className="ml-auto flex items-center space-x-4">
          <Link
            href="/search"
            className="text-sm font-medium transition-colors hover:text-foreground/80 text-foreground/60"
          >
            Search
          </Link>
        </div>
      </div>
    </header>
  );
}
