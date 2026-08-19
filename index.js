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
      reply: null,
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

  // Write on the back of a note — once. A note can only be replied to
  // after it's been read (you're writing on the back of a physical
  // thing you were handed) and only if nobody's written there yet. This
  // isn't a thread: the note is full once it has a reply.
  async function replyTo(id, content) {
    if (typeof content !== 'string' || !content.trim()) {
      throw new Error('slipnote: reply content must be a non-empty string');
    }
    const notes = await storage.load();
    const note = notes.find((n) => n.id === id);
    if (!note) throw new Error(`slipnote: no note with id ${id}`);
    if (!note.readAt) throw new Error('slipnote: cannot reply to a note that hasn\'t been read yet');
    if (note.reply) throw new Error('slipnote: this note already has a reply — the back is full');
    note.reply = {
      content,
      repliedAt: new Date().toISOString(),
      acknowledgedAt: null,
    };
    await storage.save(notes);
    return note;
  }

  // Side-effect-free peek at replies, optionally narrowed to ones the
  // original writer hasn't seen yet.
  async function replies({ unacknowledgedOnly = false } = {}) {
    const notes = await storage.load();
    const replied = notes.filter((n) => n.reply);
    return unacknowledgedOnly ? replied.filter((n) => !n.reply.acknowledgedAt) : replied;
  }

  // The original writer's half of the reply loop: call this from their
  // own wake-up/init routine to find out which notes got written back
  // on since last time. Marks replies acknowledged so they don't
  // resurface.
  async function pullReplies() {
    const notes = await storage.load();
    const newlyReplied = notes.filter((n) => n.reply && !n.reply.acknowledgedAt);
    if (newlyReplied.length === 0) return [];
    const now = new Date().toISOString();
    for (const n of newlyReplied) n.reply.acknowledgedAt = now;
    await storage.save(notes);
    return newlyReplied;
  }

  return {
    write,
    list,
    markRead,
    pull,
    receipts,
    pullReceipts,
    replyTo,
    replies,
    pullReplies,
  };
}

module.exports = { createSlipNote };
