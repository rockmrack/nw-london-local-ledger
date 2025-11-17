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
  | 'Ealing'
  | 'Hammersmith and Fulham'
  | 'Kensington and Chelsea'
  | 'Hillingdon'
  | 'Hounslow';

export interface PlanningApplication {
  id: number | string;
  reference: string;
  council: Council | string;
  propertyId?: number;
  address: string;
  postcode?: string;
  areaId?: number;
  latitude?: number;
  longitude?: number;
  proposal?: string;
  description?: string;  // Alternative to proposal
  applicationType?: string;
  developmentType?: DevelopmentType;
  status: PlanningStatus | string;
  submittedDate?: Date | string;
  validatedDate?: Date | string;
  decisionDate?: Date | string;
  dateReceived?: string;  // Alternative date field
  dateValidated?: string; // Alternative date field
  dateDecided?: string;   // Alternative date field
  targetDate?: string;    // Target decision date
  decision?: string;
  decisionNotice?: string;
  appealStatus?: string;
  caseOfficer?: string;
  applicantName?: string;
  agentName?: string;
  ward?: string;
  consultationStartDate?: Date | string;
  consultationEndDate?: Date | string;
  councilUrl?: string;
  documents?: Array<{
    name?: string;
    url: string;
    type?: string;
  }>;
  publicComments?: Array<{
    date: string;
    comment: string;
    name?: string;
  }>;
  slug?: string;
  metaTitle?: string;
  metaDescription?: string;
  sourceUrl?: string;
  lastScrapedAt?: Date | string;
  createdAt?: Date | string;
  updatedAt?: Date | string;
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
