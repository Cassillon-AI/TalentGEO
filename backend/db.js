const { Pool } = require('pg');

// Cloud Run connects to Cloud SQL via the Unix socket injected by the
// Cloud SQL Auth Proxy sidecar. Locally, DATABASE_URL can point to a
// direct TCP connection string for development.
//
// Socket path format (Cloud Run):
//   /cloudsql/PROJECT:REGION:INSTANCE
//
// DATABASE_URL format (local dev):
//   postgresql://talentgeo_app:PASSWORD@localhost:5432/talentgeo

const isCloudRun = !!process.env.CLOUD_SQL_CONNECTION_NAME;

const pool = new Pool(
  isCloudRun
    ? {
        user:     process.env.DB_USER     || 'talentgeo_app',
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME     || 'talentgeo',
        host:     `/cloudsql/${process.env.CLOUD_SQL_CONNECTION_NAME}`,
      }
    : {
        connectionString: process.env.DATABASE_URL,
      }
);

pool.on('error', (err) => {
  console.error('Unexpected database pool error:', err.message);
});

async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  if (process.env.NODE_ENV !== 'production') {
    console.log('db query', { text: text.slice(0, 80), duration, rows: res.rowCount });
  }
  return res;
}

async function getClient() {
  return pool.connect();
}

module.exports = { query, getClient, pool };
