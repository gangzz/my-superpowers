#!/usr/bin/env python3
"""Download one Douyin work via a pinned upstream; verify media before success."""
import argparse
import asyncio
import contextlib
import hashlib
import io
import json
import logging
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import time
from urllib.parse import urlsplit

REVISION = '1f540317aa09338e1c33abdd6099c53c1918caf5'
ROOT = Path(__file__).resolve().parents[1]


def video_url(value):
    p = urlsplit(value)
    if p.scheme != 'https' or p.username or p.password or p.port:
        raise ValueError('Use an HTTPS Douyin single-video URL without credentials or ports')
    if p.hostname == 'www.douyin.com' and re.fullmatch(r'/video/\d{15,22}/?', p.path):
        return 'https://www.douyin.com' + p.path.rstrip('/')
    if p.hostname in ('v.douyin.com', 'v.iesdouyin.com') and re.fullmatch(r'/[A-Za-z0-9_-]+/?', p.path):
        return 'https://' + p.hostname + p.path
    raise ValueError('Only single-video or Douyin short links are supported; no profile/batch/live URLs')


def media_info(path):
    r = subprocess.run(['ffprobe', '-v', 'error', '-show_entries',
                        'format=duration:stream=codec_type,codec_name,width,height',
                        '-of', 'json', str(path)], capture_output=True, text=True, timeout=30)
    if r.returncode:
        raise ValueError('Media could not be probed')
    d = json.loads(r.stdout)
    if float(d.get('format', {}).get('duration', 0)) <= 0:
        raise ValueError('Empty duration')
    if not any(s.get('codec_type') == 'video' for s in d.get('streams', [])):
        raise ValueError('No video stream')
    digest = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            digest.update(chunk)
    return {'path': str(path.resolve()), 'bytes': path.stat().st_size,
            'sha256': digest.hexdigest(), 'duration_seconds': float(d['format']['duration']),
            'streams': d['streams']}


def load_cookies(path):
    if not path:
        return {}
    d = json.loads(Path(path).read_text())
    if not isinstance(d, dict) or any(not isinstance(k, str) or not isinstance(v, str) for k,v in d.items()):
        raise ValueError('Cookie file must be a JSON object mapping names to string values')
    return d


async def worker(args):
    from config import ConfigLoader
    from core.api_client import DouyinAPIClient
    from core.video_downloader import VideoDownloader
    from storage import FileManager
    from control import RateLimiter, RetryHandler, QueueManager
    from core import LoginRequiredError
    cookies = load_cookies(args.cookies_file)
    # No upstream CookieManager: its setter persists secrets to the cwd.
    class MemoryCookies:
        def get_cookies(self): return cookies
        def set_cookies(self, value): cookies.update(value)
    cfg = ConfigLoader(None)
    cfg.config.update({'path': args.stage, 'video': True, 'music': False, 'cover': False,
        'avatar': False, 'json': False, 'database': False, 'auto_cookie': False,
        'cookies': {}, 'cookie': '', 'filename_template': '{id}', 'folder_template': '{id}',
        'author_dir': 'sec_uid', 'folderstyle': False, 'group_by_mode': False,
        'thread': 1, 'retry_times': 1, 'rate_limit': 1, 'proxy': args.proxy or '',
        'video_quality': '720p', 'download_pinned': False, 'homepage_screenshot': False,
        'author_url': False, 'browser_fallback': {'enabled': False},
        'transcript': {'enabled': False}, 'comments': {'enabled': False},
        'notifications': {'enabled': False}})
    async with DouyinAPIClient(cookies, proxy=args.proxy or '') as api:
        url = args.url
        if urlsplit(url).hostname != 'www.douyin.com':
            url = await api.resolve_short_url(url)
            if not url:
                return {'status':'blocked', 'reason':'short_link_unresolved'}
            url = video_url(url)
            if urlsplit(url).hostname != 'www.douyin.com':
                return {'status':'blocked', 'reason':'short_link_not_resolved_to_video'}
        vid = urlsplit(url).path.rsplit('/',1)[-1]
        engine = VideoDownloader(cfg, api, FileManager(args.stage), MemoryCookies(),
             None, RateLimiter(max_per_second=1), RetryHandler(max_retries=1), QueueManager(max_workers=1))
        try:
            result = await engine.download({'type':'video','aweme_id':vid})
        except LoginRequiredError:
            return {'status':'blocked','reason':'login_required','video_id':vid}
        if not result or result.success != 1 or result.failed:
            return {'status':'blocked','reason':'upstream_download_failed_cookie_or_network_may_be_required',
                    'video_id':vid}
        return {'status':'downloaded_unverified','video_id':vid, 'canonical_url':url}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('url'); p.add_argument('--output', required=True)
    p.add_argument('--runtime', default=str(ROOT / '.runtime'))
    p.add_argument('--cookies-file', help='Explicit local JSON cookie file; never paste cookies in chat')
    p.add_argument('--proxy', default='', help='Explicit proxy URL, if needed')
    p.add_argument('--timeout', type=int, default=180)
    p.add_argument('--worker', action='store_true', help=argparse.SUPPRESS)
    p.add_argument('--stage', help=argparse.SUPPRESS)
    args = p.parse_args()
    try: args.url = video_url(args.url)
    except (ValueError, TypeError):
        print(json.dumps({'status':'failed','reason':'invalid_single_video_url'})); return 2
    if args.worker:
        sys.path.insert(0, str(Path(args.runtime).resolve() / 'upstream'))
        # Never relay upstream errors, which may include signed URLs or request details.
        logging.disable(logging.CRITICAL)
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            try: result = asyncio.run(asyncio.wait_for(worker(args), timeout=args.timeout))
            except TimeoutError: result = {'status':'blocked','reason':'timeout'}
            except Exception as exc: result = {'status':'failed','reason':'upstream_exception','exception_type':type(exc).__name__}
        print(json.dumps(result)); return 0 if result['status']=='downloaded_unverified' else 1
    runtime = Path(args.runtime).resolve(); py = runtime / 'venv/bin/python'
    if not py.exists() or not shutil.which('ffprobe'):
        print(json.dumps({'status':'failed','reason':'setup_required_or_ffprobe_missing'})); return 2
    rev = subprocess.run(['git','-C',str(runtime/'upstream'),'rev-parse','HEAD'],capture_output=True,text=True)
    if rev.returncode or rev.stdout.strip() != REVISION:
        print(json.dumps({'status':'failed','reason':'upstream_revision_mismatch'})); return 2
    output = Path(args.output).resolve(); output.mkdir(parents=True,exist_ok=True)
    run_id = str(time.time_ns()); record = {'source_url':args.url,'upstream_revision':REVISION,'run_id':run_id}
    with tempfile.TemporaryDirectory(prefix='.download-',dir=output) as stage:
        cmd = [str(py),str(Path(__file__).resolve()),args.url,'--output',str(output),
               '--runtime',str(runtime),'--worker','--stage',stage,'--timeout',str(args.timeout), '--proxy',args.proxy]
        if args.cookies_file: cmd += ['--cookies-file',str(Path(args.cookies_file).resolve())]
        env = {k:v for k,v in os.environ.items() if not k.startswith('DOUYIN_')}
        env['PYTHONNOUSERSITE']='1'
        try:
            r = subprocess.run(cmd,cwd=stage,env=env,stdin=subprocess.DEVNULL,capture_output=True,text=True,timeout=args.timeout+20)
            result = json.loads(r.stdout)
            record.update(result)
            if result['status']=='downloaded_unverified':
                files = [f for f in Path(stage).rglob('*.mp4') if result['video_id'] in f.name]
                if len(files)!=1: raise ValueError('Expected one video')
                info = media_info(files[0])
                # Unique destination per run avoids overwriting user media.
                dest=output/(result['video_id']+'-'+run_id+'.mp4')
                shutil.move(str(files[0]),dest); info['path']=str(dest)
                record.update(status='success',media=info)
        except subprocess.TimeoutExpired: record.update(status='blocked',reason='timeout')
        except Exception as exc: record.update(status='failed',reason='verification_or_worker_failed',exception_type=type(exc).__name__)
    report=output/('download-'+run_id+'.json')
    report.write_text(json.dumps(record,ensure_ascii=False,indent=2))
    print(json.dumps({**record,'report':str(report)},ensure_ascii=False))
    return 0 if record['status']=='success' else 1

if __name__=='__main__':
    raise SystemExit(main())
