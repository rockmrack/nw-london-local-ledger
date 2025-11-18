import { NextRequest, NextResponse } from 'next/server';
import { RenovationService } from '@/services/renovation/RenovationService';
import { z } from 'zod';

const EnquirySchema = z.object({
  customerName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().regex(/^(\+44|0)[0-9]{10}$/),
  propertyAddress: z.string().min(1),
  postcode: z.string().regex(/^NW\d{1,2}\s?\d[A-Z]{2}$/i),
  propertyType: z.string(),
  projectType: z.string(),
  projectDescription: z.string().min(10),
  budget: z.string().optional(),
  timeframe: z.string().optional(),
  urgency: z.enum(['low', 'medium', 'high', 'urgent']),
  preferredContactMethod: z.enum(['email', 'phone', 'both']),
  preferredContactTime: z.string().optional()
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = EnquirySchema.parse(body);

    // Initialize service (in production, pass real DB and Redis connections)
    const renovationService = new RenovationService({} as any, {} as any);

    const result = await renovationService.submitEnquiry(validated as any);

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

    console.error('Renovation enquiry error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to submit enquiry'
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('projectId');

  if (!projectId) {
    return NextResponse.json({
      success: false,
      error: 'Project ID required'
    }, { status: 400 });
  }

  try {
    // In production, fetch from database
    return NextResponse.json({
      success: true,
      data: { projectId, status: 'enquiry' }
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch project'
    }, { status: 500 });
  }
}
