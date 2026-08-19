'use strict';

const fs = require('fs');
const path = require('path');

// Default storage backend: the whole note list lives in one JSON file.
// Fine for the scale this is meant for (a personal note channel between
// two parties) — swap in your own storage for anything bigger.
class FileStorage {
  constructor(filePath) {
    this.filePath = filePath || path.join(process.cwd(), '.slipnotes.json');
  }

  async load() {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      return JSON.parse(raw);
    } catch (err) {
      if (err.code === 'ENOENT') return [];
      throw err;
    }
  }

  async save(notes) {
    const dir = path.dirname(this.filePath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(notes, null, 2));
  }
}

module.exports = { FileStorage };
