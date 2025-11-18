import { NextRequest, NextResponse } from 'next/server';
import { MaintenanceService } from '@/services/maintenance/MaintenanceService';
import { z } from 'zod';

const MaintenanceReportSchema = z.object({
  customerName: z.string().min(1),
  email: z.string().email(),
  phone: z.string(),
  propertyAddress: z.string().min(1),
  postcode: z.string().regex(/^NW\d{1,2}\s?\d[A-Z]{2}$/i),
  issueType: z.string(),
  description: z.string().min(10),
  urgency: z.enum(['low', 'medium', 'high', 'critical']),
  preferredDate: z.string().optional()
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = MaintenanceReportSchema.parse(body);

    const maintenanceService = new MaintenanceService({} as any, {} as any);

    const result = await maintenanceService.reportIssue(validated);

    return NextResponse.json({
      success: true,
      data: result
    }, { status: 201 });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: 'Validation error',
        details: error.errors
      }, { status: 400 });
    }

    console.error('Maintenance report error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to report maintenance issue'
    }, { status: 500 });
  }
}
