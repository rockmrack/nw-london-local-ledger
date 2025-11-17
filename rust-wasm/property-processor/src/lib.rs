use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};
use ahash::AHashMap;
use std::collections::BTreeMap;
use chrono::{DateTime, Utc};

// Use `wee_alloc` as the global allocator for smaller WASM size
#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

#[wasm_bindgen]
pub fn init_panic_hook() {
    console_error_panic_hook::set_once();
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Property {
    pub id: String,
    pub address: String,
    pub postcode: String,
    pub price: f64,
    pub bedrooms: u32,
    pub bathrooms: u32,
    pub property_type: String,
    pub area_sqft: Option<f64>,
    pub latitude: f64,
    pub longitude: f64,
    pub listing_date: String,
    pub features: Vec<String>,
    pub council_tax_band: Option<String>,
    pub epc_rating: Option<String>,
    pub tenure: Option<String>,
    pub ground_rent: Option<f64>,
    pub service_charge: Option<f64>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PropertyFilter {
    pub min_price: Option<f64>,
    pub max_price: Option<f64>,
    pub min_bedrooms: Option<u32>,
    pub max_bedrooms: Option<u32>,
    pub property_types: Option<Vec<String>>,
    pub postcodes: Option<Vec<String>>,
    pub min_area_sqft: Option<f64>,
    pub max_area_sqft: Option<f64>,
    pub features: Option<Vec<String>>,
    pub council_tax_bands: Option<Vec<String>>,
    pub epc_ratings: Option<Vec<String>>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SortConfig {
    pub field: String,
    pub ascending: bool,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct PropertyStats {
    pub total_count: usize,
    pub average_price: f64,
    pub median_price: f64,
    pub min_price: f64,
    pub max_price: f64,
    pub price_per_sqft: f64,
    pub average_bedrooms: f64,
    pub property_type_distribution: BTreeMap<String, usize>,
    pub postcode_distribution: BTreeMap<String, usize>,
    pub price_percentiles: BTreeMap<String, f64>,
}

#[wasm_bindgen]
pub struct PropertyProcessor {
    properties: Vec<Property>,
    indexed_by_postcode: AHashMap<String, Vec<usize>>,
    indexed_by_type: AHashMap<String, Vec<usize>>,
    indexed_by_price_range: BTreeMap<u32, Vec<usize>>,
}

#[wasm_bindgen]
impl PropertyProcessor {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        init_panic_hook();
        PropertyProcessor {
            properties: Vec::new(),
            indexed_by_postcode: AHashMap::new(),
            indexed_by_type: AHashMap::new(),
            indexed_by_price_range: BTreeMap::new(),
        }
    }

    /// Load properties from JSON string and build indexes
    #[wasm_bindgen(js_name = loadProperties)]
    pub fn load_properties(&mut self, json_str: &str) -> Result<usize, JsValue> {
        let properties: Vec<Property> = simd_json::from_str(&mut json_str.to_string())
            .map_err(|e| JsValue::from_str(&format!("Failed to parse JSON: {}", e)))?;

        let count = properties.len();
        self.properties = properties;
        self.build_indexes();

        Ok(count)
    }

    /// Build indexes for fast filtering
    fn build_indexes(&mut self) {
        self.indexed_by_postcode.clear();
        self.indexed_by_type.clear();
        self.indexed_by_price_range.clear();

        for (idx, property) in self.properties.iter().enumerate() {
            // Index by postcode prefix
            let postcode_prefix = property.postcode.split_whitespace()
                .next()
                .unwrap_or(&property.postcode)
                .to_uppercase();
            self.indexed_by_postcode
                .entry(postcode_prefix)
                .or_insert_with(Vec::new)
                .push(idx);

            // Index by property type
            self.indexed_by_type
                .entry(property.property_type.clone())
                .or_insert_with(Vec::new)
                .push(idx);

            // Index by price range (buckets of 100k)
            let price_bucket = (property.price / 100_000.0) as u32;
            self.indexed_by_price_range
                .entry(price_bucket)
                .or_insert_with(Vec::new)
                .push(idx);
        }
    }

    /// Filter properties using WASM-optimized logic
    #[wasm_bindgen(js_name = filterProperties)]
    pub fn filter_properties(&self, filter_json: &str) -> Result<String, JsValue> {
        let filter: PropertyFilter = serde_json::from_str(filter_json)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse filter: {}", e)))?;

        let mut result_indices = Vec::new();

        // Use indexes for initial filtering
        let candidates = self.get_candidate_indices(&filter);

        for &idx in &candidates {
            let property = &self.properties[idx];

            if self.property_matches_filter(property, &filter) {
                result_indices.push(idx);
            }
        }

        let filtered: Vec<&Property> = result_indices
            .iter()
            .map(|&idx| &self.properties[idx])
            .collect();

        serde_json::to_string(&filtered)
            .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
    }

    /// Get candidate indices using indexes
    fn get_candidate_indices(&self, filter: &PropertyFilter) -> Vec<usize> {
        let mut candidates = Vec::new();
        let mut use_full_scan = true;

        // Use postcode index if postcodes filter is specified
        if let Some(postcodes) = &filter.postcodes {
            use_full_scan = false;
            for postcode in postcodes {
                let prefix = postcode.split_whitespace()
                    .next()
                    .unwrap_or(postcode)
                    .to_uppercase();
                if let Some(indices) = self.indexed_by_postcode.get(&prefix) {
                    candidates.extend(indices);
                }
            }
        }

        // Use property type index if specified
        if let Some(types) = &filter.property_types {
            if use_full_scan {
                use_full_scan = false;
                for ptype in types {
                    if let Some(indices) = self.indexed_by_type.get(ptype) {
                        candidates.extend(indices);
                    }
                }
            }
        }

        // Use price range index if specified
        if use_full_scan && (filter.min_price.is_some() || filter.max_price.is_some()) {
            use_full_scan = false;
            let min_bucket = filter.min_price.map(|p| (p / 100_000.0) as u32).unwrap_or(0);
            let max_bucket = filter.max_price.map(|p| (p / 100_000.0) as u32 + 1).unwrap_or(u32::MAX);

            for (&bucket, indices) in self.indexed_by_price_range.range(min_bucket..max_bucket) {
                candidates.extend(indices);
            }
        }

        // If no specific indexes used, scan all
        if use_full_scan {
            candidates = (0..self.properties.len()).collect();
        }

        // Deduplicate
        candidates.sort_unstable();
        candidates.dedup();
        candidates
    }

    /// Check if property matches filter criteria
    fn property_matches_filter(&self, property: &Property, filter: &PropertyFilter) -> bool {
        // Price filter
        if let Some(min) = filter.min_price {
            if property.price < min {
                return false;
            }
        }
        if let Some(max) = filter.max_price {
            if property.price > max {
                return false;
            }
        }

        // Bedrooms filter
        if let Some(min) = filter.min_bedrooms {
            if property.bedrooms < min {
                return false;
            }
        }
        if let Some(max) = filter.max_bedrooms {
            if property.bedrooms > max {
                return false;
            }
        }

        // Area filter
        if let Some(area) = property.area_sqft {
            if let Some(min) = filter.min_area_sqft {
                if area < min {
                    return false;
                }
            }
            if let Some(max) = filter.max_area_sqft {
                if area > max {
                    return false;
                }
            }
        }

        // Features filter - property must have all requested features
        if let Some(required_features) = &filter.features {
            for feature in required_features {
                if !property.features.iter().any(|f| f.eq_ignore_ascii_case(feature)) {
                    return false;
                }
            }
        }

        // Council tax band filter
        if let Some(bands) = &filter.council_tax_bands {
            if let Some(band) = &property.council_tax_band {
                if !bands.iter().any(|b| b.eq_ignore_ascii_case(band)) {
                    return false;
                }
            }
        }

        // EPC rating filter
        if let Some(ratings) = &filter.epc_ratings {
            if let Some(rating) = &property.epc_rating {
                if !ratings.iter().any(|r| r.eq_ignore_ascii_case(rating)) {
                    return false;
                }
            }
        }

        true
    }

    /// Sort properties with WASM-optimized algorithms
    #[wasm_bindgen(js_name = sortProperties)]
    pub fn sort_properties(&mut self, sort_json: &str) -> Result<String, JsValue> {
        let sort_config: SortConfig = serde_json::from_str(sort_json)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse sort config: {}", e)))?;

        match sort_config.field.as_str() {
            "price" => {
                if sort_config.ascending {
                    self.properties.sort_by(|a, b| a.price.partial_cmp(&b.price).unwrap());
                } else {
                    self.properties.sort_by(|a, b| b.price.partial_cmp(&a.price).unwrap());
                }
            }
            "bedrooms" => {
                if sort_config.ascending {
                    self.properties.sort_by_key(|p| p.bedrooms);
                } else {
                    self.properties.sort_by_key(|p| std::cmp::Reverse(p.bedrooms));
                }
            }
            "area" => {
                self.properties.sort_by(|a, b| {
                    let a_area = a.area_sqft.unwrap_or(0.0);
                    let b_area = b.area_sqft.unwrap_or(0.0);
                    if sort_config.ascending {
                        a_area.partial_cmp(&b_area).unwrap()
                    } else {
                        b_area.partial_cmp(&a_area).unwrap()
                    }
                });
            }
            "date" => {
                if sort_config.ascending {
                    self.properties.sort_by(|a, b| a.listing_date.cmp(&b.listing_date));
                } else {
                    self.properties.sort_by(|a, b| b.listing_date.cmp(&a.listing_date));
                }
            }
            _ => return Err(JsValue::from_str("Invalid sort field")),
        }

        serde_json::to_string(&self.properties)
            .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
    }

    /// Calculate property statistics
    #[wasm_bindgen(js_name = calculateStats)]
    pub fn calculate_stats(&self) -> Result<String, JsValue> {
        if self.properties.is_empty() {
            return Err(JsValue::from_str("No properties loaded"));
        }

        let mut prices: Vec<f64> = self.properties.iter().map(|p| p.price).collect();
        prices.sort_by(|a, b| a.partial_cmp(b).unwrap());

        let total_count = self.properties.len();
        let sum: f64 = prices.iter().sum();
        let average_price = sum / total_count as f64;
        let median_price = if total_count % 2 == 0 {
            (prices[total_count / 2 - 1] + prices[total_count / 2]) / 2.0
        } else {
            prices[total_count / 2]
        };

        let min_price = prices[0];
        let max_price = prices[total_count - 1];

        // Calculate price per sqft
        let mut price_per_sqft_values = Vec::new();
        for property in &self.properties {
            if let Some(area) = property.area_sqft {
                if area > 0.0 {
                    price_per_sqft_values.push(property.price / area);
                }
            }
        }
        let price_per_sqft = if !price_per_sqft_values.is_empty() {
            price_per_sqft_values.iter().sum::<f64>() / price_per_sqft_values.len() as f64
        } else {
            0.0
        };

        // Calculate average bedrooms
        let total_bedrooms: u32 = self.properties.iter().map(|p| p.bedrooms).sum();
        let average_bedrooms = total_bedrooms as f64 / total_count as f64;

        // Property type distribution
        let mut property_type_distribution = BTreeMap::new();
        for property in &self.properties {
            *property_type_distribution.entry(property.property_type.clone()).or_insert(0) += 1;
        }

        // Postcode distribution
        let mut postcode_distribution = BTreeMap::new();
        for property in &self.properties {
            let prefix = property.postcode.split_whitespace()
                .next()
                .unwrap_or(&property.postcode)
                .to_string();
            *postcode_distribution.entry(prefix).or_insert(0) += 1;
        }

        // Calculate percentiles
        let mut price_percentiles = BTreeMap::new();
        for percentile in &[10, 25, 50, 75, 90] {
            let index = (total_count as f64 * (*percentile as f64 / 100.0)) as usize;
            let index = index.min(total_count - 1);
            price_percentiles.insert(format!("p{}", percentile), prices[index]);
        }

        let stats = PropertyStats {
            total_count,
            average_price,
            median_price,
            min_price,
            max_price,
            price_per_sqft,
            average_bedrooms,
            property_type_distribution,
            postcode_distribution,
            price_percentiles,
        };

        serde_json::to_string(&stats)
            .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
    }

    /// Batch transform properties
    #[wasm_bindgen(js_name = batchTransform)]
    pub fn batch_transform(&mut self, transform_fn: &js_sys::Function) -> Result<String, JsValue> {
        let this = JsValue::null();

        for property in &mut self.properties {
            let property_json = serde_json::to_string(&property)
                .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))?;

            let js_property = JsValue::from_str(&property_json);
            let result = transform_fn.call1(&this, &js_property)?;

            let result_str = result.as_string()
                .ok_or_else(|| JsValue::from_str("Transform function must return a string"))?;

            *property = serde_json::from_str(&result_str)
                .map_err(|e| JsValue::from_str(&format!("Failed to parse transformed property: {}", e)))?;
        }

        // Rebuild indexes after transformation
        self.build_indexes();

        serde_json::to_string(&self.properties)
            .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
    }

    /// Get properties count
    #[wasm_bindgen(js_name = getCount)]
    pub fn get_count(&self) -> usize {
        self.properties.len()
    }

    /// Clear all properties
    #[wasm_bindgen(js_name = clear)]
    pub fn clear(&mut self) {
        self.properties.clear();
        self.indexed_by_postcode.clear();
        self.indexed_by_type.clear();
        self.indexed_by_price_range.clear();
    }
}

// Export helper functions
#[wasm_bindgen(js_name = parsePropertyJSON)]
pub fn parse_property_json(json: &str) -> Result<String, JsValue> {
    let property: Property = simd_json::from_str(&mut json.to_string())
        .map_err(|e| JsValue::from_str(&format!("Failed to parse property JSON: {}", e)))?;

    serde_json::to_string(&property)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

#[wasm_bindgen(js_name = validatePropertyData)]
pub fn validate_property_data(json: &str) -> Result<bool, JsValue> {
    match simd_json::from_str::<Property>(&mut json.to_string()) {
        Ok(_) => Ok(true),
        Err(e) => Ok(false),
    }
}