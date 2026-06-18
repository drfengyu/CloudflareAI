#!/usr/bin/env python3
import os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
T = os.path.join(ROOT, 'app', 'admin', 'channels', '[id]', 'page.tsx')
with open(T, 'r', encoding='utf-8') as f:
    content = f.read()
print('Current lines:', content.count(chr(10)))
print('Ends with:', repr(content[-60:]))
