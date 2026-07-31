/* Interactive Power BI-style mockup for the Sell-Out Reporting Pack.
   Renders from the static dataset in mockup-data.js — no live connection.
   Two instances (Wholesale / DTC) share the same engine via buildConfig(). */
(function () {
  const D = window.MERIDIAN_SELLOUT_DATA;
  if (!D) return;
  const REGIONS = D.regions, CHANNELS = D.channels, COLLECTIONS = D.collections, MONTHS = D.months;

  function sumArr(a) { return a.reduce((x, y) => x + y, 0); }
  function fmtMoney(v) {
    const sign = v < 0 ? '-' : '';
    const abs = Math.abs(v);
    if (abs >= 1e6) return sign + (abs / 1e6).toFixed(1) + 'M';
    if (abs >= 1e3) return sign + (abs / 1e3).toFixed(0) + 'K';
    return sign + Math.round(abs);
  }
  function fmtPrice(v) { return (v / 1000).toFixed(1) + 'K'; }
  function fmtUnits(v) {
    if (Math.abs(v) >= 1000) return (v / 1000).toFixed(1) + 'K';
    return String(Math.round(v));
  }
  function fmtPct(v, decimals) {
    if (v === null || v === undefined || isNaN(v)) return '—';
    const d = decimals == null ? 1 : decimals;
    return (v >= 0 ? '▲ ' : '▼ ') + Math.abs(v).toFixed(d) + '%';
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  function buildConfig(key) {
    const isWholesale = key === 'wholesale';
    return {
      key,
      grain: isWholesale ? D.wholesaleGrain : D.dtcGrain,
      entities: isWholesale ? D.wholesalePartners : D.dtcStores,
      lookups: isWholesale ? D.wholesaleLookups : D.dtcLookups,
      kpi: isWholesale ? D.wholesaleKPI : D.dtcKPI,
      entityLabel: isWholesale ? 'Partner' : 'Store',
      entityLabelPlural: isWholesale ? 'Partners' : 'Stores',
      regionTitle: 'Region',
      collectionTitle: 'Collection',
      channelTitle: 'Retail / Online'
    };
  }

  function newState() { return { month: null, entity: null, region: null, channel: null, collection: null }; }

  function displayRegions(cfg, state) {
    if (state.entity) return [cfg.entities[state.entity].region];
    return state.region ? [state.region] : REGIONS.slice();
  }
  function displayChannels(cfg, state) {
    if (state.entity) return [cfg.entities[state.entity].channel];
    return state.channel ? [state.channel] : CHANNELS.slice();
  }
  function displayCollections(state) {
    return state.collection ? [state.collection] : COLLECTIONS.slice();
  }

  function grainTotal(cfg, regions, channels, collections, year, monthIdx) {
    let rev = 0, units = 0;
    regions.forEach(r => channels.forEach(c => collections.forEach(col => {
      const cell = cfg.grain[r][c][col][year];
      if (monthIdx == null) { rev += sumArr(cell.rev); units += sumArr(cell.units); }
      else { rev += cell.rev[monthIdx]; units += cell.units[monthIdx]; }
    })));
    return { rev, units };
  }
  function grainMonthly(cfg, regions, channels, collections, year) {
    const arr = new Array(12).fill(0);
    regions.forEach(r => channels.forEach(c => collections.forEach(col => {
      const cell = cfg.grain[r][c][col][year];
      for (let i = 0; i < 12; i++) arr[i] += cell.rev[i];
    })));
    return arr;
  }

  function entityCollectionValue(e, collection, year, monthIdx) {
    const annual2025 = sumArr(e.monthlyRev2025) || 1;
    const share = (e.collRev2025[collection] || 0) / annual2025;
    const arr = year === '2025' ? e.monthlyRev2025 : e.monthlyRev2024;
    const yearTotal = monthIdx == null ? sumArr(arr) : arr[monthIdx];
    return share * yearTotal;
  }

  function filteredTotal(cfg, state, year) {
    const monthIdx = state.month == null ? null : state.month - 1;
    if (state.entity) {
      const e = cfg.entities[state.entity];
      const revArr = year === '2025' ? e.monthlyRev2025 : e.monthlyRev2024;
      const rev = monthIdx == null ? sumArr(revArr) : revArr[monthIdx];
      const annualRev = sumArr(revArr);
      const totalUnits = year === '2025' ? e.units2025 : e.units2024;
      const units = annualRev ? totalUnits * (rev / annualRev) : 0;
      return { rev, units };
    }
    return grainTotal(cfg, displayRegions(cfg, state), displayChannels(cfg, state), displayCollections(state), year, monthIdx);
  }

  function contextBarValue(cfg, state, region, channel, year, monthIdx) {
    if (state.entity) {
      const e = cfg.entities[state.entity];
      if (region != null && e.region !== region) return 0;
      if (channel != null && e.channel !== channel) return 0;
      const arr = year === '2025' ? e.monthlyRev2025 : e.monthlyRev2024;
      return monthIdx == null ? sumArr(arr) : arr[monthIdx];
    }
    const regions = region != null ? [region] : displayRegions(cfg, state);
    const channels = channel != null ? [channel] : displayChannels(cfg, state);
    return grainTotal(cfg, regions, channels, COLLECTIONS, year, monthIdx).rev;
  }
  function highlightBarValue(cfg, state, region, channel, year, monthIdx) {
    if (!state.collection || state.entity) return null;
    const regions = region != null ? [region] : displayRegions(cfg, state);
    const channels = channel != null ? [channel] : displayChannels(cfg, state);
    return grainTotal(cfg, regions, channels, [state.collection], year, monthIdx).rev;
  }
  function collectionRowValue(cfg, state, collection, year, monthIdx) {
    if (state.entity) return entityCollectionValue(cfg.entities[state.entity], collection, year, monthIdx);
    return grainTotal(cfg, displayRegions(cfg, state), displayChannels(cfg, state), [collection], year, monthIdx).rev;
  }

  function getTop5(cfg, state) {
    if (state.entity) return { rows: cfg.lookups.overall, highlight: state.entity, scopeDims: {} };
    if (state.collection) return { rows: cfg.lookups.byCollection[state.collection] || [], highlight: null, scopeDims: { collection: state.collection } };
    if (state.region) return { rows: cfg.lookups.byRegion[state.region] || [], highlight: null, scopeDims: { region: state.region } };
    if (state.channel) return { rows: cfg.lookups.byChannel[state.channel] || [], highlight: null, scopeDims: { channel: state.channel } };
    if (state.month != null) return { rows: cfg.lookups.byMonth[String(state.month)] || [], highlight: null, scopeDims: { month: state.month } };
    return { rows: cfg.lookups.overall, highlight: null, scopeDims: {} };
  }

  function top5WeightPct(cfg, state) {
    if (state.entity) return 100;
    const { rows, scopeDims } = getTop5(cfg, state);
    const sum = rows.reduce((a, r) => a + r.revenue, 0);
    const scopedState = Object.assign(newState(), scopeDims);
    const total = filteredTotal(cfg, scopedState, '2025').rev;
    return total ? (sum / total * 100) : 0;
  }

  function trendSeries(cfg, state, year) {
    if (state.entity) {
      const e = cfg.entities[state.entity];
      return year === '2025' ? e.monthlyRev2025.slice() : e.monthlyRev2024.slice();
    }
    return grainMonthly(cfg, displayRegions(cfg, state), displayChannels(cfg, state), displayCollections(state), year);
  }

  function svgTrend(cur, py, monthIdx) {
    const W = 720, H = 230, padL = 44, padR = 14, padT = 14, padB = 26;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const maxVal = Math.max(1, ...cur, ...py);
    const x = i => padL + i * (plotW / 11);
    const y = v => padT + plotH - (v / maxVal) * plotH;
    const path = arr => arr.map((v, i) => (i === 0 ? 'M' : 'L') + x(i).toFixed(1) + ',' + y(v).toFixed(1)).join(' ');
    let gridlines = '';
    [0, 0.5, 1].forEach(f => {
      const yy = padT + plotH - f * plotH;
      gridlines += `<line class="grid-line" x1="${padL}" y1="${yy.toFixed(1)}" x2="${W - padR}" y2="${yy.toFixed(1)}"></line>`;
      gridlines += `<text x="${padL - 6}" y="${(yy + 3).toFixed(1)}" text-anchor="end">${fmtMoney(f * maxVal)}</text>`;
    });
    let monthLabels = '';
    MONTHS.forEach((m, i) => { monthLabels += `<text x="${x(i).toFixed(1)}" y="${H - 6}" text-anchor="middle">${m}</text>`; });
    let marker = '';
    if (monthIdx != null) {
      marker = `<line class="month-marker" x1="${x(monthIdx).toFixed(1)}" y1="${padT}" x2="${x(monthIdx).toFixed(1)}" y2="${padT + plotH}"></line>`;
    }
    let ptsPy = '', ptsCur = '';
    py.forEach((v, i) => { const r = (monthIdx === i) ? 4.5 : 3; ptsPy += `<circle class="pt-py" cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="${r}"><title>2024 ${MONTHS[i]}: CHF ${fmtMoney(v)}</title></circle>`; });
    cur.forEach((v, i) => { const r = (monthIdx === i) ? 4.5 : 3; ptsCur += `<circle class="pt-cur" cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="${r}"><title>2025 ${MONTHS[i]}: CHF ${fmtMoney(v)}</title></circle>`; });
    return `<svg class="dash-trend-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Monthly trend, 2025 versus 2024">
      ${gridlines}${marker}
      <path d="${path(py)}" fill="none" stroke="var(--pbi-tan)" stroke-width="2" stroke-dasharray="5 4"></path>
      <path d="${path(cur)}" fill="none" stroke="var(--pbi-dark)" stroke-width="2.2"></path>
      ${ptsPy}${ptsCur}
      ${monthLabels}
    </svg>`;
  }

  function statusLine(cfg, state) {
    const bits = [];
    bits.push(state.month != null ? MONTHS[state.month - 1] + ' 2025' : 'Full Year 2025');
    if (state.entity) bits.push(esc(state.entity));
    if (state.region) bits.push(state.region);
    if (state.channel) bits.push(state.channel);
    if (state.collection) bits.push(state.collection);
    if (!state.entity && !state.region && !state.channel && !state.collection) bits.push('All ' + cfg.entityLabelPlural + ', all collections');
    return bits.join(' &middot; ');
  }

  function hasActiveFilter(state) {
    return !!(state.month != null || state.entity || state.region || state.channel || state.collection);
  }

  function render(cfg, state, el) {
    const monthIdx = state.month == null ? null : state.month - 1;
    const kpiRev2025 = filteredTotal(cfg, state, '2025');
    const kpiRev2024 = filteredTotal(cfg, state, '2024');
    const revDelta = kpiRev2024.rev ? (kpiRev2025.rev / kpiRev2024.rev - 1) * 100 : null;
    const unitsDelta = kpiRev2024.units ? (kpiRev2025.units / kpiRev2024.units - 1) * 100 : null;

    // ---- KPI cards ----
    let kpiHtml = `
      <div class="dash-kpi">
        <div class="dash-kpi-label">Revenue</div>
        <div class="dash-kpi-value">${fmtMoney(kpiRev2025.rev)}</div>
        <div class="dash-kpi-delta ${revDelta == null ? 'flat' : ''}">${revDelta == null ? 'New in 2025' : fmtPct(revDelta) + ' vs 2024'}</div>
      </div>
      <div class="dash-kpi">
        <div class="dash-kpi-label">Units</div>
        <div class="dash-kpi-value">${fmtUnits(kpiRev2025.units)}</div>
        <div class="dash-kpi-delta ${unitsDelta == null ? 'flat' : ''}">${unitsDelta == null ? 'New in 2025' : fmtPct(unitsDelta) + ' vs 2024'}</div>
      </div>`;
    if (cfg.key === 'wholesale') {
      kpiHtml += `
      <div class="dash-kpi">
        <div class="dash-kpi-label">Top 5 Partners Weight</div>
        <div class="dash-kpi-value">${top5WeightPct(cfg, state).toFixed(1)}%</div>
        <div class="dash-kpi-delta flat">of current selection</div>
      </div>
      <div class="dash-kpi">
        <div class="dash-kpi-label">Sell-Out Coverage</div>
        <div class="dash-kpi-value">${cfg.kpi.coverageOverall.toFixed(0)}%</div>
        <div class="dash-kpi-delta flat">${cfg.kpi.totalReportingAccounts} of ${cfg.kpi.totalAccounts} accounts</div>
      </div>
      <div class="dash-kpi">
        <div class="dash-kpi-label">Report Coverage</div>
        <div class="dash-kpi-value">${cfg.kpi.reportCoverage}%</div>
        <div class="dash-kpi-delta flat">any 2025 data on file</div>
      </div>`;
    } else {
      const avgPrice = kpiRev2025.units ? kpiRev2025.rev / kpiRev2025.units : 0;
      kpiHtml += `
      <div class="dash-kpi">
        <div class="dash-kpi-label">Average Price</div>
        <div class="dash-kpi-value">${fmtPrice(avgPrice)}</div>
        <div class="dash-kpi-delta flat">CHF per unit</div>
      </div>
      <div class="dash-kpi">
        <div class="dash-kpi-label">Stores Count</div>
        <div class="dash-kpi-value">${cfg.kpi.storesCount}</div>
        <div class="dash-kpi-delta flat">boutiques on file</div>
      </div>
      <div class="dash-kpi">
        <div class="dash-kpi-label">Stores Activity</div>
        <div class="dash-kpi-value">${cfg.kpi.storesActivity}%</div>
        <div class="dash-kpi-delta flat">active in the period</div>
      </div>`;
    }
    kpiHtml += `
      <div class="dash-month">
        <div class="dash-kpi-label">Select Month</div>
        <select data-role="month-select">
          <option value="">All</option>
          ${MONTHS.map((m, i) => `<option value="${i + 1}" ${state.month === i + 1 ? 'selected' : ''}>${m}</option>`).join('')}
        </select>
      </div>`;
    el.querySelector('.dash-kpis').innerHTML = kpiHtml;

    // ---- Region bar chart ----
    const regs = displayRegions(cfg, state);
    let regMax = 1;
    regs.forEach(r => { regMax = Math.max(regMax, contextBarValue(cfg, state, r, null, '2025', monthIdx), contextBarValue(cfg, state, r, null, '2024', monthIdx)); });
    let regionHtml = '';
    regs.forEach(r => {
      const cur = contextBarValue(cfg, state, r, null, '2025', monthIdx);
      const py = contextBarValue(cfg, state, r, null, '2024', monthIdx);
      const hlCur = highlightBarValue(cfg, state, r, null, '2025', monthIdx);
      const hlPy = highlightBarValue(cfg, state, r, null, '2024', monthIdx);
      const curH = (cur / regMax * 100).toFixed(1), pyH = (py / regMax * 100).toFixed(1);
      const hlCurH = hlCur != null && cur ? (hlCur / cur * 100).toFixed(1) : null;
      const hlPyH = hlPy != null && py ? (hlPy / py * 100).toFixed(1) : null;
      const selected = state.region === r;
      regionHtml += `
        <button type="button" class="vbar-group${selected ? ' is-selected' : ''}" data-region="${esc(r)}" title="${esc(r)}: CHF ${fmtMoney(cur)} (2025) vs CHF ${fmtMoney(py)} (2024)">
          <div class="vbar-cols">
            <div class="vbar-col"><div class="vbar-fill" style="height:${curH}%">${hlCurH != null ? `<div class="vbar-hl" style="height:${hlCurH}%"></div>` : ''}</div></div>
            <div class="vbar-col"><div class="vbar-fill is-py" style="height:${pyH}%">${hlPyH != null ? `<div class="vbar-hl" style="height:${hlPyH}%"></div>` : ''}</div></div>
          </div>
          <div class="vbar-label">${esc(r)}</div>
        </button>`;
    });
    el.querySelector('[data-panel="region"] .vbar-chart').innerHTML = regionHtml;

    // ---- Channel bar chart ----
    const chans = displayChannels(cfg, state);
    let chanMax = 1;
    chans.forEach(c => { chanMax = Math.max(chanMax, contextBarValue(cfg, state, null, c, '2025', monthIdx), contextBarValue(cfg, state, null, c, '2024', monthIdx)); });
    let channelHtml = '';
    chans.forEach(c => {
      const cur = contextBarValue(cfg, state, null, c, '2025', monthIdx);
      const py = contextBarValue(cfg, state, null, c, '2024', monthIdx);
      const hlCur = highlightBarValue(cfg, state, null, c, '2025', monthIdx);
      const hlPy = highlightBarValue(cfg, state, null, c, '2024', monthIdx);
      const curH = (cur / chanMax * 100).toFixed(1), pyH = (py / chanMax * 100).toFixed(1);
      const hlCurH = hlCur != null && cur ? (hlCur / cur * 100).toFixed(1) : null;
      const hlPyH = hlPy != null && py ? (hlPy / py * 100).toFixed(1) : null;
      const selected = state.channel === c;
      channelHtml += `
        <button type="button" class="vbar-group${selected ? ' is-selected' : ''}" data-channel="${esc(c)}" title="${esc(c)}: CHF ${fmtMoney(cur)} (2025) vs CHF ${fmtMoney(py)} (2024)">
          <div class="vbar-cols">
            <div class="vbar-col"><div class="vbar-fill" style="height:${curH}%">${hlCurH != null ? `<div class="vbar-hl" style="height:${hlCurH}%"></div>` : ''}</div></div>
            <div class="vbar-col"><div class="vbar-fill is-py" style="height:${pyH}%">${hlPyH != null ? `<div class="vbar-hl" style="height:${hlPyH}%"></div>` : ''}</div></div>
          </div>
          <div class="vbar-label">${esc(c)}</div>
        </button>`;
    });
    el.querySelector('[data-panel="channel"] .vbar-chart').innerHTML = channelHtml;

    // ---- Collection horizontal bars ----
    const collVals = COLLECTIONS.map(c => ({
      c,
      cur: collectionRowValue(cfg, state, c, '2025', monthIdx),
      py: collectionRowValue(cfg, state, c, '2024', monthIdx)
    })).sort((a, b) => b.cur - a.cur);
    const collMax = Math.max(1, ...collVals.map(v => v.cur), ...collVals.map(v => v.py));
    let collHtml = '';
    collVals.forEach(v => {
      const selected = state.collection === v.c;
      const dim = !!state.collection && !selected;
      collHtml += `
        <button type="button" class="hbar-row${selected ? ' is-selected' : ''}${dim ? ' is-dim' : ''}" data-collection="${esc(v.c)}" title="${esc(v.c)}: CHF ${fmtMoney(v.cur)} (2025) vs CHF ${fmtMoney(v.py)} (2024)">
          <span class="hbar-label">${esc(v.c)}</span>
          <span class="hbar-tracks">
            <span class="hbar-track"><span class="hbar-fill" style="width:${(v.cur / collMax * 100).toFixed(1)}%"></span></span>
            <span class="hbar-track"><span class="hbar-fill is-py" style="width:${(v.py / collMax * 100).toFixed(1)}%"></span></span>
          </span>
        </button>`;
    });
    el.querySelector('[data-panel="collection"] .hbar-chart').innerHTML = collHtml;

    // ---- Trend chart ----
    const trendCur = trendSeries(cfg, state, '2025');
    const trendPy = trendSeries(cfg, state, '2024');
    el.querySelector('[data-panel="trend"] .dash-trend-wrap').innerHTML = svgTrend(trendCur, trendPy, monthIdx);

    // ---- Top 5 table ----
    const { rows, highlight } = getTop5(cfg, state);
    let tableHtml = `<thead><tr><th>Top 5 ${cfg.entityLabelPlural}</th><th>Revenue</th><th>vs LY</th></tr></thead><tbody>`;
    if (!rows.length) {
      tableHtml += `<tr><td colspan="3" style="color:var(--pbi-text-light);font-style:italic;">No data for this cut</td></tr>`;
    }
    rows.forEach(r => {
      const isSel = highlight === r.name;
      tableHtml += `<tr class="${isSel ? 'is-selected' : ''}" data-entity="${esc(r.name)}">
        <td class="dash-table-name">${esc(r.name)}</td>
        <td>${fmtMoney(r.revenue)}</td>
        <td>${r.vsLY == null ? 'new' : fmtPct(r.vsLY, 0)}</td>
      </tr>`;
    });
    tableHtml += '</tbody>';
    el.querySelector('[data-panel="table"] table').innerHTML = tableHtml;

    // ---- status row ----
    el.querySelector('.dash-status').innerHTML = 'Showing: <b>' + statusLine(cfg, state) + '</b>';
    el.querySelector('.dash-clear').disabled = !hasActiveFilter(state);
  }

  function skeleton(cfg, id) {
    return `
    <div class="biz-dash" id="${id}" data-page="${cfg.key}">
      <div class="dash-kpis"></div>
      <div class="dash-charts">
        <div class="dash-panel dash-panel-region" data-panel="region">
          <p class="dash-panel-title">Revenue by Region &middot; 2025 vs 2024</p>
          <div class="vbar-chart"></div>
        </div>
        <div class="dash-panel dash-panel-collection" data-panel="collection">
          <p class="dash-panel-title">Revenue by Collection &middot; 2025 vs 2024</p>
          <div class="hbar-chart"></div>
        </div>
        <div class="dash-panel dash-panel-channel" data-panel="channel">
          <p class="dash-panel-title">Retail vs Online &middot; 2025 vs 2024</p>
          <div class="vbar-chart"></div>
        </div>
      </div>
      <div class="dash-bottom">
        <div class="dash-panel" data-panel="trend">
          <p class="dash-panel-title">Monthly Trend</p>
          <div class="dash-legend">
            <span class="dash-legend-item"><span class="dash-legend-dot"></span>2025</span>
            <span class="dash-legend-item"><span class="dash-legend-dot py"></span>2024</span>
          </div>
          <div class="dash-trend-wrap"></div>
        </div>
        <div class="dash-panel" data-panel="table">
          <table class="dash-table"></table>
        </div>
      </div>
      <div class="dash-status-row">
        <p class="dash-status"></p>
        <button type="button" class="dash-clear">Clear selection</button>
      </div>
    </div>`;
  }

  function wire(cfg, state, el) {
    el.addEventListener('click', e => {
      const regionBtn = e.target.closest('[data-region]');
      const channelBtn = e.target.closest('[data-channel]');
      const collBtn = e.target.closest('[data-collection]');
      const entityRow = e.target.closest('tr[data-entity]');
      let changed = false;
      if (regionBtn) {
        const v = regionBtn.getAttribute('data-region');
        state.entity = null;
        state.region = state.region === v ? null : v;
        changed = true;
      } else if (channelBtn) {
        const v = channelBtn.getAttribute('data-channel');
        state.entity = null;
        state.channel = state.channel === v ? null : v;
        changed = true;
      } else if (collBtn) {
        const v = collBtn.getAttribute('data-collection');
        state.entity = null;
        state.collection = state.collection === v ? null : v;
        changed = true;
      } else if (entityRow) {
        const v = entityRow.getAttribute('data-entity');
        if (cfg.entities[v]) {
          state.region = null; state.channel = null; state.collection = null;
          state.entity = state.entity === v ? null : v;
          changed = true;
        }
      } else if (e.target.closest('.dash-clear')) {
        Object.assign(state, newState());
        changed = true;
      }
      if (changed) render(cfg, state, el);
    });
    el.addEventListener('change', e => {
      if (e.target.matches('[data-role="month-select"]')) {
        const v = e.target.value;
        state.month = v ? parseInt(v, 10) : null;
        render(cfg, state, el);
      }
    });
  }

  function init() {
    const root = document.getElementById('dash-root');
    if (!root) return;
    const cfgW = buildConfig('wholesale');
    const cfgD = buildConfig('dtc');
    root.innerHTML = `<div id="page-wholesale">${skeleton(cfgW, 'dash-wholesale')}</div><div id="page-dtc" hidden>${skeleton(cfgD, 'dash-dtc')}</div>`;
    const stateW = newState(), stateD = newState();
    const elW = document.getElementById('dash-wholesale');
    const elD = document.getElementById('dash-dtc');
    wire(cfgW, stateW, elW);
    wire(cfgD, stateD, elD);
    render(cfgW, stateW, elW);
    render(cfgD, stateD, elD);

    window.MeridianDash = {
      showPage(which) {
        document.getElementById('page-wholesale').hidden = which !== 'wholesale';
        document.getElementById('page-dtc').hidden = which !== 'dtc';
      }
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
