#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

test -f "$ROOT/SKILL.md"
test "$(basename "$ROOT")" != ""

python3 - <<'PY' "$ROOT/SKILL.md" "$ROOT"
import sys, pathlib, re
skill = pathlib.Path(sys.argv[1])
root = pathlib.Path(sys.argv[2])
text = skill.read_text(encoding='utf-8')
assert text.startswith('---\n'), 'SKILL.md must start with YAML frontmatter'
parts = text.split('---', 2)
assert len(parts) == 3, 'Invalid frontmatter delimiters'
front = parts[1]
for key in ('name:', 'description:'):
    assert re.search(rf'^\s*{re.escape(key)}', front, re.M), f'Missing {key}'
name = re.search(r'^name:\s*(.+)$', front, re.M).group(1).strip()
assert re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', name), 'name must be kebab-case'
assert (root.name == name), 'folder name must match skill name'
desc = re.search(r'^description:\s*(.+)$', front, re.M).group(1).strip()
assert len(desc) < 1024, 'description must be under 1024 chars'
assert (root/'SKILL.md').name == 'SKILL.md'
assert not (root/'README.md').exists(), 'Do not include README.md inside skill folder'
refs = re.findall(r'`(references/[^`]+)`', text)
for ref in refs:
    assert (root/ref).exists(), f'Missing referenced file: {ref}'
print('PASS: skill structure/frontmatter/references valid')
PY
