-- =============================================================================
-- Peripateticware — Test Account Seed
-- Usage: .\scripts\seed-test-accounts.ps1
--
-- Accounts created:
--   Teacher       teacher.test@peripateticware.com   Teach2026!
--   Class student class.student@peripateticware.com  Learn2026!
--   HS parent     hs.parent@peripateticware.com      Home2026!
--   HS student    hs.student@peripateticware.com     Child2026!
--
-- Re-runnable: DELETE + INSERT pattern ensures no duplicate-key errors.
-- =============================================================================

DO $$
DECLARE
  teacher_org_id   UUID := 'd1000000-0000-0000-0000-000000000001';
  hs_org_id        UUID := 'd2000000-0000-0000-0000-000000000002';
  classroom_id     UUID := 'f1000000-0000-0000-0000-000000000001';
  teacher_id       UUID := 'e1000000-0000-0000-0000-000000000001';
  tstudent_id      UUID := 'e2000000-0000-0000-0000-000000000002';
  hs_parent_id     UUID := 'e3000000-0000-0000-0000-000000000003';
  hs_student_id    UUID := 'e4000000-0000-0000-0000-000000000004';
BEGIN

-- ── 0. Clean up any previous seed run ────────────────────────────────────────
-- Delete in dependency order so FK constraints don't fire.
DELETE FROM student_profiles  WHERE user_id IN (teacher_id, tstudent_id, hs_parent_id, hs_student_id);
DELETE FROM classroom_students WHERE student_id IN (tstudent_id, hs_student_id);
DELETE FROM classrooms         WHERE id = classroom_id;
DELETE FROM organization_members WHERE user_id IN (teacher_id, tstudent_id, hs_parent_id, hs_student_id);
DELETE FROM users              WHERE id IN (teacher_id, tstudent_id, hs_parent_id, hs_student_id);
DELETE FROM organizations      WHERE id IN (teacher_org_id, hs_org_id);

-- ── 1. Organizations ─────────────────────────────────────────────────────────

INSERT INTO organizations (
    id, slug, name, type, license_tier, license_status,
    max_teachers, max_classrooms, max_students, max_students_per_classroom,
    contact_email, trial_started_at, created_at, updated_at,
    has_under_13_students, org_type_v2, privacy_jurisdiction_ids
) VALUES (
    teacher_org_id,
    'peripateticware-test-school',
    'Peripateticware Test School',
    'school', 'starter', 'active',
    3, 3, 90, 30,
    'teacher.test@peripateticware.com', NOW(), NOW(), NOW(),
    TRUE, 'individual_teacher', '[]'::jsonb
),(
    hs_org_id,
    'peripateticware-test-homeschool',
    'Peripateticware Test Homeschool',
    'homeschool_family', 'starter', 'active',
    1, 1, 10, 10,
    'hs.parent@peripateticware.com', NOW(), NOW(), NOW(),
    TRUE, 'homeschool_family', '[]'::jsonb
);

-- ── 2. Users ──────────────────────────────────────────────────────────────────
-- Passwords (bcrypt rounds=12):
--   teacher_id    → Teach2026!
--   tstudent_id   → Learn2026!
--   hs_parent_id  → Home2026!
--   hs_student_id → Child2026!

INSERT INTO users (
    id, email, username, first_name, last_name, full_name,
    hashed_password, role, is_active, org_id, created_at, updated_at
) VALUES
(
    teacher_id,
    'teacher.test@peripateticware.com', 'teacher_test',
    'Taylor', 'Teacher', 'Taylor Teacher',
    '$2b$12$XEt6tyadNQes7HN3wldlV.EvArD/HaYrFH.Lfn5JhK12OwPVTpLOm',
    'TEACHER', TRUE, teacher_org_id, NOW(), NOW()
),(
    tstudent_id,
    'class.student@peripateticware.com', 'class_student',
    'Sam', 'Student', 'Sam Student',
    '$2b$12$WKy6XyhFfyPG0L.Vm3Da3ezQHcc3WTvykEniBpKzlTasWXfOqDP52',
    'STUDENT', TRUE, teacher_org_id, NOW(), NOW()
),(
    hs_parent_id,
    'hs.parent@peripateticware.com', 'hs_parent',
    'Harper', 'Homeschool', 'Harper Homeschool',
    '$2b$12$X75e/gBpTG/HPglhT2C9dOSvoEhud.2hhg2W2oeo4vEua63MGIFcC',
    'HOMESCHOOL', TRUE, hs_org_id, NOW(), NOW()
),(
    hs_student_id,
    'hs.student@peripateticware.com', 'hs_student',
    'Riley', 'Learner', 'Riley Learner',
    '$2b$12$KissvRr/U.5CkmEfCWnxSuXI3H9xF4rgNoGjmu4L8QAWNuEr2YcUq',
    'STUDENT', TRUE, hs_org_id, NOW(), NOW()
);

-- ── 3. Organization members ───────────────────────────────────────────────────

INSERT INTO organization_members (id, org_id, user_id, role, joined_at) VALUES
    (gen_random_uuid(), teacher_org_id, teacher_id,   'owner',  NOW()),
    (gen_random_uuid(), teacher_org_id, tstudent_id,  'member', NOW()),
    (gen_random_uuid(), hs_org_id,      hs_parent_id, 'owner',  NOW()),
    (gen_random_uuid(), hs_org_id,      hs_student_id,'member', NOW())
ON CONFLICT (org_id, user_id) DO NOTHING;

-- ── 4. Classroom ──────────────────────────────────────────────────────────────

INSERT INTO classrooms (id, org_id, teacher_id, name, grade_level, subject, is_active, created_at, updated_at)
VALUES (
    classroom_id, teacher_org_id, teacher_id,
    'Field Science - Grade 5',
    '5', 'Science', TRUE, NOW(), NOW()
);

-- ── 5. Enroll classroom student ───────────────────────────────────────────────

INSERT INTO classroom_students (classroom_id, student_id)
VALUES (classroom_id, tstudent_id)
ON CONFLICT (classroom_id, student_id) DO NOTHING;

-- ── 6. Student profiles ───────────────────────────────────────────────────────

INSERT INTO student_profiles (id, user_id, bloom_level, marzano_level, created_at, updated_at)
VALUES
    (gen_random_uuid(), tstudent_id,   1, 1, NOW(), NOW()),
    (gen_random_uuid(), hs_student_id, 1, 1, NOW(), NOW())
ON CONFLICT (user_id) DO NOTHING;

RAISE NOTICE '=== Test accounts created ===';
RAISE NOTICE 'Teacher:           teacher.test@peripateticware.com  /  Teach2026!';
RAISE NOTICE 'Classroom student: class.student@peripateticware.com / Learn2026!';
RAISE NOTICE 'HS parent:         hs.parent@peripateticware.com     / Home2026!';
RAISE NOTICE 'HS student:        hs.student@peripateticware.com    / Child2026!';

END $$;

-- =============================================================================
-- South Whidbey Activities (3 locations)
-- Outdoor Classroom: Clinton, WA
-- Community Center + Community Park: Langley, WA
-- =============================================================================
DO $$
DECLARE
  teacher_id   UUID := 'e1000000-0000-0000-0000-000000000001';
  activity_1   UUID := 'a1000000-0000-0000-0000-000000000001';
  activity_2   UUID := 'a2000000-0000-0000-0000-000000000002';
  activity_3   UUID := 'a3000000-0000-0000-0000-000000000003';
  nl           TEXT := chr(10);
BEGIN

-- Clean up previous activity seed
DELETE FROM activities WHERE id IN (activity_1, activity_2, activity_3);

-- Activity 1: South Whidbey Outdoor Classroom (Clinton) - Forest Ecology
INSERT INTO activities (
    id, teacher_id,
    title, description,
    subject, grade_level, difficulty_level,
    estimated_duration_minutes,
    bloom_level, activity_type, status, is_active,
    location_name, location_latitude, location_longitude, location_radius_meters,
    location_info,
    orient_phase, inquiry_phase, reflect_phase,
    learning_objectives,
    published_at, created_at, updated_at
) VALUES (
    activity_1, teacher_id,
    'Forest Ecology at South Whidbey Outdoor Classroom',
    'Students explore the forest ecosystem at the South Whidbey Outdoor Classroom near Clinton, WA, observing relationships between plants, animals, fungi, and soil in a temperate rainforest. Students collect evidence of decomposition, species interdependence, and the role of keystone species in maintaining ecosystem balance.',
    'Science', 5, 3, 60,
    3, 'inquiry'::activity_type_enum, 'published'::activity_status_enum, TRUE,
    'South Whidbey Outdoor Classroom',
    47.9743, -122.3529, 150,
    'The South Whidbey Outdoor Classroom is a forested outdoor education site near Clinton, WA. The site features Douglas fir and red alder stands, nurse logs, seasonal streams, and rich understory vegetation typical of the Pacific Northwest.',
    'Look around you. Notice the layers of the forest - the tall canopy trees, the shrubs and ferns below, and the ground covered in moss and fallen logs. A forest ecosystem has many parts that depend on each other. Today you will be a field scientist. Find a spot to stand quietly for 60 seconds and observe - what do you see, hear, and smell?',
    'Choose one investigation question and use your capture tools to record evidence:' || nl || nl ||
    '1. DECOMPOSERS: Find a fallen log or rotting wood. Who or what is breaking it down? Photograph or sketch what you find. How long do you think it has been decomposing?' || nl || nl ||
    '2. PRODUCERS & CONSUMERS: Find a plant and signs of an animal (tracks, droppings, bite marks). How does the animal depend on the plant? Record your evidence.' || nl || nl ||
    '3. LAYERS: Observe the forest from ground level up. How many distinct layers can you identify? What lives in each layer? Photograph each layer.' || nl || nl ||
    'Record your GPS location and take at least one photo or voice note.',
    'Based on your investigation, answer: What would happen to this forest if one species disappeared entirely? Choose the organism you studied and explain the chain reaction its loss might cause. Use specific examples from what you observed today.',
    '["Identify producers, consumers, and decomposers in a forest ecosystem","Describe at least two interdependent relationships observed in the field","Use field evidence (photo, audio, or written observation) to support a scientific claim","Explain how removing one species could affect the broader ecosystem"]'::jsonb,
    NOW(), NOW(), NOW()
);

RAISE NOTICE 'Activity 1: Forest Ecology at South Whidbey Outdoor Classroom (Clinton)';

-- Activity 2: South Whidbey Community Center (Langley) - Community Stories
INSERT INTO activities (
    id, teacher_id,
    title, description,
    subject, grade_level, difficulty_level,
    estimated_duration_minutes,
    bloom_level, activity_type, status, is_active,
    location_name, location_latitude, location_longitude, location_radius_meters,
    location_info,
    orient_phase, inquiry_phase, reflect_phase,
    learning_objectives,
    published_at, created_at, updated_at
) VALUES (
    activity_2, teacher_id,
    'Community Stories at South Whidbey Community Center',
    'Students investigate the history and culture of South Whidbey Island by documenting the people, artwork, and stories found at the community center in Langley. Using audio recordings, photos, and written notes, students build a portrait of what makes their community unique.',
    'Social Studies', 4, 2, 45,
    3, 'inquiry'::activity_type_enum, 'published'::activity_status_enum, TRUE,
    'South Whidbey Community Center',
    48.0392, -122.4090, 100,
    'The South Whidbey Community Center in Langley, WA serves as a gathering hub for island residents. It hosts local events, art displays, and community programs that reflect the history and diversity of South Whidbey Island.',
    'Step inside and take a slow look around. Notice any photos, artwork, bulletin boards, or objects on display. A community center is like a living scrapbook - it holds the stories of the people who live here. What is one thing you notice that surprises or interests you? Write or record your first impression.',
    'Choose one investigation path and use your capture tools to document what you find:' || nl || nl ||
    '1. PEOPLE & STORIES: Ask a community member (with permission) to audio-record a 2-minute answer to: "What is one thing you love about this community?" Take a photo of the space.' || nl || nl ||
    '2. ARTWORK & ARTIFACTS: Find a piece of art or displayed object. Photograph it and record a voice or written note: Who made it? What does it say about this community''s values?' || nl || nl ||
    '3. EVENTS & PROGRAMS: Look at bulletin boards or schedules. What activities happen here? Who are they for? Photograph the board and write a summary.' || nl || nl ||
    'Always ask before photographing people - respect everyone''s privacy.',
    'Based on what you documented, write or record: What does this community center reveal about the values of South Whidbey Island? Give two specific examples from your investigation. How does a community center help bring people together?',
    '["Identify ways communities preserve and share their history and culture","Practice respectful observation and interviewing in a public space","Use multiple capture tools (audio, photo, notes) to document a social environment","Draw conclusions about community identity from primary source evidence"]'::jsonb,
    NOW(), NOW(), NOW()
);

RAISE NOTICE 'Activity 2: Community Stories at South Whidbey Community Center (Langley)';

-- Activity 3: South Whidbey Community Park (Langley) - Nature Observation
INSERT INTO activities (
    id, teacher_id,
    title, description,
    subject, grade_level, difficulty_level,
    estimated_duration_minutes,
    bloom_level, activity_type, status, is_active,
    location_name, location_latitude, location_longitude, location_radius_meters,
    location_info,
    orient_phase, inquiry_phase, reflect_phase,
    learning_objectives,
    published_at, created_at, updated_at
) VALUES (
    activity_3, teacher_id,
    'Nature Observation at South Whidbey Community Park',
    'Students practice scientific observation by documenting plants, insects, birds, and seasonal changes at the community park in Langley. Through field sketching, photography, and audio recording, students build a snapshot of local biodiversity.',
    'Science', 4, 2, 45,
    2, 'inquiry'::activity_type_enum, 'published'::activity_status_enum, TRUE,
    'South Whidbey Community Park',
    48.0410, -122.4015, 120,
    'South Whidbey Community Park in Langley, WA offers open green space, tree cover, and landscaped areas that attract birds, insects, and native plants. The park provides an accessible site for introductory nature observation year-round.',
    'Walk slowly through the park for two minutes without stopping. Notice: What plants are growing here? What animals or insects can you spot? What sounds do you hear? Crouch down close to the ground - what do you see that you might miss when standing? Pick one living thing to focus on for today''s investigation.',
    'Use your capture tools to create a field record of the living thing you chose:' || nl || nl ||
    '1. PHOTO: Take at least two photos - one of the whole organism and one close-up of an interesting detail (texture, color, shape).' || nl || nl ||
    '2. SKETCH OR NOTES: Draw or describe the organism. Include size, color, where it was found, and what it was doing.' || nl || nl ||
    '3. SOUNDS: If your subject makes sounds, try to capture an audio recording. If silent, record yourself describing what you observe.' || nl || nl ||
    'Bonus: Find two more examples of the same organism nearby - are they identical or different?',
    'Look at everything you captured. If you came back to this exact spot in a different season - winter or summer - how do you think it might look different? Write or record your prediction and explain why you expect those changes.',
    '["Practice systematic observation using sight, sound, and close examination","Document a living organism using at least two different capture tools","Describe an organism and its relationship to its immediate environment","Make a reasoned prediction about seasonal change based on field observation"]'::jsonb,
    NOW(), NOW(), NOW()
);

RAISE NOTICE 'Activity 3: Nature Observation at South Whidbey Community Park (Langley)';

END $$;
