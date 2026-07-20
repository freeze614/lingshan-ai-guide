/**
 * TTS generator. Usage: node tts-gen.js <text-file> [voice]
 * Reads text from file (UTF-8), outputs JSON with audio_base64 + visemes.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PYTHON = 'C:/Users/11568/AppData/Local/Programs/Python/Python311/python.exe';
const CACHE_DIR = path.resolve(__dirname, '../../data/tts-cache');
try { fs.mkdirSync(CACHE_DIR, { recursive: true }); } catch {}

const textFile = process.argv[2];
const voice = process.argv[3] || 'zh-CN-XiaoxiaoNeural';
if (!textFile || !fs.existsSync(textFile)) {
  console.log(JSON.stringify({ error: 'no text file' }));
  process.exit(1);
}

const text = fs.readFileSync(textFile, 'utf-8').trim();
if (text.length < 2) { console.log(JSON.stringify({ error: 'text too short' })); process.exit(1); }

// Cache
const cacheKey = text.replace(/\s/g, '').slice(0, 30) + '_' + voice;
const safeName = Buffer.from(cacheKey).toString('base64').replace(/[/+=]/g, '').slice(0, 45);
const cacheFile = path.join(CACHE_DIR, `tts_${safeName}.mp3`);
if (fs.existsSync(cacheFile) && fs.statSync(cacheFile).size > 200) {
  const buf = fs.readFileSync(cacheFile);
  const dur = Math.max([...text].filter(c => /[一-鿿]/.test(c)).length * 250, 1500);
  console.log(JSON.stringify({ audio_base64: buf.toString('base64'), duration_ms: dur, visemes: buildVisemes(text, dur), voice, cached: true }));
  process.exit(0);
}

// Generate
const tmpFile = path.join(CACHE_DIR, `out_${Date.now()}.mp3`);
const r = spawnSync(PYTHON, ['-m', 'edge_tts', '--voice', voice, '-f', textFile, '--write-media', tmpFile], {
  timeout: 15000, env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
});

if (r.status !== 0) {
  console.log(JSON.stringify({ error: 'tts failed', detail: (r.stderr || '').toString().slice(0, 500) }));
  try { fs.unlinkSync(tmpFile); } catch {}
  process.exit(1);
}

if (fs.existsSync(tmpFile) && fs.statSync(tmpFile).size > 200) {
  fs.renameSync(tmpFile, cacheFile);
  const buf = fs.readFileSync(cacheFile);
  const dur = Math.max([...text].filter(c => /[一-鿿]/.test(c)).length * 250, 1500);
  console.log(JSON.stringify({ audio_base64: buf.toString('base64'), duration_ms: dur, visemes: buildVisemes(text, dur), voice, cached: false }));
  process.exit(0);
}

console.log(JSON.stringify({ error: 'no output file' }));
process.exit(1);

// --- helpers ---
const CV = {'大':1,'佛':4,'山':1,'灵':3,'胜':2,'境':3,'禅':1,'寺':3,'宫':4,'花':1,'海':1,'路':5,'道':1,'桥':1,'塔':1,'湖':5,'高':1,'多':4,'少':1,'好':1,'看':1,'美':2,'我':4,'你':3,'是':3,'的':2,'了':2,'吗':1,'呢':2,'吧':1,'啊':1,'哦':4,'欢':1,'喜':3,'谢':2,'爱':1,'想':1,'说':4,'问':2,'答':1,'来':1,'去':5,'有':4,'在':1,'不':5,'这':2,'那':1,'一':3,'二':1,'三':1,'四':3,'五':5,'六':4,'七':3,'八':1,'九':4,'十':3,'票':1,'价':1,'格':2,'元':1,'门':2,'演':1,'出':5,'时':3,'间':1,'历':3,'史':3,'文':5,'化':1,'建':1,'筑':5};
const VS = {0:{w:0,h:0},1:{w:1,h:0.6},2:{w:0.7,h:0.5},3:{w:0.9,h:0.3},4:{w:0.5,h:0.7},5:{w:0.4,h:0.5}};
function cv(c){return CV[c]||(c.charCodeAt(0)%5)+1}
function buildVisemes(t,d){const c=[...t].filter(c=>/[一-鿿]/.test(c));if(!c.length)return[];const p=d/c.length;return c.map((c,i)=>({time_ms:Math.round(i*p),viseme_id:cv(c),viseme_name:['rest','aa','e','i','o','u'][cv(c)],shape:VS[cv(c)]}))}
