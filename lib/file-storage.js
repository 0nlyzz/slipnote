'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// FileStorage instances that point at the same file share this queue. That
// keeps a load/change/save transaction intact inside one Node.js process.
const fileQueues = new Map();

function enqueue(filePath, task) {
  const previous = fileQueues.get(filePath) || Promise.resolve();
  const current = previous.catch(() => {}).then(task);
  let settled;
  settled = current.finally(() => {
    if (fileQueues.get(filePath) === settled) fileQueues.delete(filePath);
  });
  fileQueues.set(filePath, settled);
  return settled;
}

// Default storage backend: the whole note list lives in one JSON file.
// Fine for the scale this is meant for (a personal note channel between
// two parties) — swap in your own storage for anything bigger.
class FileStorage {
  constructor(filePath) {
    this.filePath = path.resolve(filePath || path.join(process.cwd(), '.slipnotes.json'));
  }

  async _loadUnlocked() {
    try {
      const raw = await fs.promises.readFile(this.filePath, 'utf8');
      const notes = JSON.parse(raw);
      if (!Array.isArray(notes)) {
        throw new Error('slipnote: storage file must contain a JSON array');
      }
      return notes;
    } catch (err) {
      if (err.code === 'ENOENT') return [];
      throw err;
    }
  }

  async _saveUnlocked(notes) {
    const dir = path.dirname(this.filePath);
    const tempPath = path.join(
      dir,
      `.${path.basename(this.filePath)}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`
    );

    await fs.promises.mkdir(dir, { recursive: true });
    try {
      await fs.promises.writeFile(tempPath, JSON.stringify(notes, null, 2));
      await fs.promises.rename(tempPath, this.filePath);
    } catch (err) {
      await fs.promises.unlink(tempPath).catch(() => {});
      throw err;
    }
  }

  async load() {
    return enqueue(this.filePath, () => this._loadUnlocked());
  }

  async save(notes) {
    return enqueue(this.filePath, () => this._saveUnlocked(notes));
  }

  // Atomic within one Node.js process, including across FileStorage instances
  // that point at the same path. Multi-process access requires a storage
  // backend with its own transaction or locking support.
  async update(mutator) {
    return enqueue(this.filePath, async () => {
      const notes = await this._loadUnlocked();
      const result = await mutator(notes);
      await this._saveUnlocked(notes);
      return result;
    });
  }
}

module.exports = { FileStorage };
