FROM node:20-alpine

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev

# curl required for Coolify's exec-based container health check, same fix
# as the main im-website app's Dockerfile.
RUN apk add --no-cache curl

COPY . .

RUN addgroup --system --gid 1001 voiceagent \
  && adduser --system --uid 1001 voiceagent
USER voiceagent

EXPOSE 4000
ENV PORT=4000
CMD ["node", "src/server.js"]
