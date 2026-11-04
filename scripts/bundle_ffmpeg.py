"""Ship the pinned Linux executable even when packaging on macOS.

Only the binary is taken from the official imageio-ffmpeg wheel. The wheel is
verified before extraction; no package scripts or downloaded Python are run.
"""
import hashlib
import io
from pathlib import Path
import urllib.request
import zipfile

WHEEL_URL = 'https://files.pythonhosted.org/packages/a0/2d/43c8522a2038e9d0e7dbdf3a61195ecc31ca576fb1527a528c877e87d973/imageio_ffmpeg-0.6.0-py3-none-manylinux2014_x86_64.whl'
WHEEL_SHA256 = 'c7e46fcec401dd990405049d2e2f475e2b397779df2519b544b8aab515195282'
MEMBER = 'imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2'


def bundle_ffmpeg(destination, cache):
    wheel = Path(cache) / (WHEEL_SHA256 + '.whl')
    raw = wheel.read_bytes() if wheel.exists() else b''
    if hashlib.sha256(raw).hexdigest() != WHEEL_SHA256:
        with urllib.request.urlopen(WHEEL_URL, timeout=60) as response:
            raw = response.read(40 * 1024 * 1024)
        if hashlib.sha256(raw).hexdigest() != WHEEL_SHA256:
            raise RuntimeError('FFmpeg wheel checksum mismatch; deployment stopped.')
        wheel.parent.mkdir(parents=True, exist_ok=True)
        wheel.write_bytes(raw)
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        binary = archive.read(MEMBER)
    if binary[:4] != b'\x7fELF' or binary[4:6] != b'\x02\x01' or binary[18:20] != b'\x3e\x00':
        raise RuntimeError('Expected an x86-64 Linux FFmpeg executable.')
    target = Path(destination) / MEMBER
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(binary)
    target.chmod(0o755)
    return target
