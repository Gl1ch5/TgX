#!/usr/bin/env python3
"""Append rows to translations.txt:  python3 tools/i18n/add.py rows.json   ({ "ru key": ["en","es","pt","uk"] , ...})"""
import json, sys, os
p = os.path.join(os.path.dirname(__file__), 'translations.txt')
rows = json.load(open(sys.argv[1], encoding='utf8'))
L = open(p, encoding='utf8').read().rstrip('\n').split('\n')
have = {l.split(' ‖ ')[0] for l in L}
n = 0
for k, v in rows.items():
    if k not in have:
        L.append(' ‖ '.join([k] + v)); n += 1
open(p, 'w', encoding='utf8').write('\n'.join(L) + '\n')
print('added', n)
