# Instrucciones para Claude Code

## Objetivo

Asistir legítimamente el registro de los diez perfiles de `config/profiles.json`, con sesiones independientes y mínimo trabajo manual. No crear cuentas durante la instalación, CI o pruebas. No afirmar registros sin evidencia de identidad autenticada.

## Instalación y comandos

Node.js >=22.16; usar una versión LTS soportada. Ejecutar `npm ci`, `npx playwright install chromium`, `npm run build`, `npm run doctor` y `npm run check`. Abrir `npm start` en una terminal local interactiva para preparar el almacén. La contraseña maestra solo la introduce la persona; no pedirla por chat ni proporcionarla desde código, argumentos, pipes o variables de entorno.

Scripts: `build`, `start`, `doctor`, `test`, `test:browser`, `check:secrets`, `check`, `setup`. El script `setup` requiere Node ya instalado.

## Arquitectura

| Ruta | Responsabilidad |
|---|---|
| src/cli/ | Menú, argumentos, entrada oculta y parada. |
| src/accounts/ | Modelos, preparación, alternativas e informes sin secretos. |
| src/browser/ | Un único contexto persistente por ejecución. |
| src/automation/ | Inspección de pantallas, restricciones, máquina de ejecución y verificación. |
| src/security/ | Generación criptográfica y almacén cifrado autenticado. |
| src/storage/ | Bloqueo exclusivo y recuperación de procesos inexistentes. |
| src/config/ | Rutas relativas y protección frente a recorridos y enlaces de carpetas. |
| scripts/ | Doctor y revisión de archivos publicables. |
| tests/ | Pruebas Node y fixtures de navegador sin peticiones reales. |

`config/profiles.json` es público. `data/private/vault.enc`, `profiles/user01..user10/` e informes son privados y están ignorados. La raíz se calcula desde el módulo; no añadir rutas absolutas del equipo.

## Estados y gestión de perfiles

PENDIENTE → PREPARADA → EN_PROCESO → COMPLETADA, REQUIERE_INTERVENCION, BLOQUEADA o ERROR. COMPLETADA exige verificación del correo esperado en un control autenticado de `myaccount.google.com`. `verifiedAt` conserva la existencia observada aunque la sesión caduque; el motor nunca inicia signup de nuevo para un perfil ya verificado.

`run` procesa nuevos perfiles secuencialmente. `resume [ID]` continúa pendientes; BLOQUEADA se excluye del lote y requiere ID explícito y reconocimiento local. `open ID` abre el perfil; `verify [ID]` comprueba identidad; `email ID` permite corregir un correo elegido manualmente antes de su primera verificación. No cambiar un correo ya verificado.

El almacén guarda después de cada paso y pausa. Una parada conserva el último punto guardado y la URL autorizada. Una URL previa puede expirar: no prometer reanudación exacta de campos no enviados. No borrar perfiles para resolver fallos de registro.

## Operaciones permitidas

Editar código y documentación del proyecto, instalar dependencias, usar fixtures, compilar, probar, revisar Git y publicar commits normales en el repositorio autorizado. Revisar cualquier contenido remoto antes de modificarlo. No forzar pushes ni sobrescribir cambios ajenos. Ejecutar `npm run check:secrets` antes de publicar y revisar la lista de archivos del commit.

## Intervenciones humanas obligatorias

- CAPTCHA y cualquier desafío antiabuso.
- Teléfono, SMS, QR, identidad y autenticación externa.
- Datos personales obligatorios que deban ser verídicos.
- Lectura y aceptación de condiciones.
- Pantallas desconocidas o correos no verificables.

Pausar, guardar el motivo y esperar que la persona actúe en el navegador. No implementar stealth, resolución de CAPTCHA, proxies rotatorios, números desechables, reintentos masivos ni evasión de límites. No marcar éxito por una confirmación humana, un botón de finalización, un título o una URL sin evidencia de correo autenticado.

## Errores y protección de credenciales

Los errores del navegador se traducen a códigos e instrucciones fijas; no imprimir excepciones de Playwright, HTML, cuerpos de respuestas, URLs de sesión o valores de campos reales. No activar trazas, HAR, capturas, vídeos ni depuración de formularios reales. No enviar credenciales a herramientas externas ni escribirlas en documentación.

El almacén usa scrypt y AES-GCM; no rebajar parámetros, guardar claves ni añadir una contraseña maestra por defecto. Los archivos del navegador conservan sus mecanismos propios y requieren protección del sistema operativo. No incorporar copias de sesiones al repositorio ni asumir portabilidad de cookies entre PC.

Si faltan permisos o acceso de red, completar lo posible, describir el bloqueo y distinguir pruebas ejecutadas de pruebas preparadas. Consultar AGENT_RUNBOOK.md para la secuencia operativa.
