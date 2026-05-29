#!/usr/bin/env python3
# frontend/scripts/translate_sync.py
import argparse
from datetime import datetime, timezone
import json
import os
import re
import time
import subprocess
from pathlib import Path
import xml.etree.ElementTree as ET
import xml.dom.minidom as minidom
import requests

# Microsoft Translator Endpoint Configuration
MS_TRANSLATOR_REGION = os.getenv("MS_TRANSLATOR_REGION", "global")
MS_TRANSLATOR_ENDPOINT = "https://api.cognitive.microsofttranslator.com"

LOCALES_DIR = Path(__file__).parent.parent / "public" / "locales"
SOURCE_LANG_CODE = "en"


def extract_list_from_json(parsed_obj, texts: list[str]) -> list[str] | None:
    """
    Recursively searches a parsed JSON structure for any list matching 
    the exact expected length. Perfect for handling models that wrap 
    arrays in objects like {"translations": [...]}, map key-values,
    or map index strings.
    """
    expected_len = len(texts)
    if isinstance(parsed_obj, list) and len(parsed_obj) == expected_len:
        return [str(x) for x in parsed_obj]
    if isinstance(parsed_obj, dict):
        # Case A: Dict with expected_len keys. Keys might be original strings or indices.
        if len(parsed_obj) == expected_len:
            # 1. Try mapping keys to texts normalized
            key_map = {str(k).strip().lower(): str(v) for k, v in parsed_obj.items()}
            mapped_results = []
            for t in texts:
                t_norm = str(t).strip().lower()
                if t_norm in key_map:
                    mapped_results.append(key_map[t_norm])
            if len(mapped_results) == expected_len:
                return mapped_results
            
            # 2. Try sorting keys numerically if they look like indices
            try:
                sorted_keys = sorted(parsed_obj.keys(), key=lambda x: int(re.sub(r'\D', '', str(x))))
                if len(sorted_keys) == expected_len:
                    return [str(parsed_obj[k]) for k in sorted_keys]
            except Exception:
                pass
            
            # 3. Fallback: Return raw values in order of iteration
            return [str(v) for v in parsed_obj.values()]
        
        # Case B: Nested search in dict values
        for val in parsed_obj.values():
            res = extract_list_from_json(val, texts)
            if res:
                return res
    return None


def parse_json_defensively(cleaned_text: str, texts: list[str]) -> list[str]:
    """
    Defensively parses JSON strings, searching for arrays, objects, or 
    even raw quotes to extract translated tokens robustly.
    """
    text = cleaned_text.strip()
    expected_len = len(texts)
    
    # Try loading directly
    try:
        parsed = json.load(text) if hasattr(text, "read") else json.loads(text)
        extracted = extract_list_from_json(parsed, texts)
        if extracted:
            return extracted
    except json.JSONDecodeError:
        pass

    # Try searching for array outermost bounds
    array_match = re.search(r'\[\s*.*?\s*\]', text, re.DOTALL)
    if array_match:
        try:
            parsed = json.loads(array_match.group(0))
            extracted = extract_list_from_json(parsed, texts)
            if extracted:
                return extracted
        except json.JSONDecodeError:
            pass

    # Try searching for object outermost bounds
    brace_match = re.search(r'\{\s*.*?\s*\}', text, re.DOTALL)
    if brace_match:
        try:
            parsed = json.loads(brace_match.group(0))
            extracted = extract_list_from_json(parsed, texts)
            if extracted:
                return extracted
        except json.JSONDecodeError:
            pass
    
    # Line-by-line fallback regex extraction
    strings = re.findall(r'"([^"\\]*(?:\\.[^"\\]*)*)"', text)
    if len(strings) == expected_len:
        return strings
        
    raise ValueError(f"Could not extract a JSON list of expected length ({expected_len}) from LLM response.")


def classify_key_and_get_config(key: str, text: str) -> tuple[str, str, float]:
    """
    Analyzes translation keys dynamically and maps them to specialized
    temperatures and instructions matching their structural role.
    """
    k_lower = key.lower()
    text_len = len(text)
    
    # Category 1: Technical & Legal Documentation (TOS, Privacy Policies, COPPA/FERPA sections)
    if any(x in k_lower for x in ["privacy", "terms", "policy", "tos", "coppa", "ferpa", "audit", "config", "legal", "clause", "agreement"]) or text_len > 250:
        return (
            "Technical/Legal Documentation",
            "Maintain technical accuracy and engineering or legal syntax clarity. Use official industry standard terms for data architectures, permissions, legal terms, and compliance metrics.",
            0.1
        )
    
    # Category 2: Marketing & Highly Creative Copy (Hero modules, testimonials, tour guides)
    if any(x in k_lower for x in ["marketing", "hero", "feature", "testimonial", "pricing", "landing", "tour", "why_us", "benefits"]):
        return (
            "Marketing/Creative Content",
            "Focus on natural marketing flow, emotional connection, and brand resonance. Do not translate word-for-word if a localized idiom works better.",
            0.6
        )
        
    # Category 3: Concise Application UI Strings (Buttons, small headers, short labels, alerts)
    if text_len < 20 or any(x in k_lower for x in ["button", "label", "placeholder", "nav", "auth", "common", "error", "tooltip", "menu", "tab", "action", "status"]):
        return (
            "Application UI Strings",
            "Be extremely concise, literal, and direct. Match the brief structure of UI buttons, labels, and placeholders perfectly.",
            0.0
        )
        
    # Category 4: Balanced Fallback
    return (
        "General Balanced Content",
        "Provide a balanced, highly natural software translation matching typical business-platform conventions.",
        0.3
    )


class UniversalOrchestrator:
    def __init__(self, provider: str, content_type: str, style: str):
        self.provider = provider.upper()
        self.content_type = content_type
        self.style = style
        self.last_llm_call_time = 0.0  # Tracks global pacing timeline
        
        # Safe default values which can be dynamically overriden in Scalpel Mode
        style_instruction = self._get_style_instruction(style)
        temperature = self._get_temperature(style)
        
        # Configures baseline values
        self.set_dynamic_override(content_type, style_instruction, temperature)
        
        # Initialize selected environment parameters safely with live fallback key prompts
        if self.provider == "DEEPL":
            import deepl
            key = os.getenv("DEEPL_AUTH_KEY")
            if not key:
                key = input("🔑 DEEPL_AUTH_KEY not found in environment. Please paste your key: ").strip()
                if not key: raise ValueError("Missing DEEPL_AUTH_KEY token.")
            self.client = deepl.Translator(key)
            self.active_model = "DeepL-API"
            
        elif self.provider == "CLAUDE":
            from anthropic import Anthropic
            key = os.getenv("ANTHROPIC_API_KEY")
            if not key:
                key = input("🔑 ANTHROPIC_API_KEY not found in environment. Please paste your key: ").strip()
                if not key: raise ValueError("Missing ANTHROPIC_API_KEY token.")
            self.client = Anthropic(api_key=key)
            self.active_model = os.getenv("CLAUDE_MODEL", "claude-3-5-sonnet-20241022")
            
        elif self.provider == "GEMINI":
            from google import genai
            key = os.getenv("GEMINI_API_KEY")
            if not key:
                key = input("🔑 GEMINI_API_KEY not found in environment. Please paste your key: ").strip()
                if not key: raise ValueError("Missing GEMINI_API_KEY token.")
            self.client = genai.Client(api_key=key)
            # Default upgraded to gemini-2.5-flash to fix the v1beta 404 deprecation error
            self.active_model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
            
        elif self.provider == "GOOGLE_TRANSLATE":
            from deep_translator import GoogleTranslator
            self.client = GoogleTranslator
            self.active_model = "Google-Translate-Classic-v4"
            
        elif self.provider == "MICROSOFT":
            key = os.getenv("MS_TRANSLATOR_KEY")
            if not key or key == "YOUR_MICROSOFT_AZURE_KEY":
                key = input("🔑 MS_TRANSLATOR_KEY not found in environment. Please paste your key: ").strip()
                if not key: raise ValueError("Missing MS_TRANSLATOR_KEY token.")
            self.ms_key = key
            self.active_model = "Azure-Cognitive-v3"
            
        elif self.provider == "OLLAMA":
            self.active_model = os.getenv("OLLAMA_MODEL_TEXT", "mistral")

    def _get_style_instruction(self, style: str) -> str:
        if "Concise & Accurate" in style:
            return "Be extremely concise, literal, and direct. Match the brief structure of UI buttons, labels, and placeholders perfectly."
        elif "Creative & Fluent" in style:
            return "Focus on natural marketing flow, emotional connection, and brand resonance. Do not translate word-for-word if a localized idiom works better."
        elif "Technical Precision" in style:
            return "Maintain technical accuracy and engineering syntax clarity. Use official industry standard terms for data architectures, permissions, and compliance metrics."
        else:
            return "Provide a balanced, highly natural software translation matching typical business-platform conventions."

    def _get_temperature(self, style: str) -> float:
        if "Concise & Accurate" in style:
            return 0.0
        elif "Creative & Fluent" in style:
            return 0.6
        elif "Technical Precision" in style:
            return 0.1
        else:
            return 0.3

    def set_dynamic_override(self, content_type: str, style_instruction: str, temperature: float):
        """Allows dynamic configuration of system prompts and temperatures per classified batch."""
        self.content_type = content_type
        self.temperature = temperature
        self.system_prompt = (
            f"You are an expert localization engine specialized in processing software context fields type: '{content_type}'.\n"
            f"Mandatory Style Guide: {style_instruction}\n"
            f"CRITICAL RULES:\n"
            f"1. Preserve template variables (e.g. {{count}}, %s, $t(...)) exactly with no syntax alterations.\n"
            f"2. Provide ONLY the translated value string text. Never include Markdown fences, quotes, notes, formatting, or introductions.\n"
            f"3. Do not append explanation copy or repeat the input key text framework back."
        )

    def get_method_string(self) -> str:
        return f"{self.provider}-{self.active_model} [Profile: {self.content_type} | Temp: {self.temperature}]"

    def _pace_llm_call(self):
        """Paces API calls to LLM providers to strictly stay under Rate Limits (max 13 requests per minute)."""
        if self.provider in ["OLLAMA", "CLAUDE", "GEMINI"]:
            elapsed = time.time() - self.last_llm_call_time
            min_interval = 4.5  # Guarantees staying comfortably under the 15 RPM threshold
            if elapsed < min_interval:
                time.sleep(min_interval - elapsed)
            self.last_llm_call_time = time.time()

    def retry_call(self, api_func):
        """Exponential backoff scheduler retrying on transient errors with clean pacing and user notifications."""
        delays = [2, 4, 8, 16, 32]
        for attempt, delay in enumerate(delays):
            try:
                return api_func()
            except Exception as e:
                err_str = str(e).upper()
                is_rate_limit = any(x in err_str for x in ["429", "RESOURCE_EXHAUSTED", "RATE_LIMIT", "QUOTA", "LIMIT EXCEEDED"])
                if is_rate_limit:
                    sleep_time = delay
                    # Dynamically parse a literal wait instruction if the engine tells us to wait longer
                    match = re.search(r'(?:retry in|retryDelay[:\s"\'\{\}]+|after\s+)(\d+\.?\d*)', str(e), re.IGNORECASE)
                    if match:
                        sleep_time = int(float(match.group(1))) + 2
                    print(f"\n⏳ [Rate Limit Detected] Pausing for {sleep_time}s to let the API window reset...")
                    time.sleep(sleep_time)
                else:
                    print(f"\n⚠️  [API Warning] Attempt {attempt + 1} failed with error: {e}. Retrying in {delay}s...")
                    time.sleep(delay)
        # Final, unshielded attempts which throws explicit errors downstream if depleted
        return api_func()

    def clean_llm_chatter(self, raw_output: str) -> str:
        """Defensive string filter matrix to wipe clean any conversational chatter or markdown fences."""
        text = raw_output.strip()
        if not text:
            return ""
        if text.startswith("```"):
            text = re.sub(r"^```[a-zA-Z]*\n|```$", "", text).strip()
        if (text.startswith('"') and text.endswith('"')) or (text.startswith("'") and text.endswith("'")):
            text = text[1:-1].strip()
        chatter_prefixes = [
            r"^here\s+is\s+the\s+translation:?", r"^translation:?", 
            r"^spanish:?", r"^french:?", r"^localized\s+text:?"
        ]
        for prefix in chatter_prefixes:
            text = re.sub(prefix, "", text, flags=re.IGNORECASE).strip()
        return text

    def translate_single(self, text: str, lang_name: str, lang_code: str) -> str:
        """Fallback translation loop for generative LLM providers requiring sequential prompts."""
        prompt = (
            f"{self.system_prompt}\n\n"
            f"Target Language: Translate directly into fluent, natural {lang_name} (Code: '{lang_code.lower()}').\n"
            f"Input Value String To Translate:\n\"{text}\""
        )
        
        self._pace_llm_call()  # Force safe chronological separation
        
        if self.provider == "CLAUDE":
            msg = self.client.messages.create(
                model=self.active_model, max_tokens=1024, system=self.system_prompt,
                temperature=self.temperature,
                messages=[{"role": "user", "content": f"Translate this text directly: {text}"}]
            )
            return self.clean_llm_chatter(msg.content[0].text)
            
        elif self.provider == "GEMINI":
            res = self.client.models.generate_content(
                model=self.active_model, contents=prompt,
                config={"system_instruction": self.system_prompt, "temperature": self.temperature}
            )
            return self.clean_llm_chatter(res.text)
            
        elif self.provider == "OLLAMA":
            # Direct API request to avoid CLI escape crashes
            try:
                url = "http://localhost:11434/api/generate"
                payload = {
                    "model": self.active_model,
                    "prompt": prompt,
                    "system": self.system_prompt,
                    "options": {
                        "temperature": float(self.temperature)
                    },
                    "stream": False
                }
                res = requests.post(url, json=payload, timeout=120)
                res.raise_for_status()
                return self.clean_llm_chatter(res.json().get("response", ""))
            except Exception:
                # Fallback to CLI using standard input (stdin) to prevent WinError 206 command-line limits
                cmd = ["ollama", "run", self.active_model]
                result = subprocess.run(cmd, input=prompt, capture_output=True, text=True, encoding="utf-8", check=True)
                return self.clean_llm_chatter(result.stdout)
            
        return text

    def translate_llm_batch(self, texts: list[str], lang_name: str, lang_code: str) -> list[str]:
        """Translates multiple texts in a single roundtrip to bypass strict free tier limitations."""
        prompt = (
            f"{self.system_prompt}\n\n"
            f"Target Language: Translate directly into fluent, natural {lang_name} (Code: '{lang_code.lower()}').\n"
            f"You are translating a batch of strings. You MUST return a JSON object with a single key 'translations' containing the list of translated strings matching the input array order and size exactly.\n"
            f"Example output structure:\n{{\"translations\": [\"translation_1\", \"translation_2\", \"translation_3\"]}}\n\n"
            f"Input JSON Array of strings to translate:\n{json.dumps(texts, ensure_ascii=False)}"
        )
        
        def run_call():
            self._pace_llm_call()  # Ensure batch calls are spaced
            if self.provider == "CLAUDE":
                msg = self.client.messages.create(
                    model=self.active_model, max_tokens=4096, system=self.system_prompt,
                    temperature=self.temperature,
                    messages=[{"role": "user", "content": prompt}]
                )
                return msg.content[0].text
            elif self.provider == "GEMINI":
                res = self.client.models.generate_content(
                    model=self.active_model, contents=prompt,
                    config={
                        "system_instruction": self.system_prompt, 
                        "temperature": self.temperature,
                        "response_mime_type": "application/json"
                    }
                )
                return res.text
            elif self.provider == "OLLAMA":
                # Direct API request to avoid CLI escape crashes
                try:
                    url = "http://localhost:11434/api/generate"
                    payload = {
                        "model": self.active_model,
                        "prompt": prompt,
                        "system": self.system_prompt,
                        "options": {
                            "temperature": float(self.temperature)
                        },
                        "stream": False,
                        "format": "json"  # Enforces structured output formatting natively
                    }
                    res = requests.post(url, json=payload, timeout=300)
                    res.raise_for_status()
                    return res.json().get("response", "")
                except Exception:
                    # Fallback to CLI using standard input (stdin) to prevent WinError 206 command-line limits
                    cmd = ["ollama", "run", self.active_model]
                    result = subprocess.run(cmd, input=prompt, capture_output=True, text=True, encoding="utf-8", check=True)
                    return result.stdout
            return ""

        try:
            # Execute with structured exponential retries
            raw_response = self.retry_call(run_call)
            cleaned = self.clean_llm_chatter(raw_response)
            
            # Use robust defensive JSON parser to locate the list even if nested in objects
            return parse_json_defensively(cleaned, texts)
        except Exception as e:
            # Gracefully self-heal: Fallback sequentially if batch compilation failed
            print(f"   ⚠️  Batch compilation failed ({e}). Self-healing with paced sequential fallback...")
            results = []
            for text in texts:
                translated = self.retry_call(lambda: self.translate_single(text, lang_name, lang_code))
                results.append(translated)
            return results

    def translate_batch(self, texts: list[str], lang_name: str, lang_code: str) -> list[str]:
        """Highly optimized translation pipeline that groups multiple text blocks to minimize API requests."""
        if not texts:
            return []

        if self.provider == "GOOGLE_TRANSLATE":
            # Uses deep_translator to securely fetch grouped translations safely under Python 3.13
            translator = self.client(source='en', target=lang_code.lower())
            return self.retry_call(lambda: translator.translate_batch(texts))

        elif self.provider == "DEEPL":
            # Automatically batch list inputs to minimize roundtrips
            results = self.retry_call(lambda: self.client.translate_text(texts, source_lang="EN", target_lang=lang_code.upper()))
            return [res.text for res in results]

        elif self.provider == "MICROSOFT":
            # Groups up to 100 elements in a single POST body
            path = '/translate?api-version=3.0'
            params = f'&from=en&to={lang_code.lower()}'
            constructed_url = MS_TRANSLATOR_ENDPOINT + path + params
            headers = {
                'Ocp-Apim-Subscription-Key': self.ms_key,
                'Ocp-Apim-Subscription-Region': MS_TRANSLATOR_REGION,
                'Content-type': 'application/json'
            }
            body = [{'text': t} for t in texts]
            request = requests.post(constructed_url, headers=headers, json=body)
            request.raise_for_status()
            response = request.json()
            return [res['translations'][0]['text'] for res in response]

        # For Generative AI models, optimize via structured list prompts
        return self.translate_llm_batch(texts, lang_name, lang_code)


# =====================================================================
# NESTING UTILITY MAPS
# =====================================================================
def flatten_json(nested_dict: dict, separator: str = '.') -> dict:
    flat_dict = {}
    def recurse(current_item, parent_key=''):
        if isinstance(current_item, dict):
            for k, v in current_item.items():
                new_key = f"{parent_key}{separator}{k}" if parent_key else k
                recurse(v, new_key)
        else: flat_dict[parent_key] = current_item
    recurse(nested_dict)
    return flat_dict

def unflatten_json(flat_dict: dict, separator: str = '.') -> dict:
    nested_dict = {}
    for composite_key, value in flat_dict.items():
        parts = composite_key.split(separator)
        current = nested_dict
        for i, part in enumerate(parts[:-1]):
            if part not in current or not isinstance(current[part], dict): current[part] = {}
            current = current[part]
        current[parts[-1]] = value
    return nested_dict

# =====================================================================
# SYSTEM PARSERS & WRITERS
# =====================================================================
def load_json(path: Path) -> dict:
    if not path.exists(): return {}
    with open(path, "r", encoding="utf-8") as f:
        try: return json.load(f)
        except json.JSONDecodeError: return {}

def save_json(path: Path, data: dict):
    with open(path, "w", encoding="utf-8") as f: json.dump(data, f, ensure_ascii=False, indent=2)

def get_timestamp() -> str: return datetime.now(timezone.utc).isoformat()

def build_or_update_prov_graph(key: str, src: str, tgt: str, actor: str, ts: str, version: int, existing_graph: dict = None) -> dict:
    if not existing_graph or not isinstance(existing_graph, dict) or "@graph" not in existing_graph:
        existing_graph = {"@context": {"prov": "[http://www.w3.org/ns/prov#](http://www.w3.org/ns/prov#)", "xsd": "[http://www.w3.org/2001/XMLSchema#](http://www.w3.org/2001/XMLSchema#)", "actor": "prov:wasAssociatedWith", "generated_by": "prov:wasGeneratedBy", "used_source": "prov:used", "derived_from": "prov:wasDerivedFrom"}, "@graph": []}
    g_list = existing_graph["@graph"]
    agent_id = f"agent:{actor.replace(' ', '_').replace(':', '_').replace('[', '').replace(']', '')}"
    if not any(isinstance(node, dict) and node.get("@id") == agent_id for node in g_list):
        g_list.append({"@id": agent_id, "@type": "prov:Agent", "prov:label": f"Translation Engine Profile: {actor}"})
    activity_id = f"activity:translation-{key}-{ts}"
    g_list.append({"@id": activity_id, "@type": "prov:Activity", "prov:startTime": ts, "actor": {"@id": agent_id}})
    source_entity_id = f"entity:source-{key}"
    if not any(isinstance(node, dict) and node.get("@id") == source_entity_id for node in g_list):
        g_list.append({"@id": source_entity_id, "@type": "prov:Entity", "prov:value": str(src)})
    target_entity_id = f"entity:target-{key}-v{version}"
    target_node = {"@id": target_entity_id, "@type": "prov:Entity", "prov:value": str(tgt), "generated_by": {"@id": activity_id}, "used_source": {"@id": source_entity_id}}
    if version > 1: target_node["derived_from"] = {"@id": f"entity:target-{key}-v{version-1}"}
    g_list.append(target_node)
    return existing_graph

def parse_existing_xliff_with_prov(path: Path) -> dict:
    res = {"strings": {}, "global_prov": {"@context": {}, "@graph": []}}
    if not path.exists(): return res
    try:
        tree = ET.parse(path)
        root = tree.getroot()
        ns = {'xliff': 'urn:oasis:names:tc:xliff:document:1.2'}
        for tu in root.findall('.//xliff:trans-unit', ns):
            k = tu.get('id')
            note_el = tu.find('xliff:note', ns)
            n_txt = note_el.text if note_el is not None else ""
            v = 1
            if "Version: " in n_txt:
                try: v = int(n_txt.split("Version: ")[1].split()[0])
                except: pass
            res["strings"][k] = {"version": v, "approved": tu.get("approved") == "yes"}
        m_el = root.find('.//xliff:meta[@type="provenance-graph"]', ns)
        if m_el is not None and m_el.text and m_el.text.strip():
            try:
                parsed_prov = json.loads(m_el.text.strip())
                if isinstance(parsed_prov, dict): res["global_prov"] = parsed_prov
            except json.JSONDecodeError: pass
    except Exception as e: print(f"⚠️  Parsing warning for XLIFF: {e}")
    return res

def write_xliff_prov_file(path: Path, lang: str, en_flat_strings: dict, target_flat_strings: dict, meta_tracking: dict, prov_graph: dict):
    root = ET.Element("xliff", version="1.2", xmlns="urn:oasis:names:tc:xliff:document:1.2")
    file_el = ET.SubElement(root, "file", {"source-language": SOURCE_LANG_CODE, "target-language": lang.lower(), "datatype": "plaintext", "original": "landing.json"})
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
        with open(path, "w", encoding="utf-8") as f: f.write(parsed.toprettyxml(indent="  "))
    except Exception:
        with open(path, "wb") as f: f.write(b'<?xml version="1.0" encoding="utf-8"?>\n' + raw_xml_bytes)

def get_target_languages() -> list[str]:
    languages = []
    if not LOCALES_DIR.exists(): return languages
    for folder in LOCALES_DIR.iterdir():
        if folder.is_dir() and folder.name != "en":
            lang_map = {"es": "Spanish", "fr": "French", "de": "German", "ja": "Japanese", "ar": "Arabic", "he": "Hebrew", "it": "Italian", "zh": "Chinese", "tu": "Turkish", "pt-br": "Portuguese"}
            languages.append((folder.name.upper(), lang_map.get(folder.name.lower(), folder.name.upper())))
    return languages

# =====================================================================
# INTERACTIVE SETUP WIZARD
# =====================================================================
def run_interactive_wizard() -> tuple[str, str, str, str, bool]:
    print("=" * 60)
    print("🌐  Peripateticware Advanced Localization Wizard")
    print("=" * 60)
    
    print("🤖  Select your active Translation Provider engine:")
    engines = ["OLLAMA", "CLAUDE", "GEMINI", "DEEPL", "GOOGLE_TRANSLATE", "MICROSOFT"]
    for idx, eng in enumerate(engines, start=1):
        label = eng + " (Classic Translation Engine)" if "DEEPL" in eng or "GOOGLE" in eng or "MICROSOFT" in eng else eng + " (Generative LLM Model)"
        print(f"  [{idx}] {label}")
        
    eng_choice = input("👉 Enter provider number (1-6) [default: OLLAMA]: ").strip()
    provider = engines[int(eng_choice) - 1] if (eng_choice.isdigit() and 1 <= int(eng_choice) <= 6) else "OLLAMA"

    print("\n🔄  Select translation execution mode:")
    print("  [1] Incremental Sync (Skip already translated keys) [Recommended]")
    print("  [2] Clean Reset (Wipe existing target locale keys and translate everything from scratch)")
    exec_choice = input("👉 Enter choice number (1-2) [default: 1]: ").strip()
    reset_languages = True if exec_choice == "2" else False

    print("\n📦  Select translation orchestration mode:")
    print("  [1] Smart Scalpel Mode (Dynamic Routing based on key namespaces & text length) [Recommended]")
    print("  [2] Global Override Machete Mode (Apply one style to all strings)")
    orch_choice = input("👉 Enter choice number (1-2) [default: 1]: ").strip()
    
    if orch_choice == "2":
        mode = "MACHETE"
        print("\n📦  What type of material are you currently processing?")
        content_types = [
            "Application UI Strings (Keys, Labels, Placeholders)",
            "Marketing Content (Landing Pages, Features, Testimonials)",
            "Legal & Policy Documentation (Privacy Page, COPPA, FERPA)",
            "General Content Assets"
        ]
        for idx, c_type in enumerate(content_types, start=1):
            print(f"  [{idx}] {c_type}")
        ct_choice = input("👉 Enter choice number (1-4) [default: 1]: ").strip()
        content_type = content_types[int(ct_choice) - 1] if (ct_choice.isdigit() and 1 <= int(ct_choice) <= 4) else content_types[0]

        print("\n🎭  Select required translation style layout configuration:")
        styles = [
            "Concise & Accurate (UI/UX) [Temperature: 0.0 - Strictly Literal]",
            "Balanced Translation [Temperature: 0.3 - Natural & Safe]",
            "Creative & Fluent (Marketing) [Temperature: 0.6 - Highly Idiomatic]",
            "Technical Precision (Documentation) [Temperature: 0.1 - Rigid Engineering Context]"
        ]
        for idx, st in enumerate(styles, start=1):
            print(f"  [{idx}] {st}")
        st_choice = input("👉 Enter style number (1-4) [default: 2]: ").strip()
        style = styles[int(st_choice) - 1].split(" [")[0] if (st_choice.isdigit() and 1 <= int(st_choice) <= 4) else styles[1].split(" [")[0]
    else:
        mode = "SCALPEL"
        content_type = "Dynamic Routing"
        style = "Dynamic Pacing"

    print("\n" + "-" * 60)
    return provider, content_type, style, mode, reset_languages

def sync_pipeline():
    # Setup argparse to allow command-line automation and reset flags
    parser = argparse.ArgumentParser(description="Peripateticware Advanced Localization & Reset Wizard")
    parser.add_argument("--reset", action="store_true", help="Clean reset: wipes existing target translations and re-translates from scratch")
    parser.add_argument("--provider", type=str, choices=["OLLAMA", "CLAUDE", "GEMINI", "DEEPL", "GOOGLE_TRANSLATE", "MICROSOFT"], help="Translation provider engine")
    parser.add_argument("--mode", type=str, choices=["SCALPEL", "MACHETE"], help="Orchestration mode")
    parser.add_argument("--content-type", type=str, help="Content type for Machete mode")
    parser.add_argument("--style", type=str, help="Style configuration for Machete mode")
    parser.add_argument("--non-interactive", action="store_true", help="Skip the interactive setup wizard")
    
    args, unknown = parser.parse_known_args()
    
    # Determine if we open the interactive menu or use command-line defaults
    if args.non_interactive or (args.reset and (args.provider or args.mode)):
        provider = args.provider or "OLLAMA"
        mode = args.mode or "SCALPEL"
        content_type = args.content_type or "Dynamic Routing"
        style = args.style or "Dynamic Pacing"
        reset_languages = args.reset
    else:
        # Open the interactive menu
        provider, content_type, style, mode, reset_languages = run_interactive_wizard()

    try:
        engine = UniversalOrchestrator(provider, content_type, style)
    except Exception as e:
        print(f"❌ Core engine initialization error: {e}")
        return

    en_nested = load_json(LOCALES_DIR / "en" / "landing.json")
    if not en_nested:
        print("❌ Error: en/landing.json source template asset is missing or empty.")
        return

    en_strings = flatten_json(en_nested)
    target_langs = get_target_languages()
    print(f"🚀 Launching Production Pipeline via: {engine.get_method_string()}\n")

    # --- TELEMETRY ACCUMULATORS ---
    grand_total_characters = 0
    locale_telemetry_report = {}

    for lang_code, lang_name in target_langs:
        folder = LOCALES_DIR / lang_code.lower()
        json_path = folder / "landing.json"
        xlf_path = folder / "landing.xlf"
        
        # Load or reset locale targets defensively
        if reset_languages:
            target_json = {}
            xlf_dataset = {"strings": {}, "global_prov": {"@context": {}, "@graph": []}}
            print(f"🧹 Clean Reset: Wiped previous target translations and provenance dataset for: [{lang_code}] ({lang_name})")
        else:
            target_json = flatten_json(load_json(json_path))
            xlf_dataset = parse_existing_xliff_with_prov(xlf_path)
            
        global_prov = xlf_dataset["global_prov"]
        historical_strings = xlf_dataset["strings"]
        meta_tracking = {}

        locale_character_count = 0
        delta_keys = []
        delta_texts = []

        # Step 1: Filter out the translation delta to process
        for k, src in en_strings.items():
            current_target_val = target_json.get(k, "")
            is_new = k not in target_json or current_target_val == "" or current_target_val == k.split('.')[-1].replace('_', ' ')
            text_changed = not is_new and current_target_val == src 
            
            if is_new or text_changed:
                delta_keys.append(k)
                delta_texts.append(str(src))
                
                # Add source length to the character counter
                string_length = len(str(src))
                locale_character_count += string_length
                grand_total_characters += string_length
                meta_tracking[k] = {"version": historical_strings.get(k, {}).get("version", 0) + 1, "status": "new_translation" if is_new else "pending_review"}
            else:
                meta_tracking[k] = {"version": historical_strings.get(k, {}).get("version", 1), "status": "approved" if historical_strings.get(k, {}).get("approved") else "pending_review"}

        # Step 2: Translate in grouped batches to eliminate rate-limiting
        if delta_keys:
            # Group keys by their dynamically derived style configurations in Scalpel Mode
            grouped_deltas = {}  # (cat_name, style_inst, temp) -> list of (key, text)
            
            for key, text in zip(delta_keys, delta_texts):
                if mode == "SCALPEL":
                    cat, inst, temp = classify_key_and_get_config(key, text)
                else:
                    cat = content_type
                    inst = engine._get_style_instruction(style)
                    temp = engine._get_temperature(style)
                    
                cfg_key = (cat, inst, temp)
                if cfg_key not in grouped_deltas:
                    grouped_deltas[cfg_key] = []
                grouped_deltas[cfg_key].append((key, text))
            
            # Translate each classified group sequentially
            for (cat, inst, temp), items in grouped_deltas.items():
                group_keys = [item[0] for item in items]
                group_texts = [item[1] for item in items]
                
                print(f"⏳ Target [{lang_code}] ({lang_name}) - Category: '{cat}' (Temp: {temp}) - {len(group_keys)} keys...")
                
                # Update orchestrator overrides dynamically for this batch
                engine.set_dynamic_override(cat, inst, temp)
                
                # Determine batch size dynamically based on provider type to prevent LLM alignment errors
                batch_size = 10 if engine.provider in ["OLLAMA", "CLAUDE", "GEMINI"] else 50
                translated_results = []
                
                for i in range(0, len(group_keys), batch_size):
                    batch_keys = group_keys[i:i + batch_size]
                    batch_texts = group_texts[i:i + batch_size]
                    
                    try:
                        ts = get_timestamp()
                        print(f"   📦 Sending batch {i // batch_size + 1} ({len(batch_texts)} keys)...")
                        
                        batch_translations = engine.translate_batch(batch_texts, lang_name, lang_code)
                        translated_results.extend(batch_translations)
                        
                        # Update XLIFF metadata inline for this batch
                        for idx, key in enumerate(batch_keys):
                            if idx < len(batch_translations):
                                tgt = batch_translations[idx]
                                v = meta_tracking[key]["version"]
                                global_prov = build_or_update_prov_graph(key, batch_texts[idx], tgt, engine.get_method_string(), ts, v, global_prov)
                    except Exception as e:
                        print(f"   ❌ Batch translation error: {e}")
                        # Fill failed translations with fallback empty text so alignment doesn't break
                        translated_results.extend([""] * len(batch_texts))
                
                # Map translated strings back into the localized JSON tracking dictionary
                for idx, key in enumerate(group_keys):
                    if idx < len(translated_results):
                        target_json[key] = translated_results[idx]

        # Step 3: Cleanup unmapped keys and save files
        for k in [k for k in target_json if k not in en_strings]: 
            del target_json[k]
            
        save_json(json_path, unflatten_json(target_json))
        write_xliff_prov_file(xlf_path, lang_code, en_strings, target_json, meta_tracking, global_prov)
        
        # Save results for final metrics telemetry
        locale_telemetry_report[lang_name] = locale_character_count
        
    # --- FINAL METRIC ANALYTICS REPORT ---
    print("\n" + "=" * 60)
    print("📊 FINAL EXECUTION LOCALIZATION TELEMETRY REPORT")
    print("=" * 60)
    print(f"Engine Architecture utilized: {engine.get_method_string()}")
    print(f"Total billing-eligible characters handled across the complete call: {grand_total_characters:,} characters")
    print("\nBreakdown Per Target Locale Workspace:")
    for loc_name, loc_count in locale_telemetry_report.items():
        print(f"  • {loc_name.ljust(15)} : {loc_count:,} characters out to translation network")
    print("=" * 60)
    print("\n🏁 Translation and provenance synchronization complete.")

if __name__ == "__main__":
    sync_pipeline()