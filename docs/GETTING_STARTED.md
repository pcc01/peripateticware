# 🎯 Getting Started with Peripateticware

**Time to First Activity**: 15 minutes  
**Time to Full Deployment**: 2-4 hours  
**Difficulty**: Beginner-friendly

---

## 📖 Choose Your Path

### Path 1: Try It Locally (15 minutes)
Perfect for: Evaluating the platform, testing features, development

**Time**: 15 minutes  
**Skills Needed**: Basic command line  
**Outcome**: Run locally on your computer

### Path 2: Deploy to Staging (2 hours)
Perfect for: Pilot program, testing at scale, team evaluation

**Time**: 1-2 hours  
**Skills Needed**: Basic server management  
**Outcome**: Running on a server accessible by team

### Path 3: Production Deployment (4 hours)
Perfect for: School launch, live deployment, real users

**Time**: 3-4 hours  
**Skills Needed**: DevOps experience  
**Outcome**: Production-ready system with monitoring

---

## 🚀 Path 1: Local Deployment (Recommended First)

### Step 1: Check Prerequisites (5 minutes)

```bash
# Check Node.js version (need 18+)
node --version
# Output: v18.0.0 or higher ✓

# Check Python version (need 3.10+)
python --version
# Output: Python 3.10.0 or higher ✓

# Check Docker (optional but recommended)
docker --version
# Output: Docker version 20.10.0 or higher ✓
```

If you're missing anything:
- **Node.js**: Visit nodejs.org
- **Python**: Visit python.org
- **Docker**: Visit docker.com

### Step 2: Download & Extract (2 minutes)

```bash
# Clone the repository
git clone https://github.com/yourusername/peripateticware.git
cd peripateticware

# Or download zip and extract
unzip peripateticware.zip
cd peripateticware
```

### Step 3: Start Services (5 minutes)

**Option A: Using Docker (Recommended)**
```bash
docker-compose up -d

# Wait for services to start
sleep 10

# Check status
docker-compose ps

# View logs if needed
docker-compose logs -f
```

**Option B: Manual Start**

Terminal 1 - Backend:
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
python -m alembic upgrade head
uvicorn main:app --reload
# Runs on http://localhost:8000
```

Terminal 2 - Frontend:
```bash
cd frontend
npm install
npm run dev
# Runs on http://localhost:5173
```

Terminal 3 - Mobile (Optional):
```bash
cd mobile
npm install
npm start
# Press 'i' for iOS, 'a' for Android, 'w' for web
```

### Step 4: Create Test Account (3 minutes)

1. Go to http://localhost:5173
2. Click "Sign Up" → "Teacher Account"
3. Enter test details:
   - Name: "Test Teacher"
   - Email: "test@example.local"
   - Password: "TestPassword123!"
   - School: "Test School"
4. Click "Create Account"
5. You're logged in! ✅

### Step 5: Try Creating an Activity (5 minutes)

1. Click "Create Activity"
2. Fill in basic info:
   - Name: "Spring Nature Walk"
   - Learning Area: "Science"
   - Duration: "30 minutes"
   - Location: Set on map or type address
3. Add description: "Explore spring plants and insects"
4. Click "Next"
5. Select learning objectives
6. Click "Launch Activity"
7. Share the link with a test student account

### Step 6: View Evidence (2 minutes)

1. Click "Live Monitor" to see real-time submissions
2. Or click "Activities" → "Spring Nature Walk"
3. View submitted photos, notes, and reflections
4. Click "Record Competency" to assess
5. Provide feedback to student

---

## 🖥️ Path 2: Staging Deployment

### Prerequisites
- Linux/Mac server or Windows with WSL2
- SSH access to server
- Domain name (optional but recommended)
- 4+ GB RAM, 20+ GB storage

### Step 1: Prepare Server (30 minutes)

```bash
ssh ubuntu@staging.example.com

# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sudo sh

# Install Docker Compose
sudo apt install docker-compose -y

# Add current user to docker group (optional)
sudo usermod -aG docker ubuntu
```

### Step 2: Clone & Configure (30 minutes)

```bash
# Create directory
mkdir -p /opt/peripateticware
cd /opt/peripateticware

# Clone repository
git clone https://github.com/yourusername/peripateticware.git .

# Create .env files
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# Edit .env files with your settings
nano backend/.env
# Change DATABASE_URL, SECRET_KEY, etc.
```

### Step 3: Start Services (30 minutes)

```bash
# Start all containers
docker-compose up -d

# Wait for services
sleep 20

# Check status
docker-compose ps

# Run migrations
docker-compose exec backend alembic upgrade head

# Create admin user
docker-compose exec backend python -c \
  "from app.crud import user; user.create_admin('admin@example.com', 'temporary-password')"
```

### Step 4: Configure SSL (30 minutes)

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx -y

# Get certificate
sudo certbot certonly --standalone \
  -d staging.example.com \
  -d api.staging.example.com

# Configure Nginx (see DEPLOYMENT_GUIDE.md)
```

### Step 5: Verify (10 minutes)

```bash
# Test endpoints
curl -k https://staging.example.com
curl -k https://api.staging.example.com/docs

# View logs
docker-compose logs -f backend

# Health check
curl http://localhost:8000/api/health
```

---

## 🏢 Path 3: Production Deployment

See [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) for complete production setup.

Quick summary:
1. Prepare production server (2 hours)
2. Configure security (1 hour)
3. Setup database backups (30 minutes)
4. Configure monitoring (30 minutes)
5. Deploy with CI/CD (30 minutes)

---

## 📱 Mobile App Setup

### For Testing in Development

```bash
cd mobile
npm install

# Start Expo dev server
npm start

# Choose platform:
# Press 'i' for iOS Simulator
# Press 'a' for Android Emulator
# Press 'w' for Web
```

### For App Store Submission

See [PHASE_4_DEPLOYMENT_GUIDE.md](PHASE_4_DEPLOYMENT_GUIDE.md) for:
- Building with EAS
- iOS App Store submission
- Android Play Store submission
- Over-the-air updates

---

## 🎓 Next: Learn the Platform

### For Teachers

1. **Read**: [USER_GUIDE.md](USER_GUIDE.md) - "For Teachers" section
2. **Create**: First outdoor activity
3. **Try**: Creating and scoring evidence
4. **Generate**: Progress reports

**Time**: 1 hour

### For Administrators

1. **Read**: [USER_GUIDE.md](USER_GUIDE.md) - "For Administrators" section
2. **Setup**: School, classes, and permissions
3. **Configure**: Privacy and compliance settings
4. **Monitor**: System usage and health

**Time**: 2 hours

### For Parents

1. **Download**: Mobile app from App Store/Play Store
2. **Create**: Parent account
3. **Link**: Child's account
4. **Explore**: Child's progress and activities

**Time**: 15 minutes

---

## 🔧 Troubleshooting First Steps

### "Can't access http://localhost:5173"

```bash
# Check if Docker is running
docker ps

# Check if containers are healthy
docker-compose ps

# View logs
docker-compose logs frontend

# Restart frontend
docker-compose restart frontend
```

### "Database connection error"

```bash
# Check if PostgreSQL is running
docker-compose ps postgres

# View database logs
docker-compose logs postgres

# Restart database
docker-compose restart postgres

# Wait and try again
sleep 10
```

### "Can't log in"

```bash
# Check backend is running
docker-compose ps backend

# View backend logs
docker-compose logs backend

# Restart backend
docker-compose restart backend

# Try again
```

### Still stuck?

1. Check [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) troubleshooting section
2. View full logs: `docker-compose logs`
3. Check GitHub Issues
4. Email support@example.com

---

## 📋 Checklist for Local Setup

- [ ] Downloaded repository
- [ ] Installed Node.js 18+
- [ ] Installed Python 3.10+
- [ ] Installed Docker (optional)
- [ ] Started services
- [ ] Created test account
- [ ] Created test activity
- [ ] Viewed submissions
- [ ] Read USER_GUIDE.md
- [ ] Plan next steps

---

## 📋 Checklist for Staging Deployment

- [ ] Prepared server
- [ ] Installed Docker & Compose
- [ ] Cloned repository
- [ ] Configured .env files
- [ ] Started services
- [ ] Ran database migrations
- [ ] Created admin account
- [ ] Configured SSL certificate
- [ ] Tested all endpoints
- [ ] Set up backups

---

## 📋 Checklist for Production Deployment

- [ ] Followed staging steps
- [ ] Setup monitoring (Sentry, Prometheus)
- [ ] Setup log aggregation
- [ ] Configured automated backups
- [ ] Setup CI/CD pipeline
- [ ] Security audit complete
- [ ] Load testing passed
- [ ] Disaster recovery plan
- [ ] Staff training complete
- [ ] User acceptance testing

---

## 🎯 First Activity Ideas

### For Teachers Trying the Platform

1. **Simple Nature Walk** (Beginner)
   - 30 minutes
   - Find 5 plants
   - Take 1 photo per plant
   - Write 1 observation
   - Practice assessing evidence

2. **Community Survey** (Intermediate)
   - 60 minutes
   - Visit 3 community locations
   - Record observations
   - Create comparisons
   - Reflection on community

3. **Geometry Hunt** (Advanced)
   - 45 minutes
   - Find shapes in nature
   - Photograph and categorize
   - Measure if possible
   - Write mathematical observations

---

## 📚 Documentation Map

```
Getting Started (You are here)
├── Local Setup ✓
├── Staging Setup
└── Production Setup
    │
    ├── USER_GUIDE.md
    │   ├── For Teachers
    │   ├── For Parents
    │   └── For Administrators
    │
    ├── DEPLOYMENT_GUIDE.md
    │   ├── Architecture
    │   ├── Staging
    │   ├── Production
    │   └── Monitoring
    │
    ├── DEVELOPMENT_ROADMAP.md
    │   ├── Phase 3 (Next)
    │   ├── Phase 4 (Soon)
    │   └── Phase 5 (Planned)
    │
    └── Technical Docs
        ├── README.md
        ├── ARCHITECTURE.md
        ├── API.md
        └── DEVELOPMENT.md
```

---

## ⏱️ Time Estimates

| Task | Time | Difficulty |
|------|------|------------|
| Local setup | 15 min | Easy |
| First activity | 5 min | Easy |
| Learn platform | 1 hour | Medium |
| Staging deployment | 2 hours | Medium |
| Production deployment | 4 hours | Hard |
| Full team training | 1 day | Medium |

---

## 🎓 Learning Path

### Week 1: Understand the Platform
- [ ] Try local deployment
- [ ] Create 3 test activities
- [ ] View all submissions
- [ ] Read USER_GUIDE.md
- [ ] Understand architecture

### Week 2: Pilot Program
- [ ] Deploy to staging
- [ ] Invite test users
- [ ] Run pilot activities
- [ ] Collect feedback
- [ ] Iterate on setup

### Week 3: Production Ready
- [ ] Deploy to production
- [ ] Train staff
- [ ] Launch to students/parents
- [ ] Monitor system
- [ ] Start Phase 3 improvements

---

## 🚀 Ready? Let's Go!

### Choose your path above and follow the steps.

Questions?
- 📖 Read the documentation
- 💬 Check GitHub Issues
- 📧 Email support@example.com

---

## 🎉 Success Looks Like

✅ You can create an activity  
✅ Students can submit evidence  
✅ Teachers can view submissions  
✅ Parents can see progress  
✅ System is running reliably  

---

**You're ready to begin!** 🌍

Pick a path above and start building your outdoor learning program.

---

**Last Updated**: April 27, 2026  
**Version**: 1.0  
**Questions?**: support@example.com
