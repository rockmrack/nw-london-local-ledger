use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};
use geo::{
    algorithm::{area::Area, centroid::Centroid, contains::Contains, haversine_distance::HaversineDistance},
    Point, Polygon, LineString, Coord,
};
use geo_types::{Geometry, MultiPolygon};
use rstar::{RTree, AABB};
use ahash::{AHashMap, AHashSet};
use std::f64::consts::PI;

#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

#[wasm_bindgen]
pub fn init_panic_hook() {
    console_error_panic_hook::set_once();
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy)]
pub struct LatLng {
    pub lat: f64,
    pub lng: f64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct BoundingBox {
    pub min_lat: f64,
    pub min_lng: f64,
    pub max_lat: f64,
    pub max_lng: f64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct GeoPolygon {
    pub coordinates: Vec<LatLng>,
    pub holes: Option<Vec<Vec<LatLng>>>,
    pub properties: Option<AHashMap<String, String>>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ProximityResult {
    pub id: String,
    pub distance_meters: f64,
    pub bearing_degrees: f64,
    pub location: LatLng,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct ClusterResult {
    pub center: LatLng,
    pub count: usize,
    pub bbox: BoundingBox,
    pub items: Vec<String>,
}

// Spatial index for fast proximity queries
struct SpatialLocation {
    id: String,
    point: Point<f64>,
}

impl rstar::RTreeObject for SpatialLocation {
    type Envelope = AABB<Point<f64>>;

    fn envelope(&self) -> Self::Envelope {
        AABB::from_point(self.point)
    }
}

#[wasm_bindgen]
pub struct GeoCalculator {
    rtree: Option<RTree<SpatialLocation>>,
    polygons: AHashMap<String, Polygon<f64>>,
    cached_distances: AHashMap<String, f64>,
}

#[wasm_bindgen]
impl GeoCalculator {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        init_panic_hook();
        GeoCalculator {
            rtree: None,
            polygons: AHashMap::new(),
            cached_distances: AHashMap::new(),
        }
    }

    /// Calculate distance between two points using Haversine formula
    #[wasm_bindgen(js_name = calculateDistance)]
    pub fn calculate_distance(&self, lat1: f64, lng1: f64, lat2: f64, lng2: f64) -> f64 {
        let point1 = Point::new(lng1, lat1);
        let point2 = Point::new(lng2, lat2);
        point1.haversine_distance(&point2)
    }

    /// Calculate bearing between two points
    #[wasm_bindgen(js_name = calculateBearing)]
    pub fn calculate_bearing(&self, lat1: f64, lng1: f64, lat2: f64, lng2: f64) -> f64 {
        let dlon = (lng2 - lng1).to_radians();
        let lat1_rad = lat1.to_radians();
        let lat2_rad = lat2.to_radians();

        let y = dlon.sin() * lat2_rad.cos();
        let x = lat1_rad.cos() * lat2_rad.sin() - lat1_rad.sin() * lat2_rad.cos() * dlon.cos();

        let bearing_rad = y.atan2(x);
        let bearing_deg = bearing_rad.to_degrees();

        // Normalize to 0-360
        (bearing_deg + 360.0) % 360.0
    }

    /// Calculate area of a polygon in square meters
    #[wasm_bindgen(js_name = calculateArea)]
    pub fn calculate_area(&self, polygon_json: &str) -> Result<f64, JsValue> {
        let geo_polygon: GeoPolygon = serde_json::from_str(polygon_json)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse polygon: {}", e)))?;

        let polygon = self.create_polygon(&geo_polygon)?;

        // Convert area from square degrees to square meters
        // This is an approximation that works well for small areas
        let area_degrees = polygon.unsigned_area();
        let lat_center = geo_polygon.coordinates.iter()
            .map(|c| c.lat)
            .sum::<f64>() / geo_polygon.coordinates.len() as f64;

        // Earth radius in meters
        const EARTH_RADIUS_M: f64 = 6_371_000.0;

        // Convert to square meters using latitude-adjusted scale
        let lat_rad = lat_center.to_radians();
        let meters_per_degree_lat = EARTH_RADIUS_M * PI / 180.0;
        let meters_per_degree_lng = meters_per_degree_lat * lat_rad.cos();

        Ok(area_degrees * meters_per_degree_lat * meters_per_degree_lng)
    }

    /// Check if a point is inside a polygon
    #[wasm_bindgen(js_name = isPointInPolygon)]
    pub fn is_point_in_polygon(&self, lat: f64, lng: f64, polygon_id: &str) -> bool {
        if let Some(polygon) = self.polygons.get(polygon_id) {
            let point = Point::new(lng, lat);
            polygon.contains(&point)
        } else {
            false
        }
    }

    /// Load a polygon for spatial queries
    #[wasm_bindgen(js_name = loadPolygon)]
    pub fn load_polygon(&mut self, id: &str, polygon_json: &str) -> Result<(), JsValue> {
        let geo_polygon: GeoPolygon = serde_json::from_str(polygon_json)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse polygon: {}", e)))?;

        let polygon = self.create_polygon(&geo_polygon)?;
        self.polygons.insert(id.to_string(), polygon);

        Ok(())
    }

    /// Create a polygon from GeoPolygon
    fn create_polygon(&self, geo_polygon: &GeoPolygon) -> Result<Polygon<f64>, JsValue> {
        if geo_polygon.coordinates.len() < 3 {
            return Err(JsValue::from_str("Polygon must have at least 3 points"));
        }

        let exterior: Vec<Coord<f64>> = geo_polygon.coordinates
            .iter()
            .map(|c| Coord { x: c.lng, y: c.lat })
            .collect();

        let mut line_string = LineString::from(exterior);

        // Ensure polygon is closed
        if line_string.0.first() != line_string.0.last() {
            if let Some(first) = line_string.0.first() {
                line_string.0.push(*first);
            }
        }

        let mut holes = Vec::new();
        if let Some(hole_coords) = &geo_polygon.holes {
            for hole in hole_coords {
                let hole_points: Vec<Coord<f64>> = hole
                    .iter()
                    .map(|c| Coord { x: c.lng, y: c.lat })
                    .collect();

                let mut hole_line = LineString::from(hole_points);
                if hole_line.0.first() != hole_line.0.last() {
                    if let Some(first) = hole_line.0.first() {
                        hole_line.0.push(*first);
                    }
                }
                holes.push(hole_line);
            }
        }

        Ok(Polygon::new(line_string, holes))
    }

    /// Build spatial index from locations
    #[wasm_bindgen(js_name = buildSpatialIndex)]
    pub fn build_spatial_index(&mut self, locations_json: &str) -> Result<usize, JsValue> {
        #[derive(Deserialize)]
        struct LocationData {
            id: String,
            lat: f64,
            lng: f64,
        }

        let locations: Vec<LocationData> = serde_json::from_str(locations_json)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse locations: {}", e)))?;

        let spatial_locations: Vec<SpatialLocation> = locations
            .into_iter()
            .map(|loc| SpatialLocation {
                id: loc.id,
                point: Point::new(loc.lng, loc.lat),
            })
            .collect();

        let count = spatial_locations.len();
        self.rtree = Some(RTree::bulk_load(spatial_locations));

        Ok(count)
    }

    /// Find nearest neighbors using spatial index
    #[wasm_bindgen(js_name = findNearest)]
    pub fn find_nearest(&self, lat: f64, lng: f64, max_results: usize) -> Result<String, JsValue> {
        let rtree = self.rtree.as_ref()
            .ok_or_else(|| JsValue::from_str("Spatial index not built"))?;

        let query_point = Point::new(lng, lat);
        let nearest = rtree.nearest_neighbor_iter(&query_point)
            .take(max_results);

        let mut results = Vec::new();
        for location in nearest {
            let distance = self.calculate_distance(lat, lng, location.point.y(), location.point.x());
            let bearing = self.calculate_bearing(lat, lng, location.point.y(), location.point.x());

            results.push(ProximityResult {
                id: location.id.clone(),
                distance_meters: distance,
                bearing_degrees: bearing,
                location: LatLng {
                    lat: location.point.y(),
                    lng: location.point.x(),
                },
            });
        }

        serde_json::to_string(&results)
            .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
    }

    /// Find all points within radius
    #[wasm_bindgen(js_name = findWithinRadius)]
    pub fn find_within_radius(&self, lat: f64, lng: f64, radius_meters: f64) -> Result<String, JsValue> {
        let rtree = self.rtree.as_ref()
            .ok_or_else(|| JsValue::from_str("Spatial index not built"))?;

        // Convert radius to approximate degrees (rough estimation)
        const METERS_PER_DEGREE: f64 = 111_320.0;
        let radius_degrees = radius_meters / METERS_PER_DEGREE;

        let query_point = Point::new(lng, lat);
        let search_bounds = AABB::from_corners(
            Point::new(lng - radius_degrees, lat - radius_degrees),
            Point::new(lng + radius_degrees, lat + radius_degrees),
        );

        let candidates: Vec<_> = rtree.locate_in_envelope(&search_bounds).collect();

        let mut results = Vec::new();
        for location in candidates {
            let distance = self.calculate_distance(lat, lng, location.point.y(), location.point.x());

            if distance <= radius_meters {
                let bearing = self.calculate_bearing(lat, lng, location.point.y(), location.point.x());

                results.push(ProximityResult {
                    id: location.id.clone(),
                    distance_meters: distance,
                    bearing_degrees: bearing,
                    location: LatLng {
                        lat: location.point.y(),
                        lng: location.point.x(),
                    },
                });
            }
        }

        // Sort by distance
        results.sort_by(|a, b| a.distance_meters.partial_cmp(&b.distance_meters).unwrap());

        serde_json::to_string(&results)
            .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
    }

    /// Calculate bounding box for a set of points
    #[wasm_bindgen(js_name = calculateBoundingBox)]
    pub fn calculate_bounding_box(&self, points_json: &str) -> Result<String, JsValue> {
        let points: Vec<LatLng> = serde_json::from_str(points_json)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse points: {}", e)))?;

        if points.is_empty() {
            return Err(JsValue::from_str("No points provided"));
        }

        let mut min_lat = f64::INFINITY;
        let mut min_lng = f64::INFINITY;
        let mut max_lat = f64::NEG_INFINITY;
        let mut max_lng = f64::NEG_INFINITY;

        for point in points {
            min_lat = min_lat.min(point.lat);
            min_lng = min_lng.min(point.lng);
            max_lat = max_lat.max(point.lat);
            max_lng = max_lng.max(point.lng);
        }

        let bbox = BoundingBox {
            min_lat,
            min_lng,
            max_lat,
            max_lng,
        };

        serde_json::to_string(&bbox)
            .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
    }

    /// Cluster points by proximity
    #[wasm_bindgen(js_name = clusterPoints)]
    pub fn cluster_points(&self, points_json: &str, cluster_radius_meters: f64) -> Result<String, JsValue> {
        #[derive(Deserialize)]
        struct PointData {
            id: String,
            lat: f64,
            lng: f64,
        }

        let points: Vec<PointData> = serde_json::from_str(points_json)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse points: {}", e)))?;

        let mut clusters: Vec<ClusterResult> = Vec::new();
        let mut assigned: AHashSet<String> = AHashSet::new();

        for point in &points {
            if assigned.contains(&point.id) {
                continue;
            }

            let mut cluster_items = vec![point.id.clone()];
            let mut cluster_lats = vec![point.lat];
            let mut cluster_lngs = vec![point.lng];

            assigned.insert(point.id.clone());

            // Find all points within cluster radius
            for other in &points {
                if assigned.contains(&other.id) {
                    continue;
                }

                let distance = self.calculate_distance(point.lat, point.lng, other.lat, other.lng);
                if distance <= cluster_radius_meters {
                    cluster_items.push(other.id.clone());
                    cluster_lats.push(other.lat);
                    cluster_lngs.push(other.lng);
                    assigned.insert(other.id.clone());
                }
            }

            // Calculate cluster center
            let center_lat = cluster_lats.iter().sum::<f64>() / cluster_lats.len() as f64;
            let center_lng = cluster_lngs.iter().sum::<f64>() / cluster_lngs.len() as f64;

            // Calculate bounding box
            let min_lat = cluster_lats.iter().fold(f64::INFINITY, |a, &b| a.min(b));
            let max_lat = cluster_lats.iter().fold(f64::NEG_INFINITY, |a, &b| a.max(b));
            let min_lng = cluster_lngs.iter().fold(f64::INFINITY, |a, &b| a.min(b));
            let max_lng = cluster_lngs.iter().fold(f64::NEG_INFINITY, |a, &b| a.max(b));

            clusters.push(ClusterResult {
                center: LatLng { lat: center_lat, lng: center_lng },
                count: cluster_items.len(),
                bbox: BoundingBox {
                    min_lat,
                    min_lng,
                    max_lat,
                    max_lng,
                },
                items: cluster_items,
            });
        }

        serde_json::to_string(&clusters)
            .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
    }

    /// Check if two bounding boxes intersect
    #[wasm_bindgen(js_name = bboxIntersects)]
    pub fn bbox_intersects(&self, bbox1_json: &str, bbox2_json: &str) -> Result<bool, JsValue> {
        let bbox1: BoundingBox = serde_json::from_str(bbox1_json)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse bbox1: {}", e)))?;
        let bbox2: BoundingBox = serde_json::from_str(bbox2_json)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse bbox2: {}", e)))?;

        Ok(!(bbox1.max_lat < bbox2.min_lat ||
             bbox1.min_lat > bbox2.max_lat ||
             bbox1.max_lng < bbox2.min_lng ||
             bbox1.min_lng > bbox2.max_lng))
    }

    /// Clear all cached data
    #[wasm_bindgen(js_name = clear)]
    pub fn clear(&mut self) {
        self.rtree = None;
        self.polygons.clear();
        self.cached_distances.clear();
    }
}