# syntax = docker/dockerfile:1

ARG NODE_VERSION=20.19.0
FROM node:${NODE_VERSION}-slim AS base

LABEL fly_launch_runtime="Node.js"
WORKDIR /app
ENV NODE_ENV="production"

FROM base AS build

RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y build-essential node-gyp pkg-config python-is-python3

COPY package.json ./
# THIS IS THE FIX - old Baileys needs this
RUN npm install --legacy-peer-deps

COPY . .

FROM base

COPY --from=build /app /app

# Your server.js uses PORT from Fly.io, keep 3000
EXPOSE 3000
# THIS IS THE 2nd FIX - your repo has no "start" script, so use node directly
CMD [ "node", "server.js" ]
