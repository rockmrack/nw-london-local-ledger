/**
 * Search Autocomplete API
 * GET /api/search/autocomplete
 */

import { NextRequest, NextResponse } from 'next/server';
import { autocomplete } from '@/lib/search/advanced-search';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q') || '';
    const type = (searchParams.get('type') || 'property') as 'property' | 'planning' | 'area';
    const limit = Number(searchParams.get('limit') || '10');

    const suggestions = await autocomplete(query, type, limit);

    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error('Autocomplete error:', error);
    return NextResponse.json(
      { error: 'Autocomplete failed' },
      { status: 500 }
    );
  }
}
