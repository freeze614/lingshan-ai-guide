/**
 * TTS Service — calls Python micro HTTP server (edge_tts on port 8001).
 */
interface TTSResult {
  audioBase64: string; duration: number;
  visemes: Array<{time_ms:number;viseme_id:number;viseme_name:string;shape:{w:number;h:number}}>;
  voice: string;
}

export async function textToSpeech(text: string, options?: { voice?: string; rate?: string; pitch?: string }): Promise<TTSResult | null> {
  const cleanText = text.replace(/["'`$\\]/g, '').trim();
  console.log(`[TTS] textToSpeech called, text length=${cleanText.length}, first 50 chars="${cleanText.slice(0, 50)}"`);
  if (!cleanText || cleanText.length < 2) {
    console.log('[TTS] text too short, returning null');
    return null;
  }

  const payload = { text: cleanText, voice: options?.voice || 'zh-CN-XiaoxiaoNeural', rate: options?.rate || '+0%', pitch: options?.pitch || '+0Hz' };

  try {
    console.log(`[TTS] calling Python TTS server at http://127.0.0.1:8001/tts, payload length=${JSON.stringify(payload).length}`);
    const res = await fetch('http://127.0.0.1:8001/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(25000),
    });
    console.log(`[TTS] Python server responded with status ${res.status}`);
    const data = await res.json() as any;
    console.log(`[TTS] Response keys:`, Object.keys(data), ', has audio_base64:', !!data.audio_base64, ', audio length:', data.audio_base64?.length || 0);
    if (data.error) { console.error('[TTS] Python server error:', data.error, JSON.stringify(data).slice(0, 200)); return null; }
    return {
      audioBase64: data.audio_base64,
      duration: data.duration_ms,
      visemes: data.visemes || [],
      voice: data.voice || 'zh-CN-XiaoxiaoNeural',
    };
  } catch (e: any) {
    console.error('[TTS] TTS fetch error:', e.message?.slice(0, 200), 'cause:', e.cause || '');
    return null;
  }
}

export async function generateSpeechAudio(text: string): Promise<string | null> {
  const r = await textToSpeech(text);
  return r?.audioBase64 || null;
}