# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

-- Sample curriculum data
INSERT INTO curriculum_units (
    id, title, description, subject, grade_level, bloom_level, marzano_level,
    content_embedding, raw_content, is_active, created_at, updated_at
) VALUES
(
    '00000000-0000-0000-0000-000000000001',
    'Introduction to Photosynthesis',
    'Learn how plants convert sunlight into energy',
    'Biology',
    9,
    2,
    1,
    array_fill(0.1::float, ARRAY[384]),
    '{"sections": ["Introduction", "Process", "Importance"]}',
    true,
    NOW(),
    NOW()
),
(
    '00000000-0000-0000-0000-000000000002',
    'Calculus Basics: Derivatives',
    'Understanding the concept of derivatives',
    'Mathematics',
    12,
    3,
    2,
    array_fill(0.2::float, ARRAY[384]),
    '{"sections": ["Definition", "Rules", "Applications"]}',
    true,
    NOW(),
    NOW()
),
(
    '00000000-0000-0000-0000-000000000003',
    'American History: Civil War Era',
    'Exploring the causes and consequences of the American Civil War',
    'History',
    11,
    4,
    3,
    array_fill(0.15::float, ARRAY[384]),
    '{"sections": ["Causes", "Major Events", "Aftermath"]}',
    true,
    NOW(),
    NOW()
)
ON CONFLICT DO NOTHING;

-- Sample user data
INSERT INTO users (
    id, email, username, hashed_password, role, full_name, is_active, created_at, updated_at
) VALUES
(
    '10000000-0000-0000-0000-000000000001',
    'student@example.com',
    'student_001',
    'hashed_password_1',
    'student',
    'John Doe',
    true,
    NOW(),
    NOW()
),
(
    '10000000-0000-0000-0000-000000000002',
    'teacher@example.com',
    'teacher_001',
    'hashed_password_2',
    'teacher',
    'Jane Smith',
    true,
    NOW(),
    NOW()
)
ON CONFLICT DO NOTHING;

-- Sample student profile
INSERT INTO student_profiles (
    id, user_id, learning_style, bloom_level, marzano_level,
    prior_knowledge, device_sensor_precision, device_npu_power, device_camera_level,
    created_at, updated_at
) VALUES
(
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'visual',
    2,
    1,
    '["basic_science", "reading_comprehension"]'::jsonb,
    0.85,
    0.90,
    0.88,
    NOW(),
    NOW()
)
ON CONFLICT DO NOTHING;
