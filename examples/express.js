'use strict';

// Minimal HTTP wiring. Requires express (not a slipnote dependency —
// install it yourself if you run this example: npm install express).
const express = require('express');
const { createSlipNote } = require('../index');

const app = express();
app.use(express.json());
const notes = createSlipNote();

// The writer side: your agent calls this whenever it wants to leave a
// thought without interrupting anyone.
app.post('/slipnotes', async (req, res) => {
  const { content, meta } = req.body;
  const note = await notes.write(content, meta);
  res.json(note);
});

// The reader side: wire this to a button/panel the user opens on their
// own — NOT to page load, NOT to a poll loop. That's the whole point.
app.get('/slipnotes/pull', async (req, res) => {
  const unread = await notes.pull();
  res.json(unread);
});

// The writer side, other half: the agent calls this from its own
// wake-up routine to learn which notes got read since last time, and
// when. Not triggered by the user.
app.get('/slipnotes/receipts', async (req, res) => {
  const readSinceLastCheck = await notes.pullReceipts();
  res.json(readSinceLastCheck);
});

// The reader side, optional: write on the back of a note, once, after
// reading it. Wire to a UI action, same as pull.
app.post('/slipnotes/:id/reply', async (req, res) => {
  const { content } = req.body;
  try {
    const note = await notes.replyTo(req.params.id, content);
    res.json(note);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// The original writer side, other half: find out a reply showed up.
// Same deliberate-check-not-poll rule as receipts.
app.get('/slipnotes/replies', async (req, res) => {
  const newReplies = await notes.pullReplies();
  res.json(newReplies);
});

app.listen(3000, () => console.log('slipnote example listening on :3000'));
