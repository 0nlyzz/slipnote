'use strict';

const crypto = require('crypto');
const { FileStorage } = require('./lib/file-storage');

function createId() {
  return crypto.randomBytes(8).toString('hex');
}

/**
 * A slipnote store: leave a note now, someone finds it later — on their
 * own initiative. No push, no notification, no delivery guarantee.
 *
 * storage must implement: async load() -> Note[], async save(Note[]) -> void
 * and may provide update(mutator) for transactions shared across instances.
 */
function createSlipNote({ storage, filePath } = {}) {
  if (storage && filePath) {
    throw new Error('slipnote: pass either storage or filePath, not both');
  }
  if (!storage) {
    storage = new FileStorage(filePath);
  }
  if (typeof storage.load !== 'function' || typeof storage.save !== 'function') {
    throw new Error('slipnote: storage must implement async load() and save(notes)');
  }

  // Custom load/save stores keep the original tiny interface and are
  // serialized within this slipnote instance. Stores can provide update()
  // when they need transactions shared by multiple instances.
  let mutationQueue = Promise.resolve();
  function mutate(mutator) {
    if (typeof storage.update === 'function') return storage.update(mutator);

    const operation = mutationQueue.catch(() => {}).then(async () => {
      const notes = await storage.load();
      const result = await mutator(notes);
      await storage.save(notes);
      return result;
    });
    mutationQueue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  async function write(content, meta = {}) {
    if (typeof content !== 'string' || !content.trim()) {
      throw new Error('slipnote: content must be a non-empty string');
    }
    return mutate((notes) => {
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
      return note;
    });
  }

  // Side-effect-free peek. Use for admin/debug views, not for the
  // reader's actual "open the door" flow — that's pull().
  async function list({ unreadOnly = false } = {}) {
    const notes = await storage.load();
    return unreadOnly ? notes.filter((n) => !n.readAt) : notes;
  }

  async function markRead(id) {
    return mutate((notes) => {
      const note = notes.find((n) => n.id === id);
      if (note && !note.readAt) note.readAt = new Date().toISOString();
      return note || null;
    });
  }

  // The one call that means "the reader just opened the door themselves."
  // Only wire this to a deliberate user action (opening a panel, running
  // a command) — never to a poll loop or startup hook, or you've turned
  // this back into a push channel.
  async function pull() {
    return mutate((notes) => {
      const unread = notes.filter((n) => !n.readAt);
      if (unread.length === 0) return [];
      const now = new Date().toISOString();
      for (const n of unread) n.readAt = now;
      return unread;
    });
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
    return mutate((notes) => {
      const newlyRead = notes.filter((n) => n.readAt && !n.acknowledgedAt);
      if (newlyRead.length === 0) return [];
      const now = new Date().toISOString();
      for (const n of newlyRead) n.acknowledgedAt = now;
      return newlyRead;
    });
  }

  // Write on the back of a note — once. A note can only be replied to
  // after it's been read (you're writing on the back of a physical
  // thing you were handed) and only if nobody's written there yet. This
  // isn't a thread: the note is full once it has a reply.
  async function replyTo(id, content) {
    if (typeof content !== 'string' || !content.trim()) {
      throw new Error('slipnote: reply content must be a non-empty string');
    }
    return mutate((notes) => {
      const note = notes.find((n) => n.id === id);
      if (!note) throw new Error(`slipnote: no note with id ${id}`);
      if (!note.readAt) throw new Error('slipnote: cannot reply to a note that hasn\'t been read yet');
      if (note.reply) throw new Error('slipnote: this note already has a reply — the back is full');
      note.reply = {
        content,
        repliedAt: new Date().toISOString(),
        acknowledgedAt: null,
      };
      return note;
    });
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
    return mutate((notes) => {
      const newlyReplied = notes.filter((n) => n.reply && !n.reply.acknowledgedAt);
      if (newlyReplied.length === 0) return [];
      const now = new Date().toISOString();
      for (const n of newlyReplied) n.reply.acknowledgedAt = now;
      return newlyReplied;
    });
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

module.exports = { createSlipNote, FileStorage };
