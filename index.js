'use strict';

const crypto = require('crypto');

function createId() {
  return crypto.randomBytes(8).toString('hex');
}

/**
 * A slipnote store: leave a note now, someone finds it later — on their
 * own initiative. No push, no notification, no delivery guarantee.
 *
 * storage must implement: async load() -> Note[], async save(Note[]) -> void
 */
function createSlipNote({ storage } = {}) {
  if (!storage) {
    const { FileStorage } = require('./lib/file-storage');
    storage = new FileStorage();
  }

  async function write(content, meta = {}) {
    if (typeof content !== 'string' || !content.trim()) {
      throw new Error('slipnote: content must be a non-empty string');
    }
    const notes = await storage.load();
    const note = {
      id: createId(),
      content,
      meta,
      createdAt: new Date().toISOString(),
      readAt: null,
      acknowledgedAt: null,
    };
    notes.push(note);
    await storage.save(notes);
    return note;
  }

  // Side-effect-free peek. Use for admin/debug views, not for the
  // reader's actual "open the door" flow — that's pull().
  async function list({ unreadOnly = false } = {}) {
    const notes = await storage.load();
    return unreadOnly ? notes.filter((n) => !n.readAt) : notes;
  }

  async function markRead(id) {
    const notes = await storage.load();
    const note = notes.find((n) => n.id === id);
    if (note && !note.readAt) {
      note.readAt = new Date().toISOString();
      await storage.save(notes);
    }
    return note || null;
  }

  // The one call that means "the reader just opened the door themselves."
  // Only wire this to a deliberate user action (opening a panel, running
  // a command) — never to a poll loop or startup hook, or you've turned
  // this back into a push channel.
  async function pull() {
    const notes = await storage.load();
    const unread = notes.filter((n) => !n.readAt);
    if (unread.length === 0) return [];
    const now = new Date().toISOString();
    for (const n of unread) n.readAt = now;
    await storage.save(notes);
    return unread;
  }

  // Side-effect-free peek at the writer's side of the loop: notes that
  // have been read, optionally narrowed to ones the writer hasn't
  // acknowledged yet (i.e. doesn't know about yet).
  async function receipts({ unacknowledgedOnly = false } = {}) {
    const notes = await storage.load();
    const read = notes.filter((n) => n.readAt);
    return unacknowledgedOnly ? read.filter((n) => !n.acknowledgedAt) : read;
  }

  // The writer's half of the loop: call this from the writer's own
  // wake-up/init routine (not a poll loop) to find out which notes got
  // read since last time, and when. Marks them acknowledged so the same
  // receipt isn't surfaced twice.
  async function pullReceipts() {
    const notes = await storage.load();
    const newlyRead = notes.filter((n) => n.readAt && !n.acknowledgedAt);
    if (newlyRead.length === 0) return [];
    const now = new Date().toISOString();
    for (const n of newlyRead) n.acknowledgedAt = now;
    await storage.save(notes);
    return newlyRead;
  }

  return { write, list, markRead, pull, receipts, pullReceipts };
}

module.exports = { createSlipNote };
