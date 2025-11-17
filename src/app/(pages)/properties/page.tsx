/**
 * Properties Listing Page
 * Browse and search properties in NW London
 */

import type { Metadata } from 'next';
import { PropertyCard } from '@/components/property/PropertyCard';
import type { Property, PropertySearchResult } from '@/types/property';

export const metadata: Metadata = {
  title: 'Properties for Sale in NW London | Property Prices & Data',
  description:
    'Browse properties in North West London. View historical prices, sales data, and property information for NW1-NW11 postcodes.',
};

async function getProperties(searchParams: any): Promise<PropertySearchResult> {
  const params = new URLSearchParams();

  if (searchParams.postcode) params.set('postcode', searchParams.postcode);
  if (searchParams.areaId) params.set('areaId', searchParams.areaId);
  if (searchParams.propertyType) params.set('propertyType', searchParams.propertyType);
  if (searchParams.minPrice) params.set('minPrice', searchParams.minPrice);
  if (searchParams.maxPrice) params.set('maxPrice', searchParams.maxPrice);
  if (searchParams.minBedrooms) params.set('minBedrooms', searchParams.minBedrooms);
  if (searchParams.page) params.set('page', searchParams.page);

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  const url = `${baseUrl}/api/properties?${params.toString()}`;

  try {
    const response = await fetch(url, { next: { revalidate: 300 } }); // 5 min cache
    if (!response.ok) throw new Error('Failed to fetch properties');
    return await response.json();
  } catch (error) {
    console.error('Error fetching properties:', error);
    return { properties: [], total: 0, page: 1, limit: 20, totalPages: 0 };
  }
}

export default async function PropertiesPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | undefined };
}) {
  const result = await getProperties(searchParams);
  const currentPage = parseInt(searchParams.page || '1');

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Properties in NW London</h1>
        <p className="text-lg text-muted-foreground">
          Browse {result.total.toLocaleString()} properties across North West London
        </p>
      </div>

      {/* Search Filters - Placeholder for now */}
      <div className="mb-8 p-6 border rounded-lg bg-card">
        <h2 className="text-xl font-semibold mb-4">Search Properties</h2>
        <div className="grid md:grid-cols-4 gap-4">
          <div>
            <label className="text-sm font-medium">Postcode</label>
            <input
              type="text"
              placeholder="e.g., NW3"
              className="w-full mt-1 px-3 py-2 border rounded-md"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Min Bedrooms</label>
            <select className="w-full mt-1 px-3 py-2 border rounded-md">
              <option value="">Any</option>
              <option value="1">1+</option>
              <option value="2">2+</option>
              <option value="3">3+</option>
              <option value="4">4+</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Min Price</label>
            <input
              type="number"
              placeholder="£"
              className="w-full mt-1 px-3 py-2 border rounded-md"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Max Price</label>
            <input
              type="number"
              placeholder="£"
              className="w-full mt-1 px-3 py-2 border rounded-md"
            />
          </div>
        </div>
      </div>

      {/* Results */}
      {result.properties.length > 0 ? (
        <>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {result.properties.map((property) => (
              <PropertyCard key={property.id} property={property} />
            ))}
          </div>

          {/* Pagination */}
          {result.totalPages > 1 && (
            <div className="mt-8 flex justify-center gap-2">
              {currentPage > 1 && (
                <a
                  href={`/properties?page=${currentPage - 1}`}
                  className="px-4 py-2 border rounded-md hover:bg-accent"
                >
                  Previous
                </a>
              )}
              <span className="px-4 py-2">
                Page {currentPage} of {result.totalPages}
              </span>
              {currentPage < result.totalPages && (
                <a
                  href={`/properties?page=${currentPage + 1}`}
                  className="px-4 py-2 border rounded-md hover:bg-accent"
                >
                  Next
                </a>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-12">
          <p className="text-lg text-muted-foreground">
            No properties found. Try adjusting your search filters.
          </p>
        </div>
      )}
    </div>
  );
}
