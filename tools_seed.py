import json
from pathlib import Path
root=Path(__file__).resolve().parent
c=json.loads((root/'data/curriculum.json').read_text())
(root/'apps-script/Seed.gs').write_text('/* Generated reviewed content. */\nconst SEED = '+json.dumps(c,ensure_ascii=False)+';\n')
print('Seed.gs updated. Review before publishing.')
