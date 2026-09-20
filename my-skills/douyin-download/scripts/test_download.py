import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

SCRIPT=Path(__file__).resolve().with_name('download.py')
spec=importlib.util.spec_from_file_location('download',SCRIPT)
m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)

class DownloadContract(unittest.TestCase):
    def test_rejects_profile_live_foreign_and_credentials(self):
        for url in ['https://www.douyin.com/user/abc','https://live.douyin.com/123',
                    'https://evil.test/video/7668154019155545395',
                    'https://www.douyin.com.evil.test/video/7668154019155545395',
                    'https://user:pass@www.douyin.com/video/7668154019155545395',
                    'http://www.douyin.com/video/7668154019155545395']:
            with self.subTest(url=url), self.assertRaises(ValueError):m.video_url(url)
    def test_cleans_share_tracking(self):
        self.assertEqual(m.video_url('https://www.douyin.com/video/7668154019155545395?token=private'),
                         'https://www.douyin.com/video/7668154019155545395')
    def test_media_rejects_html_named_mp4(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'bad.mp4'; p.write_text('<html>login needed</html>')
            with self.assertRaises(ValueError):m.media_info(p)
    def test_media_probe_real_fixture(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'fixture.mp4'
            subprocess.run(['ffmpeg','-v','error','-f','lavfi','-i','color=c=blue:s=128x128:d=1',
                            '-c:v','libx264','-pix_fmt','yuv420p',str(p)],check=True)
            r=m.media_info(p)
            self.assertGreater(r['bytes'],0);self.assertGreater(r['duration_seconds'],0)
            self.assertEqual(len(r['sha256']),64)
            self.assertTrue(any(s['codec_type']=='video' for s in r['streams']))
    def test_upstream_success_without_file_is_failure(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d); (root/'venv/bin').mkdir(parents=True);(root/'venv/bin/python').touch()
            fake_rev=subprocess.CompletedProcess([],0,stdout=m.REVISION+'\n',stderr='')
            fake_worker=subprocess.CompletedProcess([],0,stdout=json.dumps({'status':'downloaded_unverified','video_id':'7668154019155545395'}),stderr='')
            argv=['download.py','https://www.douyin.com/video/7668154019155545395','--runtime',d,'--output',str(root/'out')]
            with patch.object(sys,'argv',argv), patch.object(m.subprocess,'run',side_effect=[fake_rev,fake_worker]):
                self.assertEqual(m.main(),1)
            record=json.loads(next((root/'out').glob('download-*.json')).read_text())
            self.assertEqual(record['status'],'failed')
    def test_invalid_cookie_structure(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'cookies.json';p.write_text('[{"name":"sessionid","value":"test"}]')
            with self.assertRaises(ValueError):m.load_cookies(p)

if __name__=='__main__':unittest.main()
