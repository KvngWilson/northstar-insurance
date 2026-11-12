FROM node:22-alpine
WORKDIR /app

# Required only to generate a local self-signed TLS certificate on first start.
RUN apk add --no-cache openssl

COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY src ./src
COPY scripts ./scripts
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh && mkdir -p /app/data /app/certs && chown -R node:node /app

USER node
ENV NODE_ENV=development PORT=8443 \
    TLS_KEY=certs/localhost-key.pem TLS_CERT=certs/localhost.pem \
    DATA_FILE=data/store.json
EXPOSE 8443
ENTRYPOINT ["./docker-entrypoint.sh"]
