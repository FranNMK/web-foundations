-- Enable foreign key constraint enforcement in SQLite
PRAGMA foreign_keys = ON;

-- Drop existing tables if they exist to allow clean, repeatable execution
DROP TABLE IF EXISTS enrolments;
DROP TABLE IF EXISTS courses;
DROP TABLE IF EXISTS students;

-- ============================================================================
-- 1. TABLE DEFINITIONS
-- ============================================================================

-- Students table: stores student entity records
CREATE TABLE students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE
);

-- Courses table: stores course entity records
CREATE TABLE courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL
);

-- Enrolments table: junction/join table linking students to courses with grade
CREATE TABLE enrolments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    course_id INTEGER NOT NULL,
    grade TEXT,
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
    UNIQUE (student_id, course_id)
);

-- ============================================================================
-- 2. SAMPLE DATA INSERTION
-- ============================================================================

-- Insert sample students (at least 3; adding 4 to provide a student with no enrolments)
INSERT INTO students (name, email) VALUES
('Alice Johnson', 'alice.johnson@example.edu'),
('Bob Smith', 'bob.smith@example.edu'),
('Charlie Brown', 'charlie.brown@example.edu'),
('Diana Prince', 'diana.prince@example.edu');

-- Insert sample courses (at least 3)
INSERT INTO courses (code, title) VALUES
('CS101', 'Introduction to Computer Science'),
('WEB201', 'Web Foundations'),
('DB301', 'Database Systems'),
('NET401', 'Computer Networks');

-- Insert sample enrolments (at least 5; adding 6 across courses)
INSERT INTO enrolments (student_id, course_id, grade) VALUES
(1, 1, 'A'),   -- Alice on CS101
(1, 2, 'A-'),  -- Alice on WEB201
(1, 3, 'B+'),  -- Alice on DB301
(2, 1, 'B'),   -- Bob on CS101
(2, 2, 'B-'),  -- Bob on WEB201
(3, 3, 'A');   -- Charlie on DB301
-- Note: Diana Prince has no enrolments. Course NET401 has no enrolments.

-- ============================================================================
-- 3. FIVE REQUIRED QUERIES
-- ============================================================================

-- Query 1: All courses for one student (by name)
SELECT 
    students.name AS student_name,
    courses.code AS course_code,
    courses.title AS course_title,
    enrolments.grade
FROM students
JOIN enrolments ON students.id = enrolments.student_id
JOIN courses ON enrolments.course_id = courses.id
WHERE students.name = 'Alice Johnson';

-- Query 2: All students on one course
SELECT 
    courses.code AS course_code,
    courses.title AS course_title,
    students.name AS student_name,
    students.email AS student_email,
    enrolments.grade
FROM courses
JOIN enrolments ON courses.id = enrolments.course_id
JOIN students ON enrolments.student_id = students.id
WHERE courses.title = 'Web Foundations';

-- Query 3: The number of students per course (including courses with 0 students)
SELECT 
    courses.code AS course_code,
    courses.title AS course_title,
    COUNT(enrolments.student_id) AS student_count
FROM courses
LEFT JOIN enrolments ON courses.id = enrolments.course_id
GROUP BY courses.id, courses.code, courses.title
ORDER BY student_count DESC, courses.code ASC;

-- Query 4: Students who have no enrolments
SELECT 
    students.id AS student_id,
    students.name AS student_name,
    students.email AS student_email
FROM students
LEFT JOIN enrolments ON students.id = enrolments.student_id
WHERE enrolments.id IS NULL;

-- Query 5: An update of one enrolment's grade
UPDATE enrolments
SET grade = 'A+'
WHERE student_id = 1 AND course_id = 2;

-- Verification of Query 5 update
SELECT 
    students.name AS student_name,
    courses.title AS course_title,
    enrolments.grade AS updated_grade
FROM enrolments
JOIN students ON enrolments.student_id = students.id
JOIN courses ON enrolments.course_id = courses.id
WHERE students.id = 1 AND courses.id = 2;
