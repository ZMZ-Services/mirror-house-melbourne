// Visitor numbers for the admin's Home and Analytics pages, built from site_events (see /api/track).
// Days and hours are Melbourne time. Shapes match what the admin's charts already expect.
const TZ = 'Australia/Melbourne';

const SESSIONS_CTE = `
  WITH s AS (
    SELECT session_id,
           min(visitor_id) AS visitor_id,
           min(at) AS started, max(at) AS ended,
           count(*) FILTER (WHERE type = 'page_view') AS pages,
           bool_or(type = 'view_item') AS viewed_item,
           bool_or(type = 'add_to_cart') AS added,
           bool_or(type = 'begin_checkout') AS checkout,
           bool_or(type = 'try_in_your_room') AS visualiser,
           NOT bool_or(new_visitor) AS is_returning,
           (array_agg(source ORDER BY at))[1] AS source,
           (array_agg(device ORDER BY at))[1] AS device,
           (array_agg(NULLIF(city, '') ORDER BY at))[1] AS city,
           (array_agg(NULLIF(region, '') ORDER BY at))[1] AS region
    FROM site_events WHERE at >= $1 GROUP BY session_id
  )`;

export async function dailyTraffic(db, days = 365) {
  const since = new Date(Date.now() - (days + 1) * 86400000);
  const r = await db.query(SESSIONS_CTE + `
    SELECT to_char(started AT TIME ZONE '${TZ}', 'YYYY-MM-DD') AS date,
           count(*)::int AS sessions,
           count(DISTINCT visitor_id)::int AS visitors,
           count(*) FILTER (WHERE viewed_item)::int AS product_views,
           count(*) FILTER (WHERE added)::int AS add_to_bag,
           count(*) FILTER (WHERE checkout)::int AS checkout,
           count(*) FILTER (WHERE visualiser)::int AS visualiser,
           avg(CASE WHEN pages <= 1 THEN 1 ELSE 0 END)::float AS bounce,
           avg(EXTRACT(EPOCH FROM (ended - started)))::float AS duration,
           avg(GREATEST(pages, 1))::float AS pages_per,
           avg(CASE WHEN is_returning THEN 1 ELSE 0 END)::float AS returning_share
    FROM s GROUP BY 1 ORDER BY 1`, [since]);
  return r.rows.map((x) => {
    const [y, m, d] = x.date.split('-').map(Number);
    return {
      date: x.date, t: new Date(y, m - 1, d).getTime(), sessions: x.sessions, visitors: x.visitors, productViews: x.product_views,
      visualiser: x.visualiser, addToBag: x.add_to_bag, checkout: x.checkout, orders: 0,
      bounce: x.bounce || 0, duration: x.duration || 0, pagesPer: x.pages_per || 0, returning: x.returning_share || 0
    };
  });
}

// Breakdowns for one period: where visits came from, devices, locations, hours, pages, and Try It in Your Room.
export async function breakdown(db, days) {
  const since = new Date(Date.now() - days * 86400000);
  const [src, dev, loc, hrs, pages, viz] = await Promise.all([
    db.query(SESSIONS_CTE + ' SELECT COALESCE(NULLIF(source, \'\'), \'Direct\') AS label, count(*)::int AS value FROM s GROUP BY 1 ORDER BY 2 DESC', [since]),
    db.query(SESSIONS_CTE + ' SELECT COALESCE(NULLIF(device, \'\'), \'Desktop\') AS label, count(*)::int AS value FROM s GROUP BY 1 ORDER BY 2 DESC', [since]),
    db.query(SESSIONS_CTE + ` SELECT COALESCE(city || COALESCE(', ' || region, ''), region, 'Unknown') AS label, count(*)::int AS value FROM s GROUP BY 1 ORDER BY 2 DESC LIMIT 8`, [since]),
    db.query(SESSIONS_CTE + ` SELECT EXTRACT(HOUR FROM started AT TIME ZONE '${TZ}')::int AS h, count(*)::int AS value FROM s GROUP BY 1`, [since]),
    db.query(`
      WITH pv AS (
        SELECT session_id, path, at,
               lead(at) OVER (PARTITION BY session_id ORDER BY at) AS next_at
        FROM site_events WHERE at >= $1 AND type = 'page_view'
      )
      SELECT path, count(*)::int AS views,
             avg(LEAST(EXTRACT(EPOCH FROM (next_at - at)), 1800)) FILTER (WHERE next_at IS NOT NULL)::float AS secs,
             avg(CASE WHEN next_at IS NULL THEN 1 ELSE 0 END)::float AS exit_rate
      FROM pv GROUP BY path ORDER BY views DESC LIMIT 10`, [since]),
    db.query(SESSIONS_CTE + `
      SELECT count(*) FILTER (WHERE s.visualiser)::int AS sessions,
             (SELECT count(*)::int FROM orders o JOIN s s2 ON s2.session_id = o.session_id
               WHERE s2.visualiser AND o.created_at >= $1 AND o.payment IN ('paid', 'partially_refunded', 'refunded', 'awaiting_quote', 'quote_sent')) AS orders
      FROM s`, [since])
  ]);
  const hours = new Array(24).fill(0);
  hrs.rows.forEach((r) => { hours[r.h] = r.value; });
  return {
    sources: src.rows, devices: dev.rows, locations: loc.rows, hours,
    pages: pages.rows.map((p) => ({ path: p.path, views: p.views, secs: Math.round(p.secs || 0), exitRate: p.exit_rate || 0 })),
    visualiserOrders: (viz.rows[0] && viz.rows[0].orders) || 0
  };
}

export async function trafficSummary(db) {
  const [days, d7, d30, d90, d365] = await Promise.all([dailyTraffic(db, 400), breakdown(db, 7), breakdown(db, 30), breakdown(db, 90), breakdown(db, 365)]);
  return { days, breakdowns: { '7d': d7, '30d': d30, '90d': d90, '365d': d365 } };
}
