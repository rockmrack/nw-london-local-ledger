/**
 * Property Card Component
 * Display property summary in a card format
 */

import Link from 'next/link';
import { Property } from '@/types/property';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { formatPrice, formatDate } from '@/lib/utils/format';

export interface PropertyCardProps {
  property: Property;
}

export function PropertyCard({ property }: PropertyCardProps) {
  return (
    <Link href={`/property/${property.slug}`}>
      <Card className="hover:shadow-lg transition-shadow cursor-pointer">
        <CardHeader>
          <CardTitle className="text-lg">{property.addressLine1}</CardTitle>
          <p className="text-sm text-muted-foreground">{property.postcode}</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Type</p>
              <p className="font-medium capitalize">{property.propertyType || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Bedrooms</p>
              <p className="font-medium">{property.bedrooms || 'N/A'}</p>
            </div>
            {property.lastSalePrice && (
              <div>
                <p className="text-sm text-muted-foreground">Last Sale</p>
                <p className="font-medium">{formatPrice(property.lastSalePrice)}</p>
              </div>
            )}
            {property.lastSaleDate && (
              <div>
                <p className="text-sm text-muted-foreground">Sale Date</p>
                <p className="font-medium">{formatDate(property.lastSaleDate)}</p>
              </div>
            )}
            {property.currentValue && (
              <div className="col-span-2">
                <p className="text-sm text-muted-foreground">Estimated Value</p>
                <p className="text-xl font-bold text-primary">
                  {formatPrice(property.currentValue)}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
