/**
 * Planning application type definitions
 */

export type PlanningStatus =
  | 'Pending'
  | 'Approved'
  | 'Refused'
  | 'Withdrawn'
  | 'Invalid'
  | 'Appeal';

export type DevelopmentType =
  | 'extension'
  | 'loft_conversion'
  | 'basement'
  | 'new_build'
  | 'change_of_use'
  | 'demolition'
  | 'tree_work'
  | 'other';

export type Council =
  | 'Camden'
  | 'Barnet'
  | 'Brent'
  | 'Westminster'
  | 'Harrow'
  | 'Ealing';

export interface PlanningApplication {
  id: number;
  reference: string;
  council: Council;
  propertyId?: number;
  address: string;
  postcode?: string;
  areaId?: number;
  latitude?: number;
  longitude?: number;
  proposal: string;
  applicationType?: string;
  developmentType?: DevelopmentType;
  status: PlanningStatus;
  submittedDate?: Date;
  validatedDate?: Date;
  decisionDate?: Date;
  decision?: string;
  appealStatus?: string;
  caseOfficer?: string;
  consultationStartDate?: Date;
  consultationEndDate?: Date;
  slug: string;
  metaTitle?: string;
  metaDescription?: string;
  sourceUrl?: string;
  lastScrapedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface PlanningDocument {
  id: number;
  planningApplicationId: number;
  documentType?: string;
  title: string;
  description?: string;
  fileUrl: string;
  fileName?: string;
  fileSizeBytes?: number;
  mimeType?: string;
  publishedDate?: Date;
  createdAt: Date;
}

export interface PlanningComment {
  id: number;
  planningApplicationId: number;
  commentType?: 'objection' | 'support' | 'neutral';
  commentText?: string;
  commenterName?: string;
  submittedDate?: Date;
  createdAt: Date;
}

export interface PlanningSearchParams {
  council?: Council;
  status?: PlanningStatus;
  developmentType?: DevelopmentType;
  areaId?: number;
  postcode?: string;
  reference?: string;
  fromDate?: Date;
  toDate?: Date;
  page?: number;
  limit?: number;
}

export interface PlanningSearchResult {
  applications: PlanningApplication[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
