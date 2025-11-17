/**
 * GraphQL Type Definitions
 * Define all GraphQL types, inputs, and enums
 */

import { gql } from 'graphql-tag';

export const typeDefs = gql`
  # Enums
  enum PropertyType {
    DETACHED
    SEMI_DETACHED
    TERRACED
    FLAT
    MAISONETTE
    BUNGALOW
  }

  enum Tenure {
    FREEHOLD
    LEASEHOLD
  }

  enum CouncilTaxBand {
    A
    B
    C
    D
    E
    F
    G
    H
  }

  enum EPCRating {
    A
    B
    C
    D
    E
    F
    G
  }

  enum PlanningStatus {
    PENDING
    APPROVED
    REFUSED
    WITHDRAWN
    INVALID
    APPEAL
  }

  enum DevelopmentType {
    EXTENSION
    LOFT_CONVERSION
    BASEMENT
    NEW_BUILD
    CHANGE_OF_USE
    DEMOLITION
    TREE_WORK
    OTHER
  }

  enum Council {
    CAMDEN
    BARNET
    BRENT
    WESTMINSTER
    HARROW
    EALING
  }

  enum SortOrder {
    ASC
    DESC
  }

  enum PropertySortBy {
    PRICE
    DATE
    BEDROOMS
    AREA
  }

  # Types
  type Property {
    id: Int!
    addressLine1: String!
    addressLine2: String
    street: Street
    area: Area
    postcode: String!
    propertyType: PropertyType
    tenure: Tenure
    bedrooms: Int
    bathrooms: Int
    floorAreaSqm: Float
    currentValue: Float
    lastSalePrice: Float
    lastSaleDate: String
    latitude: Float
    longitude: Float
    slug: String!
    metaTitle: String
    metaDescription: String
    landRegistryId: String
    epcRating: EPCRating
    councilTaxBand: CouncilTaxBand
    sales: [PropertySale!]
    planningApplications: [PlanningApplication!]
    nearbyProperties(limit: Int = 5): [Property!]
    priceHistory: [PricePoint!]
    createdAt: String!
    updatedAt: String!
  }

  type PropertySale {
    id: Int!
    propertyId: Int!
    property: Property
    price: Float!
    saleDate: String!
    propertyType: PropertyType
    tenure: Tenure
    newBuild: Boolean!
    transactionId: String
    createdAt: String!
  }

  type PricePoint {
    date: String!
    price: Float!
    changePercent: Float
  }

  type PlanningApplication {
    id: Int!
    reference: String!
    council: Council!
    property: Property
    address: String!
    postcode: String
    area: Area
    latitude: Float
    longitude: Float
    proposal: String!
    applicationType: String
    developmentType: DevelopmentType
    status: PlanningStatus!
    submittedDate: String
    validatedDate: String
    decisionDate: String
    decision: String
    appealStatus: String
    caseOfficer: String
    consultationStartDate: String
    consultationEndDate: String
    slug: String!
    metaTitle: String
    metaDescription: String
    sourceUrl: String
    documents: [PlanningDocument!]
    comments: [PlanningComment!]
    lastScrapedAt: String
    createdAt: String!
    updatedAt: String!
  }

  type PlanningDocument {
    id: Int!
    planningApplicationId: Int!
    documentType: String
    title: String!
    description: String
    fileUrl: String!
    fileName: String
    fileSizeBytes: Int
    mimeType: String
    publishedDate: String
    createdAt: String!
  }

  type PlanningComment {
    id: Int!
    planningApplicationId: Int!
    commentType: String
    commentText: String
    commenterName: String
    submittedDate: String
    createdAt: String!
  }

  type Area {
    id: Int!
    name: String!
    slug: String!
    postcodePrefix: String!
    description: String
    population: Int
    areaSqkm: Float
    medianIncome: Float
    council: String!
    latitude: Float
    longitude: Float
    properties(limit: Int = 10, offset: Int = 0): PropertyConnection!
    planningApplications(limit: Int = 10, offset: Int = 0, status: PlanningStatus): PlanningConnection!
    streets: [Street!]
    schools: [School!]
    stats: AreaStats
    createdAt: String!
    updatedAt: String!
  }

  type Street {
    id: Int!
    name: String!
    slug: String!
    area: Area
    postcodePrefix: String
    propertyCount: Int!
    averagePrice: Float
    properties(limit: Int = 10, offset: Int = 0): PropertyConnection!
    createdAt: String!
    updatedAt: String!
  }

  type School {
    id: Int!
    name: String!
    slug: String!
    urn: String
    schoolType: String
    phase: String
    religiousCharacter: String
    addressLine1: String
    addressLine2: String
    postcode: String
    area: Area
    latitude: Float
    longitude: Float
    ofstedRating: String
    ofstedDate: String
    ofstedReportUrl: String
    studentCount: Int
    pupilTeacherRatio: Float
    admissionPolicy: String
    catchmentDistanceMeters: Float
    phone: String
    email: String
    website: String
    createdAt: String!
    updatedAt: String!
  }

  type AreaStats {
    propertyCount: Int!
    averagePrice: Float!
    medianPrice: Float!
    priceChange1Year: Float!
    priceChange5Year: Float!
    schoolCount: Int!
    avgOfstedRating: String!
    planningApplications: PlanningStats!
  }

  type PlanningStats {
    total: Int!
    approved: Int!
    pending: Int!
    refused: Int!
    approvalRate: Float!
  }

  # Connections for pagination
  type PropertyConnection {
    nodes: [Property!]!
    edges: [PropertyEdge!]!
    pageInfo: PageInfo!
    totalCount: Int!
  }

  type PropertyEdge {
    node: Property!
    cursor: String!
  }

  type PlanningConnection {
    nodes: [PlanningApplication!]!
    edges: [PlanningEdge!]!
    pageInfo: PageInfo!
    totalCount: Int!
  }

  type PlanningEdge {
    node: PlanningApplication!
    cursor: String!
  }

  type PageInfo {
    hasNextPage: Boolean!
    hasPreviousPage: Boolean!
    startCursor: String
    endCursor: String
  }

  # Search Results
  type SearchResult {
    properties: [Property!]!
    planningApplications: [PlanningApplication!]!
    areas: [Area!]!
    streets: [Street!]!
    totalResults: Int!
    facets: SearchFacets
  }

  type SearchFacets {
    propertyTypes: [FacetBucket!]!
    councils: [FacetBucket!]!
    priceRanges: [FacetBucket!]!
  }

  type FacetBucket {
    key: String!
    count: Int!
  }

  # Inputs
  input PropertySearchInput {
    postcode: String
    areaId: Int
    streetId: Int
    propertyType: PropertyType
    minPrice: Float
    maxPrice: Float
    minBedrooms: Int
    maxBedrooms: Int
    tenure: Tenure
    epcRating: EPCRating
    councilTaxBand: CouncilTaxBand
    sortBy: PropertySortBy
    sortOrder: SortOrder
  }

  input PlanningSearchInput {
    council: Council
    status: PlanningStatus
    developmentType: DevelopmentType
    areaId: Int
    postcode: String
    reference: String
    fromDate: String
    toDate: String
    sortOrder: SortOrder
  }

  input PaginationInput {
    limit: Int = 10
    offset: Int = 0
    cursor: String
  }

  # Mutations
  input PropertyInput {
    addressLine1: String!
    addressLine2: String
    postcode: String!
    propertyType: PropertyType
    tenure: Tenure
    bedrooms: Int
    bathrooms: Int
    floorAreaSqm: Float
    currentValue: Float
    latitude: Float
    longitude: Float
  }

  input PlanningApplicationInput {
    reference: String!
    council: Council!
    address: String!
    postcode: String
    proposal: String!
    applicationType: String
    developmentType: DevelopmentType
    status: PlanningStatus!
    submittedDate: String
  }

  type MutationResponse {
    success: Boolean!
    message: String
  }

  # Subscriptions
  type PlanningUpdate {
    application: PlanningApplication!
    changeType: String!
    previousStatus: PlanningStatus
    newStatus: PlanningStatus
    timestamp: String!
  }

  type PropertyUpdate {
    property: Property!
    changeType: String!
    previousPrice: Float
    newPrice: Float
    timestamp: String!
  }

  # Queries
  type Query {
    # Property queries
    property(id: Int, slug: String): Property
    properties(search: PropertySearchInput, pagination: PaginationInput): PropertyConnection!
    propertiesByIds(ids: [Int!]!): [Property!]!
    propertiesByArea(areaId: Int!, pagination: PaginationInput): PropertyConnection!
    nearbyProperties(latitude: Float!, longitude: Float!, radiusKm: Float = 1): [Property!]!

    # Planning queries
    planningApplication(id: Int, reference: String, slug: String): PlanningApplication
    planningApplications(search: PlanningSearchInput, pagination: PaginationInput): PlanningConnection!
    planningApplicationsByIds(ids: [Int!]!): [PlanningApplication!]!
    planningApplicationsByArea(areaId: Int!, status: PlanningStatus, pagination: PaginationInput): PlanningConnection!

    # Area queries
    area(id: Int, slug: String, postcodePrefix: String): Area
    areas: [Area!]!
    areasByIds(ids: [Int!]!): [Area!]!

    # Street queries
    street(id: Int, slug: String): Street
    streetsByArea(areaId: Int!): [Street!]!

    # School queries
    school(id: Int, slug: String): School
    schoolsByArea(areaId: Int!): [School!]!
    nearbySchools(latitude: Float!, longitude: Float!, radiusKm: Float = 2): [School!]!

    # Search queries
    search(query: String!, filters: PropertySearchInput): SearchResult!
    autocomplete(query: String!, limit: Int = 5): [String!]!

    # Statistics queries
    marketStats(areaId: Int, postcodePrefix: String): AreaStats
    priceHistory(propertyId: Int, areaId: Int, period: String = "1Y"): [PricePoint!]!
  }

  # Mutations
  type Mutation {
    # Property mutations
    createProperty(input: PropertyInput!): Property!
    updateProperty(id: Int!, input: PropertyInput!): Property!
    deleteProperty(id: Int!): MutationResponse!

    # Planning mutations
    createPlanningApplication(input: PlanningApplicationInput!): PlanningApplication!
    updatePlanningApplication(id: Int!, input: PlanningApplicationInput!): PlanningApplication!
    deletePlanningApplication(id: Int!): MutationResponse!

    # Cache mutations
    invalidateCache(keys: [String!]!): MutationResponse!
    warmCache(entityType: String!): MutationResponse!
  }

  # Subscriptions
  type Subscription {
    # Planning subscriptions
    planningStatusChanged(areaId: Int, council: Council): PlanningUpdate!
    newPlanningApplication(areaId: Int, council: Council): PlanningApplication!

    # Property subscriptions
    propertyPriceChanged(areaId: Int, streetId: Int): PropertyUpdate!
    newPropertyListing(areaId: Int, propertyType: PropertyType): Property!
  }
`;