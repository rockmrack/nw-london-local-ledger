'use client';

import Link from 'next/link';
import Image from 'next/image';

interface Property {
  id: string;
  title: string;
  address: string;
  price: number;
  bedrooms: number;
  bathrooms: number;
  image: string;
  slug: string;
}

interface FeaturedPropertiesProps {
  properties: Property[];
}

/**
 * Featured Properties Component with lazy loading
 */
export default function FeaturedProperties({ properties }: FeaturedPropertiesProps) {
  if (!properties || properties.length === 0) {
    return (
      <div className="text-center text-gray-500 py-8">
        No featured properties available at the moment.
      </div>
    );
  }

  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
      {properties.map((property) => (
        <Link
          key={property.id}
          href={`/property/${property.slug}`}
          className="group"
        >
          <div className="bg-white rounded-lg shadow-sm hover:shadow-lg transition-shadow overflow-hidden">
            <div className="relative h-48 bg-gray-200">
              {property.image && (
                <Image
                  src={property.image}
                  alt={property.title}
                  fill
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                  className="object-cover group-hover:scale-105 transition-transform duration-300"
                  loading="lazy"
                />
              )}
            </div>

            <div className="p-4">
              <h3 className="font-semibold text-lg mb-2 line-clamp-1">
                {property.title}
              </h3>

              <p className="text-gray-600 text-sm mb-3 line-clamp-2">
                {property.address}
              </p>

              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold text-blue-600">
                  £{property.price.toLocaleString()}
                </span>

                <div className="flex gap-3 text-sm text-gray-500">
                  <span>{property.bedrooms} beds</span>
                  <span>{property.bathrooms} baths</span>
                </div>
              </div>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}