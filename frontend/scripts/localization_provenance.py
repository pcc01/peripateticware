#!/usr/bin/env python3
# frontend/scripts/localization_provenance.py
#
# Shared W3C-PROV / XLIFF-1.2 toolkit for the localization pipeline.
#
# This module is the single home for the provenance graph that lives inside
# every public/locales/{code}.xlf (and {code}/{ns}.xlf) file. It used to be
# inlined in translate_sync.py; it was moved here so translate_sync.py,
# qa_review_llamacpp.py, retranslate_mt.py and retranslate_flagged.py can all
# build the SAME graph shape, and so a named human actor is a first-class
# node in the file exactly the way an AI model is (parity with
# content-provenance's W3C-PROV builder — github.com/pcc01/content-provenance,
# app/core/prov_builder.py + app/xliff/xliff_service.py).
#
# What the graph answers, from the .xlf alone, for any translated key:
#   • which MODEL produced the current target  (provider, model id, resolved
#     build/version, organization, key parameters)
#   • which MODEL reviewed it, and what it said (score, reason codes, note)
#   • which engine REDROVE it, and the formal "redriven because flagged" link
#   • which HUMAN ran each stage (operator) / signed off (reviewer), by name
#   • the full v1..vN revision chain, each version attributed to its own agent
#
# Vocabulary mirrors content-provenance (plan decision 6):
#   activityType ∈ Translation | Review | QualityAssessment
#   version source_event ∈ initial | human_edit | import | redrive | revert
#
# translate_sync.py re-exports the public names below, so existing
# `from translate_sync import build_or_update_prov_graph, ...` keeps working.

from __future__ import annotations

import json
import re
import xml.dom.minidom as minidom
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Optional

# Source language for every locale file this repo produces.
SOURCE_LANG_CODE = "en"

XLIFF_NS = "urn:oasis:names:tc:xliff:document:1.2"

# ── JSON-LD context ────────────────────────────────────────────────────────────
#
# The legacy context (still emitted, still honored) — kept verbatim so old
# .xlf files that only define these terms stay resolvable.
LEGACY_PROV_CONTEXT: dict[str, str] = {
    "prov": "http://www.w3.org/ns/prov#",
    "xsd": "http://www.w3.org/2001/XMLSchema#",
    "actor": "prov:wasAssociatedWith",
    "generated_by": "prov:wasGeneratedBy",
    "used_source": "prov:used",
    "derived_from": "prov:wasDerivedFrom",
}

# Peripateticware-local provenance terms. URN base (plan decision 1) — no need
# to resolve; swap for an https:// namespace + backfill if these files ever
# need third-party consumption.
PROVX = "urn:peripateticware:provenance:"

# Superset context: legacy terms + schema.org + every provx: / prov: term the
# structured builder emits, so the whole graph is valid JSON-LD.
EXTENDED_PROV_CONTEXT: dict[str, str] = {
    **LEGACY_PROV_CONTEXT,
    "schema": "http://schema.org/",
    "provx": PROVX,
    "softwareVersion": "schema:softwareVersion",
    "wasAssociatedWith": "prov:wasAssociatedWith",
    "wasGeneratedBy": "prov:wasGeneratedBy",
    "wasAttributedTo": "prov:wasAttributedTo",
    "wasRevisionOf": "prov:wasRevisionOf",
    "wasInformedBy": "prov:wasInformedBy",
    "used": "prov:used",
    "activityType": "provx:activityType",
    "provider": "provx:provider",
    "model": "provx:model",
    "organization": "provx:organization",
    "role": "provx:role",
    "parameters": "provx:parameters",
    "qualityScore": "provx:qualityScore",
    "qaReasons": "provx:qaReasons",
    "qaEvaluatorNote": "provx:qaEvaluatorNote",
    "overwroteTranslationBy": "provx:overwroteTranslationBy",
    "overwriteReason": "provx:overwriteReason",
    "sourceEvent": "provx:sourceEvent",
}

# Keep the old public name alive for `from translate_sync import _PROV_CONTEXT`
# and anything else that referenced it.
_PROV_CONTEXT = LEGACY_PROV_CONTEXT

# provider token -> organization / vendor
PROVIDER_ORG: dict[str, str] = {
    "OLLAMA": "local",
    "LLAMACPP": "local",
    "LMSTUDIO": "local",
    "VLLM": "local",
    "CLAUDE": "Anthropic",
    "ANTHROPIC": "Anthropic",
    "OPENAI": "OpenAI",
    "GEMINI": "Google",
    "GOOGLE_TRANSLATE": "Google",
    "DEEPL": "DeepL",
    "MICROSOFT": "Microsoft",
    "LARA": "Translated",
    "TOWER": "Unbabel",
    "MT": "multiple (fallback chain)",
}

# provider tokens Actor.from_legacy_label / the choosers recognise as a prefix
KNOWN_PROVIDERS = set(PROVIDER_ORG)

ACTIVITY_TYPES = ("Translation", "Review", "QualityAssessment")
SOURCE_EVENTS = ("initial", "human_edit", "import", "redrive", "revert")


def get_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── operator identity (the human running a pipeline session) ─────────────────
#
# Plan decision 4: default from LOCALIZATION_OPERATOR, else `git config
# user.name`, else $USERNAME/$USER; overridable per run with --operator.

def default_operator_name() -> str:
    import os
    import subprocess
    env = os.getenv("LOCALIZATION_OPERATOR")
    if env:
        return env.strip()
    try:
        out = subprocess.run(["git", "config", "user.name"], capture_output=True,
                             text=True, timeout=5)
        if out.returncode == 0 and out.stdout.strip():
            return out.stdout.strip()
    except Exception:
        pass
    return os.getenv("USERNAME") or os.getenv("USER") or "unknown operator"


def parse_operator(spec: Optional[str], *, role: Optional[str] = None,
                   organization: Optional[str] = None) -> "Actor":
    """Turn a --operator string into a human Actor.

    Accepts "" / None            -> default_operator_name(), role 'operator'
            "Paul Cerda"          -> that name
            "Paul Cerda <reviewer>" -> name + role
            "Paul Cerda | Acme"   -> name + organization
    """
    import os
    name = (spec or "").strip() or default_operator_name()
    r = role or os.getenv("LOCALIZATION_OPERATOR_ROLE") or "operator"
    org = organization or os.getenv("LOCALIZATION_OPERATOR_ORG") or "Peripateticware"
    m = re.search(r"<([^>]+)>", name)
    if m:
        r = m.group(1).strip() or r
        name = name[:m.start()].strip()
    if "|" in name:
        name, _, org_part = name.partition("|")
        name, org = name.strip(), (org_part.strip() or org)
    return Actor.human(name or default_operator_name(), role=r, organization=org)


def _slug(text: str) -> str:
    """Filesystem/@id-safe token: keep [A-Za-z0-9._-], collapse the rest to _."""
    return re.sub(r"[^A-Za-z0-9._-]+", "_", (text or "").strip()).strip("_") or "unknown"


# ── Actor ─────────────────────────────────────────────────────────────────────

@dataclass
class Actor:
    """A party responsible for a step — an AI/NMT engine or a named human.

    Structurally the AI and human forms are identical; `kind` (-> prov:Person
    vs prov:SoftwareAgent) and which fields are populated are the only
    differences, so a translator's/reviewer's real name lands in the .xlf the
    same way `claude-sonnet-4-6` does.
    """
    kind: str = "ai"                        # "ai" | "human"
    name: str = "unknown"                   # "claude-sonnet-4-6"  OR  "Paul Cerda"
    role: str = "translator"               # translator | reviewer | redriver | operator
    provider: Optional[str] = None          # "CLAUDE" | "OLLAMA" | "MICROSOFT" | None (human)
    model: Optional[str] = None             # exact model id / gguf file / engine id
    model_version: Optional[str] = None     # resolved build id when an API returns one
    organization: Optional[str] = None      # "Anthropic" | employer | ...
    parameters: dict = field(default_factory=dict)   # temperature, quant, n_ctx, tier, threshold...

    # ---- constructors -------------------------------------------------------

    @classmethod
    def human(cls, name: str, role: str = "operator", organization: Optional[str] = None) -> "Actor":
        return cls(kind="human", name=name or "unknown", role=role,
                   organization=organization or None)

    @classmethod
    def ai(cls, provider: Optional[str], model: Optional[str], *, role: str = "translator",
           model_version: Optional[str] = None, organization: Optional[str] = None,
           parameters: Optional[dict] = None, name: Optional[str] = None) -> "Actor":
        prov = (provider or "").upper() or None
        return cls(
            kind="ai",
            name=name or model or (prov.lower() if prov else "unknown"),
            role=role,
            provider=prov,
            model=model,
            model_version=model_version,
            organization=organization or (PROVIDER_ORG.get(prov) if prov else None),
            parameters=dict(parameters or {}),
        )

    @classmethod
    def from_legacy_label(cls, label: str, *, role: str = "translator") -> "Actor":
        """Parse a pre-parity actor string into structured fields, best-effort.

        Handles the three shapes the old pipeline wrote:
          "Translation Engine Profile: OLLAMA-mistral-nemo:12b [Profile: Application UI Strings | Temp: 0.0]"
          "MT-fallback-chain"
          "MICROSOFT-Azure-Cognitive-v3-F0" / "DEEPL-API-Free" / "LARA-translate-api"
        Anything unrecognised becomes a bare-name ai Actor (never raises).
        """
        s = (label or "").strip()
        s = s.replace("Translation Engine Profile: ", "").strip()
        params: dict = {}
        if " [Profile:" in s:
            head, _, tail = s.partition(" [Profile:")
            tail = tail.rstrip("]").strip()
            # tail like "Application UI Strings | Temp: 0.0"
            if "|" in tail:
                profile, _, temp = tail.partition("|")
                params["profile"] = profile.strip()
                m = re.search(r"[-+]?\d*\.?\d+", temp)
                if m:
                    params["temperature"] = float(m.group())
            elif tail:
                params["profile"] = tail
            s = head.strip()

        provider = None
        model = s
        if "-" in s:
            maybe_provider, _, rest = s.partition("-")
            if maybe_provider.upper() in KNOWN_PROVIDERS and rest:
                provider = maybe_provider.upper()
                model = rest

        if not provider and s.upper() in KNOWN_PROVIDERS:
            provider = s.upper()
            model = None

        return cls.ai(provider, model, role=role, parameters=params, name=s or None)

    # ---- graph node -------------------------------------------------------

    @property
    def agent_id(self) -> str:
        if self.kind == "human":
            return f"agent:person:{_slug(self.name)}"
        if self.provider and self.model:
            return f"agent:{self.provider}:{_slug(self.model)}"
        if self.provider:
            return f"agent:{self.provider}"
        return f"agent:{_slug(self.name)}"

    def to_agent_node(self) -> dict:
        node: dict = {
            "@id": self.agent_id,
            "@type": "prov:Person" if self.kind == "human" else "prov:SoftwareAgent",
            "prov:label": self.name,
            "provx:role": self.role,
        }
        if self.provider:
            node["provx:provider"] = self.provider
        if self.model:
            node["provx:model"] = self.model
        if self.model_version:
            node["schema:softwareVersion"] = self.model_version
        if self.organization:
            node["provx:organization"] = self.organization
        if self.parameters:
            node["provx:parameters"] = dict(self.parameters)
        return node

    def to_dict(self) -> dict:
        """Serializable form for report JSON / CLI round-tripping."""
        return {
            "kind": self.kind, "name": self.name, "role": self.role,
            "provider": self.provider, "model": self.model,
            "model_version": self.model_version, "organization": self.organization,
            "parameters": dict(self.parameters),
        }

    @classmethod
    def from_dict(cls, d: Optional[dict]) -> Optional["Actor"]:
        if not d:
            return None
        return cls(
            kind=d.get("kind", "ai"), name=d.get("name", "unknown"),
            role=d.get("role", "translator"), provider=d.get("provider"),
            model=d.get("model"), model_version=d.get("model_version"),
            organization=d.get("organization"), parameters=dict(d.get("parameters") or {}),
        )


@dataclass
class QualityAssessment:
    """A review-model judgement of a specific target version — becomes a
    `QualityAssessment` activity in the graph (parity with content-provenance
    prov_builder.py §4c)."""
    scorer: Actor
    score: Optional[float] = None
    reasons: list[str] = field(default_factory=list)
    note: Optional[str] = None
    assessed_version: Optional[int] = None   # which target vN was judged (default: version-1)
    ts: Optional[str] = None


# ── graph helpers ────────────────────────────────────────────────────────────

def _ensure_graph(existing_graph: Optional[dict]) -> dict:
    """Normalise + self-heal the container. Backfills @context in place
    (independent of whether @graph already exists) the way the original
    build_or_update_prov_graph did."""
    if not existing_graph or not isinstance(existing_graph, dict):
        return {"@context": dict(EXTENDED_PROV_CONTEXT), "@graph": []}
    ctx = existing_graph.get("@context")
    if not ctx:
        existing_graph["@context"] = dict(EXTENDED_PROV_CONTEXT)
    else:
        # merge any missing terms without clobbering operator-customised ones
        for k, v in EXTENDED_PROV_CONTEXT.items():
            ctx.setdefault(k, v)
    existing_graph.setdefault("@graph", [])
    return existing_graph


def _node_by_id(graph: list, node_id: str) -> Optional[dict]:
    return next((n for n in graph if isinstance(n, dict) and n.get("@id") == node_id), None)


def _upsert(graph: list, node: dict) -> dict:
    existing = _node_by_id(graph, node["@id"])
    if existing is None:
        graph.append(node)
        return node
    # merge new keys / refresh structured fields, keep anything already there
    for k, v in node.items():
        if v not in (None, [], {}):
            existing[k] = v
    return existing


def build_prov_graph(
    key: str,
    src: str,
    tgt: str,
    *,
    version: int,
    ts: str,
    translator: Actor,
    operators: Iterable[Actor] = (),
    reviewers: Iterable[Actor] = (),
    existing_graph: Optional[dict] = None,
    activity_type: str = "Translation",
    source_event: Optional[str] = None,
    quality: Optional[QualityAssessment] = None,
    overwrote_agent_id: Optional[str] = None,
    overwrite_reason: Optional[str] = None,
) -> dict:
    """Append one translation step to a key's provenance sub-graph.

    Always appends: a typed Activity + the target vN Entity.
    Dedups: agent nodes, the source Entity.
    Optional: a QualityAssessment activity (from `quality`) with a
    `wasInformedBy` link from the translation activity; a Review activity
    (from `reviewers`); an explicit `overwroteTranslationBy` annotation.

    Legacy keys (`actor`, `generated_by`, `used_source`, `derived_from`) are
    still written alongside the structured ones so pre-parity readers
    (retranslate_flagged.find_actor_for_version, etc.) keep working.
    """
    g = _ensure_graph(existing_graph)
    graph = g["@graph"]
    operators = list(operators)
    reviewers = list(reviewers)

    # ── agents ──────────────────────────────────────────────────────────────
    _upsert(graph, translator.to_agent_node())
    for op in operators:
        _upsert(graph, op.to_agent_node())
    for rv in reviewers:
        _upsert(graph, rv.to_agent_node())
    if quality is not None:
        _upsert(graph, quality.scorer.to_agent_node())

    # ── source entity (dedup) ──────────────────────────────────────────────
    source_id = f"entity:source-{key}"
    _upsert(graph, {"@id": source_id, "@type": "prov:Entity", "prov:value": str(src)})

    # ── translation activity ───────────────────────────────────────────────
    activity_id = f"activity:translation-{key}-{ts}"
    assoc = [{"@id": translator.agent_id}] + [
        {"@id": op.agent_id, "provx:role": "operator"} for op in operators
    ]
    activity_node = {
        "@id": activity_id,
        "@type": "prov:Activity",
        "provx:activityType": activity_type if activity_type in ACTIVITY_TYPES else "Translation",
        "prov:startTime": ts,
        "prov:endTime": ts,
        "actor": {"@id": translator.agent_id},          # legacy single-actor key
        "prov:wasAssociatedWith": assoc,
    }
    if source_event:
        activity_node["provx:sourceEvent"] = source_event

    # ── quality assessment activity (optional) ─────────────────────────────
    if quality is not None:
        q_ts = quality.ts or ts
        q_id = f"activity:qa-{key}-{q_ts}"
        judged_v = quality.assessed_version if quality.assessed_version is not None else max(version - 1, 1)
        q_node = {
            "@id": q_id,
            "@type": "prov:Activity",
            "provx:activityType": "QualityAssessment",
            "prov:startTime": q_ts,
            "prov:wasAssociatedWith": [{"@id": quality.scorer.agent_id}],
            "prov:used": {"@id": f"entity:target-{key}-v{judged_v}"},
        }
        if quality.score is not None:
            q_node["provx:qualityScore"] = quality.score
        if quality.reasons:
            q_node["provx:qaReasons"] = list(quality.reasons)
        if quality.note:
            q_node["provx:qaEvaluatorNote"] = quality.note
        if overwrote_agent_id:
            q_node["provx:overwroteTranslationBy"] = {"@id": overwrote_agent_id}
        if overwrite_reason:
            q_node["provx:overwriteReason"] = overwrite_reason
        _upsert(graph, q_node)
        activity_node["prov:wasInformedBy"] = {"@id": q_id}

    _upsert(graph, activity_node)

    # ── review activity (optional human sign-off) ─────────────────────────
    if reviewers:
        r_id = f"activity:review-{key}-{ts}"
        _upsert(graph, {
            "@id": r_id,
            "@type": "prov:Activity",
            "provx:activityType": "Review",
            "prov:startTime": ts,
            "prov:wasAssociatedWith": [{"@id": rv.agent_id, "provx:role": "reviewer"} for rv in reviewers],
            "prov:used": {"@id": f"entity:target-{key}-v{version}"},
        })

    # ── target entity vN ─────────────────────────────────────────────────
    target_id = f"entity:target-{key}-v{version}"
    target_node = {
        "@id": target_id,
        "@type": "prov:Entity",
        "prov:value": str(tgt),
        "generated_by": {"@id": activity_id},           # legacy
        "prov:wasGeneratedBy": {"@id": activity_id},
        "used_source": {"@id": source_id},              # legacy
        "prov:wasAttributedTo": {"@id": translator.agent_id},
    }
    if version > 1:
        prev = f"entity:target-{key}-v{version - 1}"
        target_node["derived_from"] = {"@id": prev}     # legacy
        target_node["prov:wasRevisionOf"] = {"@id": prev}
    if overwrote_agent_id:
        target_node["provx:overwroteTranslationBy"] = {"@id": overwrote_agent_id}
    if overwrite_reason:
        target_node["provx:overwriteReason"] = overwrite_reason
    graph.append(target_node)   # always a fresh version node

    return g


def build_or_update_prov_graph(key: str, src: str, tgt: str, actor: str, ts: str,
                               version: int, existing_graph: Optional[dict] = None) -> dict:
    """Back-compat shim: the pre-parity positional signature. Callers that pass
    a plain actor label still work — the label is parsed into a structured
    Actor and a superset graph is produced. New code should call
    build_prov_graph() directly with real Actor objects.
    """
    return build_prov_graph(
        key, src, tgt,
        version=version, ts=ts,
        translator=Actor.from_legacy_label(actor),
        existing_graph=existing_graph,
    )


def upgrade_legacy_graph(graph: Optional[dict]) -> dict:
    """Rewrite an old-shape provenance graph in place: backfill @context,
    replace bare `{"@type":"prov:Agent","prov:label":"Translation Engine
    Profile: X"}` nodes with structured SoftwareAgent nodes, and add the
    structured relation keys onto activity/entity nodes. Idempotent.

    Used by scripts/upgrade_xliff_prov.py for the one-off backfill and safe
    to call on every parse.
    """
    g = _ensure_graph(graph)
    nodes = g["@graph"]

    # 1. upgrade agent nodes, remembering id remaps
    remap: dict[str, str] = {}
    for i, node in enumerate(list(nodes)):
        if not isinstance(node, dict):
            continue
        is_agent = node.get("@type") in ("prov:Agent", "prov:SoftwareAgent", "prov:Person")
        if not is_agent:
            continue
        label = node.get("prov:label", "")
        already_structured = "provx:provider" in node or "provx:role" in node
        if node.get("@type") == "prov:Person" or (already_structured and "Translation Engine Profile:" not in label):
            continue
        actor = Actor.from_legacy_label(label or node.get("@id", ""))
        new_node = actor.to_agent_node()
        if new_node["@id"] != node.get("@id"):
            remap[node.get("@id")] = new_node["@id"]
        nodes[i] = new_node

    # 2. de-dup agents that collapsed onto the same new @id
    seen: dict[str, dict] = {}
    deduped: list = []
    for node in nodes:
        if isinstance(node, dict) and node.get("@type") in ("prov:SoftwareAgent", "prov:Person"):
            nid = node["@id"]
            if nid in seen:
                for k, v in node.items():
                    seen[nid].setdefault(k, v)
                continue
            seen[nid] = node
        deduped.append(node)
    nodes = deduped
    g["@graph"] = nodes

    # 3. fix references + add structured relation keys
    def _ref(value):
        if isinstance(value, dict) and value.get("@id") in remap:
            return {**value, "@id": remap[value["@id"]]}
        return value

    for node in nodes:
        if not isinstance(node, dict):
            continue
        ntype = node.get("@type")
        if ntype == "prov:Activity":
            if "actor" in node:
                node["actor"] = _ref(node["actor"])
                node.setdefault("prov:wasAssociatedWith", [{"@id": node["actor"]["@id"]}])
            node.setdefault("provx:activityType", "Translation")
        elif ntype == "prov:Entity" and node.get("@id", "").startswith("entity:target-"):
            if "generated_by" in node:
                node["generated_by"] = _ref(node["generated_by"])
                node.setdefault("prov:wasGeneratedBy", dict(node["generated_by"]))
            if "derived_from" in node:
                node["derived_from"] = _ref(node["derived_from"])
                node.setdefault("prov:wasRevisionOf", dict(node["derived_from"]))
            ow = node.get("provx:overwroteTranslationBy") or node.get("prov:overwroteTranslationBy")
            if isinstance(ow, str) and ow.replace("Translation Engine Profile: ", "").strip():
                a = Actor.from_legacy_label(ow)
                node["provx:overwroteTranslationBy"] = {"@id": a.agent_id}
                _upsert(nodes, a.to_agent_node())
    return g


# ── XLIFF read / write (moved verbatim from translate_sync.py) ────────────────

def parse_existing_xliff_with_prov(path: Path) -> dict:
    res = {"strings": {}, "global_prov": {"@context": {}, "@graph": []}}
    if not path.exists():
        return res
    try:
        tree = ET.parse(path)
        root = tree.getroot()
        ns = {"xliff": XLIFF_NS}
        for tu in root.findall(".//xliff:trans-unit", ns):
            k = tu.get("id")
            note_el = tu.find("xliff:note", ns)
            n_txt = note_el.text if note_el is not None else ""
            v = 1
            if "Version: " in n_txt:
                try:
                    v = int(n_txt.split("Version: ")[1].split()[0])
                except Exception:
                    pass
            status_txt = None
            if "Status: " in n_txt:
                try:
                    status_txt = n_txt.split("Status: ")[1].split(" |")[0].strip()
                except Exception:
                    pass
            source_el = tu.find("xliff:source", ns)
            src_txt = source_el.text if source_el is not None and source_el.text is not None else None
            res["strings"][k] = {
                "version": v,
                "approved": tu.get("approved") == "yes",
                "source": src_txt,
                "status": status_txt,
            }
        m_el = root.find('.//xliff:meta[@type="provenance-graph"]', ns)
        if m_el is not None and m_el.text and m_el.text.strip():
            try:
                parsed_prov = json.loads(m_el.text.strip())
                if isinstance(parsed_prov, dict):
                    res["global_prov"] = parsed_prov
            except json.JSONDecodeError:
                pass
    except Exception as e:
        print(f"⚠️  Parsing warning for XLIFF: {e}")
    return res


def write_xliff_prov_file(path: Path, lang: str, en_flat_strings: dict, target_flat_strings: dict,
                          meta_tracking: dict, prov_graph: dict):
    ET.register_namespace("", XLIFF_NS)
    root = ET.Element(f"{{{XLIFF_NS}}}xliff", version="1.2")
    file_el = ET.SubElement(root, f"{{{XLIFF_NS}}}file", {
        "source-language": SOURCE_LANG_CODE, "target-language": lang.lower(),
        "datatype": "plaintext", "original": f"{lang.lower()}.json",
    })
    header_el = ET.SubElement(file_el, "header")
    meta_group = ET.SubElement(header_el, "meta-group", category="w3c-prov-jsonld")
    meta_prov_node = ET.SubElement(meta_group, "meta", type="provenance-graph")
    meta_prov_node.text = str(json.dumps(prov_graph, ensure_ascii=False, indent=2)) if isinstance(prov_graph, dict) else "{}"
    body_el = ET.SubElement(file_el, "body")
    for k, src in en_flat_strings.items():
        tgt = target_flat_strings.get(k, "")
        m = meta_tracking.get(k, {"version": 1, "status": "new_translation"})
        tu = ET.SubElement(body_el, "trans-unit", {"id": k, "approved": "yes" if m["status"] == "approved" else "no"})
        ET.SubElement(tu, "source").text = str(src)
        ET.SubElement(tu, "target").text = str(tgt)
        ET.SubElement(tu, "note").text = str(f"Status: {m['status']} | Version: {m['version']}")
    raw_xml_bytes = ET.tostring(root, encoding="utf-8")
    try:
        parsed = minidom.parseString(raw_xml_bytes)
        with open(path, "w", encoding="utf-8") as f:
            f.write(parsed.toprettyxml(indent="  "))
    except Exception:
        with open(path, "wb") as f:
            f.write(b'<?xml version="1.0" encoding="utf-8"?>\n' + raw_xml_bytes)


# ── self-test ────────────────────────────────────────────────────────────────

def _selftest() -> None:
    """Round-trip + legacy-upgrade smoke test, no network, no files."""
    ok = True

    # 1. shim produces a superset graph with the legacy keys intact
    g = build_or_update_prov_graph("landing.foo", "Hello", "Hola",
                                   "OLLAMA-mistral-nemo:12b [Profile: Application UI Strings | Temp: 0.0]",
                                   "2026-09-02T00:00:00+00:00", 1)
    graph = g["@graph"]
    agent = _node_by_id(graph, "agent:OLLAMA:mistral-nemo_12b")
    assert agent and agent["@type"] == "prov:SoftwareAgent", "shim agent node"
    assert agent["provx:provider"] == "OLLAMA" and agent["provx:model"] == "mistral-nemo:12b", agent
    act = _node_by_id(graph, "activity:translation-landing.foo-2026-09-02T00:00:00+00:00")
    assert act["actor"]["@id"] == "agent:OLLAMA:mistral-nemo_12b", "legacy actor key"
    assert act["provx:activityType"] == "Translation"
    tgt = _node_by_id(graph, "entity:target-landing.foo-v1")
    assert tgt["generated_by"]["@id"] == act["@id"] and tgt["prov:value"] == "Hola"
    print("  [ok] shim -> superset graph")

    # 2. structured redrive: translator + reviewer model + operator + quality
    op = Actor.human("Paul Cerda", role="operator", organization="Peripateticware")
    scorer = Actor.ai("TOWER", "TowerInstruct-7B-v0.1-Q4_K_M", role="reviewer", organization="Unbabel",
                      parameters={"quant": "Q4_K_M", "n_ctx": 2048})
    redriver = Actor.ai("MICROSOFT", "azure-cognitive-v3", role="redriver",
                        parameters={"tier": "F0"})
    g = build_prov_graph(
        "landing.foo", "Hello", "Buenos días",
        version=2, ts="2026-09-02T01:00:00+00:00",
        translator=redriver, operators=[op],
        source_event="redrive",
        quality=QualityAssessment(scorer=scorer, score=12, reasons=["placeholder_broken"],
                                  note="critical: {{name}} dropped", assessed_version=1),
        overwrote_agent_id="agent:OLLAMA:mistral-nemo_12b",
        overwrite_reason="qa_score=12: placeholder_broken",
        existing_graph=g,
    )
    graph = g["@graph"]
    assert _node_by_id(graph, "agent:person:Paul_Cerda")["@type"] == "prov:Person"
    assert _node_by_id(graph, "agent:TOWER:TowerInstruct-7B-v0.1-Q4_K_M")["provx:organization"] == "Unbabel"
    qa = _node_by_id(graph, "activity:qa-landing.foo-2026-09-02T01:00:00+00:00")
    assert qa["provx:qualityScore"] == 12 and qa["provx:qaReasons"] == ["placeholder_broken"]
    assert qa["prov:used"]["@id"] == "entity:target-landing.foo-v1"
    act2 = _node_by_id(graph, "activity:translation-landing.foo-2026-09-02T01:00:00+00:00")
    assert act2["prov:wasInformedBy"]["@id"] == qa["@id"], "redrive wasInformedBy QA"
    assert {"@id": "agent:person:Paul_Cerda", "provx:role": "operator"} in act2["prov:wasAssociatedWith"]
    tgt2 = _node_by_id(graph, "entity:target-landing.foo-v2")
    assert tgt2["prov:wasRevisionOf"]["@id"] == "entity:target-landing.foo-v1"
    assert tgt2["provx:overwroteTranslationBy"]["@id"] == "agent:OLLAMA:mistral-nemo_12b"
    print("  [ok] structured redrive graph (model + reviewer model + operator + quality + revision chain)")

    # 3. legacy upgrade
    legacy = {
        "@context": {},
        "@graph": [
            {"@id": "agent:OLLAMA-mistral_Profile__X", "@type": "prov:Agent",
             "prov:label": "Translation Engine Profile: OLLAMA-mistral [Profile: X | Temp: 0.3]"},
            {"@id": "activity:translation-k-T", "@type": "prov:Activity", "prov:startTime": "T",
             "actor": {"@id": "agent:OLLAMA-mistral_Profile__X"}},
            {"@id": "entity:source-k", "@type": "prov:Entity", "prov:value": "s"},
            {"@id": "entity:target-k-v1", "@type": "prov:Entity", "prov:value": "t",
             "generated_by": {"@id": "activity:translation-k-T"}, "used_source": {"@id": "entity:source-k"}},
        ],
    }
    up = upgrade_legacy_graph(legacy)
    a = _node_by_id(up["@graph"], "agent:OLLAMA:mistral")
    assert a and a["provx:provider"] == "OLLAMA", "legacy agent upgraded"
    act = _node_by_id(up["@graph"], "activity:translation-k-T")
    assert act["actor"]["@id"] == "agent:OLLAMA:mistral", "reference remapped"
    assert act["prov:wasAssociatedWith"] == [{"@id": "agent:OLLAMA:mistral"}]
    assert up["@context"].get("provx") == PROVX, "context backfilled"
    up2 = upgrade_legacy_graph(json.loads(json.dumps(up)))   # idempotent
    assert json.dumps(up, sort_keys=True) == json.dumps(up2, sort_keys=True), "upgrade not idempotent"
    print("  [ok] legacy graph upgrade (idempotent)")

    print("localization_provenance self-test: PASS" if ok else "FAIL")


if __name__ == "__main__":
    import sys
    if "--selftest" in sys.argv:
        _selftest()
    else:
        print(__doc__)
