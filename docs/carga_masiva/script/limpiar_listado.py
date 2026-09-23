"""
Limpieza del listado de aprobación de Short Kaizen — versión 2
(nuevo layout del Excel, sin columna TIPO, con 3 columnas de Aprobación).

Roles reales en el catálogo (columna "Posición"): integrante, líder, gerente.
El puesto "aprobador" ya NO existe en el listado (se retiró del negocio).

Columnas del Excel de origen (fila 2 = encabezado, datos desde fila 3):
    No. | Nombre | Departamento | Equipo Lean | Posición |
    Aprobación 1 | Aprobación 2 | Aprobación 3

- "Aprobación 1" = contacto de Mejora Continua. HOY ESTÁ VACÍA EN TODO EL
  ARCHIVO (326/326 filas) — el correo de Mejora Continua todavía no existe,
  Javier lo va a validar directamente con Jesús. No se debe inventar ni
  inferir un valor para esta columna.
- "Aprobación 2"/"Aprobación 3" = cadena de aprobación PERSONAL de cada
  empleado (a quién le llega su propio Short Kaizen). Ojo: la cadena de un
  líder o de un gerente es la de ELLOS como solicitantes (a veces apunta a
  su propio jefe, no a sí mismos), así que NO sirve para inferir "quién es
  el líder del equipo" o "quién es el gerente del departamento" a partir de
  las filas marcadas como líder/gerente.

  Para saber quién es el líder/gerente que debe VER y APROBAR el equipo o
  departamento completo, se usa el voto de mayoría entre las filas
  "integrante": el líder de un equipo es el contacto que más se repite en
  "Aprobación 2" entre los integrantes de ese Equipo Lean, y el gerente de
  un departamento es el contacto que más se repite en "Aprobación 3" entre
  los integrantes/líderes de ese departamento.

Salidas:
    empleados_limpio.csv        — un renglón por empleado, con su cadena de
                                   aprobación (aprobacion2_*, aprobacion3_*)
                                   tal como viene en el Excel, sin inferir.
    equipos_limpio.csv          — un renglón por Equipo Lean (nombre,
                                   departamento, líder detectado por mayoría,
                                   conteo, y si hubo más de un candidato).
    departamentos_gerentes.csv  — un renglón por departamento con el gerente
                                   detectado por mayoría (y candidatos
                                   alternos si los hay).
    issues_a_revisar.csv        — observaciones para revisar con RH/Jesús.
"""
import openpyxl, csv, re
from collections import defaultdict, Counter

SRC = "/root/.claude/uploads/033b1042-a988-5398-8440-ff4cfdc78359/0c0c0dda-Listado_de_aprobaci_n_sk.xlsx"
OUT_DIR = "/home/claude/shortkaizen/datos_carga"

wb = openpyxl.load_workbook(SRC, data_only=True)
ws = wb["Hoja1"]
rows = list(ws.iter_rows(min_row=3, max_row=ws.max_row, values_only=True))


def norm(s):
    return re.sub(r"\s+", " ", str(s)).strip() if s is not None else ""


def parse_contacto(v):
    v = norm(v)
    if not v:
        return "", ""
    if ";" in v:
        nombre, correo = v.split(";", 1)
        return nombre.strip(), correo.strip()
    if "," in v:
        nombre, correo = v.split(",", 1)
        return nombre.strip(), correo.strip()
    m = re.search(r"[\w\.\-]+@[\w\.\-]+", v)
    correo = m.group(0) if m else ""
    nombre = v.replace(correo, "").strip(" ;,") if correo else v
    return nombre, correo


POSICION_NORM = {
    "líder": "lider", "lider": "lider",
    "integrante": "integrante",
    "gerente": "gerente", "gerente del área": "gerente",
}

empleados = []
issues = []
equipo_datos = defaultdict(lambda: {"departamento": "", "n_integrantes": 0, "candidatos_lider": Counter()})
depto_candidatos_gerente = defaultdict(Counter)
mc_no_vacio = 0

for i, r in enumerate(rows, start=3):
    _, nomina, nombre, depto, equipo, posicion, apr1, apr2, apr3 = r[:9]
    if nombre is None and nomina is None:
        continue

    nombre = norm(nombre)
    depto = norm(depto)
    equipo = norm(equipo)
    posicion_raw = norm(posicion)
    posicion = POSICION_NORM.get(posicion_raw.lower(), posicion_raw.lower() or "integrante")

    mc_nombre, mc_email = parse_contacto(apr1)
    apr2_nombre, apr2_email = parse_contacto(apr2)
    apr3_nombre, apr3_email = parse_contacto(apr3)

    row_issues = []
    if not nomina:
        row_issues.append("sin nómina")
    if not nombre:
        row_issues.append("sin nombre")
    if not depto:
        row_issues.append("sin departamento")
    if not equipo:
        row_issues.append("sin equipo lean")
    if mc_email:
        mc_no_vacio += 1
        row_issues.append("¡Aprobación 1 (Mejora Continua) SÍ trae un valor! antes venía vacía siempre — revisar con Jesús si ya se dió de alta ese correo")
    if not apr2_email:
        row_issues.append("sin correo en Aprobación 2")
    if not apr3_email:
        row_issues.append("sin correo en Aprobación 3")
    if posicion not in ("integrante", "lider", "gerente"):
        row_issues.append(f"posición no reconocida: '{posicion_raw}'")

    empleados.append({
        "fila_excel": i,
        "nomina": str(nomina) if nomina is not None else "",
        "nombre": nombre,
        "departamento": depto,
        "equipo": equipo,
        "posicion": posicion,
        "posicion_original": posicion_raw,
        "mc_nombre": mc_nombre,
        "mc_email": mc_email,
        "aprobacion2_nombre": apr2_nombre,
        "aprobacion2_email": apr2_email,
        "aprobacion3_nombre": apr3_nombre,
        "aprobacion3_email": apr3_email,
    })

    if row_issues:
        issues.append({"fila_excel": i, "nomina": nomina, "nombre": nombre, "problemas": "; ".join(row_issues)})

    if equipo:
        eq = equipo_datos[equipo]
        if depto and eq["departamento"] and eq["departamento"] != depto:
            issues.append({"fila_excel": i, "nomina": nomina, "nombre": nombre,
                            "problemas": f"el equipo '{equipo}' aparece con departamento distinto ('{depto}' vs '{eq['departamento']}')"})
        eq["departamento"] = eq["departamento"] or depto
        eq["n_integrantes"] += 1
        # Voto de mayoría: solo los "integrante" cuentan para inferir al líder
        # (la cadena del propio líder es la de él como solicitante, no sirve aquí).
        if posicion == "integrante" and apr2_email:
            eq["candidatos_lider"][(apr2_nombre, apr2_email.lower())] += 1

    # Voto de mayoría para el gerente del departamento: solo integrante/líder
    # (la cadena del propio gerente es la de él como solicitante, no sirve aquí).
    if posicion in ("integrante", "lider") and depto and apr3_email:
        depto_candidatos_gerente[depto][(apr3_nombre, apr3_email.lower())] += 1

nombres_por_minusculas = defaultdict(list)
for nombre_eq in equipo_datos:
    nombres_por_minusculas[nombre_eq.lower()].append(nombre_eq)
for variantes in nombres_por_minusculas.values():
    if len(variantes) > 1:
        issues.append({"fila_excel": "", "nomina": "", "nombre": f"[EQUIPO] {' / '.join(variantes)}",
                        "problemas": f"el mismo equipo está capturado con distinta mayúscula/minúscula ({', '.join(repr(v) for v in variantes)}) — revisar si es el mismo equipo duplicado por error de captura"})

with open(f"{OUT_DIR}/empleados_limpio.csv", "w", newline="", encoding="utf-8") as f:
    cols = ["nomina", "nombre", "departamento", "equipo", "posicion", "posicion_original",
            "mc_nombre", "mc_email", "aprobacion2_nombre", "aprobacion2_email",
            "aprobacion3_nombre", "aprobacion3_email"]
    w = csv.DictWriter(f, fieldnames=cols)
    w.writeheader()
    for e in empleados:
        w.writerow({k: e[k] for k in cols})

with open(f"{OUT_DIR}/equipos_limpio.csv", "w", newline="", encoding="utf-8") as f:
    cols = ["nombre", "departamento", "lider_nombre", "lider_email", "n_integrantes", "candidatos_alternos"]
    w = csv.DictWriter(f, fieldnames=cols)
    w.writeheader()
    for nombre, eq in sorted(equipo_datos.items()):
        candidatos = eq["candidatos_lider"].most_common()
        lider_nombre, lider_email = ("", "")
        alternos = ""
        if candidatos:
            (lider_nombre, lider_email), _ = candidatos[0]
            if len(candidatos) > 1:
                alternos = "; ".join(f"{n} <{c}> ({cnt})" for (n, c), cnt in candidatos[1:])
                issues.append({"fila_excel": "", "nomina": "", "nombre": f"[EQUIPO] {nombre}",
                                "problemas": f"más de un candidato a líder por voto de mayoría: {candidatos}"})
        w.writerow({
            "nombre": nombre, "departamento": eq["departamento"],
            "lider_nombre": lider_nombre, "lider_email": lider_email,
            "n_integrantes": eq["n_integrantes"], "candidatos_alternos": alternos,
        })

with open(f"{OUT_DIR}/departamentos_gerentes.csv", "w", newline="", encoding="utf-8") as f:
    cols = ["departamento", "gerente_nombre", "gerente_email", "votos", "candidatos_alternos"]
    w = csv.DictWriter(f, fieldnames=cols)
    w.writeheader()
    for depto in sorted(depto_candidatos_gerente):
        candidatos = depto_candidatos_gerente[depto].most_common()
        (gerente_nombre, gerente_email), votos = candidatos[0]
        alternos = ""
        if len(candidatos) > 1:
            alternos = "; ".join(f"{n} <{c}> ({cnt})" for (n, c), cnt in candidatos[1:])
            issues.append({"fila_excel": "", "nomina": "", "nombre": f"[DEPARTAMENTO] {depto}",
                            "problemas": f"más de un candidato a gerente por voto de mayoría: {candidatos} — confirmar con RH/Jesús cuál es el vigente"})
        w.writerow({"departamento": depto, "gerente_nombre": gerente_nombre, "gerente_email": gerente_email,
                    "votos": votos, "candidatos_alternos": alternos})

with open(f"{OUT_DIR}/issues_a_revisar.csv", "w", newline="", encoding="utf-8") as f:
    cols = ["fila_excel", "nomina", "nombre", "problemas"]
    w = csv.DictWriter(f, fieldnames=cols)
    w.writeheader()
    for it in issues:
        w.writerow(it)

print(f"Empleados procesados: {len(empleados)}")
print(f"Equipos detectados: {len(equipo_datos)}")
print(f"Departamentos con gerente detectado: {len(depto_candidatos_gerente)}")
print(f"Filas con Aprobación 1 (Mejora Continua) NO vacía: {mc_no_vacio}")
print(f"Filas/observaciones a revisar: {len(issues)}")
