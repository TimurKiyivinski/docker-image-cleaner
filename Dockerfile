FROM node:7.1.0
WORKDIR /app
COPY . /app
RUN npm install
ENTRYPOINT npm start
