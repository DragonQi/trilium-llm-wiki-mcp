// ETAPI entity types (camelCase, per TriliumNext ETAPI).

export type NoteType =
  | "text"
  | "code"
  | "render"
  | "file"
  | "image"
  | "search"
  | "relationMap"
  | "book"
  | "noteMap"
  | "mermaid"
  | "webView"
  | "shortcut"
  | "doc"
  | "contentWidget"
  | "launcher";

export type CreateNoteType =
  | "text"
  | "code"
  | "file"
  | "image"
  | "search"
  | "book"
  | "relationMap"
  | "render";

export type AttributeType = "label" | "relation";

export interface Note {
  noteId: string;
  isProtected: boolean;
  title: string;
  type: NoteType;
  mime: string;
  blobId?: string;
  dateCreated: string;
  dateModified: string;
  utcDateCreated: string;
  utcDateModified: string;
  parentNoteIds: string[];
  childNoteIds: string[];
  parentBranchIds: string[];
  childBranchIds: string[];
  attributes: Attribute[];
}

export interface Branch {
  branchId: string;
  noteId: string;
  parentNoteId: string;
  prefix: string;
  notePosition: number;
  isExpanded: boolean;
  utcDateModified: string;
}

export interface Attribute {
  attributeId: string;
  noteId: string;
  type: AttributeType;
  name: string;
  value: string;
  position: number;
  isInheritable: boolean;
  utcDateModified: string;
}

export interface AppInfo {
  appVersion: string;
  dbVersion: number;
  syncVersion: number;
  buildDate: string;
  buildRevision: string;
  dataDirectory: string;
  clipperProtocolVersion: string;
  utcDateTime: string;
}

export interface CreateNoteInput {
  parentNoteId: string;
  title: string;
  type: CreateNoteType;
  content: string;
  mime?: string;
  notePosition?: number;
  prefix?: string;
  noteId?: string;
  branchId?: string;
}

export interface CreateNoteResult {
  note: Note;
  branch: Branch;
}

export interface UpdateNoteInput {
  title?: string;
  type?: NoteType;
  mime?: string;
  dateCreated?: string;
  utcDateCreated?: string;
}

export interface CreateBranchInput {
  noteId: string;
  parentNoteId: string;
  notePosition?: number;
  prefix?: string;
  isExpanded?: boolean;
}

export interface CreateAttributeInput {
  noteId: string;
  type: AttributeType;
  name: string;
  value?: string;
  isInheritable?: boolean;
  position?: number;
}

export interface SearchNotesParams {
  search: string;
  fastSearch?: boolean;
  includeArchivedNotes?: boolean;
  ancestorNoteId?: string;
  ancestorDepth?: string; // e.g. "eq1", "lt3"
  orderBy?: string;
  orderDirection?: "asc" | "desc";
  limit?: number;
  debug?: boolean;
}

export interface EtapiErrorPayload {
  status: number;
  code: string;
  message: string;
}

// Composite: a node in a recursive subtree walk.
export interface SubtreeNode {
  note: Note;
  children: SubtreeNode[];
}
