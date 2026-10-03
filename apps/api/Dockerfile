# Build from the repo root: docker build -f apps/api/Dockerfile .
FROM node:22-slim AS build
WORKDIR /repo
# LEFTHOOK=0: git hooks are for developer machines, not image builds.
ENV LEFTHOOK=0
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter @shadow/api... build && pnpm deploy --filter @shadow/api --prod /out

FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out ./
COPY --from=build /repo/seed ./seed
USER node
EXPOSE 4000
HEALTHCHECK CMD node -e "fetch('http://localhost:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
