# Makes the small built-in photo copies used by the single-file version when the
# live site's photos can't load (for example inside Claude's preview).
#   python3 scripts/make-image-previews.py
# Writes single-file/image-previews.json: {"/images/...": "data:image/webp;base64,..."}
import base64, io, json, pathlib
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
PUBLIC = ROOT / 'public'
WIDTH = {'images/hero.jpg': 400}           # wide banner gets more pixels
DEFAULT_WIDTH = 200

files = ['images/hero.jpg', 'images/grand-royale-arch.jpg', 'images/crating.jpg'] + \
    sorted(str(p.relative_to(PUBLIC)) for p in (PUBLIC / 'images/products').glob('*.jpg'))
out = {}
for rel in files:
    im = Image.open(PUBLIC / rel).convert('RGB')
    w = WIDTH.get(rel, DEFAULT_WIDTH)
    im = im.resize((w, round(w * im.height / im.width)), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, 'WEBP', quality=50, method=6)
    out['/' + rel] = 'data:image/webp;base64,' + base64.b64encode(buf.getvalue()).decode()

dest = ROOT / 'single-file/image-previews.json'
dest.write_text(json.dumps(out, indent=0))
print(f'{len(out)} previews, {dest.stat().st_size / 1024:.0f} KB -> {dest.relative_to(ROOT)}')
