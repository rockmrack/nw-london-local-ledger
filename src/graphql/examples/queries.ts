/**
 * Example GraphQL Queries
 * Demonstrates efficient querying with DataLoader preventing N+1 issues
 */

export const EXAMPLE_QUERIES = {
  // Example 1: Fetching properties with related data
  // DataLoader automatically batches area and street lookups
  getPropertiesWithArea: `
    query GetPropertiesWithArea($limit: Int, $areaId: Int) {
      properties(
        search: { areaId: $areaId }
        pagination: { limit: $limit }
      ) {
        nodes {
          id
          addressLine1
          postcode
          currentValue
          bedrooms

          # These are resolved with DataLoader - no N+1!
          area {
            id
            name
            council
          }

          street {
            id
            name
            averagePrice
          }

          # Nested sales are batch loaded
          sales {
            price
            saleDate
          }
        }

        pageInfo {
          hasNextPage
          endCursor
        }

        totalCount
      }
    }
  `,

  // Example 2: Complex area query with multiple relations
  // All nested queries use DataLoaders for efficient batching
  getAreaDetails: `
    query GetAreaDetails($areaId: Int!) {
      area(id: $areaId) {
        id
        name
        description
        population
        council

        # Stats are pre-calculated and cached
        stats {
          propertyCount
          averagePrice
          medianPrice
          priceChange1Year
          planningApplications {
            total
            approved
            pending
            approvalRate
          }
        }

        # Properties are batch loaded and paginated
        properties(limit: 5) {
          nodes {
            id
            addressLine1
            currentValue
            propertyType

            # Even nested relations are efficiently loaded
            planningApplications {
              reference
              status
              proposal
            }
          }
        }

        # Schools are batch loaded
        schools {
          name
          ofstedRating
          studentCount
        }

        # Streets are batch loaded
        streets {
          name
          propertyCount
          averagePrice
        }
      }
    }
  `,

  // Example 3: Planning applications with documents and comments
  // Demonstrates deep nesting without N+1 queries
  getPlanningApplications: `
    query GetPlanningApplications($council: Council, $status: PlanningStatus) {
      planningApplications(
        search: { council: $council, status: $status }
        pagination: { limit: 20 }
      ) {
        nodes {
          id
          reference
          council
          status
          proposal
          submittedDate

          # Property is batch loaded
          property {
            addressLine1
            postcode
            currentValue

            # Even nested area is efficiently loaded
            area {
              name
              council
            }
          }

          # Documents are batch loaded
          documents {
            title
            documentType
            fileUrl
            publishedDate
          }

          # Comments are batch loaded
          comments {
            commentType
            commentText
            submittedDate
          }
        }

        totalCount
      }
    }
  `,

  // Example 4: Search across multiple entities
  // Parallel data fetching with efficient caching
  searchAll: `
    query SearchAll($query: String!) {
      search(query: $query) {
        properties {
          id
          addressLine1
          currentValue

          # Related data is still efficiently loaded
          area {
            name
          }
        }

        planningApplications {
          reference
          address
          status
          proposal
        }

        areas {
          name
          postcodePrefix
          council
        }

        streets {
          name
          propertyCount
        }

        totalResults
      }
    }
  `,

  // Example 5: Nearby properties with distance calculation
  // Spatial queries with related data loading
  getNearbyProperties: `
    query GetNearbyProperties($latitude: Float!, $longitude: Float!, $radiusKm: Float) {
      nearbyProperties(
        latitude: $latitude
        longitude: $longitude
        radiusKm: $radiusKm
      ) {
        id
        addressLine1
        currentValue

        # Even for spatial queries, relations are batch loaded
        area {
          name
        }

        # Calculate price history efficiently
        priceHistory {
          date
          price
          changePercent
        }
      }
    }
  `,

  // Example 6: Batch loading multiple entities by IDs
  // Demonstrates efficient batch loading
  getMultipleEntities: `
    query GetMultipleEntities($propertyIds: [Int!]!, $areaIds: [Int!]!) {
      # All properties loaded in single batch
      propertiesByIds(ids: $propertyIds) {
        id
        addressLine1
        currentValue

        # Related data for all properties loaded in single batch
        area {
          name
        }

        sales {
          price
          saleDate
        }
      }

      # All areas loaded in single batch
      areasByIds(ids: $areaIds) {
        id
        name
        stats {
          propertyCount
          averagePrice
        }
      }
    }
  `,

  // Example 7: Subscription for real-time updates
  subscribeToPlanning: `
    subscription PlanningUpdates($areaId: Int, $council: Council) {
      planningStatusChanged(areaId: $areaId, council: $council) {
        application {
          id
          reference
          status

          # Even in subscriptions, DataLoaders work
          property {
            addressLine1
          }

          area {
            name
          }
        }

        changeType
        previousStatus
        newStatus
        timestamp
      }
    }
  `,

  // Example 8: Mutation with cache invalidation
  updatePropertyMutation: `
    mutation UpdateProperty($id: Int!, $input: PropertyInput!) {
      updateProperty(id: $id, input: $input) {
        id
        addressLine1
        currentValue

        # Updated relations are efficiently loaded
        area {
          name
          stats {
            averagePrice
          }
        }
      }
    }
  `
};

// Example usage with the client
export const exampleUsage = `
import { graphqlRequest, batchedGraphqlRequest, prefetchQuery } from '@/graphql/client';

// 1. Simple query with DataLoader benefits
const properties = await graphqlRequest(
  EXAMPLE_QUERIES.getPropertiesWithArea,
  { limit: 10, areaId: 1 }
);

// 2. Batched requests for optimal performance
const [props1, props2] = await Promise.all([
  batchedGraphqlRequest(EXAMPLE_QUERIES.getPropertiesWithArea, { areaId: 1 }),
  batchedGraphqlRequest(EXAMPLE_QUERIES.getPropertiesWithArea, { areaId: 2 })
]);

// 3. Prefetch queries for instant loading
await prefetchQuery(
  EXAMPLE_QUERIES.getAreaDetails,
  { areaId: 1 },
  600000 // Cache for 10 minutes
);

// 4. Subscribe to real-time updates
import { subscriptionClient } from '@/graphql/client';

await subscriptionClient.connect();
subscriptionClient.subscribe(
  'planning-updates',
  EXAMPLE_QUERIES.subscribeToPlanning,
  { council: 'CAMDEN' },
  (data) => {
    console.log('Planning update:', data);
  }
);
`;