import { database, ensureSchema, type Database } from '../../../lib/database';

export const dynamic = 'force-dynamic';

type UserRow = { id: number; name: string; email: string; role: 'student' | 'club' | 'admin'; club_name: string | null; approved: number };
type EventInput = { title: string; food: string; location: string; starts_at: string; ends_at: string; details: string };
const encoder = new TextEncoder();
const cookieName = 'campus_session';
const sessionSeconds = 60 * 60 * 24 * 7;

function json(data: unknown, status = 200, headers?: HeadersInit) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

function error(message: string, status: number) { return json({ error: message }, status); }
function hex(bytes: Uint8Array) { return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join(''); }
function unhex(value: string) { return Uint8Array.from(value.match(/.{1,2}/g)?.map(part => parseInt(part, 16)) || []); }

async function digest(value: string) {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))));
}

async function hashPassword(password: string, salt = hex(crypto.getRandomValues(new Uint8Array(16)))) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: unhex(salt), iterations: 100000, hash: 'SHA-256' }, key, 256);
  return `${salt}:${hex(new Uint8Array(bits))}`;
}

async function checkPassword(password: string, stored: string) {
  const [salt, expected] = stored.split(':');
  if (!salt || !expected) return false;
  return (await hashPassword(password, salt)).split(':')[1] === expected;
}

function campusEmail(value: string) { return /^[^\s@]+@calpoly\.edu$/i.test(value); }
function publicUser(user: UserRow | null) {
  return user && { id: user.id, name: user.name, email: user.email, role: user.role, club_name: user.club_name, approved: Boolean(user.approved) };
}

async function ensureDemoAdmin(db: Database) {
  const existing = await db.prepare("SELECT id FROM users WHERE role='admin' LIMIT 1").first();
  if (existing) return;
  const email = (process.env.ADMIN_EMAIL || 'admin@calpoly.edu').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || 'password';
  if (!campusEmail(email) || password.length < 8)
    throw new Error('ADMIN_EMAIL must be @calpoly.edu and ADMIN_PASSWORD must have 8+ characters.');
  await db.prepare('INSERT OR IGNORE INTO users (name,email,password_hash,role,club_name,approved) VALUES (?,?,?,?,?,?)')
    .bind('Campus Admin', email, await hashPassword(password), 'admin', null, 1).run();
}

function sessionToken(request: Request) {
  const cookie = request.headers.get('cookie')?.split(';').map(part => part.trim()).find(part => part.startsWith(`${cookieName}=`));
  return cookie?.slice(cookieName.length + 1) || null;
}

async function readUser(request: Request, db: Database) {
  const token = sessionToken(request);
  if (!token) return null;
  const user = await db.prepare(`SELECT u.id,u.name,u.email,u.role,u.club_name,u.approved FROM sessions s
    JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?`)
    .bind(await digest(token), new Date().toISOString()).first<UserRow>();
  return user && campusEmail(user.email) ? user : null;
}

async function createSession(db: Database, userId: number) {
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  const expiresAt = new Date(Date.now() + sessionSeconds * 1000).toISOString();
  await db.prepare('INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,?)')
    .bind(await digest(token), userId, expiresAt).run();
  return `${cookieName}=${token}; HttpOnly; Secure; SameSite=Lax; Max-Age=${sessionSeconds}; Path=/`;
}

function validId(value: string | undefined) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function validateEvent(body: Record<string, unknown>) {
  const data: EventInput = {
    title: String(body.title || '').trim(), food: String(body.food || '').trim(),
    location: String(body.location || '').trim(), starts_at: String(body.starts_at || ''),
    ends_at: String(body.ends_at || ''), details: String(body.details || '').trim(),
  };
  if (!data.title || !data.food || !data.location) return { error: 'Title, food, and location are required.' };
  if (data.title.length > 100 || data.food.length > 160 || data.location.length > 120 || data.details.length > 500)
    return { error: 'One or more fields are too long.' };
  const start = Date.parse(data.starts_at), end = Date.parse(data.ends_at);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return { error: 'Enter a valid start and end time.' };
  data.starts_at = new Date(start).toISOString();
  data.ends_at = new Date(end).toISOString();
  return { data };
}

const selectEvents = `SELECT e.*,u.club_name,u.approved AS verified,
  (SELECT COUNT(*) FROM rsvps r WHERE r.event_id=e.id) AS going_count
  FROM events e JOIN users u ON u.id=e.club_id`;

async function getEvent(db: Database, id: number) {
  return db.prepare(`${selectEvents} WHERE e.id=?`).bind(id).first<Record<string, unknown>>();
}

async function handle(request: Request, path: string[]) {
  await ensureSchema();
  const db = database();
  await ensureDemoAdmin(db);
  const method = request.method;
  const route = path.join('/');
  if (route === 'auth/me') {
    return json({ user: publicUser(await readUser(request, db)) });
  }
  const needsBody = method === 'PUT' || method === 'PATCH' ||
    (method === 'POST' && (route === 'auth/register' || route === 'auth/login' || route === 'events'));
  let body: Record<string, unknown> = {};
  if (needsBody) {
    const parsed = await request.json().catch(() => null);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return error('Provide valid JSON.', 400);
    body = parsed as Record<string, unknown>;
  }

  if (route === 'auth/register' && method === 'POST') {
    const name = String(body!.name || '').trim();
    const email = String(body!.email || '').trim().toLowerCase();
    const password = String(body!.password || '');
    const role = body!.role === 'club' ? 'club' : 'student';
    const clubName = role === 'club' ? String(body!.club_name || '').trim() : null;
    if (!name || !campusEmail(email) || password.length < 8 || (role === 'club' && !clubName))
      return error('Use a @calpoly.edu email, a name, a password of 8+ characters, and a club name if applicable.', 400);
    if (name.length > 80 || email.length > 160 || (clubName && clubName.length > 100))
      return error('One or more fields are too long.', 400);
    if (await db.prepare('SELECT 1 FROM users WHERE email=?').bind(email).first())
      return error('An account with that email already exists.', 409);
    const result = await db.prepare('INSERT INTO users (name,email,password_hash,role,club_name,approved) VALUES (?,?,?,?,?,?)')
      .bind(name, email, await hashPassword(password), role, clubName, role === 'student' ? 1 : 0).run();
    const user = await db.prepare('SELECT id,name,email,role,club_name,approved FROM users WHERE id=?')
      .bind(result.meta.last_row_id).first<UserRow>();
    return json({ user: publicUser(user) }, 201, { 'Set-Cookie': await createSession(db, user!.id) });
  }
  if (route === 'auth/login' && method === 'POST') {
    const email = String(body!.email || '').trim().toLowerCase();
    const password = String(body!.password || '');
    if (!campusEmail(email)) return error('Use your @calpoly.edu email to sign in.', 400);
    const user = await db.prepare('SELECT id,name,email,password_hash,role,club_name,approved FROM users WHERE email=?')
      .bind(email).first<UserRow & { password_hash: string }>();
    if (!user || !await checkPassword(password, user.password_hash)) return error('Incorrect email or password.', 401);
    if (body!.login_as === 'admin' && user.role !== 'admin') return error('This login is for campus admins only.', 403);
    return json({ user: publicUser(user) }, 200, { 'Set-Cookie': await createSession(db, user.id) });
  }
  if (route === 'auth/logout' && method === 'POST') {
    const token = sessionToken(request);
    if (token) await db.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await digest(token)).run();
    return json({ ok: true }, 200, { 'Set-Cookie': `${cookieName}=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/` });
  }

  const user = await readUser(request, db);
  if (!user) return error('Sign in to continue.', 401);

  if (route === 'clubs/pending' && method === 'GET') {
    if (user.role !== 'admin') return error('This action is not available for your account.', 403);
    const clubs = await db.prepare("SELECT id,name,email,club_name,created_at FROM users WHERE role='club' AND approved=0 ORDER BY created_at").all();
    return json({ clubs: clubs.results });
  }
  if (path[0] === 'clubs' && path[2] === 'approval' && method === 'PATCH') {
    if (user.role !== 'admin') return error('This action is not available for your account.', 403);
    const id = validId(path[1]);
    if (!id || body!.approved !== true) return error('Provide a club ID and approved: true.', 400);
    const club = await db.prepare("SELECT id,name,email,club_name,approved FROM users WHERE id=? AND role='club'").bind(id).first();
    if (!club) return error('Club not found.', 404);
    await db.prepare('UPDATE users SET approved=1 WHERE id=?').bind(id).run();
    return json({ club: { ...club, approved: true } });
  }

  if (route === 'events' && method === 'GET') {
    const events = await db.prepare(`${selectEvents} ORDER BY e.starts_at ASC`).all<Record<string, unknown>>();
    const going = await db.prepare('SELECT event_id FROM rsvps WHERE user_id=?').bind(user.id).all<{ event_id: number }>();
    const mine = new Set(going.results.map(row => row.event_id));
    return json({ events: events.results.map(event => ({ ...event, going: mine.has(Number(event.id)) })) });
  }
  if (route === 'events' && method === 'POST') {
    if (user.role !== 'club') return error('This action is not available for your account.', 403);
    if (!user.approved) return error('An admin must approve your club before you can post.', 403);
    const validated = validateEvent(body!);
    if (validated.error) return error(validated.error, 400);
    const data = validated.data!;
    const result = await db.prepare('INSERT INTO events (club_id,title,food,location,starts_at,ends_at,details) VALUES (?,?,?,?,?,?,?)')
      .bind(user.id, data.title, data.food, data.location, data.starts_at, data.ends_at, data.details).run();
    return json({ event: await getEvent(db, result.meta.last_row_id) }, 201);
  }
  if (path[0] === 'events' && path.length >= 2) {
    const id = validId(path[1]);
    if (!id) return error('Event not found.', 404);
    const event = await getEvent(db, id);
    if (!event) return error('Event not found.', 404);
    if (path.length === 2 && method === 'GET') {
      const going = await db.prepare('SELECT 1 FROM rsvps WHERE event_id=? AND user_id=?').bind(id, user.id).first();
      return json({ event: { ...event, going: Boolean(going) } });
    }
    if (path[2] === 'rsvp' && method === 'POST') {
      await db.prepare('INSERT OR IGNORE INTO rsvps (event_id,user_id) VALUES (?,?)').bind(id, user.id).run();
      return json({ going: true });
    }
    if (path[2] === 'rsvp' && method === 'DELETE') {
      await db.prepare('DELETE FROM rsvps WHERE event_id=? AND user_id=?').bind(id, user.id).run();
      return json({ going: false });
    }
    if (user.role !== 'club' || Number(event.club_id) !== user.id)
      return error('You can only manage your club’s events.', 403);
    if (method === 'PUT') {
      const validated = validateEvent(body!);
      if (validated.error) return error(validated.error, 400);
      const data = validated.data!;
      await db.prepare('UPDATE events SET title=?,food=?,location=?,starts_at=?,ends_at=?,details=? WHERE id=?')
        .bind(data.title, data.food, data.location, data.starts_at, data.ends_at, data.details, id).run();
      return json({ event: await getEvent(db, id) });
    }
    if (method === 'DELETE') {
      await db.prepare('DELETE FROM events WHERE id=?').bind(id).run();
      return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
    }
  }
  return error('API route not found.', 404);
}

async function route(request: Request, context: { params: Promise<{ path: string[] }> }) {
  try { return await handle(request, (await context.params).path); }
  catch (cause) {
    console.error('Campus Plate API failure', cause);
    return error('Something went wrong on the server.', 500);
  }
}

export { route as GET, route as POST, route as PUT, route as PATCH, route as DELETE };
