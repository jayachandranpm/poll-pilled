"""Bounded offline media validation, including the bundled Linux FFmpeg."""
import json
import math
import os
import re
import shutil
import subprocess


def ffmpeg_binary():
    binary=shutil.which('ffmpeg')
    if not binary and os.getenv('BUNDLED_FFMPEG')=='true':
        try:
            import imageio_ffmpeg
            binary=imageio_ffmpeg.get_ffmpeg_exe()
        except (ImportError, RuntimeError, OSError):
            # Optional media capabilities must not prevent login or browsing.
            # Media operations still fail closed when no decoder is available.
            return None
    return binary


def validate_clip(path, kind):
    probe=shutil.which('ffprobe')
    if probe:
        result=subprocess.run([probe,'-v','error','-show_streams','-show_format','-of','json',str(path)],capture_output=True,timeout=15,check=True)
        info=json.loads(result.stdout)
        duration=float(info['format']['duration'])
        if not math.isfinite(duration) or not 0<duration<=60 or not any(s.get('codec_type')==kind for s in info['streams']):
            raise ValueError('Use a playable clip up to 60 seconds.')
        return duration
    binary=ffmpeg_binary()
    if not binary: raise ValueError('Media validation is unavailable.')
    # Decode at most 61 seconds with network protocols disabled. Container labels
    # alone are insufficient; require the expected stream and actual decoded time.
    result=subprocess.run([binary,'-nostdin','-protocol_whitelist','file,pipe','-i',str(path),'-t','61','-progress','pipe:1','-f','null','-'],capture_output=True,timeout=40,check=True)
    output=result.stderr.decode(errors='replace')
    if not re.search(r'Stream #[^\n]*'+kind.title()+r':',output): raise ValueError('Wrong media stream.')
    times=re.findall(rb'out_time_us=(\d+)',result.stdout)
    duration=int(times[-1])/1000000 if times else 0
    if not 0<duration<=60: raise ValueError('Use a clip up to 60 seconds.')
    return duration
