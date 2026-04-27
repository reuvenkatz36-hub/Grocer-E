import schedule
import time
import logging
from scrape_discounts import run_scraper

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)

# Run every Sunday at midnight Israel time
schedule.every().sunday.at("00:00").do(run_scraper)

# Also run once on startup so we get fresh data immediately
log.info("Running initial scrape on startup...")
run_scraper()

log.info("Scheduler running — next scrape Sunday midnight")
while True:
    schedule.run_pending()
    time.sleep(60)
