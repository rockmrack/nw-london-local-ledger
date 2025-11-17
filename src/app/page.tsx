import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'NW London Local Ledger | Property Data, Planning Applications & Local News',
  description:
    'Discover comprehensive property data, live planning applications, and local news for NW1-NW11. Your trusted source for North West London property information.',
};

export default function HomePage() {
  return (
    <main className="min-h-screen">
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-5xl font-bold mb-6">
            NW London Local Ledger
          </h1>

          <p className="text-xl text-muted-foreground mb-8">
            Everything you need to know about living and owning property in North West London
          </p>

          <div className="grid md:grid-cols-3 gap-8 mt-12">
            <div className="p-6 border rounded-lg">
              <h2 className="text-2xl font-semibold mb-3">Property Data</h2>
              <p className="text-muted-foreground">
                Historical sales data, price trends, and market insights for every property in NW1-NW11
              </p>
            </div>

            <div className="p-6 border rounded-lg">
              <h2 className="text-2xl font-semibold mb-3">Planning Applications</h2>
              <p className="text-muted-foreground">
                Live tracking of planning applications across 6 councils with daily updates
              </p>
            </div>

            <div className="p-6 border rounded-lg">
              <h2 className="text-2xl font-semibold mb-3">Local News</h2>
              <p className="text-muted-foreground">
                AI-powered analysis of local developments, market trends, and community news
              </p>
            </div>
          </div>

          <div className="mt-16 p-8 bg-secondary rounded-lg">
            <h3 className="text-2xl font-semibold mb-4">Coming Soon</h3>
            <p className="text-muted-foreground">
              We're building the most comprehensive property and planning database for North West London.
              <br />
              <strong>Launch: Early 2025</strong>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
