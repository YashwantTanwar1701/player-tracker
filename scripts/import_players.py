#!/usr/bin/env python3
"""
Hockey Player CSV -> Supabase Importer (ALL 27 COLUMNS)
Run: python import_players.py
"""
import math
import pandas as pd
from supabase import create_client, Client

SUPABASE_URL = "https://rkakzwdcqlsbyzcwudqk.supabase.co"
SUPABASE_KEY = "PASTE_YOUR_SECRET_KEY_HERE"
CSV_PATH     = r"C:\Users\MORNINGSTAR\Downloads\Hockey__1_.csv"
BATCH_SIZE   = 500

def safe_int(val):
    try:
        v = float(val)
        return int(v) if not math.isnan(v) else None
    except: return None

def safe_float(val):
    try:
        v = float(val)
        return None if math.isnan(v) else v
    except: return None

def safe_str(val):
    if val is None or (isinstance(val, float) and math.isnan(val)): return None
    s = str(val).strip()
    return s if s else None

def clean_row(row):
    return {
        "player_id": int(row["player_id"]),
        "full_name":  safe_str(row["full_name"]) or "Unknown",
        "birthday":   safe_str(row["birthday"]),
        "team_id":    safe_int(row["team_id"]),
        "national_team_id":   safe_int(row["national_team_id"]),
        "club_sweater_num":   safe_int(row["club_sweater_num"]),
        "player_nationality_1": safe_int(row["player_nationality_1"]),
        "player_nationality_2": safe_int(row["player_nationality_2"]),
        "player_posititon1":  safe_int(row["player_posititon1"]),
        "player_posititon2":  safe_int(row["player_posititon2"]),
        "player_posititon3":  safe_int(row["player_posititon3"]),
        "c_contract_status":  safe_int(row["c_contract_status"]),
        "player_preffered_hand": safe_int(row["player_preffered_hand"]),
        "player_gender":      safe_int(row["player_gender"]),
        "height":  safe_float(row["height"]),
        "weight":  safe_float(row["weight"]),
        "most_team_id":  safe_int(row["most_team_id"]),
        "team_ids":      safe_str(row["team_ids"]),
        "last_team_id":  safe_int(row["last_team_id"]),
        "last_team_name": safe_str(row["last_team_name"]),
        "skill_ids":     safe_str(row["skill_ids"]),
        "player_last_match_name": safe_str(row["player_last_match_name"]),
        "player_last_match_tournament_name": safe_str(row["player_last_match_tournament_name"]),
        "player_last_match_season_name":     safe_str(row["player_last_match_season_name"]),
        "player_last_match_tournament_country_name": safe_str(row["player_last_match_tournament_country_name"]),
        "club_team_top_competitions_2026_ids":   safe_str(row["club_team_top_competitions_2026_ids"]),
        "club_team_top_competitions_2026_names": safe_str(row["club_team_top_competitions_2026_names"]),
    }

def run(csv_path, client):
    print(f"Reading: {csv_path}")
    df = pd.read_csv(csv_path, low_memory=False)
    print(f"  Rows: {len(df):,}  Columns: {len(df.columns)}")

    records, errors = [], []
    for idx, row in df.iterrows():
        try:    records.append(clean_row(row))
        except Exception as e: errors.append((idx, str(e)))

    print(f"  Ready: {len(records):,} | Errors: {len(errors)}")

    done = 0
    for start in range(0, len(records), BATCH_SIZE):
        batch = records[start:start+BATCH_SIZE]
        try:
            client.table("players").upsert(batch, on_conflict="player_id").execute()
            done += len(batch)
            print(f"  [{done/len(records)*100:5.1f}%] {done:,} rows inserted")
        except Exception as e:
            print(f"  ERROR at {start}: {e}")

    print(f"\n✅ Done: {done:,} players imported.")
    if errors:
        for idx, msg in errors[:5]: print(f"  Row {idx}: {msg}")

if __name__ == "__main__":
    if SUPABASE_KEY == "PASTE_YOUR_SECRET_KEY_HERE":
        print("ERROR: Paste your service_role key into the script first.")
        exit(1)
    run(CSV_PATH, create_client(SUPABASE_URL, SUPABASE_KEY))
