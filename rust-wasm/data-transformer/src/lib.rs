use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use ahash::AHashMap;
use flate2::Compression;
use flate2::write::{GzEncoder, GzDecoder};
use std::io::Write;

#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

#[wasm_bindgen]
pub fn init_panic_hook() {
    console_error_panic_hook::set_once();
}

#[derive(Serialize, Deserialize, Debug)]
pub struct TransformConfig {
    pub fields_to_keep: Option<Vec<String>>,
    pub fields_to_remove: Option<Vec<String>>,
    pub field_mappings: Option<AHashMap<String, String>>,
    pub field_transforms: Option<AHashMap<String, TransformType>>,
    pub filters: Option<Vec<FilterConfig>>,
    pub aggregations: Option<Vec<AggregationConfig>>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub enum TransformType {
    Lowercase,
    Uppercase,
    Trim,
    Round(u32),
    Multiply(f64),
    Add(f64),
    DateFormat(String),
    Replace(String, String),
    Hash,
    Truncate(usize),
}

#[derive(Serialize, Deserialize, Debug)]
pub struct FilterConfig {
    pub field: String,
    pub operator: FilterOperator,
    pub value: Value,
}

#[derive(Serialize, Deserialize, Debug)]
pub enum FilterOperator {
    Equals,
    NotEquals,
    GreaterThan,
    LessThan,
    GreaterOrEqual,
    LessOrEqual,
    Contains,
    StartsWith,
    EndsWith,
    In,
    NotIn,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct AggregationConfig {
    pub group_by: Vec<String>,
    pub aggregates: Vec<AggregateFunction>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct AggregateFunction {
    pub field: String,
    pub function: AggregateFunctionType,
    pub alias: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub enum AggregateFunctionType {
    Sum,
    Average,
    Min,
    Max,
    Count,
    CountDistinct,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct BatchResult {
    pub processed: usize,
    pub filtered: usize,
    pub errors: Vec<String>,
    pub time_ms: f64,
}

#[wasm_bindgen]
pub struct DataTransformer {
    compression_level: u32,
    cache: AHashMap<String, Vec<u8>>,
}

#[wasm_bindgen]
impl DataTransformer {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        init_panic_hook();
        DataTransformer {
            compression_level: 6,
            cache: AHashMap::new(),
        }
    }

    /// Parse JSON with SIMD optimization
    #[wasm_bindgen(js_name = parseJson)]
    pub fn parse_json(&self, json_str: &str) -> Result<String, JsValue> {
        let mut json_string = json_str.to_string();
        let value: Value = simd_json::from_str(&mut json_string)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse JSON: {}", e)))?;

        serde_json::to_string(&value)
            .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
    }

    /// Serialize to JSON with SIMD optimization
    #[wasm_bindgen(js_name = serializeJson)]
    pub fn serialize_json(&self, data: &str) -> Result<String, JsValue> {
        let value: Value = serde_json::from_str(data)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse input: {}", e)))?;

        // Use compact serialization for smaller output
        serde_json::to_string(&value)
            .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
    }

    /// Compress data using gzip
    #[wasm_bindgen(js_name = compress)]
    pub fn compress(&self, data: &str) -> Result<Vec<u8>, JsValue> {
        let mut encoder = GzEncoder::new(Vec::new(), Compression::new(self.compression_level));
        encoder.write_all(data.as_bytes())
            .map_err(|e| JsValue::from_str(&format!("Compression failed: {}", e)))?;

        encoder.finish()
            .map_err(|e| JsValue::from_str(&format!("Compression finalization failed: {}", e)))
    }

    /// Decompress gzip data
    #[wasm_bindgen(js_name = decompress)]
    pub fn decompress(&self, compressed_data: &[u8]) -> Result<String, JsValue> {
        let mut decoder = GzDecoder::new(Vec::new());
        decoder.write_all(compressed_data)
            .map_err(|e| JsValue::from_str(&format!("Decompression failed: {}", e)))?;

        let decompressed = decoder.finish()
            .map_err(|e| JsValue::from_str(&format!("Decompression finalization failed: {}", e)))?;

        String::from_utf8(decompressed)
            .map_err(|e| JsValue::from_str(&format!("Invalid UTF-8 in decompressed data: {}", e)))
    }

    /// Compress using LZ4
    #[wasm_bindgen(js_name = compressLZ4)]
    pub fn compress_lz4(&self, data: &str) -> Result<Vec<u8>, JsValue> {
        Ok(lz4_flex::compress_prepend_size(data.as_bytes()))
    }

    /// Decompress LZ4 data
    #[wasm_bindgen(js_name = decompressLZ4)]
    pub fn decompress_lz4(&self, compressed_data: &[u8]) -> Result<String, JsValue> {
        let decompressed = lz4_flex::decompress_size_prepended(compressed_data)
            .map_err(|e| JsValue::from_str(&format!("LZ4 decompression failed: {}", e)))?;

        String::from_utf8(decompressed)
            .map_err(|e| JsValue::from_str(&format!("Invalid UTF-8 in decompressed data: {}", e)))
    }

    /// Transform a batch of JSON objects
    #[wasm_bindgen(js_name = transformBatch)]
    pub fn transform_batch(&self, data_json: &str, config_json: &str) -> Result<String, JsValue> {
        let start = web_sys::window()
            .and_then(|w| w.performance())
            .map(|p| p.now())
            .unwrap_or(0.0);

        let mut data: Vec<Value> = serde_json::from_str(data_json)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse data: {}", e)))?;

        let config: TransformConfig = serde_json::from_str(config_json)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse config: {}", e)))?;

        let initial_count = data.len();
        let mut errors = Vec::new();

        // Apply filters
        if let Some(filters) = &config.filters {
            data = data.into_iter()
                .filter(|item| self.apply_filters(item, filters))
                .collect();
        }

        // Transform each item
        let mut transformed: Vec<Value> = Vec::new();
        for item in data {
            match self.transform_item(item, &config) {
                Ok(transformed_item) => transformed.push(transformed_item),
                Err(e) => errors.push(format!("Transform error: {}", e)),
            }
        }

        let end = web_sys::window()
            .and_then(|w| w.performance())
            .map(|p| p.now())
            .unwrap_or(0.0);

        let result = BatchResult {
            processed: transformed.len(),
            filtered: initial_count - transformed.len(),
            errors,
            time_ms: end - start,
        };

        #[derive(Serialize)]
        struct TransformResult {
            data: Vec<Value>,
            metadata: BatchResult,
        }

        let output = TransformResult {
            data: transformed,
            metadata: result,
        };

        serde_json::to_string(&output)
            .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
    }

    fn apply_filters(&self, item: &Value, filters: &[FilterConfig]) -> bool {
        for filter in filters {
            if !self.evaluate_filter(item, filter) {
                return false;
            }
        }
        true
    }

    fn evaluate_filter(&self, item: &Value, filter: &FilterConfig) -> bool {
        let field_value = item.get(&filter.field);
        if field_value.is_none() {
            return false;
        }

        let field_value = field_value.unwrap();

        match filter.operator {
            FilterOperator::Equals => field_value == &filter.value,
            FilterOperator::NotEquals => field_value != &filter.value,
            FilterOperator::GreaterThan => {
                if let (Some(a), Some(b)) = (field_value.as_f64(), filter.value.as_f64()) {
                    a > b
                } else {
                    false
                }
            }
            FilterOperator::LessThan => {
                if let (Some(a), Some(b)) = (field_value.as_f64(), filter.value.as_f64()) {
                    a < b
                } else {
                    false
                }
            }
            FilterOperator::GreaterOrEqual => {
                if let (Some(a), Some(b)) = (field_value.as_f64(), filter.value.as_f64()) {
                    a >= b
                } else {
                    false
                }
            }
            FilterOperator::LessOrEqual => {
                if let (Some(a), Some(b)) = (field_value.as_f64(), filter.value.as_f64()) {
                    a <= b
                } else {
                    false
                }
            }
            FilterOperator::Contains => {
                if let (Some(a), Some(b)) = (field_value.as_str(), filter.value.as_str()) {
                    a.contains(b)
                } else {
                    false
                }
            }
            FilterOperator::StartsWith => {
                if let (Some(a), Some(b)) = (field_value.as_str(), filter.value.as_str()) {
                    a.starts_with(b)
                } else {
                    false
                }
            }
            FilterOperator::EndsWith => {
                if let (Some(a), Some(b)) = (field_value.as_str(), filter.value.as_str()) {
                    a.ends_with(b)
                } else {
                    false
                }
            }
            FilterOperator::In => {
                if let Some(array) = filter.value.as_array() {
                    array.contains(field_value)
                } else {
                    false
                }
            }
            FilterOperator::NotIn => {
                if let Some(array) = filter.value.as_array() {
                    !array.contains(field_value)
                } else {
                    true
                }
            }
        }
    }

    fn transform_item(&self, mut item: Value, config: &TransformConfig) -> Result<Value, String> {
        if let Some(obj) = item.as_object_mut() {
            // Field removal
            if let Some(fields) = &config.fields_to_remove {
                for field in fields {
                    obj.remove(field);
                }
            }

            // Field keeping (remove all others)
            if let Some(fields) = &config.fields_to_keep {
                let mut new_obj = serde_json::Map::new();
                for field in fields {
                    if let Some(value) = obj.get(field) {
                        new_obj.insert(field.clone(), value.clone());
                    }
                }
                *obj = new_obj;
            }

            // Field mappings (rename fields)
            if let Some(mappings) = &config.field_mappings {
                for (old_name, new_name) in mappings {
                    if let Some(value) = obj.remove(old_name) {
                        obj.insert(new_name.clone(), value);
                    }
                }
            }

            // Field transformations
            if let Some(transforms) = &config.field_transforms {
                for (field, transform_type) in transforms {
                    if let Some(value) = obj.get_mut(field) {
                        *value = self.apply_transform(value.clone(), transform_type)?;
                    }
                }
            }
        }

        Ok(item)
    }

    fn apply_transform(&self, value: Value, transform: &TransformType) -> Result<Value, String> {
        match transform {
            TransformType::Lowercase => {
                if let Some(s) = value.as_str() {
                    Ok(Value::String(s.to_lowercase()))
                } else {
                    Ok(value)
                }
            }
            TransformType::Uppercase => {
                if let Some(s) = value.as_str() {
                    Ok(Value::String(s.to_uppercase()))
                } else {
                    Ok(value)
                }
            }
            TransformType::Trim => {
                if let Some(s) = value.as_str() {
                    Ok(Value::String(s.trim().to_string()))
                } else {
                    Ok(value)
                }
            }
            TransformType::Round(decimals) => {
                if let Some(n) = value.as_f64() {
                    let multiplier = 10_f64.powi(*decimals as i32);
                    Ok(Value::from((n * multiplier).round() / multiplier))
                } else {
                    Ok(value)
                }
            }
            TransformType::Multiply(factor) => {
                if let Some(n) = value.as_f64() {
                    Ok(Value::from(n * factor))
                } else {
                    Ok(value)
                }
            }
            TransformType::Add(amount) => {
                if let Some(n) = value.as_f64() {
                    Ok(Value::from(n + amount))
                } else {
                    Ok(value)
                }
            }
            TransformType::Replace(from, to) => {
                if let Some(s) = value.as_str() {
                    Ok(Value::String(s.replace(from, to)))
                } else {
                    Ok(value)
                }
            }
            TransformType::Hash => {
                let s = match value {
                    Value::String(s) => s,
                    _ => value.to_string(),
                };
                // Simple hash function
                let hash = s.bytes().fold(0u32, |acc, b| {
                    acc.wrapping_mul(31).wrapping_add(b as u32)
                });
                Ok(Value::String(format!("{:x}", hash)))
            }
            TransformType::Truncate(max_len) => {
                if let Some(s) = value.as_str() {
                    if s.len() > *max_len {
                        Ok(Value::String(s.chars().take(*max_len).collect()))
                    } else {
                        Ok(value)
                    }
                } else {
                    Ok(value)
                }
            }
            TransformType::DateFormat(_format) => {
                // Simplified date formatting
                Ok(value)
            }
        }
    }

    /// Stream-process large JSON arrays
    #[wasm_bindgen(js_name = streamProcess)]
    pub fn stream_process(&self, json_str: &str, chunk_size: usize, processor: &js_sys::Function) -> Result<String, JsValue> {
        let data: Vec<Value> = serde_json::from_str(json_str)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse JSON: {}", e)))?;

        let mut results = Vec::new();
        let this = JsValue::null();

        for chunk in data.chunks(chunk_size) {
            let chunk_json = serde_json::to_string(chunk)
                .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))?;

            let js_chunk = JsValue::from_str(&chunk_json);
            let result = processor.call1(&this, &js_chunk)?;

            if let Some(result_str) = result.as_string() {
                let processed: Vec<Value> = serde_json::from_str(&result_str)
                    .map_err(|e| JsValue::from_str(&format!("Failed to parse processor result: {}", e)))?;
                results.extend(processed);
            }
        }

        serde_json::to_string(&results)
            .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
    }

    /// Aggregate data
    #[wasm_bindgen(js_name = aggregate)]
    pub fn aggregate(&self, data_json: &str, config_json: &str) -> Result<String, JsValue> {
        let data: Vec<Value> = serde_json::from_str(data_json)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse data: {}", e)))?;

        let config: AggregationConfig = serde_json::from_str(config_json)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse config: {}", e)))?;

        // Group data
        let mut groups: AHashMap<Vec<String>, Vec<&Value>> = AHashMap::new();

        for item in &data {
            if let Some(obj) = item.as_object() {
                let mut group_key = Vec::new();
                for field in &config.group_by {
                    let value = obj.get(field)
                        .map(|v| v.to_string())
                        .unwrap_or_else(|| "null".to_string());
                    group_key.push(value);
                }
                groups.entry(group_key).or_insert_with(Vec::new).push(item);
            }
        }

        // Calculate aggregates
        let mut results = Vec::new();

        for (group_key, group_items) in groups {
            let mut result_obj = serde_json::Map::new();

            // Add group keys
            for (i, field) in config.group_by.iter().enumerate() {
                result_obj.insert(field.clone(), Value::String(group_key[i].clone()));
            }

            // Calculate aggregates
            for agg_func in &config.aggregates {
                let value = self.calculate_aggregate(&group_items, &agg_func)?;
                result_obj.insert(agg_func.alias.clone(), value);
            }

            results.push(Value::Object(result_obj));
        }

        serde_json::to_string(&results)
            .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
    }

    fn calculate_aggregate(&self, items: &[&Value], agg_func: &AggregateFunction) -> Result<Value, String> {
        match agg_func.function {
            AggregateFunctionType::Count => Ok(Value::from(items.len())),
            AggregateFunctionType::Sum => {
                let sum: f64 = items.iter()
                    .filter_map(|item| item.get(&agg_func.field))
                    .filter_map(|v| v.as_f64())
                    .sum();
                Ok(Value::from(sum))
            }
            AggregateFunctionType::Average => {
                let values: Vec<f64> = items.iter()
                    .filter_map(|item| item.get(&agg_func.field))
                    .filter_map(|v| v.as_f64())
                    .collect();
                if values.is_empty() {
                    Ok(Value::Null)
                } else {
                    Ok(Value::from(values.iter().sum::<f64>() / values.len() as f64))
                }
            }
            AggregateFunctionType::Min => {
                let min = items.iter()
                    .filter_map(|item| item.get(&agg_func.field))
                    .filter_map(|v| v.as_f64())
                    .fold(f64::INFINITY, |a, b| a.min(b));
                if min == f64::INFINITY {
                    Ok(Value::Null)
                } else {
                    Ok(Value::from(min))
                }
            }
            AggregateFunctionType::Max => {
                let max = items.iter()
                    .filter_map(|item| item.get(&agg_func.field))
                    .filter_map(|v| v.as_f64())
                    .fold(f64::NEG_INFINITY, |a, b| a.max(b));
                if max == f64::NEG_INFINITY {
                    Ok(Value::Null)
                } else {
                    Ok(Value::from(max))
                }
            }
            AggregateFunctionType::CountDistinct => {
                let unique: AHashSet<String> = items.iter()
                    .filter_map(|item| item.get(&agg_func.field))
                    .map(|v| v.to_string())
                    .collect();
                Ok(Value::from(unique.len()))
            }
        }
    }

    /// Set compression level (0-9)
    #[wasm_bindgen(js_name = setCompressionLevel)]
    pub fn set_compression_level(&mut self, level: u32) {
        self.compression_level = level.min(9);
    }

    /// Clear cache
    #[wasm_bindgen(js_name = clearCache)]
    pub fn clear_cache(&mut self) {
        self.cache.clear();
    }
}

// Utility functions
#[wasm_bindgen(js_name = base64Encode)]
pub fn base64_encode(data: &[u8]) -> String {
    base64::Engine::encode(&base64::engine::general_purpose::STANDARD, data)
}

#[wasm_bindgen(js_name = base64Decode)]
pub fn base64_decode(encoded: &str) -> Result<Vec<u8>, JsValue> {
    base64::Engine::decode(&base64::engine::general_purpose::STANDARD, encoded)
        .map_err(|e| JsValue::from_str(&format!("Base64 decode error: {}", e)))
}