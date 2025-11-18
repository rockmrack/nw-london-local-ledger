import { NextRequest, NextResponse } from 'next/server';
import { EmergencyService } from '@/services/emergency/EmergencyService';
import { z } from 'zod';

const EmergencyReportSchema = z.object({
  customerName: z.string().min(1),
  phone: z.string().min(10),
  propertyAddress: z.string().min(1),
  postcode: z.string().regex(/^NW\d{1,2}\s?\d[A-Z]{2}$/i),
  emergencyType: z.string(),
  description: z.string().min(5),
  safetyRisk: z.boolean().optional()
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = EmergencyReportSchema.parse(body);

    const emergencyService = new EmergencyService({} as any, {} as any);

    const result = await emergencyService.reportEmergency(validated);

    // Send immediate notification to emergency team
    // In production, trigger SMS/push notifications

    return NextResponse.json({
      success: true,
      data: result,
      message: '🚨 Emergency response dispatched'
    }, { status: 201 });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: 'Validation error',
        details: error.errors
      }, { status: 400 });
    }

    console.error('Emergency report error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to report emergency'
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const callId = searchParams.get('callId');

  if (!callId) {
    return NextResponse.json({
      success: false,
      error: 'Call ID required'
    }, { status: 400 });
  }

  try {
    const emergencyService = new EmergencyService({} as any, {} as any);
    const status = await emergencyService.getEmergencyStatus(callId);

    return NextResponse.json({
      success: true,
      data: status
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch emergency status'
    }, { status: 500 });
  }
}
