#!/usr/bin/env python3
"""HTTPS server for serving WebXR content to Quest 3 over local WiFi."""

import http.server
import ssl
import os
import sys
import socket

PORT = 8443
CERT_FILE = "cert.pem"
KEY_FILE = "key.pem"

def get_local_ip():
    """Get the local IP address."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"
    finally:
        s.close()

def main():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))

    if not os.path.exists(CERT_FILE) or not os.path.exists(KEY_FILE):
        print(f"Certificate files not found. Run ./generate-cert.sh first.")
        sys.exit(1)

    class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
        """Serve files with no-cache headers so VR headset always gets latest."""
        def end_headers(self):
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
            self.send_header('Pragma', 'no-cache')
            self.send_header('Expires', '0')
            super().end_headers()

    handler = NoCacheHandler
    handler.extensions_map.update({
        ".js": "application/javascript",
        ".mjs": "application/javascript",
        ".json": "application/json",
        ".mp3": "audio/mpeg",
    })

    server = http.server.HTTPServer(("0.0.0.0", PORT), handler)

    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(CERT_FILE, KEY_FILE)
    server.socket = context.wrap_socket(server.socket, server_side=True)

    local_ip = get_local_ip()
    print(f"\n  VR Endless Forest - HTTPS Server")
    print(f"  ================================")
    print(f"  Local:   https://localhost:{PORT}")
    print(f"  Network: https://{local_ip}:{PORT}")
    print(f"\n  Open the Network URL on your Quest 3 browser.")
    print(f"  Accept the self-signed certificate warning.\n")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
        server.server_close()

if __name__ == "__main__":
    main()
