'use strict';

const fs = require('fs');
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const { createSlipNote, FileStorage: ExportedFileStorage } = require('../index');
const { FileStorage } = require('../lib/file-storage');

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'slipnote-test-'));
let tempFileNumber = 0;

after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));

function tmpStore() {
  const file = path.join(tempRoot, `${tempFileNumber++}.json`);
  return new FileStorage(file);
}

test('write then pull returns the note and marks it read', async () => {
  const notes = createSlipNote({ storage: tmpStore() });
  await notes.write('hello');
  const first = await notes.pull();
  assert.equal(first.length, 1);
  assert.equal(first[0].content, 'hello');

  const second = await notes.pull();
  assert.equal(second.length, 0, 'already-read notes should not be pulled again');
});

test('list({ unreadOnly }) is side-effect free', async () => {
  const notes = createSlipNote({ storage: tmpStore() });
  await notes.write('peek me');
  const unread = await notes.list({ unreadOnly: true });
  assert.equal(unread.length, 1);

  const stillUnread = await notes.list({ unreadOnly: true });
  assert.equal(stillUnread.length, 1, 'list() must not mark notes as read');
});

test('write rejects empty content', async () => {
  const notes = createSlipNote({ storage: tmpStore() });
  await assert.rejects(() => notes.write(''));
  await assert.rejects(() => notes.write('   '));
});

test('markRead marks a specific note without touching others', async () => {
  const notes = createSlipNote({ storage: tmpStore() });
  const a = await notes.write('a');
  await notes.write('b');
  await notes.markRead(a.id);

  const all = await notes.list();
  const noteA = all.find((n) => n.id === a.id);
  const noteB = all.find((n) => n.id !== a.id);
  assert.ok(noteA.readAt);
  assert.equal(noteB.readAt, null);
});

test('meta is stored and returned as-is', async () => {
  const notes = createSlipNote({ storage: tmpStore() });
  await notes.write('with meta', { tag: 'private', mood: 'soft' });
  const [note] = await notes.list();
  assert.deepEqual(note.meta, { tag: 'private', mood: 'soft' });
});

test('pullReceipts reports notes read since last check, once', async () => {
  const notes = createSlipNote({ storage: tmpStore() });
  await notes.write('for the reader');
  await notes.pull(); // reader opens the door

  const receipts = await notes.pullReceipts(); // writer wakes up and checks
  assert.equal(receipts.length, 1);
  assert.ok(receipts[0].readAt);

  const again = await notes.pullReceipts();
  assert.equal(again.length, 0, 'an already-acknowledged receipt should not resurface');
});

test('receipts({ unacknowledgedOnly }) does not mark as acknowledged', async () => {
  const notes = createSlipNote({ storage: tmpStore() });
  await notes.write('for the reader');
  await notes.pull();

  const peek = await notes.receipts({ unacknowledgedOnly: true });
  assert.equal(peek.length, 1);
  const peekAgain = await notes.receipts({ unacknowledgedOnly: true });
  assert.equal(peekAgain.length, 1, 'receipts() must be side-effect free');
});

test('unread notes produce no receipts', async () => {
  const notes = createSlipNote({ storage: tmpStore() });
  await notes.write('still sitting there');
  const receipts = await notes.pullReceipts();
  assert.equal(receipts.length, 0);
});

test('replyTo writes once, on the back, after the note is read', async () => {
  const notes = createSlipNote({ storage: tmpStore() });
  const note = await notes.write('front of the note');
  await notes.pull();

  const replied = await notes.replyTo(note.id, 'back of the note');
  assert.equal(replied.reply.content, 'back of the note');
  assert.ok(replied.reply.repliedAt);
  assert.equal(replied.reply.acknowledgedAt, null);
});

test('replyTo refuses a second reply — the back is full', async () => {
  const notes = createSlipNote({ storage: tmpStore() });
  const note = await notes.write('front');
  await notes.pull();
  await notes.replyTo(note.id, 'first reply');

  await assert.rejects(() => notes.replyTo(note.id, 'second reply'));
});

test('replyTo refuses to write on an unread note', async () => {
  const notes = createSlipNote({ storage: tmpStore() });
  const note = await notes.write('never opened');
  await assert.rejects(() => notes.replyTo(note.id, 'too soon'));
});

test('pullReplies reports new replies once, for the original writer', async () => {
  const notes = createSlipNote({ storage: tmpStore() });
  const note = await notes.write('front');
  await notes.pull();
  await notes.replyTo(note.id, 'back');

  const first = await notes.pullReplies();
  assert.equal(first.length, 1);
  assert.equal(first[0].reply.content, 'back');

  const second = await notes.pullReplies();
  assert.equal(second.length, 0, 'an already-acknowledged reply should not resurface');
});

test('replies({ unacknowledgedOnly }) is side-effect free', async () => {
  const notes = createSlipNote({ storage: tmpStore() });
  const note = await notes.write('front');
  await notes.pull();
  await notes.replyTo(note.id, 'back');

  const peek = await notes.replies({ unacknowledgedOnly: true });
  assert.equal(peek.length, 1);
  const peekAgain = await notes.replies({ unacknowledgedOnly: true });
  assert.equal(peekAgain.length, 1, 'replies() must not mark as acknowledged');
});

test('concurrent writes through one instance do not lose notes', async () => {
  const notes = createSlipNote({ storage: tmpStore() });
  const contents = Array.from({ length: 20 }, (_, index) => `note-${index}`);

  await Promise.all(contents.map((content) => notes.write(content)));

  const stored = await notes.list();
  assert.deepEqual(stored.map((note) => note.content).sort(), contents.sort());
});

test('FileStorage serializes writes across instances sharing a path', async () => {
  const filePath = path.join(tempRoot, `${tempFileNumber++}.json`);
  const first = createSlipNote({ storage: new FileStorage(filePath) });
  const second = createSlipNote({ storage: new FileStorage(filePath) });

  await Promise.all([first.write('first'), second.write('second')]);

  const stored = await first.list();
  assert.deepEqual(stored.map((note) => note.content).sort(), ['first', 'second']);
});

test('concurrent pulls hand each note out only once', async () => {
  const notes = createSlipNote({ storage: tmpStore() });
  await notes.write('one door, one reader');

  const pulls = await Promise.all([notes.pull(), notes.pull()]);

  assert.deepEqual(pulls.map((result) => result.length).sort(), [0, 1]);
});

test('concurrent replies preserve the one-shot reply rule', async () => {
  const notes = createSlipNote({ storage: tmpStore() });
  const note = await notes.write('front');
  await notes.pull();

  const attempts = await Promise.allSettled([
    notes.replyTo(note.id, 'reply one'),
    notes.replyTo(note.id, 'reply two'),
  ]);

  assert.equal(attempts.filter((attempt) => attempt.status === 'fulfilled').length, 1);
  assert.equal(attempts.filter((attempt) => attempt.status === 'rejected').length, 1);
});

test('custom two-method storage is serialized within one instance', async () => {
  class SnapshotStorage {
    constructor() {
      this.notes = [];
    }

    async load() {
      await Promise.resolve();
      return structuredClone(this.notes);
    }

    async save(notes) {
      await Promise.resolve();
      this.notes = structuredClone(notes);
    }
  }

  const notes = createSlipNote({ storage: new SnapshotStorage() });
  await Promise.all([notes.write('a'), notes.write('b')]);

  assert.equal((await notes.list()).length, 2);
});

test('filePath is a shortcut for the exported FileStorage backend', async () => {
  const filePath = path.join(tempRoot, `${tempFileNumber++}.json`);
  const notes = createSlipNote({ filePath });
  await notes.write('placed explicitly');

  assert.equal(ExportedFileStorage, FileStorage);
  assert.equal((await new FileStorage(filePath).load())[0].content, 'placed explicitly');
  assert.throws(
    () => createSlipNote({ storage: new FileStorage(filePath), filePath }),
    /either storage or filePath/
  );
});

test('invalid custom storage fails with an actionable error', () => {
  assert.throws(
    () => createSlipNote({ storage: {} }),
    /storage must implement async load\(\) and save\(notes\)/
  );
});
