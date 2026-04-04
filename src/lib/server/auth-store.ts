import { createId, createDigitsCode } from "./ids";
import { listMembershipsForAccount, type MembershipView, getBlogByPlatformGroup, getBlogBySlug } from "./blog-store";
import { hashBindCode, hashPassword, hashSessionToken, constantTimeEqualHex, createPasswordSalt, createSessionToken, getBindChallengeTtlSeconds, getSessionTtlSeconds } from "./security";
import { addSeconds, nowIso } from "./runtime-time";
import { requireBlogDatabase } from "./storage";
import type { RuntimeEnv } from "./runtime-env";

export interface AccountRecord {
  id: string;
  platform: string;
  account_uid: string;
  qq_number: string;
  password_hash: string;
  password_salt: string;
  created_at: string;
  updated_at: string;
}

export interface BindChallengeRecord {
  id: string;
  blog_id: string;
  qq_number: string;
  bind_code_hash: string;
  expires_at: string;
  verified_at: string | null;
  verified_by_qq: string | null;
  consumed_at: string | null;
  created_at: string;
}

export interface SessionRecord {
  id: string;
  account_id: string;
  session_token_hash: string;
  user_agent: string | null;
  ip_address: string | null;
  created_at: string;
  expires_at: string;
  last_seen_at: string;
}

export interface AuthSessionView {
  account: Pick<AccountRecord, "id" | "platform" | "account_uid" | "created_at"> & {
    qq_number: string;
  };
  memberships: MembershipView[];
  session: Pick<SessionRecord, "id" | "expires_at" | "last_seen_at">;
}

function requireBindCallbackSecret(env: RuntimeEnv): string {
  if (!env.BIND_CALLBACK_SECRET) {
    throw new Error("BIND_CALLBACK_SECRET is not configured");
  }

  return env.BIND_CALLBACK_SECRET;
}

function requireSessionSecret(env: RuntimeEnv): string {
  if (!env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET is not configured");
  }

  return env.SESSION_SECRET;
}

function requirePasswordPepper(env: RuntimeEnv): string {
  return env.PASSWORD_PEPPER ?? "";
}

function buildAccountStorageKey(platform: string, accountId: string): string {
  return `${platform}:${accountId}`;
}

export async function getAccountByPlatformAccountId(
  env: RuntimeEnv,
  platform: string,
  accountId: string,
): Promise<AccountRecord | null> {
  const db = requireBlogDatabase(env);
  return (await db
    .prepare(
      `SELECT id, platform, account_uid, qq_number, password_hash, password_salt, created_at, updated_at
       FROM accounts
       WHERE platform = ?1
         AND account_uid = ?2
       LIMIT 1`,
    )
    .bind(platform, accountId)
    .first<AccountRecord>()) ?? null;
}

export async function createBindChallenge(
  env: RuntimeEnv,
  blogSlug: string,
  qqNumber: string,
): Promise<{
  blog: NonNullable<Awaited<ReturnType<typeof getBlogBySlug>>>;
  bindCode: string;
  expiresAt: string;
}> {
  const db = requireBlogDatabase(env);
  const bindSecret = requireBindCallbackSecret(env);
  const blog = await getBlogBySlug(env, blogSlug);

  if (!blog) {
    throw new Error("Blog not found");
  }

  const bindCode = createDigitsCode(6);
  const currentTime = nowIso();
  const expiresAt = addSeconds(currentTime, getBindChallengeTtlSeconds());

  await db
    .prepare(
      `INSERT INTO bind_challenges (
         id, blog_id, qq_number, bind_code_hash, expires_at, verified_at, verified_by_qq, consumed_at, created_at
       ) VALUES (?1, ?2, ?3, ?4, ?5, NULL, NULL, NULL, ?6)`,
    )
    .bind(
      createId("bind"),
      blog.id,
      qqNumber,
      await hashBindCode(bindSecret, blog.id, qqNumber, bindCode),
      expiresAt,
      currentTime,
    )
    .run();

  return {
    blog,
    bindCode,
    expiresAt,
  };
}

export async function verifyBindChallengeFromBot(
  env: RuntimeEnv,
  input: {
    platform: string;
    groupId: string;
    qqNumber: string;
    bindCode: string;
  },
): Promise<{
  blog: NonNullable<Awaited<ReturnType<typeof getBlogByPlatformGroup>>>;
  challenge: BindChallengeRecord;
}> {
  const db = requireBlogDatabase(env);
  const bindSecret = requireBindCallbackSecret(env);
  const blog = await getBlogByPlatformGroup(env, input.platform, input.groupId);

  if (!blog) {
    throw new Error("Blog not found");
  }

  const bindCodeHash = await hashBindCode(
    bindSecret,
    blog.id,
    input.qqNumber,
    input.bindCode,
  );

  const challenge = await db
    .prepare(
      `SELECT id, blog_id, qq_number, bind_code_hash, expires_at, verified_at, verified_by_qq, consumed_at, created_at
       FROM bind_challenges
       WHERE blog_id = ?1
         AND qq_number = ?2
         AND bind_code_hash = ?3
       ORDER BY created_at DESC
       LIMIT 1`,
    )
    .bind(blog.id, input.qqNumber, bindCodeHash)
    .first<BindChallengeRecord>();

  if (!challenge) {
    throw new Error("Bind challenge not found");
  }

  const currentTime = nowIso();
  if (challenge.consumed_at) {
    return { blog, challenge };
  }

  if (Date.parse(challenge.expires_at) < Date.parse(currentTime)) {
    throw new Error("Bind challenge expired");
  }

  if (!challenge.verified_at) {
    await db
      .prepare(
        `UPDATE bind_challenges
         SET verified_at = ?1,
             verified_by_qq = ?2
         WHERE id = ?3`,
      )
      .bind(currentTime, input.qqNumber, challenge.id)
      .run();
  }

  return {
    blog,
    challenge: {
      ...challenge,
      verified_at: challenge.verified_at ?? currentTime,
      verified_by_qq: challenge.verified_by_qq ?? input.qqNumber,
    },
  };
}

async function ensureMembership(
  env: RuntimeEnv,
  accountId: string,
  blogId: string,
): Promise<void> {
  const db = requireBlogDatabase(env);
  const existing = await db
    .prepare(
      `SELECT id
       FROM memberships
       WHERE account_id = ?1 AND blog_id = ?2
       LIMIT 1`,
    )
    .bind(accountId, blogId)
    .first<{ id: string }>();

  if (existing) {
    return;
  }

  await db
    .prepare(
      `INSERT INTO memberships (id, account_id, blog_id, role, bound_at)
       VALUES (?1, ?2, ?3, 'viewer', ?4)`,
    )
    .bind(createId("membership"), accountId, blogId, nowIso())
    .run();
}

async function createAccount(
  env: RuntimeEnv,
  platform: string,
  accountId: string,
  password: string,
): Promise<AccountRecord> {
  const db = requireBlogDatabase(env);
  const currentTime = nowIso();
  const passwordSalt = createPasswordSalt();
  const passwordHash = await hashPassword(
    password,
    passwordSalt,
    requirePasswordPepper(env),
  );

  const account: AccountRecord = {
    id: createId("account"),
    platform,
    account_uid: accountId,
    qq_number: buildAccountStorageKey(platform, accountId),
    password_hash: passwordHash,
    password_salt: passwordSalt,
    created_at: currentTime,
    updated_at: currentTime,
  };

  await db
    .prepare(
      `INSERT INTO accounts (
         id, platform, account_uid, qq_number, password_hash, password_salt, created_at, updated_at
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
    )
    .bind(
      account.id,
      account.platform,
      account.account_uid,
      account.qq_number,
      account.password_hash,
      account.password_salt,
      account.created_at,
      account.updated_at,
    )
    .run();

  return account;
}

export async function verifyPassword(
  env: RuntimeEnv,
  account: AccountRecord,
  password: string,
): Promise<boolean> {
  const candidateHash = await hashPassword(
    password,
    account.password_salt,
    requirePasswordPepper(env),
  );
  return constantTimeEqualHex(candidateHash, account.password_hash);
}

export async function createSessionForAccount(
  env: RuntimeEnv,
  accountId: string,
  metadata: {
    userAgent: string | null;
    ipAddress: string | null;
  },
): Promise<{
  token: string;
  session: SessionRecord;
}> {
  const db = requireBlogDatabase(env);
  const sessionSecret = requireSessionSecret(env);
  const token = createSessionToken();
  const currentTime = nowIso();
  const expiresAt = addSeconds(currentTime, getSessionTtlSeconds());
  const session: SessionRecord = {
    id: createId("session"),
    account_id: accountId,
    session_token_hash: await hashSessionToken(sessionSecret, token),
    user_agent: metadata.userAgent,
    ip_address: metadata.ipAddress,
    created_at: currentTime,
    expires_at: expiresAt,
    last_seen_at: currentTime,
  };

  await db
    .prepare(
      `INSERT INTO sessions (
         id, account_id, session_token_hash, user_agent, ip_address, created_at, expires_at, last_seen_at
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
    )
    .bind(
      session.id,
      session.account_id,
      session.session_token_hash,
      session.user_agent,
      session.ip_address,
      session.created_at,
      session.expires_at,
      session.last_seen_at,
    )
    .run();

  return { token, session };
}

export async function getSessionFromToken(
  env: RuntimeEnv,
  sessionToken: string,
): Promise<AuthSessionView | null> {
  const db = requireBlogDatabase(env);
  const sessionSecret = requireSessionSecret(env);
  const sessionTokenHash = await hashSessionToken(sessionSecret, sessionToken);
  const currentTime = nowIso();

  const row = await db
    .prepare(
      `SELECT
         sessions.id,
         sessions.account_id,
         sessions.session_token_hash,
         sessions.user_agent,
         sessions.ip_address,
         sessions.created_at,
         sessions.expires_at,
         sessions.last_seen_at,
         accounts.platform,
         accounts.account_uid,
         accounts.created_at AS account_created_at
       FROM sessions
       INNER JOIN accounts ON accounts.id = sessions.account_id
       WHERE sessions.session_token_hash = ?1
       LIMIT 1`,
    )
    .bind(sessionTokenHash)
    .first<
      SessionRecord & {
        platform: string;
        account_uid: string;
        account_created_at: string;
      }
    >();

  if (!row) {
    return null;
  }

  if (Date.parse(row.expires_at) < Date.parse(currentTime)) {
    await db
      .prepare(`DELETE FROM sessions WHERE id = ?1`)
      .bind(row.id)
      .run();
    return null;
  }

  await db
    .prepare(
      `UPDATE sessions
       SET last_seen_at = ?1
       WHERE id = ?2`,
    )
    .bind(currentTime, row.id)
    .run();

  const memberships = await listMembershipsForAccount(env, row.account_id);
  return {
    account: {
      id: row.account_id,
      platform: row.platform,
      account_uid: row.account_uid,
      qq_number: row.account_uid,
      created_at: row.account_created_at,
    },
    memberships,
    session: {
      id: row.id,
      expires_at: row.expires_at,
      last_seen_at: currentTime,
    },
  };
}

export async function invalidateSessionToken(
  env: RuntimeEnv,
  sessionToken: string,
): Promise<void> {
  const db = requireBlogDatabase(env);
  const sessionSecret = requireSessionSecret(env);

  await db
    .prepare(`DELETE FROM sessions WHERE session_token_hash = ?1`)
    .bind(await hashSessionToken(sessionSecret, sessionToken))
    .run();
}

export async function finalizeBindChallenge(
  env: RuntimeEnv,
  input: {
    blogSlug: string;
    qqNumber: string;
    password: string | null;
    currentSession: AuthSessionView | null;
    userAgent: string | null;
    ipAddress: string | null;
  },
): Promise<{
  authSession: AuthSessionView;
  sessionToken: string;
}> {
  const db = requireBlogDatabase(env);
  const blog = await getBlogBySlug(env, input.blogSlug);
  if (!blog) {
    throw new Error("Blog not found");
  }

  const challenge = await db
    .prepare(
      `SELECT id, blog_id, qq_number, bind_code_hash, expires_at, verified_at, verified_by_qq, consumed_at, created_at
       FROM bind_challenges
       WHERE blog_id = ?1
         AND qq_number = ?2
         AND verified_at IS NOT NULL
         AND consumed_at IS NULL
       ORDER BY verified_at DESC, created_at DESC
       LIMIT 1`,
    )
    .bind(blog.id, input.qqNumber)
    .first<BindChallengeRecord>();

  if (!challenge) {
    throw new Error("No verified bind challenge found");
  }

  const currentTime = nowIso();
  if (Date.parse(challenge.expires_at) < Date.parse(currentTime)) {
    throw new Error("Bind challenge expired");
  }

  let account: AccountRecord | null = null;

  if (input.currentSession) {
    if (
      input.currentSession.account.platform !== blog.platform ||
      input.currentSession.account.qq_number !== input.qqNumber
    ) {
      throw new Error("Current session does not match bind QQ");
    }

    account = await getAccountByPlatformAccountId(
      env,
      blog.platform,
      input.qqNumber,
    );
  } else {
    if (!input.password) {
      throw new Error("Password is required");
    }

    const existingAccount = await getAccountByPlatformAccountId(
      env,
      blog.platform,
      input.qqNumber,
    );
    if (existingAccount) {
      const isValid = await verifyPassword(env, existingAccount, input.password);
      if (!isValid) {
        throw new Error("Invalid password");
      }
      account = existingAccount;
    } else {
      account = await createAccount(
        env,
        blog.platform,
        input.qqNumber,
        input.password,
      );
    }
  }

  if (!account) {
    throw new Error("Account resolution failed");
  }

  await ensureMembership(env, account.id, blog.id);

  await db
    .prepare(
      `UPDATE bind_challenges
       SET consumed_at = ?1
       WHERE id = ?2`,
    )
    .bind(currentTime, challenge.id)
    .run();

  const { token, session } = await createSessionForAccount(env, account.id, {
    userAgent: input.userAgent,
    ipAddress: input.ipAddress,
  });
  const memberships = await listMembershipsForAccount(env, account.id);

  return {
    authSession: {
      account: {
        id: account.id,
        platform: account.platform,
        account_uid: account.account_uid,
        qq_number: account.account_uid,
        created_at: account.created_at,
      },
      memberships,
      session: {
        id: session.id,
        expires_at: session.expires_at,
        last_seen_at: session.last_seen_at,
      },
    },
    sessionToken: token,
  };
}
