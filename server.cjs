const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const multer = require('multer');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(express.json({ limit: '50mb' }));

// --- Database Setup ---
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://ledger:ledger@localhost:5432/ledger',
});

async function initializeDatabase() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        address TEXT,
        phone TEXT,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS banks (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        "accountNumber" TEXT NOT NULL,
        "initialBalance" DOUBLE PRECISION DEFAULT 0,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        "customerId" TEXT REFERENCES customers(id),
        "bankId" TEXT REFERENCES banks(id),
        date TEXT NOT NULL,
        type TEXT NOT NULL,
        "goldWeight" DOUBLE PRECISION,
        "silverWeight" DOUBLE PRECISION,
        rate DOUBLE PRECISION,
        "rateMode" TEXT,
        "totalAmount" DOUBLE PRECISION,
        "cashIn" DOUBLE PRECISION,
        "cashOut" DOUBLE PRECISION,
        "goldIn" DOUBLE PRECISION,
        "goldOut" DOUBLE PRECISION,
        "silverIn" DOUBLE PRECISION,
        "silverOut" DOUBLE PRECISION,
        remarks TEXT,
        "impureWeight" DOUBLE PRECISION,
        point DOUBLE PRECISION,
        karat DOUBLE PRECISION,
        "paymentMethod" TEXT,
        "transferType" TEXT,
        "referenceNo" TEXT,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_transactions_customerid ON transactions("customerId");
      CREATE INDEX IF NOT EXISTS idx_transactions_bankid ON transactions("bankId");
      CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
    `);
    console.log('Database tables initialized');
  } finally {
    client.release();
  }
}

// --- Helper Functions ---
async function getAllData() {
  const [customers, banks, transactions] = await Promise.all([
    pool.query('SELECT id, name, address, phone FROM customers'),
    pool.query('SELECT id, name, "accountNumber", "initialBalance" FROM banks'),
    pool.query(`SELECT id, "customerId", "bankId", date, type, "goldWeight", "silverWeight",
      rate, "rateMode", "totalAmount", "cashIn", "cashOut", "goldIn", "goldOut",
      "silverIn", "silverOut", remarks, "impureWeight", point, karat,
      "paymentMethod", "transferType", "referenceNo" FROM transactions`),
  ]);
  return {
    customers: customers.rows,
    banks: banks.rows,
    transactions: transactions.rows,
  };
}

async function saveAllData(state) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Clear tables (transactions first for FK constraints)
    await client.query('DELETE FROM transactions');
    await client.query('DELETE FROM customers');
    await client.query('DELETE FROM banks');

    // Insert customers
    for (const c of (state.customers || [])) {
      await client.query(
        'INSERT INTO customers (id, name, address, phone) VALUES ($1, $2, $3, $4)',
        [c.id, c.name, c.address || null, c.phone || null]
      );
    }

    // Insert banks
    for (const b of (state.banks || [])) {
      await client.query(
        'INSERT INTO banks (id, name, "accountNumber", "initialBalance") VALUES ($1, $2, $3, $4)',
        [b.id, b.name, b.accountNumber, b.initialBalance]
      );
    }

    // Insert transactions
    for (const t of (state.transactions || [])) {
      await client.query(
        `INSERT INTO transactions (
          id, "customerId", "bankId", date, type, "goldWeight", "silverWeight", rate, "rateMode",
          "totalAmount", "cashIn", "cashOut", "goldIn", "goldOut", "silverIn", "silverOut",
          remarks, "impureWeight", point, karat, "paymentMethod", "transferType", "referenceNo"
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)`,
        [
          t.id, t.customerId || null, t.bankId || null, t.date, t.type,
          t.goldWeight || null, t.silverWeight || null, t.rate || null, t.rateMode || null,
          t.totalAmount || null, t.cashIn || null, t.cashOut || null,
          t.goldIn || null, t.goldOut || null, t.silverIn || null, t.silverOut || null,
          t.remarks, t.impureWeight || null, t.point || null, t.karat || null,
          t.paymentMethod || null, t.transferType || null, t.referenceNo || null,
        ]
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// --- API Routes ---

// Get all data
app.get('/api/data', async (req, res) => {
  try {
    const data = await getAllData();
    res.json(data);
  } catch (error) {
    console.error('Error getting data:', error);
    res.status(500).json({ error: error.message });
  }
});

// Save all data
app.post('/api/data', async (req, res) => {
  try {
    await saveAllData(req.body);
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving data:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Download backup
app.get('/api/backup', async (req, res) => {
  try {
    const data = await getAllData();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    res.setHeader('Content-Disposition', `attachment; filename=haroon-backup-${timestamp}.json`);
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error creating backup:', error);
    res.status(500).json({ error: error.message });
  }
});

// Restore from backup (JSON file upload)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

app.post('/api/restore', upload.single('backup'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }
    const data = JSON.parse(req.file.buffer.toString('utf-8'));
    if (!data.customers || data.transactions === undefined) {
      return res.status(400).json({ success: false, error: 'Invalid backup file format' });
    }
    await saveAllData(data);
    const newData = await getAllData();
    res.json({ success: true, data: newData });
  } catch (error) {
    console.error('Error restoring backup:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// --- Serve Frontend (production) ---
const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// --- Graceful Shutdown ---
process.on('SIGINT', async () => {
  console.log('Shutting down...');
  await pool.end();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  await pool.end();
  process.exit(0);
});

// --- Start Server ---
initializeDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
