# Hampstead Renovations - API Documentation

## Base URL
```
Production: https://www.hampsteadrenovations.co.uk/api
Development: http://localhost:3000/api
```

## Authentication
Most public endpoints (enquiries, reports) don't require authentication.
Admin endpoints require Bearer token authentication.

```
Authorization: Bearer YOUR_API_TOKEN
```

---

## Renovation Services

### Submit Renovation Enquiry
Submit a new renovation project enquiry.

**Endpoint:** `POST /renovations/enquiry`

**Request Body:**
```json
{
  "customerName": "John Smith",
  "email": "john@example.com",
  "phone": "07700900123",
  "propertyAddress": "123 Hampstead High Street",
  "postcode": "NW3 1QE",
  "propertyType": "victorian",
  "projectType": "kitchen-renovation",
  "projectDescription": "Complete kitchen renovation with extension",
  "budget": "£30,000-40,000",
  "timeframe": "Next 3 months",
  "urgency": "medium",
  "preferredContactMethod": "email",
  "preferredContactTime": "Weekday mornings"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "success": true,
    "projectId": "uuid",
    "message": "Thank you for your enquiry. Your reference number is abc123..."
  }
}
```

---

## Maintenance Services

### Report Maintenance Issue
Report a property maintenance issue.

**Endpoint:** `POST /maintenance/report`

**Request Body:**
```json
{
  "customerName": "Jane Doe",
  "email": "jane@example.com",
  "phone": "07700900456",
  "propertyAddress": "45 West End Lane",
  "postcode": "NW6 2LU",
  "issueType": "plumbing",
  "description": "Leaking tap in bathroom",
  "urgency": "medium",
  "preferredDate": "2025-01-20"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "success": true,
    "jobId": "uuid",
    "eta": "We will contact you within 2 hours to schedule"
  }
}
```

---

## Emergency Services

### Report Emergency
Report a property emergency (24/7).

**Endpoint:** `POST /emergency/report`

**Request Body:**
```json
{
  "customerName": "Emergency Contact",
  "phone": "07700900789",
  "propertyAddress": "78 Belsize Avenue",
  "postcode": "NW3 4BH",
  "emergencyType": "burst-pipe",
  "description": "Burst pipe in kitchen, water everywhere",
  "safetyRisk": true
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "success": true,
    "callId": "uuid",
    "eta": "25 minutes",
    "contractorName": "John Smith",
    "contractorPhone": "07700900123",
    "instructions": [
      "Turn off the water supply at the stopcock...",
      "Turn off your central heating..."
    ]
  },
  "message": "🚨 Emergency response dispatched"
}
```

### Get Emergency Status
Check the status of an emergency call.

**Endpoint:** `GET /emergency/report?callId={uuid}`

**Response:**
```json
{
  "success": true,
  "data": {
    "callId": "uuid",
    "status": "contractor-en-route",
    "severity": "critical",
    "contractor": {
      "name": "John Smith",
      "phone": "07700900123",
      "eta": "2025-01-15T14:30:00Z"
    },
    "estimatedArrival": "2025-01-15T14:30:00Z",
    "targetResponseTime": "25 minutes",
    "actionsTaken": [],
    "safetyInstructions": []
  }
}
```

---

## Contractor Services

### Search Contractors
Find contractors by trade and area.

**Endpoint:** `GET /contractors/search`

**Query Parameters:**
- `trade` (string): Trade/skill (e.g., "plumber", "electrician")
- `area` (string): NW London area (e.g., "NW3", "NW6")
- `urgency` (string, optional): "normal" | "urgent" | "emergency"
- `minRating` (number, optional): Minimum rating (1-5)
- `specialty` (string, optional): Specialty skill

**Example:**
```
GET /contractors/search?trade=plumber&area=NW3&urgency=emergency&minRating=4.5
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "John Smith",
      "company": "Smith & Sons Plumbing",
      "trades": ["plumber", "heating-engineer"],
      "specialties": ["Boiler installation", "Emergency plumbing"],
      "serviceAreas": ["NW3", "NW6", "NW8"],
      "rating": {
        "overall": 4.9,
        "totalReviews": 156,
        "reliability": 5.0,
        "quality": 4.9
      },
      "availability": {
        "status": "available",
        "emergencyCallouts": true
      },
      "pricing": {
        "hourlyRate": 65,
        "minimumCharge": 95,
        "emergencyCalloutFee": 150
      },
      "verified": true,
      "featured": true
    }
  ],
  "count": 1
}
```

---

## Analytics Services

### Get Street Analytics
Get detailed analytics for a specific street.

**Endpoint:** `GET /analytics/street`

**Query Parameters:**
- `street` (string, required): Street name
- `postcode` (string, required): Postcode

**Example:**
```
GET /analytics/street?street=Hampstead High Street&postcode=NW3 1QE
```

**Response:**
```json
{
  "success": true,
  "data": {
    "street": "Hampstead High Street",
    "postcode": "NW3 1QE",
    "area": "NW3",
    "analytics": {
      "propertyCount": 87,
      "averagePropertyAge": 120,
      "predominantPropertyType": "victorian",
      "conservationArea": true,
      "averagePropertyValue": 1500000,
      "propertyValueTrend": "rising",
      "renovationActivity": {
        "score": 85,
        "trend": "increasing",
        "recentProjects": 45,
        "avgProjectValue": 75000
      },
      "maintenanceNeeds": {
        "score": 85,
        "commonIssues": [
          "Sash window restoration",
          "Roof maintenance",
          "Damp & timber issues"
        ]
      },
      "marketIntelligence": {
        "demandScore": 95,
        "competitionLevel": "high",
        "growthPotential": "very-high",
        "recommendedServices": [
          "Luxury renovations",
          "Heritage restoration"
        ]
      }
    },
    "recommendations": [
      {
        "type": "renovation",
        "title": "Period Property Restoration",
        "description": "High demand for sympathetic renovations...",
        "priority": "high",
        "estimatedROI": 1.35
      }
    ]
  }
}
```

---

## Portfolio Services

### Get Projects
Get portfolio projects by various filters.

**Endpoint:** `GET /portfolio/projects`

**Query Parameters:**
- `area` (string, optional): Filter by area (e.g., "NW3")
- `type` (string, optional): Filter by project type
- `featured` (boolean, optional): Only featured projects
- `limit` (number, optional): Max results (default: 20)

**Example:**
```
GET /portfolio/projects?area=NW3&featured=true&limit=10
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "title": "Victorian House Full Renovation - Hampstead",
      "description": "Complete renovation of a beautiful Victorian property...",
      "projectType": "full-renovation",
      "propertyType": "victorian",
      "location": {
        "street": "Hampstead High Street",
        "area": "NW3",
        "postcode": "NW3 1QE"
      },
      "timeline": {
        "startDate": "2024-03-01T00:00:00Z",
        "endDate": "2024-09-15T00:00:00Z",
        "durationWeeks": 28
      },
      "budget": {
        "total": 185000,
        "breakdown": [...]
      },
      "customerTestimonial": {
        "rating": 5,
        "comment": "Absolutely exceptional work...",
        "verified": true
      },
      "metrics": {
        "propertyValueIncrease": 250000,
        "roi": 1.35
      },
      "featured": true,
      "views": 3420,
      "likes": 287
    }
  ],
  "count": 10
}
```

---

## Review Services

### Submit Review
Submit a customer review.

**Endpoint:** `POST /reviews/submit`

**Request Body:**
```json
{
  "customerName": "Sarah Thompson",
  "projectId": "uuid",
  "type": "project",
  "rating": {
    "overall": 5,
    "quality": 5,
    "value": 5,
    "communication": 5,
    "punctuality": 5
  },
  "title": "Exceptional kitchen renovation",
  "comment": "Hampstead Renovations transformed our kitchen...",
  "location": {
    "area": "NW3",
    "postcode": "NW3 4BH"
  },
  "wouldRecommend": true,
  "projectType": "kitchen-renovation",
  "projectValue": 28000
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "success": true,
    "reviewId": "uuid"
  },
  "message": "Thank you for your review! It will be published after verification."
}
```

### Get Reviews
Get reviews by area or all company reviews.

**Endpoint:** `GET /reviews/submit`

**Query Parameters:**
- `area` (string, optional): Filter by area
- `limit` (number, optional): Max results (default: 50)

**Example:**
```
GET /reviews/submit?area=NW3&limit=20
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "customerName": "Sarah Thompson",
      "type": "project",
      "rating": {
        "overall": 5,
        "quality": 5,
        "value": 5
      },
      "title": "Exceptional kitchen renovation",
      "comment": "Hampstead Renovations transformed our kitchen...",
      "location": {
        "area": "NW3",
        "postcode": "NW3 4BH"
      },
      "verified": true,
      "helpful": 42,
      "createdAt": "2024-10-14T14:20:00Z"
    }
  ],
  "count": 20
}
```

---

## Materials & Suppliers

### Search Suppliers
Find building materials suppliers by category and area.

**Endpoint:** `GET /materials/suppliers`

**Query Parameters:**
- `category` (string): Material category (e.g., "timber", "plumbing")
- `area` (string): NW London area (default: "NW3")

**Example:**
```
GET /materials/suppliers?category=plumbing&area=NW6
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Travis Perkins Cricklewood",
      "type": "builders-merchant",
      "location": {
        "address": "425-429 Cricklewood Broadway",
        "postcode": "NW2 6LR",
        "area": "NW2"
      },
      "contact": {
        "phone": "020 8450 9100",
        "email": "cricklewood@travisperkins.co.uk",
        "website": "https://www.travisperkins.co.uk"
      },
      "openingHours": {
        "monday-friday": "7:00 AM - 5:00 PM",
        "saturday": "7:00 AM - 12:00 PM"
      },
      "rating": {
        "overall": 4.3,
        "totalReviews": 428
      },
      "deliveryInfo": {
        "freeDeliveryThreshold": 100,
        "deliveryFee": 15,
        "sameDayAvailable": false,
        "nextDayAvailable": true
      },
      "tradeDiscount": {
        "available": true,
        "percentage": 15
      },
      "featured": true,
      "verified": true
    }
  ],
  "count": 1
}
```

---

## Error Responses

All endpoints return errors in this format:

```json
{
  "success": false,
  "error": "Error message description",
  "details": {} // Optional, for validation errors
}
```

**Common HTTP Status Codes:**
- `200` - Success
- `201` - Created
- `400` - Bad Request (validation error)
- `401` - Unauthorized
- `404` - Not Found
- `429` - Too Many Requests (rate limited)
- `500` - Internal Server Error

---

## Rate Limiting

**Public Endpoints:**
- 100 requests per 15 minutes per IP

**Authenticated Endpoints:**
- 1000 requests per hour

**Emergency Endpoint:**
- No rate limiting (emergency reports)

---

## Webhooks

Subscribe to webhooks for real-time notifications:

**Available Events:**
- `renovation.enquiry.received`
- `renovation.quote.sent`
- `maintenance.job.scheduled`
- `maintenance.job.completed`
- `emergency.call.received`
- `emergency.contractor.dispatched`
- `emergency.call.completed`
- `review.submitted`
- `contractor.assigned`

**Webhook Payload Example:**
```json
{
  "event": "emergency.call.received",
  "timestamp": "2025-01-15T14:15:00Z",
  "data": {
    "callId": "uuid",
    "emergencyType": "burst-pipe",
    "severity": "critical",
    "area": "NW3"
  }
}
```

---

## Support

**Technical Support:**
- Email: api@hampsteadrenovations.co.uk
- Phone: 07459 345456

**Documentation:**
- https://docs.hampsteadrenovations.co.uk/api

**Status Page:**
- https://status.hampsteadrenovations.co.uk
