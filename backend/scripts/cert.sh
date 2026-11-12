#!/usr/bin/env bash
set -euo pipefail
mkdir -p certs
openssl req -x509 -newkey rsa:3072 -sha256 -nodes -days 30 -keyout certs/localhost-key.pem -out certs/localhost.pem -subj '/CN=localhost' -addext 'subjectAltName=DNS:localhost,IP:127.0.0.1'
chmod 600 certs/localhost-key.pem
printf 'Development-only self-signed certificate created. Do not commit private keys.\n'
