# Auto-memoria de Claude Code — Wapy

Esta carpeta contiene la **auto-memoria del proyecto** para Claude Code, versionada en git junto con el resto del código.

## Qué hay acá

Archivos Markdown con notas, decisiones y contexto persistente que Claude Code usa a lo largo de las sesiones (el bloque `# Auto-memory` que aparece en el system prompt).

## Cómo funciona el vínculo con Claude Code

La ubicación que Claude Code lee es:

```
~/.claude/projects/<ruta-codificada-del-repo>/memory/
```

En la máquina de desarrollo esa carpeta **es un symlink** que apunta a `.claude/memory/` dentro del repo. Así los cambios en la memoria quedan versionados y se pueden compartir.

## Activarlo en una PC nueva tras clonar

Después de clonar el repo, ejecutar una sola vez:

```bash
bash scripts/restore-claude-memory.sh
```

El script calcula automáticamente la ruta codificada a partir de la ubicación real del repo, crea el directorio padre si hace falta y crea el symlink. Es idempotente: se puede correr varias veces sin romper nada.

## Advertencias

- El symlink depende de la **convención de ruta codificada de Claude Code** (cada `/` de la ruta absoluta del repo se convierte en `-`). Si Anthropic cambia esa convención, hay que volver a correr el script o ajustarlo.
- La auto-memoria de Claude Code debe estar **habilitada** en la instalación local (configuración predeterminada desde Claude Code ≥ 1.x).
- Si el repo se clona en una ruta diferente a la original, el script lo maneja correctamente porque calcula la codificación en base a la ruta actual.

## Secretos y variables de entorno

Este directorio **no contiene ni debe contener secretos**. Las variables de entorno del proyecto (`.env.local`, claves de API, tokens) se transfieren por fuera de git de forma manual o mediante un gestor de secretos seguro.
