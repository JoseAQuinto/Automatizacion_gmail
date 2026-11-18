# Manual operativo para agentes

## Instalar desde otro ordenador

```powershell
git clone https://github.com/JoseAQuinto/Automatizacion_gmail.git
cd Automatizacion_gmail
npm ci
npx playwright install chromium
npm run build
npm run doctor
npm run check
npm start
```

Antes de cambiar archivos, lee `CLAUDE.md`, `README.md` y cualquier instrucción local aplicable. Usa Node LTS >=22.16, una terminal local interactiva y un escritorio. No uses el Chrome personal del propietario. En Linux instala dependencias del navegador si doctor o Chromium lo requieren.

## Preparar

El menú 1, o `npm start -- prepare`, crea los diez perfiles y solicita una contraseña maestra local que debe introducir la persona. No la solicites por chat. El almacén no tiene contraseña predeterminada. Repetir prepare conserva contraseñas y progreso existentes.

Los nombres son ficticios y públicos. No inventes cumpleaños, teléfonos o datos de identidad. La persona completa esos campos en Google cuando sean obligatorios. Las pruebas sí usan datos sintéticos en fixtures que nunca se envían a Google.

## Ejecutar

1. `npm start -- status` para inspeccionar el estado, sin publicar su contenido privado.
2. `npm start -- run` para nuevos perfiles, de uno en uno.
3. La primera intervención detiene el avance de ese perfil y muestra una instrucción fija. Se conserva el navegador mientras espera la respuesta.
4. La persona completa el paso y avanza en el navegador; después pulsa Enter en la consola. `s` guarda y sale.
5. Si cambia el usuario manualmente, guardar y usar `npm start -- email 01` antes de verificar el correo.
6. El motor solo marca COMPLETADA al observar la identidad exacta autenticada. Si Google no redirige a Mi cuenta, guardar, abrir/verificar mediante CLI y revisar el resultado.

No iniciar dos instancias. El bloqueo de proceso evita acceso simultáneo al almacén y a perfiles desde esta herramienta; no abrir manualmente Chromium con esos directorios durante una ejecución.

## Reanudar o detener

- Ctrl+C solicita parada y cierre. La última transición ya está guardada; las pausas y errores también se guardan.
- `npm start -- resume` selecciona EN_PROCESO, REQUIERE_INTERVENCION y ERROR.
- `npm start -- resume 01` permite elegir un perfil concreto. BLOQUEADA requiere reconocimiento local y solo debe retomarse cuando se haya resuelto el impedimento.
- Si murió el proceso, su bloqueo puede recuperarse automáticamente. No eliminar un bloqueo de un proceso vivo.
- Si una cuenta estuvo verificada, no se vuelve a registrar aunque caduque su sesión. Abrir el mismo perfil, iniciar sesión personalmente y comprobarla con `verify`.
- No tratar un archivo dañado o una clave incorrecta como un almacén vacío. Conservarlo y revisar una copia privada.

## Diagnosticar

`npm run doctor` comprueba Node, configuración, permisos de carpeta, Playwright, Chromium y compilación. No comprueba Google ni crea cuentas.

Una pantalla desconocida es una intervención; un límite es BLOQUEADA y detiene el lote. No convertir estas situaciones en bucles de reintentos. No instalar plugins de evasión. Las URLs guardadas pueden expirar y la persona quizá deba retomar un paso desde el navegador.

## Validar cambios

Ejecutar `npm ci`, `npm run check` y revisar cambios. Las pruebas de navegador interceptan toda petición con fixtures: mantener ese aislamiento al añadir escenarios. Comprobar cifrado e integridad, reanudación, identidad exacta, límite de intentos y separación de cookies. Nunca usar diez registros reales como suite de pruebas.

## Publicar

```powershell
git status --short
npm run check:secrets
git diff --check
git diff --cached --stat
```

Revisar la lista completa antes del commit. No añadir `profiles/`, `data/`, `reports/`, `.work/`, `.env`, tokens, cookies, claves ni capturas de registros reales. Publicar mediante commit y push normales en `main`; comprobar antes cualquier cambio remoto. No forzar el historial.

## Informar resultados

Distinguir siempre: perfiles configurados, perfiles locales preparados, cuentas realmente verificadas y sesiones actualmente verificables. `report` exporta un JSON con ID, nombre de pila, estado, motivo fijo y fechas; excluye credenciales, correos y URLs. Una suite verde no implica que exista ninguna cuenta real.
