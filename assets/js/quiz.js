import { supabase } from './supabase.js';

let currentQuestion = 0;
let score = 0;
let questions = [];
let activeQuizId = null;
let timerInterval;
let timeLeft = 300; // 5 minutes in seconds
let startTime = Date.now();

const quizView = document.getElementById('quizView');
const resultView = document.getElementById('resultView');

async function initQuiz() {
  // Get active quiz
  const { data: quiz } = await supabase.from('quizzes').select('*').eq('is_active', true).single();
  if (!quiz) return alert('No active quiz');
  activeQuizId = quiz.id;

  // Get questions
  const { data: qData } = await supabase.from('questions').select('*').eq('quiz_id', quiz.id);
  if (!qData || qData.length === 0) return alert('No questions found');
  
  // Shuffle questions (optional)
  questions = qData.sort(() => Math.random() - 0.5);
  
  startTimer();
  renderQuestion();
}

function startTimer() {
  const timerEl = document.getElementById('quizTimer');
  timerInterval = setInterval(() => {
    timeLeft--;
    const m = Math.floor(timeLeft / 60);
    const s = timeLeft % 60;
    timerEl.textContent = `${m}:${s.toString().padStart(2, '0')}`;
    
    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      finishQuiz();
    }
  }, 1000);
}

function renderQuestion() {
  if (currentQuestion >= questions.length) {
    finishQuiz();
    return;
  }

  const q = questions[currentQuestion];
  document.getElementById('questionProgress').textContent = `Question ${currentQuestion + 1} of ${questions.length}`;
  document.getElementById('questionText').textContent = q.prompt;
  
  const optionsContainer = document.getElementById('optionsContainer');
  optionsContainer.innerHTML = '';
  
  const options = [
    { key: 'A', text: q.option_a },
    { key: 'B', text: q.option_b },
    { key: 'C', text: q.option_c },
    { key: 'D', text: q.option_d }
  ];

  options.forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'option';
    btn.textContent = `${opt.key}. ${opt.text}`;
    btn.onclick = () => handleAnswer(opt.key, q.correct_option, btn);
    optionsContainer.appendChild(btn);
  });
}

function handleAnswer(selected, correct, btn) {
  // Disable all buttons
  const allBtns = document.querySelectorAll('.option');
  allBtns.forEach(b => b.disabled = true);

  if (selected === correct) {
    btn.classList.add('correct');
    score++;
  } else {
    btn.classList.add('wrong');
    // Show correct one
    allBtns.forEach(b => {
      if (b.textContent.startsWith(correct + '.')) b.classList.add('correct');
    });
  }

  setTimeout(() => {
    currentQuestion++;
    renderQuestion();
  }, 1000); // Wait 1 second before next question
}

async function finishQuiz() {
  clearInterval(timerInterval);
  const timeTaken = Math.floor((Date.now() - startTime) / 1000);
  
  document.getElementById('quizView').hidden = true;
  document.getElementById('resultView').hidden = false;
  
  document.getElementById('finalScore').textContent = `${score}/10`;
  document.getElementById('finalTime').textContent = `${Math.floor(timeTaken / 60)}m ${timeTaken % 60}s`;

  // Save to Supabase
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { error } = await supabase.from('submissions').insert({
      user_id: user.id,
      quiz_id: activeQuizId,
      score: score,
      time_taken_seconds: timeTaken
    });

    if (error) {
      console.error("Submission error:", error);
    } else {
      // Update XP (Optional logic: score * 10 XP)
      const { data: profile } = await supabase.from('profiles').select('total_xp').eq('id', user.id).single();
      await supabase.from('profiles').update({ total_xp: (profile.total_xp || 0) + (score * 10) }).eq('id', user.id);
    }
  }
}

initQuiz();
