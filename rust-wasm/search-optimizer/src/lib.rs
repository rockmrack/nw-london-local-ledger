use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};
use ahash::{AHashMap, AHashSet};
use std::collections::BTreeMap;
use web_sys::console;

#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

#[wasm_bindgen]
pub fn init_panic_hook() {
    console_error_panic_hook::set_once();
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SearchDocument {
    pub id: String,
    pub title: String,
    pub content: String,
    pub tags: Vec<String>,
    pub category: String,
    pub score: f64,
    pub metadata: Option<AHashMap<String, String>>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct SearchQuery {
    pub query: String,
    pub filters: Option<SearchFilters>,
    pub limit: usize,
    pub offset: usize,
    pub boost_fields: Option<AHashMap<String, f64>>,
    pub fuzzy: bool,
    pub fuzzy_distance: Option<usize>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct SearchFilters {
    pub categories: Option<Vec<String>>,
    pub tags: Option<Vec<String>>,
    pub date_range: Option<DateRange>,
    pub score_threshold: Option<f64>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct DateRange {
    pub from: String,
    pub to: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct SearchResult {
    pub documents: Vec<SearchDocument>,
    pub total: usize,
    pub took_ms: f64,
    pub facets: Option<BTreeMap<String, BTreeMap<String, usize>>>,
}

// Inverted index for fast text search
struct InvertedIndex {
    term_documents: AHashMap<String, AHashSet<usize>>,
    document_terms: Vec<AHashSet<String>>,
    term_frequencies: AHashMap<String, AHashMap<usize, usize>>,
    document_lengths: Vec<usize>,
}

impl InvertedIndex {
    fn new() -> Self {
        InvertedIndex {
            term_documents: AHashMap::new(),
            document_terms: Vec::new(),
            term_frequencies: AHashMap::new(),
            document_lengths: Vec::new(),
        }
    }

    fn add_document(&mut self, doc_id: usize, text: &str) {
        let terms = Self::tokenize(text);
        let unique_terms: AHashSet<String> = terms.iter().cloned().collect();

        // Ensure vectors are large enough
        while self.document_terms.len() <= doc_id {
            self.document_terms.push(AHashSet::new());
            self.document_lengths.push(0);
        }

        self.document_terms[doc_id] = unique_terms.clone();
        self.document_lengths[doc_id] = terms.len();

        // Count term frequencies
        let mut term_freq: AHashMap<String, usize> = AHashMap::new();
        for term in &terms {
            *term_freq.entry(term.clone()).or_insert(0) += 1;
        }

        // Update inverted index
        for (term, freq) in term_freq {
            self.term_documents
                .entry(term.clone())
                .or_insert_with(AHashSet::new)
                .insert(doc_id);

            self.term_frequencies
                .entry(term)
                .or_insert_with(AHashMap::new)
                .insert(doc_id, freq);
        }
    }

    fn tokenize(text: &str) -> Vec<String> {
        text.to_lowercase()
            .split(|c: char| !c.is_alphanumeric())
            .filter(|s| !s.is_empty() && s.len() > 1)
            .map(|s| s.to_string())
            .collect()
    }

    fn search(&self, query: &str, fuzzy: bool, distance: usize) -> AHashSet<usize> {
        let query_terms = Self::tokenize(query);
        let mut matching_docs = AHashSet::new();

        for term in query_terms {
            // Exact match
            if let Some(docs) = self.term_documents.get(&term) {
                matching_docs.extend(docs);
            }

            // Fuzzy matching if enabled
            if fuzzy {
                for index_term in self.term_documents.keys() {
                    if Self::levenshtein_distance(&term, index_term) <= distance {
                        if let Some(docs) = self.term_documents.get(index_term) {
                            matching_docs.extend(docs);
                        }
                    }
                }
            }
        }

        matching_docs
    }

    fn levenshtein_distance(s1: &str, s2: &str) -> usize {
        let len1 = s1.len();
        let len2 = s2.len();

        if len1 == 0 {
            return len2;
        }
        if len2 == 0 {
            return len1;
        }

        let s1_chars: Vec<char> = s1.chars().collect();
        let s2_chars: Vec<char> = s2.chars().collect();

        let mut prev_row: Vec<usize> = (0..=len2).collect();
        let mut curr_row = vec![0; len2 + 1];

        for (i, c1) in s1_chars.iter().enumerate() {
            curr_row[0] = i + 1;

            for (j, c2) in s2_chars.iter().enumerate() {
                let cost = if c1 == c2 { 0 } else { 1 };
                curr_row[j + 1] = std::cmp::min(
                    std::cmp::min(
                        prev_row[j + 1] + 1,  // deletion
                        curr_row[j] + 1,       // insertion
                    ),
                    prev_row[j] + cost,        // substitution
                );
            }

            std::mem::swap(&mut prev_row, &mut curr_row);
        }

        prev_row[len2]
    }

    fn calculate_bm25_score(&self, doc_id: usize, query_terms: &[String], k1: f64, b: f64) -> f64 {
        let doc_length = self.document_lengths[doc_id] as f64;
        let avg_doc_length = self.document_lengths.iter().sum::<usize>() as f64 / self.document_lengths.len() as f64;
        let total_docs = self.document_lengths.len() as f64;

        let mut score = 0.0;

        for term in query_terms {
            if let Some(doc_freq_map) = self.term_frequencies.get(term) {
                if let Some(&term_freq) = doc_freq_map.get(&doc_id) {
                    let docs_with_term = doc_freq_map.len() as f64;
                    let idf = ((total_docs - docs_with_term + 0.5) / (docs_with_term + 0.5)).ln();

                    let tf = term_freq as f64;
                    let normalized_tf = (tf * (k1 + 1.0)) / (tf + k1 * (1.0 - b + b * (doc_length / avg_doc_length)));

                    score += idf * normalized_tf;
                }
            }
        }

        score
    }
}

#[wasm_bindgen]
pub struct SearchOptimizer {
    documents: Vec<SearchDocument>,
    index: InvertedIndex,
    category_index: AHashMap<String, AHashSet<usize>>,
    tag_index: AHashMap<String, AHashSet<usize>>,
}

#[wasm_bindgen]
impl SearchOptimizer {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        init_panic_hook();
        SearchOptimizer {
            documents: Vec::new(),
            index: InvertedIndex::new(),
            category_index: AHashMap::new(),
            tag_index: AHashMap::new(),
        }
    }

    /// Load and index documents
    #[wasm_bindgen(js_name = loadDocuments)]
    pub fn load_documents(&mut self, documents_json: &str) -> Result<usize, JsValue> {
        let documents: Vec<SearchDocument> = serde_json::from_str(documents_json)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse documents: {}", e)))?;

        let count = documents.len();

        for (idx, doc) in documents.iter().enumerate() {
            // Index content
            let combined_text = format!("{} {} {}", doc.title, doc.content, doc.tags.join(" "));
            self.index.add_document(idx, &combined_text);

            // Index category
            self.category_index
                .entry(doc.category.clone())
                .or_insert_with(AHashSet::new)
                .insert(idx);

            // Index tags
            for tag in &doc.tags {
                self.tag_index
                    .entry(tag.clone())
                    .or_insert_with(AHashSet::new)
                    .insert(idx);
            }
        }

        self.documents = documents;
        Ok(count)
    }

    /// Perform optimized search
    #[wasm_bindgen(js_name = search)]
    pub fn search(&self, query_json: &str) -> Result<String, JsValue> {
        let start = web_sys::window()
            .and_then(|w| w.performance())
            .map(|p| p.now())
            .unwrap_or(0.0);

        let query: SearchQuery = serde_json::from_str(query_json)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse query: {}", e)))?;

        // Get matching document IDs from text search
        let fuzzy_distance = query.fuzzy_distance.unwrap_or(2);
        let mut matching_ids = self.index.search(&query.query, query.fuzzy, fuzzy_distance);

        // Apply filters
        if let Some(filters) = &query.filters {
            matching_ids = self.apply_filters(matching_ids, filters);
        }

        // Calculate scores
        let query_terms = InvertedIndex::tokenize(&query.query);
        let mut scored_docs: Vec<(usize, f64)> = matching_ids
            .into_iter()
            .map(|doc_id| {
                let base_score = self.index.calculate_bm25_score(doc_id, &query_terms, 1.2, 0.75);
                let boosted_score = self.apply_boost(doc_id, base_score, &query.boost_fields);
                (doc_id, boosted_score)
            })
            .collect();

        // Apply score threshold if specified
        if let Some(filters) = &query.filters {
            if let Some(threshold) = filters.score_threshold {
                scored_docs.retain(|(_, score)| *score >= threshold);
            }
        }

        // Sort by score (descending)
        scored_docs.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());

        // Apply pagination
        let total = scored_docs.len();
        let start_idx = query.offset.min(total);
        let end_idx = (start_idx + query.limit).min(total);

        let mut result_docs: Vec<SearchDocument> = scored_docs[start_idx..end_idx]
            .iter()
            .map(|(doc_id, score)| {
                let mut doc = self.documents[*doc_id].clone();
                doc.score = *score;
                doc
            })
            .collect();

        // Calculate facets if needed
        let facets = if query.filters.is_some() {
            Some(self.calculate_facets(&scored_docs))
        } else {
            None
        };

        let end = web_sys::window()
            .and_then(|w| w.performance())
            .map(|p| p.now())
            .unwrap_or(0.0);

        let result = SearchResult {
            documents: result_docs,
            total,
            took_ms: end - start,
            facets,
        };

        serde_json::to_string(&result)
            .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
    }

    fn apply_filters(&self, mut doc_ids: AHashSet<usize>, filters: &SearchFilters) -> AHashSet<usize> {
        // Filter by categories
        if let Some(categories) = &filters.categories {
            let mut category_docs = AHashSet::new();
            for category in categories {
                if let Some(docs) = self.category_index.get(category) {
                    category_docs.extend(docs);
                }
            }
            doc_ids = doc_ids.intersection(&category_docs).cloned().collect();
        }

        // Filter by tags
        if let Some(tags) = &filters.tags {
            let mut tag_docs = AHashSet::new();
            for tag in tags {
                if let Some(docs) = self.tag_index.get(tag) {
                    tag_docs.extend(docs);
                }
            }
            doc_ids = doc_ids.intersection(&tag_docs).cloned().collect();
        }

        doc_ids
    }

    fn apply_boost(&self, doc_id: usize, base_score: f64, boost_fields: &Option<AHashMap<String, f64>>) -> f64 {
        let mut score = base_score;

        if let Some(boosts) = boost_fields {
            let doc = &self.documents[doc_id];

            // Boost by title matches
            if let Some(title_boost) = boosts.get("title") {
                if doc.title.to_lowercase().contains(&doc.title.to_lowercase()) {
                    score *= title_boost;
                }
            }

            // Boost by category
            if let Some(category_boost) = boosts.get(&doc.category) {
                score *= category_boost;
            }

            // Boost by tags
            for tag in &doc.tags {
                if let Some(tag_boost) = boosts.get(tag) {
                    score *= tag_boost;
                }
            }
        }

        score
    }

    fn calculate_facets(&self, scored_docs: &[(usize, f64)]) -> BTreeMap<String, BTreeMap<String, usize>> {
        let mut facets = BTreeMap::new();
        let mut category_counts = BTreeMap::new();
        let mut tag_counts = BTreeMap::new();

        for (doc_id, _) in scored_docs {
            let doc = &self.documents[*doc_id];

            // Count categories
            *category_counts.entry(doc.category.clone()).or_insert(0) += 1;

            // Count tags
            for tag in &doc.tags {
                *tag_counts.entry(tag.clone()).or_insert(0) += 1;
            }
        }

        facets.insert("categories".to_string(), category_counts);
        facets.insert("tags".to_string(), tag_counts);

        facets
    }

    /// Get suggestions for autocomplete
    #[wasm_bindgen(js_name = getSuggestions)]
    pub fn get_suggestions(&self, prefix: &str, limit: usize) -> Result<String, JsValue> {
        let prefix_lower = prefix.to_lowercase();
        let mut suggestions = AHashSet::new();

        // Collect terms starting with prefix
        for term in self.index.term_documents.keys() {
            if term.starts_with(&prefix_lower) {
                suggestions.insert(term.clone());
                if suggestions.len() >= limit * 2 {
                    break;
                }
            }
        }

        // Sort by frequency (approximated by document count)
        let mut sorted_suggestions: Vec<(String, usize)> = suggestions
            .into_iter()
            .map(|term| {
                let doc_count = self.index.term_documents.get(&term)
                    .map(|docs| docs.len())
                    .unwrap_or(0);
                (term, doc_count)
            })
            .collect();

        sorted_suggestions.sort_by(|a, b| b.1.cmp(&a.1));

        let result: Vec<String> = sorted_suggestions
            .into_iter()
            .take(limit)
            .map(|(term, _)| term)
            .collect();

        serde_json::to_string(&result)
            .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
    }

    /// Batch scoring for multiple queries
    #[wasm_bindgen(js_name = batchScore)]
    pub fn batch_score(&self, queries_json: &str) -> Result<String, JsValue> {
        let queries: Vec<String> = serde_json::from_str(queries_json)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse queries: {}", e)))?;

        let mut results = Vec::new();

        for query_str in queries {
            let query_terms = InvertedIndex::tokenize(&query_str);
            let matching_ids = self.index.search(&query_str, false, 0);

            let mut scored: Vec<(String, f64)> = matching_ids
                .into_iter()
                .map(|doc_id| {
                    let score = self.index.calculate_bm25_score(doc_id, &query_terms, 1.2, 0.75);
                    (self.documents[doc_id].id.clone(), score)
                })
                .collect();

            scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());

            results.push(scored);
        }

        serde_json::to_string(&results)
            .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
    }

    /// Export search index statistics
    #[wasm_bindgen(js_name = getIndexStats)]
    pub fn get_index_stats(&self) -> Result<String, JsValue> {
        #[derive(Serialize)]
        struct IndexStats {
            total_documents: usize,
            total_terms: usize,
            avg_document_length: f64,
            categories: usize,
            tags: usize,
        }

        let stats = IndexStats {
            total_documents: self.documents.len(),
            total_terms: self.index.term_documents.len(),
            avg_document_length: if self.index.document_lengths.is_empty() {
                0.0
            } else {
                self.index.document_lengths.iter().sum::<usize>() as f64 / self.index.document_lengths.len() as f64
            },
            categories: self.category_index.len(),
            tags: self.tag_index.len(),
        };

        serde_json::to_string(&stats)
            .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
    }

    /// Clear all data
    #[wasm_bindgen(js_name = clear)]
    pub fn clear(&mut self) {
        self.documents.clear();
        self.index = InvertedIndex::new();
        self.category_index.clear();
        self.tag_index.clear();
    }
}