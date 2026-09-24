import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';

const app = express();
app.use(cors());
app.use(express.json());
const port = process.env.PORT || 4000;
const ORGANIZER_EMAIL = 'naise.shekhar@vsit.edu.in';
const ORGANIZER_PASSWORD = 'Admin@123';
const categories = ['Technology', 'Design', 'Business', 'Wellness', 'Arts', 'Sports', 'Cultural', 'Workshops'];
const titles = ['AI Builders Lab', 'Design Systems Meetup', 'Founder Fireside', 'Sunset Yoga Flow', 'Indie Art Walk', 'Community Cricket Cup', 'Open Mic Mumbai', 'Product Masterclass', 'Future of Work', 'Ceramics & Chai'];
const places = ['The Hive, Mumbai', 'Bandra Social, Mumbai', 'Todi Mill, Mumbai', 'Cubbon Park, Bengaluru', 'Prithvi Theatre, Mumbai', 'NESCO Grounds, Mumbai'];
const images = ['photo-1556761175-b413da4baf72', 'photo-1517457373958-b7bdd4587205', 'photo-1506126613408-eca07ce68773', 'photo-1492684223066-81342ee5ff30', 'photo-1511578314322-379afb476865'];
const seed = Array.from({ length: 50 }, (_, i) => {
  const day = String((i % 24) + 1).padStart(2, '0');
  const month = i % 2 ? '11' : '10';
  const category = categories[i % categories.length];
  return {
    id: String(i + 1), title: `${titles[i % titles.length]} ${i > 9 ? `#${Math.floor(i / 10) + 1}` : ''}`.trim(),
    category, date: `2026-${month}-${day}`, time: i % 3 ? '18:30' : '11:00',
    location: places[i % places.length], city: i % 3 ? 'Mumbai' : 'Bengaluru',
    image: `https://images.unsplash.com/${images[i % images.length]}?auto=format&fit=crop&w=900&q=80`,
    description: `A welcoming ${category.toLowerCase()} gathering for curious people to learn, share and meet their community.`,
    organizer: 'EventNest Community', organizerId: 'system', attendees: (i * 7) % 70,
    capacity: 40 + (i % 6) * 25, deadline: `2026-${month}-${String(Math.max(1, (i % 24))).padStart(2, '0')}`,
    status: 'published', price: i % 4 ? '₹299' : 'Free', tags: [category]
  };
});
let events = [...seed];
const hash = p => crypto.scryptSync(p, process.env.PASSWORD_SALT || 'eventnest-local-salt', 32).toString('hex');
const users = [{ id: 'admin', name: 'Naise Gupta', email: ORGANIZER_EMAIL, role: 'organizer', passwordHash: hash(ORGANIZER_PASSWORD), saved: ['1', '3'], registrations: [] }];
const sessions = new Map();
const safe = u => ({ id: u.id, name: u.name, email: u.email, role: u.role });
const issue = u => { const token = crypto.randomBytes(32).toString('hex'); sessions.set(token, u.id); return token; };
const auth = (req, res, next) => { const token = (req.get('authorization') || '').replace(/^Bearer\s+/i, ''); const user = users.find(u => u.id === sessions.get(token)); if (!user) return res.status(401).json({ message: 'Please sign in' }); req.user = user; next(); };
const organizer = (req, res, next) => req.user.role === 'organizer' && req.user.email === ORGANIZER_EMAIL ? next() : res.status(403).json({ message: 'Organizer access required' });
const eventStatus = e => e.status === 'cancelled' ? 'cancelled' : new Date(`${e.date}T${e.time}`) < new Date() ? 'past' : e.deadline && new Date(`${e.deadline}T23:59`) < new Date() ? 'closed' : e.attendees >= e.capacity ? 'full' : 'published';

app.get('/api/health', (_, res) => res.json({ ok: true, service: 'EventNest API' }));
app.get('/api/events', (req, res) => { const q = String(req.query.q || '').toLowerCase(); const cat = req.query.category; res.json(events.filter(e => (!q || `${e.title} ${e.city} ${e.category}`.toLowerCase().includes(q)) && (!cat || cat === 'All' || e.category === cat)).map(e => ({ ...e, status: eventStatus(e) }))); });
app.get('/api/events/:id', (req, res) => { const e = events.find(x => x.id === req.params.id); e ? res.json({ ...e, status: eventStatus(e) }) : res.status(404).json({ message: 'Event not found' }); });
app.post('/api/auth/login', (req, res) => { const email = String(req.body.email || '').trim().toLowerCase(); const u = users.find(x => x.email === email); if (!u || u.passwordHash !== hash(req.body.password || '')) return res.status(401).json({ message: 'Invalid email or password' }); res.json({ token: issue(u), user: safe(u) }); });
app.post('/api/auth/register', (req, res) => { const email = String(req.body.email || '').trim().toLowerCase(); if (!req.body.name || !email || !req.body.password || req.body.password.length < 6) return res.status(400).json({ message: 'Name, email and a 6+ character password are required' }); if (users.some(u => u.email === email)) return res.status(409).json({ message: 'Email already registered' }); const u = { id: `u${Date.now()}`, name: String(req.body.name).trim(), email, role: 'attendee', passwordHash: hash(req.body.password), saved: [], registrations: [] }; users.push(u); res.status(201).json({ token: issue(u), user: safe(u) }); });
app.get('/api/me', auth, (req, res) => res.json({ user: safe(req.user), saved: req.user.saved, registrations: req.user.registrations }));
app.post('/api/events/:id/save', auth, (req, res) => { if (!events.some(e => e.id === req.params.id)) return res.status(404).json({ message: 'Event not found' }); req.user.saved = req.user.saved.includes(req.params.id) ? req.user.saved.filter(id => id !== req.params.id) : [...req.user.saved, req.params.id]; res.json({ saved: req.user.saved }); });
app.post('/api/events/:id/register', auth, (req, res) => { const e = events.find(x => x.id === req.params.id); if (!e) return res.status(404).json({ message: 'Event not found' }); if (req.user.registrations.includes(e.id)) return res.status(409).json({ message: 'You are already registered for this event' }); if (eventStatus(e) !== 'published') return res.status(409).json({ message: `Registration is ${eventStatus(e)}` }); req.user.registrations.push(e.id); e.attendees++; res.status(201).json({ message: 'Registration confirmed', registration: { eventId: e.id } }); });
app.get('/api/organizer/events', auth, organizer, (req, res) => res.json(events.filter(e => e.organizerId === req.user.id || e.organizerId === 'system').map(e => ({ ...e, status: eventStatus(e) }))));
app.get('/api/organizer/registrations', auth, organizer, (req, res) => res.json(users.flatMap(u => u.registrations.map(eventId => ({ attendee: { id: u.id, name: u.name, email: u.email }, event: events.find(e => e.id === eventId) })) )));
app.post('/api/events', auth, organizer, (req, res) => { const { title, category, date, time, location, city, price, description, image, capacity, deadline } = req.body; if (!title || !date || !location || !description || !capacity) return res.status(400).json({ message: 'Title, date, location, description and capacity are required' }); const e = { ...req.body, id: `e${Date.now()}`, attendees: 0, capacity: Number(capacity), deadline: deadline || date, status: 'published', organizer: req.user.name, organizerId: req.user.id, category: category || 'Workshops', price: price || 'Free', city: city || 'Mumbai', time: time || '18:30', image: image || images[0] }; events = [e, ...events]; res.status(201).json(e); });
app.patch('/api/organizer/events/:id', auth, organizer, (req, res) => { const e = events.find(x => x.id === req.params.id && x.organizerId === req.user.id); if (!e) return res.status(404).json({ message: 'Event not found' }); Object.assign(e, req.body); res.json(e); });
app.delete('/api/organizer/events/:id', auth, organizer, (req, res) => { const e = events.find(x => x.id === req.params.id && x.organizerId === req.user.id); if (!e) return res.status(404).json({ message: 'Event not found' }); e.status = 'cancelled'; res.json({ message: 'Event cancelled' }); });
app.listen(port, () => console.log(`EventNest API running on http://localhost:${port}`));
