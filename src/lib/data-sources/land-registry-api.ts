/**
 * Land Registry API Integration
 * Official API client for HM Land Registry data with cost tracking
 */

import axios, { AxiosInstance } from 'axios';
import { dataSourceManager } from './source-manager';

export interface PropertyTransaction {
  transactionId: string;
  price: number;
  date: Date;
  propertyType: 'D' | 'S' | 'T' | 'F' | 'O'; // Detached, Semi, Terraced, Flat, Other
  oldNew: 'Y' | 'N'; // New build or not
  duration: 'F' | 'L'; // Freehold or Leasehold
  address: {
    paon?: string; // Primary addressable object name
    saon?: string; // Secondary addressable object name
    street?: string;
    locality?: string;
    town: string;
    district: string;
    county: string;
    postcode: string;
  };
}

export interface TitleRegisterRequest {
  titleNumber: string;
  email: string;
  reference?: string;
}

export interface TitleRegisterResponse {
  status: 'pending' | 'completed' | 'failed';
  documentUrl?: string;
  cost: number;
  reference: string;
}

export class LandRegistryAPI {
  private pricePaidApi: AxiosInstance;
  private titleApi: AxiosInstance;
  private readonly PRICE_PAID_BASE = 'https://landregistry.data.gov.uk';
  private readonly TITLE_BASE = 'https://eservices.landregistry.gov.uk';
  private readonly COST_PER_TITLE = 3; // £3 per title document

  constructor(private apiKey?: string) {
    this.pricePaidApi = axios.create({
      baseURL: this.PRICE_PAID_BASE,
      timeout: 30000,
      headers: {
        'User-Agent': 'NWLondonLedger/1.0 (https://nwlondonledger.com)',
        'Accept': 'application/json'
      }
    });

    this.titleApi = axios.create({
      baseURL: this.TITLE_BASE,
      timeout: 30000,
      headers: {
        'User-Agent': 'NWLondonLedger/1.0 (https://nwlondonledger.com)',
        'Accept': 'application/json',
        ...(apiKey && { 'Authorization': `Bearer ${apiKey}` })
      }
    });
  }

  /**
   * Search Price Paid Data (Free under OGL)
   */
  async searchPricePaidData(params: {
    postcode?: string;
    town?: string;
    street?: string;
    minPrice?: number;
    maxPrice?: number;
    fromDate?: Date;
    toDate?: Date;
    propertyType?: PropertyTransaction['propertyType'];
    limit?: number;
  }): Promise<PropertyTransaction[]> {
    try {
      // Build SPARQL query
      const query = this.buildSparqlQuery(params);

      const response = await this.pricePaidApi.get('/landregistry/query', {
        params: {
          query,
          output: 'json'
        }
      });

      // Track API usage (free)
      dataSourceManager.trackCost('land-registry', 0);
      dataSourceManager.createAuditEntry('land-registry', 'api', true, {
        endpoint: 'price-paid',
        records: response.data.results?.bindings?.length || 0
      });

      return this.parsePricePaidResults(response.data);
    } catch (error: any) {
      dataSourceManager.createAuditEntry('land-registry', 'api', false, {
        error: error.message
      });
      throw new Error(`Land Registry API error: ${error.message}`);
    }
  }

  /**
   * Get property by specific address (Free)
   */
  async getPropertyByAddress(address: {
    paon?: string;
    street: string;
    postcode: string;
  }): Promise<PropertyTransaction[]> {
    const params = {
      postcode: address.postcode,
      street: address.street,
      limit: 100
    };

    const transactions = await this.searchPricePaidData(params);

    // Filter by PAON if provided
    if (address.paon) {
      return transactions.filter(t =>
        t.address.paon?.toLowerCase() === address.paon.toLowerCase()
      );
    }

    return transactions;
  }

  /**
   * Request Title Register (Paid - £3 per title)
   */
  async requestTitleRegister(request: TitleRegisterRequest): Promise<TitleRegisterResponse> {
    if (!this.apiKey) {
      throw new Error('API key required for title register requests');
    }

    try {
      const response = await this.titleApi.post('/api/title-register', {
        titleNumber: request.titleNumber,
        email: request.email,
        reference: request.reference || `NWL-${Date.now()}`
      });

      // Track cost
      dataSourceManager.trackCost('land-registry', this.COST_PER_TITLE);
      dataSourceManager.createAuditEntry('land-registry', 'api', true, {
        endpoint: 'title-register',
        cost: this.COST_PER_TITLE,
        titleNumber: request.titleNumber
      });

      return {
        status: response.data.status,
        documentUrl: response.data.documentUrl,
        cost: this.COST_PER_TITLE,
        reference: response.data.reference
      };
    } catch (error: any) {
      dataSourceManager.createAuditEntry('land-registry', 'api', false, {
        error: error.message,
        endpoint: 'title-register'
      });
      throw new Error(`Title register request failed: ${error.message}`);
    }
  }

  /**
   * Get area statistics (Free)
   */
  async getAreaStatistics(params: {
    postcode?: string;
    district?: string;
    fromDate: Date;
    toDate: Date;
  }): Promise<{
    averagePrice: number;
    medianPrice: number;
    transactionCount: number;
    pricesByType: Record<string, number>;
  }> {
    const transactions = await this.searchPricePaidData({
      postcode: params.postcode,
      town: params.district,
      fromDate: params.fromDate,
      toDate: params.toDate
    });

    if (transactions.length === 0) {
      return {
        averagePrice: 0,
        medianPrice: 0,
        transactionCount: 0,
        pricesByType: {}
      };
    }

    const prices = transactions.map(t => t.price).sort((a, b) => a - b);
    const averagePrice = prices.reduce((a, b) => a + b, 0) / prices.length;
    const medianPrice = prices[Math.floor(prices.length / 2)];

    const pricesByType: Record<string, number> = {};
    const typeGroups = this.groupBy(transactions, t => t.propertyType);

    for (const [type, trans] of Object.entries(typeGroups)) {
      const typePrices = trans.map(t => t.price);
      pricesByType[this.getPropertyTypeName(type as any)] =
        typePrices.reduce((a, b) => a + b, 0) / typePrices.length;
    }

    return {
      averagePrice,
      medianPrice,
      transactionCount: transactions.length,
      pricesByType
    };
  }

  /**
   * Check API status
   */
  async checkApiStatus(): Promise<{
    pricePaid: boolean;
    titleRegister: boolean;
    message?: string;
  }> {
    let pricePaidStatus = false;
    let titleRegisterStatus = false;

    try {
      await this.pricePaidApi.get('/status');
      pricePaidStatus = true;
    } catch (error) {
      // API might not have status endpoint, try actual query
      try {
        await this.searchPricePaidData({ limit: 1 });
        pricePaidStatus = true;
      } catch (e) {
        pricePaidStatus = false;
      }
    }

    if (this.apiKey) {
      try {
        await this.titleApi.get('/api/status');
        titleRegisterStatus = true;
      } catch (error) {
        titleRegisterStatus = false;
      }
    }

    return {
      pricePaid: pricePaidStatus,
      titleRegister: titleRegisterStatus,
      message: !pricePaidStatus || !titleRegisterStatus
        ? 'Some services may be unavailable'
        : 'All services operational'
    };
  }

  /**
   * Build SPARQL query for Price Paid Data
   */
  private buildSparqlQuery(params: any): string {
    let query = `
PREFIX lrppi: <http://landregistry.data.gov.uk/def/ppi/>
PREFIX lrcommon: <http://landregistry.data.gov.uk/def/common/>

SELECT ?transaction ?price ?date ?propertyType ?newBuild ?duration
       ?paon ?saon ?street ?locality ?town ?district ?county ?postcode
WHERE {
  ?transaction lrppi:pricePaid ?price ;
              lrppi:transactionDate ?date ;
              lrppi:propertyType ?propertyType ;
              lrppi:newBuild ?newBuild ;
              lrppi:estateType ?duration ;
              lrppi:propertyAddress ?address .

  ?address lrcommon:town ?town ;
          lrcommon:postcode ?postcode .

  OPTIONAL { ?address lrcommon:paon ?paon }
  OPTIONAL { ?address lrcommon:saon ?saon }
  OPTIONAL { ?address lrcommon:street ?street }
  OPTIONAL { ?address lrcommon:locality ?locality }
  OPTIONAL { ?address lrcommon:district ?district }
  OPTIONAL { ?address lrcommon:county ?county }
`;

    const filters: string[] = [];

    if (params.postcode) {
      filters.push(`FILTER(regex(?postcode, "^${params.postcode}", "i"))`);
    }

    if (params.town) {
      filters.push(`FILTER(regex(?town, "${params.town}", "i"))`);
    }

    if (params.street) {
      filters.push(`FILTER(regex(?street, "${params.street}", "i"))`);
    }

    if (params.minPrice) {
      filters.push(`FILTER(?price >= ${params.minPrice})`);
    }

    if (params.maxPrice) {
      filters.push(`FILTER(?price <= ${params.maxPrice})`);
    }

    if (params.fromDate) {
      filters.push(`FILTER(?date >= "${params.fromDate.toISOString().split('T')[0]}"^^xsd:date)`);
    }

    if (params.toDate) {
      filters.push(`FILTER(?date <= "${params.toDate.toISOString().split('T')[0]}"^^xsd:date)`);
    }

    if (params.propertyType) {
      const typeUri = `lrppi:propertyType${params.propertyType}`;
      filters.push(`FILTER(?propertyType = ${typeUri})`);
    }

    query += filters.join('\n  ') + '\n}';

    if (params.limit) {
      query += `\nLIMIT ${params.limit}`;
    }

    return query;
  }

  /**
   * Parse SPARQL results to PropertyTransaction
   */
  private parsePricePaidResults(data: any): PropertyTransaction[] {
    if (!data.results?.bindings) return [];

    return data.results.bindings.map((binding: any) => ({
      transactionId: binding.transaction?.value?.split('/').pop() || '',
      price: parseInt(binding.price?.value || '0'),
      date: new Date(binding.date?.value),
      propertyType: this.parsePropertyType(binding.propertyType?.value),
      oldNew: binding.newBuild?.value === 'true' ? 'Y' : 'N',
      duration: this.parseDuration(binding.duration?.value),
      address: {
        paon: binding.paon?.value,
        saon: binding.saon?.value,
        street: binding.street?.value,
        locality: binding.locality?.value,
        town: binding.town?.value || '',
        district: binding.district?.value || '',
        county: binding.county?.value || '',
        postcode: binding.postcode?.value || ''
      }
    }));
  }

  /**
   * Parse property type from URI
   */
  private parsePropertyType(uri?: string): PropertyTransaction['propertyType'] {
    if (!uri) return 'O';
    if (uri.includes('Detached')) return 'D';
    if (uri.includes('Semi')) return 'S';
    if (uri.includes('Terraced')) return 'T';
    if (uri.includes('Flat')) return 'F';
    return 'O';
  }

  /**
   * Parse duration from URI
   */
  private parseDuration(uri?: string): PropertyTransaction['duration'] {
    if (!uri) return 'F';
    return uri.includes('Leasehold') ? 'L' : 'F';
  }

  /**
   * Get property type display name
   */
  private getPropertyTypeName(type: PropertyTransaction['propertyType']): string {
    const names = {
      'D': 'Detached',
      'S': 'Semi-detached',
      'T': 'Terraced',
      'F': 'Flat',
      'O': 'Other'
    };
    return names[type] || 'Unknown';
  }

  /**
   * Helper: Group by function
   */
  private groupBy<T>(array: T[], keyFn: (item: T) => string): Record<string, T[]> {
    return array.reduce((result, item) => {
      const key = keyFn(item);
      if (!result[key]) {
        result[key] = [];
      }
      result[key].push(item);
      return result;
    }, {} as Record<string, T[]>);
  }
}

// Export singleton instance
export const landRegistryAPI = new LandRegistryAPI(process.env.LAND_REGISTRY_API_KEY);