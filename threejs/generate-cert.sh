#!/bin/bash
# Generate self-signed SSL certificate for local HTTPS server
cd "$(dirname "$0")"

LOCAL_IP=$(python3 -c "import socket; s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM); s.connect(('8.8.8.8',80)); print(s.getsockname()[0]); s.close()" 2>/dev/null || echo "127.0.0.1")

openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem \
  -days 365 -nodes \
  -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:${LOCAL_IP},IP:127.0.0.1"

echo ""
echo "Certificate generated: cert.pem, key.pem"
echo "Run: python3 server.py"
