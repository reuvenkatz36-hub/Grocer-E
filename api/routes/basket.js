const express = require('express');
const { Pool } = require('pg');
const router = express.Router();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

router.get('/supermarkets', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, chain_name, branch_name, latitude, longitude FROM stores WHERE is_active = true ORDER BY chain_name'
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch supermarkets' });
  }
});

router.get('/nearby', async (req, res) => {
  try {
    const { latitude, longitude, radius = 10 } = req.query;
    const userLat = parseFloat(latitude);
    const userLon = parseFloat(longitude);
    const searchRadius = parseFloat(radius);

    const result = await pool.query(
      'SELECT id, chain_name, branch_name, latitude, longitude FROM stores WHERE is_active = true'
    );

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
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch nearby stores' });
  }
});

router.post('/compare', async (req, res) => {
  try {
    const { items, latitude, longitude, radius = 15 } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Items array is required' });
    }

    const userLat = parseFloat(latitude) || 32.0853;
    const userLon = parseFloat(longitude) || 34.7818;
    const searchRadius = parseFloat(radius);

    const storesResult = await pool.query(
      'SELECT id, chain_name, branch_name, latitude, longitude FROM stores WHERE is_active = true'
    );

    const nearbyStores = storesResult.rows
      .map(store => ({
        ...store,
        distance: calculateDistance(userLat, userLon, store.latitude, store.longitude)
      }))
      .filter(store => store.distance <= searchRadius)
      .sort((a, b) => a.distance - b.distance);

    if (nearbyStores.length === 0) {
      return res.status(404).json({ error: 'No stores found nearby' });
    }

    const storeIds = nearbyStores.map(s => s.id);
    const searchNames = items.map(i => i.name);

    // For each search term, prefer PACK products over single units
    const matchedProductIds = [];
    for (const searchName of searchNames) {
      const userWantsSpecificSize = /\d/.test(searchName) || 
        searchName.includes('יחידה') || 
        searchName.includes('בודד');
      
      let match;
      if (userWantsSpecificSize) {
        // User specified a size, match exactly
        match = await pool.query(`
          SELECT id FROM products 
          WHERE name_hebrew ILIKE $1 OR name_english ILIKE $1
          ORDER BY LENGTH(name_hebrew) ASC
          LIMIT 1
        `, [`%${searchName}%`]);
      } else {
        // Generic search - prefer PACK varieties (most common purchase)
        match = await pool.query(`
          SELECT id FROM products 
          WHERE name_hebrew ILIKE $1 OR name_english ILIKE $1
          ORDER BY 
            CASE 
              WHEN name_hebrew ILIKE '%מארז%' THEN 1
              WHEN unit_size ILIKE '%x%' THEN 2
              WHEN name_hebrew ILIKE '%יחידות%' THEN 3
              ELSE 4
            END,
            LENGTH(name_hebrew) ASC
          LIMIT 1
        `, [`%${searchName}%`]);
      }
      if (match.rows.length > 0) matchedProductIds.push(match.rows[0].id);
    }

    if (matchedProductIds.length === 0) {
      return res.json({
        stores_compared: 0,
        items_searched: items.length,
        potential_savings_nis: 0,
        all_comparisons: []
      });
    }

    const pricesResult = await pool.query(`
      SELECT 
        pr.store_id,
        pd.name_hebrew AS product_name,
        pd.unit_size,
        pd.brand,
        pr.price_ils AS price
      FROM prices pr
      JOIN products pd ON pd.id = pr.product_id
      WHERE pr.store_id = ANY($1::int[])
      AND pr.product_id = ANY($2::int[])
      ORDER BY pr.recorded_at DESC
    `, [storeIds, matchedProductIds]);

    const pricesByStore = {};
    nearbyStores.forEach(store => {
      pricesByStore[store.id] = {
        ...store,
        items: [],
        total_price: 0,
        items_found: 0
      };
    });

    pricesResult.rows.forEach(row => {
      if (pricesByStore[row.store_id]) {
        const alreadyAdded = pricesByStore[row.store_id].items
          .find(i => i.product_name === row.product_name);
        if (!alreadyAdded) {
          pricesByStore[row.store_id].items.push({
            product_name: row.product_name,
            unit_size: row.unit_size,
            brand: row.brand,
            price: parseFloat(row.price)
          });
          pricesByStore[row.store_id].total_price += parseFloat(row.price);
          pricesByStore[row.store_id].items_found += 1;
        }
      }
    });

    const comparisons = Object.values(pricesByStore)
      .filter(s => s.items_found > 0)
      .map(store => ({
        ...store,
        total_price: parseFloat(store.total_price.toFixed(2)),
        distance_km: parseFloat(store.distance.toFixed(1))
      }))
      .sort((a, b) => a.total_price - b.total_price);

    if (comparisons.length === 0) {
      return res.json({
        stores_compared: 0,
        items_searched: items.length,
        potential_savings_nis: 0,
        all_comparisons: []
      });
    }

    const cheapest = comparisons[0];
    const priciest = comparisons[comparisons.length - 1];

    res.json({
      stores_compared: comparisons.length,
      items_searched: items.length,
      cheapest_store: cheapest,
      most_expensive_store: priciest,
      potential_savings_nis: parseFloat((priciest.total_price - cheapest.total_price).toFixed(2)),
      all_comparisons: comparisons
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to compare prices' });
  }
});

module.exports = router;
