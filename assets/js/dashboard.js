import { supabase } from './supabase.js';

// DOM Elements
const authView = document.getElementById('authView');
const appView = document.getElementById('appView');
const tabbar = document.getElementById('tabbar');
const authForm = document.getElementById('authForm');
const authSubmit = document.getElementById('authSubmit');
const authHint = document.getElementById('authHint');
let currentMode = 'login';

// Countdown Logic
const cdValue = document.getElementById('countdown');
const cdBar = document.getElementById('cdBar');

function updateCountdown() {
  const now = new Date();
  const endOfWeek = new Date(now);
  // Set to Sunday 23:59:59 of current week
  endOfWeek.setDate(now.getDate() + (7 - now.getDay()) % 7);
  endOfWeek.setHours(23, 59, 59, 999);

  const diff = endOfWeek - now;
  const d = Math.floor(diff / (1000 * 60 * 60 * 24));
  const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const m = Math.floor((diff / 1000 / 60) % 60);
  const s = Math.floor((diff / 1000) % 60);

  cdValue.textContent = `${d}d ${h}h ${m}m ${s}s`;
  
  // Calculate bar percentage (assuming 7 day week)
  const totalMs = 7 * 24 * 60 * 60 * 1000;
  const pct = (diff / totalMs) * 100;
  cdBar.style.width = `${pct}%`;
}
setInterval(updateCountdown, 1000);
updateCountdown();

// Auth UI Toggle
document.querySelectorAll('.seg-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('is-active'));
    e.target.classList.add('is-active');
    currentMode = e.target.dataset.mode;
    document.getElementById('nameField').hidden = currentMode === 'login';
    authSubmit.textContent = currentMode === 'login' ? 'Log in' : 'Create account';
  });
});

// Auth Handler
authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  authSubmit.disabled = true;
  authHint.textContent = '';
  
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  const fullName = document.getElementById('fullName').value;

  try {
    if (currentMode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } else {
      const { error } = await supabase.auth.signUp({ 
        email, password,
        options: { data: { full_name: fullName } }
      });
      if (error) throw error;
      authHint.textContent = "Check your email for the confirmation link!";
      authHint.style.color = "var(--green)";
    }
  } catch (err) {
    authHint.textContent = err.message;
  } finally {
    authSubmit.disabled = false;
  }
});

// Check Session
async function checkSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    showApp(session.user);
  } else {
    authView.hidden = false;
    appView.hidden = true;
    tabbar.hidden = true;
  }
}

// Load App Data
async function showApp(user) {
  authView.hidden = true;
  appView.hidden = false;
  tabbar.hidden = false;

  // Get Profile & Stats
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  document.getElementById('userName').textContent = profile?.full_name || user.email;
  document.getElementById('avatar').textContent = profile?.full_name?.charAt(0).toUpperCase() || 'A';
  document.getElementById('statXp').textContent = profile?.total_xp || '0';

  // Get Active Quiz
  const { data: quiz } = await supabase.from('quizzes').select('*').eq('is_active', true).limit(1).single();
  if (quiz) {
    document.getElementById('quizTitle').textContent = quiz.title;
    document.getElementById('quizWeek').textContent = `Week ${quiz.week_number}`;
    checkSubmission(quiz.id, user.id);
    loadLeaderboard(quiz.id, user.id);
  }
}

// Check if user already played
async function checkSubmission(quizId, userId) {
  const startBtn = document.getElementById('startBtn');
  const startHint = document.getElementById('startHint');
  
  const { data } = await supabase.from('submissions').select('score').eq('quiz_id', quizId).eq('user_id', userId).single();
  
  if (data) {
    startBtn.disabled = true;
    startBtn.textContent = `Completed (Score: ${data.score}/10)`;
    startHint.textContent = "Come back next week for the new quiz!";
    document.getElementById('statBest').textContent = `${data.score}/10`;
  } else {
    startBtn.onclick = () => window.location.href = 'quiz.html';
  }
}

// Mini Leaderboard
async function loadLeaderboard(quizId, userId) {
  const { data } = await supabase.from('weekly_leaderboard')
    .select('*')
    .eq('quiz_id', quizId)
    .order('rank', { ascending: true })
    .limit(3);

  const board = document.getElementById('miniBoard');
  board.innerHTML = '';
  
  if (!data || data.length === 0) {
    board.innerHTML = '<li style="color:var(--muted);text-align:center;">No submissions yet. Be the first!</li>';
    return;
  }

  data.forEach(row => {
    // Since mini board might not show current user if they aren't top 3, 
    // we just show the top 3.
    board.innerHTML += `
      <li>
        <span class="rank">#${row.rank}</span>
        <span class="avatar" style="width:32px;height:32px;font-size:0.9rem;">${row.full_name?.charAt(0) || '?'}</span>
        <span class="row-name">${row.full_name}</span>
        <span class="row-score">${row.score}/10</span>
      </li>
    `;
  });
}

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await supabase.auth.signOut();
  window.location.reload();
});

checkSession();
