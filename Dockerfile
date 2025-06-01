FROM node:18-slim

WORKDIR /app

COPY nodejs/package*.json ./

RUN npm install

COPY nodejs/app.js ./

EXPOSE 3000

CMD ["node", "app.js"] 