use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};
use ahash::AHashMap;
use std::collections::BTreeMap;

#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

#[wasm_bindgen]
pub fn init_panic_hook() {
    console_error_panic_hook::set_once();
}

#[derive(Serialize, Deserialize, Debug)]
pub struct StatisticsResult {
    pub count: usize,
    pub sum: f64,
    pub mean: f64,
    pub median: f64,
    pub mode: Vec<f64>,
    pub variance: f64,
    pub std_dev: f64,
    pub min: f64,
    pub max: f64,
    pub range: f64,
    pub percentiles: BTreeMap<u8, f64>,
    pub quartiles: Quartiles,
    pub outliers: Vec<f64>,
    pub skewness: f64,
    pub kurtosis: f64,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct Quartiles {
    pub q1: f64,
    pub q2: f64,  // median
    pub q3: f64,
    pub iqr: f64,  // interquartile range
}

#[derive(Serialize, Deserialize, Debug)]
pub struct CorrelationResult {
    pub pearson: f64,
    pub spearman: f64,
    pub r_squared: f64,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct RegressionResult {
    pub slope: f64,
    pub intercept: f64,
    pub r_squared: f64,
    pub standard_error: f64,
    pub predictions: Vec<f64>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct TimeSeriesStats {
    pub trend: Vec<f64>,
    pub seasonal: Vec<f64>,
    pub residual: Vec<f64>,
    pub moving_average: Vec<f64>,
    pub exponential_smoothing: Vec<f64>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct AggregationResult {
    pub groups: BTreeMap<String, GroupStats>,
    pub total_count: usize,
    pub total_sum: f64,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct GroupStats {
    pub count: usize,
    pub sum: f64,
    pub mean: f64,
    pub min: f64,
    pub max: f64,
}

#[wasm_bindgen]
pub struct StatsEngine {
    data_cache: AHashMap<String, Vec<f64>>,
    results_cache: AHashMap<String, String>,
}

#[wasm_bindgen]
impl StatsEngine {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        init_panic_hook();
        StatsEngine {
            data_cache: AHashMap::new(),
            results_cache: AHashMap::new(),
        }
    }

    /// Calculate comprehensive statistics for a dataset
    #[wasm_bindgen(js_name = calculateStats)]
    pub fn calculate_stats(&mut self, data_json: &str) -> Result<String, JsValue> {
        let mut data: Vec<f64> = serde_json::from_str(data_json)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse data: {}", e)))?;

        if data.is_empty() {
            return Err(JsValue::from_str("Data array is empty"));
        }

        data.sort_by(|a, b| a.partial_cmp(b).unwrap());

        let count = data.len();
        let sum: f64 = data.iter().sum();
        let mean = sum / count as f64;

        // Calculate median
        let median = if count % 2 == 0 {
            (data[count / 2 - 1] + data[count / 2]) / 2.0
        } else {
            data[count / 2]
        };

        // Calculate mode
        let mode = self.calculate_mode(&data);

        // Calculate variance and standard deviation
        let variance = data.iter()
            .map(|x| (x - mean).powi(2))
            .sum::<f64>() / count as f64;
        let std_dev = variance.sqrt();

        let min = data[0];
        let max = data[count - 1];
        let range = max - min;

        // Calculate percentiles
        let percentiles = self.calculate_percentiles(&data, &[5, 10, 25, 50, 75, 90, 95]);

        // Calculate quartiles
        let q1 = self.percentile(&data, 25.0);
        let q2 = median;
        let q3 = self.percentile(&data, 75.0);
        let iqr = q3 - q1;

        let quartiles = Quartiles { q1, q2, q3, iqr };

        // Identify outliers using IQR method
        let lower_bound = q1 - 1.5 * iqr;
        let upper_bound = q3 + 1.5 * iqr;
        let outliers: Vec<f64> = data.iter()
            .filter(|&&x| x < lower_bound || x > upper_bound)
            .cloned()
            .collect();

        // Calculate skewness and kurtosis
        let skewness = self.calculate_skewness(&data, mean, std_dev);
        let kurtosis = self.calculate_kurtosis(&data, mean, std_dev);

        let result = StatisticsResult {
            count,
            sum,
            mean,
            median,
            mode,
            variance,
            std_dev,
            min,
            max,
            range,
            percentiles,
            quartiles,
            outliers,
            skewness,
            kurtosis,
        };

        let json = serde_json::to_string(&result)
            .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))?;

        self.results_cache.insert("last_stats".to_string(), json.clone());
        Ok(json)
    }

    /// Calculate percentiles for given percentile values
    fn calculate_percentiles(&self, data: &[f64], percentile_values: &[u8]) -> BTreeMap<u8, f64> {
        let mut percentiles = BTreeMap::new();
        for &p in percentile_values {
            percentiles.insert(p, self.percentile(data, p as f64));
        }
        percentiles
    }

    /// Calculate a specific percentile
    fn percentile(&self, sorted_data: &[f64], percentile: f64) -> f64 {
        let index = (sorted_data.len() as f64 - 1.0) * (percentile / 100.0);
        let lower = index.floor() as usize;
        let upper = index.ceil() as usize;

        if lower == upper {
            sorted_data[lower]
        } else {
            let weight = index - lower as f64;
            sorted_data[lower] * (1.0 - weight) + sorted_data[upper] * weight
        }
    }

    /// Calculate mode(s)
    fn calculate_mode(&self, data: &[f64]) -> Vec<f64> {
        let mut frequency: AHashMap<i64, usize> = AHashMap::new();

        for &value in data {
            // Convert to integer for grouping (multiply by 100 to preserve 2 decimal places)
            let key = (value * 100.0).round() as i64;
            *frequency.entry(key).or_insert(0) += 1;
        }

        let max_frequency = *frequency.values().max().unwrap_or(&0);
        if max_frequency == 1 {
            return vec![];  // No mode if all values appear once
        }

        frequency
            .into_iter()
            .filter(|(_, count)| *count == max_frequency)
            .map(|(value, _)| value as f64 / 100.0)
            .collect()
    }

    /// Calculate skewness
    fn calculate_skewness(&self, data: &[f64], mean: f64, std_dev: f64) -> f64 {
        if std_dev == 0.0 {
            return 0.0;
        }

        let n = data.len() as f64;
        let sum_cubed: f64 = data.iter()
            .map(|x| ((x - mean) / std_dev).powi(3))
            .sum();

        (n / ((n - 1.0) * (n - 2.0))) * sum_cubed
    }

    /// Calculate kurtosis
    fn calculate_kurtosis(&self, data: &[f64], mean: f64, std_dev: f64) -> f64 {
        if std_dev == 0.0 {
            return 0.0;
        }

        let n = data.len() as f64;
        let sum_quad: f64 = data.iter()
            .map(|x| ((x - mean) / std_dev).powi(4))
            .sum();

        let kurtosis = (n * (n + 1.0)) / ((n - 1.0) * (n - 2.0) * (n - 3.0)) * sum_quad;
        let adjustment = 3.0 * (n - 1.0).powi(2) / ((n - 2.0) * (n - 3.0));

        kurtosis - adjustment
    }

    /// Calculate correlation between two datasets
    #[wasm_bindgen(js_name = calculateCorrelation)]
    pub fn calculate_correlation(&self, x_json: &str, y_json: &str) -> Result<String, JsValue> {
        let x: Vec<f64> = serde_json::from_str(x_json)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse x data: {}", e)))?;
        let y: Vec<f64> = serde_json::from_str(y_json)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse y data: {}", e)))?;

        if x.len() != y.len() {
            return Err(JsValue::from_str("Data arrays must have the same length"));
        }

        if x.is_empty() {
            return Err(JsValue::from_str("Data arrays are empty"));
        }

        let n = x.len() as f64;
        let sum_x: f64 = x.iter().sum();
        let sum_y: f64 = y.iter().sum();
        let sum_xy: f64 = x.iter().zip(y.iter()).map(|(xi, yi)| xi * yi).sum();
        let sum_x2: f64 = x.iter().map(|xi| xi * xi).sum();
        let sum_y2: f64 = y.iter().map(|yi| yi * yi).sum();

        // Pearson correlation coefficient
        let numerator = n * sum_xy - sum_x * sum_y;
        let denominator = ((n * sum_x2 - sum_x * sum_x) * (n * sum_y2 - sum_y * sum_y)).sqrt();

        let pearson = if denominator == 0.0 {
            0.0
        } else {
            numerator / denominator
        };

        // Spearman rank correlation
        let spearman = self.calculate_spearman(&x, &y);

        let result = CorrelationResult {
            pearson,
            spearman,
            r_squared: pearson * pearson,
        };

        serde_json::to_string(&result)
            .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
    }

    /// Calculate Spearman rank correlation
    fn calculate_spearman(&self, x: &[f64], y: &[f64]) -> f64 {
        let x_ranks = self.calculate_ranks(x);
        let y_ranks = self.calculate_ranks(y);

        let n = x.len() as f64;
        let sum_diff_squared: f64 = x_ranks.iter()
            .zip(y_ranks.iter())
            .map(|(rx, ry)| (rx - ry).powi(2))
            .sum();

        1.0 - (6.0 * sum_diff_squared) / (n * (n * n - 1.0))
    }

    /// Calculate ranks for Spearman correlation
    fn calculate_ranks(&self, data: &[f64]) -> Vec<f64> {
        let mut indexed: Vec<(usize, f64)> = data.iter()
            .enumerate()
            .map(|(i, &v)| (i, v))
            .collect();

        indexed.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap());

        let mut ranks = vec![0.0; data.len()];
        let mut i = 0;

        while i < indexed.len() {
            let mut j = i;
            let mut sum_ranks = 0.0;
            let mut count = 0;

            // Handle ties
            while j < indexed.len() && indexed[j].1 == indexed[i].1 {
                sum_ranks += (j + 1) as f64;
                count += 1;
                j += 1;
            }

            let avg_rank = sum_ranks / count as f64;
            for k in i..j {
                ranks[indexed[k].0] = avg_rank;
            }

            i = j;
        }

        ranks
    }

    /// Perform linear regression
    #[wasm_bindgen(js_name = linearRegression)]
    pub fn linear_regression(&self, x_json: &str, y_json: &str) -> Result<String, JsValue> {
        let x: Vec<f64> = serde_json::from_str(x_json)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse x data: {}", e)))?;
        let y: Vec<f64> = serde_json::from_str(y_json)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse y data: {}", e)))?;

        if x.len() != y.len() || x.is_empty() {
            return Err(JsValue::from_str("Invalid data arrays"));
        }

        let n = x.len() as f64;
        let sum_x: f64 = x.iter().sum();
        let sum_y: f64 = y.iter().sum();
        let sum_xy: f64 = x.iter().zip(y.iter()).map(|(xi, yi)| xi * yi).sum();
        let sum_x2: f64 = x.iter().map(|xi| xi * xi).sum();

        // Calculate slope and intercept
        let slope = (n * sum_xy - sum_x * sum_y) / (n * sum_x2 - sum_x * sum_x);
        let intercept = (sum_y - slope * sum_x) / n;

        // Calculate predictions and residuals
        let predictions: Vec<f64> = x.iter()
            .map(|xi| slope * xi + intercept)
            .collect();

        // Calculate R-squared
        let y_mean = sum_y / n;
        let ss_res: f64 = y.iter()
            .zip(predictions.iter())
            .map(|(yi, pred)| (yi - pred).powi(2))
            .sum();
        let ss_tot: f64 = y.iter()
            .map(|yi| (yi - y_mean).powi(2))
            .sum();

        let r_squared = if ss_tot == 0.0 { 0.0 } else { 1.0 - (ss_res / ss_tot) };

        // Calculate standard error
        let standard_error = (ss_res / (n - 2.0)).sqrt();

        let result = RegressionResult {
            slope,
            intercept,
            r_squared,
            standard_error,
            predictions,
        };

        serde_json::to_string(&result)
            .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
    }

    /// Aggregate data by groups
    #[wasm_bindgen(js_name = aggregateByGroup)]
    pub fn aggregate_by_group(&self, data_json: &str, groups_json: &str) -> Result<String, JsValue> {
        let data: Vec<f64> = serde_json::from_str(data_json)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse data: {}", e)))?;
        let groups: Vec<String> = serde_json::from_str(groups_json)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse groups: {}", e)))?;

        if data.len() != groups.len() {
            return Err(JsValue::from_str("Data and groups must have the same length"));
        }

        let mut group_data: AHashMap<String, Vec<f64>> = AHashMap::new();

        for (value, group) in data.iter().zip(groups.iter()) {
            group_data.entry(group.clone())
                .or_insert_with(Vec::new)
                .push(*value);
        }

        let mut group_stats = BTreeMap::new();
        let mut total_sum = 0.0;
        let total_count = data.len();

        for (group, values) in group_data {
            let count = values.len();
            let sum: f64 = values.iter().sum();
            let mean = sum / count as f64;
            let min = values.iter().fold(f64::INFINITY, |a, &b| a.min(b));
            let max = values.iter().fold(f64::NEG_INFINITY, |a, &b| a.max(b));

            total_sum += sum;

            group_stats.insert(group, GroupStats {
                count,
                sum,
                mean,
                min,
                max,
            });
        }

        let result = AggregationResult {
            groups: group_stats,
            total_count,
            total_sum,
        };

        serde_json::to_string(&result)
            .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
    }

    /// Calculate moving average
    #[wasm_bindgen(js_name = movingAverage)]
    pub fn moving_average(&self, data_json: &str, window_size: usize) -> Result<String, JsValue> {
        let data: Vec<f64> = serde_json::from_str(data_json)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse data: {}", e)))?;

        if window_size == 0 || window_size > data.len() {
            return Err(JsValue::from_str("Invalid window size"));
        }

        let mut moving_averages = Vec::with_capacity(data.len() - window_size + 1);

        for i in 0..=(data.len() - window_size) {
            let window_sum: f64 = data[i..i + window_size].iter().sum();
            moving_averages.push(window_sum / window_size as f64);
        }

        serde_json::to_string(&moving_averages)
            .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
    }

    /// Calculate exponential smoothing
    #[wasm_bindgen(js_name = exponentialSmoothing)]
    pub fn exponential_smoothing(&self, data_json: &str, alpha: f64) -> Result<String, JsValue> {
        let data: Vec<f64> = serde_json::from_str(data_json)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse data: {}", e)))?;

        if data.is_empty() {
            return Err(JsValue::from_str("Data array is empty"));
        }

        if alpha < 0.0 || alpha > 1.0 {
            return Err(JsValue::from_str("Alpha must be between 0 and 1"));
        }

        let mut smoothed = Vec::with_capacity(data.len());
        smoothed.push(data[0]);  // First value is the initial value

        for i in 1..data.len() {
            let smoothed_value = alpha * data[i] + (1.0 - alpha) * smoothed[i - 1];
            smoothed.push(smoothed_value);
        }

        serde_json::to_string(&smoothed)
            .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
    }

    /// Detect anomalies using Z-score method
    #[wasm_bindgen(js_name = detectAnomalies)]
    pub fn detect_anomalies(&self, data_json: &str, z_threshold: f64) -> Result<String, JsValue> {
        let data: Vec<f64> = serde_json::from_str(data_json)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse data: {}", e)))?;

        if data.is_empty() {
            return Err(JsValue::from_str("Data array is empty"));
        }

        let n = data.len() as f64;
        let mean: f64 = data.iter().sum::<f64>() / n;
        let variance: f64 = data.iter()
            .map(|x| (x - mean).powi(2))
            .sum::<f64>() / n;
        let std_dev = variance.sqrt();

        if std_dev == 0.0 {
            return Ok("[]".to_string());  // No anomalies if no variation
        }

        #[derive(Serialize)]
        struct Anomaly {
            index: usize,
            value: f64,
            z_score: f64,
        }

        let anomalies: Vec<Anomaly> = data.iter()
            .enumerate()
            .filter_map(|(i, &value)| {
                let z_score = (value - mean) / std_dev;
                if z_score.abs() > z_threshold {
                    Some(Anomaly { index: i, value, z_score })
                } else {
                    None
                }
            })
            .collect();

        serde_json::to_string(&anomalies)
            .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
    }

    /// Clear all caches
    #[wasm_bindgen(js_name = clear)]
    pub fn clear(&mut self) {
        self.data_cache.clear();
        self.results_cache.clear();
    }
}