# AfriQuiz staged upgrade notes

This package is written for the repository's existing static HTML + ES modules + Supabase setup.

## What is included
- Revised `quiz.html`: accessible progress, timer, explanation, results and review components.
- Revised `assets/js/quiz.js`: progress, answer lock, one finish path, shuffled questions using Fisher–Yates, correct count based on actual question count, answer review, deadline-based timer, retry handling for the legacy schema, and stable view logic.
- Additive migration `supabase/migrations/202610230001_afriquiz_quiz_experience.sql`: explanation/category fields, indexes, owner-scoped policies and a leaderboard view with user ID.

## Important security notes
The current schema exposes public submissions via an existing broad SELECT policy, which this migration does not remove because doing so could break an existing public leaderboard. Review and consolidate overlapping legacy policies before production. Supabase RLS policies are permissive by default (policies combine with OR), so adding a restrictive new policy does not neutralize an older broad policy.

The old browser code awards XP by reading and updating `profiles.total_xp` from the client. This upgrade removes that direct XP mutation; client-provided scores are not trustworthy. Use a database function or Supabase Edge Function that validates the attempt/answers and awards XP transactionally before enabling XP again.

## Suggested rollout
1. Review and apply the migration in a development Supabase project.
2. Add a short explanation to each question in Supabase; category defaults to `General Knowledge` until set.
3. Test no-active-quiz, no-question, 1-question, 10-question, time-expired, duplicate submission and anonymous-player cases.
4. Confirm leaderboard UI displays score against actual question count (the legacy leaderboard currently assumes `/10`).
5. Merge only after manually checking auth and RLS with at least two test accounts.
