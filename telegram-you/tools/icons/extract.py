#!/usr/bin/env python3
"""
Extract Telegram for Android icons into app/static/icons/android/ and
generate css/tx/icons-android.css, which swaps the web icon font glyphs
for the original Android drawables (tinted with currentColor via masks).

Usage: python3 tools/icons/extract.py <path-to-DrKLO/Telegram checkout>

Vector drawables (res/drawable/*.xml) become SVG; raster ones are copied
from drawable-xxhdpi. The icons are © Telegram (GPLv2, DrKLO/Telegram).
"""
import os
import re
import shutil
import subprocess
import sys
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'icons/android')
CSS = os.path.join(ROOT, 'css/icons-android.css')
A = '{http://schemas.android.com/apk/res/android}'

# web icon class -> Telegram Android drawable
MAP = {
    'arrow-left': 'ic_ab_back',
    'search': 'outline_header_search',
    'more': 'ic_ab_other',
    'close': 'ic_close_white',
    'reload': 'msg_retry',
    'reload-arrows': 'msg_retry',
    'logout': 'msg_leave',
    'download': 'msg_download',
    'settings': 'msg_settings',
    'reply': 'menu_reply',
    'favorite-filled': 'msg_fave',
    'favorite': 'msg_fave',
    'copy': 'msg_copy',
    'comments': 'msg_msgbubble3',
    'channel': 'msg_channel',
    'channel-filled': 'msg_channel',
    'video': 'msg_video',
    'user': 'settings_account',
    'user-filled': 'settings_account',
    'smile': 'input_smile',
    'readchats': 'msg_markread',
    'photo': 'msg_photos',
    'phone': 'msg_calls',
    'open-in-new-tab': 'msg_openin',
    'arrow-right': 'msg_arrowright',
    'next': 'msg_arrowright',
    'link': 'msg_link2',
    'info-filled': 'msg_info',
    'group-filled': 'msg_groups',
    'gifs': 'msg_gif',
    'forward': 'msg_forward',
    'folder-tabs-chats': 'settings_folders',
    'devices-filled': 'settings_devices',
    'delete': 'msg_delete',
    'data': 'settings_data',
    'darkmode': 'msg_theme',
    'camera': 'msg_camera',
    'add': 'msg_add',
    'brush': 'msg_palette',
    'piechart-filled': 'menu_storage_path',
    'share-filled': 'share_arrow',
    'send': 'ic_send',
    'speaker-story': 'msg_unmute',
    'speaker-muted-story': 'msg_mute',
    'animations': 'settings_power',
    'channelviews': 'msg_views',
    'qr': 'msg_qrcode',
    'edit': 'msg_edit',
    'chat-settings': 'settings_chat',
    'privacy': 'settings_privacy',
    'faq': 'settings_faq',
    'stories': 'msg_stories_saved',
    'stories-archive': 'msg_stories_archive',
    'profile-photo': 'outline_profile_photo',
    'profile-edit': 'outline_profile_edit_24',
    'profile-settings': 'outline_profile_settings',
    'st-account': 'settings_account',
    'st-ask': 'settings_ask',
    'st-business': 'settings_business',
    'st-calls': 'settings_calls',
    'st-channel': 'settings_channel',
    'st-chat': 'settings_chat',
    'st-data': 'settings_data',
    'st-devices': 'settings_devices',
    'st-faq': 'settings_faq',
    'st-features': 'settings_features',
    'st-folders': 'settings_folders',
    'st-gift': 'settings_gift',
    'st-gram': 'settings_gram_24',
    'st-group': 'settings_group',
    'st-invite': 'settings_invite',
    'st-language': 'settings_language',
    'st-policy': 'settings_policy',
    'st-power': 'settings_power',
    'st-premium': 'settings_premium',
    'st-privacy': 'settings_privacy',
    'st-sounds': 'settings_sounds',
    'st-stars': 'settings_stars',
    'st-wallet': 'settings_wallet',
    'mute': 'msg_mute',
    'unmute': 'msg_unmute',
    'pin': 'msg_pin',
    'code': 'msg_bots',
    'clock': 'msg_recent',
    'clock-edit': 'msg_edit',
    'save-gallery': 'msg_gallery',
    'favorite': 'msg_fave',
    'check-bold': 'checkbig',
    'star-reaction': 'star_reaction',
    'verified-area': 'verified_area',
    'verified-check': 'verified_check',
    'star': 'msg_premium_liststar',
}


def git(src, *args):
    return subprocess.run(['git', '-C', src, *args], capture_output=True, text=True).stdout


def find(src, name, files):
    for d in ('drawable', 'drawable-xxhdpi', 'drawable-xhdpi'):
        for ext in ('xml', 'webp', 'png'):
            rel = f'TMessagesProj/src/main/res/{d}/{name}.{ext}'
            if rel in files:
                git(src, 'checkout', 'HEAD', '--', rel)
                return os.path.join(src, rel)
    return None


def num(v, default=0.0):
    try:
        return float(str(v).replace('dp', ''))
    except (TypeError, ValueError):
        return default


def color(v):
    if not v or v.startswith('@') or v.startswith('?'):
        return '#fff'
    v = v.lstrip('#')
    if len(v) == 8:
        return '#' + v[2:]
    return '#' + v


def hex_alpha(v):
    v = (v or '').lstrip('#')
    return int(v[:2], 16) / 255 if len(v) == 8 else 1


DEFS = []


def gradient_fill(path, attr):
    """aapt:attr name="android:fillColor" holding a <gradient> -> SVG gradient id."""
    for aapt in path:
        if aapt.tag.endswith('}attr') and aapt.get('name') == attr:
            for g in aapt:
                if g.tag != 'gradient':
                    continue
                gid = f'g{len(DEFS)}'
                stops = ''.join(
                    f'<stop offset="{num(i.get(A + "offset"))}" stop-color="{color(i.get(A + "color"))}" stop-opacity="{hex_alpha(i.get(A + "color")):.3f}"/>'
                    for i in g if i.tag == 'item')
                if g.get(A + 'type') == 'radial':
                    DEFS.append(f'<radialGradient id="{gid}" gradientUnits="userSpaceOnUse" cx="{num(g.get(A + "centerX"))}" cy="{num(g.get(A + "centerY"))}" r="{num(g.get(A + "gradientRadius"))}">{stops}</radialGradient>')
                else:
                    DEFS.append(f'<linearGradient id="{gid}" gradientUnits="userSpaceOnUse" x1="{num(g.get(A + "startX"))}" y1="{num(g.get(A + "startY"))}" x2="{num(g.get(A + "endX"))}" y2="{num(g.get(A + "endY"))}">{stops}</linearGradient>')
                return f'url(#{gid})'
    return None


def convert_node(node):
    out = []
    for child in node:
        tag = child.tag
        if tag == 'group':
            tx, ty = num(child.get(A + 'translateX')), num(child.get(A + 'translateY'))
            sx, sy = num(child.get(A + 'scaleX'), 1), num(child.get(A + 'scaleY'), 1)
            rot = num(child.get(A + 'rotation'))
            px, py = num(child.get(A + 'pivotX')), num(child.get(A + 'pivotY'))
            t = f'translate({tx} {ty}) translate({px} {py}) rotate({rot}) scale({sx} {sy}) translate({-px} {-py})'
            out.append(f'<g transform="{t}">{convert_node(child)}</g>')
        elif tag == 'path':
            d = child.get(A + 'pathData', '')
            fill = child.get(A + 'fillColor')
            stroke = child.get(A + 'strokeColor')
            grad = gradient_fill(child, 'android:fillColor')
            attrs = [f'd="{d}"', f'fill="{grad or (color(fill) if fill else "none")}"']
            if fill and hex_alpha(fill) < 1:
                attrs.append(f'fill-opacity="{hex_alpha(fill):.3f}"')
            if child.get(A + 'fillType') == 'evenOdd':
                attrs.append('fill-rule="evenodd"')
            if stroke:
                attrs.append(f'stroke="{color(stroke)}" stroke-width="{num(child.get(A + "strokeWidth"), 1)}"')
                cap = child.get(A + 'strokeLineCap')
                join = child.get(A + 'strokeLineJoin')
                if cap:
                    attrs.append(f'stroke-linecap="{cap}"')
                if join:
                    attrs.append(f'stroke-linejoin="{join}"')
            alpha = child.get(A + 'fillAlpha')
            if alpha:
                attrs.append(f'fill-opacity="{num(alpha, 1)}"')
            out.append(f'<path {" ".join(attrs)}/>')
        elif tag == 'clip-path':
            pass
    return ''.join(out)


def vector_to_svg(path):
    root = ET.parse(path).getroot()
    if root.tag != 'vector':
        return None
    vw, vh = num(root.get(A + 'viewportWidth'), 24), num(root.get(A + 'viewportHeight'), 24)
    DEFS.clear()
    body = convert_node(root)
    defs = f'<defs>{"".join(DEFS)}</defs>' if DEFS else ''
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {vw:g} {vh:g}">{defs}{body}</svg>'


def main():
    src = sys.argv[1]
    files = set(git(src, 'ls-tree', '-r', '--name-only', 'HEAD', 'TMessagesProj/src/main/res').split('\n'))
    os.makedirs(OUT, exist_ok=True)
    css = ['/* Generated by tools/icons/extract.py: original Telegram for Android icons\n'
           '   (DrKLO/Telegram, GPLv2) replacing the web icon font glyphs. */']
    done = {}
    for cls, name in MAP.items():
        if name not in done:
            path = find(src, name, files)
            if not path:
                print('missing', name)
                continue
            if path.endswith('.xml'):
                svg = vector_to_svg(path)
                if not svg:
                    print('not a vector', name)
                    continue
                with open(os.path.join(OUT, name + '.svg'), 'w') as f:
                    f.write(svg)
                done[name] = name + '.svg'
            else:
                ext = os.path.splitext(path)[1]
                shutil.copy(path, os.path.join(OUT, name + ext))
                done[name] = name + ext
        url = f'../icons/android/{done[name]}'
        css.append(f'.tx .icon-{cls}::before {{ -webkit-mask-image: url("{url}"); mask-image: url("{url}"); }}')
    sel = ', '.join(f'.tx .icon-{c}::before' for c in MAP if MAP[c] in done)
    css.insert(1, sel + ' {\n  content: "" !important;\n  display: inline-block;\n  width: 1em;\n  height: 1em;\n'
               '  background-color: currentColor;\n  -webkit-mask: no-repeat center / contain;\n  mask: no-repeat center / contain;\n  vertical-align: middle;\n}')
    with open(CSS, 'w') as f:
        f.write('\n'.join(css) + '\n')
    print(len(done), 'icons')


if __name__ == '__main__':
    main()
