let notes = [
  { id: 1, text: "Buy milk and bread", category: "personal" },
  { id: 2, text: "Finish the Day 3 assignment", category: "study" },
  { id: 3, text: "Email the project report to Grace", category: "work" },
  { id: 4, text: "Revise JavaScript arrays", category: "study" },
  { id: 5, text: "Call mum", category: "personal" },
];

// 1. searchNotes(word)
// Returns an array of notes whose text contains word, ignoring upper and lower case.
function searchNotes(word) {
  const query = word.toLowerCase();
  return notes.filter((note) => note.text.toLowerCase().includes(query));
}

// 2. longestNote()
// Returns the note object with the most characters, or null if there are no notes.
function longestNote() {
  if (notes.length === 0) {
    return null;
  }

  let longest = notes[0];
  for (let i = 1; i < notes.length; i++) {
    if (notes[i].text.length > longest.text.length) {
      longest = notes[i];
    }
  }
  return longest;
}

// 3. countByCategory()
// Returns an object counting notes per category by looping over notes.
function countByCategory() {
  const counts = {};
  for (const note of notes) {
    counts[note.category] = (counts[note.category] || 0) + 1;
  }
  return counts;
}

// 4. getSummary()
// Returns a summary sentence using countByCategory and a template literal.
function getSummary() {
  const total = notes.length;
  const noun = total === 1 ? "note" : "notes";
  const counts = countByCategory();

  const categories = Object.keys(counts);
  const preferredOrder = ["personal", "work", "study"];
  categories.sort((a, b) => {
    const indexA = preferredOrder.indexOf(a);
    const indexB = preferredOrder.indexOf(b);
    if (indexA !== -1 && indexB !== -1) return indexA - indexB;
    if (indexA !== -1) return -1;
    if (indexB !== -1) return 1;
    return a.localeCompare(b);
  });

  const categoryDetails = categories
    .map((category) => `${counts[category]} ${category}`)
    .join(", ");

  return categoryDetails
    ? `${total} ${noun}: ${categoryDetails}.`
    : `${total} ${noun}.`;
}

// 5. isDuplicate(text)
// Returns true if a note with the same text already exists (ignoring case and extra spaces).
function isDuplicate(text) {
  const normalizedInput = text.trim().toLowerCase();
  return notes.some((note) => note.text.trim().toLowerCase() === normalizedInput);
}

// 6. addNote(text, category)
// Adds a note only if it is 1–200 characters, is not a duplicate, and category is valid.
function addNote(text, category) {
  const validCategories = ["personal", "work", "study"];
  const trimmedText = typeof text === "string" ? text.trim() : "";

  if (trimmedText.length < 1 || trimmedText.length > 200) {
    console.log("Validation failed: Note text must be between 1 and 200 characters.");
    return false;
  }

  if (!validCategories.includes(category)) {
    console.log(`Validation failed: "${category}" is invalid. Must be personal, work or study.`);
    return false;
  }

  if (isDuplicate(trimmedText)) {
    console.log("Validation failed: A note with this text already exists.");
    return false;
  }

  const nextId = notes.length > 0 ? Math.max(...notes.map((n) => n.id)) + 1 : 1;
  notes.push({
    id: nextId,
    text: trimmedText,
    category: category,
  });
  return true;
}

// ==========================================
// TESTS
// ==========================================

console.log("--- Testing searchNotes ---");
console.log(searchNotes("the")); // Expected: [{ id: 2, text: "Finish the Day 3 assignment", category: "study" }, { id: 3, text: "Email the project report to Grace", category: "work" }]
console.log(searchNotes("JAVASCRIPT")); // Expected: [{ id: 4, text: "Revise JavaScript arrays", category: "study" }] (Case-insensitive)
console.log(searchNotes("xyz")); // Expected: [] (Edge case: no matching notes found)

console.log("--- Testing longestNote ---");
console.log(longestNote()); // Expected: { id: 3, text: "Email the project report to Grace", category: "work" }
let tempNotesForLongest = notes;
notes = [];
console.log(longestNote()); // Expected: null (Edge case: empty notes array)
notes = tempNotesForLongest;

console.log("--- Testing countByCategory ---");
console.log(countByCategory()); // Expected: { personal: 2, study: 2, work: 1 }
let tempNotesForCount = notes;
notes = [{ id: 10, text: "Only work note", category: "work" }];
console.log(countByCategory()); // Expected: { work: 1 } (Edge case: only one category present)
notes = tempNotesForCount;

console.log("--- Testing getSummary ---");
console.log(getSummary()); // Expected: "5 notes: 2 personal, 1 work, 2 study."
let tempNotesForSummary = notes;
notes = [{ id: 1, text: "Single personal task", category: "personal" }];
console.log(getSummary()); // Expected: "1 note: 1 personal." (Edge case: exactly one note using singular "note")
notes = tempNotesForSummary;

console.log("--- Testing isDuplicate ---");
console.log(isDuplicate("buy milk and bread")); // Expected: true (Normal case: case-insensitive match)
console.log(isDuplicate("   Call MUM   ")); // Expected: true (Edge case: extra spaces and mixed casing)
console.log(isDuplicate("Schedule team sync")); // Expected: false (Edge case: note does not exist)

console.log("--- Testing addNote ---");
console.log(addNote("Learn advanced CSS", "study")); // Expected: true (Normal case: valid note added)
console.log(addNote("Call mum", "personal")); // Expected: false (Edge case: duplicate note rejected)
console.log(addNote("Go swimming", "fitness")); // Expected: false (Edge case: invalid category rejected)
console.log(addNote("", "study")); // Expected: false (Edge case: empty text rejected)