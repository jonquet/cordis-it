#!/usr/bin/env python3
"""
prepare_data.py
===============
Downloads CORDIS data (Horizon Europe + H2020 + FP7), filters projects
involving INRAE and/or IT (INRAE Transfert), and generates
data/inrae_projects.json for the webapp.

Usage:
    cd ~/codium/cordis-inrae
    python3 scripts/prepare_data.py

Option:
    --no-download   Use cached ZIPs in data/cache/ (skip re-download)
"""

import argparse, io, json, os, sys, zipfile
from datetime import date as dt_date
from urllib.request import urlopen, Request
from urllib.error import URLError

# ─────────────────────────────────────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────────────────────────────────────

BASE_DIR  = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
DATA_DIR  = os.path.join(BASE_DIR, "data")
CACHE_DIR = os.path.join(DATA_DIR, "cache")
OUTPUT    = os.path.join(DATA_DIR, "inrae_projects.json")
OVERRIDES = os.path.join(DATA_DIR, "status_overrides.json")

SOURCES = [
    {
        "prog":  "HORIZON",
        "url":   "https://cordis.europa.eu/data/cordis-HORIZONprojects-json.zip",
        "cache": os.path.join(CACHE_DIR, "horizon.zip"),
    },
    {
        "prog":  "H2020",
        "url":   "https://cordis.europa.eu/data/cordis-h2020projects-json.zip",
        "cache": os.path.join(CACHE_DIR, "h2020.zip"),
    },
    {
        "prog":  "FP7",
        "url":   "https://cordis.europa.eu/data/cordis-fp7projects-json.zip",
        "cache": os.path.join(CACHE_DIR, "fp7.zip"),
    },
]

# ── Entity detection ──────────────────────────────────────────────────────────
# INRAE was created Jan 2020 (merger of INRA + IRSTEA)
INRAE_STRINGS    = [
    "INSTITUT NATIONAL DE RECHERCHE POUR L'AGRICULTURE",  # INRAE full name
    "INSTITUT NATIONAL DE LA RECHERCHE AGRONOMIQUE",      # INRA (H2020 era)
]
INRAE_SHORTNAMES = {"INRAE", "INRA"}

IT_STRINGS = [
    "INRAE TRANSFERT",   # current name
    "INRA TRANSFERT",    # historical H2020 name
]

ROLE_PRIORITY = {
    "coordinator": 0, "participant": 1,
    "associatedPartner": 2, "partner": 2,  # partner = associatedPartner alias
    "thirdParty": 3
}

# ── Role normalisation ────────────────────────────────────────────────────────
def norm_role(role):
    """Normalise role values: 'partner' → 'associatedPartner'."""
    if (role or "").lower() == "partner":
        return "associatedPartner"
    return role or ""


# ─────────────────────────────────────────────────────────────────────────────
# UTILS
# ─────────────────────────────────────────────────────────────────────────────

def log(msg): print(msg, flush=True)

def sf(val):
    if val is None: return 0.0
    try: return float(str(val).replace(",", ".").strip())
    except: return 0.0

def ss(val, maxlen=None):
    s = "" if val is None else str(val).strip()
    return s[:maxlen] if maxlen else s

def get(row, *keys, default=""):
    for k in keys:
        if k in row and row[k] is not None:
            return row[k]
    return default

def detect_entity(name, short):
    """Returns 'INRAE', 'IT', or None."""
    n = (name  or "").upper()
    s = (short or "").upper()
    # IT first (more specific — avoids "INRAE TRANSFERT" matching INRAE)
    if any(k in n for k in IT_STRINGS) or any(k in s for k in IT_STRINGS):
        return "IT"
    if any(k in n for k in INRAE_STRINGS) or s in INRAE_SHORTNAMES:
        return "INRAE"
    return None

def best_role(existing, new_role, new_ec):
    r = norm_role(new_role)
    if existing is None:
        return {"role": r, "ec": new_ec}
    if ROLE_PRIORITY.get(r, 9) < ROLE_PRIORITY.get(existing["role"], 9):
        return {"role": r, "ec": new_ec}
    return existing


# ─────────────────────────────────────────────────────────────────────────────
# DOWNLOAD — smart: only re-download if CORDIS has published a newer dataset
# ─────────────────────────────────────────────────────────────────────────────

def get_zip_dataset_date(zip_bytes):
    """Extract the most recent contentUpdateDate from project.json inside the ZIP."""
    import io as _io
    try:
        with zipfile.ZipFile(_io.BytesIO(zip_bytes)) as zf:
            names = [n for n in zf.namelist() if n.endswith('project.json')
                     and 'organization' not in n.lower()]
            if not names: return None
            with zf.open(names[0]) as f:
                projects = json.load(f)
            dates = [p.get('contentUpdateDate','') for p in projects
                     if p.get('contentUpdateDate')]
            return max(dates) if dates else None
    except Exception:
        return None

def load_zip(source, no_download):
    cache = source["cache"]

    if no_download and os.path.exists(cache):
        log(f"  Cache: {cache}")
        with open(cache, "rb") as f: return f.read()

    # Download fresh copy
    log(f"  Downloading: {source['url']}")
    try:
        req = Request(source["url"], headers={"User-Agent": "Mozilla/5.0"})
        with urlopen(req, timeout=180) as r:
            new_data = r.read()
    except URLError as e:
        log(f"  ✗ Network error: {e}")
        if os.path.exists(cache):
            log(f"  Using existing cache as fallback.")
            with open(cache, "rb") as f: return f.read()
        sys.exit(1)

    # Compare dataset date with cached version
    if os.path.exists(cache):
        with open(cache, "rb") as f:
            old_data = f.read()
        old_date = get_zip_dataset_date(old_data)
        new_date = get_zip_dataset_date(new_data)
        log(f"  Dataset date — cached: {old_date or 'unknown'}  |  new: {new_date or 'unknown'}")
        if old_date and new_date and old_date == new_date:
            log(f"  ✓ Dataset unchanged — keeping cache, skipping regeneration.")
            return None  # Signal: no update needed for this source

    os.makedirs(os.path.dirname(cache), exist_ok=True)
    with open(cache, "wb") as f: f.write(new_data)
    log(f"  ✓ {len(new_data)/1024/1024:.1f} MB — new dataset saved.")
    return new_data


# ─────────────────────────────────────────────────────────────────────────────
# JSON PARSING
# ─────────────────────────────────────────────────────────────────────────────

def read_json(zf, filename):
    with zf.open(filename) as f:
        raw = json.load(f)
    if isinstance(raw, list): return raw
    for key in ("results", "projects", "organizations", "data", "items"):
        if key in raw and isinstance(raw[key], list): return raw[key]
    for v in raw.values():
        if isinstance(v, list) and len(v) > 0: return v
    raise ValueError(f"Unexpected JSON structure in {filename}: keys={list(raw.keys())}")

def find_file(names, *keywords, exclude=None):
    """Find first .json file whose name contains all keywords (case-insensitive)."""
    for name in names:
        nl = name.lower()
        if not nl.endswith(".json"): continue
        if exclude and any(e in nl for e in exclude): continue
        if all(k in nl for k in keywords): return name
    return None


# ─────────────────────────────────────────────────────────────────────────────
# PROCESS ONE PROGRAMME
# ─────────────────────────────────────────────────────────────────────────────

def process(zip_bytes, prog):
    log(f"\n{'─'*52}")
    log(f"  Programme: {prog}")

    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        names = zf.namelist()
        log(f"  ZIP contents: {names}")

        proj_file = find_file(names, "project", exclude=["organization","organisation","euroscivoc","topic","web","legal","policy","information"])
        org_file  = find_file(names, "organization") or find_file(names, "organisation")
        scivoc_file = find_file(names, "euroscivoc") or find_file(names, "scivoc")

        if not proj_file or not org_file:
            log(f"  ✗ Missing project or organization file")
            return []

        log(f"  Reading organizations ({org_file})...")
        orgs_raw = read_json(zf, org_file)
        log(f"  → {len(orgs_raw):,} rows")

        log(f"  Reading projects ({proj_file})...")
        projs_raw = read_json(zf, proj_file)
        log(f"  → {len(projs_raw):,} projects")

        # EuroSciVoc — one entry per project+discipline
        scivoc_by_project = {}
        if scivoc_file:
            log(f"  Reading EuroSciVoc ({scivoc_file})...")
            scivoc_raw = read_json(zf, scivoc_file)
            log(f"  → {len(scivoc_raw):,} entries")
            for row in scivoc_raw:
                pid = ss(get(row, "projectID", "project_id"))
                if not pid: continue
                title = ss(get(row, "euroSciVocTitle", "title", "label"))
                path  = ss(get(row, "euroSciVocPath",  "path",  "code"))
                if not title: continue
                if pid not in scivoc_by_project:
                    scivoc_by_project[pid] = []
                # Avoid duplicates
                entry = {"title": title, "path": path}
                if entry not in scivoc_by_project[pid]:
                    scivoc_by_project[pid].append(entry)
        else:
            log(f"  ⚠ No EuroSciVoc file found")

    # ── Pass 1: scan organisations ────────────────────────────────────────────
    ids_inrae = set()
    ids_it    = set()
    inrae_map = {}
    it_map    = {}
    orgs_map  = {}

    for row in orgs_raw:
        pid   = ss(get(row, "projectID", "project_id", "projectId"))
        name  = ss(get(row, "name"))
        short = ss(get(row, "shortName", "short_name", "shortname"))
        role  = norm_role(ss(get(row, "role")))
        ec    = sf(get(row, "ecContribution", "ec_contribution", "eccontribution", default=0))
        if not pid: continue

        if pid not in orgs_map: orgs_map[pid] = []
        orgs_map[pid].append({
            "name":           ss(get(row, "name")),
            "shortName":      ss(get(row, "shortName", "short_name")),
            "country":        ss(get(row, "country")),
            "activityType":   ss(get(row, "activityType", "activity_type")),
            "role":           role,
            "ecContribution": ec,
            "city":           ss(get(row, "city")),
            "pic":            ss(get(row, "organisationID", "organizationID", "organisation_id", "organization_id")),
        })

        entity = detect_entity(name, short)
        if entity == "INRAE":
            ids_inrae.add(pid)
            inrae_map[pid] = best_role(inrae_map.get(pid), role, ec)
        elif entity == "IT":
            ids_it.add(pid)
            it_map[pid] = best_role(it_map.get(pid), role, ec)

    all_ids = ids_inrae | ids_it
    log(f"  → INRAE: {len(ids_inrae)} | IT: {len(ids_it)} | Total: {len(all_ids)}")

    # ── Pass 2: build project records ─────────────────────────────────────────
    projects = []
    for row in projs_raw:
        pid = ss(get(row, "id", "projectID", "project_id"))
        if pid not in all_ids: continue

        partners  = orgs_map.get(pid, [])
        countries = sorted({
            p["country"] for p in partners
            if p["country"] and p["country"] not in ("", "nan")
        })
        inrae_p = inrae_map.get(pid)
        it_p    = it_map.get(pid)

        # EuroSciVoc entries for this project
        scivoc = scivoc_by_project.get(pid, [])
        # Extract domain hierarchy from EuroSciVoc path
        # Path format: '/natural sciences/biological sciences/ecology/...'
        # Level 0 (after leading slash) = top domain
        # Level 1 = sub-domain
        # We store top-level domain AND sub-domain for richer filtering
        domains_set = set()
        domains_l2_set = set()
        for sv in scivoc:
            path = sv.get("path","")
            if not path: continue
            parts = [p.strip() for p in path.strip("/").split("/") if p.strip()]
            if len(parts) >= 1:
                domains_set.add(parts[0])      # top-level: 'natural sciences'
            if len(parts) >= 2:
                domains_l2_set.add(parts[1])   # sub-domain: 'biological sciences'
        domains   = sorted(domains_set)
        domains_l2 = sorted(domains_l2_set)

        # Normalise funding scheme for display
        scheme = ss(get(row, "fundingScheme", "funding_scheme"))
        # Strip "HORIZON-" prefix for cleaner display (H2020/HE)
        scheme_short = scheme.replace("HORIZON-TMA-","").replace("HORIZON-","")
        # Map FP7 funding schemes to H2020-equivalent categories
        # CP-* (Collaborative Projects) → RIA ; CP-CSA-Infra → INFRA ; CSA-* → CSA
        _fp7_map = {
            "CP-TP":        "RIA",
            "CP-IP":        "RIA",
            "CP-FP":        "RIA",
            "CP":           "RIA",
            "CP-IP-SICA":   "RIA",
            "CP-CSA-Infra": "INFRA",
            "CSA-CA":       "CSA",
            "CSA-SA":       "CSA",
        }
        if prog == "FP7" and scheme in _fp7_map:
            scheme_short = _fp7_map[scheme]

        projects.append({
            "id":                  pid,
            "programme":           prog,
            "acronym":             ss(get(row, "acronym")),
            "title":               ss(get(row, "title")),
            "status":              ss(get(row, "status")),
            "startDate":           ss(get(row, "startDate",  "start_date")),
            "endDate":             ss(get(row, "endDate",    "end_date")),
            "totalCost":           sf(get(row, "totalCost",         "total_cost",          default=0)),
            "ecMaxContribution":   sf(get(row, "ecMaxContribution", "ec_max_contribution", default=0)),
            "legalBasis":          ss(get(row, "legalBasis",  "legal_basis")),
            "topics":              ss(get(row, "topics")),
            "frameworkProgramme":  ss(get(row, "frameworkProgramme", "framework_programme", default=prog)),
            "fundingScheme":       scheme,
            "fundingSchemeShort":  scheme_short,
            "objective":           ss(get(row, "objective")),   # full text, no truncation
            "keywords":            ss(get(row, "keywords")),
            "contentUpdateDate":   ss(get(row, "contentUpdateDate", "content_update_date")),
            "cordisUrl":           f"https://cordis.europa.eu/project/id/{pid}",
            # ── INRAE ──────────────────────────────────────────────────────────
            "hasINRAE":            pid in ids_inrae,
            "inraeRole":           inrae_p["role"] if inrae_p else "",
            "inraeEcContribution": inrae_p["ec"]   if inrae_p else 0.0,
            # ── IT ─────────────────────────────────────────────────────────────
            "hasIT":               pid in ids_it,
            "itRole":              it_p["role"] if it_p else "",
            "itEcContribution":    it_p["ec"]   if it_p else 0.0,
            # ── Partners ───────────────────────────────────────────────────────
            "partnerCountries": countries,
            "partnerCount":     len(partners),
            "partners":         partners,
            # ── EuroSciVoc ─────────────────────────────────────────────────────
            "euroSciVoc":       scivoc,     # full list [{title, path}, ...]
            "domains":          domains,    # top-level: ['natural sciences', ...]
            "domains_l2":       domains_l2, # sub-domain: ['biological sciences', ...]
        })

    log(f"  → {len(projects)} projects retained")
    return projects


# ─────────────────────────────────────────────────────────────────────────────
# STATUS OVERRIDE — verify SIGNED projects past their endDate against CORDIS
# ─────────────────────────────────────────────────────────────────────────────

def check_cordis_status(project_id):
    """Fetch CORDIS project page and return detected status or None."""
    url = f"https://cordis.europa.eu/project/id/{project_id}"
    try:
        req = Request(url, headers={"User-Agent": "Mozilla/5.0"})
        html = urlopen(req, timeout=30).read().decode("utf-8", errors="ignore")
        if "Project closed" in html or "project closed" in html:
            return "CLOSED"
        if "Project terminated" in html or "project terminated" in html:
            return "TERMINATED"
        if "Project open" in html or "project open" in html:
            return "SIGNED"
        return None  # Could not determine
    except Exception as e:
        log(f"    ⚠ Could not fetch CORDIS page for {project_id}: {e}")
        return None

def load_overrides():
    """Load status_overrides.json, return dict {id: status}."""
    if os.path.exists(OVERRIDES):
        with open(OVERRIDES, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}

def save_overrides(overrides):
    """Save status_overrides.json."""
    with open(OVERRIDES, "w", encoding="utf-8") as f:
        json.dump(overrides, f, ensure_ascii=False, indent=2)

def apply_overrides(all_projects, overrides):
    """Apply stored overrides to project list."""
    for p in all_projects:
        if p["id"] in overrides:
            p["status"] = overrides[p["id"]]

def check_and_update_overrides(all_projects, overrides):
    """
    For each IT project with status=SIGNED and endDate in the past,
    verify current status on CORDIS. Update overrides if different.
    Returns True if any override was added or changed.
    """
    today = str(dt_date.today())
    suspects = [
        p for p in all_projects
        if p.get("hasIT") and p.get("status") == "SIGNED"
        and p.get("endDate", "") < today
    ]
    if not suspects:
        return False

    log(f"\n── Checking {len(suspects)} IT project(s) past endDate still SIGNED ──")
    changed = False
    for p in suspects:
        pid = p["id"]
        log(f"  {p.get('acronym', pid):20} endDate={p['endDate']} → checking CORDIS...")
        live_status = check_cordis_status(pid)
        if live_status and live_status != "SIGNED":
            log(f"    ✓ Status updated: SIGNED → {live_status}")
            overrides[pid] = live_status
            p["status"] = live_status
            changed = True
        elif live_status == "SIGNED":
            log(f"    · Still SIGNED on CORDIS — no change")
        else:
            log(f"    · Status undetermined — skipping")
    return changed


# ─────────────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-download", action="store_true",
                        help="Use local cache in data/cache/")
    args = parser.parse_args()

    os.makedirs(DATA_DIR,  exist_ok=True)
    os.makedirs(CACHE_DIR, exist_ok=True)

    all_projects = []
    seen_ids = {}
    any_updated = False

    for source in SOURCES:
        zip_bytes = load_zip(source, args.no_download)
        if zip_bytes is None:
            # Dataset unchanged — load from cache to still build full JSON
            log(f"  Loading from cache for merge: {source['cache']}")
            with open(source["cache"], "rb") as f:
                zip_bytes = f.read()
        else:
            any_updated = True
        projects = process(zip_bytes, source["prog"])
        for p in projects:
            key = p["id"]
            if key in seen_ids:
                log(f"  ⚠ Duplicate id={key} ({seen_ids[key]} vs {p['programme']}) — skipped")
            else:
                seen_ids[key] = p["programme"]
                all_projects.append(p)

    if not any_updated and os.path.exists(OUTPUT):
        log(f"\n✅ All datasets unchanged — JSON is already up to date, no commit needed.")
        sys.exit(0)

    all_projects.sort(key=lambda p: p.get("startDate", ""), reverse=True)

    # ── Status overrides ──────────────────────────────────────────────────────
    overrides = load_overrides()

    # Apply existing overrides first (in case ZIP still has stale status)
    if overrides:
        apply_overrides(all_projects, overrides)
        log(f"\n  Applied {len(overrides)} existing status override(s).")

    # Check CORDIS live for IT projects past endDate still SIGNED
    overrides_changed = check_and_update_overrides(all_projects, overrides)
    if overrides_changed:
        save_overrides(overrides)
        log(f"  status_overrides.json updated ({len(overrides)} override(s) total).")

    # ── Summary ───────────────────────────────────────────────────────────────
    log(f"\n{'='*52}")
    log(f"SUMMARY")
    log(f"{'='*52}")
    log(f"Total              : {len(all_projects)}")
    log(f"  Horizon Europe   : {sum(1 for p in all_projects if p['programme']=='HORIZON')}")
    log(f"  H2020            : {sum(1 for p in all_projects if p['programme']=='H2020')}")
    log(f"  FP7              : {sum(1 for p in all_projects if p['programme']=='FP7')}")
    log(f"  ──────────────────────")
    log(f"  IT only          : {sum(1 for p in all_projects if p['hasIT'] and not p['hasINRAE'])}  (hasIT && !hasINRAE)")
    log(f"  INRAE only       : {sum(1 for p in all_projects if p['hasINRAE'] and not p['hasIT'])}  (hasINRAE && !hasIT)")
    log(f"  IT + INRAE       : {sum(1 for p in all_projects if p['hasIT'] and p['hasINRAE'])}  (hasIT && hasINRAE)")
    log(f"  ──────────────────────")
    log(f"  With IT          : {sum(1 for p in all_projects if p['hasIT'])}  (hasIT)")
    log(f"  With INRAE       : {sum(1 for p in all_projects if p['hasINRAE'])}  (hasINRAE)")
    log(f"  INRAE coord.     : {sum(1 for p in all_projects if p['inraeRole']=='coordinator')}")
    log(f"  With EuroSciVoc  : {sum(1 for p in all_projects if p['euroSciVoc'])}")
    budget_total = sum(p["ecMaxContribution"] for p in all_projects) / 1e6
    budget_it    = sum(p["itEcContribution"]    for p in all_projects if p['hasIT'])    / 1e6
    budget_inrae = sum(p["inraeEcContribution"] for p in all_projects if p['hasINRAE']) / 1e6
    log(f"  Total IT + INRAE budget       : {budget_total:.0f} M€")
    log(f"  Total IT EU contribution      : {budget_it:.1f} M€")
    log(f"  Total INRAE EU contribution   : {budget_inrae:.1f} M€")
    ctries = len({c for p in all_projects for c in p["partnerCountries"]})
    log(f"  Partner countries: {ctries}")

    # ── Export ────────────────────────────────────────────────────────────────
    from datetime import datetime, timezone

    # Most recent contentUpdateDate across all projects = real CORDIS data date
    all_dates = [p.get("contentUpdateDate","") for p in all_projects if p.get("contentUpdateDate")]
    cordis_data_date = max(all_dates)[:10] if all_dates else ""  # keep YYYY-MM-DD only

    output = {
        "generatedAt":    datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "cordisDataDate": cordis_data_date,   # date of most recent CORDIS record
        "projects":       all_projects
    }
    log(f"  CORDIS data date : {cordis_data_date}")
    with open(OUTPUT, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    size_mb = os.path.getsize(OUTPUT) / 1024 / 1024
    log(f"\n✅  {OUTPUT}  ({size_mb:.1f} MB)")
    log(f"\nNext step:")
    log(f"  cd ~/codium/cordis-it && python3 -m http.server 8080")


if __name__ == "__main__":
    main()
