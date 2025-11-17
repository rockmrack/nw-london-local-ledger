/**
 * Property-related type definitions
 */

export type PropertyType =
  | 'detached'
  | 'semi-detached'
  | 'terraced'
  | 'flat'
  | 'maisonette'
  | 'bungalow';

export type Tenure = 'freehold' | 'leasehold';

export type CouncilTaxBand = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H';

export type EPCRating = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';

export interface Property {
  id: number;
  addressLine1: string;
  addressLine2?: string;
  streetId?: number;
  areaId?: number;
  postcodeId?: number;
  postcode: string;
  propertyType?: PropertyType;
  tenure?: Tenure;
  bedrooms?: number;
  bathrooms?: number;
  floorAreaSqm?: number;
  currentValue?: number;
  lastSalePrice?: number;
  lastSaleDate?: Date;
  latitude?: number;
  longitude?: number;
  slug: string;
  metaTitle?: string;
  metaDescription?: string;
  landRegistryId?: string;
  epcRating?: EPCRating;
  councilTaxBand?: CouncilTaxBand;
  createdAt: Date;
  updatedAt: Date;
}

export interface PropertySale {
  id: number;
  propertyId: number;
  price: number;
  saleDate: Date;
  propertyType?: PropertyType;
  tenure?: Tenure;
  newBuild: boolean;
  transactionId?: string;
  createdAt: Date;
}

export interface PropertyWithSales extends Property {
  sales: PropertySale[];
}

export interface PropertySearchParams {
  postcode?: string;
  areaId?: number;
  propertyType?: PropertyType;
  minPrice?: number;
  maxPrice?: number;
  minBedrooms?: number;
  maxBedrooms?: number;
  page?: number;
  limit?: number;
  sortBy?: 'price' | 'date' | 'bedrooms';
  sortOrder?: 'asc' | 'desc';
}

export interface PropertySearchResult {
  properties: Property[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
