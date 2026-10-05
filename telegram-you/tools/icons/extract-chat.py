#!/usr/bin/env python3
"""Copies the extra Telegram for Android icons used by Telegram You (app/static/chat) into
app/static/icons/android/ (vectors become SVG, rasters are copied from xxhdpi).

Usage: python3 tools/icons/extract-chat.py <path-to-DrKLO/Telegram checkout>
Icons are © Telegram (GPLv2, DrKLO/Telegram). Reuses the converter of extract.py.
"""
import importlib.util
import os
import shutil
import sys

here = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('extract', os.path.join(here, 'extract.py'))
ex = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ex)

NAMES = '''
ic_ab_back ic_ab_other ic_close_white ic_send outline_header_search
input_smile input_keyboard input_attach input_mic input_video
menu_reply msg_forward msg_copy msg_delete msg_pin msg_unpin msg_select msg_mute msg_unmute
msg_archive msg_calls msg_videocall msg_block msg_secret msg_report msg_autodelete msg_clear
msg_background msg_edit msg_markread msg_check_s msg_halfcheck msg_mini_checks msg_contacts msg_share
msg_download msg_openprofile msg_pinnedlist msg_pin_mini msg_search msg_leave msg_recent
msg_reactions_expand msg_qrcode msg_settings msg_groups msg_channel msg_photos msg_sticker msg_gif
msg_home msg_saved msg_reply_small msg_user_remove msg_stats msg_discussion msg_invited
menu_gift menu_share_off_24 menu_quickreply
chats_pin chats_archive chats_archive_box chats_saved chats_unpin chats_replies
list_check list_halfcheck list_mute list_pin list_secret
profile_newmsg profile_phone profile_video
msg_emoji_recent msg_emoji_smiles msg_emoji_cat msg_emoji_food msg_emoji_activities msg_emoji_travel
msg_emoji_objects msg_emoji_flags msg_emoji_stickers
attach_send calls_video calls_menu_phone filled_fab_compose_32 input_mic_pressed input_video_pressed
input_reply input_forward input_clear msg_panel_clear group_edit
'''.split()


def main():
    src = sys.argv[1]
    files = set(ex.git(src, 'ls-tree', '-r', '--name-only', 'HEAD', 'TMessagesProj/src/main/res').split('\n'))
    os.makedirs(ex.OUT, exist_ok=True)
    n = 0
    for name in NAMES:
        path = ex.find(src, name, files)
        if not path:
            print('missing', name)
            continue
        if path.endswith('.xml'):
            svg = ex.vector_to_svg(path)
            if not svg:
                print('not a vector', name)
                continue
            with open(os.path.join(ex.OUT, name + '.svg'), 'w') as f:
                f.write(svg)
        else:
            shutil.copy(path, os.path.join(ex.OUT, name + os.path.splitext(path)[1]))
        n += 1
    print(n, 'icons')


if __name__ == '__main__':
    main()
