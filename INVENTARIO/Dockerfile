FROM node:20-alpine
WORKDIR /usr/src/app
RUN mkdir -p images
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
RUN apk add --no-cache openssl && \
    openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes -subj "/C=US/ST=State/L=City/O=Organization/CN=192.168.137.1"
EXPOSE 3000
CMD ["node", "server.js"]
