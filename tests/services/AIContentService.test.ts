/**
 * AIContentService Unit Tests
 */

import { AIContentService } from '../../src/ai/content-generation/ContentGenerationService';

// Mock OpenAI
jest.mock('openai', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: jest.fn().mockResolvedValue({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    title: 'Test Article Title',
                    content: 'This is test content for the article.',
                    excerpt: 'Test excerpt',
                  }),
                },
              },
            ],
          }),
        },
      },
    })),
  };
});

describe('AIContentService', () => {
  let service: AIContentService;

  beforeEach(() => {
    service = new AIContentService();
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    test('should instantiate correctly', () => {
      expect(service).toBeDefined();
      expect(service).toBeInstanceOf(AIContentService);
    });
  });

  describe('Content Validation', () => {
    test('should validate good content as valid', () => {
      const content = 'This is a perfectly fine piece of content that is long enough to pass validation checks.';
      const result = service.validateContent(content);
      
      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    test('should detect content that is too short', () => {
      const content = 'Too short';
      const result = service.validateContent(content);
      
      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Content too short');
    });

    test('should detect AI refusal patterns', () => {
      const content = 'I apologize, but I cannot provide this content because it violates our guidelines.';
      const result = service.validateContent(content);
      
      expect(result.valid).toBe(false);
      expect(result.issues).toContain('AI refusal detected');
    });

    test('should detect AI self-reference patterns', () => {
      const content = 'As an AI language model, I can tell you that this property is very nice and has many features.';
      const result = service.validateContent(content);
      
      expect(result.valid).toBe(false);
      expect(result.issues).toContain('AI self-reference detected');
    });

    test('should detect placeholder text', () => {
      const content = 'This property at [ADDRESS] has [NUMBER] bedrooms and is priced at [PRICE]. It features many amenities.';
      const result = service.validateContent(content);
      
      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Placeholder text detected');
    });

    test('should allow content with acceptable brackets', () => {
      const content = 'This property has a beautiful garden (recently renovated) and a spacious living room. The price is £500,000.';
      const result = service.validateContent(content);
      
      // Parentheses should be fine, only square brackets are flagged
      expect(result.valid).toBe(true);
    });
  });

  describe('Generation Methods', () => {
    test('generateAreaGuide should be a function', () => {
      expect(typeof service.generateAreaGuide).toBe('function');
    });

    test('generatePlanningNewsArticle should be a function', () => {
      expect(typeof service.generatePlanningNewsArticle).toBe('function');
    });

    test('generatePropertyDescription should be a function', () => {
      expect(typeof service.generatePropertyDescription).toBe('function');
    });

    test('generateMarketReport should be a function', () => {
      expect(typeof service.generateMarketReport).toBe('function');
    });

    test('summarizePlanning should be a function', () => {
      expect(typeof service.summarizePlanning).toBe('function');
    });
  });
});
