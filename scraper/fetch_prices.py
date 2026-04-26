#!/usr/bin/env python3
"""
Grocer-E Price Scraper
Fetches and parses Israeli supermarket price XML files from government transparency feeds
Supports: Shufersal, Rami Levy, Victory
"""

import os
import sys
import logging
import requests
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
import psycopg2
from psycopg2.extras import execute_batch
import time
from typing import List, Dict, Tuple
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('scraper.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Database configuration
DB_HOST = os.getenv('DB_HOST', 'localhost')
DB_PORT = os.getenv('DB_PORT', '5432')
DB_NAME = os.getenv('DB_NAME', 'grocer_e')
DB_USER = os.getenv('DB_USER', 'grocer_user')
DB_PASSWORD = os.getenv('DB_PASSWORD', 'password')

# Supermarket XML feed URLs (Israeli government price transparency feeds)
FEED_URLS = {
    'Shufersal': 'https://www.shufersal.co.il/online/he/general/-/media/Project/Shufersal/Files/Prices/shufersal-prices.xml',
    'Rami Levy': 'https://rami-levy.co.il/uploads/tarbut_tviyat_mihurim/prices.xml',
    'Victory': 'https://www.victory.co.il/DigitalAssetsV3/Prices/PricesFull.xml'
}

# Request headers to appear as a browser
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
}

# Timeout for requests (in seconds)
REQUEST_TIMEOUT = 30


class GrocerScraper:
    """Scraper for Israeli supermarket prices"""

    def __init__(self):
        """Initialize database connection"""
        try:
            self.conn = psycopg2.connect(
                host=DB_HOST,
                port=DB_PORT,
                database=DB_NAME,
                user=DB_USER,
                password=DB_PASSWORD
            )
            self.cursor = self.conn.cursor()
            logger.info("Connected to PostgreSQL database successfully")
        except psycopg2.Error as e:
            logger.error(f"Failed to connect to database: {e}")
            sys.exit(1)

    def close(self):
        """Close database connection"""
        if self.cursor:
            self.cursor.close()
        if self.conn:
            self.conn.close()
            logger.info("Database connection closed")

    def fetch_xml_feed(self, chain_name: str, url: str) -> str:
        """
        Fetch XML feed from supermarket website
        
        Args:
            chain_name: Name of supermarket chain
            url: URL of the XML feed
            
        Returns:
            XML content as string or None if failed
        """
        try:
            logger.info(f"Fetching XML feed for {chain_name} from {url}")
            response = requests.get(url, headers=HEADERS, timeout=REQUEST_TIMEOUT)
            response.raise_for_status()
            logger.info(f"Successfully fetched XML for {chain_name} ({len(response.content)} bytes)")
            return response.text
        except requests.exceptions.RequestException as e:
            logger.error(f"Failed to fetch XML for {chain_name}: {e}")
            return None

    def parse_shufersal_xml(self, xml_content: str) -> List[Dict]:
        """
        Parse Shufersal XML feed format
        
        Args:
            xml_content: Raw XML content
            
        Returns:
            List of price records
        """
        prices = []
        try:
            root = ET.fromstring(xml_content)
            
            # Shufersal XML structure: Store > Item
            for store in root.findall('.//Store'):
                store_id = store.get('StoreId')
                store_name = store.get('StoreName', 'Unknown')
                latitude = store.get('Latitude')
                longitude = store.get('Longitude')
                
                for item in store.findall('.//Item'):
                    price_record = {
                        'chain_name': 'Shufersal',
                        'store_id': store_id,
                        'store_name': store_name,
                        'latitude': latitude,
                        'longitude': longitude,
                        'product_name': item.get('ItemName', '').strip(),
                        'price': float(item.get('Price', 0)),
                        'unit': item.get('Unit', 'item').strip(),
                        'barcode': item.get('ItemCode', '')
                    }
                    if price_record['product_name'] and price_record['price'] > 0:
                        prices.append(price_record)
                        
            logger.info(f"Parsed {len(prices)} items from Shufersal XML")
        except ET.ParseError as e:
            logger.error(f"Failed to parse Shufersal XML: {e}")
        except ValueError as e:
            logger.error(f"Failed to parse price values from Shufersal XML: {e}")
            
        return prices

    def parse_rami_levy_xml(self, xml_content: str) -> List[Dict]:
        """
        Parse Rami Levy XML feed format
        
        Args:
            xml_content: Raw XML content
            
        Returns:
            List of price records
        """
        prices = []
        try:
            root = ET.fromstring(xml_content)
            
            # Rami Levy XML structure: Branch > Price
            for branch in root.findall('.//Branch'):
                branch_id = branch.get('BranchID')
                branch_name = branch.get('BranchName', 'Unknown')
                latitude = branch.get('Latitude')
                longitude = branch.get('Longitude')
                
                for price_elem in branch.findall('.//Price'):
                    price_record = {
                        'chain_name': 'Rami Levy',
                        'store_id': branch_id,
                        'store_name': branch_name,
                        'latitude': latitude,
                        'longitude': longitude,
                        'product_name': price_elem.get('ProductName', '').strip(),
                        'price': float(price_elem.get('PriceValue', 0)),
                        'unit': price_elem.get('Unit', 'item').strip(),
                        'barcode': price_elem.get('ProductCode', '')
                    }
                    if price_record['product_name'] and price_record['price'] > 0:
                        prices.append(price_record)
                        
            logger.info(f"Parsed {len(prices)} items from Rami Levy XML")
        except ET.ParseError as e:
            logger.error(f"Failed to parse Rami Levy XML: {e}")
        except ValueError as e:
            logger.error(f"Failed to parse price values from Rami Levy XML: {e}")
            
        return prices

    def parse_victory_xml(self, xml_content: str) -> List[Dict]:
        """
        Parse Victory XML feed format
        
        Args:
            xml_content: Raw XML content
            
        Returns:
            List of price records
        """
        prices = []
        try:
            root = ET.fromstring(xml_content)
            
            # Victory XML structure: Branch > Prices
            for branch in root.findall('.//Branch'):
                branch_id = branch.get('BranchID')
                branch_name = branch.get('BranchName', 'Unknown')
                latitude = branch.get('Latitude')
                longitude = branch.get('Longitude')
                
                for price_elem in branch.findall('.//Prices'):
                    price_record = {
                        'chain_name': 'Victory',
                        'store_id': branch_id,
                        'store_name': branch_name,
                        'latitude': latitude,
                        'longitude': longitude,
                        'product_name': price_elem.get('ProductName', '').strip(),
                        'price': float(price_elem.get('Price', 0)),
                        'unit': price_elem.get('Unit', 'item').strip(),
                        'barcode': price_elem.get('ProductCode', '')
                    }
                    if price_record['product_name'] and price_record['price'] > 0:
                        prices.append(price_record)
                        
            logger.info(f"Parsed {len(prices)} items from Victory XML")
        except ET.ParseError as e:
            logger.error(f"Failed to parse Victory XML: {e}")
        except ValueError as e:
            logger.error(f"Failed to parse price values from Victory XML: {e}")
            
        return prices

    def parse_xml_feed(self, chain_name: str, xml_content: str) -> List[Dict]:
        """
        Route XML parsing to appropriate parser based on chain
        
        Args:
            chain_name: Name of supermarket chain
            xml_content: Raw XML content
            
        Returns:
            List of price records
        """
        if chain_name == 'Shufersal':
            return self.parse_shufersal_xml(xml_content)
        elif chain_name == 'Rami Levy':
            return self.parse_rami_levy_xml(xml_content)
        elif chain_name == 'Victory':
            return self.parse_victory_xml(xml_content)
        else:
            logger.warning(f"Unknown chain: {chain_name}")
            return []

    def upsert_supermarket(self, chain_name: str, store_id: str, store_name: str,
                          latitude: str, longitude: str) -> int:
        """
        Insert or get supermarket ID
        
        Args:
            chain_name: Chain name
            store_id: Store ID from feed
            store_name: Store name
            latitude: Latitude coordinate
            longitude: Longitude coordinate
            
        Returns:
            Database supermarket ID
        """
        try:
            if not latitude or not longitude:
                logger.warning(f"Missing coordinates for {store_name}, skipping")
                return None
                
            lat = float(latitude)
            lon = float(longitude)
            
            # Validate coordinates
            if lat < -90 or lat > 90 or lon < -180 or lon > 180:
                logger.warning(f"Invalid coordinates for {store_name}: ({lat}, {lon})")
                return None
            
            self.cursor.execute("""
                INSERT INTO supermarkets (name, chain_name, latitude, longitude, created_at, updated_at)
                VALUES (%s, %s, %s, %s, NOW(), NOW())
                ON CONFLICT (name, chain_name, latitude, longitude) DO UPDATE SET updated_at = NOW()
                RETURNING id
            """, (store_name, chain_name, lat, lon))
            
            supermarket_id = self.cursor.fetchone()[0]
            self.conn.commit()
            return supermarket_id
            
        except (ValueError, psycopg2.Error) as e:
            logger.error(f"Error upserting supermarket {store_name}: {e}")
            self.conn.rollback()
            return None

    def upsert_products(self, price_records: List[Dict]) -> Dict[str, int]:
        """
        Insert or get product IDs
        
        Args:
            price_records: List of price records
            
        Returns:
            Dictionary mapping product names to IDs
        """
        product_map = {}
        try:
            unique_products = {}
            
            # Get unique products
            for record in price_records:
                product_name = record['product_name']
                if product_name not in unique_products:
                    unique_products[product_name] = {
                        'category': None,
                        'barcode': record.get('barcode'),
                        'unit': record.get('unit', 'item')
                    }
            
            # Batch insert
            for product_name, data in unique_products.items():
                self.cursor.execute("""
                    INSERT INTO products (name, category, barcode, unit, created_at, updated_at)
                    VALUES (%s, %s, %s, %s, NOW(), NOW())
                    ON CONFLICT (name) DO UPDATE SET updated_at = NOW()
                    RETURNING id
                """, (product_name, data['category'], data['barcode'], data['unit']))
                
                product_id = self.cursor.fetchone()[0]
                product_map[product_name] = product_id
            
            self.conn.commit()
            logger.info(f"Upserted {len(product_map)} unique products")
            
        except psycopg2.Error as e:
            logger.error(f"Error upserting products: {e}")
            self.conn.rollback()
            
        return product_map

    def insert_prices(self, price_records: List[Dict], supermarket_id: int) -> int:
        """
        Insert price records into database
        
        Args:
            price_records: List of price records for a specific supermarket
            supermarket_id: Database supermarket ID
            
        Returns:
            Number of records inserted/updated
        """
        try:
            batch_data = []
            for record in price_records:
                batch_data.append((
                    supermarket_id,
                    record['product_name'],
                    record['price'],
                    record['unit']
                ))
            
            # Batch upsert prices
            execute_batch(self.cursor, """
                INSERT INTO prices (supermarket_id, product_name, price, unit, last_updated)
                VALUES (%s, %s, %s, %s, NOW())
                ON CONFLICT (supermarket_id, product_name) 
                DO UPDATE SET price = EXCLUDED.price, unit = EXCLUDED.unit, last_updated = NOW()
            """, batch_data, page_size=1000)
            
            self.conn.commit()
            logger.info(f"Inserted/updated {len(batch_data)} prices for supermarket ID {supermarket_id}")
            return len(batch_data)
            
        except psycopg2.Error as e:
            logger.error(f"Error inserting prices: {e}")
            self.conn.rollback()
            return 0

    def update_scraper_metadata(self, chain_name: str, status: str, 
                               records_updated: int = 0, error_message: str = None):
        """
        Update scraper metadata for tracking
        
        Args:
            chain_name: Chain name
            status: Status (success, failed, pending)
            records_updated: Number of records updated
            error_message: Error message if failed
        """
        try:
            next_scrape = datetime.now() + timedelta(hours=24)
            
            self.cursor.execute("""
                INSERT INTO scraper_metadata (chain_name, last_scraped, next_scheduled_scrape, 
                                             scrape_status, records_updated, error_message, 
                                             created_at, updated_at)
                VALUES (%s, NOW(), %s, %s, %s, %s, NOW(), NOW())
                ON CONFLICT (chain_name) 
                DO UPDATE SET 
                    last_scraped = NOW(),
                    next_scheduled_scrape = %s,
                    scrape_status = %s,
                    records_updated = %s,
                    error_message = %s,
                    updated_at = NOW()
            """, (chain_name, next_scrape, status, records_updated, error_message,
                  next_scrape, status, records_updated, error_message))
            
            self.conn.commit()
            logger.info(f"Updated scraper metadata for {chain_name}: {status}")
            
        except psycopg2.Error as e:
            logger.error(f"Error updating scraper metadata: {e}")
            self.conn.rollback()

    def scrape_chain(self, chain_name: str, url: str) -> Tuple[int, List[Dict]]:
        """
        Scrape a single supermarket chain
        
        Args:
            chain_name: Name of chain
            url: URL of XML feed
            
        Returns:
            Tuple of (total_records_inserted, price_records)
        """
        logger.info(f"\n=== Starting scrape for {chain_name} ===")
        total_records = 0
        
        try:
            # Fetch XML
            xml_content = self.fetch_xml_feed(chain_name, url)
            if not xml_content:
                self.update_scraper_metadata(chain_name, 'failed', 0, 'Failed to fetch XML')
                return 0, []
            
            # Parse XML
            price_records = self.parse_xml_feed(chain_name, xml_content)
            if not price_records:
                self.update_scraper_metadata(chain_name, 'failed', 0, 'Failed to parse XML')
                return 0, []
            
            # Group by store
            stores = {}
            for record in price_records:
                store_key = (record['store_id'], record['store_name'])
                if store_key not in stores:
                    stores[store_key] = []
                stores[store_key].append(record)
            
            logger.info(f"Found {len(stores)} stores for {chain_name}")
            
            # Process each store
            for (store_id, store_name), records in stores.items():
                supermarket_id = self.upsert_supermarket(
                    chain_name, store_id, store_name,
                    records[0].get('latitude'),
                    records[0].get('longitude')
                )
                
                if supermarket_id:
                    inserted = self.insert_prices(records, supermarket_id)
                    total_records += inserted
            
            self.update_scraper_metadata(chain_name, 'success', total_records)
            logger.info(f"Completed scraping {chain_name}: {total_records} records")
            
        except Exception as e:
            logger.error(f"Unexpected error scraping {chain_name}: {e}")
            self.update_scraper_metadata(chain_name, 'failed', 0, str(e))
        
        return total_records, price_records

    def scrape_all(self):
        """Scrape all supermarket chains"""
        logger.info(f"Starting full scrape at {datetime.now()}")
        
        total_all = 0
        for chain_name, url in FEED_URLS.items():
            records, _ = self.scrape_chain(chain_name, url)
            total_all += records
            time.sleep(2)  # Rate limiting between requests
        
        logger.info(f"\n=== SCRAPE COMPLETE ===")
        logger.info(f"Total records inserted/updated: {total_all}")
        logger.info(f"Completed at {datetime.now()}\n")


def main():
    """Main entry point"""
    scraper = GrocerScraper()
    try:
        scraper.scrape_all()
    finally:
        scraper.close()


if __name__ == '__main__':
    main()
