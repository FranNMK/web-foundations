# School Database Design & Architecture

A design specification explaining the database schema, relational structure, indexing strategies, and architectural database model for the school management system.

---

## 1. Explanation of Tables

The school database consists of three core relational tables designed in Third Normal Form (3NF):

- **`students`**:
  - Represents individual student entities attending the institution.
  - Stores unique student identity and contact information (`id`, `name`, `email`).
  - Enforces `UNIQUE` and `NOT NULL` constraints on `email` to guarantee that every student can be distinctly identified and communicated with without duplicate registrations.

- **`courses`**:
  - Represents the academic courses offered in the school's curriculum.
  - Stores standardized course identifiers (`code`, such as `WEB201`) and descriptive titles (`title`, such as `Web Foundations`).
  - Enforces `UNIQUE` and `NOT NULL` constraints on `code` to maintain curriculum consistency.

- **`enrolments`**:
  - Serves as the junction (associative) table that captures the event of a student enrolling into a specific course.
  - Holds foreign keys referencing `students(id)` and `courses(id)` with cascading deletion rules.
  - Stores relationship-specific payload data: the student's academic performance (`grade`).
  - Enforces a composite constraint `UNIQUE(student_id, course_id)` to ensure no student can enrol in the same course more than once.

---

## 2. Relational Architecture & The Join Table

### Relationships Breakdown
- **Many-to-Many ($M:N$)**:
  - The relationship between **`students`** and **`courses`** is inherently many-to-many.
  - A single student can enrol in multiple distinct courses throughout their studies.
  - Conversely, a single course can have many students enrolled simultaneously.

- **One-to-Many ($1:M$)**:
  - **`students` to `enrolments`**: One student record links to zero, one, or many enrolment entries ($1:M$).
  - **`courses` to `enrolments`**: One course record links to zero, one, or many enrolment entries ($1:M$).

### Why a Join Table is Required
1. **Normalization & First Normal Form (1NF)**:
   - Relational database theory requires every column to contain atomic (indivisible) values.
   - Without a join table, one would be forced either to store comma-separated lists of course IDs inside a student row or duplicate student rows for each course. Storing lists breaks 1NF, prevents index utilization, and makes joining, updating, and filtering nearly impossible.
2. **Referential Integrity & Constraints**:
   - The join table (`enrolments`) enables the database engine to enforce strict foreign key constraints on both entities, ensuring an enrolment cannot refer to a non-existent student or course.
   - It also allows database-level enforcement of business rules, such as `UNIQUE(student_id, course_id)` to prevent double enrolment.
3. **Storage of Payload Data (Grade)**:
   - The grade belongs neither to the student alone (a student has different grades across different courses) nor to the course alone (a course has different grades for different students).
   - The grade is an attribute of the *relationship* between a student and a course, making the junction table the only mathematically and architecturally correct location for it.

---

## 3. Recommended Index & Justification

### Recommended Index
```sql
CREATE INDEX idx_enrolments_course_id ON enrolments(course_id);
```

### Justification
- **Composite Index Asymmetry**:
  - The `enrolments` table includes a `UNIQUE(student_id, course_id)` constraint, which SQLite implements by creating an automatic composite B-tree index.
  - In a composite index on `(student_id, course_id)`, the B-tree is sorted by `student_id` first, and then by `course_id`. Consequently, queries filtering by `student_id` can use this index effectively, but queries filtering or joining solely on `course_id` (such as listing all students on a course or performing `GROUP BY courses.id`) cannot use the composite index because `course_id` is not the leading column.
- **Query Performance & Scalability**:
  - Without an explicit index on `course_id`, reverse joins from `courses` to `enrolments` require a full table scan ($O(N)$ time complexity).
  - Adding `idx_enrolments_course_id` provides an $O(\log N)$ B-tree index seek, dramatically accelerating queries like *Query 2* (finding all students on a course) and *Query 3* (aggregating enrolments per course) as school enrolments grow from dozens into hundreds of thousands of rows.

*(Secondary recommendation: An index on `students(name)` via `CREATE INDEX idx_students_name ON students(name);` is also advantageous for fast student lookups by name).*

---

## 4. Architectural Selection: SQL vs. NoSQL

For this school management system, **SQL (a relational database management system such as PostgreSQL or SQLite) is undeniably the superior choice over NoSQL**. Academic institutional data is inherently relational, highly structured, and governed by strict business rules where referential integrity and ACID transactions are paramount. A relational engine guarantees through foreign keys that orphaned enrolment or grade records can never exist, while composite uniqueness constraints prevent accidental duplicate enrolments at the database layer. Furthermore, operations such as grade updates, prerequisite verification, GPA calculations, and class roster generation rely heavily on multi-table joins, relational set operations, and aggregation functions, all of which SQL handles natively and efficiently. In contrast, a NoSQL document or key-value store would either require denormalizing courses inside student documents (leading to data inconsistency and complex distributed updates whenever course details change) or necessitate manual, error-prone application-level joins without referential consistency guarantees. Therefore, SQL provides the reliability, data integrity, and expressive querying essential for educational systems.
