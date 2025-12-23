/**
 * AI Content Generation Service
 * Generate area guides, news articles, and property descriptions using OpenAI
 */

import OpenAI from 'openai';
import type { Area } from '@/types/area';
import type { Property } from '@/types/property';

// Lazy OpenAI client initialization to avoid build-time errors
let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openaiClient;
}

export interface ContentGenerationOptions {
  tone?: 'professional' | 'friendly' | 'informative';
  length?: 'short' | 'medium' | 'long';
  includeStats?: boolean;
}

export class AIContentService {
  private readonly model = process.env.OPENAI_MODEL || 'gpt-4-turbo-preview';
  private readonly maxTokens = parseInt(process.env.OPENAI_MAX_TOKENS || '2000', 10);

  /**
   * Generate a comprehensive area guide
   */
  async generateAreaGuide(
    area: Area,
    stats: any,
    options?: ContentGenerationOptions
  ): Promise<string> {
    const { tone = 'informative', length = 'long' } = options || {};

    const prompt = this.buildAreaGuidePrompt(area, stats, tone, length);

    try {
      const completion = await getOpenAIClient().chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: `You are an expert local area guide writer for North West London.
                     Write engaging, factual content about London neighborhoods.
                     Use a ${tone} tone. Be specific and include relevant details.`,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: this.maxTokens,
        temperature: 0.7,
      });

      return completion.choices[0].message.content || '';
    } catch (error) {
      console.error('Error generating area guide:', error);
      throw new Error('Failed to generate area guide');
    }
  }

  /**
   * Generate a news article from planning data
   */
  async generatePlanningNewsArticle(
    planningData: any,
    context: string
  ): Promise<{ title: string; content: string; excerpt: string }> {
    const prompt = `Write a news article about this planning application in North West London:

Reference: ${planningData.reference}
Address: ${planningData.address}
Proposal: ${planningData.proposal}
Council: ${planningData.council}
Status: ${planningData.status}

Context: ${context}

Write a compelling news article (400-600 words) that:
1. Has a catchy headline
2. Explains what is being proposed
3. Discusses potential impact on the local community
4. Mentions any relevant local context
5. Uses a journalistic tone

Format as JSON with: { "title": "...", "excerpt": "...", "content": "..." }`;

    try {
      const completion = await getOpenAIClient().chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'You are a local news journalist covering North West London. Write engaging, factual articles about local developments.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: this.maxTokens,
        temperature: 0.8,
        response_format: { type: 'json_object' },
      });

      const response = JSON.parse(completion.choices[0].message.content || '{}');
      return {
        title: response.title || '',
        content: response.content || '',
        excerpt: response.excerpt || '',
      };
    } catch (error) {
      console.error('Error generating planning article:', error);
      throw new Error('Failed to generate planning article');
    }
  }

  /**
   * Generate property description
   */
  async generatePropertyDescription(property: Property): Promise<string> {
    const prompt = `Write a compelling property description for:

Address: ${property.addressLine1}, ${property.postcode}
Type: ${property.propertyType}
Bedrooms: ${property.bedrooms}
${property.lastSalePrice ? `Last sale: £${property.lastSalePrice}` : ''}

Write 2-3 paragraphs highlighting:
1. The property features
2. The location and area benefits
3. Potential appeal to buyers

Be factual but engaging. Don't make claims you can't verify.`;

    try {
      const completion = await getOpenAIClient().chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'You are a professional property copywriter. Write accurate, engaging property descriptions.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: 500,
        temperature: 0.7,
      });

      return completion.choices[0].message.content || '';
    } catch (error) {
      console.error('Error generating property description:', error);
      throw new Error('Failed to generate property description');
    }
  }

  /**
   * Generate weekly market report
   */
  async generateMarketReport(
    areaName: string,
    weeklyStats: any
  ): Promise<{ title: string; content: string }> {
    const prompt = `Write a weekly property market report for ${areaName}:

Sales this week: ${weeklyStats.salesCount}
Average price: £${weeklyStats.averagePrice}
Price change: ${weeklyStats.priceChange}%
Most active streets: ${weeklyStats.activeStreets.join(', ')}
Planning applications: ${weeklyStats.planningCount} new

Write a 300-400 word market update that:
1. Summarizes the week's activity
2. Highlights trends
3. Mentions notable sales or developments
4. Provides context for the data

Return as JSON: { "title": "...", "content": "..." }`;

    try {
      const completion = await getOpenAIClient().chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'You are a property market analyst writing weekly reports for North West London.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: 1000,
        temperature: 0.7,
        response_format: { type: 'json_object' },
      });

      const response = JSON.parse(completion.choices[0].message.content || '{}');
      return {
        title: response.title || '',
        content: response.content || '',
      };
    } catch (error) {
      console.error('Error generating market report:', error);
      throw new Error('Failed to generate market report');
    }
  }

  /**
   * Summarize planning application
   */
  async summarizePlanning(proposal: string): Promise<string> {
    const prompt = `Summarize this planning proposal in 1-2 clear sentences:

${proposal}

Focus on what is being proposed and its key features.`;

    try {
      const completion = await getOpenAIClient().chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'You are an expert at summarizing planning applications clearly and concisely.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: 150,
        temperature: 0.5,
      });

      return completion.choices[0].message.content || proposal.substring(0, 200);
    } catch (error) {
      console.error('Error summarizing planning:', error);
      return proposal.substring(0, 200);
    }
  }

  /**
   * Private helper methods
   */
  private buildAreaGuidePrompt(
    area: Area,
    stats: any,
    tone: string,
    length: string
  ): string {
    const wordCount = length === 'short' ? '300-500' : length === 'medium' ? '600-800' : '1000-1500';

    return `Write a comprehensive guide to ${area.name} (${area.postcodePrefix}) in North West London.

Area Details:
- Postcode: ${area.postcodePrefix}
- Council: ${area.council}
${area.description ? `- Overview: ${area.description}` : ''}
${area.population ? `- Population: ${area.population.toLocaleString()}` : ''}

Property Market:
- Average price: £${stats.averagePrice?.toLocaleString() || 'N/A'}
- Price change (1yr): ${stats.priceChange1Year}%
- Total properties: ${stats.propertyCount}

Education:
- Schools: ${stats.schoolCount}
- Average Ofsted: ${stats.avgOfstedRating}

Write ${wordCount} words covering:
1. Introduction and overview of the area
2. Property market and housing
3. Schools and education
4. Transport and accessibility
5. Local amenities and lifestyle
6. Community and demographics
7. Why people love living here

Use a ${tone} tone. Be specific about NW London. Don't make generic statements.
Focus on facts and real benefits. Make it engaging and useful for potential residents.`;
  }

  /**
   * Track token usage for billing
   */
  async trackTokenUsage(tokens: number): Promise<void> {
    // Implementation depends on your billing/tracking system
    console.log(`AI tokens used: ${tokens}`);
  }

  /**
   * Validate content quality
   */
  validateContent(content: string): { valid: boolean; issues: string[] } {
    const issues: string[] = [];

    if (content.length < 100) {
      issues.push('Content too short');
    }

    if (content.includes('I apologize') || content.includes('I cannot')) {
      issues.push('AI refusal detected');
    }

    if (content.toLowerCase().includes('as an ai')) {
      issues.push('AI self-reference detected');
    }

    // Check for placeholder text
    if (content.includes('[') && content.includes(']')) {
      issues.push('Placeholder text detected');
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }
}

// Export singleton instance
export const aiContentService = new AIContentService();

