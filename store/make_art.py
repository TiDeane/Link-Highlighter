import sys
from PIL import Image, ImageDraw, ImageFont
OUT = sys.argv[1]
K = 4  # supersampling
INTER = '/usr/share/fonts/opentype/inter/'
DARK, CARD, WHITE, MUTED = '#1c1c1f', '#28282c', '#f2f2f4', '#a6a6ad'
YELLOW, ORANGE, BLUE, PAGEBLUE, GREY = '#ffee33', '#ffa500', '#6ea8fe', '#3366cc', '#d5d7dd'

def font(name, size): return ImageFont.truetype(INTER + name, size * K)
def rr(d, box, r, **kw): d.rounded_rectangle([v * K for v in box], r * K, **{k: (v * K if k == 'width' else v) for k, v in kw.items()})

def icon(size):
    """Dark tile with three link lines, the middle one highlighted"""
    im = Image.new('RGBA', (size * K, size * K), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    u = size / 128
    rr(d, (6*u, 6*u, 122*u, 122*u), 26*u, fill=DARK)
    rr(d, (26*u, 28*u, 84*u, 40*u), 6*u, fill=BLUE)
    rr(d, (16*u, 50*u, 112*u, 78*u), 9*u, fill=YELLOW, outline=ORANGE, width=max(1, round(5*u)))
    rr(d, (26*u, 58*u, 102*u, 70*u), 6*u, fill=PAGEBLUE)
    rr(d, (26*u, 88*u, 70*u, 100*u), 6*u, fill=BLUE)
    return im.resize((size, size), Image.LANCZOS)

def page(d, x, y, w, h, rows, bar=12, gap=30, pad=28, line=2):
    """A white 'web page' card with link lines; rows = (indent, width, highlighted)"""
    rr(d, (x, y, x + w, y + h), 16, fill='#ffffff')
    rr(d, (x + pad, y + pad, x + pad + w * 0.45, y + pad + bar + 4), 6, fill='#2b2b30')
    cy = y + pad + 44
    for indent, width, hot in rows:
        bx = x + pad + indent
        if hot:
            rr(d, (bx - 7, cy - 7, bx + width + 7, cy + bar + 7), 7, fill='#ffff4d', outline=ORANGE, width=line)
        rr(d, (bx, cy, bx + width, cy + bar), 5, fill=PAGEBLUE if width > 0 else GREY)
        cy += gap

def tile(w, h, big):
    im = Image.new('RGB', (w * K, h * K), DARK); d = ImageDraw.Draw(im)
    if big:
        ic = icon(112).resize((112 * K, 112 * K), Image.LANCZOS)
        im.paste(ic, (88 * K, 150 * K), ic)
        d.text((88 * K, 288 * K), 'Opened Link Highlighter', font=font('Inter-SemiBold.otf', 56), fill=WHITE)
        d.text((90 * K, 368 * K), "See which links you've already opened.", font=font('Inter-Regular.otf', 30), fill=MUTED)
        rows = [(0, 300, False), (0, 380, True), (0, 250, False), (0, 350, True), (0, 330, False),
                (0, 280, True), (0, 350, False), (0, 310, False), (0, 340, True), (0, 240, False)]
        page(d, 880, 70, 440, 420, rows, bar=14, gap=33, pad=34, line=3)
    else:
        ic = icon(56).resize((56 * K, 56 * K), Image.LANCZOS)
        im.paste(ic, (26 * K, 26 * K), ic)
        d.text((92 * K, 30 * K), 'Opened Link', font=font('Inter-SemiBold.otf', 22), fill=WHITE)
        d.text((92 * K, 56 * K), 'Highlighter', font=font('Inter-SemiBold.otf', 22), fill=WHITE)
        d.text((28 * K, 104 * K), "See which links", font=font('Inter-Regular.otf', 15), fill=MUTED)
        d.text((28 * K, 124 * K), "you've already", font=font('Inter-Regular.otf', 15), fill=MUTED)
        d.text((28 * K, 144 * K), "opened.", font=font('Inter-Regular.otf', 15), fill=MUTED)
        rows = [(0, 90, False), (0, 110, True), (0, 75, False), (0, 114, True), (0, 96, False), (0, 82, True)]
        page(d, 262, 34, 154, 212, rows, bar=9, gap=24, pad=18)
    return im.resize((w, h), Image.LANCZOS)

icon(128).save(f'{OUT}/icon-128.png')
tile(440, 280, False).save(f'{OUT}/small-promo-tile-440x280.png')
tile(1400, 560, True).save(f'{OUT}/marquee-promo-tile-1400x560.png')
# preview sheet
# preview sheet (second argument)
sheet = Image.new("RGB", (1400, 900), "#808080")
sheet.paste(tile(1400, 560, True), (0, 0)); sheet.paste(tile(440, 280, False), (20, 590))
x = 500
for s, bg in ((128, '#ffffff'), (128, '#202124'), (48, '#ffffff'), (48, '#202124'), (16, '#ffffff'), (16, '#202124')):
    b = Image.new('RGB', (s + 24, s + 24), bg); i = icon(s); b.paste(i, (12, 12), i); sheet.paste(b, (x, 600)); x += s + 40
sheet.save(sys.argv[2])
