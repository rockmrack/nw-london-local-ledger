/**
 * Property Detail Page
 * View detailed information about a specific property
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { PropertyCard } from '@/components/property/PropertyCard';
import { PlanningCard } from '@/components/planning/PlanningCard';
import { formatPrice, formatDate, formatArea } from '@/lib/utils/format';
import { SchemaMarkup, generatePropertySchema } from '@/lib/seo/schema';
import { ISRConfig } from '@/lib/isr/config';
import { getTopPropertySlugs } from '@/lib/isr/utils';
import type { PropertyWithSales, Property, PlanningApplication } from '@/types/property';

interface PropertyDetailResponse {
  property: PropertyWithSales;
  similarProperties: Property[];
  planningApplications: PlanningApplication[];
  nearbyProperties: Property[];
}

// Generate static params for top properties at build time
export async function generateStaticParams() {
  const slugs = await getTopPropertySlugs(ISRConfig.buildLimits.properties as number);
  return slugs.map((slug) => ({
    slug,
  }));
}

// Configure ISR revalidation
export const revalidate = ISRConfig.revalidation.properties; // 6 hours
export const dynamicParams = true; // Allow on-demand generation for new properties

async function getPropertyData(slug: string): Promise<PropertyDetailResponse | null> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  const url = `${baseUrl}/api/properties/${slug}`;

  try {
    const response = await fetch(url, {
      next: {
        revalidate: ISRConfig.revalidation.properties,
        tags: [ISRConfig.tags.properties, `property-${slug}`],
      },
    });
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error('Error fetching property:', error);
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const data = await getPropertyData(params.slug);

  if (!data) {
    return {
      title: 'Property Not Found',
    };
  }

  const { property } = data;

  return {
    title: `${property.addressLine1}, ${property.postcode} | Property Details`,
    description: `View detailed information for ${property.addressLine1}. ${
      property.lastSalePrice
        ? `Last sold for ${formatPrice(property.lastSalePrice)}`
        : ''
    }. Property type: ${property.propertyType || 'N/A'}, Bedrooms: ${property.bedrooms || 'N/A'}.`,
  };
}

export default async function PropertyDetailPage({
  params,
}: {
  params: { slug: string };
}) {
  const data = await getPropertyData(params.slug);

  if (!data) {
    notFound();
  }

  const { property, similarProperties, planningApplications, nearbyProperties } = data;

  return (
    <>
      <SchemaMarkup schema={generatePropertySchema(property)} />

      <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">{property.addressLine1}</h1>
        {property.addressLine2 && (
          <p className="text-xl text-muted-foreground">{property.addressLine2}</p>
        )}
        <p className="text-xl text-muted-foreground">{property.postcode}</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Property Details */}
          <Card>
            <CardHeader>
              <CardTitle>Property Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <p className="text-sm text-muted-foreground">Property Type</p>
                  <p className="text-lg font-medium capitalize">
                    {property.propertyType || 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Tenure</p>
                  <p className="text-lg font-medium capitalize">{property.tenure || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Bedrooms</p>
                  <p className="text-lg font-medium">{property.bedrooms || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Bathrooms</p>
                  <p className="text-lg font-medium">{property.bathrooms || 'N/A'}</p>
                </div>
                {property.floorAreaSqm && (
                  <div>
                    <p className="text-sm text-muted-foreground">Floor Area</p>
                    <p className="text-lg font-medium">
                      {formatArea(property.floorAreaSqm)} / {formatArea(property.floorAreaSqm, 'sqft')}
                    </p>
                  </div>
                )}
                {property.epcRating && (
                  <div>
                    <p className="text-sm text-muted-foreground">EPC Rating</p>
                    <p className="text-lg font-medium">{property.epcRating}</p>
                  </div>
                )}
                {property.councilTaxBand && (
                  <div>
                    <p className="text-sm text-muted-foreground">Council Tax Band</p>
                    <p className="text-lg font-medium">Band {property.councilTaxBand}</p>
                  </div>
                )}
                {property.currentValue && (
                  <div className="md:col-span-2">
                    <p className="text-sm text-muted-foreground">Estimated Value</p>
                    <p className="text-3xl font-bold text-primary">
                      {formatPrice(property.currentValue)}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Price History */}
          {property.sales && property.sales.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Price History</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {property.sales.map((sale) => (
                    <div
                      key={sale.id}
                      className="flex justify-between items-center border-b pb-3 last:border-0"
                    >
                      <div>
                        <p className="font-medium">{formatDate(sale.saleDate)}</p>
                        <p className="text-sm text-muted-foreground">
                          {sale.propertyType} • {sale.tenure}
                          {sale.newBuild && ' • New Build'}
                        </p>
                      </div>
                      <p className="text-xl font-bold">{formatPrice(sale.price)}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Planning Applications */}
          {planningApplications.length > 0 && (
            <div>
              <h2 className="text-2xl font-bold mb-4">Planning Applications</h2>
              <div className="space-y-4">
                {planningApplications.map((app) => (
                  <PlanningCard key={app.id} application={app} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Similar Properties */}
          {similarProperties.length > 0 && (
            <div>
              <h2 className="text-xl font-bold mb-4">Similar Properties</h2>
              <div className="space-y-4">
                {similarProperties.map((prop) => (
                  <PropertyCard key={prop.id} property={prop} />
                ))}
              </div>
            </div>
          )}

          {/* Nearby Properties */}
          {nearbyProperties.length > 0 && (
            <div>
              <h2 className="text-xl font-bold mb-4">Nearby Properties</h2>
              <div className="space-y-4">
                {nearbyProperties.slice(0, 5).map((prop) => (
                  <PropertyCard key={prop.id} property={prop} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      </div>
    </>
  );
}
