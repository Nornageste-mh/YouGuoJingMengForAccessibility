#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""离线解析 mp4 的 moov/trak 结构，判定每个视频文件是否包含音频轨（soun）。

用途：U1 语音判定的离线证据（不启动游戏）。遍历 data/video/*.mp4：
- 顶层 box：ftyp / moov / mdat
- moov > trak > mdia > hdlr：handler_type 判断 vide/soun
- moov > mvhd：整体时长
- moov > trak > mdia > minf > stbl > stsd：编码类型（mp4a/aac 等）
- moov > trak > mdia > minf > stbl > stsz：样本数（=0 视为空轨）

用法：
  python src/harness/mp4-audio-tracks.py [--dir <video目录>] [--out out/evidence/mp4-audio-tracks.json]
默认目录：游戏 data/video（只读；不在游戏目录写任何东西）。
"""
import argparse
import json
import os
import struct
import sys

# box 类型里可能是 uuid 扩展；这里只处理常规 32 位 size + 4 字节 type
CONTAINER = {b'moov', b'trak', b'mdia', b'minf', b'stbl', b'edts', b'dinf', b'udta'}


def read_boxes(buf, start, end):
    """按 32 位 size 遍历 buf[start:end]，yield (type, payload_start, box_end)。"""
    pos = start
    while pos + 8 <= end:
        size = struct.unpack('>I', buf[pos:pos + 4])[0]
        typ = buf[pos + 4:pos + 8]
        if size == 1:  # 64 位 largesize
            if pos + 16 > end:
                break
            size = struct.unpack('>Q', buf[pos + 8:pos + 16])[0]
            payload = pos + 16
        elif size == 0:  # 到文件尾
            size = end - pos
            payload = pos + 8
        else:
            payload = pos + 8
        if size < 8 or pos + size > end:
            break
        yield typ, payload, pos + size
        pos += size


def find_path(buf, start, end, path):
    """在 box 树里按类型路径查找第一个匹配，返回 (payload_start, box_end)。"""
    want = path[0]
    for typ, ps, pe in read_boxes(buf, start, end):
        if typ == want:
            if len(path) == 1:
                return ps, pe
            r = find_path(buf, ps, pe, path[1:])
            if r:
                return r
    return None


def parse_trak(buf, ps, pe):
    info = {'handler': None, 'codec': None, 'samples': None, 'duration_s': None}
    h = find_path(buf, ps, pe, [b'mdia', b'hdlr'])
    if h:
        # hdlr: version/flags(4) + pre_defined(4) + handler_type(4)
        hp = h[0]
        if hp + 12 <= h[1]:
            info['handler'] = buf[hp + 8:hp + 12].decode('latin-1')
    s = find_path(buf, ps, pe, [b'mdia', b'minf', b'stbl', b'stsd'])
    if s:
        sp = s[0]
        # stsd: version/flags(4) + entry_count(4) + [size(4)+type(4)]
        if sp + 16 <= s[1]:
            entry_size = struct.unpack('>I', buf[sp + 8:sp + 12])[0]
            info['codec'] = buf[sp + 12:sp + 16].decode('latin-1')
            info['entry_size'] = entry_size
    z = find_path(buf, ps, pe, [b'mdia', b'minf', b'stbl', b'stsz'])
    if z:
        zp = z[0]
        # stsz: version/flags(4) + sample_size(4) + sample_count(4)
        if zp + 12 <= z[1]:
            info['samples'] = struct.unpack('>I', buf[zp + 8:zp + 12])[0]
    m = find_path(buf, ps, pe, [b'mdia', b'mdhd'])
    if m:
        mp = m[0]
        if mp + 4 <= m[1]:
            ver = buf[mp]
            if ver == 1 and mp + 32 <= m[1]:
                timescale = struct.unpack('>I', buf[mp + 20:mp + 24])[0]
                duration = struct.unpack('>Q', buf[mp + 24:mp + 32])[0]
            elif mp + 20 <= m[1]:
                timescale = struct.unpack('>I', buf[mp + 12:mp + 16])[0]
                duration = struct.unpack('>I', buf[mp + 16:mp + 20])[0]
            else:
                timescale = duration = 0
            if timescale:
                info['duration_s'] = round(duration / timescale, 2)
    return info


def parse_mp4(path):
    with open(path, 'rb') as f:
        buf = f.read()
    out = {'file': os.path.basename(path), 'size': len(buf), 'tracks': [], 'audio_tracks': 0,
           'video_tracks': 0, 'has_audio': None, 'note': ''}
    moov = find_path(buf, 0, len(buf), [b'moov'])
    if not moov:
        out['note'] = 'no moov box'
        out['has_audio'] = None
        return out
    mps, mpe = moov
    mv = find_path(buf, mps, mpe, [b'mvhd'])
    if mv:
        mp = mv[0]
        ver = buf[mp]
        try:
            if ver == 1:
                ts = struct.unpack('>I', buf[mp + 20:mp + 24])[0]
                du = struct.unpack('>Q', buf[mp + 24:mp + 32])[0]
            else:
                ts = struct.unpack('>I', buf[mp + 12:mp + 16])[0]
                du = struct.unpack('>I', buf[mp + 16:mp + 20])[0]
            out['duration_s'] = round(du / ts, 2) if ts else None
        except Exception:
            out['duration_s'] = None
    for typ, ps, pe in read_boxes(buf, mps, mpe):
        if typ != b'trak':
            continue
        t = parse_trak(buf, ps, pe)
        out['tracks'].append(t)
        if t['handler'] == 'soun':
            out['audio_tracks'] += 1
        elif t['handler'] == 'vide':
            out['video_tracks'] += 1
    out['has_audio'] = out['audio_tracks'] > 0
    if out['has_audio']:
        soun = [t for t in out['tracks'] if t['handler'] == 'soun']
        out['note'] = 'audio track present (codec=%s, samples=%s) -> 需按 U1 处理' % (
            soun[0].get('codec'), soun[0].get('samples'))
    else:
        out['note'] = 'no soun track -> 无配音'
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dir', default=r'D:\Steam\steamapps\common\游郭惊梦\resources\app\data\video')
    ap.add_argument('--out', default=os.path.join('out', 'evidence', 'mp4-audio-tracks.json'))
    args = ap.parse_args()
    files = sorted(f for f in os.listdir(args.dir) if f.lower().endswith('.mp4'))
    results = []
    for f in files:
        p = os.path.join(args.dir, f)
        try:
            results.append(parse_mp4(p))
        except Exception as e:  # noqa: BLE001 - 报告解析失败而不是中断
            results.append({'file': f, 'error': '%s: %s' % (type(e).__name__, e), 'has_audio': None})
    os.makedirs(os.path.dirname(args.out) or '.', exist_ok=True)
    with open(args.out, 'w', encoding='utf-8') as w:
        json.dump({'dir': args.dir, 'generatedAt': __import__('datetime').datetime.now().isoformat(timespec='seconds'),
                   'files': results}, w, ensure_ascii=False, indent=1)
    for r in results:
        print('%-20s audio=%s tracks=%s dur=%ss %s' % (
            r.get('file'), r.get('has_audio'), len(r.get('tracks') or []), r.get('duration_s'), r.get('note', r.get('error', ''))))
    print('written:', args.out)


if __name__ == '__main__':
    sys.exit(main())
