# Capitales

A capital-cities quiz. Shows a country outline with a dot on its capital;
pick the right city from four options.

Remake of a Visual Basic game from ~1996.

## Requirements

Node 24+ and npm 11+. Nothing else — the database is SQLite via Node's
built-in `node:sqlite`, so there is no server to install and no Java.

## Running

Once, to load the country data:

    npm run seed

Then two terminals:

    npm run server     # API on http://127.0.0.1:8787
    npm run dev        # app on http://localhost:5173

## Testing

    npm test

Everything runs in-process against an in-memory database. Nothing to start
first.

## Design

See `docs/superpowers/specs/2026-08-24-capitales-quiz-design.md`.

## Windows app

    npm run dev:desktop     # build and run
    npm run package:win     # installer into apps/desktop/release

The desktop build hosts the API inside the Electron process and stores its
database in %APPDATA%\Capitales, seeding itself on first launch.
