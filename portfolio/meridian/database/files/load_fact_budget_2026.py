"""
Meridian Time Group - fact_budget 2026 load
Appends the real FY2026 Budget (13,440 rows) to the existing fact_budget
table in meridian.db, from the same CSV export used to load SQL Server's
fact_budget table (fact_budget_2026-07-20.csv, exported from the Master
Budget Model's Budget Export tab).

meridian.db already carries a fact_budget table with 2024 and 2025 rows,
from an earlier, separate generation pass. This script does not touch
those rows. It only appends the 2026 rows on top, so the table ends up
complete across 2024, 2025, and 2026, matching what the CSV holds plus
what was already there.

Source: portfolio/meridian/budget/fact_budget_2026-07-20.csv
"""
import sqlite3
import csv

DB_PATH = "meridian.db"
CSV_PATH = "../../budget/fact_budget_2026-07-20.csv"


def load_rows(csv_path):
    rows = []
    with open(csv_path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append((
                int(row["year"]),
                int(row["month"]),
                int(row["channel_id"]),
                row["collection"],
                int(row["geo_id"]),
                float(row["budgeted_units"]),
                float(row["budgeted_price_chf"]),
                float(row["budgeted_unit_cost_chf"]),
                float(row["budgeted_revenue_chf"]),
                1 if row["new_store_uplift_flag"].strip().upper() == "TRUE" else 0,
            ))
    return rows


def main():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    cur.execute("SELECT COUNT(*) FROM fact_budget WHERE year = 2026")
    if cur.fetchone()[0] > 0:
        print("fact_budget already has 2026 rows, nothing to do.")
        conn.close()
        return

    print("Reading CSV...")
    rows = load_rows(CSV_PATH)
    print(f"  {len(rows)} rows read")

    cur.executemany("""
        INSERT INTO fact_budget (year, month, channel_id, collection, geo_id,
            budgeted_units, budgeted_price_chf, budgeted_unit_cost_chf,
            budgeted_revenue_chf, new_store_uplift_flag)
        VALUES (?,?,?,?,?,?,?,?,?,?)
    """, rows)
    conn.commit()

    cur.execute("SELECT COUNT(*) FROM fact_budget WHERE year = 2026")
    print(f"  {cur.fetchone()[0]} 2026 rows now in fact_budget")

    conn.close()
    print("Done.")


if __name__ == "__main__":
    main()
