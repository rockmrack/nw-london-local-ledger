import { NextRequest, NextResponse } from 'next/server';
import { PortfolioService } from '@/services/portfolio/PortfolioService';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const area = searchParams.get('area');
    const type = searchParams.get('type');
    const featured = searchParams.get('featured') === 'true';
    const limit = searchParams.get('limit') ? Number(searchParams.get('limit')) : 20;

    const portfolioService = new PortfolioService({} as any, {} as any);

    let projects;
    if (featured) {
      projects = await portfolioService.getFeaturedProjects(limit);
    } else if (area) {
      projects = await portfolioService.getProjectsByArea(area, limit);
    } else if (type) {
      projects = await portfolioService.getProjectsByType(type, limit);
    } else {
      projects = await portfolioService.getFeaturedProjects(limit);
    }

    return NextResponse.json({
      success: true,
      data: projects,
      count: projects.length
    });

  } catch (error) {
    console.error('Portfolio fetch error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch portfolio projects'
    }, { status: 500 });
  }
}
