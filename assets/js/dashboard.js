import { supabase } from './supabase.js';
import { COUNTRIES, flag } from './countries.js';
import { getTodaysQuiz } from './today.js';

const countrySel = document.getElementById('country');
countrySel.innerHTML = '<option value="">Choose your country</option>' + Object.entries(COUNTRIES).map(([c, n]) => `<option value="${c}">${flag(c)} ${n}</option>`).join('');

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
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const diff = end - now;
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff / 60000) % 60);
  const s = Math.floor((diff / 1000) % 60);
  cdValue.textContent = `${h}h ${m}m ${s}s`;
  cdBar.style.width = `${(diff / 86400000) * 100}%`;
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
    document.getElementById('countryField').hidden = currentMode === 'login';
    authSubmit.textContent = currentMode === 'login' ? 'Log in' : 'Create account';
    document.getElementById('password').autocomplete = currentMode === 'login' ? 'current-password' : 'new-password';
    authHint.textContent = '';
  });
});

// Auth Handler
authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  authHint.textContent = '';
  authHint.style.color = '';

  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const fullName = document.getElementById('fullName').value.trim();
  const problem = !email ? 'Enter your email.'
    : password.length < 6 ? 'Your password needs at least 6 characters.'
    : currentMode === 'signup' && !fullName ? 'Enter your full name.'
    : currentMode === 'signup' && !countrySel.value ? 'Choose your country so it can compete in the Nation Cup.'
    : '';
  if (problem) { authHint.textContent = problem; return; }
  authSubmit.disabled = true;

  try {
    if (currentMode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } else {
      const { data, error } = await supabase.auth.signUp({ 
        email, password,
        options: { data: { full_name: fullName, country: countrySel.value } }
      });
      if (error) throw error;
      if (data?.session) return; // email confirmation is off: signed in already
      authHint.textContent = 'Check your email for the confirmation link, then log in.';
      authHint.style.color = 'var(--green)';
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
    const { error: userError } = await supabase.auth.getUser();
    if (userError && userError.status >= 400 && userError.status < 500) {
      await supabase.auth.signOut();
      authView.hidden = false; appView.hidden = true; tabbar.hidden = true;
      return;
    }
    showApp(session.user);
  } else {
    authView.hidden = false;
    appView.hidden = true;
    tabbar.hidden = true;
  }
}

// Load App Data
let appShown = false;
async function showApp(user) {
  if (appShown) return;
  appShown = true;
  authView.hidden = true;
  appView.hidden = false;
  tabbar.hidden = false;

  // Get Profile & Stats
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
  document.getElementById('userName').textContent = profile?.full_name || user.email;
  document.getElementById('avatar').textContent = profile?.full_name?.charAt(0).toUpperCase() || 'A';
  document.getElementById('statXp').textContent = profile?.total_xp || '0';

  // Get Active Quiz
  const { data: quiz, error: quizError } = await getTodaysQuiz(supabase, '*');
  if (quizError) console.error('Quiz load failed:', quizError);
  if (quiz) {
    document.getElementById('quizTitle').textContent = quiz.title;
    document.getElementById('quizWeek').textContent = (quiz.available_on ? new Date(quiz.available_on + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) : 'Today');
    checkSubmission(quiz.id, user.id);
    loadLeaderboard(quiz.id, user.id);
    loadNations(quiz.id);
  } else {
    document.getElementById('quizTitle').textContent = 'No quiz this week yet';
    document.getElementById('quizWeek').textContent = 'Week —';
    document.getElementById('startBtn').disabled = true;
    document.getElementById('startHint').textContent = quizError ? `Could not load the quiz: ${quizError.message}` : 'A new quiz will be published soon.';
    document.getElementById('miniBoard').innerHTML = '<li class="eyebrow">Nothing to rank yet.</li>';
    document.getElementById('nationBoard').innerHTML = '<li class="eyebrow">Nothing to rank yet.</li>';
  }
}

// Check if user already played
async function checkSubmission(quizId, userId) {
  const startBtn = document.getElementById('startBtn');
  const startHint = document.getElementById('startHint');
  
  const { data } = await supabase.from('submissions').select('score').eq('quiz_id', quizId).eq('user_id', userId).maybeSingle();
  
  if (data) {
    startBtn.disabled = true;
    startBtn.textContent = `Completed (Score: ${data.score}/10)`;
    startHint.textContent = "Come back tomorrow for the next quiz!";
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
        <span class="flag">${flag(row.country)}</span>
        <span class="row-name">${row.full_name}</span>
        <span class="row-score">${row.score}/10</span>
      </li>
    `;
  });
}

async function loadNations(quizId) {
  const { data } = await supabase.from('country_standings').select('*').eq('quiz_id', quizId).order('avg_score', { ascending: false }).limit(5);
  const board = document.getElementById('nationBoard');
  board.replaceChildren();
  if (!data?.length) { board.innerHTML = '<li class="eyebrow">No country has scored yet. Be the first to put yours on the map.</li>'; return; }
  data.forEach((r, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="rank">#${i + 1}</span><span class="flag">${flag(r.country)}</span><span class="row-name">${COUNTRIES[r.country] || r.country}</span><span class="row-score">${r.avg_score} avg</span>`;
    board.append(li);
  });
}

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await supabase.auth.signOut();
  window.location.reload();
});

supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN' && session) setTimeout(() => showApp(session.user), 0);
});

checkSession();
