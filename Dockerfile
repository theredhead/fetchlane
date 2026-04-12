FROM node:22

WORKDIR /usr/src/app

COPY ./dist/src .
COPY package*.json .

RUN [ "npm", "install" ]


EXPOSE 3000

CMD [ "node", "./main.js" ]
