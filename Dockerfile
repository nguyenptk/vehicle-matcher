# Dockerfile
FROM node:20-alpine

# install glibc compat and openssl
RUN apk add --no-cache libc6-compat openssl

WORKDIR /app
COPY package*.json ./
RUN npm install

COPY . .
RUN npx tsc

CMD ["node", "dist/server.js"]
