"""
Multi-engine LinkedIn profile scraper — NO LOGIN REQUIRED.
When direct LinkedIn auth is blocked, fall back to:

  1. Google dorking (site:linkedin.com/in/) via Google Scholar + Custom Search
  2. Bing site: search
  3. DuckDuckGo HTML
  4. Tavily / Exa API (already configured)
  5. Steels.dev scrape of the resulting profile URLs

The operator's RULE (2026-06-26):
  "For blocked situations, use a workaround like Google search for the
   profiles as they will show up. Make this a rule, self-reflect,
   search online and find ways to get the job done."

This script implements that rule.
"""

import subprocess, sys, csv, json, re, time, urllib.parse, urllib.request, os

# Ensure deps
subprocess.check_call([sys.executable, "-m", "pip", "install", "--quiet", "requests", "beautifulsoup4"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

import requests
from bs4 import BeautifulSoup

# ──────────────────────────────────────────────────────────────────────
# CATEGORIES — operator's spec: 8 categories × 30 contacts each
# ──────────────────────────────────────────────────────────────────────

CATEGORIES = [
    {"key": "mass_tort_lead_gen",        "queries": ['"mass tort" lead generation India OR Philippines', '"mass tort" lead gen', '"mass tort" marketing India'], "limit": 30},
    {"key": "mass_tort_case_buyers",     "queries": ['"mass tort" case acquisition', '"mass tort" case buyer', '"MDL" case buyer'], "limit": 30},
    {"key": "mva_cpa_lead_gen",          "queries": ['"MVA" lead generation India OR Philippines', '"motor vehicle accident" lead gen India', '"MVA" CPA lead generation'], "limit": 30},
    {"key": "mva_case_buyers",           "queries": ['"MVA" case buyer', '"motor vehicle accident" case acquisition', '"MVA" case intake'], "limit": 30},
    {"key": "hvac_suppliers",            "queries": ['HVAC supplier distributor', 'HVAC wholesale distributor', 'HVAC supply house', 'HVAC equipment distributor'], "limit": 30},
    {"key": "hvac_supply_buyers",        "queries": ['HVAC supply buyer', 'HVAC procurement manager', 'HVAC buyer', 'HVAC purchasing agent'], "limit": 30},
    {"key": "ssdi_lead_gen",             "queries": ['"SSDI" lead generation India OR Philippines', '"Social Security Disability" lead gen', '"SSDI" intake'], "limit": 30},
    {"key": "ssdi_lead_buyers",          "queries": ['"SSDI" lead buyer', '"Social Security Disability" buyer', '"SSDI" live transfers buyer'], "limit": 30},
]

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

# ──────────────────────────────────────────────────────────────────────
# SEARCH ENGINES — each tries public sources with site:linkedin.com
# ──────────────────────────────────────────────────────────────────────

def google_ddg(query, limit=30):
    """DuckDuckGo HTML search — no rate limit, no API key."""
    out = []
    try:
        url = "https://html.duckduckgo.com/html/?" + urllib.parse.urlencode({"q": query})
        r = requests.get(url, headers={"User-Agent": UA}, timeout=20)
        soup = BeautifulSoup(r.text, "html.parser")
        for res in soup.select(".result")[:limit*2]:
            a = res.select_one("a.result__a")
            if not a:
                continue
            title = a.get_text(" ", strip=True)
            href = a.get("href", "")
            if "uddg=" in href:
                # DDG wraps real URLs — unwrap
                m = re.search(r"uddg=([^&]+)", href)
                if m: href = urllib.parse.unquote(m.group(1))
            snippet_el = res.select_one(".result__snippet")
            snippet = snippet_el.get_text(" ", strip=True) if snippet_el else ""
            if "linkedin.com" in href:
                out.append({"title": title, "url": href, "snippet": snippet})
            if len(out) >= limit:
                break
    except Exception as e:
        print(f"[ddg error] {e}", file=sys.stderr)
    return out

def bing_search(query, limit=30):
    """Bing site: search via public endpoint."""
    out = []
    try:
        url = "https://www.bing.com/search?" + urllib.parse.urlencode({"q": query, "count": limit})
        r = requests.get(url, headers={"User-Agent": UA}, timeout=20)
        soup = BeautifulSoup(r.text, "html.parser")
        for li in soup.select("li.b_algo")[:limit*2]:
            a = li.select_one("h2 a")
            if not a: continue
            href = a.get("href", "")
            title = a.get_text(" ", strip=True)
            snippet_el = li.select_one(".b_caption p")
            snippet = snippet_el.get_text(" ", strip=True) if snippet_el else ""
            if "linkedin.com" in href:
                out.append({"title": title, "url": href, "snippet": snippet})
            if len(out) >= limit: break
    except Exception as e:
        print(f"[bing error] {e}", file=sys.stderr)
    return out

def tavily_search(query, api_key, limit=30):
    """Tavily Search API — already configured in env. Returns real LinkedIn
    profile URLs with name/role/company in the title and snippet."""
    out = []
    try:
        r = requests.post("https://api.tavily.com/search", json={
            "api_key": api_key,
            "query": query,
            "max_results": 50,  # request more so dedup keeps limit
            "include_domains": ["linkedin.com"],
            "search_depth": "advanced",
        }, timeout=30)
        data = r.json()
        for res in data.get("results", []):
            url = res.get("url", "")
            if "linkedin.com" in url:
                out.append({
                    "title": res.get("title", ""),
                    "url": url,
                    "snippet": res.get("content", "")[:500],
                })
            if len(out) >= limit: break
    except Exception as e:
        print(f"[tavily error] {e}", file=sys.stderr)
    return out

def exa_search(query, api_key, limit=30):
    """Exa Search API — semantic neural search."""
    out = []
    try:
        r = requests.post("https://api.exa.ai/search", json={
            "apiKey": api_key,
            "query": query,
            "numResults": limit,
            "includeDomains": ["linkedin.com"],
            "useAutoprompt": False,
        }, timeout=20)
        data = r.json()
        for res in data.get("results", []):
            url = res.get("url", "")
            if "linkedin.com" in url:
                out.append({
                    "title": res.get("title", ""),
                    "url": url,
                    "snippet": res.get("text", "")[:300],
                })
            if len(out) >= limit: break
    except Exception as e:
        print(f"[exa error] {e}", file=sys.stderr)
    return out

# ──────────────────────────────────────────────────────────────────────
# PROFILE EXTRACTION — parse Google/Bing/DDG snippets
# ──────────────────────────────────────────────────────────────────────

ROLE_KEYWORDS = [
    "founder", "ceo", "owner", "president", "director", "manager",
    "lead generation", "lead gen", "case acquisition", "buyer",
    "supplier", "distributor", "supply", "wholesale", "procurement",
    "marketing", "sales", "operations", "intake", "compliance",
    "case buyer", "case intake", "live transfers",
]

def parse_title_snippet(title, snippet):
    """Pull name + role + company out of a Google result like
    'Hunter Code - Mass Tort Lead Generation - LinkedIn'."""
    # Strip "- LinkedIn" suffix
    title = re.sub(r"\s*[-–|]\s*LinkedIn\s*$", "", title, flags=re.I).strip()
    # Split on common separators
    parts = re.split(r"\s+[-–|·]\s+", title, maxsplit=2)
    name = parts[0].strip() if parts else ""
    role = parts[1].strip() if len(parts) > 1 else ""
    company = parts[2].strip() if len(parts) > 2 else ""
    if not role and snippet:
        # Pull first sentence of snippet as role
        first_sent = re.split(r"[.!?]", snippet, maxsplit=1)[0]
        role = first_sent[:140].strip()
    if not company and role:
        m = re.search(r"\s+at\s+([A-Z][\w\s&.,-]{2,60})", role)
        if m: company = m.group(1).strip()
    return name, role, company

def is_profile_url(url):
    """True for /in/ profile URLs, False for /company/, posts, etc."""
    return "/in/" in url and "linkedin.com/in/" in url

# ──────────────────────────────────────────────────────────────────────
# MAIN — run multi-engine search for each category
# ──────────────────────────────────────────────────────────────────────

def main():
    tavily_key = os.environ.get("TAVILY_API_KEY", "")
    exa_key = os.environ.get("EXA_API_KEY", "")
    print(f"[setup] Tavily: {'yes' if tavily_key else 'no'}, Exa: {'yes' if exa_key else 'no'}", file=sys.stderr)

    w = csv.DictWriter(sys.stdout, fieldnames=["category","full_name","current_job_title","company_name","location","email","phone","linkedin_url","source_engine"])
    w.writeheader()
    total = 0
    seen_urls = set()
    for cat in CATEGORIES:
        print(f"[{cat['key']}] {len(cat['queries'])} query variants", file=sys.stderr)

        # For each query variant, try Tavily + Exa (the engines that work).
        # Dedupe across variants. Stop when we have 2x the category limit.
        results = []
        for query in cat["queries"]:
            q = f"site:linkedin.com/in/ {query}"
            print(f"  Q: {q}", file=sys.stderr)
            for engine_name, engine_fn in [
                ("tavily", lambda q2: tavily_search(q2, tavily_key, 25) if tavily_key else []),
                ("exa",    lambda q2: exa_search(q2, exa_key, 25) if exa_key else []),
            ]:
                r = engine_fn(q)
                print(f"    {engine_name}: {len(r)} results", file=sys.stderr)
                for x in r: x["_engine"] = engine_name
                results.extend(r)
            if len([x for x in results if is_profile_url(x["url"])]) >= cat["limit"] * 2:
                break

        # Process + dedupe
        written = 0
        for res in results:
            if not is_profile_url(res["url"]):
                continue
            clean_url = res["url"].split("?")[0]
            if clean_url in seen_urls:
                continue
            seen_urls.add(clean_url)
            name, role, company = parse_title_snippet(res["title"], res["snippet"])
            if not name: continue
            # Sanitize: strip newlines, cap to reasonable lengths
            name = name.replace("\n", " ").strip()[:120]
            role = role.replace("\n", " ").strip()[:200]
            company = company.replace("\n", " ").strip()[:120]
            # Try to extract location from snippet — LinkedIn snippets look like
            # "Name\nRole\nCompany\nLocation, Region\n500+ connections"
            loc = ""
            snip = (res.get("snippet") or "").replace("\n", " | ")
            # LinkedIn snippet format from Tavily: "Name\nRole\nLocation\n500+ connections"
            parts = [p.strip() for p in (res.get("snippet") or "").split("\n") if p.strip()]
            # Heuristic: location is usually a short "City, State/Country" string
            # appearing between the name/role and "connections"
            for p in parts[1:]:
                if "connections" in p.lower() or "followers" in p.lower():
                    continue
                if re.match(r"^[\w\s,.\-]{3,60}$", p) and ("," in p or any(c.isupper() for c in p)):
                    # Likely a location
                    loc = p
                    break
            w.writerow({
                "category": cat["key"],
                "full_name": name,
                "current_job_title": role,
                "company_name": company,
                "location": loc,
                "email": "",
                "phone": "",
                "linkedin_url": clean_url,
                "source_engine": res.get("_engine", ""),
            })
            written += 1
            total += 1
            if written >= cat["limit"]:
                break
        print(f"  WROTE: {written}/{cat['limit']}", file=sys.stderr)
    print(f"TOTAL: {total}", file=sys.stderr)

if __name__ == "__main__":
    main()