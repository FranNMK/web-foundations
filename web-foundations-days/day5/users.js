// Select DOM elements
const loadUsersBtn = document.getElementById("load-users");
const filterInput = document.getElementById("filter-input");
const statusEl = document.getElementById("status");
const usersList = document.getElementById("users-list");

// In-memory array storing loaded users
let users = [];

/**
 * Draws any array of users into #users-list.
 * Uses createElement and textContent to display each user's name, email, city, and company name.
 * When nothing matches or the list is empty, displays "No users match your filter."
 * 
 * @param {Array<Object>} list - The array of users to render.
 */
function renderUsers(list) {
  // Clear any existing list items
  usersList.textContent = "";

  // If no users match or the list is empty, display the exact required empty message
  if (!list || list.length === 0) {
    const emptyItem = document.createElement("li");
    emptyItem.className = "empty-message";
    emptyItem.textContent = "No users match your filter.";
    usersList.appendChild(emptyItem);
    return;
  }

  // Draw each user item using createElement and textContent
  list.forEach((user) => {
    const li = document.createElement("li");
    li.className = "user-card";

    // User name
    const nameEl = document.createElement("h3");
    nameEl.className = "user-name";
    nameEl.textContent = user.name || "";

    // User email
    const emailEl = document.createElement("p");
    emailEl.className = "user-email";
    emailEl.textContent = user.email || "";

    // User city
    const cityEl = document.createElement("p");
    cityEl.className = "user-city";
    const city = user.address && user.address.city ? user.address.city : (user.city || "");
    cityEl.textContent = city;

    // Company name
    const companyEl = document.createElement("p");
    companyEl.className = "user-company";
    const companyName = user.company && user.company.name 
      ? user.company.name 
      : (typeof user.company === "string" ? user.company : "");
    companyEl.textContent = companyName;

    // Append all details to card
    li.appendChild(nameEl);
    li.appendChild(emailEl);
    li.appendChild(cityEl);
    li.appendChild(companyEl);

    // Append card to list
    usersList.appendChild(li);
  });
}

/**
 * Fetches users from https://jsonplaceholder.typicode.com/users.
 * Uses async / await and try / catch / finally.
 * Disables the load button while loading and updates #status with loading, success, or error messages.
 */
async function loadUsers() {
  // Disable button while loading
  loadUsersBtn.disabled = true;
  statusEl.className = "status-loading";
  statusEl.textContent = "Loading users...";

  try {
    const response = await fetch("https://jsonplaceholder.typicode.com/users");

    // Check if HTTP response status is successful (200-299)
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}: ${response.statusText || "Failed to fetch"}`);
    }

    // Parse response JSON and store loaded users in the array
    users = await response.json();

    // Reset filter input if present
    if (filterInput) {
      filterInput.value = "";
    }

    // Draw the users list
    renderUsers(users);

    // Update status on success
    statusEl.className = "status-success";
    statusEl.textContent = "Users loaded successfully.";
  } catch (error) {
    // Update status on error
    statusEl.className = "status-error";
    statusEl.textContent = `Error loading users: ${error.message}`;
  } finally {
    // Ensure button is re-enabled whether fetch succeeds or fails
    loadUsersBtn.disabled = false;
  }
}

// Event listener on button to load users
if (loadUsersBtn) {
  loadUsersBtn.addEventListener("click", loadUsers);
}

// Event listener on filter box to filter stored array without making a new network request
if (filterInput) {
  filterInput.addEventListener("input", () => {
    const query = filterInput.value.toLowerCase().trim();

    // If users have not been loaded yet and input is cleared, keep the list clean
    if (users.length === 0) {
      if (query !== "") {
        renderUsers([]);
      } else {
        usersList.textContent = "";
      }
      return;
    }

    // Filter stored array (case-insensitive check on user's name)
    const filteredUsers = users.filter((user) => {
      const name = (user.name || "").toLowerCase();
      return name.includes(query);
    });

    // Render results or "No users match your filter."
    renderUsers(filteredUsers);
  });
}

// Expose on global window object for automated testing environments
if (typeof window !== "undefined") {
  window.loadUsers = loadUsers;
  window.renderUsers = renderUsers;
  Object.defineProperty(window, "users", {
    get: () => users,
    set: (val) => { users = val; },
    configurable: true,
  });
}

// Export for Node/CommonJS test runners if applicable
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    loadUsers,
    renderUsers,
    get users() { return users; },
    set users(val) { users = val; },
  };
}
