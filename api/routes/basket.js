const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Distance calculator
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) ** 2 +
            Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) *
            Math.sin(dLon/2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// Detect if user wants a pack or single unit
function isPackQuery(query) {
  const packKeywords = ['מארז', 'מארז', 'pack', '6x', '12x', '24x', 'תבנית', 'שישייה'];
  return packKeywords.some(kw => query.toLowerCase().includes(kw.toLowerCase()));
}

// Smart product matching - prefers single unit unless query asks for pack
async function findBestProduct(query) {
  const wantsPack = isPackQuery(query);
  
  const result = await pool.query(`
    SELECT id, name_hebrew, unit_size, is_generic
    FROM products 
    WHERE name_hebrew ILIKE $1
    ORDER BY 
      CASE 
        WHEN $2 = true THEN
          CASE 
            WHEN name_hebrew ILIKE '%מארז%' THEN 1
            WHEN unit_size ILIKE '%x%' THEN 2
            ELSE 3
          END
        ELSE
          CASE 
            WHEN name_hebrew ILIKE '%מארז%' THEN 4
            WHEN unit_size ILIKE '%x%' THEN 3
            WHEN unit_size IN ('1L', '500ml', '250ml', '100g', '200g', '250g', '500g', '1kg') THEN 1
            ELSE 2
          END
      END,
      LENGTH(name_hebrew) ASC
    LIMIT 1
  `, [`%${query}%`, wantsPack]);
  
  return result.rows[0] || null;
}

// GET all stores
router.get('/supermarkets', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM stores WHERE is_active = true');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stores' });
  }
});

// GET nearby stores
router.get('/nearby', async (req, res) => {
  try {
    const { lat, lng, radius = 30 } = req.query;
    const stores = await pool.query('SELECT * FROM stores WHERE is_active = true');
    const nearby = stores.rows
      .map(s => ({
        ...s,
        distance: calculateDistance(parseFloat(lat), parseFloat(lng), s.latitude, s.longitude)
      }))
      .filter(s => s.distance <= radius)
      .sort((a, b) => a.distance - b.distance);
    res.json(nearby);
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

// COMPARE basket - returns ONLY closest branch per chain
router.post('/compare', async (req, res) => {
  try {
    const { items, latitude, longitude, radius = 30 } = req.body;
    const userLat = parseFloat(latitude) || 32.0853;
    const userLon = parseFloat(longitude) || 34.7818;

    // Get all stores within radius
    const storesResult = await pool.query(
      'SELECT id, chain_name, branch_name, latitude, longitude FROM stores WHERE is_active = true'
    );

    const nearbyStores = storesResult.rows
      .map(store => ({
        ...store,
        distance: calculateDistance(userLat, userLon, store.latitude, store.longitude)
      }))
      .filter(store => store.distance <= radius)
      .sort((a, b) => a.distance - b.distance);

    // CRITICAL: Keep only CLOSEST branch per chain
    const seenChains = new Set();
    const closestBranches = nearbyStores.filter(store => {
      if (seenChains.has(store.chain_name)) return false;
      seenChains.add(store.chain_name);
      return true;
    });

    // Match each item to best product
    const matchedProducts = [];
    for (const item of items) {
      const product = await findBestProduct(item.name);
      if (product) matchedProducts.push({ ...product, query: item.name });
    }

    if (matchedProducts.length === 0) {
      return res.json({ message: 'לא נמצאו מוצרים', all_comparisons: [] });
    }

    const productIds = matchedProducts.map(p => p.id);
    const storeIds = closestBranches.map(s => s.id);

    // Get prices
    const pricesResult = await pool.query(`
      SELECT pr.store_id, pr.product_id, pr.price_ils, pd.name_hebrew, pd.unit_size
      FROM prices pr
      JOIN products pd ON pd.id = pr.product_id
      WHERE pr.store_id = ANY($1::int[])
      AND pr.product_id = ANY($2::int[])
    `, [storeIds, productIds]);

    // Build per-store totals
    const storeData = {};
    closestBranches.forEach(store => {
      storeData[store.id] = {
        ...store,
        distance_km: parseFloat(store.distance.toFixed(1)),
        total_price: 0,
        items: []
      };
    });

    pricesResult.rows.forEach(row => {
      if (storeData[row.store_id]) {
        const exists = storeData[row.store_id].items.find(i => i.product_id === row.product_id);
        if (!exists) {
          storeData[row.store_id].items.push({
            product_id: row.product_id,
            product_name: row.name_hebrew,
            unit_size: row.unit_size,
            price: parseFloat(row.price_ils)
          });
          storeData[row.store_id].total_price += parseFloat(row.price_ils);
        }
      }
    });

    const ranked = Object.values(storeData)
      .filter(s => s.items.length > 0)
      .map(s => ({ ...s, total_price: parseFloat(s.total_price.toFixed(2)) }))
      .sort((a, b) => a.total_price - b.total_price);

    if (ranked.length === 0) {
      return res.json({ message: 'אין מחירים', all_comparisons: [] });
    }

    const cheapest = ranked[0];
    const expensive = ranked[ranked.length - 1];
    const savings = parseFloat((expensive.total_price - cheapest.total_price).toFixed(2));

    res.json({
      potential_savings_nis: savings,
      cheapest_store: cheapest,
      all_comparisons: ranked
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Compare failed' });
  }
});

// Get shopping list
router.get('/list/:userId', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM shopping_lists WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1`,
      [req.params.userId || 'guest']
    );
    if (result.rows.length === 0) {
      return res.json({ items: [], name: 'הרשימה השבועית שלי' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

// Save shopping list
router.post('/list/:userId', async (req, res) => {
  try {
    const { items, name } = req.body;
    const userId = req.params.userId || 'guest';
    
    const existing = await pool.query(
      `SELECT id FROM shopping_lists WHERE user_id = $1`,
      [userId]
    );

    if (existing.rows.length > 0) {
      await pool.query(
        `UPDATE shopping_lists SET items = $1, updated_at = NOW() WHERE user_id = $2`,
        [JSON.stringify(items), userId]
      );
    } else {
      await pool.query(
        `INSERT INTO shopping_lists (user_id, items, name) VALUES ($1, $2, $3)`,
        [userId, JSON.stringify(items), name || 'הרשימה השבועית שלי']
      );
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

// SMART RECOMMENDATION
router.post('/recommend/:userId', async (req, res) => {
  try {
    const { latitude, longitude, radius = 30 } = req.body;
    const userLat = parseFloat(latitude) || 32.0853;
    const userLon = parseFloat(longitude) || 34.7818;

    const listResult = await pool.query(
      `SELECT items FROM shopping_lists WHERE user_id = $1`,
      [req.params.userId || 'guest']
    );

    if (listResult.rows.length === 0 || !listResult.rows[0].items.length) {
      return res.json({ message: 'הרשימה ריקה', recommendation: null });
    }

    const items = listResult.rows[0].items;

    const storesResult = await pool.query(
      'SELECT id, chain_name, branch_name, latitude, longitude FROM stores WHERE is_active = true'
    );

    // Filter by radius and pick closest branch per chain
    const nearbyStores = storesResult.rows
      .map(store => ({
        ...store,
        distance: calculateDistance(userLat, userLon, store.latitude, store.longitude)
      }))
      .filter(store => store.distance <= radius)
      .sort((a, b) => a.distance - b.distance);

    const seenChains = new Set();
    const closestBranches = nearbyStores.filter(store => {
      if (seenChains.has(store.chain_name)) return false;
      seenChains.add(store.chain_name);
      return true;
    });

    const storeIds = closestBranches.map(s => s.id);

    // Match products with smart logic
    const matchedProductIds = [];
    for (const item of items) {
      const product = await findBestProduct(item.name);
      if (product) matchedProductIds.push(product.id);
    }

    // Get prices
    const pricesResult = await pool.query(`
      SELECT pr.store_id, pd.name_hebrew, pr.price_ils, pd.id as product_id
      FROM prices pr
      JOIN products pd ON pd.id = pr.product_id
      WHERE pr.store_id = ANY($1::int[])
      AND pr.product_id = ANY($2::int[])
    `, [storeIds, matchedProductIds]);

    // Active discounts
    const discountsResult = await pool.query(`
      SELECT d.store_id, d.product_id, d.description_hebrew, d.discount_amount, d.discount_type
      FROM discounts d
      WHERE d.is_active = true 
      AND d.ends_at > NOW()
      AND d.store_id = ANY($1::int[])
    `, [storeIds]);

    const storeTotals = {};
    closestBranches.forEach(store => {
      storeTotals[store.id] = {
        ...store,
        base_total: 0,
        items_found: 0,
        applicable_discounts: [],
        items: [],
        distance_km: parseFloat(store.distance.toFixed(1))
      };
    });

    pricesResult.rows.forEach(row => {
      if (storeTotals[row.store_id]) {
        const seen = storeTotals[row.store_id].items.find(i => i.product_id === row.product_id);
        if (!seen) {
          storeTotals[row.store_id].items.push({
            product_id: row.product_id,
            name: row.name_hebrew,
            price: parseFloat(row.price_ils)
          });
          storeTotals[row.store_id].base_total += parseFloat(row.price_ils);
          storeTotals[row.store_id].items_found += 1;
        }
      }
    });

    const discountsByStore = {};
    discountsResult.rows.forEach(d => {
      if (!discountsByStore[d.store_id]) discountsByStore[d.store_id] = [];
      discountsByStore[d.store_id].push(d);
    });

    Object.values(storeTotals).forEach(store => {
      const storeDiscounts = discountsByStore[store.id] || [];
      const itemProductIds = store.items.map(i => i.product_id);
      
      const applicable = storeDiscounts.filter(d => itemProductIds.includes(d.product_id));
      // Dedupe discount descriptions
      const uniqueDiscounts = [];
      const seenDescriptions = new Set();
      applicable.forEach(d => {
        if (!seenDescriptions.has(d.description_hebrew)) {
          seenDescriptions.add(d.description_hebrew);
          uniqueDiscounts.push(d);
        }
      });
      
      const totalDiscount = applicable.reduce((sum, d) => sum + parseFloat(d.discount_amount), 0);
      
      store.applicable_discounts = uniqueDiscounts.map(d => ({
        description: d.description_hebrew,
        amount: parseFloat(d.discount_amount),
        type: d.discount_type
      }));
      store.total_discount = parseFloat(totalDiscount.toFixed(2));
      store.final_total = parseFloat((store.base_total - totalDiscount).toFixed(2));
      store.base_total = parseFloat(store.base_total.toFixed(2));
    });

    const ranked = Object.values(storeTotals)
      .filter(s => s.items_found > 0)
      .sort((a, b) => a.final_total - b.final_total);

    if (ranked.length === 0) {
      return res.json({ message: 'לא נמצאו תוצאות', recommendation: null });
    }

    const winner = ranked[0];
    const worst = ranked[ranked.length - 1];

    res.json({
      list_size: items.length,
      items_matched: matchedProductIds.length,
      best_store: winner,
      total_savings: parseFloat((worst.final_total - winner.final_total).toFixed(2)),
      all_stores: ranked
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed' });
  }
});

module.exports = router;
