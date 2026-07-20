"""
ASR Microservice — Whisper-based speech recognition.
POST /transcribe  (multipart audio file) → {"text":"..."}
GET /health → {"status":"ok"}
"""
import sys, os, json, tempfile
from pathlib import Path
from http.server import HTTPServer, BaseHTTPRequestHandler

# Lazy load whisper
_model = None

def get_model():
    global _model
    if _model is None:
        print("[ASR] Loading faster-whisper base model...", flush=True)
        from faster_whisper import WhisperModel
        _model = WhisperModel("base", device="cpu", compute_type="int8")
        print("[ASR] Model ready", flush=True)
    return _model


class ASRHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != '/transcribe':
            self.send_error(404)
            return

        content_type = self.headers.get('Content-Type', '')
        length = int(self.headers.get('Content-Length', 0))
        raw = self.rfile.read(length)

        # Parse multipart or raw audio
        audio_data = raw
        if 'multipart' in content_type:
            # Simple multipart extraction
            boundary = content_type.split('boundary=')[-1].strip()
            parts = raw.split(f'--{boundary}'.encode())
            for part in parts:
                if b'Content-Type:' in part and (b'audio' in part or b'wav' in part or b'webm' in part):
                    # Find double newline separator
                    idx = part.find(b'\r\n\r\n')
                    if idx == -1:
                        idx = part.find(b'\n\n')
                    if idx > 0:
                        audio_data = part[idx+4:] if part[idx:idx+2] == b'\r\n' else part[idx+2:]
                    break

        if len(audio_data) < 100:
            self.send_json({"error": "audio too short", "text": ""})
            return

        # Save to temp file for whisper
        try:
            suffix = '.wav'
            if b'webm' in raw[:200]:
                suffix = '.webm'
            fd, tmpfile = tempfile.mkstemp(suffix=suffix)
            os.write(fd, audio_data)
            os.close(fd)

            model = get_model()
            segments, _ = model.transcribe(tmpfile, language="zh", beam_size=5)
            text = " ".join([seg.text for seg in segments])

            os.unlink(tmpfile)
            self.send_json({"text": text.strip()})
        except Exception as e:
            try:
                os.unlink(tmpfile)
            except:
                pass
            self.send_json({"error": str(e)[:200], "text": ""})

    def do_GET(self):
        if self.path == '/health':
            self.send_json({"status": "ok", "model": "faster-whisper-base"})
        else:
            self.send_error(404)

    def send_json(self, data):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def log_message(self, fmt, *args):
        pass


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8003
    server = HTTPServer(('127.0.0.1', port), ASRHandler)
    print(f"[ASR] Service ready on http://127.0.0.1:{port}", flush=True)
    server.serve_forever()
