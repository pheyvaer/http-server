FROM node:8

LABEL maintainer='Giovanni Mels <giovanni.mels@continuum.be>'

COPY package*.json ./
COPY lib ./lib
COPY bin ./bin

RUN npm install

EXPOSE 8080

ENTRYPOINT [ "npm", "start" ]
