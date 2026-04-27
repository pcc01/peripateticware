# Peripateticware: GitHub-Optimized Architectural Specifications

This document contains corrected technical designs. To ensure rendering on GitHub, images are provided as Base64-encoded HTML tags. The raw SVG source is also provided below each diagram.

## System-Level Architecture

<img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA4MDAgNDUwIj4KICA8cmVjdCB3aWR0aD0iODAwIiBoZWlnaHQ9IjQ1MCIgZmlsbD0iI2ZhZjhmNSIgcng9IjEwIi8+CiAgPHJlY3QgeD0iNTAiIHk9IjE3NSIgd2lkdGg9IjE0MCIgaGVpZ2h0PSI4MCIgcng9IjgiIGZpbGw9IiNlOGYwZmUiIHN0cm9rZT0iIzFhNzNlOCIgc3Ryb2tlLXdpZHRoPSIyIi8+CiAgPHRleHQgeD0iMTIwIiB5PSIyMTUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgZm9udC13ZWlnaHQ9ImJvbGQiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZpbGw9IiMxYTczZTgiPlBpeGVsIDkgUHJvPC90ZXh0PgogIDx0ZXh0IHg9IjEyMCIgeT0iMjM1IiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTEiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZpbGw9IiMxYTczZTgiPihGbHV0dGVyIENsaWVudCk8L3RleHQ+CiAgPHJlY3QgeD0iMjcwIiB5PSIxNDAiIHdpZHRoPSIxNjAiIGhlaWdodD0iMTUwIiByeD0iMTAiIGZpbGw9IiNmMWYzZjQiIHN0cm9rZT0iIzVmNjM2OCIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtZGFzaGFycmF5PSI2LDQiLz4KICA8dGV4dCB4PSIzNTAiIHk9IjE2NSIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjEyIiBmb250LXdlaWdodD0iYm9sZCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0iIzVmNjM2OCI+U2VjdXJlIE1lc2g8L3RleHQ+CiAgPHRleHQgeD0iMzUwIiB5PSIxODUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxMSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0iIzVmNjM2OCI+KFRhaWxzY2FsZSBWUE4pPC90ZXh0PgogIDxyZWN0IHg9IjUyMCIgeT0iODAiIHdpZHRoPSIyMzAiIGhlaWdodD0iMjcwIiByeD0iOCIgZmlsbD0iI2U2ZmZmYSIgc3Ryb2tlPSIjMzhiMmFjIiBzdHJva2Utd2lkdGg9IjIiLz4KICA8dGV4dCB4PSI2MzUiIHk9IjExMCIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjE1IiBmb250LXdlaWdodD0iYm9sZCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0iIzJjN2E3YiI+VWJ1bnR1IFNlcnZlcjwvdGV4dD4KICA8dGV4dCB4PSI2MzUiIHk9IjEzMCIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjExIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjMmM3YTdiIj4oRmFzdEFQSSwgSGF5c3RhY2ssIE9sbGFtYSk8L3RleHQ+CiAgPHJlY3QgeD0iNTQ1IiB5PSIzODAiIHdpZHRoPSIxODAiIGhlaWdodD0iNTAiIHJ4PSI1IiBmaWxsPSIjZmZmNWY1IiBzdHJva2U9IiNlNTNlM2UiIHN0cm9rZS13aWR0aD0iMiIvPgogIDx0ZXh0IHg9IjYzNSIgeT0iNDEwIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTIiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZpbGw9IiNjNTMwMzAiPkV4dGVybmFsIEFQSXMgKFdpa2kvTWFwcyk8L3RleHQ+CiAgPHJlY3QgeD0iMjkwIiB5PSI0MCIgd2lkdGg9IjEyMCIgaGVpZ2h0PSI1MCIgcng9IjUiIGZpbGw9IiNmZmZhZjAiIHN0cm9rZT0iI2VkODkzNiIgc3Ryb2tlLXdpZHRoPSIyIi8+CiAgPHRleHQgeD0iMzUwIiB5PSI3MCIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjEyIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjYzA1NjIxIj5DbG91ZGZsYXJlIFR1bm5lbDwvdGV4dD4KICA8cGF0aCBkPSJNIDE5MCAyMTUgTCAyNzAgMjE1IiBzdHJva2U9IiMxYTczZTgiIHN0cm9rZS13aWR0aD0iMiIgZmlsbD0ibm9uZSIvPgogIDxwYXRoIGQ9Ik0gNDMwIDIxNSBMIDUyMCAyMTUiIHN0cm9rZT0iIzVmNjM2OCIgc3Ryb2tlLXdpZHRoPSIyIiBmaWxsPSJub25lIi8+CiAgPHBhdGggZD0iTSA2MzUgMzUwIEwgNjM1IDM4MCIgc3Ryb2tlPSIjNWY2MzY4IiBzdHJva2Utd2lkdGg9IjEuNSIgZmlsbD0ibm9uZSIvPgogIDxwYXRoIGQ9Ik0gNTIwIDE4MCBRIDQ1MCAxMDAgNDEwIDc1IiBzdHJva2U9IiM1ZjYzNjgiIHN0cm9rZS13aWR0aD0iMS41IiBmaWxsPSJub25lIi8+Cjwvc3ZnPg==" width="100%" />

### SVG Source:
```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450">
  <rect width="800" height="450" fill="#faf8f5" rx="10"/>
  <rect x="50" y="175" width="140" height="80" rx="8" fill="#e8f0fe" stroke="#1a73e8" stroke-width="2"/>
  <text x="120" y="215" font-family="Arial" font-size="14" font-weight="bold" text-anchor="middle" fill="#1a73e8">Pixel 9 Pro</text>
  <text x="120" y="235" font-family="Arial" font-size="11" text-anchor="middle" fill="#1a73e8">(Flutter Client)</text>
  <rect x="270" y="140" width="160" height="150" rx="10" fill="#f1f3f4" stroke="#5f6368" stroke-width="2" stroke-dasharray="6,4"/>
  <text x="350" y="165" font-family="Arial" font-size="12" font-weight="bold" text-anchor="middle" fill="#5f6368">Secure Mesh</text>
  <text x="350" y="185" font-family="Arial" font-size="11" text-anchor="middle" fill="#5f6368">(Tailscale VPN)</text>
  <rect x="520" y="80" width="230" height="270" rx="8" fill="#e6fffa" stroke="#38b2ac" stroke-width="2"/>
  <text x="635" y="110" font-family="Arial" font-size="15" font-weight="bold" text-anchor="middle" fill="#2c7a7b">Ubuntu Server</text>
  <text x="635" y="130" font-family="Arial" font-size="11" text-anchor="middle" fill="#2c7a7b">(FastAPI, Haystack, Ollama)</text>
  <rect x="545" y="380" width="180" height="50" rx="5" fill="#fff5f5" stroke="#e53e3e" stroke-width="2"/>
  <text x="635" y="410" font-family="Arial" font-size="12" text-anchor="middle" fill="#c53030">External APIs (Wiki/Maps)</text>
  <rect x="290" y="40" width="120" height="50" rx="5" fill="#fffaf0" stroke="#ed8936" stroke-width="2"/>
  <text x="350" y="70" font-family="Arial" font-size="12" text-anchor="middle" fill="#c05621">Cloudflare Tunnel</text>
  <path d="M 190 215 L 270 215" stroke="#1a73e8" stroke-width="2" fill="none"/>
  <path d="M 430 215 L 520 215" stroke="#5f6368" stroke-width="2" fill="none"/>
  <path d="M 635 350 L 635 380" stroke="#5f6368" stroke-width="1.5" fill="none"/>
  <path d="M 520 180 Q 450 100 410 75" stroke="#5f6368" stroke-width="1.5" fill="none"/>
</svg>
```

---

## Service-Level Architecture

<img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA4NTAgNTUwIj4KICA8cmVjdCB3aWR0aD0iODUwIiBoZWlnaHQ9IjU1MCIgZmlsbD0iI2Y4ZjlmYSIgcng9IjEwIiBzdHJva2U9IiNkYWRjZTAiIHN0cm9rZS13aWR0aD0iMiIvPgogIDx0ZXh0IHg9IjMwIiB5PSI0MCIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjE4IiBmb250LXdlaWdodD0iYm9sZCIgZmlsbD0iIzNjNDA0MyI+VWJ1bnR1IEhvc3Q6IEZhc3RBUEkgQmFja2VuZCBTZXJ2aWNlczwvdGV4dD4KICA8cmVjdCB4PSI1MCIgeT0iODAiIHdpZHRoPSIyMjAiIGhlaWdodD0iMTIwIiByeD0iNSIgZmlsbD0iI2U4ZjBmZSIgc3Ryb2tlPSIjMWE3M2U4IiBzdHJva2Utd2lkdGg9IjIiLz4KICA8dGV4dCB4PSIxNjAiIHk9IjExNSIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjE0IiBmb250LXdlaWdodD0iYm9sZCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0iIzFhNzNlOCI+RmFzdEFQSSBDb250cm9sbGVyPC90ZXh0PgogIDx0ZXh0IHg9IjE2MCIgeT0iMTQwIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTEiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZpbGw9IiMxYTczZTgiPkF1dGgsIFBvbGljeSBFbmdpbmUsIFdTPC90ZXh0PgogIDx0ZXh0IHg9IjE2MCIgeT0iMTYwIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTEiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZpbGw9IiMxYTczZTgiPihQb3J0IDgwMTApPC90ZXh0PgogIDxyZWN0IHg9IjMzMCIgeT0iODAiIHdpZHRoPSIyNTAiIGhlaWdodD0iMTgwIiByeD0iNSIgZmlsbD0iI2U2ZmZmYSIgc3Ryb2tlPSIjMzhiMmFjIiBzdHJva2Utd2lkdGg9IjIiLz4KICA8dGV4dCB4PSI0NTUiIHk9IjExNSIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjE0IiBmb250LXdlaWdodD0iYm9sZCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0iIzJjN2E3YiI+SGF5c3RhY2sgT3JjaGVzdHJhdG9yPC90ZXh0PgogIDx0ZXh0IHg9IjQ1NSIgeT0iMTQ1IiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTEiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZpbGw9IiMyYzdhN2IiPlRyaXBsZS1Kb2luIFJlYXNvbmluZyBFbmdpbmU8L3RleHQ+CiAgPHRleHQgeD0iNDU1IiB5PSIxNjUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxMCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0iIzJjN2E3YiI+KFNpdGUgKyBDdXJyaWN1bHVtICsgUGVyc29uYSk8L3RleHQ+CiAgPHJlY3QgeD0iMzU1IiB5PSIxODUiIHdpZHRoPSIyMDAiIGhlaWdodD0iNjAiIHJ4PSIzIiBmaWxsPSIjZmZmZmZmIiBzdHJva2U9IiMzOGIyYWMiIHN0cm9rZS1kYXNoYXJyYXk9IjQsMiIvPgogIDx0ZXh0IHg9IjQ1NSIgeT0iMjE1IiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTAiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZpbGw9IiMyYzdhN2IiPlJBRyBSZXRyaWV2YWwgUGlwZWxpbmVzPC90ZXh0PgogIDxyZWN0IHg9IjY1MCIgeT0iODAiIHdpZHRoPSIxNTAiIGhlaWdodD0iMTIwIiByeD0iNSIgZmlsbD0iI2ZkZjJmMiIgc3Ryb2tlPSIjZTUzZTNlIiBzdHJva2Utd2lkdGg9IjIiLz4KICA8dGV4dCB4PSI3MjUiIHk9IjEyMCIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjE0IiBmb250LXdlaWdodD0iYm9sZCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0iI2M1MzAzMCI+cGd2ZWN0b3I8L3RleHQ+CiAgPHRleHQgeD0iNzI1IiB5PSIxNDUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxMSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0iI2M1MzAzMCI+Q291cnNlIE1ldGFkYXRhICZhbXA7IEVtYmVkZGluZ3M8L3RleHQ+CiAgPHJlY3QgeD0iMzMwIiB5PSIzMjAiIHdpZHRoPSIyNTAiIGhlaWdodD0iMTUwIiByeD0iNSIgZmlsbD0iI2ZmZjVmNSIgc3Ryb2tlPSIjZTUzZTNlIiBzdHJva2Utd2lkdGg9IjIiLz4KICA8dGV4dCB4PSI0NTUiIHk9IjM1NSIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjE0IiBmb250LXdlaWdodD0iYm9sZCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0iI2M1MzAzMCI+T2xsYW1hIEluZmVyZW5jZSBIdWI8L3RleHQ+CiAgPHRleHQgeD0iNDU1IiB5PSIzODUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxMSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0iI2M1MzAzMCI+TGxhbWEgMyAvIExsYXZhIC8gV2hpc3BlcjwvdGV4dD4KICA8cmVjdCB4PSI1MCIgeT0iMzIwIiB3aWR0aD0iMjIwIiBoZWlnaHQ9IjE1MCIgcng9IjUiIGZpbGw9IiNmM2U1ZjUiIHN0cm9rZT0iIzljMjdiMCIgc3Ryb2tlLXdpZHRoPSIyIi8+CiAgPHRleHQgeD0iMTYwIiB5PSIzNTUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgZm9udC13ZWlnaHQ9ImJvbGQiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZpbGw9IiM3YjFmYTIiPk9ic2VydmFiaWxpdHkgU2VydmljZTwvdGV4dD4KICA8dGV4dCB4PSIxNjAiIHk9IjM4NSIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjExIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjN2IxZmEyIj5MYXRlbmN5IE1vbml0b3Jpbmc8L3RleHQ+CiAgPHRleHQgeD0iMTYwIiB5PSI0MDUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxMSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0iIzdiMWZhMiI+QXV0b21hdGVkIEdob3N0IFByb2JlczwvdGV4dD4KICA8cGF0aCBkPSJNIDI3MCAxNDAgTCAzMzAgMTQwIiBzdHJva2U9IiM1ZjYzNjgiIHN0cm9rZS13aWR0aD0iMiIvPgogIDxwYXRoIGQ9Ik0gNTgwIDE0MCBMIDY1MCAxNDAiIHN0cm9rZT0iIzVmNjM2OCIgc3Ryb2tlLXdpZHRoPSIyIi8+CiAgPHBhdGggZD0iTSA2NTAgMTYwIEwgNTgwIDE2MCIgc3Ryb2tlPSIjNWY2MzY4IiBzdHJva2Utd2lkdGg9IjIiLz4KICA8cGF0aCBkPSJNIDQ1NSAyNjAgTCA0NTUgMzIwIiBzdHJva2U9IiM1ZjYzNjgiIHN0cm9rZS13aWR0aD0iMiIvPgogIDxwYXRoIGQ9Ik0gMjcwIDQwMCBMIDMzMCA0MDAiIHN0cm9rZT0iIzVmNjM2OCIgc3Ryb2tlLXdpZHRoPSIxLjUiLz4KPC9zdmc+" width="100%" />

### SVG Source:
```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 850 550">
  <rect width="850" height="550" fill="#f8f9fa" rx="10" stroke="#dadce0" stroke-width="2"/>
  <text x="30" y="40" font-family="Arial" font-size="18" font-weight="bold" fill="#3c4043">Ubuntu Host: FastAPI Backend Services</text>
  <rect x="50" y="80" width="220" height="120" rx="5" fill="#e8f0fe" stroke="#1a73e8" stroke-width="2"/>
  <text x="160" y="115" font-family="Arial" font-size="14" font-weight="bold" text-anchor="middle" fill="#1a73e8">FastAPI Controller</text>
  <text x="160" y="140" font-family="Arial" font-size="11" text-anchor="middle" fill="#1a73e8">Auth, Policy Engine, WS</text>
  <text x="160" y="160" font-family="Arial" font-size="11" text-anchor="middle" fill="#1a73e8">(Port 8010)</text>
  <rect x="330" y="80" width="250" height="180" rx="5" fill="#e6fffa" stroke="#38b2ac" stroke-width="2"/>
  <text x="455" y="115" font-family="Arial" font-size="14" font-weight="bold" text-anchor="middle" fill="#2c7a7b">Haystack Orchestrator</text>
  <text x="455" y="145" font-family="Arial" font-size="11" text-anchor="middle" fill="#2c7a7b">Triple-Join Reasoning Engine</text>
  <text x="455" y="165" font-family="Arial" font-size="10" text-anchor="middle" fill="#2c7a7b">(Site + Curriculum + Persona)</text>
  <rect x="355" y="185" width="200" height="60" rx="3" fill="#ffffff" stroke="#38b2ac" stroke-dasharray="4,2"/>
  <text x="455" y="215" font-family="Arial" font-size="10" text-anchor="middle" fill="#2c7a7b">RAG Retrieval Pipelines</text>
  <rect x="650" y="80" width="150" height="120" rx="5" fill="#fdf2f2" stroke="#e53e3e" stroke-width="2"/>
  <text x="725" y="120" font-family="Arial" font-size="14" font-weight="bold" text-anchor="middle" fill="#c53030">pgvector</text>
  <text x="725" y="145" font-family="Arial" font-size="11" text-anchor="middle" fill="#c53030">Course Metadata &amp; Embeddings</text>
  <rect x="330" y="320" width="250" height="150" rx="5" fill="#fff5f5" stroke="#e53e3e" stroke-width="2"/>
  <text x="455" y="355" font-family="Arial" font-size="14" font-weight="bold" text-anchor="middle" fill="#c53030">Ollama Inference Hub</text>
  <text x="455" y="385" font-family="Arial" font-size="11" text-anchor="middle" fill="#c53030">Llama 3 / Llava / Whisper</text>
  <rect x="50" y="320" width="220" height="150" rx="5" fill="#f3e5f5" stroke="#9c27b0" stroke-width="2"/>
  <text x="160" y="355" font-family="Arial" font-size="14" font-weight="bold" text-anchor="middle" fill="#7b1fa2">Observability Service</text>
  <text x="160" y="385" font-family="Arial" font-size="11" text-anchor="middle" fill="#7b1fa2">Latency Monitoring</text>
  <text x="160" y="405" font-family="Arial" font-size="11" text-anchor="middle" fill="#7b1fa2">Automated Ghost Probes</text>
  <path d="M 270 140 L 330 140" stroke="#5f6368" stroke-width="2"/>
  <path d="M 580 140 L 650 140" stroke="#5f6368" stroke-width="2"/>
  <path d="M 650 160 L 580 160" stroke="#5f6368" stroke-width="2"/>
  <path d="M 455 260 L 455 320" stroke="#5f6368" stroke-width="2"/>
  <path d="M 270 400 L 330 400" stroke="#5f6368" stroke-width="1.5"/>
</svg>
```

---

## Triple-Join Reasoning Logic

<img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA1MDAgNTAwIj4KICA8Y2lyY2xlIGN4PSIyNTAiIGN5PSIxODAiIHI9IjEyMCIgZmlsbD0iI2U4ZjBmZSIgc3Ryb2tlPSIjMWE3M2U4IiBzdHJva2Utd2lkdGg9IjIiIGZpbGwtb3BhY2l0eT0iMC42Ii8+CiAgPGNpcmNsZSBjeD0iMTYwIiBjeT0iMzIwIiByPSIxMjAiIGZpbGw9IiNlNmZmZmEiIHN0cm9rZT0iIzM4YjJhYyIgc3Ryb2tlLXdpZHRoPSIyIiBmaWxsLW9wYWNpdHk9IjAuNiIvPgogIDxjaXJjbGUgY3g9IjM0MCIgY3k9IjMyMCIgcj0iMTIwIiBmaWxsPSIjZmZmYWYwIiBzdHJva2U9IiNlZDg5MzYiIHN0cm9rZS13aWR0aD0iMiIgZmlsbC1vcGFjaXR5PSIwLjYiLz4KICA8dGV4dCB4PSIyNTAiIHk9IjE1MCIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjE0IiBmb250LXdlaWdodD0iYm9sZCIgdGV4dC1hbmNob3I9Im1pZGRsZSI+U0lURTwvdGV4dD4KICA8dGV4dCB4PSIxMjAiIHk9IjM1MCIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjE0IiBmb250LXdlaWdodD0iYm9sZCIgdGV4dC1hbmNob3I9Im1pZGRsZSI+Q1VSUklDVUxVTTwvdGV4dD4KICA8dGV4dCB4PSIzODAiIHk9IjM1MCIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjE0IiBmb250LXdlaWdodD0iYm9sZCIgdGV4dC1hbmNob3I9Im1pZGRsZSI+UEVSU09OQTwvdGV4dD4KICA8dGV4dCB4PSIyNTAiIHk9IjI4MCIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjE2IiBmb250LXdlaWdodD0iYm9sZCIgdGV4dC1hbmNob3I9Im1pZGRsZSI+SU5RVUlSWSBQQVRIPC90ZXh0Pgo8L3N2Zz4=" width="100%" />

### SVG Source:
```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500">
  <circle cx="250" cy="180" r="120" fill="#e8f0fe" stroke="#1a73e8" stroke-width="2" fill-opacity="0.6"/>
  <circle cx="160" cy="320" r="120" fill="#e6fffa" stroke="#38b2ac" stroke-width="2" fill-opacity="0.6"/>
  <circle cx="340" cy="320" r="120" fill="#fffaf0" stroke="#ed8936" stroke-width="2" fill-opacity="0.6"/>
  <text x="250" y="150" font-family="Arial" font-size="14" font-weight="bold" text-anchor="middle">SITE</text>
  <text x="120" y="350" font-family="Arial" font-size="14" font-weight="bold" text-anchor="middle">CURRICULUM</text>
  <text x="380" y="350" font-family="Arial" font-size="14" font-weight="bold" text-anchor="middle">PERSONA</text>
  <text x="250" y="280" font-family="Arial" font-size="16" font-weight="bold" text-anchor="middle">INQUIRY PATH</text>
</svg>
```

---

## Multimodal Media Pipeline

<img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAwIDIwMCI+CiAgPHJlY3QgeD0iMTAiIHk9IjUwIiB3aWR0aD0iMTgwIiBoZWlnaHQ9IjEwMCIgcng9IjEwIiBmaWxsPSIjZjFmM2Y0IiBzdHJva2U9IiM1ZjYzNjgiLz4KICA8dGV4dCB4PSIxMDAiIHk9IjEwNSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjEyIj5TZW5zb3IgQ2FwdHVyZTwvdGV4dD4KICA8cmVjdCB4PSIyMTAiIHk9IjUwIiB3aWR0aD0iMTgwIiBoZWlnaHQ9IjEwMCIgcng9IjEwIiBmaWxsPSIjZjFmM2Y0IiBzdHJva2U9IiM1ZjYzNjgiLz4KICA8dGV4dCB4PSIzMDAiIHk9IjEwNSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjEyIj5QSUkgU2NydWJiaW5nPC90ZXh0PgogIDxyZWN0IHg9IjQxMCIgeT0iNTAiIHdpZHRoPSIxODAiIGhlaWdodD0iMTAwIiByeD0iMTAiIGZpbGw9IiNmMWYzZjQiIHN0cm9rZT0iIzVmNjM2OCIvPgogIDx0ZXh0IHg9IjUwMCIgeT0iMTA1IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTIiPk5vcm1hbGl6YXRpb248L3RleHQ+CiAgPHJlY3QgeD0iNjEwIiB5PSI1MCIgd2lkdGg9IjE4MCIgaGVpZ2h0PSIxMDAiIHJ4PSIxMCIgZmlsbD0iI2YxZjNmNCIgc3Ryb2tlPSIjNWY2MzY4Ii8+CiAgPHRleHQgeD0iNzAwIiB5PSIxMDUiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxMiI+SW5mZXJlbmNlIEh1YjwvdGV4dD4KICA8cmVjdCB4PSI4MTAiIHk9IjUwIiB3aWR0aD0iMTgwIiBoZWlnaHQ9IjEwMCIgcng9IjEwIiBmaWxsPSIjZjFmM2Y0IiBzdHJva2U9IiM1ZjYzNjgiLz4KICA8dGV4dCB4PSI5MDAiIHk9IjEwNSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjEyIj5NZXRhZGF0YSBTdG9yZTwvdGV4dD4KICA8cGF0aCBkPSJNIDE5MCAxMDAgTCAyMTAgMTAwIiBzdHJva2U9IiM1ZjYzNjgiIHN0cm9rZS13aWR0aD0iMiIvPgogIDxwYXRoIGQ9Ik0gMzkwIDEwMCBMIDQxMCAxMDAiIHN0cm9rZT0iIzVmNjM2OCIgc3Ryb2tlLXdpZHRoPSIyIi8+CiAgPHBhdGggZD0iTSA1OTAgMTAwIEwgNjEwIDEwMCIgc3Ryb2tlPSIjNWY2MzY4IiBzdHJva2Utd2lkdGg9IjIiLz4KICA8cGF0aCBkPSJNIDc5MCAxMDAgTCA4MTAgMTAwIiBzdHJva2U9IiM1ZjYzNjgiIHN0cm9rZS13aWR0aD0iMiIvPgo8L3N2Zz4=" width="100%" />

### SVG Source:
```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 200">
  <rect x="10" y="50" width="180" height="100" rx="10" fill="#f1f3f4" stroke="#5f6368"/>
  <text x="100" y="105" text-anchor="middle" font-family="Arial" font-size="12">Sensor Capture</text>
  <rect x="210" y="50" width="180" height="100" rx="10" fill="#f1f3f4" stroke="#5f6368"/>
  <text x="300" y="105" text-anchor="middle" font-family="Arial" font-size="12">PII Scrubbing</text>
  <rect x="410" y="50" width="180" height="100" rx="10" fill="#f1f3f4" stroke="#5f6368"/>
  <text x="500" y="105" text-anchor="middle" font-family="Arial" font-size="12">Normalization</text>
  <rect x="610" y="50" width="180" height="100" rx="10" fill="#f1f3f4" stroke="#5f6368"/>
  <text x="700" y="105" text-anchor="middle" font-family="Arial" font-size="12">Inference Hub</text>
  <rect x="810" y="50" width="180" height="100" rx="10" fill="#f1f3f4" stroke="#5f6368"/>
  <text x="900" y="105" text-anchor="middle" font-family="Arial" font-size="12">Metadata Store</text>
  <path d="M 190 100 L 210 100" stroke="#5f6368" stroke-width="2"/>
  <path d="M 390 100 L 410 100" stroke="#5f6368" stroke-width="2"/>
  <path d="M 590 100 L 610 100" stroke="#5f6368" stroke-width="2"/>
  <path d="M 790 100 L 810 100" stroke="#5f6368" stroke-width="2"/>
</svg>
```

---

## Asynchronous Sync Engine

<img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2MDAgMzAwIj4KICA8cmVjdCB4PSIyMCIgeT0iNTAiIHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIiByeD0iMTAiIGZpbGw9IiNlOGYwZmUiIHN0cm9rZT0iIzFhNzNlOCIvPgogIDx0ZXh0IHg9IjEyMCIgeT0iMTU1IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTQiPkxvY2FsIFdBTCAoRGV2aWNlKTwvdGV4dD4KICA8cmVjdCB4PSIzODAiIHk9IjUwIiB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgcng9IjEwIiBmaWxsPSIjZTZmZmZhIiBzdHJva2U9IiMzOGIyYWMiLz4KICA8dGV4dCB4PSI0ODAiIHk9IjE1NSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjE0Ij5Qb3N0Z3JlcyBTdGF0ZTwvdGV4dD4KICA8cGF0aCBkPSJNIDIyMCAxNTAgTCAzODAgMTUwIiBzdHJva2U9IiM1ZjYzNjgiIHN0cm9rZS13aWR0aD0iMyIvPgogIDx0ZXh0IHg9IjMwMCIgeT0iMTMwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTIiIGZpbGw9IiM1ZjYzNjgiPkFzeW5jaHJvbm91cyBTeW5jPC90ZXh0Pgo8L3N2Zz4=" width="100%" />

### SVG Source:
```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 300">
  <rect x="20" y="50" width="200" height="200" rx="10" fill="#e8f0fe" stroke="#1a73e8"/>
  <text x="120" y="155" text-anchor="middle" font-family="Arial" font-size="14">Local WAL (Device)</text>
  <rect x="380" y="50" width="200" height="200" rx="10" fill="#e6fffa" stroke="#38b2ac"/>
  <text x="480" y="155" text-anchor="middle" font-family="Arial" font-size="14">Postgres State</text>
  <path d="M 220 150 L 380 150" stroke="#5f6368" stroke-width="3"/>
  <text x="300" y="130" text-anchor="middle" font-family="Arial" font-size="12" fill="#5f6368">Asynchronous Sync</text>
</svg>
```

---

## Standards Matrix Heatmap

<img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0MDAgMzAwIj4KICA8cmVjdCB4PSIxMCIgeT0iMTAiIHdpZHRoPSIzODAiIGhlaWdodD0iMjgwIiBmaWxsPSIjZmZmZmZmIiBzdHJva2U9IiNkYWRjZTAiLz4KICA8cmVjdCB4PSI1MCIgeT0iNTAiIHdpZHRoPSI4MCIgaGVpZ2h0PSI0MCIgZmlsbD0iI2Q0ZWRkYSIgc3Ryb2tlPSIjMTU1NzI0Ii8+CiAgPHJlY3QgeD0iMTMwIiB5PSI1MCIgd2lkdGg9IjgwIiBoZWlnaHQ9IjQwIiBmaWxsPSIjZmZmM2NkIiBzdHJva2U9IiM4NTY0MDQiLz4KICA8cmVjdCB4PSI1MCIgeT0iOTAiIHdpZHRoPSI4MCIgaGVpZ2h0PSI0MCIgZmlsbD0iI2Y4ZDdkYSIgc3Ryb2tlPSIjNzIxYzI0Ii8+CiAgPHJlY3QgeD0iMTMwIiB5PSI5MCIgd2lkdGg9IjgwIiBoZWlnaHQ9IjQwIiBmaWxsPSIjY2NlNWZmIiBzdHJva2U9IiMwMDQwODUiLz4KICA8dGV4dCB4PSIyMDAiIHk9IjMwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTQiIGZvbnQtd2VpZ2h0PSJib2xkIj5TdGFuZGFyZHMgSGVhdG1hcDwvdGV4dD4KPC9zdmc+" width="100%" />

### SVG Source:
```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">
  <rect x="10" y="10" width="380" height="280" fill="#ffffff" stroke="#dadce0"/>
  <rect x="50" y="50" width="80" height="40" fill="#d4edda" stroke="#155724"/>
  <rect x="130" y="50" width="80" height="40" fill="#fff3cd" stroke="#856404"/>
  <rect x="50" y="90" width="80" height="40" fill="#f8d7da" stroke="#721c24"/>
  <rect x="130" y="90" width="80" height="40" fill="#cce5ff" stroke="#004085"/>
  <text x="200" y="30" text-anchor="middle" font-family="Arial" font-size="14" font-weight="bold">Standards Heatmap</text>
</svg>
```

---

## Hardware Capability Matrix (HCM)

<img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2MDAgMjAwIj4KICA8cmVjdCB3aWR0aD0iNjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2Y4ZjlmYSIgcng9IjEwIiBzdHJva2U9IiMxYTczZTgiLz4KICA8dGV4dCB4PSIzMDAiIHk9IjQwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTYiIGZvbnQtd2VpZ2h0PSJib2xkIj5IYXJkd2FyZSBDYXBhYmlsaXR5IE1hdHJpeDwvdGV4dD4KICA8dGV4dCB4PSIzMDAiIHk9IjkwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTIiPlNlbnNvciBQcmVjaXNpb24gfCBOUFUgUG93ZXIgfCBDYW1lcmEgTGV2ZWw8L3RleHQ+CiAgPHJlY3QgeD0iNTAiIHk9IjEyMCIgd2lkdGg9IjUwMCIgaGVpZ2h0PSI0MCIgcng9IjUiIGZpbGw9IiNmZmZmZmYiIHN0cm9rZT0iI2RhZGNlMCIvPgogIDx0ZXh0IHg9IjMwMCIgeT0iMTQ1IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTIiIGZpbGw9IiM1ZjYzNjgiPlNjYWxhYmxlIExlYXJuaW5nIE1vZGVzPC90ZXh0Pgo8L3N2Zz4=" width="100%" />

### SVG Source:
```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 200">
  <rect width="600" height="200" fill="#f8f9fa" rx="10" stroke="#1a73e8"/>
  <text x="300" y="40" text-anchor="middle" font-family="Arial" font-size="16" font-weight="bold">Hardware Capability Matrix</text>
  <text x="300" y="90" text-anchor="middle" font-family="Arial" font-size="12">Sensor Precision | NPU Power | Camera Level</text>
  <rect x="50" y="120" width="500" height="40" rx="5" fill="#ffffff" stroke="#dadce0"/>
  <text x="300" y="145" text-anchor="middle" font-family="Arial" font-size="12" fill="#5f6368">Scalable Learning Modes</text>
</svg>
```

---

## Development Environment

<img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2MDAgNDAwIj4KICA8cmVjdCB4PSI1MCIgeT0iNTAiIHdpZHRoPSIyMDAiIGhlaWdodD0iMzAwIiBmaWxsPSIjZThmMGZlIiBzdHJva2U9IiMxYTczZTgiLz4KICA8dGV4dCB4PSIxNTAiIHk9IjgwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTQiIGZvbnQtd2VpZ2h0PSJib2xkIj5Eb2NrZXIgQ29tcG9zZTwvdGV4dD4KICA8cmVjdCB4PSIzNTAiIHk9IjUwIiB3aWR0aD0iMjAwIiBoZWlnaHQ9IjMwMCIgZmlsbD0iI2YxZjNmNCIgc3Ryb2tlPSIjNWY2MzY4Ii8+CiAgPHRleHQgeD0iNDU1IiB5PSI4MCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjE0IiBmb250LXdlaWdodD0iYm9sZCI+UHJpdmF0ZSBNZXNoPC90ZXh0Pgo8L3N2Zz4=" width="100%" />

### SVG Source:
```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400">
  <rect x="50" y="50" width="200" height="300" fill="#e8f0fe" stroke="#1a73e8"/>
  <text x="150" y="80" text-anchor="middle" font-family="Arial" font-size="14" font-weight="bold">Docker Compose</text>
  <rect x="350" y="50" width="200" height="300" fill="#f1f3f4" stroke="#5f6368"/>
  <text x="455" y="80" text-anchor="middle" font-family="Arial" font-size="14" font-weight="bold">Private Mesh</text>
</svg>
```

---

