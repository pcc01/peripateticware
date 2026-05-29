# Contributing to Peripateticware

Thank you for considering a contribution to Peripateticware! This document provides guidelines and information about how to contribute.

---

## Our Mission

Peripateticware is built to support outdoor and peripatetic learning. We're creating education software that respects educators and students. We believe that contributions—whether code, documentation, design, or ideas—should be valued, recognized, and celebrated.

---

## What We Welcome

### Code Contributions
- Bug fixes and performance improvements
- New features aligned with our roadmap
- Tests and test improvements
- Backend (FastAPI, Python) and frontend (React) work
- Mobile enhancements (React Native)

### Non-Code Contributions
- **Documentation**: Tutorials, guides, API docs, examples
- **Design**: UI improvements, accessibility enhancements, graphics
- **Translation**: Localization for other languages
- **Community**: Issue triage, answering questions, mentoring
- **Content**: Blog posts, case studies, educational resources
- **Bug reports**: Detailed, well-researched issue reports

### What We Don't Accept
- Code that doesn't follow our values (especially harmful to educators/students)
- Unlicensed third-party code
- Changes that break backward compatibility without justification
- Advertising or spam

---

## How to Contribute

### Step 1: Find Something to Work On

Start here:
- **[GitHub Issues](https://github.com/pcc01/peripateticware/issues)** - Look for `good-first-issue` or `help-wanted` labels
- **[Roadmap](ROADMAP.md)** - See planned features and priorities
- **[Discussions](https://github.com/pcc01/peripateticware/discussions)** - Propose ideas
- **Ask us**: Comment on an issue if you want to claim it

### Step 2: Fork & Set Up Locally

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/teacher-tools.git
cd teacher-tools

# Create a feature branch
git checkout -b feature/your-feature-name

# Follow the README for local setup
# (Python 3.12, Node.js, Docker, etc.)
```

### Step 3: Make Your Changes

**Commit message format** (we use Conventional Commits):
```
type(scope): description

feat(frontend): add map marker customization
fix(backend): resolve async race condition in ASR service
docs(api): clarify authentication flow
refactor(mobile): improve geolocation handling
test(integration): add E2E tests for outdoor mode
```

**Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

### Step 4: Test & Verify

Before submitting:
- Run tests: `npm test` (frontend) or `pytest` (backend)
- Check linting: `npm run lint`
- Test locally with Docker if applicable
- Update tests if you changed behavior
- Verify no console errors or warnings

### Step 5: Submit a Pull Request

**PR Title Format:** Same as commits  
**PR Description:** Include:
- **What** you changed and why
- **Related issue** (if fixing an issue: "Closes #123")
- **Testing** you performed
- **Breaking changes** (if any)
- **Screenshots** (for UI changes)

Example:
```
## Description
Implements geofence-based student alerts to notify teachers when students leave defined outdoor activity areas.

## Related Issue
Closes #456

## Testing
- [x] Unit tests pass (100% coverage for new code)
- [x] Tested on Android 12+ and iOS 15+
- [x] Verified geofence accuracy within 10 meters
- [x] Tested with 50+ simultaneous students

## Screenshots
[Attach UI screenshots if applicable]

## Checklist
- [x] My code follows the style guide
- [x] I've updated relevant documentation
- [x] I've added/updated tests
- [x] All tests pass
- [x] No new warnings
```

### Step 6: Respond to Feedback

- Reviewers may request changes
- Respond constructively and iterate
- Ask clarifying questions if feedback is unclear
- Celebrate the collaborative process!

---

## Our Contributor Incentive Model

We don't pay contributors financially, but we provide substantial recognition and career value:

### 🏆 Public Recognition
- **Contributor Hall of Fame**: Listed in `CONTRIBUTORS.md` with your contributions highlighted
- **Release Notes**: Credit by name in every release you contributed to
- **Project Website**: Featured contributor spotlights
- **Community Calls**: Opportunity to present your work

### 💼 Career Value
- **Portfolio Visibility**: Your PR link is publicly available on GitHub
- **Resume Reference**: You can claim "Contributor to Peripateticware" (used by 10k+ educators)
- **Networking**: Direct contact with team and other contributors
- **Reference**: We're happy to be a reference for job opportunities
- **Speaking Opportunities**: Potential to speak at education conferences about your contribution

### 🎓 Learning & Growth
- **Mentorship**: Senior contributors review and guide your code
- **Code Review**: Deep feedback on architecture, design, and patterns
- **Real-World Experience**: Work on production education software
- **Full Stack**: Contribute across React, FastAPI, React Native, PostgreSQL, Docker

### 🌟 Community Status
- **Contributor Badges**: Special role on GitHub discussions
- **Early Access**: Try beta features before public release
- **Decision-Making**: High-impact contributors invited to design decisions
- **Exclusive Community**: Slack/Discord channel for contributors

### 💡 Own-Use Value
- **Scratch Your Itch**: Build features you need for your own use
- **Shape the Product**: Influence the roadmap through contributions
- **Open License**: After May 1, 2030, all code (including yours) is Apache 2.0 forever

---

## Contribution Tiers & Recognition

### Tier 1: First-Time Contributor 🌱
*1-3 contributions*
- Listed in CONTRIBUTORS.md
- Credit in release notes
- "First Contributor" badge

### Tier 2: Active Contributor 🌿
*4-10 contributions or significant work*
- Expanded CONTRIBUTORS.md entry with link to your work
- Featured in community announcements
- Invite to contributor calls
- Consider for project advisory (if interested)

### Tier 3: Core Contributor 🌳
*10+ contributions or major features*
- Dedicated section in CONTRIBUTORS.md
- Speaking opportunity at community event
- Early access to roadmap decisions
- Potential for maintainer role

### Tier 4: Maintainer ⭐
*Ongoing involvement, demonstrated judgment*
- Merge permissions on relevant areas
- Co-author on RFCs and design decisions
- Community leadership role
- Help shape the project's future

---

## Code of Conduct

We're committed to a safe, respectful community. All contributors must abide by our **Code of Conduct**:

- ✅ **Be respectful**: Treat others with kindness, especially when disagreeing
- ✅ **Be inclusive**: Assume good intent; welcome diverse perspectives
- ✅ **Be professional**: Communication should be constructive and focused on the work
- ✅ **Give credit**: Acknowledge others' ideas and contributions
- ❌ **No harassment**: Bigotry, intimidation, or personal attacks are unacceptable
- ❌ **No politics**: Avoid unrelated political/religious debates in project spaces

**Reporting Issues**: Contact Paul directly or email admin@thewordinbits.com. Reports are handled with discretion.

---

## Technical Guidelines

### Frontend (React)
- TypeScript preferred
- Functional components with hooks
- Follow existing component structure
- Test coverage minimum 80%
- Vitest for unit tests, Playwright for E2E

### Backend (FastAPI)
- Python 3.12+
- Type hints required
- Docstrings for public functions
- Test coverage minimum 80%
- Follow PEP 8 style guide

### Mobile (React Native)
- Consistent with React patterns
- Platform-specific considerations documented
- Tested on both iOS and Android

### Documentation
- Keep README.md up-to-date
- Add docstrings to new functions
- Update API docs if endpoints change
- Include examples for user-facing features

---

## Review Process

### What Reviewers Look For
1. **Code Quality**: Does it work? Is it maintainable?
2. **Testing**: Are there tests? Do they pass?
3. **Documentation**: Is it clear? Can others understand it?
4. **Alignment**: Does it fit the project's vision?
5. **Performance**: Any impact on speed or memory?

### Review Timeline
- Simple fixes: 1-3 days
- Features: 3-7 days
- Major changes: Longer, may involve discussion

### Multiple Reviewers
- Critical changes may need multiple approvals
- Don't be discouraged by multiple review rounds; it means we care about quality

---

## Getting Unstuck

### If You Have Questions
- **GitHub Discussions**: Post in the appropriate category
- **Slack/Discord**: Ask in the contributors channel
- **Pull Request**: Ask questions directly in your PR comments
- **Email**: Reach out to Paul directly

### Common Issues
- **"How do I set up locally?"**: See README.md > Development
- **"I don't understand the error"**: Post the full error + context
- **"I need help with code"**: Share a minimal reproduction
- **"I'm stuck"**: It's OK! Ask—that's what we're here for

---

## Compensation & Licensing

### No Financial Payment
We can't currently offer paid contributions. Our model relies on volunteer effort, recognition, and career value.

### Your Licensing Rights
- You retain copyright of your contributions
- You grant **Apache 2.0 rights** to the project
- After May 1, 2030, all code becomes fully Apache 2.0
- Until then, the SaaS service runs under BSL, but your code is yours

See **LICENSE_DUAL.md** for full details.

---

## Attribution & Credits

### How We Credit Contributors

**In CONTRIBUTORS.md:**
```markdown
### [@username](https://github.com/username)
- Geofencing implementation for outdoor activities
- Student safety notifications system
- Mobile performance optimizations
- 15 commits across 3 releases
```

**In Release Notes:**
```markdown
## New Contributors
- [@username](https://github.com/username) in #456 - Geofencing implementation
```

**On Website:**
Featured contributor spotlight (quarterly)

**Your Choice**: You control how much information is public:
- GitHub handle only (default)
- Name (request in PR)
- Website/portfolio link (request in PR)

---

## Special Opportunities

### Google Summer of Code / Outreachy
We may participate in GSoC or Outreachy in the future. Keep an eye on the project for announcements.

### Hackathons
We sponsor prizes for Peripateticware contributions at local hackathons. Reach out if you're organizing one!

### Speaking at Conferences
If you make significant contributions, we'd love to help you present at education technology conferences.

---

## FAQ

**Q: I found a security issue. What do I do?**  
A: Please email Paul directly. Do NOT post in public issues. We take security seriously.

**Q: Can I work on multiple PRs at once?**  
A: Yes! Just keep them focused and independent.

**Q: What if my PR gets rejected?**  
A: That's OK. Rejection is about fit, not your ability. We'll explain the reasoning and welcome future attempts.

**Q: Do I need to be a teacher to contribute?**  
A: No! Developers, designers, educators, students—all perspectives are valuable.

**Q: What if I have to step back?**  
A: That's totally fine. Just let us know. Open source is for everyone's pace.

**Q: Can I use this contribution in my portfolio?**  
A: Absolutely! That's encouraged. Share the PR link, tell employers about it.

---

## Recognition Examples

### Tier 1 (First-Time)
```
- **[username](https://github.com/username)** - Bug fix: Fixed map marker positioning on Android
```

### Tier 2 (Active)
```
- **[Full Name](https://github.com/username)** - 8 contributions
  - Implemented geofencing notifications
  - Fixed iOS memory leak
  - Improved API documentation
  - Portfolio: thewordinbits.com
```

### Tier 3 (Core)
```
- **[Full Name](https://github.com/username)** - 15+ contributions, Core Team
  - Led geofencing feature implementation
  - Mobile performance improvements across platforms
  - Mentored 3 first-time contributors
  - Speaking: EdTech Summit 2026 (Geolocation & Privacy)
  - Portfolio: thewordinbits.com
```

---

## Final Thoughts

Contributing to Peripateticware means helping educators and students. Whether it's a one-word typo fix or a multi-PR feature, every contribution matters.

We're building something that impacts education. Thank you for being part of that journey.

---

**Questions? Feedback on this guide?**  
Open an issue or reach out to Paul. We want contributing to be awesome.

**Ready to get started?**  
Pick an issue, fork the repo, and submit your first PR. Welcome to the team! 🚀

---

**Last Updated:** May 2026  
**Maintained by:** Paul Christopher Cerda and the Peripateticware community
