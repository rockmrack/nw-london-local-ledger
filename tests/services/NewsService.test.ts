/**
 * NewsService Unit Tests
 */

/// <reference types="jest" />

import { NewsService } from '../../src/services/news/NewsService';

// Mock dependencies
jest.mock('../../src/lib/db/client', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('../../src/ai/content-generation/ContentGenerationService', () => ({
  aiContentService: {
    generatePlanningNewsArticle: jest.fn().mockResolvedValue({
      title: 'Test Planning Article',
      content: 'This is test content about planning permission.',
      excerpt: 'Test excerpt',
    }),
    generateMarketReport: jest.fn().mockResolvedValue({
      title: 'Weekly Market Report',
      content: 'Market report content.',
    }),
    validateContent: jest.fn().mockReturnValue({ valid: true, issues: [] }),
  },
}));

jest.mock('../../src/services/LinkInjector', () => ({
  linkInjector: {
    injectContextualLinks: jest.fn((content: string) => content),
    generateFeaturedExpertBlock: jest.fn().mockReturnValue('<div>Expert Block</div>'),
  },
}));

describe('NewsService', () => {
  let newsService: NewsService;

  beforeEach(() => {
    newsService = new NewsService();
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    test('should instantiate correctly', () => {
      expect(newsService).toBeDefined();
      expect(newsService).toBeInstanceOf(NewsService);
    });
  });

  describe('Article Operations', () => {
    test('getArticleById should be a function', () => {
      expect(typeof newsService.getArticleById).toBe('function');
    });

    test('getArticleBySlug should be a function', () => {
      expect(typeof newsService.getArticleBySlug).toBe('function');
    });

    test('getPublishedArticles should be a function', () => {
      expect(typeof newsService.getPublishedArticles).toBe('function');
    });

    test('getFeaturedArticles should be a function', () => {
      expect(typeof newsService.getFeaturedArticles).toBe('function');
    });
  });

  describe('AI Generation', () => {
    test('generatePlanningArticle should be a function', () => {
      expect(typeof newsService.generatePlanningArticle).toBe('function');
    });

    test('generateWeeklyReport should be a function', () => {
      expect(typeof newsService.generateWeeklyReport).toBe('function');
    });
  });

  describe('Article Management', () => {
    test('publishArticle should be a function', () => {
      expect(typeof newsService.publishArticle).toBe('function');
    });

    test('markAsReviewed should be a function', () => {
      expect(typeof newsService.markAsReviewed).toBe('function');
    });

    test('incrementViewCount should be a function', () => {
      expect(typeof newsService.incrementViewCount).toBe('function');
    });
  });

  describe('Tags', () => {
    test('getArticleTags should be a function', () => {
      expect(typeof newsService.getArticleTags).toBe('function');
    });

    test('addTagToArticle should be a function', () => {
      expect(typeof newsService.addTagToArticle).toBe('function');
    });
  });
});
