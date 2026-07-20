"""
Edge-TTS with viseme timeline generation.
Outputs audio base64 + viseme timeline for lip sync.

Usage: python tts_viseme.py "要合成的文本"
Output: JSON { "audio_base64": "...", "duration_ms": 3000, "visemes": [...] }
"""
import sys
import json
import base64
import asyncio
import tempfile
import os
import re

# Chinese syllable → viseme mapping (based on finals/韵母)
# Viseme IDs: 0=rest, 1=aa(开口), 2=e(半开), 3=i(展唇), 4=o(圆唇), 5=u(噘唇), 6=cd(闭口辅音)
PINYIN_TO_VISEME = {
    # a group - wide open
    'a': 1, 'ia': 1, 'ua': 1, 'ai': 1, 'uai': 1, 'ao': 1, 'iao': 1, 'an': 1, 'ian': 1, 'uan': 1, 'yuan': 1, 'ang': 1, 'iang': 1, 'uang': 1,
    # e group - half open
    'e': 2, 'ie': 2, 'ue': 2, 'ei': 2, 'uei': 2, 'en': 2, 'in': 2, 'un': 2, 'yun': 2, 'eng': 2, 'ing': 2, 'ueng': 2,
    # i group - spread lips
    'i': 3, 'er': 3,
    # o group - round
    'o': 4, 'uo': 4, 'ou': 4, 'iou': 4, 'ong': 4, 'iong': 4,
    # u group - pout
    'u': 5, 'ui': 5,
    # Special finals
    've': 2, 'n': 6, 'ng': 6,
}

# Simple pinyin final extraction (approximate)
def char_to_viseme(char):
    """Estimate viseme from Chinese character using heuristic pinyin mapping."""
    # Common characters mapped directly
    CHAR_MAP = {
        '大': 1, '佛': 4, '山': 1, '灵': 3, '胜': 2, '境': 3, '禅': 1, '寺': 3, '宫': 4,
        '花': 1, '海': 1, '路': 5, '道': 1, '门': 2, '桥': 1, '塔': 1, '湖': 5,
        '高': 1, '多': 4, '少': 1, '好': 1, '看': 1, '美': 2, '我': 4, '你': 3,
        '是': 3, '的': 2, '了': 2, '吗': 1, '呢': 2, '吧': 1, '啊': 1, '哦': 4,
        '欢': 1, '喜': 3, '谢': 2, '爱': 1, '想': 1, '说': 4, '问': 2, '答': 1,
        '来': 1, '去': 5, '有': 4, '在': 1, '不': 5, '这': 2, '那': 1, '一': 3,
        '二': 1, '三': 1, '四': 3, '五': 5, '六': 4, '七': 3, '八': 1, '九': 4, '十': 3,
        '门': 2, '票': 1, '价': 1, '格': 2, '元': 1, '演': 1, '出': 5, '时': 3, '间': 1,
        '历': 3, '史': 3, '文': 5, '化': 1, '建': 1, '筑': 5,
    }
    if char in CHAR_MAP:
        return CHAR_MAP[char]
    # Default: alternate between shapes based on unicode value
    return (ord(char) % 5) + 1


VISEME_NAMES = ['rest', 'aa', 'e', 'i', 'o', 'u', 'cd']
VISEME_SHAPES = {
    0: {'w': 0, 'h': 0},          # rest
    1: {'w': 1.0, 'h': 0.6},      # aa - wide open
    2: {'w': 0.7, 'h': 0.5},      # e - half open
    3: {'w': 0.9, 'h': 0.3},      # i - spread
    4: {'w': 0.5, 'h': 0.7},      # o - round
    5: {'w': 0.4, 'h': 0.5},      # u - pout
    6: {'w': 0.6, 'h': 0.1},      # cd - closed
}


async def generate_tts(text: str, voice: str = "zh-CN-XiaoxiaoNeural", speed: float = 1.0):
    """Generate TTS audio + viseme timeline using edge-tts."""
    import edge_tts

    # Clean text
    clean_text = re.sub(r'[★☆●○◆◇①②③④⑤⑥⑦⑧⑨⑩]', '', text)
    clean_text = re.sub(r'[\U0001F300-\U0001F9FF]', '', clean_text)  # emojis
    clean_text = clean_text.strip()

    if not clean_text or len(clean_text) < 2:
        return None

    # Generate audio
    with tempfile.NamedTemporaryFile(suffix='.mp3', delete=False) as f:
        tmp_path = f.name

    try:
        rate_str = f"{'+' if speed >= 1 else ''}{int((speed - 1) * 100)}%"
        communicate = edge_tts.Communicate(clean_text, voice, rate=rate_str)
        await communicate.save(tmp_path)

        # Read audio
        with open(tmp_path, 'rb') as f:
            audio_data = f.read()

        # Estimate duration based on Chinese character count
        # Average Chinese speech rate: ~4 chars/second
        char_only = re.sub(r'[\s，。！？、；：""''（）【】《》…—\-\+\.\,\!\?]', '', clean_text)
        char_count = len(char_only)
        estimated_duration_ms = max(char_count * 250, 1500)

        # Generate viseme timeline
        # Each Chinese character maps to a viseme
        visemes = []
        chars = list(clean_text)
        valid_chars = [c for c in chars if '一' <= c <= '鿿']  # Chinese chars only

        if valid_chars:
            char_duration = estimated_duration_ms / len(valid_chars)
            current_time = 0

            for i, char in enumerate(valid_chars):
                viseme_id = char_to_viseme(char)
                visemes.append({
                    'time_ms': round(current_time),
                    'viseme_id': viseme_id,
                    'viseme_name': VISEME_NAMES[viseme_id],
                    'shape': VISEME_SHAPES[viseme_id],
                    'char': char,
                })
                current_time += char_duration

        return {
            'audio_base64': base64.b64encode(audio_data).decode('ascii'),
            'duration_ms': estimated_duration_ms,
            'visemes': visemes,
            'char_count': len(valid_chars),
            'voice': voice,
        }
    finally:
        try:
            os.unlink(tmp_path)
        except:
            pass


async def main():
    text = "你好，我是灵小禅"
    voice = "zh-CN-XiaoxiaoNeural"

    # Parse args: --file <path> or positional text
    args = sys.argv[1:]
    i = 0
    while i < len(args):
        if args[i] == '--file' and i + 1 < len(args):
            with open(args[i + 1], 'r', encoding='utf-8') as f:
                text = f.read()
            i += 2
        elif args[i] == '--voice' and i + 1 < len(args):
            voice = args[i + 1]
            i += 2
        elif not args[i].startswith('--'):
            text = args[i]
            i += 1
        else:
            i += 1

    result = await generate_tts(text, voice)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    asyncio.run(main())
