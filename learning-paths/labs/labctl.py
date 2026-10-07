#!/usr/bin/env python3
"""Bounded fixture controls: affect only the explicitly selected lab state directory."""
import argparse
import json
from pathlib import Path
import sqlite3
import urllib.request


def copy_database(source, target):
    if source.resolve() == target.resolve():
        raise ValueError('源与目标不能相同')
    if target.exists():
        raise ValueError('目标已存在，请选择新的恢复或备份文件')
    target.parent.mkdir(parents=True, exist_ok=True)
    try:
        with sqlite3.connect(source.resolve().as_uri() + '?mode=ro', uri=True) as src:
            if src.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
                raise ValueError('源数据库完整性检查失败')
            with sqlite3.connect(target) as dst:
                src.backup(dst)
                if dst.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
                    raise ValueError('目标数据库完整性检查失败')
    except Exception:
        target.unlink(missing_ok=True)
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--state', type=Path, default=Path(__file__).parent / '.state')
    sub = parser.add_subparsers(dest='action', required=True)
    fault = sub.add_parser('fault'); fault.add_argument('mode', choices=['slow', 'unready', 'none'])
    add = sub.add_parser('add'); add.add_argument('name')
    backup = sub.add_parser('backup'); backup.add_argument('destination', type=Path)
    restore = sub.add_parser('restore'); restore.add_argument('source', type=Path); restore.add_argument('destination', type=Path)
    verify = sub.add_parser('verify'); verify.add_argument('--url', default='http://127.0.0.1:8088')
    args = parser.parse_args()
    state = args.state.resolve()
    try:
        if args.action == 'fault':
            if not (state / 'app.db').is_file():
                raise ValueError('请先启动此状态目录下的实验应用')
            # Atomic replacement prevents a reader seeing a partially written fault mode.
            temp = state / 'fault.next'; temp.write_text(args.mode); temp.replace(state / 'fault')
            print('故障模式：' + args.mode + '；恢复命令：labctl.py fault none')
        elif args.action == 'add':
            if not 1 <= len(args.name) <= 200:
                raise ValueError('记录名称须为 1–200 字符')
            with sqlite3.connect((state / 'app.db').as_uri() + '?mode=rw', uri=True) as db:
                db.execute('INSERT INTO items(name) VALUES (?)', (args.name,))
            print('已新增记录：' + args.name)
        elif args.action == 'backup':
            copy_database(state / 'app.db', args.destination)
            print('备份完成：' + str(args.destination))
        elif args.action == 'restore':
            copy_database(args.source, args.destination)
            print('恢复到新文件：' + str(args.destination))
        else:
            for path in ('/healthz', '/readyz', '/version', '/api/items'):
                with urllib.request.urlopen(args.url.rstrip('/') + path, timeout=3) as response:
                    payload = json.load(response)
                    if path == '/api/items' and not payload.get('items'):
                        raise ValueError('业务记录为空')
                    print(path, response.status, json.dumps(payload, ensure_ascii=False))
    except (ValueError, OSError, sqlite3.Error) as error:
        parser.exit(1, str(error) + '\n')


if __name__ == '__main__':
    main()
