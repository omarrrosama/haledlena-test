FROM node:24-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

FROM node:24-alpine

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./
COPY src ./src
COPY admin ./admin
COPY uploads ./uploads

RUN mkdir -p /app/uploads/products

EXPOSE 5000

CMD ["npm", "start"]
