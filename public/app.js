// ── Auth State ────────────────────────────────────────────────────────────────
let authToken = localStorage.getItem('authToken') || null;
let currentUser = localStorage.getItem('currentUser') || null;

// ── State ─────────────────────────────────────────────────────────────────────
let currentView = 'voting';
let state = null;       // { status, tournament }
let userVotes = {};     // matchId -> memeId
let refreshTimer = null;

// ── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  if (authToken) {
    // Verify existing token
    try {
      const res = await fetch('/api/auth/verify', {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        currentUser = data.username;
        localStorage.setItem('currentUser', currentUser);
        updateUserDisplay();
        showLoading();
        await loadData();
        scheduleRefresh();
        return;
      }
    } catch (_) {}
    // Token invalid
    clearAuth();
  }
  // Not logged in - check if users exist
  await showLoginModal();
}

function clearAuth() {
  authToken = null;
  currentUser = null;
  localStorage.removeItem('authToken');
  localStorage.removeItem('currentUser');
}

function scheduleRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(loadData, 30000);
}

async function loadData() {
  try {
    const [tRes, vRes] = await Promise.all([
      fetch('/api/tournament'),
      fetch('/api/votes/user', {
        headers: { 'Authorization': `Bearer ${authToken}` }
      })
    ]);
    state = await tRes.json();
    const votes = await vRes.json();
    userVotes = {};
    for (const v of votes) userVotes[v.match_id] = v.meme_id;
    render();
  } catch (e) {
    console.error('Ladefehler:', e);
  }
}

// ── Login Modal ───────────────────────────────────────────────────────────────
async function showLoginModal() {
  const modal = document.getElementById('login-modal');
  const formFields = document.getElementById('login-form-fields');
  const noUsersMsg = document.getElementById('login-no-users-msg');

  // Check if any users exist (try to get a hint from server - we just show the form)
  // We'll detect the "no users" case from a failed login with specific error
  formFields.style.display = '';
  noUsersMsg.classList.add('hidden');

  modal.classList.remove('hidden');
  setTimeout(() => document.getElementById('login-username').focus(), 100);
}

function hideLoginModal() {
  document.getElementById('login-modal').classList.add('hidden');
  document.getElementById('login-error').classList.add('hidden');
  document.getElementById('login-error').textContent = '';
}

async function doLogin() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const errorEl = document.getElementById('login-error');
  const noUsersMsg = document.getElementById('login-no-users-msg');
  const formFields = document.getElementById('login-form-fields');

  if (!username) { showLoginError('Bitte Benutzername eingeben'); return; }
  if (!password) { showLoginError('Bitte Passwort eingeben'); return; }

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();

    if (!res.ok) {
      // Check for "Unbekannter Nutzer" when no users exist at all
      showLoginError(data.error || 'Anmeldung fehlgeschlagen');
      return;
    }

    authToken = data.token;
    currentUser = data.username;
    localStorage.setItem('authToken', authToken);
    localStorage.setItem('currentUser', currentUser);

    hideLoginModal();
    updateUserDisplay();
    showLoading();
    await loadData();
    scheduleRefresh();
  } catch {
    showLoginError('Netzwerkfehler');
  }
}

function showLoginError(msg) {
  const el = document.getElementById('login-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

async function doLogout() {
  if (authToken) {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
    } catch (_) {}
  }
  clearAuth();
  if (refreshTimer) clearInterval(refreshTimer);
  state = null;
  userVotes = {};
  updateUserDisplay();
  setAllHidden();
  await showLoginModal();
}

function updateUserDisplay() {
  const badge = document.getElementById('user-badge');
  const logoutBtn = document.getElementById('btn-logout');
  if (currentUser) {
    badge.textContent = '👤 ' + currentUser;
    badge.style.display = '';
    if (logoutBtn) logoutBtn.style.display = '';
  } else {
    badge.textContent = '';
    badge.style.display = 'none';
    if (logoutBtn) logoutBtn.style.display = 'none';
  }
}

// ── View Switching ────────────────────────────────────────────────────────────
function switchView(view) {
  currentView = view;
  document.querySelectorAll('.nav-btn[id^="btn-"]').forEach(b => b.classList.remove('active'));
  document.getElementById(`btn-${view}`)?.classList.add('active');
  render();
}

// ── Render ────────────────────────────────────────────────────────────────────
function setAllHidden() {
  ['view-voting', 'view-bracket', 'view-winner', 'view-empty', 'view-loading']
    .forEach(id => document.getElementById(id)?.classList.add('hidden'));
}

function showLoading() {
  setAllHidden();
  document.getElementById('view-loading').classList.remove('hidden');
}

function render() {
  setAllHidden();
  if (!state) { document.getElementById('view-empty').classList.remove('hidden'); return; }

  if (state.status === 'completed') {
    document.getElementById('view-winner').classList.remove('hidden');
    renderWinner();
    return;
  }

  if (currentView === 'bracket') {
    document.getElementById('view-bracket').classList.remove('hidden');
    renderBracket();
  } else {
    document.getElementById('view-voting').classList.remove('hidden');
    renderVoting();
  }
}

// ── Voting View ───────────────────────────────────────────────────────────────
function renderVoting() {
  const { tournament } = state;
  if (!tournament) return;

  const activeRound = tournament.rounds.find(r => r.status === 'active');
  if (!activeRound) {
    document.getElementById('round-header').innerHTML = '';
    document.getElementById('matches-container').innerHTML =
      '<div class="waiting-msg">⏳ Lade nächste Runde…</div>';
    return;
  }

  const totalRounds = estimateTotalRounds(tournament);
  document.getElementById('round-header').innerHTML = `
    <div class="round-header">
      <h2>${esc(tournament.name)}</h2>
      <div class="round-badges">
        <div class="round-badge">Runde ${activeRound.round_number} von ~${totalRounds}</div>
        <div class="round-badge round-badge--user">${esc(currentUser || '')}</div>
      </div>
    </div>
  `;

  const active = activeRound.matches.filter(m => m.status === 'active');
  const done   = activeRound.matches.filter(m => m.status === 'completed');

  let html = '';

  if (active.length > 0) {
    const unvoted = active.filter(m => !userVotes[m.id]);
    const voted   = active.filter(m => !!userVotes[m.id]);

    if (unvoted.length > 0) {
      html += `<div class="matches-section">
        <h3 class="section-label section-label--hot">🔥 Jetzt abstimmen!</h3>
        <div class="matches-grid">${unvoted.map(m => matchCard(m)).join('')}</div>
      </div>`;
    }
    if (voted.length > 0) {
      html += `<div class="matches-section">
        <h3 class="section-label">✅ Bereits abgestimmt</h3>
        <div class="matches-grid">${voted.map(m => matchCard(m)).join('')}</div>
      </div>`;
    }
  }

  if (done.length > 0) {
    html += `<div class="matches-section">
      <h3 class="section-label">🏁 Abgeschlossene Duelle</h3>
      <div class="matches-grid">${done.map(m => matchCard(m)).join('')}</div>
    </div>`;
  }

  if (active.length === 0) {
    html += '<div class="waiting-msg">⏳ Warte auf die nächste Runde…</div>';
  }

  document.getElementById('matches-container').innerHTML = html;
}

function estimateTotalRounds(tournament) {
  if (!tournament.rounds.length) return 1;
  const n = tournament.rounds[0].matches.length;
  return Math.ceil(Math.log2(Math.max(n, 1))) + 1;
}

function matchCard(match) {
  const voted  = userVotes[match.id];
  const hasVoted = voted !== undefined;
  const done   = match.status === 'completed';
  const showStats = hasVoted || done;

  const memes = [match.meme1, match.meme2, ...(match.meme3 ? [match.meme3] : [])];
  const total = memes.reduce((s, m) => s + (m.votes || 0), 0);
  const isThreeWay = !!match.meme3;

  const slots = memes.map((meme, i) => {
    const isWinner = done && match.winner_id === meme.id;
    const isMyVote = voted === meme.id;
    const pct = total > 0 ? Math.round((meme.votes / total) * 100) : 0;

    const cls = ['vote-slot',
      isWinner ? 'vote-slot--winner' : '',
      isMyVote ? 'vote-slot--myvote' : '',
      done && !isWinner ? 'vote-slot--lost' : ''
    ].filter(Boolean).join(' ');

    return `
      <div class="${cls}">
        ${isWinner ? '<div class="slot-crown">👑</div>' : ''}
        <div class="slot-image">
          <img src="/uploads/${esc(meme.filename)}" alt="${esc(meme.name)}" loading="lazy">
        </div>
        <div class="slot-footer">
          <div class="slot-name">${esc(meme.name)}</div>
          ${showStats ? `
            <div class="slot-bar-wrap"><div class="slot-bar" style="width:${pct}%"></div></div>
            <div class="slot-votes">${meme.votes} Stimme${meme.votes !== 1 ? 'n' : ''} · ${pct}%</div>
          ` : ''}
          ${!hasVoted && !done
            ? `<button class="btn-vote" onclick="castVote(${match.id},${meme.id})">👍 Abstimmen</button>`
            : ''}
          ${isMyVote && !done ? `
            <div class="slot-myvote-badge">✓ Dein Vote</div>
            <button class="btn-change-vote" onclick="cancelVote(${match.id})">↩ Ändern</button>
          ` : isMyVote ? '<div class="slot-myvote-badge">✓ Dein Vote</div>' : ''}
        </div>
      </div>
    `;
  });

  // Intersperse VS dividers
  const parts = [];
  slots.forEach((s, i) => {
    parts.push(s);
    if (i < slots.length - 1) parts.push(`<div class="vs-badge">VS</div>`);
  });

  const matchNum = (state?.tournament?.rounds ?? [])
    .flatMap(r => r.matches).findIndex(m => m.id === match.id) + 1;

  return `
    <div class="match-card ${done ? 'match-card--done' : ''}" data-match-id="${match.id}">
      <div class="match-header">
        <span class="match-num">Duell ${matchNum > 0 ? '#' + matchNum : ''}</span>
        ${done ? '<span class="match-done-badge">Beendet</span>' : '<span class="match-live-badge">LIVE</span>'}
      </div>
      <div class="match-body ${isThreeWay ? 'match-body--three' : ''}">
        ${parts.join('')}
      </div>
    </div>
  `;
}

// ── Vote ──────────────────────────────────────────────────────────────────────
async function castVote(matchId, memeId) {
  userVotes[matchId] = memeId; // optimistic
  renderVoting();

  try {
    const res = await fetch('/api/vote', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ matchId, memeId })
    });
    const data = await res.json();
    if (!res.ok) {
      delete userVotes[matchId];
      renderVoting();
      if (res.status === 401 || res.status === 403) {
        showToast('Sitzung abgelaufen – bitte neu anmelden', 'error');
        clearAuth();
        setTimeout(() => showLoginModal(), 1500);
      } else {
        showToast(data.error || 'Fehler beim Abstimmen', 'error');
      }
      return;
    }
    applyVoteCounts(matchId, data.votes);
    renderVoting();
    showToast('Stimme abgegeben! 🎉', 'success');
  } catch {
    delete userVotes[matchId];
    renderVoting();
    showToast('Netzwerkfehler', 'error');
  }
}

async function cancelVote(matchId) {
  const prev = userVotes[matchId];
  delete userVotes[matchId]; // optimistic
  renderVoting();

  try {
    const res = await fetch(`/api/votes/user/${matchId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (!res.ok) {
      userVotes[matchId] = prev; // revert
      renderVoting();
      showToast('Konnte Vote nicht entfernen', 'error');
    } else {
      showToast('Vote zurückgenommen – neu abstimmen!', 'success');
    }
  } catch {
    userVotes[matchId] = prev;
    renderVoting();
    showToast('Netzwerkfehler', 'error');
  }
}

function applyVoteCounts(matchId, votes) {
  for (const round of (state?.tournament?.rounds ?? [])) {
    for (const match of round.matches) {
      if (match.id === matchId) {
        for (const key of ['meme1', 'meme2', 'meme3']) {
          if (match[key]) match[key].votes = votes[match[key].id] ?? match[key].votes;
        }
        return;
      }
    }
  }
}

// ── Bracket Tree ──────────────────────────────────────────────────────────────
const SLOT_H  = 170;  // px – vertical space per round-1 match
const CARD_H  = 140;  // px – fixed card height
const MATCH_W = 210;  // px – match card width
const CONN_W  = 54;   // px – connector column width

function renderBracket() {
  const { tournament } = state;
  if (!tournament || !tournament.rounds.length) {
    document.getElementById('bracket-content').innerHTML = '<p class="empty-hint">Noch keine Runden verfügbar.</p>';
    return;
  }

  const rounds  = tournament.rounds;
  const n0      = rounds[0].matches.length;
  const totalH  = n0 * SLOT_H;

  // Outer scroll wrapper + title
  let html = `
    <div class="btree-wrap">
      <h2 class="btree-title">${esc(tournament.name)}</h2>
      <div class="btree-scroll">
        <div class="btree" style="height:${totalH}px">
  `;

  rounds.forEach((round, rIdx) => {
    const n      = round.matches.length;
    const isLast = rIdx === rounds.length - 1;
    const label  = rIdx === 0 ? 'Runde 1' : rIdx === rounds.length - 1 && state.status === 'completed' ? 'Finale' : `Runde ${round.round_number}`;

    // Round column header (outside the absolute-positioned area)
    html += `
      <div class="btree-col-wrap">
        <div class="btree-col-label ${round.status === 'active' ? 'btree-col-label--live' : ''}">
          ${label}${round.status === 'active' ? ' <span class="round-live">LIVE</span>' : ''}
        </div>
        <div class="btree-col" style="width:${MATCH_W}px; height:${totalH}px">
    `;

    round.matches.forEach((match, mIdx) => {
      const centerY = (2 * mIdx + 1) * totalH / (2 * n);
      const topY    = Math.round(centerY - CARD_H / 2);
      const memes   = [match.meme1, match.meme2, ...(match.meme3 ? [match.meme3] : [])];
      const done    = match.status === 'completed';

      html += `<div class="btree-card ${done ? 'btree-card--done' : 'btree-card--active'}"
                    style="top:${topY}px; height:${CARD_H}px" onclick="switchView('voting')">`;

      memes.forEach(meme => {
        const isWinner = match.winner_id === meme.id;
        const isLost   = done && !isWinner;
        html += `
          <div class="btree-meme ${isWinner ? 'btree-meme--win' : ''} ${isLost ? 'btree-meme--lost' : ''}">
            <img src="/uploads/${esc(meme.filename)}" alt="">
            <span class="btree-meme-name">${esc(meme.name)}</span>
            ${isWinner ? '<span class="btree-crown">👑</span>' : ''}
          </div>
        `;
      });

      html += '</div>'; // btree-card
    });

    html += '</div></div>'; // btree-col + btree-col-wrap

    // Connector SVG between this round and the next
    if (!isLast) {
      const nNext = rounds[rIdx + 1].matches.length;
      html += connectorSVG(n, nNext, totalH, CONN_W);
    }
  });

  html += '</div></div></div>'; // btree + btree-scroll + btree-wrap
  document.getElementById('bracket-content').innerHTML = html;
}

function connectorSVG(n1, n2, height, width) {
  const getY = (n, i) => (2 * i + 1) * height / (2 * n);
  const xVert  = width * 0.65;
  const stroke = 'rgba(124,58,237,0.5)';
  const sw     = 2;

  let lines = '';
  let srcIdx = 0;

  for (let j = 0; j < n2; j++) {
    const yTarget = getY(n2, j);
    const remaining = n1 - srcIdx;
    // Last target gets 3 sources if remaining==3, else 2
    const groupSize = (j === n2 - 1 && remaining === 3) ? 3 : 2;

    const ySrcs = [];
    for (let k = 0; k < groupSize && srcIdx < n1; k++) {
      ySrcs.push(getY(n1, srcIdx++));
    }
    if (!ySrcs.length) continue;

    const yTop    = ySrcs[0];
    const yBottom = ySrcs[ySrcs.length - 1];
    const f = v => v.toFixed(2);

    // Horizontal lines: source → vertical rail
    ySrcs.forEach(y => {
      lines += `<line x1="0" y1="${f(y)}" x2="${f(xVert)}" y2="${f(y)}" stroke="${stroke}" stroke-width="${sw}"/>`;
    });
    // Vertical rail connecting all sources
    if (ySrcs.length > 1) {
      lines += `<line x1="${f(xVert)}" y1="${f(yTop)}" x2="${f(xVert)}" y2="${f(yBottom)}" stroke="${stroke}" stroke-width="${sw}"/>`;
    }
    // Horizontal line: midpoint → target
    lines += `<line x1="${f(xVert)}" y1="${f(yTarget)}" x2="${f(width)}" y2="${f(yTarget)}" stroke="${stroke}" stroke-width="${sw}"/>`;
  }

  return `<div class="btree-conn" style="width:${width}px; height:${height}px">
    <svg width="${width}" height="${height}" style="display:block;overflow:visible"><g fill="none">${lines}</g></svg>
  </div>`;
}

// ── Winner View ───────────────────────────────────────────────────────────────
async function renderWinner() {
  const { tournament } = state;
  if (!tournament) return;

  const lastRound  = tournament.rounds[tournament.rounds.length - 1];
  const finalMatch = lastRound?.matches[0];
  const winner     = finalMatch?.winner;
  if (!winner) return;

  document.getElementById('winner-card').innerHTML = `
    <div class="winner-meme-card">
      <img src="/uploads/${esc(winner.filename)}" alt="${esc(winner.name)}" class="winner-img">
      <h2 class="winner-name">🏆 ${esc(winner.name)}</h2>
      <div class="winner-tournament">${esc(tournament.name)}</div>
    </div>
  `;

  try {
    const history = await (await fetch('/api/tournaments/history')).json();
    if (history.length > 1) {
      let html = '<div class="history-section"><h3>🏅 Hall of Fame</h3><div class="history-grid">';
      for (const t of history) {
        if (t.winner) html += `
          <div class="history-card">
            <img src="/uploads/${esc(t.winner.filename)}" alt="${esc(t.winner.name)}">
            <div class="history-name">${esc(t.winner.name)}</div>
            <div class="history-tournament">${esc(t.name)}</div>
          </div>`;
      }
      html += '</div></div>';
      document.getElementById('winner-history').innerHTML = html;
    }
  } catch (_) {}
}

// ── Toast ─────────────────────────────────────────────────────────────────────
let toastTimer = null;
function showToast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast toast-${type}`;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 3500);
}

// ── Utils ─────────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Start ─────────────────────────────────────────────────────────────────────
init();
