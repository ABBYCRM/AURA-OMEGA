---
name: ABBYAURA repo
description: ABBYAURA is a private GitHub fork of AURA-OMEGA (https://github.com/aura-omega-ui/aura-omega-ui). Full tool inventory used to power agent capability profiles.
---

## What ABBYAURA is
paisabrazilfl-cpu/ABBYAURA is a private fork of the AURA-OMEGA open-source AI agent runtime. It is a full multi-agent platform with 9 tool categories covering every major capability class.

## Tool categories (all agents inherit the full set)
- **Runtime**: exec, code_execution, process
- **Files**: read, write, edit, apply_patch, diffs
- **Web**: web_search, x_search, web_fetch
- **Browser**: browser, screenshot, pdf
- **Memory**: memory_lancedb, memory_wiki
- **Agents**: subagents, sessions_spawn, sessions_history, agents_list, goal, session_status
- **Automation**: cron, heartbeat_respond, webhook, message
- **Media/AI**: image, image_generate, tts, music_generate, video_generate, llm_task, tokenjuice, lobster
- **Gateway**: gateway, nodes, tool_search, tool_describe

## Agent role specializations (all have full tool set, different primary focus)
- FORGE (Code Executor): exec/code_execution/apply_patch primary
- CRAWLER (Browser Agent): browser/web_fetch/web_search/x_search primary
- VAULT (Memory & RAG): memory_lancedb/memory_wiki/tool_search primary
- WIRE (API Connector): message/cron/heartbeat_respond/gateway primary

**Why:** User asked to clone ABBYAURA into each AURA agent — every agent gets the full ABBYAURA runtime but with role-tuned primary tools.
