"""
Meridian Time Group - 2026 H1 actuals extension
Adds six new months of transactional actuals (Jan-Jun 2026) to the existing
meridian.db, for fact_boutique_sales and fact_sell_in only.

This does not regenerate the database from scratch. It reads the real
Jan-Jun 2025 transactions as a seasonality and market-mix template, then
clones each row forward exactly 365 days (2025 is not a leap year, so the
day-of-week and calendar position both shift cleanly), scaling units and
price by the same kind of growth and escalation logic already embedded in
the 2023-2025 data:

  - Per-SKU price and cost escalation is re-applied one more year, using
    each SKU's own realized 2024 to 2025 escalation ratio (already in
    fact_line_price_cost, averaging about +4.8% price and +5.0% cost).
  - Unit volume growth is applied on top of that, at a rate calibrated so
    that combined revenue growth lands close to the FY2026 Budget's own
    channel-level growth assumptions (Boutique +18.7%, Wholesale +6.8%
    annually, per the Master Budget Model's Income Statement).
  - A per-country random factor and per-row noise reproduce the same kind
    of non-systematic market variation already present in 2023-2025,
    rather than uniform growth everywhere.
  - APAC Boutique is the one deliberate exception: unit growth there runs
    mildly ahead of the Boutique baseline, ramping slightly from January
    to June, continuing the premium mix-shift story already present in
    the historical data rather than introducing an unrelated event.

2023-2025 data is never touched. This script only inserts new rows for
2026-01-01 through 2026-06-30, plus the dim_date and fact_fx_rate rows
those new transactions need to join against.
"""
import sqlite3
import random
import datetime
import math

DB_PATH = "meridian.db"
NEW_YEAR = 2026
NEW_MONTHS = range(1, 7)  # January through June

random.seed(100)  # deterministic, reproducible generation

# Growth targets are revenue growth. Unit growth is solved for below once
# the real per-SKU price/cost escalation is known, so combined
# (1 + price_escalation) * (1 + unit_growth) lands close to these targets.
WHOLESALE_REVENUE_GROWTH = 0.068   # matches Budget Model Income Statement, Wholesale FY2026 vs FY2025
BOUTIQUE_REVENUE_GROWTH = 0.187    # matches Budget Model Income Statement, Boutique FY2026 vs FY2025
APAC_BOUTIQUE_EXTRA_GROWTH = 0.045  # additional revenue growth on top of the Boutique baseline, APAC only

PER_COUNTRY_NOISE_SIGMA = 0.025    # non-systematic market variation, per country
PER_ROW_NOISE_SIGMA = 0.06         # transaction-level noise


def month_end(year, month):
    if month == 12:
        return datetime.date(year, 12, 31)
    return datetime.date(year, month + 1, 1) - datetime.timedelta(days=1)


def build_new_dates():
    """Returns a list of (date_id, date_obj) for 2026-01-01 through 2026-06-30."""
    dates = []
    d = datetime.date(NEW_YEAR, 1, 1)
    end = month_end(NEW_YEAR, 6)
    while d <= end:
        date_id = int(d.strftime("%Y%m%d"))
        dates.append((date_id, d))
        d += datetime.timedelta(days=1)
    return dates


def insert_dim_date(conn, dates):
    rows = []
    for date_id, d in dates:
        quarter = (d.month - 1) // 3 + 1
        rows.append((
            date_id, d.isoformat(), d.day, d.strftime("%A"),
            int(d.strftime("%W")) + 1, d.month, d.strftime("%B"),
            quarter, d.year, d.year, quarter, 1 if d.weekday() >= 5 else 0
        ))
    conn.executemany("""
        INSERT INTO dim_date (date_id, full_date, day, day_name, week, month,
            month_name, quarter, year, fiscal_year, fiscal_quarter, is_weekend)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    """, rows)
    return len(rows)


def insert_fx_rates(conn, dates):
    """Random-walk continuation of each currency's rate_to_chf series, using
    the same daily volatility observed in the real 2025 series."""
    cur = conn.cursor()
    cur.execute("SELECT currency_code FROM dim_currency ORDER BY currency_code")
    currencies = [r[0] for r in cur.fetchall()]

    rows = []
    for ccy in currencies:
        cur.execute("""
            SELECT f.rate_to_chf FROM fact_fx_rate f JOIN dim_date d ON f.date_id = d.date_id
            WHERE f.currency_code = ? AND d.year = 2025 ORDER BY d.date_id
        """, (ccy,))
        rates_2025 = [r[0] for r in cur.fetchall()]
        daily_returns = [(rates_2025[i] / rates_2025[i - 1] - 1) for i in range(1, len(rates_2025))]
        sigma = (sum((r - sum(daily_returns) / len(daily_returns)) ** 2 for r in daily_returns) / len(daily_returns)) ** 0.5

        rate = rates_2025[-1]
        for date_id, _d in dates:
            rate = rate * (1 + random.gauss(0, sigma))
            rows.append((date_id, ccy, round(rate, 6)))

    conn.executemany("""
        INSERT INTO fact_fx_rate (date_id, currency_code, rate_to_chf) VALUES (?,?,?)
    """, rows)
    return len(rows), {ccy: None for ccy in currencies}


def get_fx_lookup(conn):
    cur = conn.cursor()
    cur.execute("SELECT date_id, currency_code, rate_to_chf FROM fact_fx_rate WHERE date_id >= 20260101 AND date_id <= 20260630")
    lookup = {}
    for date_id, ccy, rate in cur.fetchall():
        lookup[(date_id, ccy)] = rate
    return lookup


def get_sku_escalation(conn):
    """Per-SKU price and cost escalation ratio, realized 2024 to 2025,
    reused as the 2025 to 2026 escalation applied here."""
    cur = conn.cursor()
    cur.execute("""
        SELECT a.sku_id, b.list_price_chf / a.list_price_chf, b.standard_cost_chf / a.standard_cost_chf
        FROM fact_line_price_cost a JOIN fact_line_price_cost b ON a.sku_id = b.sku_id
        WHERE a.year = 2024 AND b.year = 2025
    """)
    return {sku: (price_ratio, cost_ratio) for sku, price_ratio, cost_ratio in cur.fetchall()}


def get_region_lookups(conn):
    cur = conn.cursor()
    cur.execute("SELECT geo_id, region FROM dim_geography")
    geo_region = dict(cur.fetchall())
    cur.execute("SELECT store_id, geo_id FROM dim_store")
    store_geo = dict(cur.fetchall())
    cur.execute("SELECT customer_id, geo_id FROM dim_wholesale_customer")
    customer_geo = dict(cur.fetchall())
    return geo_region, store_geo, customer_geo


def country_factors(geo_ids):
    """One random, non-systematic factor per country, held constant across
    all six months for that country (a market runs a bit hot or cold all
    year, it does not reshuffle every day)."""
    return {geo_id: random.gauss(0, PER_COUNTRY_NOISE_SIGMA) for geo_id in geo_ids}


def month_progress(month):
    """0.0 for January, 1.0 for June. Used to ramp the APAC Boutique
    acceleration gradually rather than apply it as a flat step change."""
    return (month - 1) / 5.0


def stochastic_round(x):
    """Rounds x to an integer, up or down, with probability proportional to
    the fractional part, so the expected value across many rows equals x
    exactly. A plain round() would do here since almost every row starts at
    1 or 2 units: a 13% growth factor on a base of 1 unit always rounds
    back down to 1, and the intended growth never shows up in the
    aggregate. Stochastic rounding is what keeps small per-row quantities
    from silently absorbing the growth."""
    floor_x = math.floor(x)
    if random.random() < (x - floor_x):
        return floor_x + 1
    return floor_x


def clone_fact_boutique_sales(conn, dates_by_original, sku_escalation, geo_region, store_geo, fx_lookup, geo_ids):
    cur = conn.cursor()
    cur.execute("""
        SELECT b.date_id, b.store_id, b.sku_id, b.units, b.gross_revenue_lc, b.discount_lc,
               b.net_revenue_lc, b.actual_unit_cost_chf, b.currency_code
        FROM fact_boutique_sales b JOIN dim_date d ON b.date_id = d.date_id
        WHERE d.year = 2025 AND d.month <= 6
    """)
    source_rows = cur.fetchall()

    country_noise = country_factors(geo_ids)
    new_rows = []
    for (date_id, store_id, sku_id, units, gross_lc, discount_lc, net_lc,
         unit_cost_chf, currency_code) in source_rows:
        new_date_id, new_month = dates_by_original[date_id]
        price_ratio, cost_ratio = sku_escalation.get(sku_id, (1.048, 1.05))
        geo_id = store_geo[store_id]
        region = geo_region[geo_id]

        unit_growth = _solve_unit_growth(BOUTIQUE_REVENUE_GROWTH, price_ratio)
        if region == "APAC":
            # Ramps from 0.5x to 1.5x the target across Jan-Jun, averaging
            # out to the target over the six months, a gradual acceleration
            # rather than a flat step change from month one.
            apac_extra = APAC_BOUTIQUE_EXTRA_GROWTH * (0.5 + month_progress(new_month))
            unit_growth += apac_extra

        factor = (1 + unit_growth) * (1 + country_noise[geo_id]) * (1 + random.gauss(0, PER_ROW_NOISE_SIGMA))
        new_units = max(1, stochastic_round(units * factor))

        unit_price_lc = gross_lc / units
        new_unit_price_lc = unit_price_lc * price_ratio
        new_gross_lc = round(new_unit_price_lc * new_units, 2)
        discount_rate = (discount_lc / gross_lc) if gross_lc else 0.0
        new_discount_lc = round(new_gross_lc * discount_rate, 2)
        new_net_lc = round(new_gross_lc - new_discount_lc, 2)
        new_unit_cost_chf = round(unit_cost_chf * cost_ratio, 2)
        rate = fx_lookup[(new_date_id, currency_code)]
        new_net_chf = round(new_net_lc * rate, 2)

        new_rows.append((new_date_id, store_id, sku_id, new_units, new_gross_lc,
                          new_discount_lc, new_net_lc, new_unit_cost_chf, currency_code, new_net_chf))

    conn.executemany("""
        INSERT INTO fact_boutique_sales (date_id, store_id, sku_id, units, gross_revenue_lc,
            discount_lc, net_revenue_lc, actual_unit_cost_chf, currency_code, net_revenue_chf)
        VALUES (?,?,?,?,?,?,?,?,?,?)
    """, new_rows)
    return len(new_rows)


def clone_fact_sell_in(conn, dates_by_original, sku_escalation, geo_region, customer_geo, fx_lookup, geo_ids):
    cur = conn.cursor()
    cur.execute("""
        SELECT s.date_id, s.customer_id, s.sku_id, s.units, s.gross_revenue_lc, s.discount_lc,
               s.net_revenue_lc, s.actual_unit_cost_chf, s.currency_code
        FROM fact_sell_in s JOIN dim_date d ON s.date_id = d.date_id
        WHERE d.year = 2025 AND d.month <= 6
    """)
    source_rows = cur.fetchall()

    country_noise = country_factors(geo_ids)
    new_rows = []
    for (date_id, customer_id, sku_id, units, gross_lc, discount_lc, net_lc,
         unit_cost_chf, currency_code) in source_rows:
        new_date_id, _new_month = dates_by_original[date_id]
        price_ratio, cost_ratio = sku_escalation.get(sku_id, (1.048, 1.05))
        geo_id = customer_geo[customer_id]
        # Wholesale carries the normal baseline everywhere, APAC included.
        # The deliberate overachievement in this pass is Boutique only.
        unit_growth = _solve_unit_growth(WHOLESALE_REVENUE_GROWTH, price_ratio)

        factor = (1 + unit_growth) * (1 + country_noise[geo_id]) * (1 + random.gauss(0, PER_ROW_NOISE_SIGMA))
        new_units = max(1, stochastic_round(units * factor))

        unit_price_lc = gross_lc / units
        new_unit_price_lc = unit_price_lc * price_ratio
        new_gross_lc = round(new_unit_price_lc * new_units, 2)
        discount_rate = (discount_lc / gross_lc) if gross_lc else 0.0
        new_discount_lc = round(new_gross_lc * discount_rate, 2)
        new_net_lc = round(new_gross_lc - new_discount_lc, 2)
        new_unit_cost_chf = round(unit_cost_chf * cost_ratio, 2)
        rate = fx_lookup[(new_date_id, currency_code)]
        new_net_chf = round(new_net_lc * rate, 2)

        new_rows.append((new_date_id, customer_id, sku_id, new_units, new_gross_lc,
                          new_discount_lc, new_net_lc, new_unit_cost_chf, currency_code, new_net_chf))

    conn.executemany("""
        INSERT INTO fact_sell_in (date_id, customer_id, sku_id, units, gross_revenue_lc,
            discount_lc, net_revenue_lc, actual_unit_cost_chf, currency_code, net_revenue_chf)
        VALUES (?,?,?,?,?,?,?,?,?,?)
    """, new_rows)
    return len(new_rows)


def _solve_unit_growth(target_revenue_growth, price_ratio):
    """Given a target revenue growth rate and the price escalation already
    happening, solve for the unit growth rate that makes
    (1 + price_growth) * (1 + unit_growth) = 1 + target_revenue_growth."""
    price_growth = price_ratio - 1
    return (1 + target_revenue_growth) / (1 + price_growth) - 1


def main():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys = OFF;")

    print("Building 2026 H1 date range...")
    dates = build_new_dates()
    dates_by_original = {}
    d2025 = datetime.date(2025, 1, 1)
    for date_id, d in dates:
        original = d.replace(year=2025)
        original_id = int(original.strftime("%Y%m%d"))
        dates_by_original[original_id] = (date_id, d.month)
    n_dates = insert_dim_date(conn, dates)
    print(f"  {n_dates} dim_date rows added")

    print("Extending FX rates through June 2026...")
    n_fx, _ = insert_fx_rates(conn, dates)
    print(f"  {n_fx} fact_fx_rate rows added")
    conn.commit()

    fx_lookup = get_fx_lookup(conn)
    sku_escalation = get_sku_escalation(conn)
    geo_region, store_geo, customer_geo = get_region_lookups(conn)
    geo_ids = list(geo_region.keys())

    print("Cloning fact_boutique_sales forward from Jan-Jun 2025...")
    n_boutique = clone_fact_boutique_sales(conn, dates_by_original, sku_escalation, geo_region, store_geo, fx_lookup, geo_ids)
    print(f"  {n_boutique} fact_boutique_sales rows added")

    print("Cloning fact_sell_in forward from Jan-Jun 2025...")
    n_sell_in = clone_fact_sell_in(conn, dates_by_original, sku_escalation, geo_region, customer_geo, fx_lookup, geo_ids)
    print(f"  {n_sell_in} fact_sell_in rows added")

    conn.commit()
    conn.close()
    print("\nDone.")


if __name__ == "__main__":
    main()
