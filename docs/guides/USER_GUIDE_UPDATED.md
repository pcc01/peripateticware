# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

# 📖 Peripateticware User Guide

**Version**: 2.0  
**Last Updated**: May 5, 2026  
**For**: Teachers, Parents, Students, and Administrators

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [For Teachers](#for-teachers)
3. [For Students](#for-students)
4. [For Parents](#for-parents)
5. [For Administrators](#for-administrators)
6. [Core Features](#core-features)
7. [Common Tasks](#common-tasks)
8. [Troubleshooting](#troubleshooting)
9. [FAQs](#faqs)

---

## Getting Started

### System Requirements

**Web Application (Teacher/Admin Portal)**
- Modern web browser (Chrome, Firefox, Safari, Edge)
- Internet connection
- JavaScript enabled
- Cookies enabled
- Desktop/laptop recommended for content creation

**Mobile App (Student/Parent)**
- iOS 12.0+ or Android 6.0+
- 100 MB free storage (for photo/video capture)
- **Location services: Required for location-based activities**
- Camera: Required for evidence capture
- Microphone: Required for audio recording
- Push notifications: Optional but recommended

**Location Permission Note:**
Peripateticware uses GPS to trigger location-based activities. Students will be prompted to enable location services when they first open an activity. This is essential for the core learning experience.

### Creating Your Account

#### For Teachers
1. Go to `https://peripateticware.example.com`
2. Click "Sign Up" → "Teacher Account"
3. Enter your name and email
4. Create a strong password (at least 8 characters)
5. Select your school/district
6. Verify your email
7. You're ready to go!

#### For Students
1. Download the Peripateticware app from App Store or Play Store
2. Click "Sign Up" → "Student Account"
3. Enter your name and email
4. Create a password
5. Select your teacher/school
6. **Enable location services** when prompted
7. Verify your email
8. Your teacher will add you to their class

#### For Parents
1. Download the Peripateticware app from App Store or Play Store
2. Click "Create Account"
3. Enter your name and email
4. Create a password
5. Select your relationship to the student (parent, guardian, etc.)
6. Verify your email
7. Link your child's account (provide child's name or link code from teacher)

#### For Administrators
Contact your system administrator for login credentials

---

## For Teachers

### Dashboard Overview

When you log in, you'll see your **Teacher Dashboard** with:
- **Your Classes**: List of all your classes
- **Active Learners**: Current students and their status
- **Quick Stats**: Overview of class activity
- **Create Activity**: Button to start a new activity
- **Live Monitor**: Real-time tracking of field trips and location-based activities

### Creating a Location-Based Learning Activity

Location-based activities use GPS to trigger learning when students arrive at specific places.

#### Step 1: Plan Your Activity
1. Click "Create Activity"
2. Fill in basic information:
   - **Activity Name**: e.g., "Nature Walk - Spring Flowers"
   - **Learning Area**: Select from curriculum areas
   - **Grade Level**: Age/grade appropriate
   - **Duration**: How long the activity will take (45 min - 120 min recommended)
   - **Location**: Where the activity takes place
   - **Description**: What students will learn

#### Step 2: Set Location Coordinates
1. Click "Set Location" on the map
2. Options:
   - **Address Search**: Type an address (auto-geocoded to GPS)
   - **Map Click**: Click directly on the map
   - **GPS Coordinates**: Enter latitude/longitude
3. Set **Trigger Radius** (default: 100 meters)
   - When student is within this distance, activity loads
   - Adjust based on location size (small building vs. large park)
4. Verify location on map preview

**Example - Louvre Museum:**
```
Location: 48.8606, 2.3352
Radius: 150 meters (covers museum entrance)
```

#### Step 3: Set Learning Objectives
1. Select learning objectives from your curriculum
2. Specify what students should observe/discover
3. Add **guiding questions** for students:
   - "What evidence of change do you see?"
   - "Why do you think this happened?"
   - "How does this connect to what we learned?"
4. Set **success criteria**
5. Optional: Provide background reading or videos

#### Step 4: Configure Evidence Collection
- **Allowed Evidence Types**:
  - ✅ Photos (for observational evidence)
  - ✅ Videos (for process/explanation)
  - ✅ Audio recordings (voice memos, reflections)
  - ✅ Text notes (observations, analysis)
  - ✅ Sketches/drawings (visual representations)
  - ✅ Measurements (data collection)
  - ✅ Automatically captured: GPS coordinates, timestamps

**ASR (Automatic Speech Recognition):**
- Audio recordings are automatically transcribed
- Transcripts appear in student notebook
- Students can edit/correct transcriptions
- Transcriptions help with reflection and understanding
- Helpful for students who prefer speaking to typing

#### Step 5: Configure Activity Settings
- **Collaboration**: Allow students to work together (see each other's submissions)
- **Real-time Monitoring**: Enable to see submissions live
- **Time Limit**: Set if you want a specific duration
- **Scheduling**: When can students access the activity (date/time window)
- **Competencies**: Which competencies can be demonstrated

#### Step 6: Review & Launch
1. Preview how activity appears to students
2. Test from student app if possible
3. Make any adjustments
4. Click "Launch Activity"
5. Share link or code with students

### Location-Based Monitoring (Live View)

When students are out on a field trip or location-based activity:

#### Live Monitor Dashboard
- Click "Live Monitor" during an active activity
- **See students' locations on map**:
  - Green dot: At location, active on activity
  - Yellow dot: Near location, not yet engaged
  - Red dot: Far from location
- **Real-time submissions**: Photos and notes appear as students submit
- **Engagement metrics**: Time spent, completeness, submissions
- **Send notifications**: Alert all students or specific students

#### Safety Features
- **Check-in/Check-out**: Students confirm they've arrived and left
- **Geofence alerts**: Know when students enter/exit activity zone
- **Emergency contacts**: Quick access to emergency info
- **Offline capability**: App works if Internet drops; syncs when back online

### Managing Student Submissions

#### Viewing Evidence
1. Activity complete → Click "Review Submissions"
2. View each student's evidence:
   - Photos captured with GPS coordinates and timestamp
   - Video recordings with duration
   - **Transcribed audio** (ASR automatically created text)
   - Text notes and sketches
   - Complete reflection/answers
3. See the time spent on each activity

#### Assessing Evidence Quality
- **Relevance**: Does it show what was asked for?
- **Completeness**: Did they capture all required evidence?
- **Reflection Quality**: Did they think deeply?
- **ASR Accuracy**: Did audio transcription capture their thinking?
  - Click "Improve Transcript" if needed
  - Student can review and correct

#### Providing Feedback
1. Click "Add Feedback" on a submission
2. Write constructive comments on:
   - What they observed well
   - How their thinking is developing
   - Next steps for learning
3. Optionally rate learning level:
   - 🌱 **Emerging**: Beginning to show understanding
   - 🌿 **Developing**: Building skills and knowledge
   - 🌳 **Proficient**: Demonstrates expected level
   - 🌲 **Advanced**: Goes beyond expectations
4. Students see feedback immediately

#### Recording Competencies
1. After reviewing submissions, click "Record Evidence"
2. Select which competencies were demonstrated:
   - Critical thinking
   - Collaboration
   - Observation skills
   - Scientific reasoning
   - Communication (especially from audio/ASR)
3. Add specific observations:
   - "Excellent analysis in their reflection"
   - "Used audio memo to explain thinking"
4. This contributes to student's overall portfolio

### Managing Your Classes

#### Adding Students
1. Go to "Classes" → Your class name
2. Click "Add Student"
3. Choose method:
   - **Create new link**: Generate unique invite link for student
   - **Existing code**: Use invite code if available
   - **Invite by email**: Send invitation to student email
4. Student accepts invitation

#### Organizing Students
1. Click "Manage Groups"
2. Click "Create Group"
3. Select students to add
4. Save group
5. Use groups for:
   - Collaborative field trips
   - Guided tours
   - Peer learning activities

#### Tracking Progress
1. Click "Class Progress"
2. View for each student:
   - Activities completed
   - Evidence collected (photos, videos, audio)
   - Location-based activities participated in
   - Competencies demonstrated
   - Learning trajectory over time
3. Export reports for parents/administrators

---

## For Students

### Getting Started with the App

#### First Time Setup
1. **Location Services**: Enable when prompted
   - Peripateticware needs this to trigger location-based activities
   - You control this in phone settings
2. **Notifications**: Enable to get alerts when activities are ready
3. **Camera/Microphone**: Grant permissions for evidence capture
4. **Your Profile**: Add a photo (optional)

### Your Student Dashboard

When you open the app, you'll see:
- **Upcoming Activities**: Activities ready for you to do
- **In Progress**: Activities you've started but not finished
- **Completed**: Activities you finished
- **Your Portfolio**: All your evidence and learning
- **Progress**: How much you've learned (competencies)
- **Messages**: From your teacher and classmates

### Participating in Location-Based Activities

#### Before You Go
1. **Read the context**: Teacher provides background information
2. **Understand objectives**: What you're trying to learn
3. **Watch intro video**: If teacher provided one
4. **Ask questions**: Message teacher if unclear

#### When You Arrive at the Location
1. **GPS triggers the activity**:
   - App automatically detects you're at the right place
   - Activity loads on your screen
2. **See the activity prompt**:
   - "You're at the Louvre Museum"
   - "Objective: Find evidence of how the building changed"
   - "Look around. What do you notice?"

#### Capturing Evidence

**Three ways to capture what you learn:**

**1. Photo Evidence** 📸
- Tap camera button
- Take photo of what you're observing
- Photo automatically includes:
  - **GPS coordinates** (exactly where you took it)
  - **Timestamp** (when you took it)
  - Your **location tag** (Museum entrance, etc.)
- Upload to activity

**2. Video or Audio** 🎥 🎙️
- Tap video button → Record explanation
- Tap audio button → Record reflection or observation
- **ASR (Speech-to-Text) automatically transcribes audio**:
  - Your voice memo becomes text
  - See transcript in your notebook
  - Edit transcript if needed
  - Helpful if you prefer talking instead of typing

**3. Notes and Sketches** 📝 ✏️
- Type observations in notebook
- Draw/sketch what you see
- Map connections between ideas
- Link to photos/videos you captured

### Your Notebook

Your **Notebook** is a learning journal where you reflect:

#### Entry Types

**Guided Reflection** 🤔
- Teacher asks: "What surprised you?"
- You respond with observations and thoughts
- Attach evidence (photos, audio)

**Free-form Journal** 📖
- Write about what you learned
- Record questions that came up
- Make connections to other learning

**Question Capture** ❓
- Something confused you?
- Write the question
- Teacher can help
- Often leads to deeper investigation

**Hypothesis Record** 🧪
- Before investigating: "What will we find?"
- After: "We found this instead!"
- Think like a scientist

**Evidence Annotation** 🏷️
- Label photos with what they show
- Link evidence to learning objectives
- Add location context
- Explain why evidence matters

### Your Portfolio

Your **Portfolio** shows your complete learning journey:

#### What's Included
- All photos, videos, and audio you captured
- Transcribed audio (from ASR)
- Notebook entries and reflections
- Activities completed
- Competencies you've demonstrated
- Teacher feedback on your work
- Growth over time

#### Using Your Portfolio
- **Review your learning**: See how you've grown
- **Share with parents**: Show what you've learned
- **Reflect on progress**: Competencies earned
- **Plan next steps**: What to work on next

### Earning Competencies

As you complete activities and show evidence of learning, you earn **competencies**. Examples:
- 🎯 Critical thinking
- 🤝 Collaboration
- 📊 Data analysis
- 🎨 Creative expression
- 🗣️ Communication (especially from audio reflections)
- 🔍 Observation skills

View in your **Progress** tab to see what you've earned.

### Advanced: Using Audio Effectively 🎙️

#### ASR (Automatic Speech Recognition)

When you record an audio memo, the app automatically:
1. **Records your voice** (up to 10 minutes)
2. **Transcribes your words** (converts speech to text)
3. **Creates a transcript** in your notebook
4. **Links to the activity** (with GPS location and time)

#### Tips for Great Audio Reflections

**Do:**
- Speak clearly and naturally
- Explain your thinking process
- Ask questions as you observe
- Record observations on-the-spot (more authentic)
- Use simple, straightforward language

**Avoid:**
- Background noise (but okay if soft)
- Mumbling or unclear speech
- Overly formal language
- Reading from a script

**Example Good Audio:**
> "I'm looking at the painting, and I notice the colors are really dark. The teacher said it was about a sad time. The dark colors match the mood. That's interesting—the artist was using color to tell the story."

**Why Teachers Love Audio:**
- Shows your genuine thinking
- Easier than typing while exploring
- Your voice shows emotion and understanding
- ASR creates text for your notebook
- Shows language skills and articulation

---

## For Parents

### Understanding Peripateticware

Peripateticware is an app where students learn by exploring real places—museums, parks, historical sites, neighborhoods. Instead of staying in a classroom, they go out with their teacher and capture evidence of what they learn.

**Key Features You'll See:**
- 📍 **Location-based learning**: Activities happen in real places
- 📸 **Evidence capture**: Photos, videos, audio recordings of learning
- 🎙️ **Audio reflections**: Your child can record thoughts (automatically transcribed)
- 📓 **Notebook**: Reflection journal of discoveries
- 📊 **Progress tracking**: Competencies your child has earned

### Your Parent Dashboard

When you log in, you see:

#### Select Your Child
- If you have multiple children in Peripateticware
- Tap their name at top to switch

#### Recent Activities
- What your child did recently
- Photos and videos submitted
- Approximate date and location
- Teacher feedback

#### Progress Overview
- **Learning areas**: Breakdown by subject
- **Completion rates**: Percentage completed
- **Competencies earned**: Skills your child demonstrated
- **Trends**: How they're progressing over time

#### Messages
- Messages from teacher
- Announcements from school
- Weekly summaries (if enabled)

### Understanding Location-Based Learning

**How GPS Triggers Activities:**

1. **Before the Field Trip**:
   - Teacher creates an activity with a location (Louvre, Central Park, etc.)
   - GPS coordinates mark the exact spot
   - Your child's phone gets a notification when it's time

2. **Your Child Arrives**:
   - GPS automatically detects location
   - App loads the activity
   - Your child sees prompts and learning objectives

3. **Your Child Explores**:
   - Looks for specific evidence
   - Takes photos/videos
   - Records audio reflections
   - Answers questions in notebook

4. **Teacher Monitors**:
   - Teacher can see location on map (real-time)
   - Sees submissions as they come in
   - Can message if needed
   - All locations recorded with timestamps

**Why GPS Matters:**
- Proves the field trip happened (authentic evidence)
- Connects learning to real locations
- Creates authentic context for learning
- Teacher can verify safety/attendance

### Understanding ASR (Audio Transcription)

**What is ASR?**

ASR = Automatic Speech Recognition. When your child records an audio memo, the app automatically turns the audio into text.

**Example:**
```
🎙️ Your child records: "I'm looking at this arch, and it's really 
tall. The stones are stacked without any glue. I wonder how it 
doesn't fall down. The teacher said it's about the shape..."

📝 App creates transcript: "I'm looking at this arch, and 
it's really tall. The stones are stacked without any glue. 
I wonder how it doesn't fall down. The teacher said it's 
about the shape..."
```

**Why This Matters:**
- Shows what your child was thinking
- Easier than typing while exploring
- More authentic (how they actually talk)
- Helps with reflection and understanding
- Creates record of their learning process
- Shows language development

**What You'll See:**
- Transcribed audio in the portfolio
- Link to the original recording
- Teacher feedback on their thinking
- Sometimes corrections (they edited it)

### Viewing Your Child's Progress

#### View Complete Portfolio
1. Tap "Portfolio" or "Learning Journey"
2. See all evidence:
   - Photos with timestamps and locations
   - Videos with descriptions
   - Audio recordings with transcripts
   - Notebook entries
   - Teacher feedback
3. Timeline shows when learning happened

#### Understanding Feedback Levels

Teachers rate evidence as:
- 🌱 **Emerging**: Beginning to show understanding
- 🌿 **Developing**: Building skills and knowledge
- 🌳 **Proficient**: Demonstrates expected level
- 🌲 **Advanced**: Goes beyond expectations

**What to Look For:**
- Growth over time (moving from emerging → advanced)
- Detailed teacher comments
- Specific examples in evidence
- Connection to learning objectives

#### Competencies Earned

Your child earns competencies by demonstrating skills:
- Critical thinking (asking good questions)
- Observation (detailed evidence)
- Communication (good explanations)
- Collaboration (working with others)
- Creativity (unique interpretations)
- Scientific reasoning (hypothesis → evidence → conclusion)

**How to Support:**
- Ask about competencies they're working on
- Encourage them to reflect on evidence
- Listen to their audio reflections together
- Ask "What did you discover?"

### Notification Preferences

#### What Notifications Would You Like?

Go to **Settings** → **Notifications** and choose:
- ✓ Activity completed
- ✓ Achievements unlocked
- ✓ Teacher messages
- ✓ Concerns flagged
- ✓ Weekly summary

#### Notification Methods
- Push notifications in app
- Email updates
- Text (SMS) if enabled

### Offline Features

The app works without internet:
- View past activities
- Read teacher feedback
- Write notes in notebook
- See your child's progress
- Listen to audio recordings

When you reconnect:
- All changes sync automatically
- No data is lost
- Everything updates on the server

### Having Conversations About Learning

**Great Questions to Ask:**
- "What was the most interesting thing you found?"
- "What surprised you?"
- "How did that connect to what we're learning?"
- "Tell me about this photo. What were you thinking?"
- "I heard a bit of your audio memo. You mentioned..."
- "What was hard about this activity?"
- "If you did this again, what would you do differently?"

**Listening to Audio Reflections Together:**
- Sit together with the app
- Play one of their audio recordings
- Listen to their thinking process
- Ask follow-up questions
- Show genuine interest

---

## For Administrators

### School Dashboard

**Overview**: High-level view of your school/district
- Total students active
- Total teachers active
- Activities completed this month
- System health status
- Location-based activities in progress (with map view)

### User Management

#### Managing Teachers
1. Go to **Admin** → **Teachers**
2. **Add Teacher**:
   - Enter email
   - Select department/subject
   - Set permissions
   - Send invitation
3. **Manage Permissions**:
   - Can create activities
   - Can view all students (or class only)
   - Can create reports
   - Can manage other teachers
   - Can view location data (field trip monitoring)

#### Managing Students
1. Go to **Admin** → **Students**
2. **Bulk Import**: Upload CSV with student data
3. **Manual Add**: Create individual accounts
4. **Link to Classes**: Assign to teachers
5. **Manage**: Edit, archive, or remove accounts

**Location & ASR Considerations:**
- Enable location services for all students (required for location-based activities)
- Configure ASR language (auto-detect or specific language)
- Set privacy level for location data (how long to retain GPS logs)

#### Managing Classes
1. Go to **Admin** → **Classes**
2. **Create Class**: Name, teacher, students, location
3. **Edit**: Change settings, students, teacher
4. **Archive**: Hide completed classes
5. **Reports**: View class-wide progress

### Privacy & Compliance

#### Location Data Privacy

**FERPA Compliance:**
- Student location data protected
- Teachers see locations only during active activities
- Location logs retained for [X] days (configurable)
- Parents can view location history of their child
- Administrators can audit location access

**Best Practices:**
- Only monitor locations during scheduled field trips
- Don't monitor students outside activities
- Inform families about location tracking
- Include in privacy policy/handbook

**Configuration:**
- Set location retention period (default: 30 days)
- Enable/disable location history access
- Configure who can view maps (teacher only)
- Require parental consent for GPS use

#### ASR (Audio Transcription) Privacy

**Data Handling:**
- Audio recordings stored on secure servers
- Transcripts generated by ASR provider (configurable)
- Students can delete recordings anytime
- Transcripts linked to student portfolio
- Parents can review all transcripts

**Configuration:**
- Choose ASR provider (embedded vs. cloud)
- Set audio retention (default: 90 days)
- Enable student transcript editing
- Configure who can access transcripts

#### COPPA Compliance (Under 13)
- Parental consent required for location tracking
- Limited data collection
- No external sharing
- ASR transcripts treated as student work
- Automatic purging per policy

#### GDPR Compliance
- "Right to be forgotten" honored
- Location data deletion available
- ASR transcript deletion supported
- Data portability available
- Privacy by default

### Managing Privacy Settings

1. Go to **Settings** → **Privacy**
2. **Location Services**:
   - Require parent consent (toggle)
   - Retention period (days)
   - Who can view maps
3. **ASR/Audio**:
   - Transcript retention (days)
   - Auto-transcription (on/off)
   - Student edit access (on/off)
4. **Data Retention**: How long to keep data
5. **Sharing**: What can be shared with whom
6. **Filtering**: COPPA compliance settings
7. **Audit**: View access logs for location data and audio

### Reports & Analytics

#### Standard Reports
1. Go to **Reports**
2. **Location-Based Activities Report**:
   - Activities created with GPS
   - Participation rates
   - Completion rates
   - Average locations per activity
3. **ASR/Audio Report**:
   - Audio recordings captured
   - Transcript quality metrics
   - Most common audio length
4. **Class Reports**: By teacher or class
5. **Student Reports**: Individual progress including location-based participation
6. **System Reports**: Usage, performance, uptime

#### Custom Reports
- Date range
- Filter by teacher/class
- Include specific competencies
- Include location analytics
- Include ASR statistics

### Managing Compliance

#### Annual Checklist
- [ ] Audit location data access
- [ ] Review ASR transcript handling
- [ ] Verify parent consent forms
- [ ] Test data deletion procedures
- [ ] Check retention policies
- [ ] Review access logs
- [ ] Update privacy policy
- [ ] Brief staff on compliance

### Location Monitoring (Real-Time)

#### Monitoring Field Trips

1. Go to **Admin Dashboard** → **Live Activities**
2. See all active location-based activities:
   - Map with student locations
   - Activity details
   - Submission status
3. Can intervene if:
   - Student outside geofence too long
   - Low submission rate
   - Suspected safety issue

#### Safety Features
- Geofence alerts
- Student check-in/check-out
- Emergency contact access
- Teacher response verification

---

## Core Features

### Location-Based Learning (GPS)

**What It Is:**
Using GPS coordinates to trigger activities when students arrive at specific locations.

**How It Works:**
1. Teacher creates activity with location (address or coordinates)
2. Teacher sets trigger radius (default: 100 meters)
3. Student launches app with location enabled
4. When student within radius → activity loads automatically
5. All evidence tagged with GPS coordinates and timestamp

**Why It Matters:**
- Authentic learning in real context
- Proves field trip happened
- Connects learning to place
- Creates geographic data for analysis
- Safety verification (teacher knows where students are)

**Privacy Controls:**
- Parents can see location history
- Locations only tracked during activities
- Data deleted after retention period
- Opt-in/consent required in some regions

### Evidence Capture

**Photo Evidence** 📸
- Automatic GPS tagging
- Timestamp included
- Location description
- Student can add captions

**Video Evidence** 🎥
- Records process and explanation
- Student explains thinking
- Timestamps and location

**Audio Evidence** 🎙️
- Voice memos and reflections
- **ASR automatically creates transcript**
- Helps non-writers express thinking
- More authentic than typed text

**Sketch Evidence** ✏️
- Visual observations
- Diagrams and maps
- Annotations on photos

### ASR (Automatic Speech Recognition)

**What It Is:**
Automatic conversion of audio recordings to text transcripts.

**How It Works:**
1. Student records audio memo (up to 10 minutes)
2. App automatically transcribes to text
3. Transcript appears in notebook
4. Student can edit/correct if needed
5. Teacher reads and provides feedback

**Why It Helps:**
- Easier than typing while exploring
- Shows authentic thinking
- Helps shy or non-writers communicate
- Language development visible
- Creates searchable record of learning

**Quality:**
- Accuracy depends on audio clarity
- Handles accents and natural speech
- Student corrections improve accuracy
- Multiple attempts possible

**Privacy:**
- Audio files encrypted
- Transcripts stored securely
- Deleted per retention policy
- Only accessible to student/teacher

---

## Common Tasks

### Task: Create Location-Based Activity

**Time**: 30 minutes

1. **Planning**:
   - Decide location (museum, park, street, etc.)
   - Define learning objectives
   - Plan inquiry prompts
2. **Create Activity**:
   - Name: "Walking Tour of Local Community"
   - Learning Area: "Social Studies"
   - Grade Level: 6-8
   - Duration: 60 minutes
3. **Set Location**:
   - Address search or map click
   - Set GPS coordinates
   - Set trigger radius (100-150 meters for outdoor)
4. **Set Objectives**:
   - Students identify 5 landmarks
   - Photograph and describe each
   - Reflect on community services
5. **Configure Evidence**:
   - Allow: Photos, video, audio, notes
   - ASR enabled (for audio reflections)
   - Real-time monitoring enabled
6. **Launch**:
   - Preview on mobile
   - Share with class
   - Monitor submissions live

### Task: Monitor Live Field Trip

**Time**: 60 minutes (during activity)

1. **Open Live Monitor**:
   - Click activity name
   - Click "Live Monitor" tab
2. **View Map**:
   - See student locations
   - Green = at location, engaged
   - Yellow = approaching
   - Red = far away
3. **Monitor Submissions**:
   - Photos appear as submitted
   - Audio recordings show transcripts
   - Check quality of evidence
4. **Intervene if Needed**:
   - Message student if stuck
   - Clarify objectives if confused
   - Verify everyone participated
5. **Safety Check**:
   - Confirm all students present
   - Check-in/check-out process
   - Emergency readiness

### Task: Assess Audio Reflection

**Time**: 5-10 minutes per student

1. **Open Submission**:
   - Click student's activity
   - Go to "Evidence" tab
   - Find audio recording
2. **Read Transcript**:
   - See ASR-generated text
   - Check quality (clarity, thinking depth)
3. **Listen to Audio**:
   - Click play button
   - Hear their actual voice/tone
   - Note emotion and confidence
4. **Assess**:
   - Click "Record Competency"
   - Select demonstrated skills
   - Rate level (emerging to advanced)
   - Add specific observations about audio quality
5. **Feedback**:
   - Write comment on transcript quality
   - If ASR errors: guide student to correct
   - Praise good reflection

### Task: Compile Report for Parents

**Time**: 15 minutes

1. **Go to Reports**:
   - Select student or class
   - Date range
2. **Include**:
   - Activities completed (with locations)
   - Evidence collected (photos, videos, audio)
   - ASR transcripts from reflections
   - Competencies earned
   - Progress over time
3. **Add Notes**:
   - Personal comments
   - Highlights of growth
   - Next learning targets
4. **Export**:
   - PDF format
   - Email to parents
   - Print for conferences

---

## Troubleshooting

### Common Issues

#### "Location services won't enable"
**Solution:**
1. Check phone settings: Allow app location access
2. Go to Settings → [App] → Location → Allow
3. Close app completely, reopen
4. Restart phone if issue persists
5. Check that GPS is enabled in phone settings (not airplane mode)

#### "Activity won't load at location"
**Solution:**
1. Verify you're actually at the correct location
2. Check GPS accuracy (should be within trigger radius)
3. Wait 30 seconds (GPS takes time to lock)
4. Move closer to center point
5. Check internet connection
6. Restart app

#### "Audio won't upload"
**Solution:**
1. Check internet connection (WiFi or strong cellular)
2. Check file size (max 50 MB per recording)
3. Ensure microphone is enabled in settings
4. Try recording shorter memo (3-5 min)
5. Check phone storage space

#### "ASR transcript isn't accurate"
**Solution:**
1. Check audio clarity (reduce background noise)
2. Speak clearly (not too fast)
3. Student can click "Edit Transcript" to correct
4. Resubmit with clearer audio if needed
5. Use shorter recordings (more accurate)

#### "Can't see student location"
**Solution:**
1. Student needs to enable location services
2. Check that GPS enabled on their phone
3. Activity requires live monitoring (enabled by teacher)
4. Student must be within geofence
5. Wait for GPS to acquire signal (first fix may take 1 min)

#### "Progress not updating"
**Solution:**
1. Refresh the page
2. Log out and log back in
3. Wait a few minutes (processing)
4. Check internet connection
5. Try on different device

### Performance Issues

#### App is slow
1. Clear app cache:
   - iPhone: Settings → App → Peripateticware → Storage
   - Android: Settings → Apps → Peripateticware → Storage
2. Close other apps
3. Restart device
4. Update to latest app version
5. Check internet connection (use WiFi if possible)

#### Photos/Videos aren't uploading
1. Check photo file size (compress if over 10 MB)
2. Ensure good internet connection (WiFi preferred)
3. Try uploading one file at a time
4. Check phone storage space (need at least 500 MB free)
5. Restart app
6. Check that camera app works (permissions issue)

#### Audio transcription taking too long
1. ASR processing takes 2-5 minutes depending on length
2. Check internet connection
3. Longer recordings take longer (try 3-5 min max)
4. Refresh to see if transcript appeared
5. Try resubmitting if failed

#### GPS keeps losing signal
1. Move to open area (away from buildings)
2. Wait for GPS lock (30-60 seconds initially)
3. Disable WiFi if it interferes
4. Check that location services enabled
5. Try restarting phone

---

## FAQs

### General Questions

**Q: Is my data safe?**
A: Yes. We use:
- Encrypted connections (HTTPS)
- Secure token-based authentication
- Database encryption at rest
- Regular security audits
- FERPA/GDPR compliance
- Location data encrypted
- Audio files encrypted

**Q: Can I use this offline?**
A: Partially. Mobile app works offline:
- View past activities
- Read feedback
- Write notes
- Listen to audio recordings
- See progress
- Syncs when online

Teacher portal requires internet.

**Q: What browsers are supported?**
A: We support:
- Chrome (latest 2 versions)
- Firefox (latest 2 versions)
- Safari (latest 2 versions)
- Edge (latest 2 versions)

**Q: Do I need location services?**
A: Yes, for location-based activities (core feature). You control this in phone settings and can disable when not using location activities.

**Q: Is ASR accurate?**
A: Generally 90%+ accurate in good audio conditions. Students can edit transcripts. Accuracy improves with clear audio and slower speech.

### For Teachers

**Q: How do I delete an activity?**
A: Go to Activities → Select Activity → Click ⋯ Menu → Archive Activity. (You can restore it later if needed.)

**Q: Can students work on activities together?**
A: Yes. When creating an activity, enable "Collaboration." Students can see each other's submissions and contribute together. Good for group discovery.

**Q: How do I make activities happen at specific times?**
A: You can schedule when students can access activities. Set "Start Time" and "End Time" when creating activity.

**Q: Can I use this for indoor activities?**
A: Yes! Location is optional. You can create activities for classrooms, gyms, libraries, etc. (Set small radius: 10-25 meters for indoors)

**Q: How do I know if location data is accurate?**
A: GPS is typically accurate within 5-10 meters in good conditions. Indoors or dense buildings may have 20-30 meter errors. Check on activity.

**Q: How should I use ASR in my feedback?**
A: Listen to both audio and transcript. Praise their thinking, not just grammar. Encourage more audio reflections if they're shy about writing.

**Q: How do I handle ASR errors?**
A: Treat as teachable moment. Show student how context helps ASR ("I said 'photosynthesis' but app heard 'photo sin this is'"). Encourage clear speaking.

### For Students

**Q: Why do you need my location?**
A: To know when you've arrived at the activity location. Also to tag your photos/evidence so we know where you found each piece of evidence.

**Q: Can I use this without location enabled?**
A: The activity won't auto-trigger, but you can still manually start it. Location feature is part of the authentic learning experience though.

**Q: Do you have to use audio for reflections?**
A: No, you can type instead. But audio is easier while exploring and shows your actual thinking process.

**Q: What if I mess up the ASR transcript?**
A: Just click "Edit" and fix it. Or re-record with clearer audio.

**Q: Can I delete my audio recordings?**
A: Yes. Click the recording, then delete. They're permanently removed.

### For Parents

**Q: How often will I hear from my child's teacher?**
A: That's up to the teacher. You control notification frequency in Settings. Teachers may also send messages about activities.

**Q: Can I share my child's progress?**
A: Yes. Click "Share" on your child's profile to send a summary via email. You can also print reports.

**Q: What if I'm concerned about something I see?**
A: Contact the teacher directly through the app or email. You can also call the school. Quick response through app messaging.

**Q: Can I see where my child went?**
A: Yes. In the portfolio, you can see all locations with photos and times. You get a map of their field trip locations.

**Q: Can I download my child's data?**
A: Yes. Go to Settings → Privacy → Download My Data. You'll get all activity records, evidence (photos/videos/audio), and feedback.

**Q: Is the audio transcription private?**
A: Yes. Only you, your child, and the teacher can see it. School admin can access if necessary for compliance.

### For Administrators

**Q: How do I migrate from another system?**
A: Contact our support team. We can help with:
- Data import from CSV or LMS
- User account migration
- Location data mapping
- ASR provider configuration

**Q: Can I integrate with my LMS?**
A: Yes. We support:
- Canvas
- Google Classroom
- Blackboard
- Schoology
- Custom integrations available

**Q: How do I backup my data?**
A: Automatic daily backups included. You can also manually export data from Settings → Data Management.

**Q: What's your uptime guarantee?**
A: We maintain 99.9% uptime. Status page: status.peripateticware.example.com

**Q: Can I white-label this system?**
A: Yes. Enterprise accounts can customize:
- Branding (logos, colors)
- Custom domain
- Location monitoring settings
- ASR provider choice
- Contact our sales team

**Q: How do I configure location privacy?**
A: Go to Settings → Location Privacy:
- Set retention period (how long to keep GPS logs)
- Require parental consent
- Configure who can view maps
- Enable/disable location history
- Set audit logging level

**Q: How do I configure ASR settings?**
A: Go to Settings → ASR:
- Choose transcription provider
- Set language (auto-detect or specific)
- Set transcript retention
- Configure student edit access
- Enable/disable auto-transcription
- Set quality threshold

---

## Getting Help

### Support Resources

**In-App Help**
- Click **?** button for contextual help
- Hover over fields for tooltips
- View video tutorials

**Documentation**
- Full guides: help.peripateticware.example.com
- Video tutorials: YouTube channel
- Blog posts: example.com/blog

**Email Support**
- support@example.com
- Average response: 24 hours
- Include screenshots if possible

**Chat Support**
- Available Monday-Friday, 9am-5pm EST
- Click chat icon in app
- Average response: 2 minutes

**Community Forum**
- community.example.com
- Share ideas with other users
- Get tips and tricks
- Vote on feature requests

---

## Keyboard Shortcuts (Advanced Users)

| Action | Windows | Mac |
|--------|---------|-----|
| Create Activity | Ctrl+N | Cmd+N |
| Search | Ctrl+F | Cmd+F |
| Go to Classes | Ctrl+1 | Cmd+1 |
| Go to Dashboard | Ctrl+Home | Cmd+Home |
| View Map | Ctrl+M | Cmd+M |
| Help | F1 | Cmd+? |
| Settings | Ctrl+, | Cmd+, |

---

## Accessibility

This platform is designed to be accessible to all users:

- **Screen Readers**: Compatible with NVDA, JAWS, VoiceOver
- **Keyboard Navigation**: All features accessible via keyboard
- **Color Contrast**: WCAG AAA compliant
- **Font Sizing**: Adjustable text size
- **Captions**: Video tutorials have captions (with ASR transcripts)
- **Audio Descriptions**: Videos have transcripts
- **Language Support**: Available in 4 languages
- **ASR Transcripts**: Available for all audio content

---

## Privacy Statement

We take your privacy seriously:
- We don't sell student data
- We don't track outside our platform
- Parents/teachers control data
- Location data encrypted and retained per policy
- Audio files encrypted and transcriptions private
- FERPA and GDPR compliant
- Audit logging of all sensitive access
- Full policy: example.com/privacy

---

## Terms of Service

By using Peripateticware, you agree to our Terms of Service. Summary:
- You own your content
- We maintain the platform
- No unauthorized use
- Respect others' privacy
- Location data used only for learning
- Audio transcripts used only for educational purposes

Full terms: example.com/terms

---

**Last Updated**: May 5, 2026  
**Version**: 2.0  
**For more help**: support@example.com

**Welcome to location-based learning! 🌍📚**
