import assert from 'node:assert/strict';

const base = process.env.SMOKE_BASE || 'http://127.0.0.1:3000';
const suffix = Date.now();
async function request(path, method = 'GET', body, cookie) {
  const response = await fetch(`${base}/api${path}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, data: response.status === 204 ? null : await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
}

assert.equal((await request('/events')).status, 401);
const club = await request('/auth/register', 'POST', { name: 'Demo Organizer', email: `smokeclub${suffix}@calpoly.edu`, password: 'password123', role: 'club', club_name: 'Smoke Club' });
assert.equal(club.status, 201);
assert.equal(club.data.user.approved, false);
const event = { title: 'Pizza social', food: 'Pizza', location: 'Building 007', starts_at: new Date(Date.now() + 86400000).toISOString(), ends_at: new Date(Date.now() + 90000000).toISOString(), details: 'Sample event' };
assert.equal((await request('/events', 'POST', event, club.cookie)).status, 403);
assert.equal((await request('/auth/login', 'POST', { email: `smokeclub${suffix}@calpoly.edu`, password: 'password123', login_as: 'admin' })).status, 403);
const admin = await request('/auth/login', 'POST', { email: 'admin@calpoly.edu', password: 'password', login_as: 'admin' });
assert.equal(admin.status, 200);
assert.equal((await request('/clubs/pending', 'GET', null, admin.cookie)).data.clubs.some(item => item.id === club.data.user.id), true);
assert.equal((await request(`/clubs/${club.data.user.id}/approval`, 'PATCH', { approved: true }, admin.cookie)).status, 200);
const created = await request('/events', 'POST', event, club.cookie);
assert.equal(created.status, 201);
const id = created.data.event.id;
const student = await request('/auth/register', 'POST', { name: 'Demo Student', email: `smokestudent${suffix}@calpoly.edu`, password: 'password123', role: 'student' });
assert.equal(student.status, 201);
assert.equal((await request('/events', 'GET', null, student.cookie)).data.events.some(item => item.id === id), true);
assert.equal((await request(`/events/${id}/rsvp`, 'POST', null, student.cookie)).data.going, true);
assert.equal((await request(`/events/${id}`, 'PUT', { ...event, title: 'Pizza night' }, club.cookie)).data.event.title, 'Pizza night');
assert.equal((await request(`/events/${id}`, 'DELETE', null, club.cookie)).status, 204);
console.log('Vercel API: guest gate, club approval, event CRUD, and RSVP passed.');
