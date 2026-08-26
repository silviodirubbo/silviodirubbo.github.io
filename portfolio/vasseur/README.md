# Maison Vasseur — Wholesale & Franchise Database (2024–2025)

**Maison Vasseur** is a fictitious luxury footwear house built for this portfolio: a
footwear-led maison with a small leather goods line, selling through wholesale and
franchise partners across EMEA. This project is the **raw source database** behind
the case study — a clean, relational dataset built in Excel and structured so it can
be imported and modeled with Power Query. It intentionally stops at the data layer:
no pivot tables, formulas, or dashboards are included here. The analysis layer
(sell-through reporting, purchasing trend analysis, customer performance review) is
meant to be built on top of this by hand, separately, as a Power Query / Power BI
capability.

## File

`Vasseur_Wholesale_Database_2024_2025.xlsx` — four flat sheets, no merged cells, no
formulas, bold/frozen header rows only.

## Business scale (sanity check)

The dataset targets ~CHF 200M/year in total EMEA wholesale/franchise **sell-in**
value, emerging from the sum of 12 accounts × 16 products × 24 months rather than
being hardcoded. As generated:

| Metric | Value |
|---|---|
| Total sell-in, 2024 | CHF 196,350,940 |
| Total sell-in, 2025 | CHF 204,070,580 |
| Total sell-in, 2024–2025 | CHF 400,421,520 |
| **Average per year** | **CHF 200,210,760** |
| Women's Footwear share of sell-in | 49.1% |
| Men's Footwear share of sell-in | 38.1% |
| Leather Goods share of sell-in | 12.9% |
| Footwear share (combined) | 87.2% |

Category mix lands inside the brief's target bands (footwear ~85–90%, leather goods
~10–15%), and 2025 grows modestly over 2024 (+3.9%) in the aggregate, while
individual accounts vary — see "Account variance" below.

## Structure

### `Accounts` (12 rows)
`Account ID` · `Account Name` · `Region` · `Country` · `Account Type`

Two fictitious wholesale/franchise accounts per region, across 6 EMEA regions (UK
and Ireland, Nordics and Baltics, DACH, France and Benelux, Iberia, Southern
Europe). Each region is represented by one country for both of its accounts. Account
types are mixed — 6 Wholesale, 6 Franchise, one of each per region.

### `Products` (16 rows)
`Product ID` · `Product Name` · `Category` · `Season` · `Wholesale Price (CHF)` ·
`Retail Price (CHF)`

Three categories: Women's Footwear (6 refs), Men's Footwear (5 refs), Leather Goods
(5 refs) — footwear intentionally outweighs leather goods in both SKU count and
volume. `Season` marks the collection each SKU launched under (`SS24`, `FW24`,
`SS25`, `FW25`); core SS24/FW24 styles are live for the full 24-month window, while
SS25/FW25 styles are newer launches that only carry transaction history from their
launch month onward — a deliberate source of realistic, non-uniform history length
across products.

### `Transactions_Monthly` (2,478 rows)
`Account ID` · `Product ID` · `Month (YYYY-MM)` · `Sell-In Units` ·
`Sell-In Value (CHF)` · `Sell-Out Units` · `Sell-Out Value (CHF)` ·
`Stock Units` · `Returns Units`

One row per active Account × Product × Month. Not every account carries every
product — assortment depth ranges from 8 to 15 of the 16 SKUs per account, weighted
toward footwear. Sell-in is deliberately lumpy (2–4 delivery/pre-book windows per
account-product-year concentrated in realistic shipment months) rather than a flat
monthly drip, which is how wholesale ordering actually behaves.

### `Transactions_Weekly` (11,627 rows)
`Account ID` · `Product ID` · `Week (ISO YYYY-Www)` · `Sell-Out Units` ·
`Sell-Out Value (CHF)`

Weekly sell-out only, simulating the weekly sell-through tracking used for business
reviews. Each month's sell-out is split across its ISO weeks with randomized
weekly weights, so weekly sums reconcile exactly to the monthly `Sell-Out` totals in
`Transactions_Monthly`.

## Methodology notes

- **Seasonality**: sell-in peaks in pre-book/delivery windows (Feb–Apr, Aug–Oct);
  sell-out peaks around key retail periods (Jun–Jul summer sale, Nov–Dec holiday).
- **Stock consistency**: each account-product is simulated month by month —
  `stock_end = stock_start + sell-in − sell-out − returns`, with sell-out and
  returns capped at available stock, plus randomized noise so the data isn't
  perfectly linear.
- **Account variance**: performance profiles are assigned per account, including a
  standout improver (Belgrave Maison, +18% sell-in / +38% sell-out YoY), decliners
  (Stureplan Atelier, Atelier del Sud), and two accounts with explicit risk signals —
  **Konigsallee Boutique** and **Boutique Almendra** — where sell-in is roughly
  maintained or only mildly down while sell-out flattens/declines, stock more than
  doubles YoY, and return rates run 11–13% vs. ~2.5–4% for the rest of the book.

## Intended use

Import into Power Query (`Get Data → Excel Workbook`, pick up all four sheets) and
build the analysis layer separately — sell-through %, purchasing trend, customer
scorecards, and business review views are intentionally left for the next stage of
this project, on top of this source data.

`generate_database.py` is the Python script used to synthesize the dataset
(seeded, deterministic) — included for transparency and reproducibility.
