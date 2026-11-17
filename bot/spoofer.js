const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SPOOF_SCRIPT = path.join(os.homedir(), 'spoofer_bot_runner.py');
const YT_SCRIPT = path.join(os.homedir(), 'yt_uploader_runner.py');

function ensureSpoofRunner() {
    const script = `
import sys, json, asyncio, os, subprocess
from pathlib import Path
import aiohttp

PLACE_CACHE_FILE = Path.home() / ".place_cache.json"
DL_DIR = Path.home() / "spoof_tmp_bot"
os.makedirs(DL_DIR, exist_ok=True)

_DEFAULT_SEEDS = [
    119031818630096, 76077593225337, 131528987147518,
    125981614068947, 112742012181598, 6872265039,
    5765186170, 3271915715, 4483381587, 7415484388,
]

def load_place_cache():
    cache = list(_DEFAULT_SEEDS)
    if PLACE_CACHE_FILE.exists():
        try:
            data = json.loads(PLACE_CACHE_FILE.read_text())
            if isinstance(data, list): cache += [x for x in data if x not in cache]
        except: pass
    return cache

PLACE_CACHE = load_place_cache()

cfg_path = Path.home() / ".uploader_config.json"
COOKIE = ""
if cfg_path.exists():
    try:
        COOKIE = json.loads(cfg_path.read_text()).get("cookie", "")
    except: pass

ASSET_TYPE_IDS = {1:'Image',3:'Audio',4:'Mesh',9:'Place',10:'Model',13:'Decal',24:'Animation',38:'Plugin',40:'MeshPart',62:'Video'}

def make_headers(cookie):
    h = {"User-Agent": "Roblox/WinInet", "Accept": "application/json"}
    if cookie: h["Cookie"] = f".ROBLOSECURITY={cookie.strip()}"
    return h

async def get_asset_details(session, aid, headers):
    name, creator_name, creator_id, asset_type_name = None, None, None, None
    # 1. Endpoint Utama: Economy API v2 (Roblox telah mematikan v1 menjadi 404, v2 adalah endpoint terbaik & paling akurat)
    try:
        async with session.get(f'https://economy.roblox.com/v2/assets/{aid}/details', headers=headers, timeout=aiohttp.ClientTimeout(total=10)) as r:
            if r.status == 200:
                d = await r.json(content_type=None)
                name = d.get('Name') or d.get('TargetName')
                asset_type_name = ASSET_TYPE_IDS.get(d.get('AssetTypeId'))
                creator = d.get('Creator', {})
                creator_id = creator.get('CreatorTargetId') or creator.get('Id')
                creator_name = creator.get('Name')
    except: pass

    # 2. Fallback: Develop API
    if not name:
        try:
            async with session.get(f'https://develop.roblox.com/v1/assets?assetIds={aid}', headers=headers, timeout=aiohttp.ClientTimeout(total=10)) as r:
                if r.status == 200:
                    d = await r.json(content_type=None)
                    items = d.get('data', [])
                    if items:
                        name = items[0].get('name')
                        if not asset_type_name: asset_type_name = ASSET_TYPE_IDS.get(items[0].get('assetTypeId'))
        except: pass

    # 3. Fallback: Toolbox Service
    if not name:
        try:
            async with session.get(f'https://apis.roblox.com/toolbox-service/v1/items/details?assetIds={aid}', headers=headers, timeout=aiohttp.ClientTimeout(total=10)) as r:
                if r.status == 200:
                    d = await r.json(content_type=None)
                    items = d.get('data', [])
                    if items:
                        asset = items[0].get('asset', {})
                        name = asset.get('name')
                        if not asset_type_name: asset_type_name = ASSET_TYPE_IDS.get(asset.get('typeId'))
        except: pass
    return name, creator_name, creator_id, asset_type_name

async def download_asset(session, aid, save_dir):
    headers = make_headers(COOKIE)
    places_to_try = list(PLACE_CACHE)

    # 1. Coba download langsung tanpa place id
    try:
        url = f"https://assetdelivery.roblox.com/v2/assetId/{aid}"
        async with session.get(url, headers=headers, timeout=aiohttp.ClientTimeout(total=20)) as r:
            if r.status == 200:
                data = await r.json(content_type=None)
                locations = data.get("locations", [])
                if locations and locations[0].get("location"):
                    cdn_url = locations[0]["location"]
                    async with session.get(cdn_url, headers={"User-Agent": "Roblox/WinInet"}, timeout=aiohttp.ClientTimeout(total=60)) as cdn_r:
                        if cdn_r.status == 200:
                            content = await cdn_r.read()
                            if content and len(content) > 100:
                                p = os.path.join(save_dir, f"asset_{aid}.rbxm")
                                with open(p, "wb") as f: f.write(content)
                                return {"success": True, "file_path": p}
            elif r.status == 429: await asyncio.sleep(2)
    except: pass

    # 2. Ambil informasi Creator & Games untuk bypass Roblox-Place-Id
    c_type, c_id = None, None
    try:
        async with session.get(f'https://economy.roblox.com/v2/assets/{aid}/details', headers=headers, timeout=aiohttp.ClientTimeout(total=10)) as r:
            if r.status == 200:
                d = await r.json(content_type=None)
                c_data = d.get('Creator', {})
                c_type = c_data.get('CreatorType')
                c_id = c_data.get('CreatorTargetId') or c_data.get('Id')
    except: pass

    if not c_type or not c_id:
        try:
            async with session.get(f'https://economy.roblox.com/v1/assets/{aid}/details', headers=headers, timeout=aiohttp.ClientTimeout(total=10)) as r:
                if r.status == 200:
                    d = await r.json(content_type=None)
                    c_data = d.get('Creator', {})
                    c_type = c_data.get('CreatorType')
                    c_id = c_data.get('CreatorTargetId') or c_data.get('Id')
        except: pass

    if c_type == "User" and c_id:
        try:
            async with session.get(f"https://games.roblox.com/v2/users/{c_id}/games?accessFilter=Public&limit=25&sortOrder=Asc", timeout=aiohttp.ClientTimeout(total=10)) as r:
                if r.status == 200:
                    for g in (await r.json(content_type=None)).get('data', []):
                        if g.get('rootPlace', {}).get('id'): places_to_try.insert(0, g['rootPlace']['id'])
        except: pass
    elif c_type == "Group" and c_id:
        for f_param in ["accessFilter=1", "accessFilter=All", "accessFilter=Public"]:
            try:
                async with session.get(f"https://games.roblox.com/v2/groups/{c_id}/games?{f_param}&limit=25&sortOrder=Asc", timeout=aiohttp.ClientTimeout(total=10)) as r:
                    if r.status == 200:
                        for g in (await r.json(content_type=None)).get('data', []):
                            if g.get('rootPlace', {}).get('id'): places_to_try.insert(0, g['rootPlace']['id'])
                        break
            except: pass

    # 3. Coba bypass dengan semua place id (v2 CDN & v1 fallback)
    for pid in places_to_try:
        spoof_headers = headers.copy()
        spoof_headers["Roblox-Place-Id"] = str(pid)

        # Coba v2 CDN dengan Place ID
        try:
            async with session.get(f"https://assetdelivery.roblox.com/v2/assetId/{aid}", headers=spoof_headers, timeout=aiohttp.ClientTimeout(total=20)) as r:
                if r.status == 200:
                    data = await r.json(content_type=None)
                    locations = data.get("locations", [])
                    if locations and locations[0].get("location"):
                        cdn_url = locations[0]["location"]
                        async with session.get(cdn_url, headers={"User-Agent": "Roblox/WinInet"}, timeout=aiohttp.ClientTimeout(total=60)) as cdn_r:
                            if cdn_r.status == 200:
                                content = await cdn_r.read()
                                if content and len(content) > 100:
                                    p = os.path.join(save_dir, f"asset_{aid}.rbxm")
                                    with open(p, "wb") as f: f.write(content)
                                    return {"success": True, "file_path": p}
        except: pass

        # Coba v1 Direct dengan Place ID
        try:
            async with session.get(f"https://assetdelivery.roblox.com/v1/asset/?id={aid}", headers=spoof_headers, timeout=aiohttp.ClientTimeout(total=20)) as r:
                if r.status == 200:
                    content = await r.read()
                    if content and len(content) > 100 and not content.startswith(b'{"errors"'):
                        p = os.path.join(save_dir, f"asset_{aid}.rbxm")
                        with open(p, "wb") as f: f.write(content)
                        return {"success": True, "file_path": p}
                elif r.status == 429: await asyncio.sleep(2)
        except: pass

    return {"success": False, "error": "Bypass Gagal (Private/Rate Limit)"}

async def upload_asset(session, file_path, key, target_id, asset_name, asset_type):
    fname = os.path.basename(file_path)
    t_lower = (str(asset_type) if asset_type else "").lower().strip()

    if t_lower in ("animation", "anim"):
        upload_type = "Animation"
        ctype = "model/x-rbxm"
    elif t_lower == "audio" or fname.endswith(('.mp3', '.ogg', '.wav')):
        upload_type = "Audio"
        ctype = "audio/mpeg"
    elif t_lower == "decal" or fname.endswith(('.png', '.jpg', '.jpeg')):
        upload_type = "Decal"
        ctype = "image/png"
    elif t_lower == "model":
        upload_type = "Model"
        ctype = "model/x-rbxm"
    else:
        upload_type = "Model"
        ctype = "model/x-rbxm"

    req_data = {
        "assetType": upload_type,
        "displayName": asset_name[:50],
        "description": "Spoofed via SpooferBot",
        "creationContext": {"creator": {"userId": str(target_id)}}
    }
    for attempt in range(1, 4):
        try:
            with open(file_path, "rb") as f:
                form = aiohttp.FormData()
                form.add_field('request', json.dumps(req_data), content_type='application/json')
                form.add_field('fileContent', f, filename=fname, content_type=ctype)
                async with session.post("https://apis.roblox.com/assets/v1/assets", headers={"x-api-key": key}, data=form, timeout=aiohttp.ClientTimeout(total=300)) as r:
                    if r.status == 200:
                        return {"success": True, "operation_id": (await r.json(content_type=None)).get("operationId")}
                    body = await r.text()
                    if r.status in (429, 500, 503) and attempt < 3:
                        await asyncio.sleep(2 * attempt); continue
                    return {"success": False, "error": f"HTTP {r.status}: {body[:100]}"}
        except Exception as e:
            if attempt < 3: await asyncio.sleep(2 * attempt); continue
            return {"success": False, "error": str(e)}

async def op_check(session, op_id, key):
    try:
        async with session.get(f'https://apis.roblox.com/assets/v1/operations/{op_id}', headers={'x-api-key': key}, timeout=aiohttp.ClientTimeout(total=20)) as r:
            if r.status != 200: return {'state': 'pending'}
            data = await r.json(content_type=None)
    except: return {'state': 'pending'}
    if not data.get('done'): return {'state': 'pending'}
    if data.get('error'): return {'state': 'fail', 'error': str(data['error'])}
    aid = str(data.get('response', {}).get('assetId') or '')
    if aid.isdigit(): return {'state': 'done', 'asset_id': aid}
    return {'state': 'fail', 'error': 'No ID'}

async def grant_asset_permissions(session, aid, key, target_id):
    try:
        universe_ids = []
        try:
            async with session.get(f"https://games.roblox.com/v2/users/{target_id}/games?accessFilter=Public&limit=50&sortOrder=Asc", timeout=aiohttp.ClientTimeout(total=10)) as r:
                if r.status == 200:
                    d = await r.json(content_type=None)
                    for g in d.get('data', []):
                        if g.get('id'):
                            universe_ids.append(str(g['id']))
        except: pass

        if universe_ids:
            perm_requests = []
            for uid in universe_ids:
                perm_requests.append({
                    "assetId": str(aid),
                    "subject": {
                        "subjectType": "Universe",
                        "subjectId": str(uid)
                    },
                    "action": "Use"
                })

            headers = {
                "x-api-key": key,
                "Content-Type": "application/json"
            }
            async with session.patch(
                "https://apis.roblox.com/asset-permissions-api/v1/assets/permissions",
                headers=headers,
                json={"requests": perm_requests},
                timeout=aiohttp.ClientTimeout(total=15)
            ) as pr:
                pass
    except: pass

async def process_speed(file_path, speed_val, save_dir, aid):
    if not speed_val:
        return file_path
    try:
        v = float(speed_val)
        if v == 1.0:
            return file_path
    except:
        return file_path
    out_path = os.path.join(save_dir, f"speed_{aid}.mp3")
    try:
        new_rate = int(44100 * v)
        filter_str = f"asetrate={new_rate},aresample=44100"
        subprocess.run(["ffmpeg","-y","-i",file_path,"-filter:a",filter_str,"-b:a","320k","-ar","44100",out_path],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        if os.path.exists(out_path) and os.path.getsize(out_path) > 0:
            return out_path
        return file_path
    except: return file_path

async def main():
    input_data = json.loads(sys.argv[1])
    ids = input_data['ids']
    api_key = input_data['api_key']
    user_id = input_data['user_id']
    speed_val = input_data.get('speed_val')
    raw_type = (input_data.get('asset_type') or 'auto').lower().strip()
    if raw_type in ('animation', 'anim'):
        chosen_type = 'Animation'
    elif raw_type == 'audio':
        chosen_type = 'Audio'
    elif raw_type == 'decal':
        chosen_type = 'Decal'
    else:
        chosen_type = 'auto'
    save_dir = os.path.join(DL_DIR, str(user_id))
    os.makedirs(save_dir, exist_ok=True)
    results = []
    connector = aiohttp.TCPConnector(limit=10)
    async with aiohttp.ClientSession(connector=connector) as session:
        for aid in ids:
            headers = make_headers(COOKIE)
            name, creator_name, creator_id, itype = await get_asset_details(session, aid, headers)
            display_name = name if name else f"Asset_{aid}"

            # Jika user memilih tipe secara eksplisit (Audio, Animation, Decal), gunakan pilihan user
            if chosen_type and chosen_type != 'auto':
                final_type = chosen_type
            else:
                final_type = itype if itype else None

            res = await download_asset(session, aid, save_dir)
            if not res.get('success'):
                results.append({'id': aid, 'ok': False, 'error': res.get('error'), 'name': display_name}); continue
            file_path = res['file_path']

            # Jika tipe masih belum diketahui, cek isi file (binary fingerprint aman tanpa syntax error)
            if not final_type:
                try:
                    with open(file_path, 'rb') as fh:
                        content = fh.read(262144)
                        if b'KeyframeSequence' in content or b'CurveAnimation' in content:
                            final_type = 'Animation'
                        elif content.startswith(b'ID3') or content.startswith(bytes([0xff, 0xfb])) or content.startswith(bytes([0xff, 0xf3])):
                            final_type = 'Audio'
                        elif content.startswith(bytes([0x89, 0x50, 0x4e, 0x47])) or content.startswith(bytes([0xff, 0xd8])):
                            final_type = 'Decal'
                        else:
                            final_type = 'Model'
                except:
                    final_type = 'Model'

            # Jika nama masih belum didapat dari API publik, coba ekstrak dari metadata binary/xml file
            if not name or display_name == f"Asset_{aid}":
                try:
                    with open(file_path, 'rb') as fh:
                        raw_c = fh.read(65536)
                        import re
                        m = re.search(rb'<string name="Name">(.*?)</string>', raw_c)
                        if m:
                            extracted = m.group(1).decode('utf-8', errors='ignore').strip()
                            if extracted and extracted not in ('Animation', 'KeyframeSequence', 'Model', 'Folder'):
                                display_name = extracted
                except: pass

            # Jika masih belum ada, beri nama deskriptif sesuai jenisnya (misal: Audio_1234567)
            if display_name == f"Asset_{aid}":
                t_label = final_type if final_type and final_type != 'auto' else 'Asset'
                display_name = f"{t_label}_{aid}"

            # Speed hanya diapply ke Audio
            if final_type == 'Audio' and speed_val:
                file_path = await process_speed(file_path, speed_val, save_dir, aid)

            up = await upload_asset(session, file_path, api_key, user_id, display_name, final_type)
            if not up['success']:
                results.append({'id': aid, 'ok': False, 'error': up['error'], 'name': display_name}); continue
            op_id = up.get('operation_id')
            if op_id:
                for _ in range(15):
                    await asyncio.sleep(3)
                    st = await op_check(session, op_id, api_key)
                    if st['state'] == 'done':
                        new_aid = st['asset_id']
                        if final_type == 'Animation' or final_type == 'Audio':
                            await grant_asset_permissions(session, new_aid, api_key, user_id)
                        results.append({'id': aid, 'ok': True, 'new_id': new_aid, 'name': display_name, 'type': final_type}); break
                    elif st['state'] == 'fail':
                        results.append({'id': aid, 'ok': False, 'error': st['error'], 'name': display_name}); break
                else:
                    results.append({'id': aid, 'ok': True, 'new_id': 'pending', 'name': display_name, 'type': final_type})
            try: os.remove(file_path)
            except: pass
    print(json.dumps(results))

asyncio.run(main())
`;
    fs.writeFileSync(SPOOF_SCRIPT, script);
}

function ensureYTRunner() {
    const script = `
import sys, json, asyncio, os, subprocess, re
from pathlib import Path
import aiohttp
import yt_dlp

DL_DIR = Path.home() / "yt_tmp_bot"
os.makedirs(DL_DIR, exist_ok=True)

def download_yt(url, save_dir, speed_val=None):
    out_template = os.path.join(save_dir, '%(title)s.%(ext)s')
    ydl_opts = {
        'format': 'bestaudio/best',
        'outtmpl': out_template,
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': '320',
        }],
        'quiet': True,
        'no_warnings': True,
        'noprogress': True,
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)
        title = info.get('title', 'Unknown')
        filename = ydl.prepare_filename(info).rsplit('.', 1)[0] + '.mp3'
        if not os.path.exists(filename):
            mp3s = [os.path.join(save_dir, f) for f in os.listdir(save_dir) if f.endswith('.mp3')]
            if mp3s:
                filename = max(mp3s, key=os.path.getmtime)
        return filename, title

def apply_speed(file_path, speed_val, save_dir):
    if not speed_val:
        return file_path
    try:
        v = float(speed_val)
        if v == 1.0:
            return file_path
    except:
        return file_path
    out_path = os.path.join(save_dir, f"speed_{os.path.basename(file_path)}")
    try:
        new_rate = int(44100 * v)
        filter_str = f"asetrate={new_rate},aresample=44100"
        subprocess.run(["ffmpeg","-y","-i",file_path,"-filter:a",filter_str,"-b:a","320k","-ar","44100",out_path],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        if os.path.exists(out_path) and os.path.getsize(out_path) > 0:
            try: os.remove(file_path)
            except: pass
            return out_path
        return file_path
    except: return file_path

async def upload_audio(file_path, key, target_id, title):
    fname = os.path.basename(file_path)
    req_data = {
        "assetType": "Audio",
        "displayName": title[:50],
        "description": "Uploaded via SpooferBot",
        "creationContext": {"creator": {"userId": str(target_id)}}
    }
    connector = aiohttp.TCPConnector()
    async with aiohttp.ClientSession(connector=connector) as session:
        for attempt in range(1, 4):
            try:
                with open(file_path, "rb") as f:
                    form = aiohttp.FormData()
                    form.add_field('request', json.dumps(req_data), content_type='application/json')
                    form.add_field('fileContent', f, filename=fname, content_type='audio/mpeg')
                    async with session.post("https://apis.roblox.com/assets/v1/assets", headers={"x-api-key": key}, data=form, timeout=aiohttp.ClientTimeout(total=300)) as r:
                        if r.status == 200:
                            op_id = (await r.json(content_type=None)).get("operationId")
                            if op_id:
                                for _ in range(15):
                                    await asyncio.sleep(3)
                                    async with session.get(f'https://apis.roblox.com/assets/v1/operations/{op_id}', headers={'x-api-key': key}, timeout=aiohttp.ClientTimeout(total=20)) as op_r:
                                        if op_r.status == 200:
                                            data = await op_r.json(content_type=None)
                                            if data.get('done'):
                                                if data.get('error'): return {"success": False, "error": str(data['error'])}
                                                aid = str(data.get('response', {}).get('assetId') or '')
                                                if aid.isdigit(): return {"success": True, "asset_id": aid}
                            return {"success": False, "error": "No operation ID"}
                        body = await r.text()
                        if r.status in (429, 500, 503) and attempt < 3:
                            await asyncio.sleep(2 * attempt); continue
                        return {"success": False, "error": f"HTTP {r.status}: {body[:100]}"}
            except Exception as e:
                if attempt < 3: await asyncio.sleep(2 * attempt); continue
                return {"success": False, "error": str(e)}

async def main():
    input_data = json.loads(sys.argv[1])
    url = input_data['url']
    api_key = input_data['api_key']
    user_id = input_data['user_id']
    speed_val = input_data.get('speed_val')
    save_dir = str(DL_DIR / str(user_id))
    os.makedirs(save_dir, exist_ok=True)
    try:
        file_path, title = download_yt(url, save_dir, speed_val)
        if speed_val:
            file_path = apply_speed(file_path, speed_val, save_dir)
        result = await upload_audio(file_path, api_key, user_id, title)
        result['title'] = title
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
        except: pass
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))

asyncio.run(main())
`;
    fs.writeFileSync(YT_SCRIPT, script);
}

ensureSpoofRunner();
ensureYTRunner();

function runSpoof(ids, apiKey, userId, speedVal = null, assetType = 'auto') {
    ensureSpoofRunner();
    return new Promise((resolve, reject) => {
        const input = JSON.stringify({ ids, api_key: apiKey, user_id: userId, speed_val: speedVal, asset_type: assetType });
        const proc = spawn('python3', [SPOOF_SCRIPT, input]);
        let stdout = '', stderr = '';
        proc.stdout.on('data', d => stdout += d);
        proc.stderr.on('data', d => stderr += d);
        proc.on('close', () => {
            try {
                const match = stdout.match(/\[[\s\S]*\]/);
                if (match) {
                    resolve(JSON.parse(match[0]));
                    return;
                }
                const lines = stdout.trim().split('\n');
                resolve(JSON.parse(lines[lines.length - 1]));
            } catch { reject(new Error(stderr || stdout || 'Unknown error')); }
        });
    });
}

function runYTUpload(url, apiKey, userId, speedVal = null) {
    ensureYTRunner();
    return new Promise((resolve, reject) => {
        const input = JSON.stringify({ url, api_key: apiKey, user_id: userId, speed_val: speedVal });
        const proc = spawn('python3', [YT_SCRIPT, input]);
        let stdout = '', stderr = '';
        proc.stdout.on('data', d => stdout += d);
        proc.stderr.on('data', d => stderr += d);
        proc.on('close', () => {
            try {
                const match = stdout.match(/\{[\s\S]*"success"[\s\S]*\}/);
                if (match) {
                    resolve(JSON.parse(match[0]));
                    return;
                }
                const lines = stdout.trim().split('\n');
                resolve(JSON.parse(lines[lines.length - 1]));
            } catch {
                const cleanError = (stderr || stdout || 'Unknown error')
                    .replace(/\[download\][^\n\r]*/g, '')
                    .replace(/[\r\n]+/g, ' ')
                    .trim();
                reject(new Error(cleanError || 'Gagal download / upload YouTube'));
            }
        });
    });
}

module.exports = { runSpoof, runYTUpload };
