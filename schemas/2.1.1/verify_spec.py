#!/usr/bin/env python3
"""Verify a vendored gocpi OCPI spec tree against codegen's hard constraints.

Usage:
  python3 verify_spec.py [--structural] schemas/2.1.1

Modes:
  --structural  per-task gate (passes on a PARTIAL tree): runs all shape/convention/dup-type
                checks but SKIPS global $ref-resolution and the operation-inventory check, because
                OCPI types reference each other cyclically (a module authored early legitimately
                refs a type authored later).
  (default/FULL) requires the COMPLETE tree: structural checks PLUS every schema $ref resolves to
                exactly one definition PLUS the operation inventory matches EXPECTED_OPS exactly.

Checks (mirror internal/codegen assumptions + D3 transforms):
 - YAML parses; components.schemas type defs use no anyOf/oneOf/allOf
 - no schema named DateTime; no property $ref ending /DateTime
 - sender/receiver interface files only: operationId ^(sender|receiver); path first segment is a
   literal module; request bodies are a bare $ref; success-with-data responses are inline allOf
 - no type name defined twice across the tree (FULL: every referenced type also has a definition)
 - FULL: discovered {interface-file, METHOD, operationId} == EXPECTED_OPS
Exit non-zero on any violation.
"""
import sys, os, glob, re, yaml, collections

argv = sys.argv[1:]
structural = "--structural" in argv
argv = [a for a in argv if a != "--structural"]
root = argv[0] if argv else "schemas/2.1.1"
errors, warns = [], []

# Expected v211 operation inventory: (interface-file-relpath-suffix, METHOD, operationId).
# Keyed by the module/interface filename; the orchestrator keeps this in sync with RE_VENDORING.md.
EXPECTED_OPS = {
    ("locations/sender-interface.yaml", "GET", "senderGetLocations"),
    ("locations/sender-interface.yaml", "GET", "senderGetLocation"),
    ("locations/sender-interface.yaml", "GET", "senderGetEvse"),
    ("locations/sender-interface.yaml", "GET", "senderGetConnector"),
    ("locations/receiver-interface.yaml", "GET", "receiverGetLocation"),
    ("locations/receiver-interface.yaml", "PUT", "receiverPutLocation"),
    ("locations/receiver-interface.yaml", "PATCH", "receiverPatchLocation"),
    ("locations/receiver-interface.yaml", "GET", "receiverGetEvse"),
    ("locations/receiver-interface.yaml", "PUT", "receiverPutEvse"),
    ("locations/receiver-interface.yaml", "PATCH", "receiverPatchEvse"),
    ("locations/receiver-interface.yaml", "GET", "receiverGetConnector"),
    ("locations/receiver-interface.yaml", "PUT", "receiverPutConnector"),
    ("locations/receiver-interface.yaml", "PATCH", "receiverPatchConnector"),
    ("sessions/sender-interface.yaml", "GET", "senderGetSessions"),
    ("sessions/receiver-interface.yaml", "GET", "receiverGetSession"),
    ("sessions/receiver-interface.yaml", "PUT", "receiverPutSession"),
    ("sessions/receiver-interface.yaml", "PATCH", "receiverPatchSession"),
    ("cdrs/sender-interface.yaml", "GET", "senderGetCdrs"),
    ("cdrs/receiver-interface.yaml", "GET", "receiverGetCdr"),
    ("cdrs/receiver-interface.yaml", "POST", "receiverPostCdr"),
    ("tariffs/sender-interface.yaml", "GET", "senderGetTariffs"),
    ("tariffs/receiver-interface.yaml", "GET", "receiverGetTariff"),
    ("tariffs/receiver-interface.yaml", "PUT", "receiverPutTariff"),
    ("tariffs/receiver-interface.yaml", "DELETE", "receiverDeleteTariff"),
    ("tokens/sender-interface.yaml", "GET", "senderGetTokens"),
    ("tokens/sender-interface.yaml", "POST", "senderPostAuthorize"),
    ("tokens/receiver-interface.yaml", "GET", "receiverGetToken"),
    ("tokens/receiver-interface.yaml", "PUT", "receiverPutToken"),
    ("tokens/receiver-interface.yaml", "PATCH", "receiverPatchToken"),
    ("commands/sender-interface.yaml", "POST", "senderPostCommandResult"),
    ("commands/receiver-interface.yaml", "POST", "receiverPostReserveNow"),
    ("commands/receiver-interface.yaml", "POST", "receiverPostStartSession"),
    ("commands/receiver-interface.yaml", "POST", "receiverPostStopSession"),
    ("commands/receiver-interface.yaml", "POST", "receiverPostUnlockConnector"),
}
found_ops = set()

def err(m): errors.append(m)
def warn(m): warns.append(m)

def load(path):
    with open(path) as f:
        return yaml.safe_load(f)

# ---- collect schema definitions (type name -> [files]) ----
defs = collections.defaultdict(list)
refs = collections.Counter()
schema_files = sorted(glob.glob(os.path.join(root, "**", "*.yaml"), recursive=True))
if not schema_files:
    print(f"no yaml under {root}"); sys.exit(2)

def walk_refs(node):
    if isinstance(node, dict):
        for k, v in node.items():
            if k == "$ref" and isinstance(v, str):
                name = v.split("/")[-1]
                # a SCHEMA ref points into /components/schemas/ (not headers/parameters/
                # responses/securitySchemes, which live under other component buckets).
                if "/schemas/" in v:
                    refs[name] += 1
            else:
                walk_refs(v)
    elif isinstance(node, list):
        for x in node: walk_refs(x)

# D3.10 exact-length identity fields (codegen emits len= only when minLength==maxLength).
IDENTITY_LEN = {"country_code": 2, "party_id": 3}

def check_type_def(name, sch, f):
    if not isinstance(sch, dict): return
    for kw in ("anyOf", "oneOf", "allOf"):
        if kw in sch:
            err(f"[{f}] type {name} uses {kw} in a type definition (codegen can't decode it)")
    props = sch.get("properties") or {}
    for pn, pv in props.items():
        if isinstance(pv, dict):
            r = pv.get("$ref", "")
            if r.endswith("/DateTime"):
                err(f"[{f}] {name}.{pn} is a $ref to DateTime (should be inline string/date-time)")
            items = pv.get("items")
            if isinstance(items, dict) and items.get("$ref", "").endswith("/DateTime"):
                err(f"[{f}] {name}.{pn}.items is a $ref to DateTime")
            # D3.10: inline country_code/party_id must be exact length (min==max).
            if pn in IDENTITY_LEN and "$ref" not in pv and pv.get("type") == "string":
                want = IDENTITY_LEN[pn]
                if pv.get("minLength") != want or pv.get("maxLength") != want:
                    err(f"[{f}] {name}.{pn} must have minLength=maxLength={want} (D3.10 exact-length), "
                        f"got min={pv.get('minLength')} max={pv.get('maxLength')}")

for f in schema_files:
    try:
        doc = load(f)
    except Exception as e:
        err(f"[{f}] YAML parse error: {e}"); continue
    if not isinstance(doc, dict): continue
    walk_refs(doc)
    schemas = (((doc.get("components") or {}).get("schemas")) or {})
    for name, sch in schemas.items():
        defs[name].append(f)
        if name == "DateTime":
            err(f"[{f}] schema named DateTime defined (should be inlined, no type)")
        check_type_def(name, sch, f)

    # ---- interface checks: ONLY sender/receiver interface files are processed by
    # codegen's parseInterface (config-module `interface.yaml` files are handled by handshake). ----
    base = os.path.basename(f)
    if base not in ("sender-interface.yaml", "receiver-interface.yaml"):
        continue
    paths = doc.get("paths") or {}
    for p, methods in paths.items():
        segs = [s for s in p.strip("/").split("/")]
        if segs and segs[0].startswith("{"):
            err(f"[{f}] path {p} first segment is a param, not a module prefix (stripModulePrefix would drop a real param)")
        if not isinstance(methods, dict): continue
        for m, op in methods.items():
            if m not in ("get","put","post","patch","delete") or not isinstance(op, dict): continue
            oid = op.get("operationId", "")
            if not re.match(r"^(sender|receiver)", oid):
                err(f"[{f}] {m.upper()} {p} operationId '{oid}' not prefixed sender/receiver")
            relsuffix = f.split("/modules/")[-1]  # e.g. locations/sender-interface.yaml
            found_ops.add((relsuffix, m.upper(), oid))
            # request body must be bare $ref
            rb = op.get("requestBody")
            if isinstance(rb, dict):
                sch = (((rb.get("content") or {}).get("application/json")) or {}).get("schema")
                if isinstance(sch, dict) and "$ref" not in sch:
                    err(f"[{f}] {m.upper()} {p} requestBody schema is not a bare $ref")
            # success-with-data response must be inline allOf at 200/201
            for code in ("200","201"):
                r = (op.get("responses") or {}).get(code)
                if not isinstance(r, dict): continue
                if "$ref" in r:  # response component = no data ack -> fine
                    continue
                sch = (((r.get("content") or {}).get("application/json")) or {}).get("schema")
                if isinstance(sch, dict) and "$ref" in sch:
                    # codegen treats a content-schema $ref as NO typed data (only inline allOf is
                    # detected). Fine for create/ack endpoints; warn in case data was intended.
                    warn(f"[{f}] {m.upper()} {p} {code} response is a content $ref (no typed data extracted; OK if ack)")

# ---- dedup (always) ----
SKIP = {"OCPIResponse","StatusCode"}  # core-handled
for name, files in sorted(defs.items()):
    if len(files) > 1:
        err(f"type '{name}' defined in {len(files)} files: {files} (codegen has no dedup)")

# ---- ref-resolution + operation-inventory (FULL mode only — needs the COMPLETE tree) ----
if structural:
    print("== mode: --structural (skipping global $ref-resolution and operation-inventory) ==")
else:
    for name, cnt in sorted(refs.items()):
        if name in SKIP: continue
        if name not in defs:
            err(f"$ref to '{name}' ({cnt}x) has no schema definition in the tree")
    missing = EXPECTED_OPS - found_ops
    unexpected = found_ops - EXPECTED_OPS
    for op in sorted(missing):
        err(f"operation-inventory: MISSING expected operation {op}")
    for op in sorted(unexpected):
        err(f"operation-inventory: UNEXPECTED operation {op} (not in EXPECTED_OPS)")

print(f"== verify {root}: {len(schema_files)} files, {len(defs)} types, {sum(refs.values())} schema-refs, {len(found_ops)} ops ==")
for w in warns: print("WARN ", w)
for e in errors: print("ERROR", e)
print(f"== {len(errors)} error(s), {len(warns)} warning(s) ==")
sys.exit(1 if errors else 0)
