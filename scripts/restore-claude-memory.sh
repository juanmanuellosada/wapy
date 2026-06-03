#!/usr/bin/env bash
set -e

# Determina la raíz del repo de forma robusta (funciona desde cualquier directorio)
REPO="$(cd "$(dirname "$0")/.." && pwd)"

# Codifica la ruta del repo según la convención de Claude Code:
# reemplaza cada '/' por '-' (incluyendo el inicial)
ENC="$(printf '%s' "$REPO" | sed 's#/#-#g')"

TARGET="$HOME/.claude/projects/$ENC/memory"
SOURCE="$REPO/.claude/memory"

echo "Repositorio : $REPO"
echo "Destino     : $TARGET"
echo "Fuente      : $SOURCE"
echo ""

# Crea el directorio padre si no existe
mkdir -p "$HOME/.claude/projects/$ENC"

# Manejo del destino si ya existe
if [ -L "$TARGET" ]; then
    echo "Ya existe un symlink en $TARGET — se reemplaza."
    rm "$TARGET"
elif [ -d "$TARGET" ]; then
    BAK="${TARGET}.bak"
    if [ -e "$BAK" ]; then
        echo "ADVERTENCIA: $TARGET es un directorio real y $BAK ya existe."
        echo "  Eliminá o renombrá manualmente uno de los dos y volvé a correr el script."
        exit 1
    fi
    echo "ADVERTENCIA: $TARGET es un directorio real con contenido."
    echo "  Se respalda como: $BAK"
    mv "$TARGET" "$BAK"
elif [ -e "$TARGET" ]; then
    echo "ERROR: $TARGET existe pero no es ni symlink ni directorio. Revisalo manualmente."
    exit 1
fi

# Crea el symlink
ln -s "$SOURCE" "$TARGET"
echo ""
echo "Symlink creado: $TARGET -> $SOURCE"

# Verificación
if [ -r "$TARGET/MEMORY.md" ]; then
    echo "Verificacion OK: $TARGET/MEMORY.md es legible."
else
    echo "ADVERTENCIA: no se pudo leer $TARGET/MEMORY.md. Verificá que .claude/memory/MEMORY.md exista en el repo."
fi
