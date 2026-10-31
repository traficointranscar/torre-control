#!/usr/bin/env python3
"""Usado por GitHub Actions: descarga los datos (JSON plano) desde el link de OneDrive, los valida,
los cifra y deja el archivo cifrado listo para publicar. Imprime cambio=si/no para el flujo.

python3 sincronizar.py <url_onedrive> <respaldo.enc.json> <publicado.enc.json> <salida.enc.json>
"""
import base64, json, os, sys, urllib.request
sys.path.insert(0, os.path.dirname(__file__))
from cifrar import cifrar, descifrar, validar

url, respaldo, publicado, salida = sys.argv[1:5]
pwd = os.environ.get('TC_PASS', '')
base = json.load(open(respaldo))
salt = base64.b64decode(base['salt'])

def log(m): print(m, file=sys.stderr)

nuevo = None
if url and pwd:
    dl = url + ('&' if '?' in url else '?') + 'download=1'
    try:
        req = urllib.request.Request(dl, headers={'User-Agent': 'Mozilla/5.0'})
        raw = urllib.request.urlopen(req, timeout=60).read().decode('utf-8-sig')
        nuevo = json.loads(raw); validar(nuevo)
        log('Datos de OneDrive OK: ' + nuevo['lastUpdate'])
    except Exception as e:
        log('::warning::No se pudo leer o validar el archivo de OneDrive: %s' % e); nuevo = None
else:
    log('::warning::Faltan los secretos DATA_URL o TC_PASS')

previo = None
try:
    previo = descifrar(json.load(open(publicado)), pwd) if pwd else None
except Exception:
    previo = None

if nuevo is None:
    # Sin datos nuevos: se vuelve a publicar lo que ya estaba (o el respaldo del repositorio).
    try: json.load(open(publicado)); src = publicado
    except Exception: src = respaldo
    open(salida, 'w').write(open(src).read())
    print('cambio=no')
    sys.exit(0)

# Si la contraseña cambió, la sal del respaldo ya no corresponde: se genera una nueva.
try: descifrar(base, pwd)
except Exception: salt = os.urandom(16); log('Contraseña distinta a la del respaldo: sal nueva')

json.dump(cifrar(nuevo, pwd, salt), open(salida, 'w'), separators=(',', ':'))
print('cambio=' + ('no' if previo == nuevo else 'si'))
