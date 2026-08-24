# Capitales

A capital-cities quiz. Shows a country outline with a dot on its capital;
pick the right city from four options. English and French.

Remake of a Visual Basic game from ~1996.

## Requirements

Node 24+ and npm 11+. Nothing else — the database is SQLite via Node's
built-in `node:sqlite`, so there is no server to install and no Java.

## Running in the browser

Once, to load the country data:

    npm run seed

Then two terminals:

    npm run server     # API on http://127.0.0.1:8787
    npm run dev        # app on http://localhost:5173

## Desktop builds

    npm run dev:desktop      # build and run the desktop app
    npm run package:win      # Windows: installer + portable exe
    npm run package:linux    # Linux: tarball

Artifacts land in `apps/desktop/release`:

| File | Notes |
|---|---|
| `Capitales-<version>-setup.exe` | Windows installer |
| `Capitales-<version>-portable.exe` | Windows, no installation — just run it |
| `Capitales-<version>-x64.tar.gz` | Linux — extract and run `./capitales` |

AppImage and `.deb` are configured but need a Linux machine, WSL or Docker;
see `PROJECT.md` section 14.

The desktop builds host the API inside the Electron process, seed themselves on
first launch, and store their database in `%APPDATA%\Capitales` on Windows or
`~/.config/Capitales` on Linux.

## Testing

    npm test           # 160 tests, nothing to start first
    npm run typecheck

## Documentation

- `PROJECT.md` — everything worth knowing, in English
- `PROJET.md` — la même chose, en français
- `docs/superpowers/` — the original design spec and implementation plan
