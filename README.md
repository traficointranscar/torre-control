# Torre de Control · Intranscar

Micro app de trazabilidad de flota. Los datos (`data.enc.json`) están cifrados con AES-256-GCM
(clave derivada de la contraseña con PBKDF2-SHA256, 600.000 iteraciones) y solo se descifran en el
dispositivo de quien conoce la contraseña.

- Web / iPhone: https://traficointranscar.github.io/torre-control/ (Safari → Compartir → Agregar a inicio)
- Android: https://github.com/traficointranscar/torre-control/releases/download/apk/TorreControl.apk
- Actualización de datos: la tarea programada de Claude deja `torre-control-datos.json` en OneDrive cada 2 h; el flujo
  `Publicar Torre de Control` (cada 10 min) lo descarga con el secreto `DATA_URL`, lo cifra con el secreto `TC_PASS`
  y publica solo el archivo cifrado.