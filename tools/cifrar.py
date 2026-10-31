#!/usr/bin/env python3
"""Cifra los datos de la Torre de Control (AES-256-GCM, clave PBKDF2-SHA256).

Uso: TC_PASS='contraseña' TC_SALT='sal-en-base64' python3 cifrar.py datos.json salida.enc.json
datos.json = {"lastUpdate": "...", "data": [...], "cafe": [...], "llantas": [...], "azucar": [...], "cond": {...}}
Mantener la misma TC_SALT evita que los teléfonos tengan que volver a escribir la contraseña.
Si se cambia la contraseña, usar una sal nueva (base64 de 16 bytes aleatorios).
"""
import base64, json, os, sys
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

ITER = 600000

def validar(p):
    for k in ('data', 'cafe', 'llantas', 'azucar'):
        assert isinstance(p.get(k), list), f'falta lista {k}'
        for r in p[k]:
            for f in ('placa', 'ruta', 'prog', 'estado', 'detalle', 'cat'):
                assert isinstance(r.get(f), str), f'{k}: fila sin {f}: {r}'
            assert r['cat'] in ('ruta', 'activo', 'espera', 'pendiente'), f'cat inválida: {r}'
            if k == 'data':
                assert r.get('op') in ('Descargue', 'Cargue'), f'op inválida: {r}'
    assert isinstance(p.get('cond'), dict) and isinstance(p.get('lastUpdate'), str)

def cifrar(payload, pwd, salt):
    key = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=ITER).derive(pwd.encode())
    iv = os.urandom(12)
    ct = AESGCM(key).encrypt(iv, json.dumps(payload, ensure_ascii=False).encode(), None)
    b = lambda x: base64.b64encode(x).decode()
    return {'v': 1, 'kdf': 'PBKDF2-SHA256', 'iter': ITER, 'salt': b(salt), 'iv': b(iv), 'ct': b(ct)}

def descifrar(enc, pwd):
    key = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=base64.b64decode(enc['salt']), iterations=enc['iter']).derive(pwd.encode())
    return json.loads(AESGCM(key).decrypt(base64.b64decode(enc['iv']), base64.b64decode(enc['ct']), None))

if __name__ == '__main__':
    p = json.load(open(sys.argv[1], encoding='utf8')); validar(p)
    enc = cifrar(p, os.environ['TC_PASS'], base64.b64decode(os.environ['TC_SALT']))
    assert descifrar(enc, os.environ['TC_PASS']) == p
    json.dump(enc, open(sys.argv[2], 'w'), separators=(',', ':'))
    print('OK', p['lastUpdate'], '| filas', len(p['data']), len(p['cafe']), len(p['llantas']), len(p['azucar']), '| conductores', len(p['cond']), '| bytes', os.path.getsize(sys.argv[2]))
