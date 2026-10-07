"""Start the Movie Manufacturing site locally.

Open this file in PyCharm and click Run. The site opens in your browser at
http://localhost:4321 once it's ready. Click Stop in PyCharm to shut it down.
"""

import shutil
import subprocess
import sys
import threading
import time
import urllib.request
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
URL = "http://127.0.0.1:4321"


def open_when_ready():
    for _ in range(120):
        try:
            urllib.request.urlopen(URL, timeout=1)
            webbrowser.open(URL)
            return
        except Exception:
            time.sleep(0.5)


def main():
    npm = shutil.which("npm")
    if not npm:
        sys.exit("npm not found. Install Node.js from https://nodejs.org and restart PyCharm.")

    if not (ROOT / "node_modules").exists():
        print("First run: installing packages...")
        subprocess.run([npm, "install"], cwd=ROOT, check=True)

    threading.Thread(target=open_when_ready, daemon=True).start()
    try:
        subprocess.run([npm, "run", "dev"], cwd=ROOT)
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
