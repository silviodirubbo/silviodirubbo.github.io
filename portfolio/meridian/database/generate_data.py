"""
Meridiana Time Group - synthetic data generator
Builds meridian.db (SQLite) from scratch: 9 dimensions + 9 facts.
Fiscal year = calendar year (Jan-Dec). 3 years of history.
"""
import sqlite3
import os
import time

from schema import SCHEMA_SQL
from dims_geo import build_geography, build_currency, build_channel, build_function, build_market_terms
from dims_product import build_product_line
from dims_channel_entities import build_stores, build_wholesale_customers
from dims_date_fx import build_dim_date, build_fx_rates
from facts import generate_boutique_sales, generate_sell_in_and_out
from facts_planning import generate_budget, generate_inventory, generate_working_capital, generate_headcount

DB_PATH = "meridian.db"
YEARS = [2023, 2024, 2025]
MID_YEAR = 2024

def main():
    if os.path.exists(DB_PATH):
        os.remove(DB_PATH)
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys = OFF;")  # generation order not fully FK-safe until end

    t0 = time.time()
    print("Creating schema...")
    conn.executescript(SCHEMA_SQL)
    conn.commit()

    print("Building geography, currency, channel, function, market terms...")
    geo_map = build_geography(conn)  # (region,country) -> geo_id
    build_currency(conn)
    channel_map = build_channel(conn)
    build_function(conn)
    build_market_terms(conn, geo_map)

    print("Building product line (SKUs, price/cost escalation)...")
    sku_ids, sku_collection_map = build_product_line(conn, YEARS)

    cur = conn.cursor()
    cur.execute("SELECT geo_id, region, country, market_size FROM dim_geography")
    geo_rows = cur.fetchall()

    print("Building stores and wholesale customers...")
    stores = build_stores(conn, geo_rows, channel_map, YEARS[0], YEARS[-1])
    customers = build_wholesale_customers(conn, geo_rows, channel_map)

    print("Building date dimension...")
    date_ids = build_dim_date(conn, YEARS[0], YEARS[-1])
    print(f"  {len(date_ids)} days")

    print("Building FX rates (this can take a moment)...")
    build_fx_rates(conn, date_ids)

    print("Generating boutique sales (sparse daily)...")
    generate_boutique_sales(conn, date_ids, YEARS, MID_YEAR)

    print("Generating sell-in and sell-out...")
    generate_sell_in_and_out(conn, date_ids, YEARS, MID_YEAR)

    print("Generating budget (derived from prior-year actuals)...")
    generate_budget(conn, YEARS)

    print("Generating inventory...")
    generate_inventory(conn, YEARS)

    print("Generating working capital...")
    generate_working_capital(conn, YEARS)

    print("Generating headcount...")
    generate_headcount(conn, YEARS)

    conn.commit()
    conn.close()
    print(f"\nDone in {time.time()-t0:.1f}s. Database at {DB_PATH}")

if __name__ == "__main__":
    main()
