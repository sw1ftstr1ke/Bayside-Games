# Bayside Games

The public website is published with GitHub Pages:

- Home: https://sw1ftstr1ke.github.io/Bayside-Games/
- Apex GP: https://sw1ftstr1ke.github.io/Bayside-Games/apex-gp/

## Deployment

The GitHub Actions workflow in `.github/workflows/static.yml` rebuilds Apex GP and publishes the static site whenever `main` changes.

The hidden, numbered `.b64` directories are **active build inputs**, not disposable clutter. They contain the compressed game archive and ordered patches used by the workflow. Keep them in place unless the workflow is updated at the same time.

Superseded patch backups and generated ZIP files are not stored in the repository. The workflow recreates `Apex-GP.zip` during its build.

## Persistent Apex GP leaderboard

The global lap board is backed by Supabase Postgres and Supabase Realtime. To enable it on the Supabase project configured in `apex-gp/src/supabase-config.js`, run the migration once:

1. Open the Supabase project dashboard.
2. Open **SQL Editor** and create a new query.
3. Copy and run `supabase/migrations/20261120000000_apex_gp_leaderboard.sql`.
4. Reload Apex GP. The leaderboard should show **LIVE ONLINE SYNC**.

The migration creates a public read-only leaderboard table and a validated database function for submitting a driver's improved best lap. The browser uses only the Supabase publishable key; it does not contain a service-role key. Realtime broadcasts database changes to connected game clients, and the database retains results when every player closes the game.

## Apex Rally

Apex Rally is a standalone, single-stage rally time trial on the 3.4 km Black Pine Run forest stage. It reuses the Apex GP race-math helpers for input, steering, braking, and camera logic while using its own gravel-stage terrain, vehicle presentation, stage timer, splits, and personal-best storage. Open `/apex-rally/` from the Games library.

Controls: WASD or arrow keys to drive and steer, Space for the handbrake, R to recover, and C to cycle the camera. Touch controls are available on mobile.
