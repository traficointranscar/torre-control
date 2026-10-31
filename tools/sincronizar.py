#!/usr/bin/env python3
"""Usado por GitHub Actions: descarga los datos (JSON plano) desde el link de OneDrive, los valida,
los cifra y deja el archivo cifrado listo para publicar. Imprime cambio=si/no para el flujo.

python3 sincronizar.py <url_onedrive> <respaldo.enc.json> <publicado.enc.json> <salida.enc.json>
"""
import base64, http.cookiejar, json, os, re, sys, urllib.parse, urllib.request
sys.path.insert(0, os.path.dirname(__file__))
from cifrar import cifrar, descifrar, validar

url, respaldo, publicado, salida = sys.argv[1:5]
pwd = os.environ.get('TC_PASS', '')
base = json.load(open(respaldo))
salt = base64.b64decode(base['salt'])

def log(m): print(m, file=sys.stderr)

def candidatos(u):
    """Formas de descarga directa de un vínculo de OneDrive/SharePoint."""
    u = u.strip()
    out = [u + ('&' if '?' in u else '?') + 'download=1']
    m = re.match(r'(https://[^/]+)/:\w:/[gr]/(personal/[^/]+)/([^/?#]+)', u)
    if m:
        out.append('%s/%s/_layouts/15/download.aspx?share=%s' % m.groups())
    return out

def descargar(u):
    # SharePoint deja una cookie al abrir el vínculo y la exige en la redirección: se guarda con un cookie jar.
    op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    op.addheaders = [('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)')]
    r = op.open(u, timeout=60)
    return r.geturl(), r.read().decode('utf-8-sig', 'replace')

def leer(u):
    ultimo = ''
    for c in candidatos(u):
        try:
            final, raw = descargar(c)
        except Exception as e:
            ultimo = 'error de red: %s' % e; continue
        try:
            d = json.loads(raw); validar(d); return d
        except AssertionError as e:
            raise ValueError('el archivo no tiene el formato esperado: %s' % e)
        except ValueError:
            host = urllib.parse.urlparse(final).netloc
            titulo = (re.search(r'<title>(.*?)</title>', raw, re.S | re.I) or [None, ''])[1].strip()[:80]
            if 'login' in host or 'microsoftonline' in host or 'sign in' in titulo.lower() or 'iniciar' in titulo.lower():
                ultimo = 'OneDrive pide iniciar sesion: el vinculo NO esta compartido con "Cualquier persona" (o la empresa lo bloquea).'
            else:
                ultimo = 'OneDrive devolvio una pagina web en vez del archivo (host %s, titulo "%s").' % (host, titulo)
    raise ValueError(ultimo)

nuevo = None
if url and pwd:
    try:
        nuevo = leer(url)
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
