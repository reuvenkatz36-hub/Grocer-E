-- Grocer-E Database Schema
-- PostgreSQL schema for Israeli supermarket price comparison

-- Enable UUID extension for future use
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Supermarkets table - stores information about supermarket locations
CREATE TABLE IF NOT EXISTS supermarkets (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  chain_name VARCHAR(100) NOT NULL,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  address TEXT,
  phone VARCHAR(20),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT valid_latitude CHECK (latitude >= -90 AND latitude <= 90),
  CONSTRAINT valid_longitude CHECK (longitude >= -180 AND longitude <= 180)
);

-- Create index on coordinates for geospatial queries
CREATE INDEX idx_supermarkets_coordinates ON supermarkets(latitude, longitude);
CREATE INDEX idx_supermarkets_chain ON supermarkets(chain_name);
CREATE INDEX idx_supermarkets_active ON supermarkets(is_active);

-- Products table - master list of products
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(500) NOT NULL UNIQUE,
  category VARCHAR(100),
  barcode VARCHAR(50),
  unit VARCHAR(50) DEFAULT 'item',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index on product names for searching
CREATE INDEX idx_products_name ON products(name);
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_barcode ON products(barcode);

-- Prices table - product prices at different supermarkets
CREATE TABLE IF NOT EXISTS prices (
  id SERIAL PRIMARY KEY,
  supermarket_id INTEGER NOT NULL REFERENCES supermarkets(id) ON DELETE CASCADE,
  product_name VARCHAR(500) NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  unit VARCHAR(50) DEFAULT 'item',
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT positive_price CHECK (price >= 0),
  UNIQUE(supermarket_id, product_name)
);

-- Create indexes for efficient price lookups
CREATE INDEX idx_prices_supermarket ON prices(supermarket_id);
CREATE INDEX idx_prices_product_name ON prices(product_name);
CREATE INDEX idx_prices_last_updated ON prices(last_updated);
CREATE INDEX idx_prices_supermarket_product ON prices(supermarket_id, product_name);

-- Price history table - track price changes over time
CREATE TABLE IF NOT EXISTS price_history (
  id SERIAL PRIMARY KEY,
  supermarket_id INTEGER NOT NULL REFERENCES supermarkets(id) ON DELETE CASCADE,
  product_name VARCHAR(500) NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  unit VARCHAR(50) DEFAULT 'item',
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT positive_price CHECK (price >= 0)
);

-- Create index for historical queries
CREATE INDEX idx_price_history_supermarket ON price_history(supermarket_id);
CREATE INDEX idx_price_history_product_name ON price_history(product_name);
CREATE INDEX idx_price_history_recorded_at ON price_history(recorded_at DESC);

-- Baskets table - store user shopping lists and comparisons
CREATE TABLE IF NOT EXISTS baskets (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255),
  name VARCHAR(255),
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT valid_latitude CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90)),
  CONSTRAINT valid_longitude CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180))
);

-- Create index for user baskets
CREATE INDEX idx_baskets_user_id ON baskets(user_id);
CREATE INDEX idx_baskets_created_at ON baskets(created_at DESC);

-- Basket items table - items in a basket
CREATE TABLE IF NOT EXISTS basket_items (
  id SERIAL PRIMARY KEY,
  basket_id INTEGER NOT NULL REFERENCES baskets(id) ON DELETE CASCADE,
  product_name VARCHAR(500) NOT NULL,
  quantity DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT positive_quantity CHECK (quantity > 0)
);

-- Create index for basket items
CREATE INDEX idx_basket_items_basket ON basket_items(basket_id);

-- Basket comparisons table - results of price comparisons
CREATE TABLE IF NOT EXISTS basket_comparisons (
  id SERIAL PRIMARY KEY,
  basket_id INTEGER NOT NULL REFERENCES baskets(id) ON DELETE CASCADE,
  supermarket_id INTEGER NOT NULL REFERENCES supermarkets(id) ON DELETE CASCADE,
  total_price DECIMAL(12, 2) NOT NULL,
  items_found INTEGER,
  items_total INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT positive_total_price CHECK (total_price >= 0)
);

-- Create index for comparisons
CREATE INDEX idx_basket_comparisons_basket ON basket_comparisons(basket_id);
CREATE INDEX idx_basket_comparisons_supermarket ON basket_comparisons(supermarket_id);

-- Scraper metadata table - track scraping operations
CREATE TABLE IF NOT EXISTS scraper_metadata (
  id SERIAL PRIMARY KEY,
  chain_name VARCHAR(100) NOT NULL,
  last_scraped TIMESTAMP,
  next_scheduled_scrape TIMESTAMP,
  scrape_status VARCHAR(50) DEFAULT 'pending',
  error_message TEXT,
  records_updated INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(chain_name)
);

-- Create index for scraper tracking
CREATE INDEX idx_scraper_metadata_chain ON scraper_metadata(chain_name);
CREATE INDEX idx_scraper_metadata_next_scrape ON scraper_metadata(next_scheduled_scrape);

-- Create function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_supermarkets_updated_at BEFORE UPDATE ON supermarkets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_baskets_updated_at BEFORE UPDATE ON baskets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_scraper_metadata_updated_at BEFORE UPDATE ON scraper_metadata
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Views for common queries

-- View: Average prices by product across all stores
CREATE OR REPLACE VIEW view_average_prices AS
SELECT 
  product_name,
  COUNT(DISTINCT supermarket_id) as stores_with_product,
  AVG(price) as average_price,
  MIN(price) as cheapest_price,
  MAX(price) as most_expensive_price,
  MAX(price) - MIN(price) as price_range
FROM prices
WHERE last_updated > CURRENT_TIMESTAMP - INTERVAL '7 days'
GROUP BY product_name;

-- View: Supermarket price comparison for specific products
CREATE OR REPLACE VIEW view_store_rankings AS
SELECT 
  s.id,
  s.name,
  s.chain_name,
  p.product_name,
  p.price,
  p.unit,
  RANK() OVER (PARTITION BY p.product_name ORDER BY p.price ASC) as price_rank,
  p.last_updated
FROM prices p
INNER JOIN supermarkets s ON p.supermarket_id = s.id
WHERE p.last_updated > CURRENT_TIMESTAMP - INTERVAL '7 days'
AND s.is_active = true;

-- View: Latest prices per supermarket per product
CREATE OR REPLACE VIEW view_latest_prices AS
SELECT DISTINCT ON (supermarket_id, product_name)
  supermarket_id,
  product_name,
  price,
  unit,
  last_updated
FROM prices
ORDER BY supermarket_id, product_name, last_updated DESC;

-- Sample data for testing (optional - comment out if not needed)
-- INSERT INTO supermarkets (name, chain_name, latitude, longitude, address) VALUES
-- ('סופרסל תל אביב', 'Shufersal', 32.0853, 34.7818, 'תל אביב'),
-- ('רמי לוי רמת גן', 'Rami Levy', 32.0820, 34.8244, 'רמת גן'),
-- ('victory שוק הדר', 'Victory', 32.0852, 34.7688, 'חיפה');

-- INSERT INTO products (name, category, unit) VALUES
-- ('לחם לבן 500ג', 'Bakery', 'item'),
-- ('חלב מלא 1 ליטר', 'Dairy', 'item'),
-- ('עגבניות אדומות', 'Produce', 'kg');
