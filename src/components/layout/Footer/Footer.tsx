/**
 * Footer Component
 * Site footer with links and information
 */

import Link from 'next/link';

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t bg-background">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* About */}
          <div>
            <h3 className="font-semibold text-lg mb-4">NW London Local Ledger</h3>
            <p className="text-sm text-muted-foreground">
              The most comprehensive data-driven community hub for North West London property
              information, planning applications, and local news.
            </p>
          </div>

          {/* Properties */}
          <div>
            <h4 className="font-semibold mb-4">Properties</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/properties" className="text-muted-foreground hover:text-foreground">
                  Browse Properties
                </Link>
              </li>
              <li>
                <Link href="/areas" className="text-muted-foreground hover:text-foreground">
                  Area Guides
                </Link>
              </li>
              <li>
                <Link href="/search" className="text-muted-foreground hover:text-foreground">
                  Search
                </Link>
              </li>
            </ul>
          </div>

          {/* Planning */}
          <div>
            <h4 className="font-semibold mb-4">Planning</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/planning" className="text-muted-foreground hover:text-foreground">
                  Planning Applications
                </Link>
              </li>
              <li>
                <Link
                  href="/planning?status=Approved"
                  className="text-muted-foreground hover:text-foreground"
                >
                  Approved Applications
                </Link>
              </li>
              <li>
                <Link
                  href="/planning?status=Pending"
                  className="text-muted-foreground hover:text-foreground"
                >
                  Pending Applications
                </Link>
              </li>
            </ul>
          </div>

          {/* About */}
          <div>
            <h4 className="font-semibold mb-4">Information</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/about" className="text-muted-foreground hover:text-foreground">
                  About Us
                </Link>
              </li>
              <li>
                <Link href="/contact" className="text-muted-foreground hover:text-foreground">
                  Contact
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="text-muted-foreground hover:text-foreground">
                  Privacy Policy
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t mt-8 pt-8 flex flex-col md:flex-row justify-between items-center">
          <p className="text-sm text-muted-foreground">
            © {currentYear} NW London Local Ledger. All rights reserved.
          </p>
          <p className="text-sm text-muted-foreground mt-4 md:mt-0">
            Not affiliated with Hampstead Renovations • Independent community resource
          </p>
        </div>
      </div>
    </footer>
  );
}
