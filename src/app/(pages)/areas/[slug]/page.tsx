/**
 * Area Detail Page
 * Comprehensive area guide with statistics and data
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { PropertyCard } from '@/components/property/PropertyCard';
import { PlanningCard } from '@/components/planning/PlanningCard';
import { formatPrice, formatPercentage } from '@/lib/utils/format';
import { SchemaMarkup, generateAreaSchema } from '@/lib/seo/schema';
import type { AreaStats, Area, Property, School, Street, PlanningApplication } from '@/types/area';

interface AreaDetailResponse {
  area: Area;
  stats: AreaStats;
  recentProperties: Property[];
  recentPlanning: PlanningApplication[];
  schools: School[];
  streets: Street[];
}

async function getAreaData(slug: string): Promise<AreaDetailResponse | null> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  const url = `${baseUrl}/api/areas/${slug}`;

  try {
    const response = await fetch(url, { next: { revalidate: 3600 } }); // 1 hour cache
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error('Error fetching area:', error);
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const data = await getAreaData(params.slug);

  if (!data) {
    return { title: 'Area Not Found' };
  }

  const { area, stats } = data;

  return {
    title: `${area.name} ${area.postcodePrefix} Area Guide | Property Prices & Data`,
    description: `Complete guide to ${area.name}. Average property price: ${
      stats.averagePrice ? formatPrice(stats.averagePrice) : 'N/A'
    }. ${stats.schoolCount} schools, ${stats.propertyCount} properties. ${
      area.description || ''
    }`,
  };
}

export default async function AreaDetailPage({ params }: { params: { slug: string } }) {
  const data = await getAreaData(params.slug);

  if (!data) {
    notFound();
  }

  const { area, stats, recentProperties, recentPlanning, schools, streets } = data;

  return (
    <>
      <SchemaMarkup schema={generateAreaSchema(area, stats)} />

      <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-4xl font-bold mb-2">{area.name}</h1>
            <p className="text-xl text-muted-foreground">
              {area.postcodePrefix} • {area.council} Council
            </p>
          </div>
        </div>
        {area.description && (
          <p className="text-lg text-muted-foreground max-w-3xl">{area.description}</p>
        )}
      </div>

      {/* Key Statistics */}
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Average Price
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {stats.averagePrice ? formatPrice(stats.averagePrice) : 'N/A'}
            </p>
            {stats.priceChange1Year !== 0 && (
              <p className="text-sm text-muted-foreground">
                {formatPercentage(stats.priceChange1Year)} (1yr)
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Properties
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.propertyCount.toLocaleString()}</p>
            <p className="text-sm text-muted-foreground">Total listings</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Schools</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.schoolCount}</p>
            <p className="text-sm text-muted-foreground">Avg: {stats.avgOfstedRating}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Planning Apps
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.planningApplications.total}</p>
            <p className="text-sm text-muted-foreground">Last 12 months</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-8">
          {/* Property Market */}
          <div>
            <h2 className="text-2xl font-bold mb-4">Property Market</h2>
            <Card>
              <CardContent className="pt-6">
                <div className="grid md:grid-cols-3 gap-6">
                  <div>
                    <p className="text-sm text-muted-foreground">Average Price</p>
                    <p className="text-xl font-bold">
                      {stats.averagePrice ? formatPrice(stats.averagePrice) : 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Median Price</p>
                    <p className="text-xl font-bold">
                      {stats.medianPrice ? formatPrice(stats.medianPrice) : 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Properties</p>
                    <p className="text-xl font-bold">{stats.propertyCount.toLocaleString()}</p>
                  </div>
                  {stats.priceChange1Year !== 0 && (
                    <div>
                      <p className="text-sm text-muted-foreground">1 Year Change</p>
                      <p className="text-xl font-bold">
                        {formatPercentage(stats.priceChange1Year)}
                      </p>
                    </div>
                  )}
                  {stats.priceChange5Year !== 0 && (
                    <div>
                      <p className="text-sm text-muted-foreground">5 Year Change</p>
                      <p className="text-xl font-bold">
                        {formatPercentage(stats.priceChange5Year)}
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recent Properties */}
          {recentProperties.length > 0 && (
            <div>
              <h2 className="text-2xl font-bold mb-4">Recent Properties</h2>
              <div className="grid md:grid-cols-2 gap-4">
                {recentProperties.slice(0, 6).map((property) => (
                  <PropertyCard key={property.id} property={property} />
                ))}
              </div>
            </div>
          )}

          {/* Planning Applications */}
          {recentPlanning.length > 0 && (
            <div>
              <h2 className="text-2xl font-bold mb-4">Recent Planning Applications</h2>
              <div className="space-y-4">
                {recentPlanning.slice(0, 5).map((app) => (
                  <PlanningCard key={app.id} application={app} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Schools */}
          {schools.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Schools</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {schools.slice(0, 10).map((school) => (
                    <div key={school.id} className="border-b pb-3 last:border-0">
                      <p className="font-medium">{school.name}</p>
                      <div className="flex items-center justify-between mt-1">
                        <p className="text-sm text-muted-foreground">{school.schoolType}</p>
                        {school.ofstedRating && (
                          <span className="text-xs px-2 py-1 bg-primary/10 text-primary rounded">
                            {school.ofstedRating}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Streets */}
          {streets.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Popular Streets</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {streets.slice(0, 15).map((street) => (
                    <div key={street.id} className="text-sm">
                      <p className="font-medium">{street.name}</p>
                      {street.propertyCount > 0 && (
                        <p className="text-muted-foreground">
                          {street.propertyCount} properties
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Planning Stats */}
          <Card>
            <CardHeader>
              <CardTitle>Planning Statistics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm">Total Applications</span>
                  <span className="font-medium">{stats.planningApplications.total}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm">Approved</span>
                  <span className="font-medium text-green-600">
                    {stats.planningApplications.approved}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm">Pending</span>
                  <span className="font-medium text-yellow-600">
                    {stats.planningApplications.pending}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm">Refused</span>
                  <span className="font-medium text-red-600">
                    {stats.planningApplications.refused}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      </div>
    </>
  );
}
