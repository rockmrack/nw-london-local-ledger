import { NextRequest, NextResponse } from 'next/server';
import { ContractorNetworkService } from '@/services/contractors/ContractorNetworkService';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const trade = searchParams.get('trade') || '';
    const area = searchParams.get('area') || 'NW3';
    const urgency = searchParams.get('urgency') as 'normal' | 'urgent' | 'emergency' | undefined;
    const minRating = searchParams.get('minRating') ? Number(searchParams.get('minRating')) : undefined;
    const specialty = searchParams.get('specialty') || undefined;

    const contractorService = new ContractorNetworkService({} as any, {} as any);

    const contractors = await contractorService.findContractors({
      trade,
      area,
      urgency,
      minRating,
      specialty
    });

    return NextResponse.json({
      success: true,
      data: contractors,
      count: contractors.length
    });

  } catch (error) {
    console.error('Contractor search error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to search contractors'
    }, { status: 500 });
  }
}
