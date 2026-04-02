let adminPassword = '';
let pendingFile = null;
let tournamentState = null;
let selectedMemeIds = new Set();
let allMemes = [];

// ── Init ─────────────────────────────────────────────────────────────────────
function init() {
  const saved = localStorage.getItem('adminPassword');
  if (saved) {
    adminPassword = saved;
    document.getElementById('password-input').value = saved;
    verifyAndShow();
  }
}

async function login() {
  const pw = document.getElementById('password-input').value.trim();
  if (!pw) return;
  adminPassword = pw;

  const res = await fetch('/api/admin/verify', {
    headers: { 'x-admin-password': pw }
  });

  if (res.ok) {
    localStorage.setItem('adminPassword', pw);
    showAdmin();
  } else {
    const err = document.getElementById('login-error');
    err.textContent = 'Falsches Passwort';
    err.classList.remove('hidden');
  }
}

async function verifyAndShow() {
  const res = await fetch('/api/admin/verify', {
    headers: { 'x-admin-password': adminPassword }
  });
  if (res.ok) {
    showAdmin();
  } else {
    localStorage.removeItem('adminPassword');
    adminPassword = '';
  }
}

function showAdmin() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('admin-content').classList.remove('hidden');
  document.getElementById('btn-logout').style.display = '';
  loadAll();
}

function logout() {
  localStorage.removeItem('adminPassword');
  adminPassword = '';
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('admin-content').classList.add('hidden');
  document.getElementById('btn-logout').style.display = 'none';
}

async function loadAll() {
  await Promise.all([
    loadTournament(),
    loadMemes(),
    loadUsers(),
    loadTournamentHistory()
  ]);
}

// ── Tournament ────────────────────────────────────────────────────────────────
async function loadTournament() {
  const res = await fetch('/api/tournament');
  tournamentState = await res.json();
  renderTournamentPanel();
}

function renderTournamentPanel() {
  const s = tournamentState;
  const statusEl = document.getElementById('tournament-status');
  const startPanel = document.getElementById('start-tournament-panel');
  const resetPanel = document.getElementById('reset-tournament-panel');
  const matchesSection = document.getElementById('active-matches-section');

  if (!s || s.status !== 'active') {
    statusEl.innerHTML = `
      <div class="t-status">
        <div class="t-status-dot gray"></div>
        <span>Kein aktives Turnier</span>
      </div>
    `;
    startPanel.classList.remove('hidden');
    resetPanel.classList.add('hidden');
    matchesSection.style.display = 'none';
    // Load meme selection when no active tournament
    loadMemeSelection();
    return;
  }

  const t = s.tournament;
  const activeRound = t.rounds.find(r => r.status === 'active');
  const totalMatches = t.rounds.reduce((sum, r) => sum + r.matches.length, 0);
  const doneMatches = t.rounds.reduce((sum, r) => sum + r.matches.filter(m => m.status === 'completed').length, 0);

  statusEl.innerHTML = `
    <div class="t-status">
      <div class="t-status-dot green"></div>
      <span><strong>${esc(t.name)}</strong> — Runde ${activeRound?.round_number || '?'} — ${doneMatches}/${totalMatches} Matches abgeschlossen</span>
    </div>
  `;

  startPanel.classList.add('hidden');
  resetPanel.classList.remove('hidden');
  matchesSection.style.display = '';

  // Render active matches
  const activeMatches = activeRound?.matches.filter(m => m.status === 'active') || [];

  if (activeMatches.length === 0) {
    document.getElementById('admin-matches').innerHTML =
      '<p style="color:var(--text-muted);font-size:0.9rem">Alle Matches dieser Runde sind abgeschlossen.</p>';
    return;
  }

  let html = '';
  for (const match of activeMatches) {
    const memes = [match.meme1, match.meme2];
    if (match.meme3) memes.push(match.meme3);

    const totalVotes = memes.reduce((s, m) => s + (m.votes || 0), 0);

    const pills = memes.map((meme, i) => {
      const pct = totalVotes > 0 ? Math.round((meme.votes / totalVotes) * 100) : 0;
      return `
        ${i > 0 ? '<span class="admin-match-vs">VS</span>' : ''}
        <div class="admin-meme-pill">
          <img src="/uploads/${esc(meme.filename)}" alt="${esc(meme.name)}">
          <span>${esc(meme.name)}</span>
          <span class="admin-vote-count">${meme.votes} ✓ (${pct}%)</span>
        </div>
      `;
    }).join('');

    html += `
      <div class="admin-match">
        <div class="admin-match-memes">${pills}</div>
        <button class="btn btn-primary btn-sm" onclick="closeMatch(${match.id})">Match beenden</button>
      </div>
    `;
  }
  document.getElementById('admin-matches').innerHTML = html;
}

// ── Meme Selection for Tournament ─────────────────────────────────────────────
function loadMemeSelection() {
  const grid = document.getElementById('meme-select-grid');
  if (!grid) return;

  // Sort by created_at descending (newest first)
  const sorted = [...allMemes].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  if (sorted.length === 0) {
    grid.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem">Keine Memes vorhanden.</p>';
    updateMemeSelectCounter();
    return;
  }

  grid.innerHTML = sorted.map(meme => {
    const dateStr = new Date(meme.created_at).toLocaleDateString('de-DE', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    });
    const selected = selectedMemeIds.has(meme.id) ? 'selected' : '';
    return `
      <div class="meme-select-item ${selected}" id="meme-sel-${meme.id}" onclick="toggleMemeSelect(${meme.id})">
        <div class="meme-select-check">✓</div>
        <img src="/uploads/${esc(meme.filename)}" alt="${esc(meme.name)}" loading="lazy">
        <div class="meme-select-info">
          <div class="meme-select-name" title="${esc(meme.name)}">${esc(meme.name)}</div>
          <div class="meme-select-date">${dateStr}</div>
        </div>
      </div>
    `;
  }).join('');

  updateMemeSelectCounter();
}

function toggleMemeSelect(id) {
  if (selectedMemeIds.has(id)) {
    selectedMemeIds.delete(id);
    document.getElementById(`meme-sel-${id}`)?.classList.remove('selected');
  } else {
    selectedMemeIds.add(id);
    document.getElementById(`meme-sel-${id}`)?.classList.add('selected');
  }
  updateMemeSelectCounter();
}

function selectAllMemes() {
  for (const meme of allMemes) {
    selectedMemeIds.add(meme.id);
    document.getElementById(`meme-sel-${meme.id}`)?.classList.add('selected');
  }
  updateMemeSelectCounter();
}

function deselectAllMemes() {
  selectedMemeIds.clear();
  document.querySelectorAll('.meme-select-item.selected').forEach(el => el.classList.remove('selected'));
  updateMemeSelectCounter();
}

function updateMemeSelectCounter() {
  const counter = document.getElementById('meme-select-counter');
  const btn = document.getElementById('start-tournament-btn');
  if (counter) counter.textContent = `${selectedMemeIds.size} von ${allMemes.length} Memes ausgewählt`;
  if (btn) btn.disabled = selectedMemeIds.size < 2;
}

async function startTournament() {
  const name = document.getElementById('tournament-name').value.trim();
  const memeIds = selectedMemeIds.size >= 2 ? [...selectedMemeIds] : undefined;

  const body = { name };
  if (memeIds) body.memeIds = memeIds;

  const res = await fetch('/api/tournament/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPassword },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) { showToast(data.error, 'error'); return; }
  showToast('Turnier gestartet!', 'success');
  selectedMemeIds.clear();
  await loadTournament();
  await loadTournamentHistory();
}

async function resetTournament() {
  if (!confirm('Turnier wirklich zurücksetzen? Alle Votes werden gelöscht.')) return;
  const res = await fetch('/api/tournament', {
    method: 'DELETE',
    headers: { 'x-admin-password': adminPassword }
  });
  const data = await res.json();
  if (!res.ok) { showToast(data.error, 'error'); return; }
  showToast('Turnier zurückgesetzt', 'success');
  await loadTournament();
  await loadTournamentHistory();
}

async function closeMatch(matchId) {
  const res = await fetch(`/api/matches/${matchId}/close`, {
    method: 'POST',
    headers: { 'x-admin-password': adminPassword }
  });
  const data = await res.json();
  if (!res.ok) { showToast(data.error, 'error'); return; }

  let msg = 'Match beendet!';
  if (data.isTie) msg += ' (Gleichstand – Zufallsentscheidung)';
  if (data.nextRoundCreated) msg += ' Nächste Runde gestartet!';
  if (data.tournamentDone) msg += ' 🏆 Turnier beendet!';
  showToast(msg, 'success');
  await loadTournament();
  if (data.tournamentDone) await loadTournamentHistory();
}

// ── User Management ───────────────────────────────────────────────────────────
async function loadUsers() {
  const res = await fetch('/api/admin/users', {
    headers: { 'x-admin-password': adminPassword }
  });
  if (!res.ok) return;
  const users = await res.json();
  renderUserList(users);
}

function renderUserList(users) {
  const el = document.getElementById('user-list');
  if (!el) return;
  if (users.length === 0) {
    el.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem">Keine Nutzer vorhanden.</p>';
    return;
  }
  el.innerHTML = users.map(u => `
    <div class="user-row">
      <div class="user-info">
        <span class="user-name">${esc(u.username)}</span>
        <span class="user-status ${u.is_active ? 'user-status--active' : 'user-status--inactive'}">
          ${u.is_active ? '● Aktiv' : '○ Inaktiv'}
        </span>
        <span class="user-date">${new Date(u.created_at).toLocaleDateString('de-DE')}</span>
      </div>
      <div class="user-actions">
        <button class="btn btn-secondary btn-sm" onclick="resetPassword(${u.id}, '${esc(u.username)}')">🔑 Passwort</button>
        <button class="btn btn-secondary btn-sm" onclick="toggleUserActive(${u.id}, ${u.is_active}, '${esc(u.username)}')">
          ${u.is_active ? '🔒 Deaktivieren' : '🔓 Aktivieren'}
        </button>
        <button class="btn btn-danger btn-sm" onclick="deleteUser(${u.id}, '${esc(u.username)}')">Löschen</button>
      </div>
    </div>
  `).join('');
}

async function createUser() {
  const username = document.getElementById('new-username').value.trim();
  const password = document.getElementById('new-password').value;
  if (!username) { showToast('Benutzername erforderlich', 'error'); return; }
  if (!password) { showToast('Passwort erforderlich', 'error'); return; }

  const res = await fetch('/api/admin/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPassword },
    body: JSON.stringify({ username, password })
  });
  const data = await res.json();
  if (!res.ok) { showToast(data.error, 'error'); return; }

  document.getElementById('new-username').value = '';
  document.getElementById('new-password').value = '';
  showToast(`Nutzer "${username}" angelegt!`, 'success');
  await loadUsers();
}

async function deleteUser(id, name) {
  if (!confirm(`Nutzer "${name}" wirklich löschen?`)) return;
  const res = await fetch(`/api/admin/users/${id}`, {
    method: 'DELETE',
    headers: { 'x-admin-password': adminPassword }
  });
  const data = await res.json();
  if (!res.ok) { showToast(data.error, 'error'); return; }
  showToast(`Nutzer "${name}" gelöscht`, 'success');
  await loadUsers();
}

async function resetPassword(id, name) {
  const newPw = prompt(`Neues Passwort für "${name}":`);
  if (!newPw) return;
  const res = await fetch(`/api/admin/users/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPassword },
    body: JSON.stringify({ password: newPw })
  });
  const data = await res.json();
  if (!res.ok) { showToast(data.error, 'error'); return; }
  showToast(`Passwort für "${name}" geändert`, 'success');
}

async function toggleUserActive(id, currentActive, name) {
  const newActive = !currentActive;
  const res = await fetch(`/api/admin/users/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPassword },
    body: JSON.stringify({ is_active: newActive })
  });
  const data = await res.json();
  if (!res.ok) { showToast(data.error, 'error'); return; }
  showToast(`Nutzer "${name}" ${newActive ? 'aktiviert' : 'deaktiviert'}`, 'success');
  await loadUsers();
}

// ── Memes ─────────────────────────────────────────────────────────────────────
async function loadMemes() {
  const res = await fetch('/api/memes');
  allMemes = await res.json();
  renderGallery(allMemes);
  // Refresh selection grid if start panel is visible
  if (!document.getElementById('start-tournament-panel').classList.contains('hidden')) {
    loadMemeSelection();
  }
}

function renderGallery(memes) {
  document.getElementById('meme-count').textContent = memes.length;
  if (memes.length === 0) {
    document.getElementById('meme-gallery').innerHTML =
      '<p style="color:var(--text-muted);font-size:0.85rem">Noch keine Memes hochgeladen.</p>';
    return;
  }
  document.getElementById('meme-gallery').innerHTML = memes.map(meme => `
    <div class="gallery-meme">
      <img src="/uploads/${esc(meme.filename)}" alt="${esc(meme.name)}" loading="lazy">
      <div class="gallery-meme-info">
        <div class="gallery-meme-name" id="meme-title-${meme.id}" title="${esc(meme.name)}">${esc(meme.name)}</div>
        <div class="gallery-meme-actions">
          <button class="btn btn-secondary btn-sm gallery-edit-btn" onclick="editMemeTitle(${meme.id}, '${esc(meme.name).replace(/'/g,'&#39;')}')">✏️</button>
          <button class="btn btn-danger btn-sm" onclick="deleteMeme(${meme.id}, '${esc(meme.name).replace(/'/g,'&#39;')}')">Löschen</button>
        </div>
      </div>
    </div>
  `).join('');
}

async function deleteMeme(id, name) {
  if (!confirm(`"${name}" wirklich löschen?`)) return;
  const res = await fetch(`/api/memes/${id}`, {
    method: 'DELETE',
    headers: { 'x-admin-password': adminPassword }
  });
  const data = await res.json();
  if (!res.ok) { showToast(data.error, 'error'); return; }
  showToast('Meme gelöscht', 'success');
  await loadMemes();
}

// Inline title editing
function editMemeTitle(id, currentName) {
  const titleEl = document.getElementById(`meme-title-${id}`);
  if (!titleEl) return;

  // Replace text with input
  const input = document.createElement('input');
  input.type = 'text';
  input.value = currentName;
  input.className = 'input-field gallery-title-input';
  input.maxLength = 100;

  const saveTitle = async () => {
    const newName = input.value.trim();
    if (!newName || newName === currentName) {
      titleEl.textContent = currentName;
      titleEl.style.display = '';
      input.replaceWith(titleEl);
      return;
    }
    const res = await fetch(`/api/memes/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPassword },
      body: JSON.stringify({ name: newName })
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error, 'error');
      titleEl.textContent = currentName;
    } else {
      titleEl.textContent = newName;
      showToast('Titel gespeichert', 'success');
      await loadMemes();
      return;
    }
    titleEl.style.display = '';
    input.replaceWith(titleEl);
  };

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); saveTitle(); }
    if (e.key === 'Escape') {
      titleEl.textContent = currentName;
      titleEl.style.display = '';
      input.replaceWith(titleEl);
    }
  });
  input.addEventListener('blur', saveTitle);

  titleEl.replaceWith(input);
  input.focus();
  input.select();
}

// ── Tournament History ────────────────────────────────────────────────────────
async function loadTournamentHistory() {
  const res = await fetch('/api/admin/tournaments/history', {
    headers: { 'x-admin-password': adminPassword }
  });
  if (!res.ok) return;
  const tournaments = await res.json();
  renderTournamentHistory(tournaments);
}

function placementLabel(n) {
  if (n === 1) return '🥇 1.';
  if (n === 2) return '🥈 2.';
  if (n === 3) return '🥉 3.';
  return `${n}.`;
}

function renderTournamentHistory(tournaments) {
  const el = document.getElementById('tournament-history-list');
  if (!el) return;

  if (tournaments.length === 0) {
    el.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem">Noch keine abgeschlossenen Turniere.</p>';
    return;
  }

  el.innerHTML = tournaments.map(t => {
    const dateStr = new Date(t.created_at).toLocaleDateString('de-DE', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    });

    const placementsHtml = (t.placements || []).map(p => `
      <div class="placement-row">
        <span class="placement-label">${placementLabel(p.placement)}</span>
        <img class="placement-thumb" src="/uploads/${esc(p.meme.filename)}" alt="${esc(p.meme.name)}">
        <span class="placement-name">${esc(p.meme.name)}</span>
        ${p.pct !== null && p.pct !== 100 ? `<span class="placement-pct">${p.pct}%</span>` : ''}
      </div>
    `).join('');

    return `
      <div class="history-tournament-card">
        <div class="history-t-header">
          <div>
            <span class="history-t-name">${esc(t.name)}</span>
            <span class="history-t-date">${dateStr}</span>
          </div>
          <button class="btn btn-danger btn-sm" onclick="deleteTournamentHistory(${t.id}, '${esc(t.name).replace(/'/g, '&#39;')}')">Löschen</button>
        </div>
        <div class="placement-list">
          ${placementsHtml || '<p style="color:var(--text-muted);font-size:0.8rem">Keine Platzierungen verfügbar.</p>'}
        </div>
      </div>
    `;
  }).join('');
}

async function deleteTournamentHistory(id, name) {
  if (!confirm(`Turnier '${name}' wirklich aus der History löschen?`)) return;
  const res = await fetch(`/api/tournaments/${id}`, {
    method: 'DELETE',
    headers: { 'x-admin-password': adminPassword }
  });
  const data = await res.json();
  if (!res.ok) { showToast(data.error, 'error'); return; }
  showToast('Turnier aus Historie gelöscht', 'success');
  await loadTournamentHistory();
}

// ── Upload ────────────────────────────────────────────────────────────────────
function handleDragOver(e) {
  e.preventDefault();
  document.getElementById('upload-area').classList.add('drag-over');
}
function handleDragLeave() {
  document.getElementById('upload-area').classList.remove('drag-over');
}
function handleDrop(e) {
  e.preventDefault();
  document.getElementById('upload-area').classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) showPreview(file);
}
function handleFileSelect(e) {
  const file = e.target.files[0];
  if (file) showPreview(file);
}

function showPreview(file) {
  pendingFile = file;
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById('preview-img').src = e.target.result;
    // Suggest filename without extension as meme name
    const name = file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
    document.getElementById('meme-name').value = name;
    document.getElementById('upload-area').classList.add('hidden');
    document.getElementById('upload-preview').classList.remove('hidden');
  };
  reader.readAsDataURL(file);
}

function cancelUpload() {
  pendingFile = null;
  document.getElementById('upload-area').classList.remove('hidden');
  document.getElementById('upload-preview').classList.add('hidden');
  document.getElementById('meme-name').value = '';
  document.getElementById('file-input').value = '';
}

async function uploadMeme() {
  const name = document.getElementById('meme-name').value.trim();
  if (!name) { showToast('Bitte einen Namen eingeben', 'error'); return; }
  if (!pendingFile) { showToast('Kein Bild ausgewählt', 'error'); return; }

  const form = new FormData();
  form.append('image', pendingFile);
  form.append('name', name);

  const btn = document.querySelector('#upload-preview .btn-primary');
  btn.disabled = true;
  btn.textContent = 'Lädt hoch...';

  try {
    const res = await fetch('/api/memes', {
      method: 'POST',
      headers: { 'x-admin-password': adminPassword },
      body: form
    });
    const data = await res.json();
    if (!res.ok) { showToast(data.error, 'error'); return; }

    showToast(`"${name}" hochgeladen!`, 'success');
    cancelUpload();
    await loadMemes();
  } finally {
    btn.disabled = false;
    btn.textContent = 'Hochladen';
  }
}

// ── Toast ─────────────────────────────────────────────────────────────────────
let toastTimer = null;
function showToast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast toast-${type}`;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 4000);
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Start ─────────────────────────────────────────────────────────────────────
init();
