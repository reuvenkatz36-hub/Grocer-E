import os
import requests
import psycopg
import gzip
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
import time
import logging

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(message)s')
log = logging.getLogger(__name__)

DATABASE_URL = os.environ.get('DATABASE_URL')

# Israeli government price transparency URLs
CHAIN_SOURCES = [
    {
        'chain_name': 'שופרסל',
        'promos_url': 'https://prices.shufersal.co.il/FileObject/UpdateCategory?catID=5&storeId=0',
        'type': 'shufersal'
    },
    {
        'chain_name': 'רמי לוי',
        'promos_url': 'https://url.publishedprices.co.il/file/d/RamiLevi/promo',
        'type': 'generic'
    },
    {
        'chain_name': 'ויקטורי',
        'promos_url': 'https://url.publishedprices.co.il/file/d/victory/promo',
        'type': 'generic'
    },
    {
        'chain_name': 'יוחננוף',
        'promos_url': 'https://url.publishedprices.co.il/file/d/yochananof/promo',
        'type': 'generic'
    },
    {
        'chain_name': 'מגה',
        'promos_url': 'https://url.publishedprices.co.il/file/d/mega/promo',
        'type': 'generic'
    },
    {
        'chain_name': 'יינות ביתן',
        'promos_url': 'https://url.publishedprices.co.il/file/d/mega/promo',
        'type': 'generic'
    },
]

def get_db():
    return psycopg.connect(DATABASE_URL)

def fetch_xml(url):
    """Download and parse XML, handling gzip compression"""
    headers = {'User-Agent': 'Mozilla/5.0 (compatible; GrocerE/1.0)'}
    try:
        res = requests.get(url, headers=headers, timeout=30)
        res.raise_for_status()
        
        # Try gzip first
        try:
            content = gzip.decompress(res.content)
        except Exception:
            content = res.content
            
        return ET.fromstring(content.decode('utf-8', errors='ignore'))
    except Exception as e:
        log.error(f"Failed to fetch {url}: {e}")
        return None

def fetch_shufersal_promos():
    """Shufersal has an index page listing promo files"""
    promos = []
    index_url = 'https://prices.shufersal.co.il/FileObject/UpdateCategory?catID=5&storeId=0'
    
    try:
        headers = {'User-Agent': 'Mozilla/5.0'}
        res = requests.get(index_url, headers=headers, timeout=30)
        root = ET.fromstring(res.content)
        
        # Get first promo file link
        for link in root.iter('link'):
            file_url = link.text
            if file_url and 'Promo' in file_url:
                log.info(f"Fetching Shufersal promo: {file_url}")
                file_root = fetch_xml(file_url)
                if file_root:
                    promos.extend(parse_promo_xml(file_root, 'שופרסל'))
                break  # Just get first file to avoid too many requests
    except Exception as e:
        log.error(f"Shufersal error: {e}")
    
    return promos

def parse_promo_xml(root, chain_name):
    """Parse standard Israeli promo XML format"""
    promos = []
    
    # Standard format used by most chains
    for promo in root.iter('Promotion'):
        try:
            promo_id = get_text(promo, 'PromotionId')
            description = get_text(promo, 'PromotionDescription')
            discount_type = get_text(promo, 'RewardType')
            start_date = get_text(promo, 'PromotionStartDate')
            end_date = get_text(promo, 'PromotionEndDate')
            discount_amount = get_text(promo, 'DiscountRate') or '0'
            
            # Get barcodes of items in this promo
            barcodes = []
            for item in promo.iter('Item'):
                barcode = get_text(item, 'ItemCode')
                if barcode:
                    barcodes.append(barcode)
            
            if description and barcodes:
                promos.append({
                    'chain_name': chain_name,
                    'description': description,
                    'discount_type': map_discount_type(discount_type),
                    'discount_amount': float(discount_amount) if discount_amount else 5.0,
                    'start_date': parse_date(start_date),
                    'end_date': parse_date(end_date),
                    'barcodes': barcodes[:20]  # Cap at 20 items per promo
                })
        except Exception as e:
            continue
    
    log.info(f"Parsed {len(promos)} promos for {chain_name}")
    return promos

def get_text(element, tag):
    """Safely get text from XML element"""
    child = element.find(tag)
    return child.text.strip() if child is not None and child.text else None

def map_discount_type(raw_type):
    """Map raw XML discount type to our system"""
    if not raw_type:
        return 'sale'
    raw = str(raw_type)
    if raw in ['1', '2']:
        return 'sale'
    if raw in ['3']:
        return '2+1'
    if raw in ['4']:
        return '1+1'
    return 'sale'

def parse_date(date_str):
    """Parse various date formats from Israeli XML"""
    if not date_str:
        return datetime.now() + timedelta(days=7)
    for fmt in ['%Y-%m-%d', '%Y%m%d', '%d/%m/%Y']:
        try:
            return datetime.strptime(date_str[:10], fmt)
        except:
            continue
    return datetime.now() + timedelta(days=7)

def fetch_generic_promos(chain_info):
    """Fetch from publishedprices.co.il index"""
    promos = []
    index_url = chain_info['promos_url']
    
    try:
        headers = {'User-Agent': 'Mozilla/5.0'}
        res = requests.get(index_url, headers=headers, timeout=30)
        root = ET.fromstring(res.content)
        
        # Find latest promo file
        files = []
        for f in root.iter('file'):
            name = get_text(f, 'name') or ''
            url = get_text(f, 'url') or get_text(f, 'link') or ''
            if 'Promo' in name or 'promo' in name.lower():
                files.append((name, url))
        
        if not files:
            log.warning(f"No promo files found for {chain_info['chain_name']}")
            return []
        
        # Sort by name (newest first) and take first
        files.sort(reverse=True)
        latest_url = files[0][1]
        
        log.info(f"Fetching {chain_info['chain_name']} promo: {latest_url}")
        file_root = fetch_xml(latest_url)
        if file_root:
            promos = parse_promo_xml(file_root, chain_info['chain_name'])
            
    except Exception as e:
        log.error(f"Error fetching {chain_info['chain_name']}: {e}")
    
    return promos

def save_promos_to_db(all_promos):
    """Save parsed promotions to Supabase"""
    conn = get_db()
    cur = conn.cursor()
    
    saved = 0
    skipped = 0
    
    # Clear old discounts first
    cur.execute("DELETE FROM discounts WHERE ends_at < NOW() OR is_active = false")
    log.info("Cleared expired discounts")
    
    for promo in all_promos:
        chain_name = promo['chain_name']
        
        # Get store IDs for this chain
        cur.execute(
            "SELECT id FROM stores WHERE chain_name = %s AND is_active = true",
            (chain_name,)
        )
        store_ids = [row[0] for row in cur.fetchall()]
        if not store_ids:
            continue
        
        # Match barcodes to product IDs
        for barcode in promo['barcodes']:
            cur.execute(
                "SELECT id FROM products WHERE barcode = %s LIMIT 1",
                (barcode,)
            )
            product = cur.fetchone()
            if not product:
                skipped += 1
                continue
            
            product_id = product[0]
            
            # Insert discount for each store of this chain
            for store_id in store_ids:
                try:
                    cur.execute("""
                        INSERT INTO discounts 
                        (store_id, product_id, discount_type, description_hebrew, 
                         discount_amount, starts_at, ends_at, is_active)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, true)
                        ON CONFLICT DO NOTHING
                    """, (
                        store_id,
                        product_id,
                        promo['discount_type'],
                        promo['description'][:200],
                        promo['discount_amount'],
                        promo['start_date'],
                        promo['end_date']
                    ))
                    saved += 1
                except Exception as e:
                    log.error(f"Insert error: {e}")
                    continue
    
    conn.commit()
    cur.close()
    conn.close()
    log.info(f"Saved {saved} discounts, skipped {skipped} unmatched barcodes")

def run_scraper():
    log.info("=== Grocer-E Discount Scraper Starting ===")
    
    all_promos = []
    
    for chain in CHAIN_SOURCES:
        log.info(f"Scraping {chain['chain_name']}...")
        try:
            if chain['type'] == 'shufersal':
                promos = fetch_shufersal_promos()
            else:
                promos = fetch_generic_promos(chain)
            all_promos.extend(promos)
            log.info(f"Got {len(promos)} promos from {chain['chain_name']}")
        except Exception as e:
            log.error(f"Failed {chain['chain_name']}: {e}")
        time.sleep(2)  # Be polite between requests
    
    log.info(f"Total promos scraped: {len(all_promos)}")
    
    if all_promos:
        save_promos_to_db(all_promos)
    else:
        log.warning("No promos scraped — keeping existing discounts")
    
    log.info("=== Scraper Complete ===")

if __name__ == '__main__':
    run_scraper()
