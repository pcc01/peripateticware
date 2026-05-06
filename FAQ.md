# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

# ❓ Peripateticware FAQ

**Frequently Asked Questions about Licensing, Deployment, Features, and Support**

---

## 📜 Licensing & Pricing

### **What is the license?**

Peripateticware is licensed under the **Business Source License 1.1 (BSL 1.1)**.

This is a "source-available" license, which means:
- You can **view and modify** the source code
- You can **use it freely** under specific conditions (see below)
- You **cannot resell it as a SaaS product** or compete directly
- The license converts to **Apache 2.0** (fully open-source) on **May 1, 2030**

### **Is Peripateticware free?**

**Free For:**
- Individual educators (use in your own classroom)
- Non-commercial projects (research, prototyping, personal use)
- Personal learning projects

**Not Free For:**
- School districts and charter management organizations (entities managing 5+ classrooms)
- Companies offering it as a service (SaaS)
- Reselling or rebranding

### **How much does a commercial license cost?**

Contact Paul Christopher Cerda for pricing based on your organization's size and needs.

**Email:** [your email]  
**Website:** [your website]

### **What if I'm a large school district?**

School districts and institutional entities (managing more than 5 classrooms) require a commercial license.

This includes:
- School districts (all schools in the district)
- Charter management organizations (CMOs)
- Multi-site operators (5+ school locations)
- Any entity managing 5+ classrooms

Contact Paul Christopher Cerda for licensing terms and pricing.

### **Does the license restrict what I can do with the code?**

You **can:**
- Modify the code for your needs
- Run it on your own servers
- Use it privately in your organization
- Contribute improvements (with CLA)
- Learn from the code

You **cannot:**
- Offer it as a SaaS product (subscription service)
- Resell or rebrand the software
- Fork and create a competing product
- Claim it as your own work
- Sublicense without permission

### **What happens after May 1, 2030?**

The license automatically converts to **Apache 2.0** (fully open-source).

After that date:
- Anyone can use it for any purpose
- No commercial license required
- Anyone can offer it as a service
- Fully community-owned

### **Is this "open source"?**

Technically, **no** — it's "source-available" (you can see the code but have restrictions).

**After May 2030:** Yes, it becomes Apache 2.0 (fully open-source).

### **Can I sell Peripateticware as a service?**

**No**, not without a commercial license.

The license specifically prohibits offering it as a SaaS product. This protects the original creator's investment while ensuring the code will eventually be fully open-source in 2030.

If you're interested in a commercial partnership, contact Paul Christopher Cerda.

### **Can I fork the code and create my own version?**

Not as a competing product. The BSL 1.1 is specifically designed to prevent this until 2030.

You can:
- Modify it for your own use
- Deploy it privately
- Contribute improvements back

You cannot:
- Create a competing service
- Resell as a product
- Clone and rename

### **What about open-source components used in Peripateticware?**

Peripateticware uses many open-source libraries:
- React, TypeScript, Tailwind CSS (frontend)
- FastAPI, SQLAlchemy (backend)
- Ollama (optional LLM provider - fully open-source)
- Leaflet, PostgreSQL, Redis (and many others)

These components remain under their original licenses and are fully open-source.

**Peripateticware's code** (the parts we wrote) is source-available under BSL 1.1.

### **Is Ollama free if I use Peripateticware?**

Yes! Ollama is fully open-source and free.

The Peripateticware **integration with Ollama** is free for everyone. You only pay for commercial licensing if your institution needs it.

---

## 🚀 Deployment & Installation

### **Can I run Peripateticware on my own servers?**

**Yes, absolutely.** That's a primary use case.

You can deploy it:
- On-premises (your school's servers)
- Private cloud (your AWS/Azure account)
- Hybrid (combination of cloud and on-premises)

Individual educators can run it locally on their computers.

### **What hardware do I need?**

**Minimum (Development/Single Teacher):**
- 4 CPU cores
- 8 GB RAM
- 20 GB disk space
- Windows 10/11 or Linux

**Recommended (Institutional/Multi-Classroom):**
- 8+ CPU cores
- 16+ GB RAM
- 100+ GB disk space
- Dedicated server or cloud instance
- PostgreSQL database server
- Redis cache server

### **Can I run it on Windows?**

Yes! Full Windows support:
- Windows 10 or 11 (Pro/Enterprise/Home with WSL 2)
- Docker Desktop for Windows
- PowerShell scripts included

See **Installation Guide** in README.md

### **Can I run it on Linux?**

Yes! Docker support works on any Linux distribution.

```bash
docker-compose up -d
```

### **Can I run it in the cloud?**

Yes! Compatible with:
- Amazon AWS (EC2, RDS, ElastiCache)
- Microsoft Azure (VMs, Database, Cache)
- Google Cloud (Compute Engine, Cloud SQL)
- DigitalOcean
- Any cloud provider with Docker support

### **What database should I use?**

**For Development:** PostgreSQL (included in Docker)

**For Production:** 
- PostgreSQL (recommended)
- Cloud-managed options: AWS RDS, Azure Database, Google Cloud SQL

The system is designed for PostgreSQL and heavily optimized for it.

### **How do I back up my data?**

**Docker Volumes:**
```bash
docker-compose exec postgres pg_dump -U postgres > backup.sql
```

**Cloud Providers:**
- AWS RDS: Automated backups (snapshots)
- Azure Database: Automated backups
- Google Cloud SQL: Automated backups

**Best Practice:** Daily automated backups to separate storage.

### **Can I migrate from local to cloud?**

Yes, PostgreSQL data can be migrated:
1. Export local database
2. Create cloud database
3. Import data
4. Update connection string
5. Redeploy application

See **Deployment Guide** for detailed steps.

---

## 🤖 AI & LLM Integration

### **What's the difference between Ollama and Claude?**

| Feature | Ollama | Claude |
|---------|--------|--------|
| **Cost** | Free | $50-200/month |
| **Location** | Local (your computer) | Cloud (Anthropic) |
| **Internet** | Works offline | Requires internet |
| **Quality** | Good (Mistral model) | Excellent (Claude) |
| **Setup** | 1 hour | 15 minutes |
| **Best For** | Development, testing | Production |
| **GPU Required** | Yes (for speed) | No |
| **Data Privacy** | Data stays local | Sent to Anthropic |

### **Which should I use?**

**Use Ollama if:**
- You're developing or testing
- You want to avoid costs
- You need offline capability
- You have GPU hardware
- Data privacy is critical

**Use Claude if:**
- You're in production
- You want best quality
- You need quick setup
- You don't have GPU
- You prefer managed service

### **Can I switch between them?**

Yes! Edit `.env` and restart:

```bash
# Switch to Ollama
LLM_PROVIDER=ollama

# Or switch to Claude
LLM_PROVIDER=claude
ANTHROPIC_API_KEY=sk-ant-xxxxx

# Restart
docker-compose restart backend
```

Zero downtime switching.

### **How much does Claude cost?**

Pricing depends on usage:
- **Chat completion:** ~$0.003 per 1K input tokens, $0.015 per 1K output tokens
- **Typical lesson generation:** 2-3 API calls = ~$0.10-0.30
- **Typical monthly cost (100 lessons):** $10-30

For a school using it daily:
- 1 teacher/day: ~$10-20/month
- 10 teachers/day: ~$100-200/month
- Institutional pricing available

Contact Paul Christopher Cerda for volume discounts.

### **How much GPU do I need for Ollama?**

**Minimum:** 4GB VRAM
- Supports small models (3-7B)
- Slower generation time (5-15 seconds per prompt)

**Recommended:** 8GB+ VRAM
- Supports most models (7-13B)
- Fast generation (1-3 seconds)

**Optimal:** 12GB+ VRAM
- Supports large models (13-30B)
- Very fast generation (<1 second)

**GPU-less:** Works but slow (CPU-only)
- 30-60 seconds per prompt
- Not recommended for production

### **Can I use other LLM providers?**

Currently supported:
- Ollama (local)
- Claude/Anthropic (cloud)

OpenAI GPT support is planned for Phase 6.

Custom providers can be added by modifying the backend provider abstraction layer.

### **How do I set up Claude?**

1. Create account at https://console.anthropic.com
2. Get API key from Settings
3. Add to `.env`:
   ```env
   ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxx
   LLM_PROVIDER=claude
   ```
4. Restart backend
5. Done!

### **How do I set up Ollama?**

1. Download from https://ollama.ai/download
2. Install and run `ollama serve`
3. Pull a model: `ollama pull mistral`
4. Add to `.env`:
   ```env
   LLM_PROVIDER=ollama
   OLLAMA_HOST=http://host.docker.internal:11434
   ```
5. Done!

### **What models does Ollama support?**

Popular models:
- **Mistral** (4.5GB) - Fastest, good quality ⭐ Recommended
- **Neural-Chat** (4.1GB) - Balanced
- **Llama 2** (3.8GB) - Smaller, acceptable quality
- **Orca 2** (7.3GB) - High quality

See https://ollama.ai for complete list.

### **Does using Claude send my data to Anthropic?**

Yes, your prompts are sent to Anthropic's servers for processing.

If privacy is critical, use Ollama (keeps data local).

If you need assurance, contact Anthropic about their privacy policy and compliance certifications.

### **How accurate is the AI lesson generation?**

The AI generates starting suggestions that teachers customize.

**Quality by provider:**
- **Claude:** ~90% ready-to-use (minor edits needed)
- **Ollama (Mistral):** ~70% usable (more edits needed)

Teachers always review and customize before assigning to students.

---

## 🎓 Features & Capabilities

### **What can teachers do?**

Teachers can:
- Create location-based learning activities
- Set learning objectives and standards
- Add instructions and resources
- Preview before publishing
- Organize activities into projects
- Sequence activities (drag-drop)
- Access AI-generated lesson suggestions (Phase 5)
- See student progress and evidence

### **What can students do?**

Students can:
- See location-triggered activities (GPS)
- Complete guided discovery tasks
- Submit evidence (photos, answers, reflections)
- Earn badges/achievements
- See progress and feedback
- Collaborate with classmates (coming Phase 6)

### **What subjects are supported?**

Any subject! The AI can generate lessons for:
- STEM (Science, Technology, Engineering, Math)
- History & Social Studies
- Language Arts & Literature
- Arts (Visual Art, Music, Drama)
- Physical Education
- Health & Wellness
- Career & Technical Education
- Foreign Languages

### **What grade levels are supported?**

K-12 (Kindergarten through Grade 12) + Higher Education

The system adapts lesson complexity based on selected grade level.

### **Does it work on mobile devices?**

**Teacher Interface (Phase 4):** Responsive design, works on tablets and phones (though desktop recommended for authoring)

**Student Interface (Phase 5):** Optimized for mobile

**Phase 6 (Planned):** Native iOS/Android apps

### **What about accessibility?**

All code meets **WCAG AAA** standards:
- ✅ Full keyboard navigation
- ✅ Screen reader compatible
- ✅ High contrast support
- ✅ Captions for videos
- ✅ Readable fonts and spacing

### **Does it support different languages?**

Currently: English

Internationalization (i18n) framework is in place for Phase 6.

### **How does it handle locations?**

Three methods:
1. **GPS coordinates** (exact location)
2. **Address** (converted to coordinates)
3. **Map selection** (click on map)

Activities trigger when students are within a specified radius (default 100m, customizable).

### **Can teachers create activities without AI?**

Yes! Teachers can:
- Write custom activities from scratch
- Use AI suggestions as starting points
- Modify AI-generated content
- Disable AI suggestions entirely

---

## 🔒 Security & Privacy

### **Is student data secure?**

Yes, we implement:
- HTTPS/TLS encryption in transit
- Password hashing (bcrypt)
- Role-based access control
- Input validation and sanitization
- SQL injection prevention
- CSRF protection
- Rate limiting
- Audit logging

### **Where is data stored?**

You choose:
- **On-premises:** Your school's servers
- **Private cloud:** Your AWS/Azure account
- **Hybrid:** Combination

Peripateticware never stores data outside your chosen deployment location.

### **Do you comply with FERPA?**

Yes! FERPA compliance is built-in:
- Role-based access control (teachers only see their students)
- Audit logging of data access
- No external data sharing
- Data retention policies configurable
- Export capabilities for data portability

Schools deploying on-premises have full control over compliance.

### **What about COPPA (for younger students)?**

COPPA (Children's Online Privacy Protection Act) compliance features:
- Parental consent workflow
- Limited data collection
- No third-party tracking
- No advertising or marketing

For students under 13, enable COPPA mode in configuration.

### **Is there a privacy policy?**

Yes. When deploying, you should:
1. Customize the privacy policy for your institution
2. Have parents/guardians review and accept
3. Document compliance procedures

Template provided in documentation.

### **Can parents access student data?**

Yes (coming Phase 6):
- Parents can see their child's learning progress
- View submitted evidence and feedback
- See competency assessments
- Generated reports

Currently limited to teacher and admin views.

### **What about teacher data?**

Teachers' lesson plans and materials are:
- Private to their account
- Not shared with other teachers (unless explicitly shared)
- Exportable for backup
- Deletable on request

### **Is it GDPR compliant?**

Peripateticware doesn't use Anthropic's servers by default (Ollama is local).

If using Claude:
- Data is processed by Anthropic (EU-compliant)
- Check Anthropic's GDPR certification
- You maintain control of data

For GDPR compliance, deploy on-premises or use Ollama.

---

## 🛠️ Customization & Extensibility

### **Can I modify the code?**

Yes! The BSL 1.1 license allows you to:
- Modify code for your needs
- Run custom versions
- Integrate with your systems
- Create custom components

You just can't resell it as a service.

### **Can I integrate with other systems?**

The backend provides a REST API for:
- Grade book systems (Canvas, Schoology, Infinite Campus)
- SSO (Single Sign-On) via OIDC/SAML
- Learning Management Systems (Canvas, Blackboard, Google Classroom)
- Roster sync systems
- Analytics platforms

Contact Paul Christopher Cerda for integration consulting.

### **Can I add custom fields?**

Yes! The database schema can be extended:
- Add custom activity metadata
- Custom user profile fields
- Custom competency frameworks
- Custom assessment rubrics

See **PHASE4_COMPLETE_HANDOFF.md** for database structure.

### **Can I white-label it?**

Yes! You can customize:
- Branding (logos, colors, fonts)
- Domain name (school.peripateticware.com)
- Email templates
- UI strings and labels
- Custom themes

White-labeling guide included in deployment documentation.

### **Can I hire someone to customize it?**

Yes! The code is clear and well-documented.

Recommended:
- Contact Paul Christopher Cerda for developer referrals
- Or hire your own developer (budget 2-4 weeks depending on scope)

Code follows React and Python best practices with comprehensive documentation.

### **Can I contribute improvements back?**

Yes! We welcome contributions:
1. Sign Contributor License Agreement (CLA)
2. Fork repository
3. Create feature branch
4. Submit pull request
5. Code review and merge

See **CONTRIBUTING.md** for details.

---

## 👥 Support & Community

### **Is there support?**

**Documentation:** Comprehensive guides included
- Installation Guide
- Teacher Guide
- Developer Guide
- Deployment Guide
- API Documentation

**Direct Support:** Available through Paul Christopher Cerda

### **How do I report a bug?**

Create an issue in the repository with:
- Clear description
- Steps to reproduce
- Expected vs actual behavior
- Screenshots if applicable
- System info (browser, OS, etc.)

### **How often are updates released?**

Roadmap includes:
- **Phase 5 (May 2026):** AI lesson generation
- **Phase 6 (2026):** Student app, collaboration, analytics
- **Phase 7 (2027):** Mobile apps, parent portal, advanced features

Regular security and bug fix updates as needed.

### **How long will the software be supported?**

- **Until May 2030:** Supported under BSL 1.1
- **May 2030+:** Perpetually (Apache 2.0 - community maintained)

You can always run older versions even after conversion.

### **Is there a community forum?**

Not yet! Planned for Phase 6.

Until then, use:
- GitHub Discussions (for technical questions)
- Email Paul Christopher Cerda (for business inquiries)

### **Can I request a feature?**

Yes! Submit feature requests via:
- GitHub Issues (with "feature-request" label)
- Email to Paul Christopher Cerda with description and use case

Features considered for roadmap based on demand and alignment with vision.

---

## 💼 Business & Usage

### **What's the business model?**

**Free Tier:**
- Individual educators
- Non-commercial projects
- Personal use

**Commercial Licensing:**
- Schools (5+ classrooms)
- Districts
- Educational publishers
- EdTech companies
- Training organizations

Pricing based on organization size and feature needs.

### **Can I use this for corporate training?**

Yes, if you have a commercial license.

Peripateticware works well for:
- Employee onboarding
- Location-based field training
- Sales training (retail, automotive, real estate)
- Safety and compliance training

Contact Paul Christopher Cerda for corporate licensing.

### **Can universities use it?**

Yes! Universities fall under "Institutional Entities" if they manage 5+ classrooms/courses.

Commercial licensing applies. Contact Paul Christopher Cerda for academic pricing.

### **What about non-profit schools?**

Non-profit schools are still "Institutional Entities" if managing 5+ classrooms.

Commercial licensing required, but non-profit discounts available.

Contact Paul Christopher Cerda for non-profit pricing.

### **Can I use it in multiple schools?**

Yes! Licensing covers:
- Single school: Single license
- Multi-school district: District-wide license
- Multi-district: Statewide or regional license

Volume discounts available. Contact Paul Christopher Cerda for details.

---

## 🎯 General Questions

### **Why source-available instead of fully open-source?**

The BSL 1.1 model enables:
- Creator can sustain development
- Code is open and transparent
- Community can use freely (with restrictions)
- Guaranteed conversion to Apache 2.0 in 2030
- Prevents immediate commoditization while ensuring future openness

It's the best of both worlds: transparency now, openness later.

### **Why convert to Apache 2.0 in 2030?**

This honors both:
- Original creator's investment (5 years of commercial opportunity)
- Community's right to truly free software (Apache 2.0 in 2030)

By 2030, the software will be mature, the market established, and full open-source is sustainable.

### **How is Peripateticware different from other learning platforms?**

Peripateticware is unique because:
1. **Location-centric:** Learning happens in real places, not classrooms
2. **Teacher-empowered:** Teachers create, not vendors
3. **AI-enhanced:** AI helps, but doesn't replace teacher judgment
4. **Source-available:** You see the code, can customize, can deploy privately
5. **Rooted in 20-year vision:** Not a feature tacked on to LMS

### **What if my school already uses a learning platform?**

Peripateticware integrates with existing systems:
- Rosters sync with Canvas, Clever, etc.
- Grades can sync back to grade book
- Single sign-on via OIDC/SAML
- Runs alongside existing tools

It's designed to complement, not replace, your LMS.

### **How does this relate to Artificial Intelligence?**

Two ways:
1. **AI as tool:** AI suggests lessons, but teachers decide
2. **AI as enabler:** Without AI, location-based lesson generation would take days per location. With AI, it takes seconds.

Teachers remain in control. AI increases their effectiveness.

### **Is Peripateticware ready for production?**

**Phase 4 (Teacher Authoring):** Yes ✅ Ready now

**Phase 5 (AI Lesson Generation):** Ready June 2026

**Phase 6 (Student App):** Ready 2026-2027

Start with Phase 4 (teacher authoring) in production, plan Phase 5 rollout.

### **How do I get started?**

1. **Read the README** (this page) - 10 minutes
2. **Follow Installation Guide** - 1 hour
3. **Create your first activity** - 30 minutes
4. **Invite colleagues to try** - ongoing

You can be teaching location-based lessons within a week.

---

**For more questions, contact Paul Christopher Cerda**

**Email:** [your email]  
**Website:** [your website]

**Happy teaching! 📚🌍**
