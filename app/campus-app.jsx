"use client";
import React, { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { ArrowLeft, ArrowRight, CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, LockKeyhole, MapPin, Plus, Search, ShieldCheck, Sparkles, UtensilsCrossed, X } from 'lucide-react';

async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  if (response.status === 204) return null;
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

const formatDay = date => date.toLocaleDateString('en-US', { weekday: 'short' });
const formatDate = date => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const formatTime = iso => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const localInput = iso => {
  const date = new Date(iso);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};
const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

function useRoute() {
  const [path, setPath] = useState(typeof window === 'undefined' ? '/' : location.pathname);
  useEffect(() => {
    const listener = () => setPath(location.pathname);
    addEventListener('popstate', listener);
    return () => removeEventListener('popstate', listener);
  }, []);
  const navigate = (next, options = {}) => {
    history.pushState({}, '', next);
    setPath(next);
    scrollTo({ top: 0, behavior: options.instant ? 'auto' : 'smooth' });
  };
  return [path, navigate];
}

function App() {
  const [path, navigate] = useRoute();
  const switchTab = next => {
    if (path === next) {
      scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      navigate(next, { instant: true });
      return;
    }
    document.documentElement.dataset.tabDirection = next === '/club' ? 'forward' : 'backward';
    const transition = document.startViewTransition(() => flushSync(() => navigate(next, { instant: true })));
    transition.finished.finally(() => { delete document.documentElement.dataset.tabDirection; });
  };
  const [user, setUser] = useState(null);
  const [events, setEvents] = useState([]);
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [authMode, setAuthMode] = useState(null);
  const [authRole, setAuthRole] = useState('student');
  const [formEvent, setFormEvent] = useState(null);

  const refresh = async () => {
    const auth = await api('/auth/me');
    setUser(auth.user);
    setEvents(auth.user ? (await api('/events')).events : []);
    if (auth.user?.role === 'admin') setPending((await api('/clubs/pending')).clubs);
    else setPending([]);
  };
  useEffect(() => { refresh().catch(e => setError(e.message)).finally(() => setLoading(false)); }, []);
  const notify = text => { setNotice(text); setTimeout(() => setNotice(''), 4000); };
  const openRegister = role => { setAuthRole(role); setAuthMode('register'); };
  const openLogin = role => { setAuthRole(role); setAuthMode('login'); };
  const onAuth = async data => { setUser(data.user); setAuthMode(null); await refresh(); notify(data.user.role === 'club' && !data.user.approved ? 'Your club is awaiting admin approval.' : 'You are signed in.'); };
  const logout = async () => { await api('/auth/logout', { method: 'POST' }); setUser(null); setEvents([]); await refresh(); navigate('/'); notify('Signed out.'); };
  const saveEvent = async (event, payload) => {
    await api(event ? `/events/${event.id}` : '/events', { method: event ? 'PUT' : 'POST', body: JSON.stringify(payload) });
    setFormEvent(null); await refresh(); notify(event ? 'Event updated.' : 'Event published.');
  };
  const removeEvent = async event => {
    if (!confirm(`Delete “${event.title}”? This cannot be undone.`)) return;
    await api(`/events/${event.id}`, { method: 'DELETE' }); await refresh(); navigate('/club'); notify('Event deleted.');
  };
  const rsvp = async event => {
    if (!user) { setAuthMode('login'); return; }
    await api(`/events/${event.id}/rsvp`, { method: event.going ? 'DELETE' : 'POST' });
    await refresh(); notify(event.going ? 'You are no longer marked as going.' : 'You are going! See you there.');
  };
  const decide = async id => { await api(`/clubs/${id}/approval`, { method: 'PATCH', body: JSON.stringify({ approved: true }) }); await refresh(); notify('Club approved.'); };
  const eventId = path.match(/^\/events\/(\d+)$/)?.[1];
  const selectedEvent = eventId ? events.find(e => e.id === Number(eventId)) : null;

  return <>
    <header className="site-header">
      <button className="brand" onClick={() => navigate('/')} aria-label="Campus Plate home"><span className="brand-mark"><UtensilsCrossed size={20}/></span><span>campus<span className="brand-accent">plate</span><small>Find food. Find your people.</small></span></button>
      <nav className={`top-nav ${path === '/club' ? 'club-active' : path === '/admin' ? 'tab-none' : ''}`} aria-label="Main navigation">
        <button className={path === '/' || path.startsWith('/events/') ? 'active' : ''} onClick={() => switchTab('/')}>Find food</button>
        <button className={path === '/club' ? 'active' : ''} onClick={() => switchTab('/club')}>For clubs</button>
        <span className="tab-indicator" aria-hidden="true"/>
      </nav>
      <div className="header-actions">{user ? <>{user.role === 'admin' && <button className="text-button" onClick={() => navigate('/admin')}>Approvals {pending.length > 0 && <span className="nav-count">{pending.length}</span>}</button>}<span className="signed-in">Hi, {user.name.split(' ')[0]}</span><button className="text-button" onClick={logout}>Sign out</button></> : <><button className="text-button" onClick={() => openLogin(path === '/admin' ? 'admin' : path === '/club' ? 'club' : 'student')}>Log in</button>{path !== '/admin' && <button className="button button-dark button-small" onClick={() => openRegister(path === '/club' ? 'club' : 'student')}>Create account</button>}</>}</div>
    </header>
    {error && <div className="global-error" role="alert">{error}<button onClick={() => { setError(''); refresh().catch(e => setError(e.message)); }}>Try again</button></div>}
    {loading ? <div className="loading">Loading campus events…</div> : path === '/club' ? <ClubPage user={user} events={events} navigate={navigate} onNew={() => setFormEvent({})} onEdit={setFormEvent} onDelete={removeEvent} onLogin={() => openLogin('club')} onRegister={() => openRegister('club')}/> : path === '/admin' ? <AdminPage user={user} pending={pending} decide={decide} onLogin={() => openLogin('admin')}/> : !user ? <WelcomePage/> : eventId ? <EventPage event={selectedEvent} user={user} navigate={navigate} rsvp={rsvp} onEdit={setFormEvent} onDelete={removeEvent}/> : <ExplorePage events={events} navigate={navigate} rsvp={rsvp}/>}
    {notice && <div className="toast" role="status"><Check size={17}/>{notice}</div>}
    {authMode && <AuthDialog mode={authMode} initialRole={authRole} setMode={setAuthMode} onClose={() => setAuthMode(null)} onAuth={onAuth}/>}
    {formEvent && <EventDialog event={formEvent.id ? formEvent : null} onClose={() => setFormEvent(null)} onSave={saveEvent}/>}
  </>;
}

function WelcomePage() {
  return <main className="welcome-page"><section className="hero"><div className="hero-inner"><div className="hero-copy"><div className="eyebrow"><span className="eyebrow-dot"/> A CAL POLY COMMUNITY CALENDAR</div><h1>Good food.<br/><em>Great company.</em></h1><p>Campus food events are shared with the Cal Poly community. Sign in with your @calpoly.edu email to see what's happening.</p></div><div className="hero-illustration" aria-hidden="true"><span className="hero-ring ring-one"/><span className="hero-ring ring-two"/><div className="plate"><div className="plate-inner"><span className="food food-sandwich">🥪</span><span className="food food-tomato">●</span></div></div><div className="hero-sticker sticker-top">FOR THE<br/><b>CAMPUS!</b></div></div></div></section><section className="welcome-features" aria-label="What you can do"><div className="welcome-feature-list"><div><UtensilsCrossed size={23}/><h3>Know the food</h3><p>See what each club plans to serve.</p></div><div><MapPin size={23}/><h3>Find the event</h3><p>Check the time and campus location.</p></div><div><Check size={23}/><h3>Make a plan</h3><p>Let clubs know you're planning to attend.</p></div></div></section><CalendarPreview/></main>;
}

function CalendarPreview() {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const previews = {
    0: { tone: 'mint', title: 'Sandwich social', time: '12:00 PM', place: 'Campus lawn' },
    2: { tone: 'peach', title: 'Pizza & projects', time: '5:30 PM', place: 'Building 007' },
    4: { tone: 'butter', title: 'Coffee & pastries', time: '10:00 AM', place: 'Library patio' },
    5: { tone: 'lavender', title: 'Taco picnic', time: '1:00 PM', place: 'University green' }
  };
  return <section className="calendar-preview" aria-label="Sample calendar">
    <div className="calendar-preview-head"><div className="calendar-preview-title"><CalendarDays size={21}/><span>Sample week</span></div><span className="calendar-preview-private"><LockKeyhole size={15}/> Sign in to see live events</span></div>
    <div className="calendar-preview-scroll"><div className="calendar-preview-grid">{days.map((day, index) => <div className="calendar-preview-day" key={day}><div className="calendar-preview-day-name">{day}</div>{previews[index] && <div className={`calendar-preview-event ${previews[index].tone}`}><b>{previews[index].title}</b><span>{previews[index].time}</span><small><MapPin size={11}/>{previews[index].place}</small></div>}</div>)}</div></div>
    <div className="calendar-preview-foot"><span className="preview-dot"/> Example events only. Live events stay private until sign in.</div>
  </section>;
}

function ExplorePage({ events, navigate, rsvp }) {
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState('');
  const [weekOffset, setWeekOffset] = useState(0);
  const start = today(); start.setDate(start.getDate() + weekOffset * 7);
  const dates = Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  const filtered = events.filter(e => {
    const date = new Date(e.starts_at);
    if (selected && date.toDateString() !== selected) return false;
    if (!selected && date < today()) return false;
    return `${e.title} ${e.food} ${e.location} ${e.club_name}`.toLowerCase().includes(search.toLowerCase());
  });
  return <main>
    <section className="hero"><div className="hero-inner"><div className="hero-copy"><div className="eyebrow"><span className="eyebrow-dot"/> THE CAMPUS FOOD CALENDAR</div><h1>Good food.<br/><em>Great company.</em></h1><p>Find free bites, meet student clubs, and make the most of campus life.</p><div className="hero-actions"><button className="button button-yellow" onClick={() => document.querySelector('#events')?.scrollIntoView({ behavior: 'smooth' })}>Find your next bite <ArrowRight size={18}/></button></div></div><div className="hero-illustration" aria-hidden="true"><span className="hero-ring ring-one"/><span className="hero-ring ring-two"/><div className="plate"><div className="plate-inner"><span className="food food-sandwich">🥪</span><span className="food food-tomato">●</span></div></div><div className="hero-sticker sticker-top">FREE FOOD<br/><b>THIS WEEK!</b></div><div className="hero-sticker sticker-bottom">COME HUNGRY <span>↗</span></div></div></div></section>
    <section className="event-section" id="events"><div className="section-heading"><div><span className="section-kicker">WHAT'S COOKING</span><h2>Upcoming events<span className="heading-star">✳</span></h2><p>Show up hungry. Leave with new friends.</p></div><div className="event-count">{filtered.length} {filtered.length === 1 ? 'event' : 'events'} to explore</div></div>
      <div className="calendar-bar"><div className="calendar-label"><CalendarDays size={20}/><span>This week</span></div><div className="calendar-days">{dates.map(d => { const key = d.toDateString(); const count = events.filter(e => new Date(e.starts_at).toDateString() === key).length; return <button key={key} className={`day ${selected === key ? 'selected' : ''} ${key === today().toDateString() ? 'is-today' : ''}`} onClick={() => setSelected(selected === key ? null : key)}><span>{formatDay(d)}</span><strong>{d.getDate()}</strong>{count > 0 && <i/>}</button>; })}</div><div className="calendar-arrows"><button aria-label="Previous week" onClick={() => setWeekOffset(Math.max(0, weekOffset - 1))} disabled={weekOffset === 0}><ChevronLeft size={18}/></button><button aria-label="Next week" onClick={() => setWeekOffset(weekOffset + 1)}><ChevronRight size={18}/></button></div></div>
      <div className="listing-toolbar"><div className="filter-label">{selected ? <><button className="clear-date" onClick={() => setSelected(null)}>All upcoming <X size={13}/></button><span>{formatDate(new Date(selected))}</span></> : <span>ALL UPCOMING</span>}</div><label className="search"><Search size={18}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search food, clubs, places…" aria-label="Search events"/></label></div>
      {filtered.length ? <div className="event-grid">{filtered.map((event, i) => <EventCard key={event.id} event={event} index={i} navigate={navigate} rsvp={rsvp}/>)}</div> : <div className="empty-state"><span>✳</span><h3>No bites found</h3><p>Try another date or search. More club events are on the way.</p><button className="button button-dark" onClick={() => { setSelected(null); setSearch(''); }}>Show all events</button></div>}
    </section>
  </main>;
}

function EventCard({ event, index, navigate, rsvp }) {
  const tones = ['peach', 'mint', 'lavender', 'butter'];
  const emoji = /coffee|pastr|croissant/i.test(event.food) ? '🥐' : /salad|fruit/i.test(event.food) ? '🥗' : '🥪';
  return <article className="event-card"><button className={`card-art ${tones[index % tones.length]}`} onClick={() => navigate(`/events/${event.id}`)} aria-label={`View ${event.title}`}><span className="art-sun">✳</span><span className="art-emoji">{emoji}</span><span className="art-squiggle">〰</span><span className="art-date">{formatDate(new Date(event.starts_at))}</span></button><div className="card-body"><div className="card-club"><ShieldCheck size={15}/> {event.club_name} <span>VERIFIED</span></div><button className="card-title" onClick={() => navigate(`/events/${event.id}`)}>{event.title}</button><div className="card-food">{event.food}</div><div className="card-meta"><span><Clock3 size={15}/>{formatTime(event.starts_at)} – {formatTime(event.ends_at)}</span><span><MapPin size={15}/>{event.location}</span></div><div className="card-bottom"><span><b>{event.going_count}</b> going</span><button className={event.going ? 'going-button is-going' : 'going-button'} onClick={() => rsvp(event)}>{event.going ? <><Check size={16}/> Going</> : <>I'm going <ArrowRight size={16}/></>}</button></div></div></article>;
}

function EventPage({ event, user, navigate, rsvp, onEdit, onDelete }) {
  if (!event) return <main className="subpage"><button className="back-link" onClick={() => navigate('/')}><ArrowLeft size={17}/> Back to events</button><h1>Event not found</h1></main>;
  const owner = user?.id === event.club_id;
  return <main className="subpage event-detail"><button className="back-link" onClick={() => navigate('/')}><ArrowLeft size={17}/> Back to events</button><div className="detail-layout"><div><div className="detail-art"><span>✳</span><strong>Good food.<br/>Good people.</strong><i>🥪</i></div><div className="detail-description"><h2>About this event</h2><p>{event.details || 'Come by, grab a bite, and meet the club!'}</p></div></div><div className="detail-info"><div className="eyebrow dark"><ShieldCheck size={16}/> VERIFIED CLUB EVENT</div><h1>{event.title}</h1><p className="detail-food">{event.food}</p><div className="detail-facts"><div><CalendarDays/><span><b>{new Date(event.starts_at).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</b><small>{formatTime(event.starts_at)} – {formatTime(event.ends_at)}</small></span></div><div><MapPin/><span><b>{event.location}</b><small>On campus</small></span></div><div><UtensilsCrossed/><span><b>Hosted by {event.club_name}</b><small>{event.going_count} people going</small></span></div></div>{owner ? <div className="detail-owner"><button className="button button-dark" onClick={() => onEdit(event)}>Edit event</button><button className="button button-outline" onClick={() => onDelete(event)}>Delete event</button></div> : <button className={event.going ? 'button button-dark detail-rsvp' : 'button button-yellow detail-rsvp'} onClick={() => rsvp(event)}>{event.going ? <><Check size={18}/> You're going</> : <>I'm going <ArrowRight size={18}/></>}</button>}</div></div></main>;
}

function ClubPage({ user, events, navigate, onNew, onEdit, onDelete, onLogin, onRegister }) {
  if (!user || user.role !== 'club') return <main className="club-landing">
    <section className="club-hero"><div><div className="eyebrow"><span className="eyebrow-dot"/> FOR CLUB ORGANIZERS</div><h1>Bring your club<br/><em>to the table.</em></h1><p>Share your food events with students across campus. Add the menu, time, and place, then welcome everyone in.</p><div className="club-hero-actions"><button className="button button-yellow" onClick={onRegister}>Register your club <ArrowRight size={18}/></button><button className="hero-link" onClick={onLogin}>Club login <ArrowRight size={17}/></button></div></div><div className="club-hero-mark" aria-hidden="true"><UtensilsCrossed size={142}/><span>✳</span></div></section>
    <ClubDashboardPreview/>
  </main>;
  const mine = events.filter(e => e.club_id === user.id);
  return <main className="subpage dashboard"><div className="dashboard-head"><div><span className="section-kicker">CLUB DASHBOARD</span><h1>{user.club_name}</h1><p>Welcome back, {user.name}. Manage your food events here.</p></div>{user.approved && <button className="button button-yellow" onClick={onNew}><Plus size={18}/> Add event</button>}</div>{!user.approved ? <div className="approval-banner"><ShieldCheck size={26}/><div><h2>Approval pending</h2><p>An admin needs to verify {user.club_name} before you can post events. Check back soon.</p></div></div> : <><div className="dashboard-stats"><div><strong>{mine.length}</strong><span>Events posted</span></div><div><strong>{mine.reduce((sum, e) => sum + e.going_count, 0)}</strong><span>People going</span></div><div><strong><ShieldCheck size={25}/></strong><span>Verified club</span></div></div><h2>Your events</h2>{mine.length ? <div className="manage-list">{mine.map(e => <div className="manage-row" key={e.id}><div><span className="manage-date">{formatDate(new Date(e.starts_at))}</span><button onClick={() => navigate(`/events/${e.id}`)}>{e.title}</button><small>{formatTime(e.starts_at)} · {e.location} · {e.going_count} going</small></div><div><button onClick={() => onEdit(e)}>Edit</button><button className="danger" onClick={() => onDelete(e)}>Delete</button></div></div>)}</div> : <div className="empty-state"><h3>No events yet</h3><p>Add your first event to bring students together.</p><button className="button button-dark" onClick={onNew}>Add an event</button></div>}</>}</main>;
}

function ClubDashboardPreview() {
  const examples = [
    { day: 'FRI', date: '02', month: 'OCT', title: 'Garden Club picnic', food: 'Sandwiches, fruit & iced tea', time: '12:00–2:00 PM', location: 'Advanced Technology Laboratories Building 007', going: 14 },
    { day: 'MON', date: '05', month: 'OCT', title: 'Plant & pastry social', food: 'Croissants and coffee', time: '10:00 AM–12:00 PM', location: 'Campus Garden', going: 24 }
  ];
  return <section className="club-preview" aria-label="Example club dashboard">
    <div className="club-preview-heading"><div><span className="section-kicker">YOUR CLUB DASHBOARD</span><h2>Keep every event in one place.</h2></div><span className="club-preview-note">Example dashboard</span></div>
    <div className="club-preview-board">
      <div className="club-preview-board-head"><span className="club-preview-avatar">G</span><div><strong>Garden Club</strong><small><ShieldCheck size={14}/> Verified club</small></div><div className="club-preview-count"><strong>38</strong><span>students going</span></div></div>
      <div className="club-preview-list">{examples.map(example => <div className="club-preview-row" key={example.title}>
        <div className="club-preview-date"><span>{example.day}</span><strong>{example.date}</strong><small>{example.month}</small></div>
        <div className="club-preview-event"><h3>{example.title}</h3><p>{example.food}</p><div className="club-preview-meta"><span><Clock3 size={14}/>{example.time}</span><span><MapPin size={14}/>{example.location}</span></div></div>
        <div className="club-preview-rsvp"><strong>{example.going}</strong><span>going</span></div>
      </div>)}</div>
    </div>
  </section>;
}

function AdminPage({ user, pending, decide, onLogin }) {
  if (!user || user.role !== 'admin') return <main className="subpage gated"><ShieldCheck size={40}/><h1>Admin approvals</h1><p>Sign in as a campus admin to review club requests.</p><button className="button button-dark" onClick={onLogin}>Log in</button></main>;
  return <main className="subpage dashboard"><div className="dashboard-head"><div><span className="section-kicker">ADMIN DESK</span><h1>Club approvals</h1><p>Review clubs before they can publish food events.</p></div><div className="admin-total">{pending.length} pending</div></div>{pending.length ? <div className="approval-list">{pending.map(club => <div className="approval-row" key={club.id}><div className="club-avatar">{club.club_name.slice(0, 1).toUpperCase()}</div><div><h2>{club.club_name}</h2><p>{club.name} · {club.email}</p></div><div className="approval-actions"><button className="button button-dark" onClick={() => decide(club.id)}>Approve</button></div></div>)}</div> : <div className="empty-state"><Check size={36}/><h3>All caught up</h3><p>There are no clubs waiting for approval.</p></div>}</main>;
}

function Modal({ title, onClose, children, className = '' }) {
  useEffect(() => { const onKey = e => { if (e.key === 'Escape') onClose(); }; addEventListener('keydown', onKey); return () => removeEventListener('keydown', onKey); }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><div className={`modal ${className}`} role="dialog" aria-modal="true" aria-label={title}><button className="modal-close" onClick={onClose} aria-label="Close"><X size={21}/></button>{children}</div></div>;
}

function ClubRegistrationSteps() {
  return <section className="registration-steps" aria-label="How club registration works"><div className="section-kicker">HOW IT WORKS</div><h3>From signup to supper</h3><ol><li><strong>01</strong><div><b>Create a club account</b><p>Tell us your club name and organizer details.</p></div></li><li><strong>02</strong><div><b>Get verified</b><p>A campus admin approves your club before it can publish.</p></div></li><li><strong>03</strong><div><b>Post your event</b><p>Add the food, time, and location. Edit or remove events anytime.</p></div></li></ol></section>;
}

function AuthDialog({ mode, initialRole, setMode, onClose, onAuth }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const adminLogin = mode === 'login' && initialRole === 'admin';
  const submit = async e => { e.preventDefault(); setBusy(true); setError(''); const form = Object.fromEntries(new FormData(e.currentTarget)); if (adminLogin) form.login_as = 'admin'; try { onAuth(await api(`/auth/${mode}`, { method: 'POST', body: JSON.stringify(form) })); } catch (err) { setError(err.message); } finally { setBusy(false); } };
  const clubRegistration = mode === 'register' && initialRole === 'club';
  return <Modal title={adminLogin ? 'Admin login' : mode === 'login' ? 'Log in' : clubRegistration ? 'Register your club' : 'Create student account'} onClose={onClose} className={adminLogin ? 'admin-login-modal' : clubRegistration ? 'club-signup-modal' : ''}>
    <div className={clubRegistration ? 'club-auth-layout' : ''}>
      <div className="auth-intro">{adminLogin && <div className="admin-login-mark"><ShieldCheck size={27}/></div>}<div className="modal-kicker">{adminLogin ? 'CAMPUS ADMIN ACCESS' : 'CAMPUS PLATE'}</div><h2>{adminLogin ? 'Admin login.' : mode === 'login' ? initialRole === 'club' ? 'Club login.' : 'Welcome back!' : clubRegistration ? 'Register your club.' : 'Join the table.'}</h2><p className="modal-intro">{adminLogin ? 'Sign in with your campus admin account to review club registrations.' : initialRole === 'club' ? 'Use your @calpoly.edu email. A campus admin approves club accounts before they can post events.' : 'Use your @calpoly.edu email to see campus food events.'}</p>{clubRegistration && <ClubRegistrationSteps/>}</div>
      <form onSubmit={submit}>
        {mode === 'register' && <><input type="hidden" name="role" value={initialRole}/><label>Your name<input name="name" required maxLength="80" placeholder="Your name"/></label>{clubRegistration && <label>Club name<input name="club_name" required maxLength="100" placeholder="Your club’s name"/></label>}</>}
        <label>Cal Poly email<input name="email" type="email" required placeholder="you@calpoly.edu" autoComplete="email"/></label>
        <label>Password<input name="password" type="password" minLength={mode === 'register' ? 8 : undefined} required placeholder={mode === 'register' ? 'At least 8 characters' : 'Your password'} autoComplete={mode === 'register' ? 'new-password' : 'current-password'}/></label>
        {error && <div className="form-error" role="alert">{error}</div>}
        <button className="button button-dark modal-submit" disabled={busy}>{busy ? 'Please wait…' : adminLogin ? 'Enter admin dashboard' : mode === 'login' ? 'Log in' : clubRegistration ? 'Register club' : 'Create account'} <ArrowRight size={17}/></button>
      </form>
    </div>
    {!adminLogin && <p className="switch-auth">{mode === 'login' ? initialRole === 'club' ? 'New club here?' : 'New here?' : 'Already have an account?'} <button onClick={() => { setError(''); setMode(mode === 'login' ? 'register' : 'login'); }}>{mode === 'login' ? initialRole === 'club' ? 'Register your club' : 'Create an account' : 'Log in'}</button></p>}
  </Modal>;
}

function EventDialog({ event, onClose, onSave }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const initialStart = new Date(); initialStart.setDate(initialStart.getDate() + 1); initialStart.setHours(12, 0, 0, 0);
  const initialEnd = new Date(initialStart); initialEnd.setHours(14);
  const submit = async e => { e.preventDefault(); const form = Object.fromEntries(new FormData(e.currentTarget)); const payload = { ...form, starts_at: new Date(form.starts_at).toISOString(), ends_at: new Date(form.ends_at).toISOString() }; setBusy(true); setError(''); try { await onSave(event, payload); } catch (err) { setError(err.message); } finally { setBusy(false); } };
  return <Modal title={event ? 'Edit event' : 'Add event'} onClose={onClose}><div className="modal-kicker">CLUB EVENT</div><h2>{event ? 'Edit your event.' : 'Add something tasty.'}</h2><p className="modal-intro">Give students the details they need to show up.</p><form onSubmit={submit}><label>Event name<input name="title" required maxLength="100" defaultValue={event?.title || ''} placeholder="e.g. Pizza & project night"/></label><label>What food will be there?<input name="food" required maxLength="160" defaultValue={event?.food || ''} placeholder="e.g. Pizza, soda, and cookies"/></label><label>Location<input name="location" required maxLength="120" defaultValue={event?.location || ''} placeholder="e.g. Advanced Technology Laboratories Building 007"/></label><div className="form-row"><label>Starts<input name="starts_at" type="datetime-local" required defaultValue={localInput(event?.starts_at || initialStart)} /></label><label>Ends<input name="ends_at" type="datetime-local" required defaultValue={localInput(event?.ends_at || initialEnd)}/></label></div><label>Extra details<textarea name="details" maxLength="500" rows="3" defaultValue={event?.details || ''} placeholder="Anything students should know?"/></label>{error && <div className="form-error" role="alert">{error}</div>}<button className="button button-dark modal-submit" disabled={busy}>{busy ? 'Saving…' : event ? 'Save changes' : 'Publish event'} <ArrowRight size={17}/></button></form></Modal>;
}

export default App;
