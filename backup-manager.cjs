const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, 'backups');

function ensureBaseDir() {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function userDir(userId) {
  return path.join(BACKUP_DIR, String(userId));
}

function metadataPath(userId) {
  return path.join(userDir(userId), 'metadata.json');
}

function _readMetadata(userId) {
  try {
    const p = metadataPath(userId);
    if (!fs.existsSync(p)) return [];
    const raw = fs.readFileSync(p, 'utf8');
    return JSON.parse(raw || '[]');
  } catch (err) {
    return [];
  }
}

function _writeMetadata(userId, arr) {
  ensureBaseDir();
  const dir = userDir(userId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(metadataPath(userId), JSON.stringify(arr, null, 2), 'utf8');
}

function listBackups(userId) {
  return _readMetadata(userId);
}

function findBackup(userId, backupId) {
  const meta = _readMetadata(userId);
  return meta.find(m => m.id === backupId) || null;
}

function getBackupFilePath(userId, backupId) {
  const entry = findBackup(userId, backupId);
  if (!entry) return null;
  return path.join(userDir(userId), entry.filename);
}

function createBackup(userId, payload, opts = {}) {
  ensureBaseDir();
  const dir = userDir(userId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const id = `${Date.now()}-${crypto.randomUUID()}`;
  const filename = `${id}.json.gz`;
  const filepath = path.join(dir, filename);

  const wrapper = {
    _meta: {
      id,
      createdAt: new Date().toISOString(),
      createdBy: opts.createdBy || null,
      note: opts.note || null,
    },
    data: payload,
  };

  const json = JSON.stringify(wrapper, null, 2);
  const gz = zlib.gzipSync(Buffer.from(json, 'utf8'));
  fs.writeFileSync(filepath, gz);

  const checksum = crypto.createHash('sha256').update(gz).digest('hex');
  const stat = fs.statSync(filepath);

  const meta = _readMetadata(userId);
  const entry = {
    id,
    filename,
    createdAt: wrapper._meta.createdAt,
    createdBy: wrapper._meta.createdBy,
    note: wrapper._meta.note,
    size: stat.size,
    checksum,
  };
  meta.push(entry);
  _writeMetadata(userId, meta);

  return entry;
}

function readBackupData(userId, backupId) {
  const file = getBackupFilePath(userId, backupId);
  if (!file || !fs.existsSync(file)) throw new Error('Backup not found');
  const gz = fs.readFileSync(file);
  const json = zlib.gunzipSync(gz).toString('utf8');
  const wrapper = JSON.parse(json);
  return wrapper;
}

function deleteBackup(userId, backupId) {
  const file = getBackupFilePath(userId, backupId);
  if (!file) return false;
  if (fs.existsSync(file)) fs.unlinkSync(file);
  const meta = _readMetadata(userId).filter(m => m.id !== backupId);
  _writeMetadata(userId, meta);
  return true;
}

/**
 * Keeps only the most recent maxCount backups for a user, deletes the rest.
 * Backups are sorted newest-first; anything beyond the maxCount position is removed.
 * Returns { pruned, kept } counts.
 */
function pruneToMaxCount(userId, maxCount) {
  const count = Number(maxCount) || 7;

  const meta = _readMetadata(userId);
  // Sort newest first
  const sorted = meta.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const kept = sorted.slice(0, count);
  const toDelete = sorted.slice(count);

  for (const entry of toDelete) {
    const filePath = path.join(userDir(userId), entry.filename);
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (err) {
      // File already gone — still remove from metadata
    }
  }

  if (toDelete.length > 0) {
    _writeMetadata(userId, kept);
  }

  return { pruned: toDelete.length, kept: kept.length };
}

module.exports = {
  ensureBaseDir,
  listBackups,
  findBackup,
  createBackup,
  getBackupFilePath,
  readBackupData,
  deleteBackup,
  pruneToMaxCount,
};
