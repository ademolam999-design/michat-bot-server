# syntax = docker/dockerfile:1

FROM node:20

WORKDIR /app
ENV NODE_ENV="production"

# Baileys needs git to install
RUN apt-get update -qq && apt-get install -y git build-essential python3

COPY package.json ./
RUN npm install --legacy-peer-deps --force

COPY . .

EXPOSE 3000
CMD [ "node", "server.js" ]
