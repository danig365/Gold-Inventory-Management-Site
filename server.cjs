const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const multer = require('multer');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3001;
const AUTH_SECRET = process.env.AUTH_SECRET || 'change-this-secret-in-production';
const AUTH_TOKEN_TTL_SECONDS = Number(process.env.AUTH_TOKEN_TTL_SECONDS || 60 * 60 * 24 * 7);
const ONLINE_WINDOW_SECONDS = Number(process.env.ONLINE_WINDOW_SECONDS || 120);
const PRESENCE_TOUCH_THROTTLE_MS = Number(process.env.PRESENCE_TOUCH_THROTTLE_MS || 15000);
const lastPresenceTouch = new Map();

// Middleware
app.use(express.json({ limit: '50mb' }));

// --- Database Setup ---
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://ledger:ledger@localhost:5432/ledger',
});

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash) return false;

  // Legacy fallback: allow plain text for DB-seeded users and auto-upgrade later.
  if (!storedHash.includes(':')) {
    return password === storedHash;
  }

  const [salt, key] = storedHash.split(':');
  if (!salt || !key) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuffer = Buffer.from(key, 'hex');
  if (derived.length !== keyBuffer.length) return false;
  return crypto.timingSafeEqual(derived, keyBuffer);
}

function toBase64Url(str) {
  return Buffer.from(str, 'utf8').toString('base64url');
}

function fromBase64Url(str) {
  return Buffer.from(str, 'base64url').toString('utf8');
}

function signTokenPayload(payloadBase64) {
  return crypto.createHmac('sha256', AUTH_SECRET).update(payloadBase64).digest('base64url');
}

function createToken(user) {
  const payload = {
    uid: user.id,
    usr: user.username,
    exp: Math.floor(Date.now() / 1000) + AUTH_TOKEN_TTL_SECONDS,
  };
  const payloadBase64 = toBase64Url(JSON.stringify(payload));
  const signature = signTokenPayload(payloadBase64);
  return `${payloadBase64}.${signature}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const [payloadBase64, signature] = token.split('.');
  if (!payloadBase64 || !signature) return null;
  const expectedSig = signTokenPayload(payloadBase64);
  if (expectedSig !== signature) return null;

  try {
    const payload = JSON.parse(fromBase64Url(payloadBase64));
    if (!payload.uid || !payload.exp) return null;
    if (Math.floor(Date.now() / 1000) > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function mapUser(row) {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    projectName: row.project_name,
    role: row.role,
  };
}

async function findUserById(id) {
  const res = await pool.query(
    `SELECT id, username, password_hash, display_name, project_name, role
     FROM users WHERE id = $1 AND is_active = TRUE`,
    [id]
  );
  return res.rows[0] || null;
}

async function touchUserPresence(userId) {
  const nowMs = Date.now();
  const lastMs = lastPresenceTouch.get(userId) || 0;
  if (nowMs - lastMs < PRESENCE_TOUCH_THROTTLE_MS) return;
  lastPresenceTouch.set(userId, nowMs);
  await pool.query('UPDATE users SET last_seen = CURRENT_TIMESTAMP WHERE id = $1', [userId]);
}

async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing authorization token' });
    }

    const token = authHeader.slice('Bearer '.length).trim();
    const payload = verifyToken(token);
    if (!payload) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const user = await findUserById(payload.uid);
    if (!user) {
      return res.status(401).json({ error: 'User not found or inactive' });
    }

    req.user = mapUser(user);
    touchUserPresence(req.user.id).catch((err) => {
      console.error('Presence update failed:', err.message || err);
    });
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }
  next();
}

async function initializeDatabase() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        display_name TEXT NOT NULL,
        project_name TEXT NOT NULL,
        role TEXT DEFAULT 'user',
        is_active BOOLEAN DEFAULT TRUE,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS customers (
        id TEXT PRIMARY KEY,
        "userId" TEXT REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        address TEXT,
        phone TEXT,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS banks (
        id TEXT PRIMARY KEY,
        "userId" TEXT REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        "accountNumber" TEXT NOT NULL,
        "initialBalance" DOUBLE PRECISION DEFAULT 0,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        "userId" TEXT REFERENCES users(id) ON DELETE CASCADE,
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
    `);

    await client.query('ALTER TABLE customers ADD COLUMN IF NOT EXISTS "userId" TEXT REFERENCES users(id) ON DELETE CASCADE');
    await client.query('ALTER TABLE banks ADD COLUMN IF NOT EXISTS "userId" TEXT REFERENCES users(id) ON DELETE CASCADE');
    await client.query('ALTER TABLE transactions ADD COLUMN IF NOT EXISTS "userId" TEXT REFERENCES users(id) ON DELETE CASCADE');
    await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen TIMESTAMP');

    await client.query('CREATE INDEX IF NOT EXISTS idx_transactions_customerid ON transactions("customerId")');
    await client.query('CREATE INDEX IF NOT EXISTS idx_transactions_bankid ON transactions("bankId")');
    await client.query('CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_customers_userid ON customers("userId")');
    await client.query('CREATE INDEX IF NOT EXISTS idx_banks_userid ON banks("userId")');
    await client.query('CREATE INDEX IF NOT EXISTS idx_transactions_userid ON transactions("userId")');

    const defaultUser = {
      id: 'u_admin',
      username: process.env.DEFAULT_ADMIN_USERNAME || 'admin',
      password: process.env.DEFAULT_ADMIN_PASSWORD || 'admin',
      displayName: process.env.DEFAULT_ADMIN_NAME || 'Admin',
      projectName: process.env.DEFAULT_PROJECT_NAME || 'New Jehlum Gold Smith',
      role: 'admin',
    };

    const existingDefault = await client.query('SELECT id FROM users WHERE username = $1', [defaultUser.username]);
    if (existingDefault.rows.length === 0) {
      await client.query(
        `INSERT INTO users (id, username, password_hash, display_name, project_name, role, last_seen)
         VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
        [
          defaultUser.id,
          defaultUser.username,
          hashPassword(defaultUser.password),
          defaultUser.displayName,
          defaultUser.projectName,
          defaultUser.role,
        ]
      );
      console.log(`Default user created: username=${defaultUser.username}`);
    }

    const userRes = await client.query('SELECT id FROM users ORDER BY "createdAt" ASC LIMIT 1');
    const firstUserId = userRes.rows[0]?.id;
    if (firstUserId) {
      await client.query('UPDATE customers SET "userId" = $1 WHERE "userId" IS NULL', [firstUserId]);
      await client.query('UPDATE banks SET "userId" = $1 WHERE "userId" IS NULL', [firstUserId]);
      await client.query('UPDATE transactions SET "userId" = $1 WHERE "userId" IS NULL', [firstUserId]);
    }

    console.log('Database tables initialized');
  } finally {
    client.release();
  }
}

// --- Helper Functions ---
async function getAllData(userId) {
  const [customers, banks, transactions] = await Promise.all([
    pool.query('SELECT id, name, address, phone FROM customers WHERE "userId" = $1', [userId]),
    pool.query('SELECT id, name, "accountNumber", "initialBalance" FROM banks WHERE "userId" = $1', [userId]),
    pool.query(`SELECT id, "customerId", "bankId", date, type, "goldWeight", "silverWeight",
      rate, "rateMode", "totalAmount", "cashIn", "cashOut", "goldIn", "goldOut",
      "silverIn", "silverOut", remarks, "impureWeight", point, karat,
      "paymentMethod", "transferType", "referenceNo" FROM transactions WHERE "userId" = $1`, [userId]),
  ]);
  return {
    customers: customers.rows,
    banks: banks.rows,
    transactions: transactions.rows,
  };
}

async function saveAllData(userId, state) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Clear current user's tables (transactions first for FK constraints)
    await client.query('DELETE FROM transactions WHERE "userId" = $1', [userId]);
    await client.query('DELETE FROM customers WHERE "userId" = $1', [userId]);
    await client.query('DELETE FROM banks WHERE "userId" = $1', [userId]);

    // Insert customers
    for (const c of (state.customers || [])) {
      await client.query(
        'INSERT INTO customers (id, "userId", name, address, phone) VALUES ($1, $2, $3, $4, $5)',
        [c.id, userId, c.name, c.address || null, c.phone || null]
      );
    }

    // Insert banks
    for (const b of (state.banks || [])) {
      await client.query(
        'INSERT INTO banks (id, "userId", name, "accountNumber", "initialBalance") VALUES ($1, $2, $3, $4, $5)',
        [b.id, userId, b.name, b.accountNumber, b.initialBalance]
      );
    }

    // Insert transactions
    for (const t of (state.transactions || [])) {
      await client.query(
        `INSERT INTO transactions (
          id, "userId", "customerId", "bankId", date, type, "goldWeight", "silverWeight", rate, "rateMode",
          "totalAmount", "cashIn", "cashOut", "goldIn", "goldOut", "silverIn", "silverOut",
          remarks, "impureWeight", point, karat, "paymentMethod", "transferType", "referenceNo"
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)`,
        [
          t.id, userId, t.customerId || null, t.bankId || null, t.date, t.type,
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

app.post('/api/auth/login', async (req, res) => {
  try {
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');

    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Username and password are required' });
    }

    const userRes = await pool.query(
      `SELECT id, username, password_hash, display_name, project_name, role, is_active
       FROM users
       WHERE LOWER(username) = LOWER($1)
       LIMIT 1`,
      [username]
    );

    const user = userRes.rows[0];
    if (!user || !user.is_active) {
      return res.status(401).json({ success: false, error: 'Invalid username or password' });
    }

    const valid = verifyPassword(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ success: false, error: 'Invalid username or password' });
    }

    // Upgrade legacy plain-text passwords to hashed form after successful login.
    if (!String(user.password_hash).includes(':')) {
      const newHash = hashPassword(password);
      await pool.query('UPDATE users SET password_hash = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $2', [newHash, user.id]);
    }

    await pool.query('UPDATE users SET last_seen = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);

    const safeUser = mapUser(user);
    const token = createToken(safeUser);
    res.json({ success: true, token, user: safeUser });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, error: 'Login failed' });
  }
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
  res.json({ success: true, user: req.user });
});

app.post('/api/auth/logout', requireAuth, async (req, res) => {
  res.json({ success: true });
});

app.get('/api/presence/users', requireAuth, async (req, res) => {
  try {
    const users = await pool.query(
      `SELECT
        id,
        username,
        display_name,
        role,
        is_active,
        last_seen,
        CASE
          WHEN last_seen IS NOT NULL AND last_seen >= NOW() - ($1::text || ' seconds')::interval THEN TRUE
          ELSE FALSE
        END AS is_online
       FROM users
       WHERE is_active = TRUE
       ORDER BY is_online DESC, display_name ASC`,
      [String(ONLINE_WINDOW_SECONDS)]
    );

    res.json({
      success: true,
      onlineWindowSeconds: ONLINE_WINDOW_SECONDS,
      users: users.rows,
    });
  } catch (error) {
    console.error('Error loading presence users:', error);
    res.status(500).json({ success: false, error: 'Failed to load presence users' });
  }
});

app.get('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const users = await pool.query(
      `SELECT id, username, display_name, project_name, role, is_active, "createdAt", "updatedAt"
       FROM users
       ORDER BY "createdAt" ASC`
    );
    res.json({ success: true, users: users.rows });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch users' });
  }
});

app.post('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');
    const displayName = String(req.body?.displayName || '').trim();
    const projectName = String(req.body?.projectName || '').trim();
    const role = String(req.body?.role || 'user').trim().toLowerCase();

    if (!username || !password || !displayName || !projectName) {
      return res.status(400).json({ success: false, error: 'username, password, displayName and projectName are required' });
    }

    if (password.length < 4) {
      return res.status(400).json({ success: false, error: 'Password must be at least 4 characters' });
    }

    if (!['admin', 'user'].includes(role)) {
      return res.status(400).json({ success: false, error: 'Role must be admin or user' });
    }

    const existing = await pool.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [username]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, error: 'Username already exists' });
    }

    const newUserId = `u_${crypto.randomUUID()}`;
    const newUser = await pool.query(
      `INSERT INTO users (id, username, password_hash, display_name, project_name, role, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE)
       RETURNING id, username, display_name, project_name, role, is_active, "createdAt", "updatedAt"`,
      [newUserId, username, hashPassword(password), displayName, projectName, role]
    );

    res.status(201).json({ success: true, user: newUser.rows[0] });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ success: false, error: 'Failed to create user' });
  }
});

app.patch('/api/admin/users/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const userId = String(req.params.id || '').trim();
    const displayName = typeof req.body?.displayName === 'string' ? req.body.displayName.trim() : undefined;
    const projectName = typeof req.body?.projectName === 'string' ? req.body.projectName.trim() : undefined;
    const role = typeof req.body?.role === 'string' ? req.body.role.trim().toLowerCase() : undefined;
    const isActive = typeof req.body?.isActive === 'boolean' ? req.body.isActive : undefined;
    const password = typeof req.body?.password === 'string' ? req.body.password : undefined;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'User id is required' });
    }

    if (role !== undefined && !['admin', 'user'].includes(role)) {
      return res.status(400).json({ success: false, error: 'Role must be admin or user' });
    }

    if (password !== undefined && password.length < 4) {
      return res.status(400).json({ success: false, error: 'Password must be at least 4 characters' });
    }

    const existingUser = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
    if (existingUser.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Prevent admins from removing their own admin access or disabling themselves.
    if (req.user.id === userId) {
      if (role && role !== 'admin') {
        return res.status(400).json({ success: false, error: 'You cannot remove your own admin role' });
      }
      if (isActive === false) {
        return res.status(400).json({ success: false, error: 'You cannot deactivate your own account' });
      }
    }

    const fields = [];
    const values = [];
    let idx = 1;

    if (displayName !== undefined) {
      fields.push(`display_name = $${idx++}`);
      values.push(displayName);
    }
    if (projectName !== undefined) {
      fields.push(`project_name = $${idx++}`);
      values.push(projectName);
    }
    if (role !== undefined) {
      fields.push(`role = $${idx++}`);
      values.push(role);
    }
    if (isActive !== undefined) {
      fields.push(`is_active = $${idx++}`);
      values.push(isActive);
    }
    if (password !== undefined) {
      fields.push(`password_hash = $${idx++}`);
      values.push(hashPassword(password));
    }

    if (fields.length === 0) {
      return res.status(400).json({ success: false, error: 'No valid fields supplied to update' });
    }

    fields.push('"updatedAt" = CURRENT_TIMESTAMP');
    values.push(userId);

    const updatedUser = await pool.query(
      `UPDATE users SET ${fields.join(', ')}
       WHERE id = $${idx}
       RETURNING id, username, display_name, project_name, role, is_active, "createdAt", "updatedAt"`,
      values
    );

    res.json({ success: true, user: updatedUser.rows[0] });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ success: false, error: 'Failed to update user' });
  }
});

// Get all data
app.get('/api/data', requireAuth, async (req, res) => {
  try {
    const data = await getAllData(req.user.id);
    res.json(data);
  } catch (error) {
    console.error('Error getting data:', error);
    res.status(500).json({ error: error.message });
  }
});

// Save all data
app.post('/api/data', requireAuth, async (req, res) => {
  try {
    await saveAllData(req.user.id, req.body);
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving data:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Download backup
app.get('/api/backup', requireAuth, async (req, res) => {
  try {
    const data = await getAllData(req.user.id);
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

app.post('/api/restore', requireAuth, upload.single('backup'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }
    const data = JSON.parse(req.file.buffer.toString('utf-8'));
    if (!data.customers || data.transactions === undefined) {
      return res.status(400).json({ success: false, error: 'Invalid backup file format' });
    }
    await saveAllData(req.user.id, data);
    const newData = await getAllData(req.user.id);
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
