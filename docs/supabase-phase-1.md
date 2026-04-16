# Supabase Phase 1

This repo now has the first persistence scaffold for Syncrolly:

- `packages/data` contains the shared typed Supabase query layer
- `apps/mobile/lib/supabase.ts` sets up the Expo client and session persistence
- `apps/web/lib/supabase/*` sets up browser, server, and middleware helpers for Next.js
- `supabase/migrations/20260416_init.sql` defines the initial database schema and row-level security policies

## What this phase gives us

- a real database model for creators, supporters, conversations, participants, and messages
- auth-aware row-level access controls
- shared TypeScript types for mapping Supabase rows into app-facing inbox and thread models
- env file templates for web and mobile

## What still needs to happen

1. Create a Supabase project.
2. Apply the SQL migrations in the Supabase SQL editor or with the CLI.
   - `supabase/migrations/20260416_init.sql`
   - `supabase/migrations/20260416_profile_search.sql`
   - `supabase/migrations/20260416_direct_conversation_rpc.sql`
   - `supabase/migrations/20260416_realtime_publication.sql`
   - `supabase/migrations/20260416_push_devices.sql`
3. Copy the project URL and publishable key into:
   - `apps/mobile/.env`
   - `apps/web/.env.local`
   - If you plan to test mobile push notifications, also add `EXPO_PUBLIC_EXPO_PROJECT_ID` to `apps/mobile/.env`.
4. Install the new dependencies with `pnpm install`.
5. Replace the current mock-data reads in the inbox and thread screens with calls into `@syncrolly/data`.

## Push notifications

The mobile app now includes push-registration groundwork:

- Expo notification permissions and token registration
- secure token persistence in `public.push_devices`
- notification deep-link handling into thread routes

To finish setup:

1. Apply `supabase/migrations/20260416_push_devices.sql`.
2. Make sure `apps/mobile/.env` includes `EXPO_PUBLIC_EXPO_PROJECT_ID`.
3. Test on a physical device using a development build. Expo Go does not support this notification flow.

The current implementation stores Expo push tokens and handles notification taps. Sending push notifications for new messages still needs a backend sender, such as a Supabase Edge Function or server route that posts to the Expo Push API.

This repo now includes a Supabase Edge Function scaffold at `supabase/functions/notify-new-message/index.ts`. To enable actual push sends after a new message is created:

1. Deploy the function:
   - `supabase functions deploy notify-new-message`
2. Keep the mobile app on a development build with push permissions granted.

The shared `sendMessage()` flow will attempt to invoke `notify-new-message` after the database insert succeeds. If the function is not deployed yet, messaging still works and only the push dispatch is skipped.

## Suggested next implementation slice

The safest next slice is:

1. Add auth screens for sign in / sign up.
2. Use the logged-in user id to load `getViewerProfile`.
3. Swap the inbox screen from `queryInboxThreads()` to `listInboxThreads()`.
4. Swap the thread screen from local draft-only state to `getConversationDetails()` plus `sendMessage()`.

## Privacy model

The schema depends on Supabase Auth plus Postgres Row Level Security:

- users can only update their own profile rows
- only conversation participants can read a conversation and its messages
- only the sender can insert a message as themselves
- profile reads are limited to yourself or users who share a conversation with you
