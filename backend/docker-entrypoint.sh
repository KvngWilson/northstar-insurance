#!/bin/sh
set -eu

# The named volume survives container recreation; don't overwrite its certificates.
if [ ! -s "${TLS_KEY:-certs/localhost-key.pem}" ] || [ ! -s "${TLS_CERT:-certs/localhost.pem}" ]; then
  echo 'Generating development-only HTTPS certificate...'
  sh -c 'mkdir -p certs'
  openssl req -x509 -newkey rsa:3072 -sha256 -nodes -days 30 \
    -keyout "${TLS_KEY:-certs/localhost-key.pem}" \
    -out "${TLS_CERT:-certs/localhost.pem}" \
    -subj '/CN=localhost' \
    -addext 'subjectAltName=DNS:localhost,IP:127.0.0.1'
  chmod 600 "${TLS_KEY:-certs/localhost-key.pem}"
fi

# Seed only an empty demo environment, never overwrite existing lab records.
if [ ! -s "${DATA_FILE:-data/store.json}" ]; then
  echo 'Initializing sample lab users and policies...'
  node scripts/seed.js
fi

exec node src/server.js
