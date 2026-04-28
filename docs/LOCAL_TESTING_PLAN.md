# 🧪 Local Testing Plan - Peripateticware Phase 5

Complete testing guide for inference services and all integrations.

---

## 📋 Test Overview

### What We're Testing

1. **Inference Services** (NEW)
   - Audio Transcription (Whisper)
   - Image Analysis (Llava/Claude Vision)
   - Text Embeddings (384-dimensional)
   - Input Normalization (multimodal)

2. **Updated Components**
   - Inference routes (fully implemented)
   - Health check endpoint
   - Error handling

3. **Integrations**
   - Teacher portal → inference
   - Mobile app → inference
   - Parent portal → insights from inference

---

## 🚀 Prerequisites

### System Requirements
- Docker & Docker Compose
- Python 3.9+
- 8GB+ RAM
- ~5GB disk space (for Ollama models)

### Software Setup

```bash
# Install Ollama (https://ollama.ai)
# Then pull models:
ollama pull llama3
ollama pull llava
ollama pull whisper

# Verify installation:
ollama list
```

### Environment Setup

```bash
# Backend
cd backend
cp .env.example .env
pip install -r requirements.txt

# Frontend
cd ../frontend
cp .env.example .env.local
npm install

# Mobile
cd ../mobile
cp .env.example .env.local
npm install
```

---

## 📝 Unit Tests

### Run All Tests

```bash
cd backend
pytest tests/ -v --cov=services --cov=routes
```

### Test Audio Service

```bash
pytest tests/test_audio_service.py -v

# Tests cover:
✅ Ollama Whisper transcription
✅ OpenAI Whisper fallback
✅ Audio format detection (WAV, MP3, M4A, OGG, FLAC)
✅ Error handling
✅ Timeout handling
```

**Test file location:** `backend/tests/test_audio_service.py`

### Test Vision Service

```bash
pytest tests/test_vision_service.py -v

# Tests cover:
✅ Ollama Llava image analysis
✅ Claude Vision fallback
✅ Image format detection (JPG, PNG, WEBP, GIF)
✅ Image resizing for large files
✅ Object extraction
✅ Error handling
```

**Test file location:** `backend/tests/test_vision_service.py`

### Test Embedding Service

```bash
pytest tests/test_embedding_service.py -v

# Tests cover:
✅ Ollama embedding generation
✅ 384-dimensional vectors
✅ Batch processing
✅ Mock embeddings (for testing)
✅ Error handling
```

**Test file location:** `backend/tests/test_embedding_service.py`

### Test Normalization Service

```bash
pytest tests/test_input_normalization_service.py -v

# Tests cover:
✅ Text validation & truncation
✅ Image format detection & conversion
✅ Image resizing
✅ Audio format detection
✅ Size limit enforcement
✅ Metadata extraction
```

**Test file location:** `backend/tests/test_input_normalization_service.py`

### Test Inference Routes

```bash
pytest tests/test_inference_routes.py -v

# Tests cover:
✅ /multimodal-process endpoint
✅ /text-embedding endpoint
✅ /rag-retrieve endpoint
✅ /health endpoint
✅ Error responses
✅ Input validation
```

**Test file location:** `backend/tests/test_inference_routes.py`

---

## 🔗 Integration Tests

### Test Full Pipeline

```bash
# Start all services
docker-compose up -d

# Wait for startup
sleep 10

# Run integration tests
pytest tests/integration/ -v
```

**Test file location:** `backend/tests/integration/test_inference_pipeline.py`

### Manual API Testing

#### 1. Health Check

```bash
curl http://localhost:8010/api/v1/inference/health

# Expected response:
{
  "status": "healthy",
  "llm_provider": "ollama",
  "llm_status": "available",
  "models": {
    "text": "llama3",
    "vision": "llava",
    "audio": "whisper"
  },
  "environment": "development"
}
```

#### 2. Audio Transcription

```bash
# Create test audio (or use existing WAV file)
# Then transcribe:

curl -X POST http://localhost:8010/api/v1/inference/multimodal-process \
  -F "session_id=test-audio-001" \
  -F "input_type=audio" \
  -F "file=@test-audio.wav"

# Expected response:
{
  "session_id": "test-audio-001",
  "input_type": "audio",
  "extracted_text": "actual transcription text here",
  "inference_details": {
    "text": "actual transcription text here",
    "confidence": 0.95,
    "model": "whisper",
    "provider": "ollama"
  },
  "success": true
}
```

#### 3. Image Analysis

```bash
curl -X POST http://localhost:8010/api/v1/inference/multimodal-process \
  -F "session_id=test-image-001" \
  -F "input_type=image" \
  -F "file=@sample-photo.jpg"

# Expected response:
{
  "session_id": "test-image-001",
  "input_type": "image",
  "extracted_text": "detailed image analysis...",
  "inference_details": {
    "text": "detailed image analysis...",
    "objects": ["plant", "soil", "water"],
    "confidence": 0.85,
    "model": "llava"
  },
  "success": true
}
```

#### 4. Text Embedding

```bash
curl -X POST "http://localhost:8010/api/v1/inference/text-embedding?text=What%20is%20photosynthesis?"

# Expected response:
{
  "text": "What is photosynthesis?",
  "embedding": [0.12, -0.45, 0.78, ...],  // 384 values
  "dimension": 384,
  "model": "all-MiniLM-L6-v2",
  "provider": "ollama",
  "success": true
}
```

#### 5. Full Inquiry

```bash
curl -X POST http://localhost:8010/api/v1/inference/inquiry \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "student-123",
    "input_type": "text",
    "text": "Tell me about photosynthesis",
    "location": {"name": "Forest Trail", "lat": 40.7128, "lng": -74.0060},
    "curriculum_context": {"topic": "Biology", "grade": 5},
    "persona_context": {"role": "student", "level": "intermediate"}
  }'

# Expected response:
{
  "session_id": "student-123",
  "next_question": "What do you think happens to sunlight...",
  "resources": ["https://example.com/..."],
  "confidence": 0.85
}
```

---

## 👥 End-to-End Testing (All Roles)

### Test Scenario 1: Teacher Creates Activity with Images

**Setup:**
1. Login as teacher: alice@lincoln.edu / password123
2. Navigate to Create Activity

**Steps:**
1. Teacher uploads image of outdoor location
2. System analyzes image (Llava)
3. Extracts features and objects
4. Teacher sees analysis in activity preview

**Verification:**
```bash
# API call:
curl -X POST http://localhost:8010/api/v1/inference/multimodal-process \
  -F "session_id=activity-image-test" \
  -F "input_type=image" \
  -F "file=@activity-photo.jpg"

# Check response has:
✅ extracted_text populated
✅ objects identified
✅ confidence > 0.8
✅ success: true
```

**Expected Behavior:**
- ✅ Image uploaded without errors
- ✅ Analysis completes in <10 seconds
- ✅ Features displayed in preview
- ✅ Teacher can edit analysis

### Test Scenario 2: Student Submits Audio Evidence

**Setup:**
1. Login as student: student1@lincoln.edu / password123
2. Navigate to activity with audio option

**Steps:**
1. Student records audio evidence (observation notes)
2. Submits audio file
3. System transcribes (Whisper)
4. Shows transcription to student for review

**Verification:**
```bash
# API call:
curl -X POST http://localhost:8010/api/v1/inference/multimodal-process \
  -F "session_id=student-evidence-audio" \
  -F "input_type=audio" \
  -F "file=@student-recording.wav"

# Check response has:
✅ extracted_text contains student's words
✅ confidence > 0.85
✅ processing_time < 5s
✅ success: true
```

**Expected Behavior:**
- ✅ Audio recorded without errors
- ✅ Transcription appears quickly
- ✅ Student can edit transcription
- ✅ Can submit or re-record
- ✅ Evidence saved with transcription

### Test Scenario 3: Parent Views Child's Evidence with AI Insights

**Setup:**
1. Login as parent: parent@example.com / password123
2. View child's submitted evidence

**Steps:**
1. Parent sees image/audio evidence
2. Clicks "View Analysis" button
3. System shows AI-generated analysis
4. Parent sees embeddings for RAG search

**Verification:**
- ✅ Evidence displays correctly
- ✅ AI analysis shows (from vision/audio service)
- ✅ Performance is fast (<2s)
- ✅ Insights are helpful and accurate

---

## 🔧 Testing Different Configurations

### Test with Ollama (Local)

```bash
# In backend/.env:
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://host.docker.internal:11434
OLLAMA_MODEL_TEXT=llama3
OLLAMA_MODEL_VISION=llava
OLLAMA_MODEL_AUDIO=whisper

# Restart services
docker-compose restart fastapi

# Test
curl http://localhost:8010/api/v1/inference/health
# Should show: "llm_status": "available"
```

### Test with Claude (Cloud)

```bash
# In backend/.env:
LLM_PROVIDER=claude
CLAUDE_API_KEY=sk-ant-...
CLAUDE_MODEL=claude-3-5-sonnet-20241022

# Restart services
docker-compose restart fastapi

# Test
curl http://localhost:8010/api/v1/inference/health
# Should show Claude models available
```

### Test Fallback to OpenAI

```bash
# In backend/.env:
OPENAI_API_KEY=sk-...

# When Ollama Whisper fails, should fall back to OpenAI
curl -X POST http://localhost:8010/api/v1/inference/multimodal-process \
  -F "session_id=fallback-test" \
  -F "input_type=audio" \
  -F "file=@test.wav"

# Should succeed even if Ollama is down
```

---

## 📊 Performance Testing

### Load Testing

```bash
# Install locust
pip install locust

# Run load test
locust -f locustfile.py --host=http://localhost:8010

# Open http://localhost:8089 and set:
# - Users: 10
# - Spawn rate: 2
# - Duration: 5 minutes

# Check metrics:
✅ Response time < 500ms (p95)
✅ Error rate < 1%
✅ Throughput > 100 req/s
```

### Benchmark Each Service

```bash
# Audio transcription (30s clip)
time curl -X POST ... -F "file=@audio.wav"
# Expected: 2-5 seconds

# Image analysis
time curl -X POST ... -F "file=@image.jpg"
# Expected: 3-8 seconds

# Text embedding
time curl -X POST ... -G -d "text=..."
# Expected: 0.5-1 second

# Health check
time curl http://localhost:8010/api/v1/inference/health
# Expected: <100ms
```

---

## 🔍 Error Handling Testing

### Test Invalid Inputs

```bash
# Empty audio
curl -X POST ... \
  -F "session_id=test" \
  -F "input_type=audio" \
  -F "file=@empty.wav"
# Expected: Graceful error response

# Too large image (>10MB)
# Expected: Error about file size

# Unsupported format
curl -X POST ... \
  -F "session_id=test" \
  -F "input_type=audio" \
  -F "file=@video.mp4"
# Expected: Error about format

# Missing required fields
curl -X POST ... -F "input_type=audio"
# Expected: Validation error
```

### Test Timeout Handling

```bash
# Kill Ollama mid-request:
# 1. Start transcription
# 2. Kill Ollama: killall ollama
# 3. Check response

# Expected: Graceful error or fallback
```

---

## 📱 Mobile Testing with Tailscale

### Setup

```bash
# Get Tailscale IP
tailscale ip -4
# e.g., 100.x.x.x

# In mobile/.env:
EXPO_PUBLIC_API_URL=http://100.x.x.x:8010

# Start Expo
npm start

# Scan QR code with device
```

### Test on Mobile

1. **Record Audio**
   - Open activity
   - Record 10-second audio
   - Submit
   - Verify transcription appears on device

2. **Upload Image**
   - Take photo with camera
   - Submit
   - Verify analysis appears

3. **Check Offline**
   - Turn off WiFi
   - Try to use inference
   - Should queue for later sync
   - Turn WiFi back on
   - Should sync automatically

---

## 🎯 Test Checklist

### Pre-Deployment

- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] Audio transcription works (Ollama & OpenAI)
- [ ] Image analysis works (Ollama & Claude)
- [ ] Embeddings generate correctly
- [ ] Health check responds correctly
- [ ] Error handling works for invalid inputs
- [ ] Performance benchmarks acceptable
- [ ] Mobile testing passes
- [ ] All three user roles tested
- [ ] Documentation complete

### Code Quality

- [ ] No warnings or errors in logs
- [ ] Code follows style guide
- [ ] Comments explain complex logic
- [ ] Error messages are helpful
- [ ] Logging is appropriate

### Security

- [ ] Input validation working
- [ ] No sensitive data in logs
- [ ] API keys not exposed
- [ ] Rate limiting works (when implemented)
- [ ] CORS properly configured

---

## 🐛 Troubleshooting

### Ollama Not Found

```bash
# Make sure Ollama is installed and running
brew install ollama  # macOS
# Or download from https://ollama.ai

# Start Ollama
ollama serve

# Pull models
ollama pull llama3 llava whisper
```

### Timeout Errors

```bash
# Increase timeout in backend/core/config.py:
INFERENCE_TIMEOUT=120  # seconds

# Or in individual services:
# timeout=120 parameter in httpx.AsyncClient
```

### Out of Memory

```bash
# Check available RAM
free -h  # Linux
vm_stat  # macOS

# Reduce model size or close other apps
# Or use smaller models:
# - mistral instead of llama3
# - smaller vision model
```

### Services Won't Start

```bash
# Check logs
docker-compose logs fastapi -f

# Verify environment
echo $LLM_PROVIDER
echo $OLLAMA_BASE_URL

# Restart
docker-compose down
docker-compose up -d
```

---

## 📝 Test Report Template

When testing, document results:

```markdown
# Test Report - [Date]

## Test Environment
- OS: [Windows/macOS/Linux]
- Docker: [version]
- Python: [version]
- LLM Provider: [ollama/claude]

## Test Results

### Unit Tests
- audio_service.py: ✅ Pass (5/5 tests)
- vision_service.py: ✅ Pass (6/6 tests)
- embedding_service.py: ✅ Pass (4/4 tests)
- input_normalization_service.py: ✅ Pass (8/8 tests)
- inference_routes.py: ✅ Pass (7/7 tests)

### Integration Tests
- Full pipeline: ✅ Pass
- Mobile app: ✅ Pass
- All roles: ✅ Pass

### Performance
- Audio transcription: 3.2s (✅ < 5s)
- Image analysis: 5.1s (✅ < 8s)
- Text embedding: 0.8s (✅ < 1s)

### Issues Found
- [List any bugs or issues]

## Sign-off
Tested by: [Name]
Date: [Date]
Approved: [Name]
```

---

## 🎓 Next Steps

After testing passes:

1. ✅ Commit to GitHub
2. ✅ Create pull request
3. ✅ Request code review
4. ✅ Address feedback
5. ✅ Merge to main
6. ✅ Deploy to staging
7. ✅ Final verification
8. ✅ Deploy to production

See **`docs/GITHUB_WORKFLOW.md`** for detailed instructions.

---

## 📞 Support

- Questions about testing? Check **`docs/TROUBLESHOOTING.md`**
- Issues with setup? See **`docs/DEPLOYMENT_GUIDE.md`**
- Need help? Open a GitHub issue or discussion
