import fs from 'fs';
import path from 'path';

export interface ServiceMapping {
  keywords: string[];
  target_slug: string;
  anchor_text_templates: string[];
}

export interface DynamicLinkingRule {
  trigger: string;
  action: string;
  url_pattern: string;
  example: string;
}

export interface IntegrationMap {
  meta: {
    description: string;
    version: string;
    target_domain: string;
    instructions: string;
  };
  service_mapping: Record<string, ServiceMapping>;
  dynamic_linking_rules: Record<string, DynamicLinkingRule>;
}

export class LinkInjector {
  private integrationMap: IntegrationMap;
  private targetDomain: string;

  constructor(mapPath: string = path.join(process.cwd(), 'ledger_integration_map.json')) {
    try {
      const rawData = fs.readFileSync(mapPath, 'utf-8');
      this.integrationMap = JSON.parse(rawData);
      this.targetDomain = this.integrationMap.meta.target_domain;
    } catch (error) {
      console.error('Failed to load integration map:', error);
      throw new Error('Integration map could not be loaded');
    }
  }

  /**
   * Injects contextual links into a text based on keywords.
   * Implements Strategy B: The "Contextual Mention"
   */
  public injectContextualLinks(content: string, location: string = 'North West London'): string {
    let processedContent = content;
    const mappings = this.integrationMap.service_mapping;

    // Shuffle keys to avoid always linking the same services first
    const serviceKeys = Object.keys(mappings).sort(() => Math.random() - 0.5);

    for (const key of serviceKeys) {
      const service = mappings[key];
      
      // Try to find a keyword match
      for (const keyword of service.keywords) {
        const regex = new RegExp(`\\b${keyword}\\b`, 'i');
        
        if (regex.test(processedContent)) {
          // Select a random anchor text template
          const template = service.anchor_text_templates[Math.floor(Math.random() * service.anchor_text_templates.length)];
          const anchorText = template.replace('{location}', location);
          
          const url = `${this.targetDomain}/${service.target_slug}`;
          const link = `<a href="${url}" target="_blank" rel="dofollow" title="${anchorText}">${keyword}</a>`;
          
          // Replace only the first occurrence to avoid spamming
          processedContent = processedContent.replace(regex, link);
          
          // Break keyword loop for this service to avoid multiple links for same service
          break; 
        }
      }
    }

    return processedContent;
  }

  /**
   * Generates a "Featured Expert" block HTML.
   * Implements Strategy A: The "Featured Expert" Block
   */
  public generateFeaturedExpertBlock(serviceKey: string, location: string = 'NW3'): string {
    const service = this.integrationMap.service_mapping[serviceKey];
    if (!service) {
      return '';
    }

    const mainUrl = `${this.targetDomain}/${service.target_slug}`;
    const localUrl = `${this.targetDomain}/${service.target_slug}/${location.toLowerCase()}.html`;

    return `
      <div class="featured-expert-block p-4 border-l-4 border-blue-600 bg-gray-50 my-6">
        <h3 class="text-lg font-bold mb-2">Planning a ${serviceKey.replace('_', ' ')} in ${location}?</h3>
        <p class="mb-3">Navigating local regulations can be complex. We recommend <strong>Hampstead Renovations</strong>, the leading local specialists.</p>
        <ul class="list-disc pl-5">
          <li><a href="${mainUrl}" target="_blank" rel="dofollow" class="text-blue-600 hover:underline">View their ${serviceKey.replace('_', ' ')} Guide</a></li>
          <li><a href="${localUrl}" target="_blank" rel="dofollow" class="text-blue-600 hover:underline">Check Costs in ${location}</a></li>
        </ul>
      </div>
    `;
  }

  /**
   * Generates a street-level link.
   * Implements Strategy C: The "Hyper-Local Street Link"
   */
  public generateStreetLink(streetName: string, postcode: string, serviceKey: string = 'house-extensions'): string {
    const rule = this.integrationMap.dynamic_linking_rules.street_level;
    const serviceSlug = this.integrationMap.service_mapping[serviceKey]?.target_slug || 'house-extensions';
    
    const streetSlug = streetName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const postcodeSlug = postcode.toLowerCase();

    // /streets/{postcode}/{service_slug}-{street_slug}-{postcode}.html
    let urlPath = rule.url_pattern
      .replace('{postcode}', postcodeSlug)
      .replace('{service_slug}', serviceSlug)
      .replace('{street_slug}', streetSlug)
      .replace('{postcode}', postcodeSlug); // Replace second occurrence if needed

    const fullUrl = `${this.targetDomain}${urlPath}`;

    return `
      <div class="street-link-cta mt-4">
        <p>See recent <a href="${fullUrl}" target="_blank" rel="dofollow" class="font-bold text-blue-700">House Extension projects on ${streetName}</a> by our partner, Hampstead Renovations.</p>
      </div>
    `;
  }
}
