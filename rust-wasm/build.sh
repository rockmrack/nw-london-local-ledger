#!/bin/bash

# Build script for Rust WASM modules

set -e

echo "Building Rust WASM modules..."

# Install wasm-pack if not available
if ! command -v wasm-pack &> /dev/null; then
    echo "Installing wasm-pack..."
    curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
fi

# Build directories
BUILD_DIR="../src/lib/wasm/pkg"
mkdir -p $BUILD_DIR

# Build each module
MODULES=("property-processor" "geo-calculator" "stats-engine" "search-optimizer" "data-transformer")

for MODULE in "${MODULES[@]}"; do
    echo "Building $MODULE..."
    cd $MODULE

    # Build with wasm-pack
    wasm-pack build --target web --out-dir "$BUILD_DIR/$MODULE" --release

    # Remove unnecessary files
    rm -f "$BUILD_DIR/$MODULE/.gitignore"
    rm -f "$BUILD_DIR/$MODULE/package.json"

    cd ..
done

echo "All WASM modules built successfully!"

# Generate TypeScript index
echo "Generating TypeScript index..."
cat > $BUILD_DIR/index.ts << 'EOF'
// Auto-generated WASM module exports
export * as PropertyProcessor from './property-processor/property_processor';
export * as GeoCalculator from './geo-calculator/geo_calculator';
export * as StatsEngine from './stats-engine/stats_engine';
export * as SearchOptimizer from './search-optimizer/search_optimizer';
export * as DataTransformer from './data-transformer/data_transformer';

// Initialize all modules
export async function initializeWASM() {
  const modules = await Promise.all([
    import('./property-processor/property_processor'),
    import('./geo-calculator/geo_calculator'),
    import('./stats-engine/stats_engine'),
    import('./search-optimizer/search_optimizer'),
    import('./data-transformer/data_transformer'),
  ]);

  // Initialize each module
  await Promise.all(modules.map(m => m.default ? m.default() : Promise.resolve()));

  console.log('[WASM] All modules initialized successfully');
  return modules;
}
EOF

echo "Build complete!"