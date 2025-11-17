/**
 * Planning Card Component
 * Display planning application summary in a card format
 */

import Link from 'next/link';
import { PlanningApplication } from '@/types/planning';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { formatDate } from '@/lib/utils/format';
import { clsx } from 'clsx';

export interface PlanningCardProps {
  application: PlanningApplication;
}

const statusColors: Record<string, string> = {
  Approved: 'bg-green-100 text-green-800',
  Refused: 'bg-red-100 text-red-800',
  Pending: 'bg-yellow-100 text-yellow-800',
  Withdrawn: 'bg-gray-100 text-gray-800',
};

export function PlanningCard({ application }: PlanningCardProps) {
  return (
    <Link href={`/planning/${application.slug}`}>
      <Card className="hover:shadow-lg transition-shadow cursor-pointer">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-lg">{application.reference}</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">{application.address}</p>
            </div>
            <span
              className={clsx(
                'px-2 py-1 rounded text-xs font-medium whitespace-nowrap',
                statusColors[application.status] || 'bg-gray-100 text-gray-800'
              )}
            >
              {application.status}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div>
              <p className="text-sm text-muted-foreground">Proposal</p>
              <p className="text-sm line-clamp-2">{application.proposal}</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Council</p>
                <p className="font-medium">{application.council}</p>
              </div>
              {application.developmentType && (
                <div>
                  <p className="text-sm text-muted-foreground">Type</p>
                  <p className="font-medium capitalize">
                    {application.developmentType.replace('_', ' ')}
                  </p>
                </div>
              )}
              {application.submittedDate && (
                <div>
                  <p className="text-sm text-muted-foreground">Submitted</p>
                  <p className="font-medium">{formatDate(application.submittedDate)}</p>
                </div>
              )}
              {application.decisionDate && (
                <div>
                  <p className="text-sm text-muted-foreground">Decision</p>
                  <p className="font-medium">{formatDate(application.decisionDate)}</p>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
