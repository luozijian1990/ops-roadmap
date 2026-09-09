#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
umask 077
openssl x509 -req -in certs/server.csr -CA certs/ca.crt -CAkey certs/ca.key -CAcreateserial -out certs/server.next.crt -days 8 -extfile certs/server.ext 2>/dev/null
mv certs/server.next.crt certs/server.crt
# File Provider watches dynamic configuration, not arbitrary certificate file changes.
cp dynamic/routes.yml dynamic/routes.next
printf '\n# certificate reload %s\n' "$(date +%s)" >> dynamic/routes.next
mv dynamic/routes.next dynamic/routes.yml
openssl x509 -in certs/server.crt -noout -serial -enddate
