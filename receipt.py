"""Validated, ASCII-only 32-column receipts for the 58 mm ESC/POS printer."""
from pathlib import Path
import re
import textwrap
import unicodedata

from PIL import Image, ImageDraw, ImageFont

RULES = {
    'conway': ('Conway', 'B3/S23', [3], [2, 3]),
    'bacteria': ('Bacteria', 'B34/S456', [3, 4], [4, 5, 6]),
}
WIDTH = 32
ASSETS = Path(__file__).resolve().parent / 'assets'


def relative_abundances(counts):
    """Four-decimal fractions; distribute rounding residuals to sum to 1."""
    total = sum(counts)
    if not total:
        return ['N/A'] * len(counts)
    units = [n * 10000 // total for n in counts]
    order = sorted(range(len(counts)), key=lambda i: (-(counts[i] * 10000 % total), i))
    for i in order[:10000 - sum(units)]:
        units[i] += 1
    return [f'{n / 10000:.4f}' for n in units]


def validate(data):
    if not isinstance(data, dict):
        raise ValueError('Expected a run summary.')
    participant = data.get('participant')
    if (not isinstance(participant, str) or not participant.strip() or len(participant) > 60
            or any(unicodedata.category(c).startswith('C') or c in '\u2028\u2029' for c in participant)):
        raise ValueError('Enter a participant name of 1-60 characters, without control characters.')
    if not isinstance(data.get('id'), str) or not re.fullmatch(r'[a-f0-9-]{36}', data['id']):
        raise ValueError('Invalid run ID.')
    if not isinstance(data.get('rule'), str) or data['rule'] not in RULES:
        raise ValueError('Unknown cellular rule.')
    for key, low, high in [('generation', 0, 1000000000), ('duration', 0, 1000000000),
                           ('snapshots', 0, 100000), ('antibiotics', 0, 100000),
                           ('probiotics', 0, 100000), ('leakyToggles', 0, 100000)]:
        if type(data.get(key)) is not int or not low <= data[key] <= high:
            raise ValueError(f'Invalid {key}.')
    counts = data.get('counts')
    if not isinstance(counts, list) or not 2 <= len(counts) <= 5:
        raise ValueError('Expected two to five species counts.')
    if any(type(n) is not int or not 0 <= n <= 1000000 for n in counts):
        raise ValueError('Invalid species count.')
    if sum(counts) > (2821 if data['snapshots'] else 0):  # Integer grid points in the radius-30 field.
        raise ValueError('Counts exceed the circular field.')
    if type(data.get('leakyGut')) is not bool:
        raise ValueError('Invalid leaky gut state.')
    if type(data.get('test', False)) is not bool:
        raise ValueError('Invalid test marker.')
    return data


def render_receipt(data):
    validate(data)
    _, _, birth, survival = RULES[data['rule']]
    total = sum(data['counts'])
    lines = ['Gut microbiome:'.center(WIDTH), 'Game Of Life'.center(WIDTH), '=' * WIDTH]
    if data.get('test'):
        lines += ['TEST RECEIPT / SYNTHETIC DATA', '-' * WIDTH]
    lines += textwrap.wrap('Participant: ' + data['participant'].strip(), WIDTH)
    lines += textwrap.wrap('We sequenced and profiled your gut microbiome', WIDTH)
    lines += ['-' * WIDTH,
              f"{'NICHE':<16}{'Adjusted CPMs':>16}"]
    fractions = relative_abundances(data['counts'])
    for i in range(len(data['counts'])):
        lines.append(f"{'Function ' + chr(65+i):<16}{fractions[i]:>16}")
    lines += ['-' * WIDTH]
    if not total:
        lines += ['No sampled microbes.', 'Values unavailable.']
    lines += [''] + textwrap.wrap('Game of Life shows how simple rules create complex patterns. Different rules create different universes of the game (Like Bacteria B3,4/S4,5,6). This universe adds a few rules to depict the complexity of the gut microbiome. We often focus on which microbes are there, but their jobs (functional niches) may be more consistent and are linked to our health. Complexity emerges, biology harnesses it.', WIDTH)
    lines += ['-' * WIDTH, f"CORE RULES ({RULES[data['rule']][0]})"]
    rules = [
        'Birth: ' + ','.join(map(str, birth)) + ' neighbors.',
        'Base survival: ' + ','.join(map(str, survival)) + ' neighbors; die otherwise.',
        'Competition: types share space. Crowding can kill microbes; births favor the local majority.',
        'Niches ignore cellular death.',
        'After each generation, a nutrient beside a living niche is consumed and becomes a microbe with the same function.',
        'Mucus layer: survival gets harder towards the edge. Except when leaky gut',
    ]
    for rule in rules:
        lines += textwrap.wrap(rule, WIDTH, initial_indent='* ', subsequent_indent='  ')
    lines += ['=' * WIDTH, 'TO KNOW MORE'.center(WIDTH), 'https://conwaylife.com/wiki/', '',
              'Thank you for playing'.center(WIDTH), 'By: Albert Garcia-Valiente', 'The Microbiome Research Lab.']
    return '\n'.join(lines) + '\n'


def raster(image):
    """Encode a monochrome image using the printer-tested GS v 0 path."""
    image = image.convert('L')
    width_bytes = (image.width + 7) // 8
    pixels = image.load()
    payload = bytearray()
    for y in range(image.height):
        for byte in range(width_bytes):
            value = 0
            for bit in range(8):
                x = byte * 8 + bit
                if x < image.width and pixels[x, y] < 128:
                    value |= 1 << (7 - bit)
            payload.append(value)
    return b'\x1dv0\x00' + width_bytes.to_bytes(2, 'little') + image.height.to_bytes(2, 'little') + payload


def qr_image():
    # Keep the supplied QR asset unchanged. Render to the thermal dot grid,
    # preserving crisp edges and adding white margins (quiet zone).
    with Image.open(ASSETS / 'participant-qr.png') as original:
        rgba = original.convert('RGBA')
        white = Image.new('RGBA', rgba.size, 'white')
        white.alpha_composite(rgba)
        code = white.convert('L').resize((192, 192), Image.Resampling.NEAREST)
    canvas = Image.new('L', (384, 224), 255)
    canvas.paste(code, (96, 16))
    return canvas


def unicode_line(line):
    # Render accented names instead of relying on a device-specific code page.
    size = 22
    font = ImageFont.truetype(str(ASSETS / 'fonts' / 'Montserrat.ttf'), size)
    while font.getlength(line) > 376 and size > 8:
        size -= 1
        font = ImageFont.truetype(str(ASSETS / 'fonts' / 'Montserrat.ttf'), size)
    canvas = Image.new('L', (384, 32), 255)
    ImageDraw.Draw(canvas).text((0, 2), line, fill=0, font=font)
    return raster(canvas)


def escpos(text, include_qr=False):
    # This printer passed plain-text/CRLF diagnostics but fed blank paper with
    # the previous ESC M / ESC a / LF sequence. Use the verified minimal path:
    # initialize and print using its default font. No cutter or drawer pulse.
    output = bytearray(b'\x1b@')
    for line in text.splitlines(keepends=True):
        if line.isascii():
            output.extend(line.replace('\n', '\r\n').encode('ascii'))
        else:
            output.extend(unicode_line(line.rstrip('\n')))
    if include_qr:
        output.extend(b'\r\n')
        output.extend(raster(qr_image()))
    return bytes(output) + b'\r\n\r\n'
