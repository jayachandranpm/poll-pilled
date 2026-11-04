"""Reject private/runtime files from Git's index, even after a forced git add."""
from pathlib import PurePosixPath
import subprocess

paths=subprocess.check_output(['git','ls-files','-z']).decode().split('\0')
blocked=[]
private_dirs={'instance','uploads','qa','artifacts','implementation-backup','node_modules','dist','__pycache__','.venv','vendor-cache'}
private_names={'.catalystrc','.npmrc','.secret','.ai-vault-key','credentials.json'}
private_suffixes=('.enc','.key','.pem','.p12','.pfx','.keystore','.db','.sqlite','.sqlite3','.log','.har')
for value in filter(None,paths):
    path=PurePosixPath(value)
    if (private_dirs.intersection(path.parts) or path.name in private_names
        or (path.name.startswith('.env') and path.name!='.env.example')
        or value.endswith(private_suffixes)
        or (value.startswith('deployment/') and value!='deployment/app-config.example.json')):
        blocked.append(value)
if blocked:
    print('Commit blocked: private or generated files are staged:')
    for path in blocked:print(' - '+path)
    raise SystemExit(1)
print('Tracked-file privacy checks passed.')
