import { supabase } from './supabase.js';

const QUIZ_DURATION_SECONDS = 300;
let currentQuestion = 0;
let score = 0;
let questions = [];
let activeQuizId = null;
let activeQuizTitle = 'Weekly Quiz';
let timerInterval = null;
let timeLeft = QUIZ_DURATION_SECONDS;
let startedAt = 0;
let isAnswered = false;
let isFinishing = false;
let sessionUser = null;
let correctStreak = 0;
let maxStreak = 0;
let review = [];
let submissionAttempted = false;

const $ = (id) => document.getElementById(id);
const quizView = $('quizView');
const resultView = $('resultView');
const timerEl = $('quizTimer');
const optionsContainer = $('optionsContainer');
const nextButton = $('nextQuestionBtn');

function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function formatTime(totalSeconds) {
  const n = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(n / 60);
  const s = n % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function showError(message) {
  const box = $('quizHint');
  if (box) box.textContent = message;
}

async function initQuiz() {
  try {
    const [{ data: { user }, error: userError }, quizResponse] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from('quizzes').select('id,title').eq('is_active', true).limit(1).maybeSingle()
    ]);
    if (userError) console.warn('Unable to verify signed-in user:', userError.message);
    sessionUser = user || null;
    if (quizResponse.error) throw quizResponse.error;
    const quiz = quizResponse.data;
    if (!quiz) {
      showError('There is no active quiz right now. Please come back when the next challenge is published.');
      $('questionText').textContent = 'No active quiz';
      return;
    }
    activeQuizId = quiz.id;
    activeQuizTitle = quiz.title || 'Weekly Quiz';

    if (sessionUser) {
      const { data: prior, error: priorError } = await supabase.from('submissions')
        .select('id,score,time_taken_seconds').eq('quiz_id', activeQuizId).eq('user_id', sessionUser.id).maybeSingle();
      if (priorError) throw priorError;
      if (prior) {
        quizView.hidden = true;
        resultView.hidden = false;
        $('resultMessage').textContent = 'You have already submitted this weekly quiz. Come back for the next challenge.';
        $('finalScore').textContent = `${prior.score}/10`;
        $('finalTime').textContent = formatTime(prior.time_taken_seconds);
        $('finalAccuracy').textContent = `${Math.round((Number(prior.score) / 10) * 100)}%`;
        return;
      }
    }

    const { data: qData, error: questionError } = await supabase.from('questions')
      .select('id,prompt,option_a,option_b,option_c,option_d,correct_option')
      .eq('quiz_id', activeQuizId);
    if (questionError) throw questionError;
    if (!qData || qData.length === 0) {
      showError('This quiz does not have any questions yet. Please try again later.');
      $('questionText').textContent = 'Questions are not available';
      return;
    }

    // If an older schema has no category/explanation columns, fall back to its original columns.
    // The select error path below retries only when the server reports a missing column.
    questions = shuffle(qData).slice(0, 10);
    startedAt = Date.now();
    timeLeft = QUIZ_DURATION_SECONDS;
    renderQuestion();
    startTimer();
  } catch (error) {
    console.error('Quiz initialization failed:', error);
    // Compatibility path for the original schema (which contains no category/explanation).
    try {
      const { data: quiz, error: quizError } = await supabase.from('quizzes').select('id,title').eq('is_active', true).limit(1).maybeSingle();
      if (quizError || !quiz) throw quizError || new Error('No active quiz found.');
      activeQuizId = quiz.id;
      activeQuizTitle = quiz.title || 'Weekly Quiz';
      const { data, error: qError } = await supabase.from('questions')
        .select('id,prompt,option_a,option_b,option_c,option_d,correct_option').eq('quiz_id', quiz.id);
      if (qError) throw qError;
      if (!data?.length) throw new Error('No questions found for the active quiz.');
      questions = shuffle(data).slice(0, 10);
      startedAt = Date.now();
      timeLeft = QUIZ_DURATION_SECONDS;
      renderQuestion();
      startTimer();
    } catch (fallbackError) {
      console.error('Quiz fallback failed:', fallbackError);
      showError(fallbackError.message || 'The quiz could not be loaded. Check your connection and try again.');
      $('questionText').textContent = 'Unable to load the quiz';
    }
  }
}

function startTimer() {
  stopTimer();
  updateTimerDisplay();
  timerInterval = setInterval(() => {
    timeLeft = Math.max(0, QUIZ_DURATION_SECONDS - Math.floor((Date.now() - startedAt) / 1000));
    updateTimerDisplay();
    if (timeLeft <= 0) finishQuiz('time');
  }, 250);
}

function stopTimer() {
  if (timerInterval !== null) clearInterval(timerInterval);
  timerInterval = null;
}

function updateTimerDisplay() {
  timerEl.textContent = formatTime(timeLeft);
  timerEl.classList.toggle('is-urgent', timeLeft <= 30);
}

function getOptionRows(q) {
  return [
    { key: 'A', text: q.option_a },
    { key: 'B', text: q.option_b },
    { key: 'C', text: q.option_c },
    { key: 'D', text: q.option_d }
  ];
}

function renderQuestion() {
  if (isFinishing) return;
  if (currentQuestion >= questions.length) {
    finishQuiz('complete');
    return;
  }
  isAnswered = false;
  const q = questions[currentQuestion];
  $('questionProgress').textContent = `Question ${currentQuestion + 1} of ${questions.length}`;
  $('questionCategory').textContent = q.category || activeQuizTitle || 'AFRIQUIZ';
  $('questionText').textContent = q.prompt;
  $('questionText').focus({ preventScroll: true });
  $('streakLabel').textContent = `🔥 Streak ${correctStreak}`;
  $('quizHint').textContent = '';
  $('questionExplanation').hidden = true;
  $('questionExplanation').textContent = '';
  nextButton.disabled = true;
  nextButton.textContent = currentQuestion === questions.length - 1 ? 'View results →' : 'Continue →';
  const percent = Math.round((currentQuestion / questions.length) * 100);
  $('quizProgressFill').style.width = `${percent}%`;
  $('quizProgress').setAttribute('aria-valuenow', String(percent));
  optionsContainer.replaceChildren();

  getOptionRows(q).forEach((opt) => {
    const button = document.createElement('button');
    button.className = 'option';
    button.type = 'button';
    button.textContent = `${opt.key}. ${opt.text}`;
    button.addEventListener('click', () => handleAnswer(opt.key, q, button));
    optionsContainer.appendChild(button);
  });
}

function handleAnswer(selected, question, selectedButton) {
  if (isAnswered || isFinishing) return;
  isAnswered = true;
  const allButtons = [...optionsContainer.querySelectorAll('button')];
  allButtons.forEach((button) => { button.disabled = true; });
  const correctKey = question.correct_option;
  const correct = selected === correctKey;
  if (correct) {
    score += 1;
    correctStreak += 1;
    maxStreak = Math.max(maxStreak, correctStreak);
    selectedButton.classList.add('correct');
  } else {
    correctStreak = 0;
    selectedButton.classList.add('wrong');
    const correctButton = allButtons.find((button) => button.textContent.startsWith(`${correctKey}.`));
    if (correctButton) correctButton.classList.add('correct');
  }
  $('streakLabel').textContent = `🔥 Streak ${correctStreak}`;
  const answerText = getOptionRows(question).find((option) => option.key === correctKey)?.text || correctKey;
  review.push({ prompt: question.prompt, selected: getOptionRows(question).find((option) => option.key === selected)?.text || selected, correctAnswer: answerText, correct, explanation: question.explanation || '' });

  const explanation = $('questionExplanation');
  explanation.hidden = false;
  explanation.classList.toggle('is-correct', correct);
  explanation.classList.toggle('is-wrong', !correct);
  explanation.textContent = `${correct ? 'Correct!' : `The correct answer is ${correctKey}. ${answerText}.`}${question.explanation ? ` ${question.explanation}` : ''}`;
  nextButton.disabled = false;
}

nextButton.addEventListener('click', () => {
  if (!isAnswered || isFinishing) return;
  currentQuestion += 1;
  renderQuestion();
});

async function finishQuiz(reason) {
  if (isFinishing) return;
  isFinishing = true;
  stopTimer();
  const timeTaken = Math.min(QUIZ_DURATION_SECONDS, Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
  const total = questions.length;
  const accuracy = total ? Math.round((score / total) * 100) : 0;
  quizView.hidden = true;
  resultView.hidden = false;
  $('quizProgressFill').style.width = '100%';
  $('quizProgress').setAttribute('aria-valuenow', '100');
  $('finalScore').textContent = `${score}/${total}`;
  $('finalAccuracy').textContent = `${accuracy}%`;
  $('finalTime').textContent = formatTime(timeTaken);
  $('resultMessage').textContent = reason === 'time'
    ? 'Time ran out. Your answered questions have been counted.'
    : accuracy >= 80 ? 'Excellent work — your African knowledge is growing!'
    : accuracy >= 50 ? 'Good effort. Review the answers and keep learning.'
    : 'Every question is a chance to learn. Review the explanations and try again.';
  renderReview();

  // Persistence stays compatible with the existing schema. The database unique
  // constraint (user_id, quiz_id) is the final guard against duplicate attempts.
  if (!sessionUser || !activeQuizId || submissionAttempted || total === 0) return;
  submissionAttempted = true;
  const { error } = await supabase.from('submissions').insert({
    user_id: sessionUser.id,
    quiz_id: activeQuizId,
    score,
    time_taken_seconds: timeTaken
  });
  if (error) {
    console.error('Submission error:', error);
    $('quizHint').textContent = error.code === '23505'
      ? 'A submission for this quiz already exists on your account.'
      : 'Your results are shown, but we could not save them. Please contact support before retrying.';
    return;
  }
  // Do not update total_xp from untrusted browser-side score data. Awarding XP
  // should be done in a database function/Edge Function after validating results.
}

function renderReview() {
  const list = $('reviewList');
  list.replaceChildren();
  review.forEach((item, index) => {
    const card = document.createElement('article');
    card.className = 'glass';
    card.style.padding = '14px';
    const title = document.createElement('strong');
    title.textContent = `${index + 1}. ${item.prompt}`;
    const answer = document.createElement('p');
    answer.style.marginTop = '8px';
    answer.style.color = item.correct ? 'var(--green)' : 'var(--muted)';
    answer.textContent = `Correct answer: ${item.correctAnswer}${item.correct ? ' ✓' : ''}`;
    card.append(title, answer);
    if (item.explanation) {
      const detail = document.createElement('p');
      detail.textContent = item.explanation;
      detail.style.cssText = 'margin-top:6px;color:var(--muted);line-height:1.5';
      card.append(detail);
    }
    list.append(card);
  });
}

initQuiz();
