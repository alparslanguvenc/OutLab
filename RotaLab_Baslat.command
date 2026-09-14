#!/bin/bash
set -eo pipefail
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v node >/dev/null 2>&1 && [[ -f "$HOME/.nvm/nvm.sh" ]]; then
  source "$HOME/.nvm/nvm.sh"
fi
if ! command -v python3 >/dev/null 2>&1; then
  echo 'Python 3.11 veya üstü gerekli: https://www.python.org/downloads/'
  read -r -p 'Pencereyi kapatmak için Enter…' reply
  exit 1
fi
python3 launch.py "$@" || { read -r -p 'Hata oluştu. Kapatmak için Enter…' reply; exit 1; }
