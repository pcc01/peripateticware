#!/usr/bin/env python3
"""
DEPRECATED — replaced by scripts/localize.py (the provenance-parity pipeline).

  old:  python mobile/scripts/translate_appstrings.py
  new:  python mobile/scripts/localize.py run-all       (or: npm run i18n:run-all)

localize.py adds: source-key extraction + a CI staleness gate (`check`), a
per-locale XLIFF/W3C-PROV artifact under mobile/i18n/xliff/ (structured
translator/reviewer/operator agents, QualityAssessment, redrive revisions),
an offline QA + redrive loop, and interactive model choosers — while the
device still only ever gets the flat, provenance-free
backend/locale_packs/{code}.json that this script also produced.

This shim forwards to `localize.py run-all` so existing muscle memory / CI
keeps working.
"""
import subprocess
import sys
from pathlib import Path

if __name__ == "__main__":
    target = Path(__file__).with_name("localize.py")
    print("translate_appstrings.py is deprecated — forwarding to localize.py run-all\n")
    sys.exit(subprocess.call([sys.executable, "-X", "utf8", str(target), "run-all", *sys.argv[1:]]))
