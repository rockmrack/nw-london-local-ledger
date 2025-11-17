/**
 * Area and location type definitions
 */

export interface Area {
  id: number;
  name: string;
  slug: string;
  postcodePrefix: string;
  description?: string;
  population?: number;
  areaSqkm?: number;
  medianIncome?: number;
  council: string;
  latitude?: number;
  longitude?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Postcode {
  id: number;
  postcode: string;
  areaId?: number;
  outwardCode: string;
  inwardCode: string;
  latitude: number;
  longitude: number;
  propertyCount: number;
  averagePrice?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Street {
  id: number;
  name: string;
  slug: string;
  areaId?: number;
  postcodePrefix?: string;
  propertyCount: number;
  averagePrice?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface School {
  id: number;
  name: string;
  slug: string;
  urn?: string;
  schoolType?: string;
  phase?: string;
  religiousCharacter?: string;
  addressLine1?: string;
  addressLine2?: string;
  postcode?: string;
  areaId?: number;
  latitude?: number;
  longitude?: number;
  ofstedRating?: string;
  ofstedDate?: Date;
  ofstedReportUrl?: string;
  studentCount?: number;
  pupilTeacherRatio?: number;
  admissionPolicy?: string;
  catchmentDistanceMeters?: number;
  phone?: string;
  email?: string;
  website?: string;
  metaTitle?: string;
  metaDescription?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AreaStats {
  area: Area;
  propertyCount: number;
  averagePrice: number;
  medianPrice: number;
  priceChange1Year: number;
  priceChange5Year: number;
  schoolCount: number;
  avgOfstedRating: string;
  planningApplications: {
    total: number;
    approved: number;
    pending: number;
    refused: number;
  };
}
