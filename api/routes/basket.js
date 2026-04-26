const express = require('express');
const redis = require('redis');
const { Pool } = require('pg');
const router = express.Router();

// Initialize Redis client
const redisClient = redis.createClient({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379
});

redisClient.on('error', (err) => {
  console.error('Redis error:', err);
});

// Initialize PostgreSQL connection pool
const pool = new Pool({
  user: process.env.DB_USER || 'grocer_user',
  password: process.env.DB_PASSWORD || 'password',
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'grocer_e'
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in kilometers
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * GET /api/basket/supermarkets
 * List all supported supermarket chains
 */
router.get('/supermarkets', async (req, res) => {
  try {
    const cacheKey = 'supermarkets:list';
    
    // Try to get from cache
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    // Query database
    const result = await pool.query(
      'SELECT id, name, chain_name, latitude, longitude, updated_at FROM supermarkets ORDER BY chain_name'
    );

    const supermarkets = result.rows;

    // Cache for 24 hours
    await redisClient.setEx(cacheKey, 86400, JSON.stringify(supermarkets));

    res.json(supermarkets);
  } catch (err) {
    console.error('Error fetching supermarkets:', err);
    res.status(500).json({ error: 'Failed to fetch supermarkets' });
  }
});

/**
 * GET /api/basket/nearby
 * Get nearby stores based on user location
 * Query params: latitude, longitude, radius (km, default: 5)
 */
router.get('/nearby', async (req, res) => {
  try {
    const { latitude, longitude, radius = 5 } = req.query;

    if (!latitude || !longitude) {
      return res.status(400).json({ error: 'Latitude and longitude are required' });
    }

    const userLat = parseFloat(latitude);
    const userLon = parseFloat(longitude);
    const searchRadius = parseFloat(radius);

    if (isNaN(userLat) || isNaN(userLon) || isNaN(searchRadius)) {
      return res.status(400).json({ error: 'Invalid coordinates or radius' });
    }

    // Query all stores from database
    const result = await pool.query(
      'SELECT id, name, chain_name, latitude, longitude FROM supermarkets'
    );

    // Filter by distance
    const nearbyStores = result.rows
      .map(store => ({
        ...store,
        distance: calculateDistance(userLat, userLon, store.latitude, store.longitude)
      }))
      .filter(store => store.distance <= searchRadius)
      .sort((a, b) => a.distance - b.distance);

    res.json({
      user_location: { latitude: userLat, longitude: userLon },
      search_radius_km: searchRadius,
      stores_found: nearbyStores.length,
      stores: nearbyStores
    });
  } catch (err) {
    console.error('Error fetching nearby stores:', err);
    res.status(500).json({ error: 'Failed to fetch nearby stores' });
  }
});

/**
 * POST /api/basket/compare
 * Compare prices for a shopping list across nearby stores
 * Body: {
 *   items: [{ product_id: string, quantity: number, name: string }, ...],
 *   latitude: number,
 *   longitude: number,
 *   radius: number (optional, default: 5)
 * }
 */
router.post('/compare', async (req, res) => {
  try {
    const { items, latitude, longitude, radius = 5 } = req.body;

    // Validation
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Items array is required and must not be empty' });
    }

    if (!latitude || !longitude) {
      return res.status(400).json({ error: 'Latitude and longitude are required' });
    }

    const userLat = parseFloat(latitude);
    const userLon = parseFloat(longitude);
    const searchRadius = parseFloat(radius);

    // Create cache key
    const cacheKey = `basket:${userLat}:${userLon}:${searchRadius}:${items.map(i => i.product_id).join(',')}`;

    // Check cache
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    // Get nearby stores
    const storesResult = await pool.query(
      'SELECT id, name, chain_name, latitude, longitude FROM supermarkets'
    );

    const nearbyStores = storesResult.rows
      .map(store => ({
        ...store,
        distance: calculateDistance(userLat, userLon, store.latitude, store.longitude)
      }))
      .filter(store => store.distance <= searchRadius)
      .sort((a, b) => a.distance - b.distance);

    if (nearbyStores.length === 0) {
      return res.status(404).json({ error: 'No supermarkets found in the specified radius' });
    }

    // Get prices for items across all nearby stores
    const storeIds = nearbyStores.map(s => s.id);
    const productNames = items.map(i => i.name);

    const pricesResult = await pool.query(
      `SELECT 
        p.supermarket_id, 
        p.product_name, 
        p.price, 
        p.unit,
        p.last_updated
       FROM prices p
       WHERE p.supermarket_id = ANY($1::int[])
       AND p.product_name = ANY($2::text[])
       AND p.last_updated > NOW() - INTERVAL '7 days'`,
      [storeIds, productNames]
    );

    const pricesByStore = {};
    nearbyStores.forEach(store => {
      pricesByStore[store.id] = {
        ...store,
        items: [],
        total_price: 0,
        items_found: 0
      };
    });

    // Map prices to stores
    pricesResult.rows.forEach(row => {
      if (pricesByStore[row.supermarket_id]) {
        pricesByStore[row.supermarket_id].items.push({
          product_name: row.product_name,
          price: row.price,
          unit: row.unit,
          last_updated: row.last_updated
        });
        pricesByStore[row.supermarket_id].items_found += 1;
      }
    });

    // Calculate totals for each store
    const comparisons = Object.values(pricesByStore).map(store => {
      let totalPrice = 0;
      items.forEach(item => {
        const priceEntry = store.items.find(p => p.product_name.toLowerCase() === item.name.toLowerCase());
        if (priceEntry) {
          totalPrice += priceEntry.price * item.quantity;
        }
      });
      return {
        ...store,
        total_price: parseFloat(totalPrice.toFixed(2)),
        price_per_item: items.length > 0 ? parseFloat((totalPrice / items.length).toFixed(2)) : 0
      };
    });

    // Sort by total price
    comparisons.sort((a, b) => a.total_price - b.total_price);

    const cheapestStore = comparisons[0];
    const mostExpensiveStore = comparisons[comparisons.length - 1];
    const savings = mostExpensiveStore.total_price - cheapestStore.total_price;

    const result = {
      search_location: { latitude: userLat, longitude: userLon },
      search_radius_km: searchRadius,
      items_searched: items.length,
      stores_compared: comparisons.length,
      cheapest_store: {
        id: cheapestStore.id,
        name: cheapestStore.name,
        chain_name: cheapestStore.chain_name,
        distance_km: parseFloat(cheapestStore.distance.toFixed(2)),
        total_price: cheapestStore.total_price,
        items_found: cheapestStore.items_found
      },
      most_expensive_store: {
        id: mostExpensiveStore.id,
        name: mostExpensiveStore.name,
        chain_name: mostExpensiveStore.chain_name,
        distance_km: parseFloat(mostExpensiveStore.distance.toFixed(2)),
        total_price: mostExpensiveStore.total_price,
        items_found: mostExpensiveStore.items_found
      },
      potential_savings_nis: parseFloat(savings.toFixed(2)),
      savings_percentage: parseFloat(((savings / mostExpensiveStore.total_price) * 100).toFixed(2)),
      all_comparisons: comparisons.map(store => ({
        id: store.id,
        name: store.name,
        chain_name: store.chain_name,
        distance_km: parseFloat(store.distance.toFixed(2)),
        total_price: store.total_price,
        price_per_item: store.price_per_item,
        items_found: store.items_found,
        items: store.items
      }))
    };

    // Cache result for 1 hour
    await redisClient.setEx(cacheKey, 3600, JSON.stringify(result));

    res.json(result);
  } catch (err) {
    console.error('Error comparing basket:', err);
    res.status(500).json({ error: 'Failed to compare basket prices' });
  }
});

/**
 * POST /api/basket/add-store
 * Admin endpoint to add a new supermarket location
 */
router.post('/add-store', async (req, res) => {
  try {
    const { name, chain_name, latitude, longitude } = req.body;

    if (!name || !chain_name || latitude === undefined || longitude === undefined) {
      return res.status(400).json({ error: 'Name, chain_name, latitude, and longitude are required' });
    }

    const result = await pool.query(
      `INSERT INTO supermarkets (name, chain_name, latitude, longitude, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       RETURNING id, name, chain_name, latitude, longitude`,
      [name, chain_name, latitude, longitude]
    );

    // Invalidate cache
    await redisClient.del('supermarkets:list');

    res.status(201).json({
      message: 'Store added successfully',
      store: result.rows[0]
    });
  } catch (err) {
    console.error('Error adding store:', err);
    res.status(500).json({ error: 'Failed to add store' });
  }
});

/**
 * POST /api/basket/add-price
 * Admin endpoint to add/update product prices
 */
router.post('/add-price', async (req, res) => {
  try {
    const { supermarket_id, product_name, price, unit } = req.body;

    if (!supermarket_id || !product_name || price === undefined) {
      return res.status(400).json({ error: 'supermarket_id, product_name, and price are required' });
    }

    const result = await pool.query(
      `INSERT INTO prices (supermarket_id, product_name, price, unit, last_updated)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (supermarket_id, product_name)
       DO UPDATE SET price = $3, unit = $4, last_updated = NOW()
       RETURNING *`,
      [supermarket_id, product_name, price, unit || 'item']
    );

    res.json({
      message: 'Price updated successfully',
      price: result.rows[0]
    });
  } catch (err) {
    console.error('Error adding price:', err);
    res.status(500).json({ error: 'Failed to add price' });
  }
});

module.exports = router;
