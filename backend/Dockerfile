FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci || npm i

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

EXPOSE 5000

CMD ["node", "dist/index.js"]
