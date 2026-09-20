#!/usr/bin/env python3
"""Install the pinned downloader in an isolated per-skill runtime."""
import argparse
from pathlib import Path
import subprocess
import sys
import venv

ROOT = Path(__file__).resolve().parents[1]
REVISION = '1f540317aa09338e1c33abdd6099c53c1918caf5'
REPO = 'https://github.com/jiji262/douyin-downloader.git'


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--runtime', default=str(ROOT/'.runtime'))
    a=p.parse_args(); runtime=Path(a.runtime).resolve(); runtime.mkdir(parents=True,exist_ok=True)
    upstream=runtime/'upstream'
    if not upstream.exists():
        subprocess.run(['git','clone','--no-checkout',REPO,str(upstream)],check=True)
        subprocess.run(['git','-C',str(upstream),'checkout','--detach',REVISION],check=True)
    current=subprocess.check_output(['git','-C',str(upstream),'rev-parse','HEAD'],text=True).strip()
    if current!=REVISION:
        raise SystemExit('Existing runtime has another revision; use a new runtime directory')
    subprocess.run(['git','-C',str(upstream),'diff','--exit-code','HEAD','--'],check=True,stdout=subprocess.DEVNULL)
    py=runtime/'venv/bin/python'
    if not py.exists(): venv.EnvBuilder(with_pip=True).create(runtime/'venv')
    lock=ROOT/'references/requirements.lock.txt'
    if not lock.exists(): raise SystemExit('Missing tested dependency lock')
    subprocess.run([str(py),'-m','pip','install','--disable-pip-version-check','-r',str(lock)],check=True)
    subprocess.run([str(py),'-m','pip','check'],check=True)
    print('Runtime ready: '+str(runtime))

if __name__=='__main__': main()
