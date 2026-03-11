FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY dist/ ./dist/
COPY prisma/ ./prisma/
COPY admin/ ./admin/

RUN npx prisma generate

EXPOSE 3000

CMD ["node", "dist/main.js"]
