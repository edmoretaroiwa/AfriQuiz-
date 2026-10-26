// Finds the quiz scheduled for the player's local date, or falls back to the active quiz.
export const todayKey = () => new Date().toLocaleDateString('en-CA');
export async function getTodaysQuiz(supabase, columns = 'id,title') {
  const byDate = await supabase.from('quizzes').select(columns).eq('available_on', todayKey()).limit(1).maybeSingle();
  if (byDate.data) return byDate;
  return supabase.from('quizzes').select(columns).eq('is_active', true).limit(1).maybeSingle();
}
