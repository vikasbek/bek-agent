# etbek

`etbek` is a dashboard-driven AI agent for Jira-to-branch-to-PR automation.

## Stack

- Node.js + TypeScript
- Next.js dashboard
- Express API
- MongoDB for editable runtime configuration
- Optional Redis for background jobs

## Run locally

1. Copy `.env.example` into the environment file you want to use.
2. Fill secrets in `.env.development`, `.env.staging`, or `.env.production`.
3. Start MongoDB and Redis with `docker compose up -d` if you want local services.
4. Install dependencies with `pnpm install`.
5. Start the API with `pnpm dev:api`.
6. Start the dashboard with `pnpm dev:web`.
7. Start the worker with `pnpm dev:worker` if you want the automation loop running.

`APP_ENV=dev|staging|prod` selects `.env.development`, `.env.staging`, or `.env.production` automatically.

## Notes

- MongoDB is required for API and worker startup. Set `MONGO_URI` or `MONGO_HOST`/`MONGO_PORT` in the active env file.
- Secrets should stay in environment variables. Editable business config is stored through the dashboard.
- Use `APP_ENV` to switch behavior between `dev`, `staging`, and `prod`.
- The repo includes `mongo_vienna_ca.jks` plus a PEM companion file for Node TLS trust.
