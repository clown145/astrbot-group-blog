type D1Value =
  | string
  | number
  | boolean
  | null
  | ArrayBuffer
  | Uint8Array;

export interface D1PreparedStatement {
  bind(...values: D1Value[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(columnName?: string): Promise<T | null>;
  run(): Promise<unknown>;
  all<T = Record<string, unknown>>(): Promise<{
    results: T[];
  }>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<T[]>;
}

export interface R2Bucket {
  get(key: string): Promise<R2ObjectBody | null>;
  put(
    key: string,
    value: string | ArrayBuffer | Uint8Array,
    options?: {
      httpMetadata?: {
        contentType?: string;
      };
      customMetadata?: Record<string, string>;
    },
  ): Promise<void>;
}

export interface R2ObjectBody {
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
  json<T>(): Promise<T>;
}

export interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    options?: {
      expirationTtl?: number;
    },
  ): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface RuntimeEnv {
  BLOG_DB?: D1Database;
  BLOG_CACHE?: KVNamespace;
  BLOG_ARCHIVE?: R2Bucket;
  INGEST_SHARED_TOKEN?: string;
  BIND_CALLBACK_SECRET?: string;
  SESSION_SECRET?: string;
  PASSWORD_PEPPER?: string;
  TEMPLATE_REPO_URL?: string;
  TEMPLATE_REPO_BRANCH?: string;
  TEMPLATE_REPO_SUBDIR?: string;
}

export function getRuntimeEnv(locals: {
  runtime?: {
    env?: RuntimeEnv;
  };
}): RuntimeEnv {
  return (locals.runtime?.env ?? {}) as RuntimeEnv;
}
