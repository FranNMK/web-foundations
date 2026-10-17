// Select all required DOM elements
const noteText = document.getElementById("note-text");
const charCount = document.getElementById("char-count");
const wordCount = document.getElementById("word-count");
const clearBtn = document.getElementById("clear-btn");
const themeToggle = document.getElementById("theme-toggle");

// Updates character and word counters and manages warning/over classes
function updateCounts() {
  const text = noteText.value;
  const numChars = text.length;

  // Count words, ignoring empty strings or multiple spaces
  const trimmed = text.trim();
  const numWords = trimmed === "" ? 0 : trimmed.split(/\s+/).length;

  // Show counts
  charCount.textContent = `${numChars} / 200 characters`;
  wordCount.textContent = `${numWords} words`;

  // Warning when over 180 characters, over when over 200 characters
  if (numChars > 200) {
    charCount.classList.remove("warning");
    charCount.classList.add("over");
  } else if (numChars > 180) {
    charCount.classList.add("warning");
    charCount.classList.remove("over");
  } else {
    charCount.classList.remove("warning");
    charCount.classList.remove("over");
  }
}

// Clears the textarea, resets counters, and removes the saved draft
function clearAll() {
  noteText.value = "";
  localStorage.removeItem("draft");
  localStorage.removeItem("noteDraft");
  updateCounts();
}

// Toggles dark mode on <body>, updates button label, and remembers choice in localStorage
function toggleTheme() {
  const isDark = document.body.classList.toggle("dark");
  themeToggle.textContent = isDark ? "Light mode" : "Dark mode";
  localStorage.setItem("theme", isDark ? "dark" : "light");
}

// Input event listener: update counters and persist draft
noteText.addEventListener("input", () => {
  updateCounts();
  localStorage.setItem("draft", noteText.value);
  localStorage.setItem("noteDraft", noteText.value);
});

// Clear button event listener
clearBtn.addEventListener("click", clearAll);

// Escape key inside textarea clears everything
noteText.addEventListener("keydown", (event) => {
  if (event.key === "Escape" || event.key === "Esc" || event.keyCode === 27) {
    clearAll();
  }
});

// Theme button event listener
themeToggle.addEventListener("click", toggleTheme);

// Initialize on page load: restore theme & draft, then update counts
function init() {
  // Restore saved theme
  const savedTheme = localStorage.getItem("theme");
  if (savedTheme === "dark") {
    document.body.classList.add("dark");
    themeToggle.textContent = "Light mode";
  } else {
    document.body.classList.remove("dark");
    themeToggle.textContent = "Dark mode";
  }

  // Restore saved draft
  const savedDraft = localStorage.getItem("draft") ?? localStorage.getItem("noteDraft");
  if (savedDraft !== null) {
    noteText.value = savedDraft;
  }

  // Update counters according to restored text
  updateCounts();
}

init();
