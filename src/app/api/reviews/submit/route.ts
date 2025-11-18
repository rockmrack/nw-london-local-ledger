import { NextRequest, NextResponse } from 'next/server';
import { ReviewsService } from '@/services/reviews/ReviewsService';
import { z } from 'zod';

const ReviewSubmitSchema = z.object({
  customerName: z.string().min(1),
  projectId: z.string().uuid().optional(),
  contractorId: z.string().uuid().optional(),
  type: z.enum(['project', 'contractor', 'company', 'material', 'supplier']),
  rating: z.object({
    overall: z.number().min(1).max(5),
    quality: z.number().min(1).max(5).optional(),
    value: z.number().min(1).max(5).optional(),
    communication: z.number().min(1).max(5).optional(),
    punctuality: z.number().min(1).max(5).optional(),
    cleanliness: z.number().min(1).max(5).optional(),
    professionalism: z.number().min(1).max(5).optional()
  }),
  title: z.string().min(5),
  comment: z.string().min(20),
  location: z.object({
    area: z.string(),
    postcode: z.string()
  }),
  wouldRecommend: z.boolean(),
  projectType: z.string().optional(),
  projectValue: z.number().optional()
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = ReviewSubmitSchema.parse(body);

    const reviewsService = new ReviewsService({} as any, {} as any);
    const result = await reviewsService.submitReview(validated);

    return NextResponse.json({
      success: true,
      data: result,
      message: 'Thank you for your review! It will be published after verification.'
    }, { status: 201 });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: 'Validation error',
        details: error.errors
      }, { status: 400 });
    }

    console.error('Review submission error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to submit review'
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const area = searchParams.get('area');
    const limit = searchParams.get('limit') ? Number(searchParams.get('limit')) : 50;

    const reviewsService = new ReviewsService({} as any, {} as any);

    let reviews;
    if (area) {
      reviews = await reviewsService.getReviewsByArea(area);
    } else {
      reviews = await reviewsService.getCompanyReviews(limit);
    }

    return NextResponse.json({
      success: true,
      data: reviews,
      count: reviews.length
    });

  } catch (error) {
    console.error('Reviews fetch error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch reviews'
    }, { status: 500 });
  }
}
