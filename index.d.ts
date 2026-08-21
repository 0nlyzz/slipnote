export interface SlipNoteReply {
  content: string;
  repliedAt: string;
  acknowledgedAt: string | null;
}

export interface Note {
  id: string;
  content: string;
  meta: Record<string, unknown>;
  createdAt: string;
  readAt: string | null;
  acknowledgedAt: string | null;
  reply: SlipNoteReply | null;
}

export interface SlipNoteStorage {
  load(): Promise<Note[]>;
  save(notes: Note[]): Promise<void>;
  update?<T>(mutator: (notes: Note[]) => T | Promise<T>): Promise<T>;
}

export interface CreateSlipNoteOptions {
  storage?: SlipNoteStorage;
  filePath?: string;
}

export interface SlipNote {
  write(content: string, meta?: Record<string, unknown>): Promise<Note>;
  list(options?: { unreadOnly?: boolean }): Promise<Note[]>;
  markRead(id: string): Promise<Note | null>;
  pull(): Promise<Note[]>;
  receipts(options?: { unacknowledgedOnly?: boolean }): Promise<Note[]>;
  pullReceipts(): Promise<Note[]>;
  replyTo(id: string, content: string): Promise<Note>;
  replies(options?: { unacknowledgedOnly?: boolean }): Promise<Note[]>;
  pullReplies(): Promise<Note[]>;
}

export class FileStorage implements SlipNoteStorage {
  constructor(filePath?: string);
  filePath: string;
  load(): Promise<Note[]>;
  save(notes: Note[]): Promise<void>;
  update<T>(mutator: (notes: Note[]) => T | Promise<T>): Promise<T>;
}

export function createSlipNote(options?: CreateSlipNoteOptions): SlipNote;
