#!/usr/bin/env python3
import os, sys, json, time, re, asyncio, shutil, logging, subprocess
from pathlib import Path
from datetime import datetime
import aiohttp
import requests
from rich.console import Console
from rich.panel import Panel
from rich.prompt import Prompt
from rich.table import Table
from rich import box

console = Console()
logging.basicConfig(level=logging.ERROR)
CONFIG  = Path.home() / ".uploader_config.json"
HISTORY = Path.home() / ".uploader_history.json"
PLACE_CACHE_FILE = Path.home() / ".place_cache.json"
DL_DIR = Path.home() / "spoof_tmp"
os.makedirs(DL_DIR, exist_ok=True)

MAX_RETRY = 3
OC_ENDPOINT = "https://apis.roblox.com/assets/v1/assets"
OC_OPERATIONS = "https://apis.roblox.com/assets/v1/operations/"
CHUNK = 30
KIND_EXT = {'Audio': {'mp3', 'ogg', 'wav'}, 'Decal': {'png', 'jpg', 'jpeg', 'gif', 'webp'}, 'Model': {'rbxm'}, 'Animation': {'rbxm'}}
ASSET_TYPE_IDS = {1: 'Image', 3: 'Audio', 4: 'Mesh', 9: 'Place', 10: 'Model', 13: 'Decal', 24: 'Animation', 38: 'Plugin', 40: 'MeshPart', 62: 'Video'}

SPEED_OPTIONS = {
    "1": ("0.8x", 0.8), "2": ("1.0x (Normal)", 1.0), "3": ("1.2x", 1.2), "4": ("1.5x", 1.5),
    "5": ("1.8x", 1.8), "6": ("2.0x (Bypass Cepat)", 2.0), "7": ("2.3x", 2.3), "8": ("2.5x (Bypass Ekstrem)", 2.5), "9": ("3.0x (Bypass Max)", 3.0),
}
RECOMMENDED = "1.5x"

_DEFAULT_SEEDS = [
    119031818630096,
    76077593225337,
    131528987147518,
    125981614068947,
    112742012181598,
    6872265039,
    5765186170,
    3271915715,
    4483381587,
    7415484388,
]
_PLACE_LOCK = asyncio.Lock()

def load_place_cache():
    cache = list(_DEFAULT_SEEDS)
    if PLACE_CACHE_FILE.exists():
        try:
            data = json.loads(PLACE_CACHE_FILE.read_text())
            if isinstance(data, list): cache += [x for x in data if x not in cache]
        except: pass
    return cache
_PLACE_CACHE = load_place_cache()

async def _add_place_cache(place_id):
    async with _PLACE_LOCK:
        if place_id in _PLACE_CACHE: return
        _PLACE_CACHE.append(place_id)
        try: PLACE_CACHE_FILE.write_text(json.dumps(_PLACE_CACHE))
        except: pass

def load_json(p, default):
    if p.exists():
        try: return json.loads(p.read_text())
        except: return default
    return default

def save_json(p, data): p.write_text(json.dumps(data, indent=2))

def get_roblox_profile(user_id):
    try:
        r = requests.get(f"https://users.roblox.com/v1/users/{user_id}", timeout=10)
        if r.status_code == 200:
            data = r.json()
            return data.get("name"), data.get("displayName")
    except: pass
    return None, None

def banner(cfg):
    console.clear()
    acc_status = "[red]Belum Terhubung[/red]"
    if cfg.get("api_key") and cfg.get("user_id"):
        uname, dname = get_roblox_profile(cfg["user_id"])
        if uname: acc_status = f"[bold green]@{uname}[/bold green] ({dname}) | ID: {cfg['user_id']}"
        else: acc_status = f"[yellow]ID: {cfg['user_id']} (Gagal ambil profil)[/yellow]"
    cookie_status = "[green]Aktif (Bot Siap)[/green]" if cfg.get("cookie") else "[red]Belum Diset[/red]"
    console.print(Panel.fit(
        "[bold red]🔥 ULTIMATE SPOOFER ENGINE (Title Fix) 🔥[/bold red]\n"
        "[dim]Audio Speed Bypass • CDN Bypass • Auto-Retry • Multi Title Detect[/dim]\n"
        f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
        f"[bold cyan]Akun Uploader:[/bold cyan] {acc_status}\n"
        f"[bold cyan]Bot Spoofer:[/bold cyan]   {cookie_status}",
        border_style="red", box=box.DOUBLE))

def setup_uploader_account(cfg):
    banner(cfg)
    console.print("[bold yellow]── SETUP AKUN UPLOADER (API KEY) ──[/bold yellow]")
    console.print("[dim]Masukkan API Key dari Creator Hub (izin: Assets Read & Write)[/dim]\n")
    api_key = Prompt.ask("[cyan]API Key[/cyan]", password=True)
    user_id = Prompt.ask("[cyan]User ID[/cyan]")
    console.print("[yellow]⏳ Memverifikasi akun...[/yellow]")
    uname, dname = get_roblox_profile(user_id)
    if not uname:
        console.print("[red]✘ Gagal! User ID tidak ditemukan.[/red]"); Prompt.ask("Enter"); return
    cfg["api_key"] = api_key; cfg["user_id"] = user_id
    save_json(CONFIG, cfg)
    console.print(f"[bold green]✔ Sukses! Akun: @{uname} ({dname})[/bold green]")
    time.sleep(1.5)

def setup_spoofer_bot(cfg):
    banner(cfg)
    console.print("[bold yellow]── SETUP COOKIE BOT SPOOFER ──[/bold yellow]")
    console.print("[dim]Masukkan Cookie .ROBLOSECURITY (Akun Bot Tumbal)[/dim]\n")
    cookie = Prompt.ask("[cyan]Cookie .ROBLOSECURITY[/cyan]", password=True)
    cfg["cookie"] = cookie.strip()
    save_json(CONFIG, cfg)
    console.print("[bold green]✔ Cookie Bot Spoofer disimpan![/bold green]")
    time.sleep(1.5)

def recommend_playback(speed_val: float) -> str:
    return f"{1.0/speed_val:.2f}"

def pick_speed(cfg):
    banner(cfg)
    console.print("[bold yellow]── PILIH SPEED BYPASS (AUDIO) ──[/bold yellow]")
    t = Table(box=box.SIMPLE, show_header=True, header_style="bold magenta")
    t.add_column("No"); t.add_column("Speed Audio"); t.add_column("Rekomendasi Playback In-Game"); t.add_column("Catatan")
    for k,(lbl,val) in SPEED_OPTIONS.items():
        rec = recommend_playback(val)
        note = "⭐ RECOMMENDED" if lbl == RECOMMENDED else ("Normal" if lbl.startswith("1.0") else "Bypass")
        t.add_row(k, lbl, f"[bold cyan]{rec}x[/bold cyan]", note)
    console.print(t)
    choice = Prompt.ask("Pilih speed", choices=list(SPEED_OPTIONS.keys()), default="4")
    lbl, val = SPEED_OPTIONS[choice]
    rec = recommend_playback(val)
    console.print(f"\n[green]✔ Speed audio:[/green] {lbl}  →  [bold cyan]Rekomendasi playback in-game: {rec}x[/bold cyan]")
    return lbl, val, rec

_CONNECTOR = None
def _connector():
    global _CONNECTOR
    if _CONNECTOR is None or _CONNECTOR.closed:
        _CONNECTOR = aiohttp.TCPConnector(limit=100, limit_per_host=30, ttl_dns_cache=300, enable_cleanup_closed=True)
    return _CONNECTOR

def make_session(): return aiohttp.ClientSession(connector=_connector(), connector_owner=False)

def make_headers(cookie):
    h = {"User-Agent": "Roblox/WinInet", "Accept": "application/json"}
    if cookie:
        c = cookie.strip()
        h["Cookie"] = f".ROBLOSECURITY={c}"
    return h

async def get_asset_details(session, aid, headers):
    name, creator_name, creator_id, asset_type_name = None, None, None, None

    try:
        async with session.get(
            f'https://economy.roblox.com/v1/assets/{aid}/details',
            headers=headers, timeout=10
        ) as r:
            if r.status == 200:
                d = await r.json()
                name = d.get('Name')
                asset_type_name = ASSET_TYPE_IDS.get(d.get('AssetTypeId'))
                creator = d.get('Creator', {})
                creator_id = creator.get('CreatorTargetId')
                creator_name = creator.get('Name')
            elif r.status == 429:
                await asyncio.sleep(2)
    except: pass

    if not name:
        try:
            async with session.get(
                f'https://develop.roblox.com/v1/assets?assetIds={aid}',
                headers=headers, timeout=10
            ) as r:
                if r.status == 200:
                    d = await r.json()
                    if d.get('data') and len(d['data']) > 0:
                        name = d['data'][0].get('Name')
                        if not asset_type_name:
                            asset_type_name = ASSET_TYPE_IDS.get(d['data'][0].get('AssetTypeId'))
        except: pass

    if not name:
        try:
            async with session.get(
                f'https://apis.roblox.com/toolbox-service/v1/items/details?assetIds={aid}',
                headers=headers, timeout=10
            ) as r:
                if r.status == 200:
                    d = await r.json()
                    items = d.get('data', [])
                    if items:
                        asset = items[0].get('asset', {})
                        name = asset.get('name')
                        creator_info = items[0].get('creator', {})
                        if not creator_name:
                            creator_name = creator_info.get('name')
                            creator_id = creator_info.get('id')
                        if not asset_type_name:
                            asset_type_name = ASSET_TYPE_IDS.get(asset.get('typeId'))
        except: pass

    if not name:
        try:
            async with session.post(
                'https://catalog.roblox.com/v1/catalog/items/details',
                headers={**headers, 'Content-Type': 'application/json'},
                json={"items": [{"itemType": "Asset", "id": int(aid)}]},
                timeout=10
            ) as r:
                if r.status == 200:
                    d = await r.json()
                    if d.get('data'):
                        name = d['data'][0].get('name')
                        if not asset_type_name:
                            asset_type_name = d['data'][0].get('assetType')
        except: pass

    return name, creator_name, creator_id, asset_type_name

async def download_asset(session, aid, save_dir, cookie):
    headers = make_headers(cookie)
    places_to_try = list(_PLACE_CACHE)

    try:
        url = f"https://assetdelivery.roblox.com/v2/assetId/{aid}/version/1"
        async with session.get(url, headers=headers, timeout=30) as r:
            if r.status == 200:
                data = await r.json()
                locations = data.get("locations", [])
                if locations and locations[0].get("location"):
                    cdn_url = locations[0]["location"]
                    async with session.get(cdn_url, headers={"User-Agent": "Roblox/WinInet"}, timeout=60) as cdn_r:
                        if cdn_r.status == 200:
                            content = await cdn_r.read()
                            if content and len(content) > 100:
                                path = os.path.join(save_dir, f"asset_{aid}.rbxm")
                                with open(path, "wb") as f: f.write(content)
                                return {"success": True, "file_path": path}
            elif r.status == 429:
                await asyncio.sleep(3)
    except: pass

    c_type, c_id = None, None
    try:
        async with session.get(f'https://economy.roblox.com/v1/assets/{aid}/details', headers=headers, timeout=10) as r:
            if r.status == 200:
                d = await r.json()
                c_type = d.get('Creator', {}).get('CreatorType')
                c_id = d.get('Creator', {}).get('CreatorTargetId')
    except: pass

    if c_type == "User":
        try:
            async with session.get(f"https://games.roblox.com/v2/users/{c_id}/games?accessFilter=Public&limit=10&sortOrder=Asc", timeout=10) as r:
                if r.status == 200:
                    for g in (await r.json()).get('data', []):
                        if g.get('rootPlace', {}).get('id'): places_to_try.insert(0, g['rootPlace']['id'])
        except: pass
    elif c_type == "Group":
        try:
            async with session.get(f"https://games.roblox.com/v2/groups/{c_id}/games?accessFilter=Public&limit=10&sortOrder=Asc", timeout=10) as r:
                if r.status == 200:
                    for g in (await r.json()).get('data', []):
                        if g.get('rootPlace', {}).get('id'): places_to_try.insert(0, g['rootPlace']['id'])
        except: pass

    for pid in places_to_try:
        spoof_headers = headers.copy()
        spoof_headers["Roblox-Place-Id"] = str(pid)
        try:
            async with session.get(f"https://assetdelivery.roblox.com/v1/asset/?id={aid}", headers=spoof_headers, timeout=30) as r:
                if r.status == 200:
                    content = await r.read()
                    if content and len(content) > 100:
                        path = os.path.join(save_dir, f"asset_{aid}.rbxm")
                        with open(path, "wb") as f: f.write(content)
                        await _add_place_cache(pid)
                        return {"success": True, "file_path": path}
                elif r.status == 429:
                    await asyncio.sleep(3)
        except: pass
    return {"success": False, "error": "Bypass Gagal (Private/Rate Limit)"}

async def upload_to_open_cloud(s, path, key, target_id, asset_name, info_type):
    url = "https://apis.roblox.com/assets/v1/assets"
    upload_type = info_type or "Model"
    if upload_type == "Animation":
        upload_type = "Model"
    req_data = {
        "assetType": upload_type,
        "displayName": asset_name[:50],
        "description": "Spoofed",
        "creationContext": {"creator": {"userId": str(target_id)}}
    }
    try:
        with open(path, "rb") as f:
            fname = os.path.basename(path)
            if fname.endswith('.mp3') or fname.endswith('.ogg') or fname.endswith('.wav'):
                ctype = 'audio/mpeg'
            else:
                ctype = 'model/vnd.roblox+xml'
            form = aiohttp.FormData()
            form.add_field('request', json.dumps(req_data), content_type='application/json')
            form.add_field('fileContent', f, filename=fname, content_type=ctype)
            async with s.post(url, headers={"x-api-key": key}, data=form, timeout=300) as r:
                if r.status == 200:
                    return {"success": True, "operation_id": (await r.json()).get("operationId")}
                body = await r.text()
                return {"success": False, "error": f"HTTP {r.status}: {body[:150]}"}
    except Exception as e:
        return {"success": False, "error": str(e)}

async def op_check(s, op_id, key):
    try:
        async with s.get(f'https://apis.roblox.com/assets/v1/operations/{op_id}', headers={'x-api-key': key}, timeout=20) as r:
            if r.status != 200: return {'state': 'pending'}
            data = await r.json()
    except: return {'state': 'pending'}
    if not data.get('done'): return {'state': 'pending'}
    if data.get('error'): return {'state': 'fail', 'error': str(data['error'])}
    aid = str(data.get('response', {}).get('assetId') or '')
    if aid.isdigit(): return {'state': 'done', 'asset_id': aid}
    return {'state': 'fail', 'error': 'No ID'}

async def _process_one(s, aid, save_dir, key, cfg, asset_type, total, idx, speed_val=None):
    row = {'id': aid, 'ok': False}
    headers = make_headers(cfg.get('cookie'))

    name, creator_name, creator_id, itype = await get_asset_details(s, aid, headers)

    display_name = name if name else f"Spoofed_Asset_{aid}"
    row['name'] = display_name
    row['creator'] = f"{creator_name} {creator_id}" if creator_name else "Unknown"
    row['type'] = itype

    final_type = asset_type if asset_type != 'auto' else (itype or 'Model')
    asset_name = str(display_name)[:50]

    console.print(f"\n[bold cyan][{idx}/{total}] Memproses ID: {aid}[/bold cyan]")
    console.print(f"  [dim]├─[/dim] Name       : [yellow]{display_name}[/yellow]")
    console.print(f"  [dim]├─[/dim] Creator    : [yellow]{row['creator']}[/yellow]")
    console.print(f"  [dim]├─[/dim] Type       : [yellow]{final_type}[/yellow]")
    if speed_val and final_type == 'Audio':
        console.print(f"  [dim]├─[/dim] Speed      : [cyan]{speed_val}x[/cyan]")

    res = await download_asset(s, aid, save_dir, cfg.get('cookie'))
    if not res.get('success'):
        row['error'] = res.get('error')
        console.print(f"  [dim]└─[/dim] Status     : [red][GAGAL] {row['error']}[/red]")
        return row

    path = res['file_path']

    if not final_type or final_type == 'auto':
        ext = path.rsplit('.', 1)[-1].lower() if '.' in path else ''
        if ext == 'rbxm':
            try:
                with open(path, 'rb') as fh:
                    content = fh.read(262144)
                    if b'KeyframeSequence' in content:
                        final_type = 'Animation'
                    else:
                        final_type = 'Model'
            except:
                final_type = 'Model'
        else:
            final_type = 'Audio'

    if final_type == 'Audio' and speed_val:
        console.print(f"  [dim]├─[/dim] Process    : [cyan]Mengubah speed audio ke {speed_val}x...[/cyan]")
        out_path = os.path.join(save_dir, f"speed_{aid}.mp3")
        filters, v = [], speed_val
        while v > 2.0:
            filters.append("atempo=2.0"); v /= 2.0
        filters.append(f"atempo={v:.3f}")
        try:
            subprocess.run(["ffmpeg","-y","-i",path,"-filter:a",",".join(filters),"-q:a","0",out_path],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
            path = out_path
        except Exception as e:
            console.print(f"  [dim]└─[/dim] Status     : [red][GAGAL] FFmpeg Error: {e}[/red]")
            return row

    up = await upload_to_open_cloud(s, path, key, cfg['target_id'], asset_name, final_type)
    if not up['success']:
        row['ok'] = False
        row['error'] = up['error']
        console.print(f"  [dim]└─[/dim] Status     : [red][GAGAL] {up['error']}[/red]")
    else:
        op_id = up.get('operation_id')
        if op_id:
            st = await op_check(s, op_id, key)
            if st['state'] == 'done':
                row['ok'] = True
                row['new_id'] = st['asset_id']
                console.print(f"  [dim]└─[/dim] Status     : [green][BERHASIL] {asset_name} → ID: {st['asset_id']}[/green]")
            elif st['state'] == 'fail':
                row['ok'] = False
                row['error'] = st['error']
                console.print(f"  [dim]└─[/dim] Status     : [red][GAGAL] {st['error']}[/red]")
            else:
                row['ok'] = True
                row['new_id'] = 'pending'
                row['op'] = str(op_id)
                console.print(f"  [dim]└─[/dim] Status     : [yellow][PENDING] {asset_name}[/yellow]")
        else:
            row['ok'] = True
            console.print(f"  [dim]└─[/dim] Status     : [green][BERHASIL] {asset_name}[/green]")

    try: os.remove(path)
    except: pass
    return row

async def run_spoof(uid, cfg, ids, asset_type='auto', workers=5, speed_val=None):
    key = cfg['api_key']
    save_dir = os.path.join(DL_DIR, str(uid))
    os.makedirs(save_dir, mode=0o700, exist_ok=True)
    sem = asyncio.Semaphore(workers)
    total = len(ids)

    async def one(aid, idx):
        async with sem:
            async with make_session() as s:
                try:
                    row = await _process_one(s, aid, save_dir, key, cfg, asset_type, total, idx, speed_val)
                except Exception as e:
                    row = {'id': aid, 'ok': False, 'error': f'Err: {e}'}
                    console.print(f"  [dim]└─[/dim] Status     : [red][ERROR] {e}[/red]")
        return row

    try:
        tasks = [one(aid, i+1) for i, aid in enumerate(ids)]
        return list(await asyncio.gather(*tasks))
    finally:
        shutil.rmtree(save_dir, ignore_errors=True)

async def settle_pending(rows, key, max_wait=600):
    deadline = time.monotonic() + max_wait
    pend = [r for r in rows if r.get('ok') and r.get('new_id') == 'pending' and r.get('op')]
    wait = 3.0
    while pend and time.monotonic() < deadline:
        await asyncio.sleep(wait); wait = min(wait + 1.5, 8.0)
        async with make_session() as s:
            res = await asyncio.gather(*[op_check(s, r['op'], key) for r in pend])
        still = []
        for r, st in zip(pend, res):
            if st['state'] == 'done': r['new_id'] = st['asset_id']; r.pop('op', None)
            elif st['state'] == 'fail': r['ok'] = False; r['error'] = st['error']; r.pop('new_id', None); r.pop('op', None)
            else: still.append(r)
        pend = still
    return rows

async def run_batch(uid, cfg, ids, asset_type='auto', workers=5, speed_val=None):
    key = cfg['api_key']; total = len(ids); rows = []; base = 0
    for i in range(0, total, CHUNK):
        chunk = ids[i:i+CHUNK]
        part = await run_spoof(uid, cfg, chunk, asset_type=asset_type, workers=workers, speed_val=speed_val)
        await settle_pending(part, key)
        rows.extend(part); base += len(chunk)
    return rows

def parse_ids(text):
    out = []
    for tok in re.split(r'[\s,;]+', str(text or '')):
        tok = re.sub(r'^rbxassetid://', '', tok.strip(), flags=re.I)
        if tok.isdigit() and len(tok) <= 19: out.append(tok)
    return list(dict.fromkeys(out))

def pick_workers():
    console.print("\n[bold cyan][ Pilih Kecepatan Upload ][/bold cyan]")
    console.print(" 1. Pelan     (1 worker  — aman, cocok koneksi lemah)")
    console.print(" 2. Normal    (3 workers — seimbang)")
    console.print(" 3. Cepat     (5 workers — default)")
    console.print(" 4. Turbo     (10 workers — cepat, butuh koneksi stabil)")
    console.print(" 5. Maksimal  (20 workers — paling cepat, risiko rate limit)")
    pilih = Prompt.ask("[bold white]» Pilih (1/2/3/4/5)[/bold white]", choices=["1","2","3","4","5"], default="3")
    return {"1": 1, "2": 3, "3": 5, "4": 10, "5": 20}[pilih]

def spoof_engine_ui(cfg):
    banner(cfg)
    if not cfg.get("cookie"):
        console.print("[red]✘ Cookie Bot Spoofer belum diset! Setup di Menu 6 dulu.[/red]"); Prompt.ask("Enter"); return

    console.print("[bold cyan][ Pilih Jenis Target Spoof ][/bold cyan]\n 1. Audio\n 2. Animasi (.rbxm)\n 3. Decal\n 4. Otomatis")
    tipe = Prompt.ask("[bold white]» Pilih (1/2/3/4)[/bold white]", choices=["1","2","3","4"], default="4")
    chosen_type = {"1": "Audio", "2": "Animation", "3": "Decal", "4": "auto"}[tipe]

    speed_val = None
    speed_label = "Normal"
    if chosen_type == "Audio":
        speed_label, speed_val, rec_playback = pick_speed(cfg)
        console.print(f"[green]✔ Speed yang dipilih: {speed_label} (Playback: {rec_playback}x)[/green]")

    console.print("\n[bold cyan][ Metode Input ][/bold cyan]\n 1. Manual (Koma)\n 2. File .txt")
    metode = Prompt.ask("[bold white]» Pilih (1/2)[/bold white]", choices=["1","2"], default="1")

    ids_input = Prompt.ask("[bold white]» Masukkan ID (pisah koma)[/bold white]") if metode == "1" else ""
    if metode == "2":
        path_txt = Prompt.ask("[bold white]» Path file .txt[/bold white]")
        try:
            with open(path_txt.strip(), 'r') as f: ids_input = f.read()
        except Exception as e:
            console.print(f"[red]✘ Gagal: {e}[/red]"); Prompt.ask("Enter"); return

    ids = parse_ids(ids_input)
    if not ids:
        console.print("[red]✘ ID kosong.[/red]"); Prompt.ask("Enter"); return

    workers = pick_workers()

    console.print(f"\n[green][Info] Target: {chosen_type.upper()} | Total: {len(ids)} | Workers: {workers}[/green]\n")

    cfg["target_id"] = cfg["user_id"]
    results = asyncio.run(run_batch(cfg["user_id"], cfg, ids, asset_type=chosen_type, workers=workers, speed_val=speed_val))

    ok_count = sum(1 for r in results if r.get('ok'))
    fail_count = len(results) - ok_count

    console.print(f"\n[bold green]✔ Selesai! Berhasil: {ok_count} | Gagal: {fail_count} | Total: {len(results)}[/bold green]")

    for r in results:
        if r.get('ok') and str(r.get('new_id', '')).isdigit():
            h = load_json(HISTORY, [])
            h.append({"time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"), "url": f"Spoof ID: {r['id']}", "status": "OK", "detail": str(r['new_id']), "name": r.get('name', '-'), "speed": speed_label})
            save_json(HISTORY, h)

    Prompt.ask("\nEnter buat balik ke menu")

def main():
    cfg = load_json(CONFIG, {})
    while True:
        banner(cfg)
        console.print("[bold yellow]MENU UTAMA[/bold yellow]\n1. Upload YT\n2. History\n3. Spoof .rbxmx Lokal\n4. Setup Akun Uploader\n5. Spoofer Engine (v2)\n6. Setup Cookie Bot\n7. Keluar")
        c = Prompt.ask("Pilih", choices=["1","2","3","4","5","6","7"], default="1")

        if c == "1": console.print("[yellow]Fitur Upload YT dipisah sementara.[/yellow]"); time.sleep(1)
        elif c == "2":
            banner(cfg); h = load_json(HISTORY, [])
            console.print("[bold yellow]── HISTORY ──[/bold yellow]")
            if not h: console.print("[dim]Kosong.[/dim]")
            else:
                t = Table(box=box.SIMPLE_HEAVY)
                for c_t in ["Waktu","Nama","ID Lama","ID Baru","Speed"]: t.add_column(c_t)
                for e in h[-20:]: t.add_row(e.get("time","-"), e.get("name","-")[:20], e.get("url","-").replace("Spoof ID: ",""), e.get("detail","-"), e.get("speed","-"))
                console.print(t)
            Prompt.ask("Enter")
        elif c == "3": console.print("[yellow]Digabung ke Menu 5.[/yellow]"); time.sleep(1)
        elif c == "4":
            if cfg.get("api_key"):
                banner(cfg); uname, dname = get_roblox_profile(cfg["user_id"])
                console.print(f"Akun: [bold green]@{uname}[/bold green] | ID: {cfg['user_id']}")
                if Prompt.ask("Logout?", choices=["y","n"], default="n") == "y":
                    cfg["api_key"] = ""; cfg["user_id"] = ""; save_json(CONFIG, cfg)
            else: setup_uploader_account(cfg)
        elif c == "5":
            if not cfg.get("api_key"): console.print("[red]Setup Akun di Menu 4![/red]"); time.sleep(1); continue
            spoof_engine_ui(cfg)
        elif c == "6": setup_spoofer_bot(cfg)
        else: console.print("[dim]Keluar.[/dim]"); sys.exit(0)

if __name__ == "__main__":
    try: main()
    except KeyboardInterrupt: console.print("\n[red]Dibatalkan.[/red]")
