const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'filip47574';

// ─── Uploads directory ───────────────────────────────────────────────────────
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

// ─── JSON Database ───────────────────────────────────────────────────────────
const DB_FILE = path.join(__dirname, 'data.json');

function dbLoad() {
  try {
    const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    // Migration: add missing fields
    if (!data.users) data.users = [];
    if (!data.sessions) data.sessions = [];
    if (!data.seq) data.seq = {};
    if (!data.seq.memes) data.seq.memes = 0;
    if (!data.seq.tournaments) data.seq.tournaments = 0;
    if (!data.seq.rounds) data.seq.rounds = 0;
    if (!data.seq.matches) data.seq.matches = 0;
    if (!data.seq.votes) data.seq.votes = 0;
    if (!data.seq.users) data.seq.users = 0;
    if (!data.seq.sessions) data.seq.sessions = 0;
    return data;
  } catch {
    return {
      memes: [], tournaments: [], rounds: [], matches: [], votes: [],
      users: [], sessions: [],
      seq: { memes: 0, tournaments: 0, rounds: 0, matches: 0, votes: 0, users: 0, sessions: 0 }
    };
  }
}

function dbSave(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function nextId(data, table) {
  data.seq[table] = (data.seq[table] || 0) + 1;
  return data.seq[table];
}

// ─── Password hashing ─────────────────────────────────────────────────────────
function hashPassword(pw) {
  return crypto.createHash('sha256').update(pw + 'meme-salt-2024').digest('hex');
}

// ─── Multer ──────────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, crypto.randomBytes(16).toString('hex') + ext);
  }
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Nur Bilddateien erlaubt'));
  },
  limits: { fileSize: 20 * 1024 * 1024 }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadsDir));

// ─── Admin Auth Middleware ────────────────────────────────────────────────────
function adminAuth(req, res, next) {
  if (req.headers['x-admin-password'] !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Nicht autorisiert' });
  }
  next();
}

// ─── User Auth Middleware ─────────────────────────────────────────────────────
function userAuth(req, res, next) {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Nicht eingeloggt' });
  const data = dbLoad();
  const session = data.sessions?.find(s => s.token === token);
  if (!session) return res.status(401).json({ error: 'Ungültige Session' });
  const user = data.users.find(u => u.id === session.user_id);
  if (!user || !user.is_active) return res.status(403).json({ error: 'Account deaktiviert' });
  req.userId = session.user_id;
  req.username = user.username;
  next();
}

// ─── Admin verify ─────────────────────────────────────────────────────────────
app.get('/api/admin/verify', adminAuth, (req, res) => res.json({ ok: true }));

// ─── Auth Routes ──────────────────────────────────────────────────────────────
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Fehlende Felder' });

  const data = dbLoad();
  const user = data.users.find(u => u.username === username);
  if (!user) return res.status(401).json({ error: 'Unbekannter Nutzer' });
  if (!user.is_active) return res.status(403).json({ error: 'Account deaktiviert' });
  if (user.password_hash !== hashPassword(password)) return res.status(401).json({ error: 'Falsches Passwort' });

  const token = crypto.randomBytes(32).toString('hex');
  const session = {
    id: nextId(data, 'sessions'),
    token,
    user_id: user.id,
    username: user.username,
    created_at: new Date().toISOString()
  };
  data.sessions.push(session);
  dbSave(data);

  res.json({ token, username: user.username, userId: user.id });
});

app.get('/api/auth/verify', userAuth, (req, res) => {
  res.json({ ok: true, username: req.username, userId: req.userId });
});

app.post('/api/auth/logout', userAuth, (req, res) => {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  const data = dbLoad();
  data.sessions = data.sessions.filter(s => s.token !== token);
  dbSave(data);
  res.json({ success: true });
});

// ─── User Management Routes (Admin) ──────────────────────────────────────────
app.get('/api/admin/users', adminAuth, (req, res) => {
  const data = dbLoad();
  res.json(data.users.map(u => ({
    id: u.id,
    username: u.username,
    is_active: u.is_active,
    created_at: u.created_at
  })));
});

app.post('/api/admin/users', adminAuth, (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Nutzername und Passwort erforderlich' });

  const data = dbLoad();
  if (data.users.find(u => u.username === username)) {
    return res.status(400).json({ error: 'Nutzername bereits vergeben' });
  }

  const user = {
    id: nextId(data, 'users'),
    username: username.trim(),
    password_hash: hashPassword(password),
    is_active: true,
    created_at: new Date().toISOString()
  };
  data.users.push(user);
  dbSave(data);
  res.json({ id: user.id, username: user.username, is_active: user.is_active, created_at: user.created_at });
});

app.delete('/api/admin/users/:id', adminAuth, (req, res) => {
  const id = Number(req.params.id);
  const data = dbLoad();
  const user = data.users.find(u => u.id === id);
  if (!user) return res.status(404).json({ error: 'Nutzer nicht gefunden' });

  // Remove sessions for this user
  data.sessions = data.sessions.filter(s => s.user_id !== id);
  data.users = data.users.filter(u => u.id !== id);
  dbSave(data);
  res.json({ success: true });
});

app.patch('/api/admin/users/:id', adminAuth, (req, res) => {
  const id = Number(req.params.id);
  const data = dbLoad();
  const user = data.users.find(u => u.id === id);
  if (!user) return res.status(404).json({ error: 'Nutzer nicht gefunden' });

  if (req.body.password !== undefined) {
    user.password_hash = hashPassword(req.body.password);
  }
  if (req.body.is_active !== undefined) {
    user.is_active = Boolean(req.body.is_active);
    // If deactivating, remove sessions
    if (!user.is_active) {
      data.sessions = data.sessions.filter(s => s.user_id !== id);
    }
  }
  if (req.body.username !== undefined) {
    const newUsername = req.body.username.trim();
    if (data.users.find(u => u.username === newUsername && u.id !== id)) {
      return res.status(400).json({ error: 'Nutzername bereits vergeben' });
    }
    user.username = newUsername;
  }
  dbSave(data);
  res.json({ id: user.id, username: user.username, is_active: user.is_active, created_at: user.created_at });
});

// ─── Meme Routes ──────────────────────────────────────────────────────────────
app.get('/api/memes', (req, res) => {
  const data = dbLoad();
  res.json([...data.memes].reverse());
});

app.post('/api/memes', adminAuth, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Kein Bild hochgeladen' });
  const name = req.body.name?.trim();
  if (!name) return res.status(400).json({ error: 'Name erforderlich' });

  const data = dbLoad();
  const meme = {
    id: nextId(data, 'memes'),
    name,
    filename: req.file.filename,
    created_at: new Date().toISOString()
  };
  data.memes.push(meme);
  dbSave(data);
  res.json(meme);
});

app.patch('/api/memes/:id', adminAuth, (req, res) => {
  const id = Number(req.params.id);
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name erforderlich' });

  const data = dbLoad();
  const meme = data.memes.find(m => m.id === id);
  if (!meme) return res.status(404).json({ error: 'Meme nicht gefunden' });

  meme.name = name.trim();
  dbSave(data);
  res.json(meme);
});

app.delete('/api/memes/:id', adminAuth, (req, res) => {
  const id = Number(req.params.id);
  const data = dbLoad();
  const meme = data.memes.find(m => m.id === id);
  if (!meme) return res.status(404).json({ error: 'Meme nicht gefunden' });

  const activeTournament = data.tournaments.find(t => t.status === 'active');
  if (activeTournament) {
    const activeRounds = data.rounds.filter(r => r.tournament_id === activeTournament.id);
    const inMatch = data.matches.some(m =>
      activeRounds.find(r => r.id === m.round_id) &&
      (m.meme1_id === id || m.meme2_id === id || m.meme3_id === id)
    );
    if (inMatch) return res.status(400).json({ error: 'Meme ist in einem aktiven Turnier' });
  }

  const filePath = path.join(uploadsDir, meme.filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  data.memes = data.memes.filter(m => m.id !== id);
  dbSave(data);
  res.json({ success: true });
});

// ─── Tournament helpers ───────────────────────────────────────────────────────
function buildMatchData(match, data) {
  const findMeme = id => data.memes.find(m => m.id === id) || null;
  const countVotes = (matchId, memeId) =>
    data.votes.filter(v => v.match_id === matchId && v.meme_id === memeId).length;

  const m1 = findMeme(match.meme1_id);
  const m2 = findMeme(match.meme2_id);
  const m3 = match.meme3_id ? findMeme(match.meme3_id) : null;

  return {
    ...match,
    meme1: m1 ? { ...m1, votes: countVotes(match.id, match.meme1_id) } : null,
    meme2: m2 ? { ...m2, votes: countVotes(match.id, match.meme2_id) } : null,
    meme3: m3 ? { ...m3, votes: countVotes(match.id, match.meme3_id) } : null,
    winner: match.winner_id ? findMeme(match.winner_id) : null
  };
}

function buildTournamentData(t, data) {
  const rounds = data.rounds
    .filter(r => r.tournament_id === t.id)
    .sort((a, b) => a.round_number - b.round_number);

  return {
    ...t,
    rounds: rounds.map(r => ({
      ...r,
      matches: data.matches
        .filter(m => m.round_id === r.id)
        .sort((a, b) => a.id - b.id)
        .map(m => buildMatchData(m, data))
    }))
  };
}

function createMatchesInRound(roundId, memes, data) {
  const list = [...memes];
  let i = 0;
  while (i < list.length) {
    const remaining = list.length - i;
    const match = {
      id: nextId(data, 'matches'),
      round_id: roundId,
      meme1_id: list[i].id,
      meme2_id: list[i + 1].id,
      meme3_id: remaining === 3 ? list[i + 2].id : null,
      winner_id: null,
      status: 'active'
    };
    data.matches.push(match);
    i += remaining === 3 ? 3 : 2;
  }
}

// ─── Placement calculation ────────────────────────────────────────────────────
function calculatePlacements(tournamentId, data) {
  const rounds = data.rounds
    .filter(r => r.tournament_id === tournamentId)
    .sort((a, b) => b.round_number - a.round_number);
  if (!rounds.length) return [];

  const result = [];

  // Winner from last round
  const lastRound = rounds[0];
  const finalMatches = data.matches.filter(m => m.round_id === lastRound.id && m.status === 'completed');
  finalMatches.forEach(m => {
    if (m.winner_id) {
      const meme = data.memes.find(x => x.id === m.winner_id);
      if (meme) result.push({ meme, placement: 1, round_eliminated: null, pct: 100, votes: null, total_votes: null });
    }
  });

  let nextPlace = 2;
  for (const round of rounds) {
    const rMatches = data.matches.filter(m => m.round_id === round.id && m.status === 'completed');
    const losersGroup = [];
    for (const match of rMatches) {
      const ids = [match.meme1_id, match.meme2_id, match.meme3_id].filter(Boolean);
      const losers = ids.filter(id => id !== match.winner_id && !result.find(r => r.meme.id === id));
      for (const lid of losers) {
        const meme = data.memes.find(m => m.id === lid);
        if (!meme) continue;
        const mv = data.votes.filter(v => v.match_id === match.id && v.meme_id === lid).length;
        const tv = data.votes.filter(v => v.match_id === match.id).length;
        losersGroup.push({
          meme,
          placement: 0,
          round_eliminated: round.round_number,
          votes: mv,
          total_votes: tv,
          pct: tv > 0 ? Math.round(mv / tv * 100) : 0
        });
      }
    }
    losersGroup.sort((a, b) => b.pct - a.pct);
    losersGroup.forEach((item, i) => {
      item.placement = nextPlace + i;
      result.push(item);
    });
    nextPlace += losersGroup.length;
  }

  return result.sort((a, b) => a.placement - b.placement);
}

// ─── Tournament Routes ────────────────────────────────────────────────────────
app.get('/api/tournament', (req, res) => {
  const data = dbLoad();
  const active = data.tournaments.find(t => t.status === 'active');
  if (active) return res.json({ status: 'active', tournament: buildTournamentData(active, data) });

  const completed = [...data.tournaments].reverse().find(t => t.status === 'completed');
  if (completed) return res.json({ status: 'completed', tournament: buildTournamentData(completed, data) });

  res.json(null);
});

app.post('/api/tournament/start', adminAuth, (req, res) => {
  const data = dbLoad();
  if (data.tournaments.find(t => t.status === 'active')) {
    return res.status(400).json({ error: 'Turnier läuft bereits' });
  }

  // Support memeIds selection
  let memes;
  const { memeIds } = req.body;
  if (Array.isArray(memeIds) && memeIds.length >= 2) {
    memes = memeIds
      .map(id => data.memes.find(m => m.id === Number(id)))
      .filter(Boolean);
    if (memes.length < 2) return res.status(400).json({ error: 'Mindestens 2 gültige Memes erforderlich' });
  } else {
    memes = [...data.memes];
    if (memes.length < 2) return res.status(400).json({ error: 'Mindestens 2 Memes erforderlich' });
  }

  // Shuffle memes
  memes = memes.sort(() => Math.random() - 0.5);

  const name = req.body.name?.trim() ||
    `Meme of the Month – ${new Date().toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}`;

  const tournament = {
    id: nextId(data, 'tournaments'),
    name,
    status: 'active',
    created_at: new Date().toISOString()
  };
  data.tournaments.push(tournament);

  const round = {
    id: nextId(data, 'rounds'),
    tournament_id: tournament.id,
    round_number: 1,
    status: 'active'
  };
  data.rounds.push(round);

  createMatchesInRound(round.id, memes, data);
  dbSave(data);
  res.json({ success: true, tournamentId: tournament.id });
});

app.delete('/api/tournament', adminAuth, (req, res) => {
  const data = dbLoad();
  const t = data.tournaments.find(t => t.status === 'active');
  if (!t) return res.status(404).json({ error: 'Kein aktives Turnier' });

  const roundIds = data.rounds.filter(r => r.tournament_id === t.id).map(r => r.id);
  const matchIds = data.matches.filter(m => roundIds.includes(m.round_id)).map(m => m.id);

  data.votes = data.votes.filter(v => !matchIds.includes(v.match_id));
  data.matches = data.matches.filter(m => !roundIds.includes(m.round_id));
  data.rounds = data.rounds.filter(r => r.tournament_id !== t.id);
  data.tournaments = data.tournaments.filter(x => x.id !== t.id);
  dbSave(data);
  res.json({ success: true });
});

// Delete tournament from history
app.delete('/api/tournaments/:id', adminAuth, (req, res) => {
  const id = Number(req.params.id);
  const data = dbLoad();
  const t = data.tournaments.find(t => t.id === id);
  if (!t) return res.status(404).json({ error: 'Turnier nicht gefunden' });
  if (t.status === 'active') return res.status(400).json({ error: 'Aktives Turnier kann nicht gelöscht werden' });

  const roundIds = data.rounds.filter(r => r.tournament_id === id).map(r => r.id);
  const matchIds = data.matches.filter(m => roundIds.includes(m.round_id)).map(m => m.id);

  data.votes = data.votes.filter(v => !matchIds.includes(v.match_id));
  data.matches = data.matches.filter(m => !roundIds.includes(m.round_id));
  data.rounds = data.rounds.filter(r => r.tournament_id !== id);
  data.tournaments = data.tournaments.filter(x => x.id !== id);
  dbSave(data);
  res.json({ success: true });
});

// ─── Vote ─────────────────────────────────────────────────────────────────────
app.post('/api/vote', userAuth, (req, res) => {
  const { matchId, memeId } = req.body;
  const userId = req.userId;
  if (!matchId || !memeId) return res.status(400).json({ error: 'Fehlende Felder' });

  const data = dbLoad();
  const match = data.matches.find(m => m.id === Number(matchId));
  if (!match) return res.status(404).json({ error: 'Match nicht gefunden' });
  if (match.status !== 'active') return res.status(400).json({ error: 'Match ist beendet' });

  const validIds = [match.meme1_id, match.meme2_id, match.meme3_id].filter(Boolean);
  if (!validIds.includes(Number(memeId))) return res.status(400).json({ error: 'Ungültiges Meme' });

  const alreadyVoted = data.votes.find(v => v.match_id === Number(matchId) && v.user_id === userId);
  if (alreadyVoted) return res.status(400).json({ error: 'Bereits abgestimmt' });

  data.votes.push({
    id: nextId(data, 'votes'),
    match_id: Number(matchId),
    meme_id: Number(memeId),
    user_id: userId,
    created_at: new Date().toISOString()
  });
  dbSave(data);

  const votes = {};
  for (const id of validIds) {
    votes[id] = data.votes.filter(v => v.match_id === Number(matchId) && v.meme_id === id).length;
  }
  res.json({ success: true, votes });
});

// Get user's votes (replaces /api/votes/:sessionId)
app.get('/api/votes/user', userAuth, (req, res) => {
  const data = dbLoad();
  res.json(
    data.votes
      .filter(v => v.user_id === req.userId)
      .map(v => ({ match_id: v.match_id, meme_id: v.meme_id }))
  );
});

// Delete a vote (replaces /api/votes/:sessionId/:matchId)
app.delete('/api/votes/user/:matchId', userAuth, (req, res) => {
  const userId = req.userId;
  const matchId = Number(req.params.matchId);

  const data = dbLoad();
  const match = data.matches.find(m => m.id === matchId);
  if (!match) return res.status(404).json({ error: 'Match nicht gefunden' });
  if (match.status !== 'active') return res.status(400).json({ error: 'Match ist bereits beendet' });

  const before = data.votes.length;
  data.votes = data.votes.filter(v => !(v.user_id === userId && v.match_id === matchId));
  if (data.votes.length === before) return res.status(404).json({ error: 'Kein Vote gefunden' });

  dbSave(data);
  res.json({ success: true });
});

// ─── Close Match ──────────────────────────────────────────────────────────────
app.post('/api/matches/:id/close', adminAuth, (req, res) => {
  const id = Number(req.params.id);
  const data = dbLoad();
  const match = data.matches.find(m => m.id === id);
  if (!match) return res.status(404).json({ error: 'Nicht gefunden' });
  if (match.status !== 'active') return res.status(400).json({ error: 'Bereits geschlossen' });

  const validIds = [match.meme1_id, match.meme2_id, match.meme3_id].filter(Boolean);
  const candidates = validIds.map(mId => ({
    id: mId,
    votes: data.votes.filter(v => v.match_id === id && v.meme_id === mId).length
  }));

  const maxVotes = Math.max(...candidates.map(c => c.votes));
  const tied = candidates.filter(c => c.votes === maxVotes);
  const winner = tied[Math.floor(Math.random() * tied.length)];

  match.winner_id = winner.id;
  match.status = 'completed';

  // Check if round is complete
  const round = data.rounds.find(r => r.id === match.round_id);
  const roundMatches = data.matches.filter(m => m.round_id === round.id);
  const stillActive = roundMatches.filter(m => m.status === 'active');

  let nextRoundCreated = false;
  let tournamentDone = false;

  if (stillActive.length === 0) {
    round.status = 'completed';

    // Collect winners
    const winnerIds = [...new Set(roundMatches.map(m => m.winner_id).filter(Boolean))];
    const winnerMemes = winnerIds.map(wId => data.memes.find(m => m.id === wId)).filter(Boolean);

    if (winnerMemes.length <= 1) {
      const tournament = data.tournaments.find(t => t.id === round.tournament_id);
      if (tournament) tournament.status = 'completed';
      tournamentDone = true;
    } else {
      const nextRound = {
        id: nextId(data, 'rounds'),
        tournament_id: round.tournament_id,
        round_number: round.round_number + 1,
        status: 'active'
      };
      data.rounds.push(nextRound);
      createMatchesInRound(nextRound.id, winnerMemes, data);
      nextRoundCreated = true;
    }
  }

  dbSave(data);
  res.json({ success: true, winnerId: winner.id, isTie: tied.length > 1, nextRoundCreated, tournamentDone });
});

// ─── Graceful Shutdown ────────────────────────────────────────────────────────
app.post('/api/admin/shutdown', adminAuth, (req, res) => {
  res.json({ success: true, message: 'Server wird gestoppt…' });
  setTimeout(() => process.exit(0), 500);
});

// ─── History (public, for Hall of Fame) ──────────────────────────────────────
app.get('/api/tournaments/history', (req, res) => {
  const data = dbLoad();
  const completed = data.tournaments
    .filter(t => t.status === 'completed')
    .reverse();

  res.json(completed.map(t => {
    const rounds = data.rounds.filter(r => r.tournament_id === t.id).sort((a, b) => b.round_number - a.round_number);
    const lastRound = rounds[0];
    const finalMatches = lastRound ? data.matches.filter(m => m.round_id === lastRound.id) : [];
    const winnerId = finalMatches[0]?.winner_id;
    const winner = winnerId ? data.memes.find(m => m.id === winnerId) : null;
    return { ...t, winner: winner || null };
  }));
});

// ─── Admin History (with full placements) ────────────────────────────────────
app.get('/api/admin/tournaments/history', adminAuth, (req, res) => {
  const data = dbLoad();
  const completed = data.tournaments
    .filter(t => t.status === 'completed')
    .reverse();

  res.json(completed.map(t => {
    const placements = calculatePlacements(t.id, data);
    return {
      ...t,
      placements
    };
  }));
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  const os = require('os');
  const nets = os.networkInterfaces();
  const ips = Object.values(nets).flat().filter(n => n.family === 'IPv4' && !n.internal).map(n => n.address);
  console.log(`\n  Meme Tournament lauft auf:`);
  console.log(`    http://localhost:${PORT}  (nur du)`);
  ips.forEach(ip => console.log(`    http://${ip}:${PORT}  (Netzwerk)`));
  console.log(`\n  Admin Passwort: ${ADMIN_PASSWORD}\n`);
});
