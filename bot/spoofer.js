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
    try:
        async with session.get(f'https://economy.roblox.com/v1/assets/{aid}/details', headers=headers, timeout=aiohttp.ClientTimeout(total=10)) as r:
            if r.status == 200:
                d = await r.json(content_type=None)
                name = d.get('Name')
                asset_type_name = ASSET_TYPE_IDS.get(d.get('AssetTypeId'))
                creator = d.get('Creator', {})
                creator_id = creator.get('CreatorTargetId')
                creator_name = creator.get('Name')
    except: pass
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
    try:
        url = f"https://assetdelivery.roblox.com/v2/assetId/{aid}/version/1"
        async with session.get(url, headers=headers, timeout=aiohttp.ClientTimeout(total=30)) as r:
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
    for pid in places_to_try:
        spoof_headers = headers.copy()
        spoof_headers["Roblox-Place-Id"] = str(pid)
        try:
            async with session.get(f"https://assetdelivery.roblox.com/v1/asset/?id={aid}", headers=spoof_headers, timeout=aiohttp.ClientTimeout(total=30)) as r:
                if r.status == 200:
                    content = await r.read()
                    if content and len(content) > 100:
                        p = os.path.join(save_dir, f"asset_{aid}.rbxm")
                        with open(p, "wb") as f: f.write(content)
                        return {"success": True, "file_path": p}
        except: pass
    return {"success": False, "error": "Bypass Gagal"}

async def upload_asset(session, file_path, key, target_id, asset_name, asset_type):
    fname = os.path.basename(file_path)
    if asset_type == "Animation": ctype = "model/x-rbxm"
    elif fname.endswith('.mp3') or fname.endswith('.ogg'): ctype = "audio/mpeg"
    elif asset_type == "Decal": ctype = "image/png"
    else: ctype = "application/octet-stream"
    req_data = {
        "assetType": asset_type,
        "displayName": asset_name[:50],
        "description": "Spoofed",
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

async def process_speed(file_path, speed_val, save_dir, aid):
    out_path = os.path.join(save_dir, f"speed_{aid}.mp3")
    filters, v = [], speed_val
    while v > 2.0: filters.append("atempo=2.0"); v /= 2.0
    filters.append(f"atempo={v:.3f}")
    try:
        subprocess.run(["ffmpeg","-y","-i",file_path,"-filter:a",",".join(filters),"-q:a","0",out_path],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        return out_path
    except: return file_path

async def main():
    input_data = json.loads(sys.argv[1])
    ids = input_data['ids']
    api_key = input_data['api_key']
    user_id = input_data['user_id']
    speed_val = input_data.get('speed_val')
    asset_type = input_data.get('asset_type', 'auto')
    save_dir = os.path.join(DL_DIR, str(user_id))
    os.makedirs(save_dir, exist_ok=True)
    results = []
    connector = aiohttp.TCPConnector(limit=10)
    async with aiohttp.ClientSession(connector=connector) as session:
        for aid in ids:
            headers = make_headers(COOKIE)
            name, creator_name, creator_id, itype = await get_asset_details(session, aid, headers)
            display_name = name if name else f"Asset_{aid}"
            final_type = asset_type if asset_type != 'auto' else (itype or 'Model')
            res = await download_asset(session, aid, save_dir)
            if not res.get('success'):
                results.append({'id': aid, 'ok': False, 'error': res.get('error'), 'name': display_name}); continue
            file_path = res['file_path']
            if final_type == 'auto' or not final_type:
                try:
                    with open(file_path, 'rb') as fh:
                        content = fh.read(262144)
                        if b'KeyframeSequence' in content or b'CurveAnimation' in content: final_type = 'Animation'
                        else: final_type = 'Model'
                except: final_type = 'Model'
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
                        results.append({'id': aid, 'ok': True, 'new_id': st['asset_id'], 'name': display_name, 'type': final_type}); break
                    elif st['state'] == 'fail':
                        results.append({'id': aid, 'ok': False, 'error': st['error'], 'name': display_name}); break
                else:
                    results.append({'id': aid, 'ok': True, 'new_id': 'pending', 'name': display_name})
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
            'preferredquality': '192',
        }],
        'quiet': True,
        'no_warnings': True,
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)
        title = info.get('title', 'Unknown')
        filename = ydl.prepare_filename(info).rsplit('.', 1)[0] + '.mp3'
        return filename, title

def apply_speed(file_path, speed_val, save_dir):
    out_path = os.path.join(save_dir, f"speed_{os.path.basename(file_path)}")
    filters, v = [], speed_val
    while v > 2.0: filters.append("atempo=2.0"); v /= 2.0
    filters.append(f"atempo={v:.3f}")
    try:
        subprocess.run(["ffmpeg","-y","-i",file_path,"-filter:a",",".join(filters),"-q:a","0",out_path],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        return out_path
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
            file_path = apply_speed(file_path, speed_dir, save_dir)
        result = await upload_audio(file_path, api_key, user_id, title)
        result['title'] = title
        try: os.remove(file_path)
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
    return new Promise((resolve, reject) => {
        const input = JSON.stringify({ ids, api_key: apiKey, user_id: userId, speed_val: speedVal, asset_type: assetType });
        const proc = spawn('python3', [SPOOF_SCRIPT, input]);
        let stdout = '', stderr = '';
        proc.stdout.on('data', d => stdout += d);
        proc.stderr.on('data', d => stderr += d);
        proc.on('close', () => {
            try {
                const lines = stdout.trim().split('\n');
                resolve(JSON.parse(lines[lines.length - 1]));
            } catch { reject(new Error(stderr || stdout || 'Unknown error')); }
        });
    });
}

function runYTUpload(url, apiKey, userId, speedVal = null) {
    return new Promise((resolve, reject) => {
        const input = JSON.stringify({ url, api_key: apiKey, user_id: userId, speed_val: speedVal });
        const proc = spawn('python3', [YT_SCRIPT, input]);
        let stdout = '', stderr = '';
        proc.stdout.on('data', d => stdout += d);
        proc.stderr.on('data', d => stderr += d);
        proc.on('close', () => {
            try {
                const lines = stdout.trim().split('\n');
                resolve(JSON.parse(lines[lines.length - 1]));
            } catch { reject(new Error(stderr || stdout || 'Unknown error')); }
        });
    });
}

module.exports = { runSpoof, runYTUpload };
