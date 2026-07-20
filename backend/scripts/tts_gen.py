"""TTS generator - reads text from stdin, writes JSON with base64 audio to stdout."""
import sys, json, base64, subprocess, tempfile, os

text = sys.stdin.read().strip()
voice = sys.argv[1] if len(sys.argv) > 1 else 'zh-CN-XiaoxiaoNeural'

if len(text) < 2:
    print(json.dumps({"error":"text too short"}))
    sys.exit(0)

tmp = tempfile.NamedTemporaryFile(suffix='.mp3', delete=False)
tmp.close()

try:
    r = subprocess.run([
        sys.executable, '-m', 'edge_tts',
        '--voice', voice,
        '--text', text,
        '--write-media', tmp.name,
    ], capture_output=True, text=True, timeout=15, env={**os.environ, 'PYTHONIOENCODING':'utf-8'})

    if r.returncode != 0:
        print(json.dumps({"error":"tts failed","detail":r.stderr[:300]}))
        sys.exit(1)

    with open(tmp.name, 'rb') as f:
        audio = base64.b64encode(f.read()).decode('ascii')

    dur = max(len([c for c in text if '一' <= c <= '鿿']) * 250, 1500)
    print(json.dumps({"audio_base64":audio,"duration_ms":dur,"visemes":[]}))
finally:
    try: os.unlink(tmp.name)
    except: pass
