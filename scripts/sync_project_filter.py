"""
Sync project_filter.json from a Google Sheet.

Reads project IDs from column A of the sheet (skipping the header row)
and writes them to data/project_filter.json.

Required env vars:
  GOOGLE_SERVICE_ACCOUNT_JSON  — contents of the service account key JSON
  SHEET_ID                     — Google Sheet ID
  SHEET_GID                    — Sheet tab GID (default: 475846146)
"""

import json
import os
import sys
from pathlib import Path

import gspread
from google.oauth2.service_account import Credentials

SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly']
SHEET_ID = os.environ['SHEET_ID']
SHEET_GID = int(os.environ.get('SHEET_GID', '475846146'))
OUTPUT = Path(__file__).parent.parent / 'data' / 'project_filter.json'


def main():
    sa_json = os.environ.get('GOOGLE_SERVICE_ACCOUNT_JSON')
    if not sa_json:
        print('ERROR: GOOGLE_SERVICE_ACCOUNT_JSON is not set', file=sys.stderr)
        sys.exit(1)

    creds = Credentials.from_service_account_info(json.loads(sa_json), scopes=SCOPES)
    gc = gspread.authorize(creds)

    spreadsheet = gc.open_by_key(SHEET_ID)
    worksheet = next(ws for ws in spreadsheet.worksheets() if ws.id == SHEET_GID)

    # Column A, skip header row (row 1) — keep only numeric IDs, deduplicate
    values = worksheet.col_values(1)[1:]
    seen = set()
    ids = []
    for v in values:
        v = v.strip()
        if v and v.isdigit() and v not in seen:
            seen.add(v)
            ids.append(v)

    OUTPUT.write_text(json.dumps(ids, indent=2) + '\n')
    print(f'Written {len(ids)} project IDs to {OUTPUT}')


if __name__ == '__main__':
    main()
