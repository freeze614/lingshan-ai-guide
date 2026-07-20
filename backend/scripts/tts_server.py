"""
Micro TTS HTTP server using edge_tts.
POST /tts  {"text":"..."}  →  {"audio_base64":"...","duration_ms":...,"visemes":[...]}
"""
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path
import json, base64, subprocess, tempfile, os, sys, re, traceback

VOICE = "zh-CN-XiaoxiaoNeural"
CACHE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'data', 'tts-cache')
os.makedirs(CACHE_DIR, exist_ok=True)

# Simple viseme mapping
CV = {'大':1,'佛':4,'山':1,'灵':3,'胜':2,'境':3,'禅':1,'寺':3,'宫':4,'花':1,'海':1,'路':5,'道':1,'桥':1,'塔':1,'湖':5,'高':1,'多':4,'少':1,'好':1,'看':1,'美':2,'我':4,'你':3,'是':3,'的':2,'了':2,'吗':1,'呢':2,'吧':1,'啊':1,'哦':4,'欢':1,'喜':3,'谢':2,'爱':1,'想':1,'说':4,'问':2,'答':1,'来':1,'去':5,'有':4,'在':1,'不':5,'这':2,'那':1,'一':3}
VS = {0:(0,0),1:(1,0.6),2:(0.7,0.5),3:(0.9,0.3),4:(0.5,0.7),5:(0.4,0.5)}
VN = ['rest','aa','e','i','o','u']

def safe_viseme_id(c):
    """Return a valid viseme_id (0-5) for any character, never None."""
    try:
        vid = CV.get(c, None)
        if vid is not None and 0 <= vid <= 5:
            return vid
    except:
        pass
    return (ord(c) % 5) + 1

def build_visemes(text, dur_ms):
    try:
        chars = [c for c in text if '\u4e00' <= c <= '\u9fff']
        if not chars:
            return []
        per = dur_ms / len(chars)
        result = []
        for i, c in enumerate(chars):
            vid = safe_viseme_id(c)
            shape = VS.get(vid, (0.5, 0.5))
            result.append({
                "time_ms": round(i * per),
                "viseme_id": vid,
                "viseme_name": VN[vid] if 0 <= vid < len(VN) else 'rest',
                "shape": {"w": shape[0], "h": shape[1]}
            })
        return result
    except Exception as e:
        print(f"[TTS] build_visemes error: {e}", flush=True)
        return []

class TTSHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != '/tts':
            self.send_response(404); self.end_headers(); return

        length = int(self.headers.get('Content-Length', 0))
        raw = self.rfile.read(length)
        # Try UTF-8 first, fallback to GBK (Windows curl default)
        try:
            body = json.loads(raw.decode('utf-8'))
        except (UnicodeDecodeError, json.JSONDecodeError):
            try:
                body = json.loads(raw.decode('gbk'))
            except:
                body = {}
        text = body.get('text', '').strip()
        voice = body.get('voice', VOICE)
        rate = body.get('rate', '+0%')
        pitch = body.get('pitch', '+0Hz')

        print(f"[TTS] Received text (len={len(text)}), voice={voice}", flush=True)

        if len(text) < 2:
            self.send_json({"error": "text too short"}); return

        _fd2, _p2 = tempfile.mkstemp(suffix='.mp3')
        os.close(_fd2)
        tmp = Path(_p2)
        try:
            r = subprocess.run([sys.executable, '-m', 'edge_tts', '--voice', voice,
                '--rate=' + rate, '--pitch=' + pitch,
                '--text', text, '--write-media', str(tmp)],
                             capture_output=True, text=True, timeout=60,
                             env={**os.environ, 'PYTHONIOENCODING': 'utf-8', 'PYTHONUTF8': '1'})
            if r.returncode != 0:
                print(f"[TTS] edge_tts failed: {r.stderr[:300]}", flush=True)
                self.send_json({"error": "tts failed", "detail": r.stderr[:300]}); return
            if tmp.exists() and tmp.stat().st_size > 200:
                audio = base64.b64encode(tmp.read_bytes()).decode()
                dur = max(len([c for c in text if '\u4e00' <= c <= '\u9fff']) * 250, 1500)
                print(f"[TTS] Success: audio={len(audio)} bytes, dur={dur}ms", flush=True)
                self.send_json({"audio_base64": audio, "duration_ms": dur, "visemes": build_visemes(text, dur), "voice": voice})
            else:
                print(f"[TTS] No output generated. tmp exists={tmp.exists()}, size={tmp.stat().st_size if tmp.exists() else 'N/A'}", flush=True)
                self.send_json({"error": "no output"})
        except Exception as e:
            print(f"[TTS] Exception: {e}", flush=True)
            traceback.print_exc()
            self.send_json({"error": str(e)[:300]})
        finally:
            try: tmp.unlink(missing_ok=True)
            except: pass

    def send_json(self, data):
        self.send_response(200)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def log_message(self, format, *args):
        pass  # quiet

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8001
    server = HTTPServer(('127.0.0.1', port), TTSHandler)
    print(f'TTS Server on port {port}', flush=True)
    server.serve_forever()