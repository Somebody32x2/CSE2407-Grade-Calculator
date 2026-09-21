# CSE 2407 grade calculator.
#
# A static page plus a small relay for the grade-scraping bookmarklet. No
# dependencies, so there is nothing to install and no build step -- the image
# is the Node runtime plus this repo.

FROM node:22-alpine

ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0

WORKDIR /app

# The app holds grade data in memory only, so it never needs to write anywhere.
COPY --chown=node:node index.html ./
COPY --chown=node:node css ./css
COPY --chown=node:node js ./js
COPY --chown=node:node server ./server

USER node

EXPOSE 8080

# Node is PID 1 here; server.js installs SIGTERM/SIGINT handlers so Coolify can
# stop the container cleanly.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "server/server.js"]
