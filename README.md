# Campus Plate

Campus Plate is a Cal Poly food event calendar with student sign-in, club accounts, admin approval, event CRUD, and RSVPs. This folder is a complete Next.js project ready to put at the root of a GitHub repository and import into Vercel.

## Demo admin

- Email: `admin@calpoly.edu`
- Password: `password`

The app creates this admin account automatically when its database is first used. You can override these values with the `ADMIN_EMAIL` and `ADMIN_PASSWORD` environment variables. The default password is for the demo; change it before using the site with real campus data.

## GitHub → Vercel

1. Create a new GitHub repository, then push **the contents of this folder** to its root. The root should contain `package.json`, `app/`, and `lib/`.
2. Create a [Turso database](https://turso.tech/). Copy its database URL and database auth token. Vercel's functions cannot keep a local SQLite file between requests, so a hosted database is required for persistent users and events.
3. In Vercel, choose **Add New → Project → Import Git Repository → GitHub** and select the repository. Vercel should detect **Next.js** automatically. If you pushed the parent `codebox-bootcamp` folder instead, set Vercel's **Root Directory** to `vercel-campus-plate`.
4. Before deploying, add these environment variables in the Vercel import screen:

   | Name | Value |
   | --- | --- |
   | `TURSO_DATABASE_URL` | Your `libsql://...` database URL |
   | `TURSO_AUTH_TOKEN` | Your database auth token |

5. Deploy. The app creates the database tables on its first API request. Open the **production** `vercel.app` address, which is based on the project name. Choose a project name without personal information; Vercel's generated preview URLs may include an account or team name.

The database token belongs only in Vercel's environment variable settings. Do not commit it to GitHub or prefix it with `NEXT_PUBLIC_`.

## Local development

Copy `.env.example` to `.env.local`. For local testing, set `TURSO_DATABASE_URL=file:./local.sqlite` and leave `TURSO_AUTH_TOKEN` empty. Then run:

```powershell
npm install
npm run dev
```

Run `npm run build` to check production compilation. While the app is running, `npm run test:api` checks signup, admin approval, event CRUD, student access, and RSVP; set `SMOKE_BASE` if the app is not on `http://127.0.0.1:3000`.

The demo checks that email text ends in `@calpoly.edu`; it does not verify ownership of the address. Add campus authentication before using this for real student or event data.
