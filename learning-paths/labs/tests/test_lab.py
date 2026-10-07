import json
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from app import make_server
from labctl import copy_database


class LabTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.state = Path(self.temp.name)
        self.server = make_server('127.0.0.1', 0, self.state, 'test-v1')
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.url = f'http://127.0.0.1:{self.server.server_port}'

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.temp.cleanup()

    def request(self, path):
        try:
            with urllib.request.urlopen(self.url + path, timeout=3) as response:
                return response.status, response.read().decode()
        except urllib.error.HTTPError as error:
            with error:
                return error.code, error.read().decode()

    def cli(self, *args):
        return subprocess.run([sys.executable, str(ROOT / 'labctl.py'), '--state', str(self.state), *args], capture_output=True, text=True)

    def test_business_and_dependency_failure_recovery(self):
        self.assertEqual(json.loads(self.request('/api/items')[1])['items'][0]['name'], 'first-deployment')
        self.assertEqual(self.cli('fault', 'unready').returncode, 0)
        self.assertEqual(self.request('/healthz')[0], 200)
        self.assertEqual(self.request('/readyz')[0], 503)
        self.assertNotEqual(self.cli('verify', '--url', self.url).returncode, 0)
        self.assertEqual(self.cli('fault', 'none').returncode, 0)
        self.assertEqual(self.cli('verify', '--url', self.url).returncode, 0)
        self.assertIn('status="503"', self.request('/metrics')[1])

    def test_backup_restore_preserves_original_and_refuses_overwrite(self):
        backup, restored = self.state / 'before.db', self.state / 'restored.db'
        self.assertEqual(self.cli('backup', str(backup)).returncode, 0)
        self.assertEqual(self.cli('add', "new ' quoted row").returncode, 0)
        self.assertEqual(self.cli('restore', str(backup), str(restored)).returncode, 0)
        with sqlite3.connect(restored) as db:
            self.assertEqual(db.execute('SELECT count(*) FROM items').fetchone()[0], 1)
        self.assertEqual(len(json.loads(self.request('/api/items')[1])['items']), 2)
        self.assertNotEqual(self.cli('restore', str(backup), str(restored)).returncode, 0)
        with self.assertRaises(ValueError):
            copy_database(backup, backup)

    def test_missing_database_fails_readiness_without_recreating_it(self):
        (self.state / 'app.db').rename(self.state / 'removed.db')
        self.assertEqual(self.request('/readyz')[0], 503)
        self.assertFalse((self.state / 'app.db').exists())
        self.assertEqual(self.request('/healthz')[0], 200)

    def test_unknown_paths_have_bounded_metric_labels(self):
        self.assertEqual(self.request('/unknown-1')[0], 404)
        self.assertEqual(self.request('/unknown-2')[0], 404)
        metrics = self.request('/metrics')[1]
        self.assertIn('route="other",status="404"} 2', metrics)
        self.assertNotIn('unknown-1', metrics)


if __name__ == '__main__':
    unittest.main()
