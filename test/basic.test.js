'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const { createSlipNote } = require('../index');
const { FileStorage } = require('../lib/file-storage');

function tmpStore() {
  const file = path.join(
    os.tmpdir(),
    `slipnote-test-${Date.now()}-${Math.random().toString(16).slice(2)}.json`
  );
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
