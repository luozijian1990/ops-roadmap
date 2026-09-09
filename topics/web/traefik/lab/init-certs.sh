#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
umask 077
mkdir -p certs
if [[ -e certs/ca.key ]]; then
  echo 'certs already exists; keep current CA. For rotation use rotate-cert.sh.'
  exit 0
fi
openssl req -x509 -newkey rsa:2048 -nodes -keyout certs/ca.key -out certs/ca.crt -days 30 -subj /CN=traefik-lab-ca -addext basicConstraints=critical,CA:TRUE 2>/dev/null
openssl req -x509 -newkey rsa:2048 -nodes -keyout certs/unknown-ca.key -out certs/unknown-ca.crt -days 30 -subj /CN=unknown-lab-ca -addext basicConstraints=critical,CA:TRUE 2>/dev/null
issue() {
  local name="$1" san="$2" usage="$3" ca="$4"
  openssl req -new -newkey rsa:2048 -nodes -keyout "certs/$name.key" -out "certs/$name.csr" -subj "/CN=$name" 2>/dev/null
  printf 'subjectAltName=%s\nextendedKeyUsage=%s\n' "$san" "$usage" > "certs/$name.ext"
  openssl x509 -req -in "certs/$name.csr" -CA "certs/$ca.crt" -CAkey "certs/$ca.key" -CAcreateserial -out "certs/$name.crt" -days 7 -extfile "certs/$name.ext" 2>/dev/null
}
issue server 'DNS:app.localhost,DNS:mtls.localhost,DNS:tcp.localhost' serverAuth ca
issue backend 'DNS:backend-a,DNS:backend-b' serverAuth ca
issue client 'DNS:lab-client' clientAuth ca
issue unknown-client 'DNS:unknown-client' clientAuth unknown-ca
openssl verify -CAfile certs/ca.crt certs/server.crt certs/backend.crt certs/client.crt
