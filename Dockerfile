FROM node:slim

LABEL "name"="build-tracker-action"
LABEL "maintainer"="Paul Armstrong <paul@spaceyak.com>"
LABEL "version"="1.0.0"

LABEL "com.github.actions.name"="Build Tracker"
LABEL "com.github.actions.description"="An action to integrate PRs and commits with your Build Tracker server"
LABEL "com.github.actions.icon"="package"
LABEL "com.github.actions.color"="green"

COPY *.md /
COPY package*.json ./

RUN yarn install --frozen-lockfile

COPY entrypoint.js /entrypoint.js

ENTRYPOINT ["node", "/entrypoint.js"]
