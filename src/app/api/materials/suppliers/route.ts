import { NextRequest, NextResponse } from 'next/server';
import { MaterialsService } from '@/services/suppliers/MaterialsService';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const category = searchParams.get('category') || '';
    const area = searchParams.get('area') || 'NW3';

    const materialsService = new MaterialsService({} as any, {} as any);
    const suppliers = await materialsService.findSuppliers(category, area);

    return NextResponse.json({
      success: true,
      data: suppliers,
      count: suppliers.length
    });

  } catch (error) {
    console.error('Suppliers search error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to search suppliers'
    }, { status: 500 });
  }
}
