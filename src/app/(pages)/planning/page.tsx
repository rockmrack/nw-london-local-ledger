/**
 * Planning Applications Listing Page
 * Browse and search planning applications
 */

import type { Metadata } from 'next';
import { PlanningCard } from '@/components/planning/PlanningCard';
import { ISRConfig } from '@/lib/isr/config';
import type { PlanningApplication, PlanningSearchResult } from '@/types/planning';

// Configure ISR for planning list page
export const revalidate = ISRConfig.revalidation.planning; // 1 hour

export const metadata: Metadata = {
  title: 'Planning Applications in NW London | Live Planning Data',
  description:
    'Browse planning applications across North West London councils. Track extensions, loft conversions, and new developments in NW1-NW11.',
};

async function getPlanningApplications(searchParams: any): Promise<PlanningSearchResult> {
  const params = new URLSearchParams();

  if (searchParams.council) params.set('council', searchParams.council);
  if (searchParams.status) params.set('status', searchParams.status);
  if (searchParams.developmentType) params.set('developmentType', searchParams.developmentType);
  if (searchParams.postcode) params.set('postcode', searchParams.postcode);
  if (searchParams.page) params.set('page', searchParams.page);

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  const url = `${baseUrl}/api/planning?${params.toString()}`;

  try {
    const response = await fetch(url, {
      next: {
        revalidate: ISRConfig.revalidation.planning,
        tags: [ISRConfig.tags.planning, 'planning-list'],
      },
    });
    if (!response.ok) throw new Error('Failed to fetch planning applications');
    return await response.json();
  } catch (error) {
    console.error('Error fetching planning applications:', error);
    return { applications: [], total: 0, page: 1, limit: 20, totalPages: 0 };
  }
}

export default async function PlanningPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | undefined };
}) {
  const result = await getPlanningApplications(searchParams);
  const currentPage = parseInt(searchParams.page || '1');

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Planning Applications</h1>
        <p className="text-lg text-muted-foreground">
          Browse {result.total.toLocaleString()} planning applications across NW London
        </p>
      </div>

      {/* Search Filters */}
      <div className="mb-8 p-6 border rounded-lg bg-card">
        <h2 className="text-xl font-semibold mb-4">Filter Applications</h2>
        <div className="grid md:grid-cols-4 gap-4">
          <div>
            <label className="text-sm font-medium">Council</label>
            <select className="w-full mt-1 px-3 py-2 border rounded-md">
              <option value="">All Councils</option>
              <option value="Camden">Camden</option>
              <option value="Barnet">Barnet</option>
              <option value="Brent">Brent</option>
              <option value="Westminster">Westminster</option>
              <option value="Harrow">Harrow</option>
              <option value="Ealing">Ealing</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Status</label>
            <select className="w-full mt-1 px-3 py-2 border rounded-md">
              <option value="">All Statuses</option>
              <option value="Pending">Pending</option>
              <option value="Approved">Approved</option>
              <option value="Refused">Refused</option>
              <option value="Withdrawn">Withdrawn</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Development Type</label>
            <select className="w-full mt-1 px-3 py-2 border rounded-md">
              <option value="">All Types</option>
              <option value="extension">Extension</option>
              <option value="loft_conversion">Loft Conversion</option>
              <option value="basement">Basement</option>
              <option value="new_build">New Build</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Postcode</label>
            <input
              type="text"
              placeholder="e.g., NW3"
              className="w-full mt-1 px-3 py-2 border rounded-md"
            />
          </div>
        </div>
      </div>

      {/* Results */}
      {result.applications.length > 0 ? (
        <>
          <div className="space-y-4">
            {result.applications.map((application) => (
              <PlanningCard key={application.id} application={application} />
            ))}
          </div>

          {/* Pagination */}
          {result.totalPages > 1 && (
            <div className="mt-8 flex justify-center gap-2">
              {currentPage > 1 && (
                <a
                  href={`/planning?page=${currentPage - 1}`}
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
                  href={`/planning?page=${currentPage + 1}`}
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
            No planning applications found. Try adjusting your filters.
          </p>
        </div>
      )}
    </div>
  );
}
