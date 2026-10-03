# aRKive

Private, local-first personal link archive.

Save it now. Find it later.

## Run

```sh
npm install
npm start
```

Then open `http://localhost:4317`.

The local SQLite database is created at `data/arkive.sqlite`. The `data/` directory is ignored by Git.

## Privacy Model

- SQLite on your machine is the source of truth.
- The browser UI talks only to the local app server.
- Saving a URL writes locally first.
- Metadata fetching makes a direct request only to the URL you saved.
- No accounts, analytics, AI APIs, cloud databases, tracking, telemetry, ads, or third-party link preview services.
- Notes, tags, categories, searches, and library contents are never sent to external services by the app.

