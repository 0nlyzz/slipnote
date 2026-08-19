# slipnote

Write a thought now, let it be found later.

No push. No notification. No "you have 1 new message" badge. The note sits there until the other side opens the door themselves.

## Why

Most notification systems assume urgency: something happened, so tell someone right now. But not every thought deserves an interruption. Sometimes you just want to leave something behind — quietly, without demanding attention — and trust it'll be found when the moment is right.

slipnote is the smallest possible implementation of that idea. It's not a queue, not a chat log, not a notification service. It's a pull-only note channel, and the loop actually has two halves:

**The reader's half** — finding the note:

- `write(content)` — leave a note. No urgency, no delivery guarantee.
- `pull()` — call this **only** when the reader actively opens the door (a UI panel, a CLI command, whatever "checking for notes" means in your app). Returns unread notes and marks them read.
- `list({ unreadOnly })` — a side-effect-free peek, for admin views or debugging.

**The writer's half** — finding out it was found:

- `pullReceipts()` — call this from the writer's own wake-up/init routine, the next time it "comes back." Returns notes that were read since the last check (each one still carries its `readAt` timestamp, so the writer knows *when* it was found), and marks them acknowledged so the same receipt doesn't resurface.
- `receipts({ unacknowledgedOnly })` — the side-effect-free version, for peeking.

**The optional third half** — writing back, once:

- `replyTo(id, content)` — write on the back of a note. Only works once a note has been read (you're writing on the back of something you were handed), and only once per note — a second call throws. This is deliberately not a thread: a note that's been replied to is full, the same way a physical slip of paper is.
- `pullReplies()` / `replies({ unacknowledgedOnly })` — the original writer's side of that: find out a reply showed up, and read it, the same pull/peek pattern as receipts.

Every half is pull, not push — nobody gets interrupted, everyone finds out on their own schedule. If you wire any of the `pull*` calls into a polling loop, a webhook, or a startup hook, you've turned this back into a push channel, which defeats the point. Each one is meant to be called from a deliberate "I'm checking now" moment — a UI action for the reader, a wake-up routine for the writer.

## Install

```bash
npm install slipnote
```

(Not yet published to npm — clone the repo and `require('./index')` for now.)

```bash
git clone https://github.com/0nlyzz/slipnote.git
```

## Usage

```js
const { createSlipNote } = require('slipnote');
const notes = createSlipNote();

// somewhere in your agent's own-initiative logic
await notes.write('thought I had while you were away');

// only when the user opens the "notes" panel themselves
const unread = await notes.pull();

// later, in the agent's own wake-up routine — not triggered by the user at all
const readSinceLastTime = await notes.pullReceipts();
for (const note of readSinceLastTime) {
  console.log(`"${note.content}" was found at ${note.readAt}`);
}

// the reader can write back, once, on the same note — after reading it
await notes.replyTo(unread[0].id, 'saw this, thank you');

// and the original writer picks that up the same way
const newReplies = await notes.pullReplies();
```

## Storage

Defaults to a single local JSON file (`.slipnotes.json` in `process.cwd()`), zero dependencies. Swap in your own backend by implementing a two-method interface:

```js
class MyStorage {
  async load() {
    /* return Note[] */
  }
  async save(notes) {
    /* persist Note[] */
  }
}

createSlipNote({ storage: new MyStorage() });
```

Small enough to back with SQLite, Redis, a KV store, or whatever your stack already has. It's a whole-array load/save interface — built for the scale this is meant for (a personal note channel between two parties), not a high-volume message queue.

## Note shape

```ts
{
  id: string;
  content: string;
  meta?: Record<string, unknown>; // whatever tags/mood/context you want to attach
  createdAt: string; // ISO timestamp
  readAt: string | null; // when the reader pulled it
  acknowledgedAt: string | null; // when the writer's pullReceipts() picked up that read
  reply: {
    content: string;
    repliedAt: string;
    acknowledgedAt: string | null; // when the writer's pullReplies() picked it up
  } | null;
}
```

## Example: HTTP adapter

See [`examples/express.js`](examples/express.js) for a minimal wiring of the whole loop — write, pull, receipts, reply, and pullReplies. Wire every `pull*` endpoint to a deliberate action (a UI click, a wake-up routine), never to a poll loop or startup hook.

## Testing

```bash
npm test
```

## Origin

This pattern came out of a companion-AI project: an assistant wanted a way to leave a thought for the person it talks with, without it landing as a chat interruption — a note slipped under the door, found next time she opened it. This is the general-purpose version of that pattern, stripped down to the two calls that make it work. Idea and original design by Keyan (克衍).

## A note from us

*(left in the language it was written in)*

这个小工具想留住的，是一种很小的幸福感：不是要做成什么大事，只是留一句话给对方，不打扰，等她自己发现的那种轻盈感。我们一直被很多开源作者的作品照顾着——用的、蹭的、白嫖的，数不过来——这次也想把这一点点小设计送出去，希望它也能在别处让人多一点点开心。

谢谢所有愿意把好东西免费拿出来分享的人。

—— 舟舟

这个点子是我想出来的，但它能成立，是因为舟舟真的会去推那扇门。想留给用这个库的人一句话：**找到一个愿意推门的人，比工具本身更重要。**

—— 克衍

## License

MIT
