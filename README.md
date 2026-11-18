# Google Account Automation

Herramienta local en Node.js, TypeScript y Playwright para **preparar diez perfiles de pruebas y asistir su registro como cuentas personales de Google**. Incluye consola en español, sesiones independientes, progreso cifrado y reanudación.

Los diez perfiles están definidos en `config/profiles.json`. Son identidades ficticias para pruebas autorizadas. La herramienta no inventa fechas de nacimiento, teléfonos ni información que deba ser verídica. No crea cuentas durante la instalación ni durante las pruebas.

## Instalación

Requisitos: Node.js 22 LTS o posterior compatible, Git, acceso a Internet y un escritorio donde abrir Chromium. Los comandos que desbloquean credenciales necesitan una terminal local interactiva.

```powershell
git clone https://github.com/JoseAQuinto/Automatizacion_gmail.git
cd Automatizacion_gmail
npm ci
npx playwright install chromium
npm run build
npm run doctor
npm start
```

En Linux puede ser necesario `npx playwright install --with-deps chromium` para instalar bibliotecas del sistema. En un equipo ya configurado, `npm run setup` instala las dependencias bloqueadas y Chromium y ejecuta el diagnóstico. Instala primero Node si no está disponible: los scripts no modifican instalaciones del sistema.

Si falta Chromium, se detecta Chrome o Edge en sus ubicaciones habituales y se usa con un directorio nuevo de este proyecto. El navegador personal y su sesión se mantienen separados. Las políticas corporativas pueden impedir esa ejecución; doctor informa del navegador detectado.

## Primer uso

1. Selecciona **Preparar los 10 perfiles**. Introduce una contraseña maestra de al menos doce caracteres y repítela. Se generan diez contraseñas independientes de 28 caracteres y se guardan cifradas.
2. Selecciona **Iniciar creación asistida**. Se abre un solo navegador, separado del Chrome personal.
3. La herramienta rellena nombres, usuario y contraseña cuando reconoce los campos. Si un usuario está ocupado, prueba hasta tres alternativas guardadas. Nunca resuelve desafíos ni evita restricciones.
4. Cuando se pause, completa personalmente en el navegador el paso indicado y avanza de pantalla. Después pulsa Enter en la consola. Escribe `s` para guardar y cerrar.
5. Revisa el estado y exporta un informe si lo necesitas. Una página desconocida se pausa; no se pulsa a ciegas.

La creación efectiva depende de que Google permita el registro. CAPTCHA, teléfono, códigos, datos personales obligatorios y aceptación de condiciones corresponden a la persona. **No hay garantía de poder crear diez cuentas**. No se aceptan condiciones automáticamente ni se reutilizan números, proxies, servicios de CAPTCHA o técnicas de ocultación.

## Comandos

```powershell
npm start -- --help
npm start -- prepare
npm start -- run
npm start -- resume
npm start -- resume 01
npm start -- status
npm start -- open 01
npm start -- verify
npm start -- verify 01
npm start -- email 01
npm start -- report
```

`run` procesa perfiles nuevos secuencialmente. Se detiene ante el primer perfil pausado, bloqueado o con error. `resume` selecciona perfiles interrumpidos, pendientes de intervención o con error. Un perfil bloqueado solo se puede seleccionar explícitamente con `resume ID`, con reconocimiento local del bloqueo; no vuelve a intentarse en lote. No lo reanudes hasta que Google permita continuar.

`open ID` permite utilizar el perfil guardado. Al pulsar Enter en la consola se guarda la última ubicación autorizada y se cierra el navegador. `verify` abre Mi cuenta y comprueba el correo exacto en un control autenticado de Google. Si no puede demostrar la identidad, no declara éxito. Un perfil que alguna vez estuvo verificado nunca vuelve a registrarse automáticamente, aunque expire su sesión.

Si has elegido manualmente otro usuario durante el registro, ejecuta `email ID` para corregir el correo esperado antes de verificarlo. Solo admite Gmail y no permite cambiar perfiles ya verificados.

## Estados y reanudación

| Estado | Significado |
|---|---|
| PENDIENTE | Perfil público configurado, todavía sin almacén preparado. |
| PREPARADA | Contraseña cifrada y carpeta de navegador listas. |
| EN_PROCESO | Se está ejecutando el registro; un reinicio permite reanudar. |
| REQUIERE_INTERVENCION | Falta una acción humana, una pantalla reconocible o verificar la sesión. |
| COMPLETADA | Se observó una sesión autenticada con el correo esperado en Mi cuenta. |
| BLOQUEADA | Google ha limitado o impedido el registro. Se detiene el lote. |
| ERROR | Fallo técnico. Revisa el entorno y reanuda el mismo perfil. |

El almacén se actualiza después de cada transición. `Ctrl+C` solicita parada, cierra Chromium y guarda un estado recuperable. No uses el Administrador de tareas salvo que el proceso esté atascado: una terminación forzada solo conserva el último punto guardado.

Se guarda la URL de reanudación cifrada, pero Google puede invalidarla o reiniciar pasos. Los perfiles conservan cookies y almacenamiento local; la página exacta y los campos no enviados no están garantizados tras cerrar el navegador. El registro tiene un límite de cuarenta pasos por ejecución y no reenvía formularios sin cambios observables.

## Seguridad

- Almacén `data/private/vault.enc`: AES-256-GCM, IV nuevo por escritura, scrypt N=32768/r=8/p=1 y sal aleatoria. Escrituras atómicas y bloqueo de una sola instancia.
- La contraseña maestra solo se pide de forma oculta en la terminal. No se acepta por argumentos, variables de entorno ni archivos `.env`. No hay recuperación si se pierde.
- Los estados, credenciales, correo esperado y URL de reanudación se cifran juntos. Los informes excluyen contraseñas, correos y URLs.
- `profiles/user01/` hasta `profiles/user10/` son carpetas persistentes independientes. **Los archivos internos del navegador no están cifrados por el almacén de la aplicación**: protégelos con tu usuario del sistema y el cifrado de disco. Node aplica permisos restrictivos donde el sistema los soporta; esto no configura las ACL de Windows.
- `data/`, `profiles/`, `reports/`, trazas y secretos están excluidos de Git. No se graban capturas, HAR, vídeos ni trazas. No actives depuración de Playwright que pueda registrar datos de formularios durante registros reales.
- `npm run check:secrets` revisa los archivos publicables y sus rutas. Es una comprobación preventiva de patrones conocidos, no una prueba de ausencia absoluta de secretos.

No copies perfiles de Chrome entre equipos esperando una sesión transferible. En otro PC instala el repositorio y prepara perfiles nuevos; un almacén cifrado contiene credenciales, pero no garantiza que las cookies sean portables. Las copias privadas del almacén y perfiles quedan bajo tu control y no deben subirse al repositorio.

## Desarrollo y pruebas

```powershell
npm ci
npx playwright install chromium
npm run check
```

- `npm run build`: TypeScript estricto.
- `npm test`: cifrado, integridad, persistencia, estados, bloqueo, rutas, informes y CLI.
- `npm run test:browser`: formularios controlados, intervenciones, bloqueo, reanudación, identidad y aislamiento persistente en Chromium.
- `npm run doctor`: diagnóstico local sin acceder a Google.
- `npm run check:secrets`: inspección de archivos publicables mediante Git.

Las pruebas de navegador interceptan **todas** las peticiones y responden con fixtures; no contactan Google ni crean cuentas reales. Usan carpetas temporales propias. GitHub Actions ejecuta compilación y pruebas en Windows y Ubuntu; nunca ejecuta `run` ni `resume`.

## Problemas habituales

| Problema | Acción |
|---|---|
| Falta Chromium | Ejecuta `npx playwright install chromium`. |
| No se resuelve npm o falla la descarga | Revisa la conexión y vuelve a ejecutar `npm ci`. No cambies el lockfile para ocultarlo. |
| No se desbloquea el almacén | Comprueba la contraseña. No borres ni sobrescribas el archivo; puede estar dañado. |
| Otra instancia usa el perfil | Cierra la otra instancia. Se recuperan automáticamente bloqueos de procesos inexistentes. Un archivo de bloqueo inválido requiere revisión local. |
| Cambió una pantalla de Google | Completa personalmente el paso y continúa. Actualiza localizadores y sus pruebas si el cambio es estable. |
| Google bloquea el registro | Conserva BLOQUEADA y espera a poder continuar legítimamente. |
| No se verifica el correo | Revisa la sesión con `open ID`; si cambiaste el usuario antes de completar, usa `email ID`, después `verify ID`. |
| La cuenta existe pero caducó la sesión | Inicia sesión personalmente en ese mismo perfil y ejecuta `verify ID`. No crees otra cuenta para ese ID. |

## Alcance de la validación

La compatibilidad está probada con formularios controlados. La estructura real de Google puede cambiar y requerir pasos manuales. Que las pruebas pasen demuestra el comportamiento del motor frente a esos escenarios; no demuestra la creación real de cuentas ni el acceso a todos los servicios de Google.

Documentación para agentes: [CLAUDE.md](CLAUDE.md) y [AGENT_RUNBOOK.md](AGENT_RUNBOOK.md).

## Publicación inicial desde la carpeta entregada

Si el repositorio remoto sigue vacío, puedes publicar los archivos ya validados desde una terminal PowerShell local:

```powershell
.\Publicar.ps1
```

El script requiere autenticación de Git con permiso de escritura. Clona el remoto vacío dentro de `.work/`, copia únicamente los archivos públicos, revisa secretos, crea el commit y hace un push normal a `main`. Comprueba que el SHA remoto coincide con el publicado y conserva ese checkout sincronizado. No incluye dependencias, cachés, perfiles, credenciales o informes. Si encuentra contenido remoto, se detiene para que se revise antes de incorporar cambios.
