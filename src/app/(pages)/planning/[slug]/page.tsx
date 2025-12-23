/**
 * Planning Application Detail Page
 * View detailed information about a specific planning application
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { formatDate } from '@/lib/utils/format';
import { SchemaMarkup, generatePlanningSchema } from '@/lib/seo/schema';
import { ISRConfig } from '@/lib/isr/config';
import { getRecentPlanningIds } from '@/lib/isr/utils';
import type { PlanningApplication } from '@/types/planning';
import { planningService } from '@/services/planning/PlanningService';
import { propertyService } from '@/services/property/PropertyService';

interface PlanningDetailResponse {
  application: PlanningApplication;
  relatedApplications?: PlanningApplication[];
}

// Generate static params for recent planning applications at build time
export async function generateStaticParams() {
  const ids = await getRecentPlanningIds(ISRConfig.buildLimits.planning as number);
  return ids.map((slug) => ({
    slug,
  }));
}

// Configure ISR revalidation
export const revalidate = ISRConfig.revalidation.planning; // 1 hour
export const dynamicParams = true; // Allow on-demand generation for new applications

async function getPlanningData(slug: string): Promise<PlanningDetailResponse | null> {
  try {
    const application = await planningService.getPlanningBySlug(slug);
    if (!application) return null;

    const [documents, comments, nearbyApplications, relatedProperty] = await Promise.all([
      planningService.getDocuments(application.id),
      planningService.getComments(application.id),
      application.latitude && application.longitude
        ? planningService.getNearbyApplications(application.latitude, application.longitude, 500, 10)
        : [],
      application.propertyId
        ? propertyService.getPropertyById(application.propertyId)
        : null,
    ]);

    // Attach documents and comments to application object as expected by the page
    const applicationWithDetails = {
      ...application,
      documents,
      comments,
      relatedProperty
    };

    return {
      application: applicationWithDetails as unknown as PlanningApplication,
      relatedApplications: nearbyApplications,
    };
  } catch (error) {
    console.error('Error fetching planning application:', error);
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const data = await getPlanningData(params.slug);

  if (!data) {
    return {
      title: 'Planning Application Not Found',
    };
  }

  const { application } = data;

  return {
    title: `${application.reference} | Planning Application`,
    description: `${application.description} - Status: ${application.status}. ${
      application.address || ''
    }`,
  };
}

export default async function PlanningDetailPage({
  params,
}: {
  params: { slug: string };
}) {
  const data = await getPlanningData(params.slug);

  if (!data) {
    notFound();
  }

  const { application, relatedApplications } = data;

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'approved':
      case 'granted':
        return 'bg-green-100 text-green-800';
      case 'refused':
      case 'rejected':
        return 'bg-red-100 text-red-800';
      case 'pending':
      case 'under consideration':
        return 'bg-yellow-100 text-yellow-800';
      case 'withdrawn':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-blue-100 text-blue-800';
    }
  };

  return (
    <>
      <SchemaMarkup schema={generatePlanningSchema(application)} />

      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold mb-2">
                Planning Application {application.reference}
              </h1>
              <p className="text-lg text-muted-foreground">{application.address}</p>
            </div>
            <Badge className={getStatusColor(application.status)}>
              {application.status}
            </Badge>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Application Details */}
            <Card>
              <CardHeader>
                <CardTitle>Application Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Description</p>
                    <p className="text-lg">{application.description}</p>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Application Type</p>
                      <p className="font-medium">{application.applicationType || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Council</p>
                      <p className="font-medium">{application.council}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Submitted Date</p>
                      <p className="font-medium">
                        {application.dateReceived
                          ? formatDate(application.dateReceived)
                          : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Decision Date</p>
                      <p className="font-medium">
                        {application.dateDecided
                          ? formatDate(application.dateDecided)
                          : 'Pending'}
                      </p>
                    </div>
                    {application.targetDate && (
                      <div>
                        <p className="text-sm text-muted-foreground">Target Decision Date</p>
                        <p className="font-medium">{formatDate(application.targetDate)}</p>
                      </div>
                    )}
                    {application.ward && (
                      <div>
                        <p className="text-sm text-muted-foreground">Ward</p>
                        <p className="font-medium">{application.ward}</p>
                      </div>
                    )}
                  </div>

                  {application.applicantName && (
                    <div>
                      <p className="text-sm text-muted-foreground">Applicant</p>
                      <p className="font-medium">{application.applicantName}</p>
                    </div>
                  )}

                  {application.agentName && (
                    <div>
                      <p className="text-sm text-muted-foreground">Agent</p>
                      <p className="font-medium">{application.agentName}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Documents */}
            {application.documents && application.documents.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Documents</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {application.documents.map((doc, index) => (
                      <li key={index}>
                        <a
                          href={doc.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline flex items-center"
                        >
                          {doc.name || `Document ${index + 1}`}
                          <svg
                            className="w-4 h-4 ml-1"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                            />
                          </svg>
                        </a>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* Comments */}
            {application.publicComments && application.publicComments.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Public Comments</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {application.publicComments.map((comment, index) => (
                      <div key={index} className="border-b pb-3 last:border-0">
                        <p className="text-sm text-muted-foreground mb-1">
                          {formatDate(comment.date)}
                        </p>
                        <p>{comment.comment}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Status Card */}
            <Card>
              <CardHeader>
                <CardTitle>Current Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <Badge className={`${getStatusColor(application.status)} text-lg px-3 py-1`}>
                    {application.status}
                  </Badge>
                  {application.decisionNotice && (
                    <div>
                      <p className="text-sm text-muted-foreground">Decision Notice</p>
                      <p className="text-sm">{application.decisionNotice}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Important Dates */}
            <Card>
              <CardHeader>
                <CardTitle>Important Dates</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div>
                    <p className="text-sm text-muted-foreground">Received</p>
                    <p className="font-medium">
                      {application.dateReceived
                        ? formatDate(application.dateReceived)
                        : 'N/A'}
                    </p>
                  </div>
                  {application.dateValidated && (
                    <div>
                      <p className="text-sm text-muted-foreground">Validated</p>
                      <p className="font-medium">{formatDate(application.dateValidated)}</p>
                    </div>
                  )}
                  {application.consultationEndDate && (
                    <div>
                      <p className="text-sm text-muted-foreground">Consultation Ends</p>
                      <p className="font-medium">
                        {formatDate(application.consultationEndDate)}
                      </p>
                    </div>
                  )}
                  {application.targetDate && (
                    <div>
                      <p className="text-sm text-muted-foreground">Target Decision</p>
                      <p className="font-medium">{formatDate(application.targetDate)}</p>
                    </div>
                  )}
                  {application.dateDecided && (
                    <div>
                      <p className="text-sm text-muted-foreground">Decided</p>
                      <p className="font-medium">{formatDate(application.dateDecided)}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* View on Council Website */}
            {application.councilUrl && (
              <Card>
                <CardHeader>
                  <CardTitle>Council Website</CardTitle>
                </CardHeader>
                <CardContent>
                  <a
                    href={application.councilUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center text-primary hover:underline"
                  >
                    View on Council Portal
                    <svg
                      className="w-4 h-4 ml-1"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                      />
                    </svg>
                  </a>
                </CardContent>
              </Card>
            )}

            {/* Related Applications */}
            {relatedApplications && relatedApplications.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Related Applications</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {relatedApplications.map((app) => (
                      <div key={app.id} className="border-b pb-3 last:border-0">
                        <a
                          href={`/planning/${app.reference || app.id}`}
                          className="text-sm font-medium hover:text-primary"
                        >
                          {app.reference}
                        </a>
                        <p className="text-xs text-muted-foreground mt-1">
                          {app.description?.substring(0, 80)}...
                        </p>
                        <Badge className={`${getStatusColor(app.status)} text-xs mt-1`}>
                          {app.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </>
  );
}