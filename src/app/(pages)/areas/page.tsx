/**
 * Areas Overview Page
 * Browse all areas in NW London
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { ISRConfig } from '@/lib/isr/config';
import type { Area } from '@/types/area';
import { areaService } from '@/services/area/AreaService';

// Configure ISR for areas list page
export const revalidate = ISRConfig.revalidation.areas; // 24 hours

export const metadata: Metadata = {
  title: 'NW London Areas | Complete Area Guides for NW1-NW11',
  description:
    'Explore all areas in North West London. View property prices, schools, planning data, and comprehensive guides for each neighborhood.',
};

async function getAreas(): Promise<Area[]> {
  try {
    return await areaService.getAllAreas();
  } catch (error) {
    console.error('Error fetching areas:', error);
    return [];
  }
}

export default async function AreasPage() {
  const areas = await getAreas();

  // Group areas by postcode prefix
  const groupedAreas = areas.reduce((acc, area) => {
    const prefix = area.postcodePrefix;
    if (!acc[prefix]) acc[prefix] = [];
    acc[prefix].push(area);
    return acc;
  }, {} as Record<string, Area[]>);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">NW London Areas</h1>
        <p className="text-lg text-muted-foreground">
          Explore {areas.length} neighborhoods across North West London
        </p>
      </div>

      {/* Areas Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Object.entries(groupedAreas)
          .sort(([a], [b]) => {
            const numA = parseInt(a.replace('NW', ''));
            const numB = parseInt(b.replace('NW', ''));
            return numA - numB;
          })
          .map(([prefix, prefixAreas]) =>
            prefixAreas.map((area) => (
              <Link key={area.id} href={`/areas/${area.slug}`}>
                <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-xl">{area.name}</CardTitle>
                        <p className="text-sm text-muted-foreground mt-1">
                          {area.postcodePrefix}
                        </p>
                      </div>
                      <span className="px-3 py-1 bg-primary/10 text-primary rounded-full text-sm font-medium">
                        {area.council}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {area.description && (
                      <p className="text-sm text-muted-foreground line-clamp-3 mb-4">
                        {area.description}
                      </p>
                    )}
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      {area.population && (
                        <div>
                          <p className="text-muted-foreground">Population</p>
                          <p className="font-medium">{area.population.toLocaleString()}</p>
                        </div>
                      )}
                      {area.areaSqkm && (
                        <div>
                          <p className="text-muted-foreground">Area</p>
                          <p className="font-medium">{area.areaSqkm} km²</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))
          )}
      </div>

      {areas.length === 0 && (
        <div className="text-center py-12">
          <p className="text-lg text-muted-foreground">
            No areas found. Check back soon as we add more data.
          </p>
        </div>
      )}
    </div>
  );
}
